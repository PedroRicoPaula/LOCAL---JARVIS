/**
 * core/router/providers/ollama.ts — `free-local` provider, `http://localhost:11434`.
 *
 * `chat()` uses Ollama's native `/api/chat` (NDJSON streaming), not an
 * OpenAI-compatible path — `bench/bench_local.py` already proved this
 * endpoint reliable in Phase 0 and there's no reason to introduce a second,
 * untested one. `embed()` uses `/api/embed` (batch-capable, confirmed
 * present on the installed 0.30.10). `vision()` uses `/api/chat` with an
 * `images` field.
 *
 * Which model serves which lane is this provider's own concern, not the
 * caller's — `ChatRequest` deliberately has no `model` field (SPEC.md § 3:
 * "adding one is a file plus a config line, never a change to calling
 * code"). See DECISIONS.md's Phase 3 ADR for why `converse`'s configured
 * model is a ~0.4GB model, not the two already pulled (`gemma3:4b`,
 * `qwen3:8b`) — both OOM-thrash on this machine's 8GB per ADR-001; this is
 * deliberately the *degraded* free-local fallback SPEC.md § 3 requires,
 * not an attempt to match `nim`'s accuracy.
 */

import { readFile } from "node:fs/promises";
import type { ChatChunk, ChatRequest, Lane, VisionRequest, VisionResult } from "../../../shared/types.ts";
import type { ModelProvider, ProviderHealth } from "../provider.ts";
import { ProviderUnavailableError } from "../provider.ts";

export interface OllamaConfig {
  baseUrl?: string;
  /** Which model answers each lane this provider is registered for. */
  models: Partial<Record<Lane, string>>;
  embedModel?: string;
  visionModel?: string;
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
}

interface OllamaChatLine {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  readonly costTier = "free-local" as const;
  readonly lanes: readonly Lane[];

  private readonly baseUrl: string;
  private readonly models: Partial<Record<Lane, string>>;
  private readonly embedModel: string | undefined;
  private readonly visionModel: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl ?? "http://localhost:11434";
    this.models = config.models;
    this.embedModel = config.embedModel;
    this.visionModel = config.visionModel;
    this.lanes = Object.keys(config.models) as Lane[];
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const model = this.models[req.lane];
    if (!model) {
      throw new ProviderUnavailableError(this.id, `no model configured for lane "${req.lane}"`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          stream: true,
          format: req.jsonSchema ? "json" : undefined,
          options: { temperature: req.temperature ?? 0 },
        }),
      });
    } catch (cause) {
      clearTimeout(timeout);
      throw new ProviderUnavailableError(this.id, "connection failed", cause);
    }

    if (!response.ok || !response.body) {
      clearTimeout(timeout);
      throw new ProviderUnavailableError(this.id, `HTTP ${response.status}`);
    }

    try {
      for await (const line of readNdjsonLines(response.body)) {
        const parsed = JSON.parse(line) as OllamaChatLine;
        if (parsed.error) {
          throw new ProviderUnavailableError(this.id, parsed.error);
        }
        yield { delta: parsed.message?.content ?? "", done: parsed.done ?? false };
        if (parsed.done) break;
      }
    } catch (cause) {
      if (cause instanceof ProviderUnavailableError) throw cause;
      throw new ProviderUnavailableError(this.id, "stream failed", cause);
    } finally {
      clearTimeout(timeout);
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.embedModel) {
      throw new ProviderUnavailableError(this.id, "no embed model configured");
    }
    // Retries once on a transient local-server failure -- found live,
    // 2026-08-07, testing this exact call at its real current size
    // (261 manifest examples, one batch, `embedManifestExamples`'s own
    // one-call-at-load-time design): Ollama's embed endpoint
    // intermittently 400s with "read tcp ...: connection reset by
    // peer" against its own internal tokenizer subprocess, confirmed by
    // repeating the identical real request three times (fail, succeed,
    // fail) -- a local resource-contention issue (ADR-001's 8GB-RAM
    // finding), not a malformed request. A failure here isn't "one
    // request degrades," it's "core's entire skill registry fails to
    // load" (`embedManifestExamples` -> `SkillRegistry.loadAll`, no
    // skill works until it succeeds), so it's worth one retry rather
    // than failing the whole process on a transient hiccup.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const response = await this.fetchFn(`${this.baseUrl}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: this.embedModel, input: texts }),
        });
        if (!response.ok) {
          lastError = new ProviderUnavailableError(this.id, `embed HTTP ${response.status}`);
          continue;
        }
        const payload = (await response.json()) as { embeddings: number[][] };
        return payload.embeddings;
      } catch (cause) {
        lastError = new ProviderUnavailableError(this.id, "embed request failed", cause);
      }
    }
    throw lastError;
  }

  async vision(req: VisionRequest): Promise<VisionResult> {
    if (!this.visionModel) {
      throw new ProviderUnavailableError(this.id, "no vision model configured");
    }
    const imageB64 = (await readFile(req.imagePath)).toString("base64");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.visionModel,
          stream: false,
          messages: [{ role: "user", content: req.prompt, images: [imageB64] }],
        }),
      });
      if (!response.ok) {
        throw new ProviderUnavailableError(this.id, `vision HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { message?: { content?: string } };
      return {
        qualitative: payload.message?.content ?? "",
        structured: null,
        // Ollama vision models don't emit calibrated confidence — an honest
        // midpoint default, per VisionResult's own contract in shared/types.ts.
        confidence: 0.5,
      };
    } catch (cause) {
      if (cause instanceof ProviderUnavailableError) throw cause;
      throw new ProviderUnavailableError(this.id, "vision request failed", cause);
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/version`, { signal: AbortSignal.timeout(2000) });
      return { ok: response.ok };
    } catch (cause) {
      return { ok: false, detail: String(cause) };
    }
  }
}

async function* readNdjsonLines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
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
        if (line) yield line;
      }
    }
    if (buffer.trim()) yield buffer.trim();
  } finally {
    reader.releaseLock();
  }
}
