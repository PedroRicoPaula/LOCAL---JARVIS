/**
 * core/router/providers/nim.ts — `free-remote` provider, NVIDIA Build (NIM),
 * OpenAI-compatible at `https://integrate.api.nvidia.com/v1`.
 *
 * Two independent throttles, not one: `TokenBucket` self-throttles to `rpm`
 * (default 30, SPEC.md § 3), staying under the confirmed ~40 rpm account
 * ceiling (DECISIONS.md ADR-002). `ConcurrencyLimiter` caps requests *in
 * flight at once* (default 8) — found necessary live in Phase 3, when a
 * burst of rapid calls during benchmark iteration stayed under 30/min but
 * still hit NIM's own concurrency ceiling ("Worker local total request
 * limit reached (19/16)"). A `429`, a concurrency refusal, or the bucket
 * refusing a token before the request is even sent all map to
 * `ProviderUnavailableError`, which `router.ts` treats as "try the next
 * provider," never a hard error: an owner asking something should never
 * see a rate-limit message, they should just quietly get an answer from
 * whatever's next in the chain.
 */

import { readSseEvents } from "./sse.ts";
import { readFile } from "node:fs/promises";
import type { ChatChunk, ChatRequest, Lane, VisionRequest, VisionResult } from "../../../shared/types.ts";
import type { ModelProvider, ProviderHealth } from "../provider.ts";
import { ProviderUnavailableError } from "../provider.ts";
import { ConcurrencyLimiter } from "../concurrencyLimiter.ts";
import { TokenBucket } from "../tokenBucket.ts";

export interface NimConfig {
  apiKey: string;
  baseUrl?: string;
  models: Partial<Record<Lane, string>>;
  /** Real, live-confirmed catalog id (2026-08-06, against the real
   * `/v1/models` endpoint with the owner's own key) -- not guessed. See
   * `core/router/wiring.ts`'s `NIM_VISION_MODEL`. */
  visionModel?: string;
  rpm?: number;
  /** Max requests in flight at once. Default 8 — comfortably under the
   * account's observed 16-concurrent ceiling, generous for a single-owner
   * assistant that in real use rarely has more than 1-2 requests overlapping
   * at all; the headroom is for burst/dev-time safety, not expected load. */
  maxConcurrent?: number;
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
  private readonly visionModel: string | undefined;
  private readonly bucket: TokenBucket;
  private readonly concurrency: ConcurrencyLimiter;
  private readonly fetchFn: typeof fetch;

  constructor(config: NimConfig, now?: () => number) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://integrate.api.nvidia.com/v1";
    this.models = config.models;
    this.visionModel = config.visionModel;
    this.lanes = Object.keys(config.models) as Lane[];
    this.bucket = new TokenBucket(config.rpm ?? 30, now);
    this.concurrency = new ConcurrencyLimiter(config.maxConcurrent ?? 8);
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
      this.concurrency.release();
      throw new ProviderUnavailableError(this.id, "connection failed", cause);
    }

    if (response.status === 429) {
      clearTimeout(timeout);
      this.concurrency.release();
      throw new ProviderUnavailableError(this.id, "HTTP 429 (rate limited by NIM)");
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
      this.concurrency.release();
    }
  }

  async vision(req: VisionRequest): Promise<VisionResult> {
    if (!this.visionModel) {
      throw new ProviderUnavailableError(this.id, "no vision model configured");
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
      throw new ProviderUnavailableError(this.id, "client-side rate limit reached (30 rpm)");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs);
    try {
      const imageB64 = (await readFile(req.imagePath)).toString("base64");
      const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.visionModel,
          stream: false,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: req.prompt },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
              ],
            },
          ],
        }),
      });
      if (response.status === 429) {
        throw new ProviderUnavailableError(this.id, "HTTP 429 (rate limited by NIM)");
      }
      if (!response.ok) {
        throw new ProviderUnavailableError(this.id, `vision HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return {
        qualitative: payload.choices?.[0]?.message?.content ?? "",
        // NIM's chat/completions doesn't return a calibrated confidence
        // for vision replies -- same honest midpoint default
        // `ollama.ts`'s own vision() uses, per VisionResult's own
        // contract in shared/types.ts. Structured extraction from a
        // vision reply isn't attempted here either, same as ollama.ts --
        // no caller built so far needs it (SPEC.md § 7: vision
        // identifies, it never quantifies).
        structured: null,
        confidence: 0.5,
      };
    } catch (cause) {
      if (cause instanceof ProviderUnavailableError) throw cause;
      throw new ProviderUnavailableError(this.id, "vision request failed", cause);
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

