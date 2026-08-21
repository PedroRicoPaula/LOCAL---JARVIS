/**
 * core/router/providers/google.ts — `free-remote` provider, Google AI
 * Studio / Gemini (`https://generativelanguage.googleapis.com/v1beta`).
 * Added 2026-08-04 (SOAK 1, ADR-031).
 *
 * Not OpenAI-compatible, unlike `groq`/`mistral`/`openrouter` -- its own
 * request shape (`contents`/`parts`, a real `systemInstruction` field
 * rather than a `system`-role message, `?key=` query-param auth instead
 * of a Bearer header) and its own streaming transport.
 * `:streamGenerateContent?alt=sse` emits `data: {json}\n\n` events, each
 * carrying the *next chunk* of text -- confirmed live against a
 * multi-sentence generation, not assumed (the API also has a non-SSE
 * cumulative mode this project doesn't use).
 *
 * Model names churn fast here -- `gemini-1.5-flash` and `gemini-2.5-
 * flash` both returned 404 "no longer available to new users" during
 * testing the same day this provider was written. `models` should
 * point at a rolling alias (`gemini-flash-latest`, `gemini-pro-latest`)
 * rather than a dated snapshot, so this doesn't silently break the next
 * time Google retires a version -- `core/router/wiring.ts` follows this.
 *
 * ~1.6s observed for `gemini-flash-latest` in live testing (the model
 * "thinks" before answering even on simple prompts, no request-level
 * way found to fully disable it on this model) -- slower than
 * `groq`/`mistral`, which is why this comes after both in the fallback
 * chain despite being a first-party dedicated API, not a shared pool
 * the way some of `openrouter.ts`'s models are.
 */

import type { ChatChunk, ChatRequest, Lane } from "../../../shared/types.ts";
import type { ModelProvider, ProviderHealth } from "../provider.ts";
import { ProviderUnavailableError } from "../provider.ts";
import { ConcurrencyLimiter } from "../concurrencyLimiter.ts";
import { TokenBucket } from "../tokenBucket.ts";

export interface GoogleConfig {
  apiKey: string;
  baseUrl?: string;
  models: Partial<Record<Lane, string>>;
  rpm?: number;
  maxConcurrent?: number;
  fetchFn?: typeof fetch;
}

interface GeminiStreamChunk {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string | null }[];
  error?: { message?: string };
}

export class GoogleProvider implements ModelProvider {
  readonly id = "google";
  readonly costTier = "free-remote" as const;
  readonly lanes: readonly Lane[];

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly models: Partial<Record<Lane, string>>;
  private readonly bucket: TokenBucket;
  private readonly concurrency: ConcurrencyLimiter;
  private readonly fetchFn: typeof fetch;

  constructor(config: GoogleConfig, now?: () => number) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    this.models = config.models;
    this.lanes = Object.keys(config.models) as Lane[];
    this.bucket = new TokenBucket(config.rpm ?? 15, now);
    this.concurrency = new ConcurrencyLimiter(config.maxConcurrent ?? 3);
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const model = this.models[req.lane];
    if (!model) {
      throw new ProviderUnavailableError(this.id, `no model configured for lane "${req.lane}"`);
    }
    // Concurrency first, then the rate-limit token -- and the slot is
    // released if the token isn't available. The other order (found
    // 2026-08-17) burned a real rpm token on requests that never left
    // the process: with nim's defaults (30 rpm, 8 concurrent), a burst
    // of 10 near-simultaneous calls -- exactly the "several skills
    // firing at once" case concurrencyLimiter.ts exists for -- spent two
    // tokens on requests rejected purely on the concurrency check.
    // Repeated bursts silently eroded the per-minute budget and caused
    // earlier fallbacks to a slower provider than the real account limit
    // required.
    if (!this.concurrency.tryAcquire()) {
      throw new ProviderUnavailableError(this.id, "too many requests in flight");
    }
    if (!this.bucket.tryTake()) {
      this.concurrency.release();
      throw new ProviderUnavailableError(this.id, "client-side rate limit reached");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs);

    // The key rides in the `x-goog-api-key` header, not the URL query
    // string. Gemini supports both; every other provider in this
    // directory uses a header, and a secret in a URL is inherently more
    // exposure-prone -- any future request logging, HTTP tracing, or a
    // proxy access log captures a URL where it would not capture a
    // header. Changed 2026-08-17 after a review flagged the
    // inconsistency; no live leak was found in Node's own fetch errors,
    // this closes the class rather than a known instance.
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: req.temperature ?? 0,
            ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
            ...(req.jsonSchema ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });
    } catch (cause) {
      clearTimeout(timeout);
      this.concurrency.release();
      throw new ProviderUnavailableError(this.id, "connection failed", cause);
    }

    if (response.status === 429) {
      clearTimeout(timeout);
      this.concurrency.release();
      throw new ProviderUnavailableError(this.id, "HTTP 429 (rate limited)");
    }
    if (!response.ok || !response.body) {
      clearTimeout(timeout);
      this.concurrency.release();
      throw new ProviderUnavailableError(this.id, `HTTP ${response.status}`);
    }

    try {
      for await (const event of readSseEvents(response.body)) {
        const parsed = JSON.parse(event) as GeminiStreamChunk;
        if (parsed.error) {
          throw new ProviderUnavailableError(this.id, `error in stream: ${parsed.error.message ?? "unknown"}`);
        }
        const candidate = parsed.candidates?.[0];
        const delta = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        const done = candidate?.finishReason != null;
        if (delta || done) yield { delta, done };
        if (done) break;
      }
    } catch (cause) {
      if (cause instanceof ProviderUnavailableError) throw cause;
      throw new ProviderUnavailableError(this.id, "stream failed", cause);
    } finally {
      clearTimeout(timeout);
      this.concurrency.release();
    }
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/models`, {
        headers: { "x-goog-api-key": this.apiKey },
        signal: AbortSignal.timeout(3000),
      });
      return { ok: response.ok };
    } catch (cause) {
      return { ok: false, detail: String(cause) };
    }
  }
}

/** Same shape as `openaiCompatible.ts`'s copy -- Gemini's SSE transport
 * is the identical `data: {json}\n\n` framing, only the JSON payload
 * shape differs. */
async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush a final event the server left without its trailing
        // blank line. Real SSE servers terminate with "\n\n" after
        // [DONE], so this is belt-and-braces -- but `ollama.ts`'s NDJSON
        // reader has always flushed its trailing partial line, and a
        // silent truncation of the last token is not a difference worth
        // having between two parsers in the same directory (2026-08-17).
        const rest = buffer.trim();
        if (rest) yield rest;
        break;
      }
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
