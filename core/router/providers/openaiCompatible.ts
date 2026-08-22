/**
 * core/router/providers/openaiCompatible.ts — shared implementation for
 * OpenAI-compatible chat-completions APIs (SSE streaming, Bearer auth,
 * `response_format: {type: "json_object"}` for structured output).
 * `groq.ts`, `mistral.ts`, and `openrouter.ts` are all this with
 * different config -- confirmed live (2026-08-04) that all three speak
 * the identical request/response shape `nim.ts` already implements.
 *
 * `nim.ts` predates this and stays its own file, not refactored onto
 * this base -- it is already working, tested, and load-bearing (the
 * primary `converse`/`reason` provider); risking a regression there for
 * a purely cosmetic DRY win isn't worth it. This base exists so the
 * three *new* providers don't each duplicate ~150 lines of SSE parsing
 * and rate-limiting instead.
 */

import { readSseEvents } from "./sse.ts";
import type { ChatChunk, ChatRequest, CostTier, Lane } from "../../../shared/types.ts";
import type { ModelProvider, ProviderHealth } from "../provider.ts";
import { ProviderUnavailableError } from "../provider.ts";
import { ConcurrencyLimiter } from "../concurrencyLimiter.ts";
import { TokenBucket } from "../tokenBucket.ts";

export interface OpenAiCompatibleConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  models: Partial<Record<Lane, string>>;
  costTier: CostTier;
  /** Client-side requests-per-minute self-throttle. Provisional, not a
   * confirmed ceiling the way ADR-002 confirmed NIM's ~40 rpm -- each
   * concrete provider's own docstring says so. A 429 always still maps
   * to `ProviderUnavailableError` regardless, so an over-generous bucket
   * costs one wasted attempt per burst, never a hard failure. */
  rpm?: number;
  maxConcurrent?: number;
  extraHeaders?: Record<string, string>;
  fetchFn?: typeof fetch;
}

interface OpenAiStreamChunk {
  choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
  /** Same defensive check as `nim.ts`'s `NimStreamChunk` -- an
   * HTTP-200 stream can still carry an embedded error; `response.ok`
   * alone was already proven insufficient once (NIM, Phase 3). */
  error?: { message?: string };
}

export class OpenAiCompatibleProvider implements ModelProvider {
  readonly id: string;
  readonly costTier: CostTier;
  readonly lanes: readonly Lane[];

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly models: Partial<Record<Lane, string>>;
  private readonly bucket: TokenBucket;
  private readonly concurrency: ConcurrencyLimiter;
  private readonly extraHeaders: Record<string, string>;
  private readonly fetchFn: typeof fetch;

  constructor(config: OpenAiCompatibleConfig, now?: () => number) {
    this.id = config.id;
    this.costTier = config.costTier;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.models = config.models;
    this.lanes = Object.keys(config.models) as Lane[];
    this.bucket = new TokenBucket(config.rpm ?? 20, now);
    this.concurrency = new ConcurrencyLimiter(config.maxConcurrent ?? 4);
    this.extraHeaders = config.extraHeaders ?? {};
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

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...this.extraHeaders,
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
        if (event === "[DONE]") {
          yield { delta: "", done: true };
          break;
        }
        const parsed = JSON.parse(event) as OpenAiStreamChunk;
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
      this.concurrency.release();
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

