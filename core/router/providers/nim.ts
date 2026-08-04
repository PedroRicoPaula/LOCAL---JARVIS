/**
 * core/router/providers/nim.ts — `free-remote` provider, NVIDIA Build (NIM),
 * OpenAI-compatible at `https://integrate.api.nvidia.com/v1`.
 *
 * Self-throttles to `rpm` (default 30, SPEC.md § 3) via `TokenBucket`,
 * staying under the confirmed ~40 rpm account ceiling (DECISIONS.md
 * ADR-002). A `429` from NIM itself — or the bucket refusing a token before
 * the request is even sent — both map to `ProviderUnavailableError`, which
 * `router.ts` treats as "try the next provider," never a hard error: an
 * owner asking something should never see a rate-limit message, they
 * should just quietly get an answer from whatever's next in the chain.
 */

import type { ChatChunk, ChatRequest, Lane } from "../../../shared/types.ts";
import type { ModelProvider, ProviderHealth } from "../provider.ts";
import { ProviderUnavailableError } from "../provider.ts";
import { TokenBucket } from "../tokenBucket.ts";

export interface NimConfig {
  apiKey: string;
  baseUrl?: string;
  models: Partial<Record<Lane, string>>;
  rpm?: number;
  /** Injectable for tests — the SSE-embedded-error bug (see `NimStreamChunk`)
   * shipped once already because nothing could exercise this parsing logic
   * without a real NIM call. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
}

interface NimStreamChunk {
  choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
  /** NIM sometimes returns HTTP 200 with an error embedded in the SSE body
   * instead of a proper error status — confirmed live: "ResourceExhausted:
   * Worker local total request limit reached" arrived this way while load
   * from this phase's own testing had the account near its concurrency
   * ceiling. Must be checked explicitly; `response.ok` alone is not
   * sufficient to know the request actually succeeded. */
  error?: { message?: string };
}

export class NimProvider implements ModelProvider {
  readonly id = "nim";
  readonly costTier = "free-remote" as const;
  readonly lanes: readonly Lane[];

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly models: Partial<Record<Lane, string>>;
  private readonly bucket: TokenBucket;
  private readonly fetchFn: typeof fetch;

  constructor(config: NimConfig, now?: () => number) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://integrate.api.nvidia.com/v1";
    this.models = config.models;
    this.lanes = Object.keys(config.models) as Lane[];
    this.bucket = new TokenBucket(config.rpm ?? 30, now);
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const model = this.models[req.lane];
    if (!model) {
      throw new ProviderUnavailableError(this.id, `no model configured for lane "${req.lane}"`);
    }
    if (!this.bucket.tryTake()) {
      throw new ProviderUnavailableError(this.id, "client-side rate limit reached (30 rpm)");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          stream: true,
          max_tokens: req.maxTokens,
          temperature: req.temperature ?? 0,
          response_format: req.jsonSchema ? { type: "json_object" } : undefined,
        }),
      });
    } catch (cause) {
      clearTimeout(timeout);
      throw new ProviderUnavailableError(this.id, "connection failed", cause);
    }

    if (response.status === 429) {
      clearTimeout(timeout);
      throw new ProviderUnavailableError(this.id, "HTTP 429 (rate limited by NIM)");
    }
    if (!response.ok || !response.body) {
      clearTimeout(timeout);
      throw new ProviderUnavailableError(this.id, `HTTP ${response.status}`);
    }

    try {
      for await (const event of readSseEvents(response.body)) {
        if (event === "[DONE]") {
          yield { delta: "", done: true };
          break;
        }
        const parsed = JSON.parse(event) as NimStreamChunk;
        if (parsed.error) {
          throw new ProviderUnavailableError(this.id, `error in stream: ${parsed.error.message ?? "unknown"}`);
        }
        const choice = parsed.choices?.[0];
        const delta = choice?.delta?.content ?? "";
        const done = choice?.finish_reason != null;
        if (delta || done) yield { delta, done };
        if (done) break;
      }
    } catch (cause) {
      if (cause instanceof ProviderUnavailableError) throw cause;
      throw new ProviderUnavailableError(this.id, "stream failed", cause);
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(3000),
      });
      return { ok: response.ok };
    } catch (cause) {
      return { ok: false, detail: String(cause) };
    }
  }
}

/** OpenAI-style SSE: lines prefixed `data: `, blank line between events. */
async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith("data:")) {
          const data = line.slice("data:".length).trim();
          if (data) yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
