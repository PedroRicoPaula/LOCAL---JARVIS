/**
 * core/router/providers/openrouter.ts — `free-remote` provider,
 * OpenRouter (OpenAI-compatible, `https://openrouter.ai/api/v1`). Added
 * 2026-08-04 (SOAK 1, ADR-031).
 *
 * Last of the four new keys in every fallback chain -- live testing
 * found real reliability/latency costs the other three didn't show:
 * `:free`-suffixed models route through a *shared* upstream pool (one
 * call hit a 429 from Google's own shared free capacity, relayed
 * through OpenRouter -- not a bug in this provider, just less capacity
 * than a dedicated key) and the currently-free catalogue skews toward
 * reasoning models that spend real token budget "thinking" before any
 * visible content, adding real latency even when they do answer. Kept
 * in the chain because a free 200 some of the time still beats nothing
 * before `ollama`, not because it's competitive with `groq`/`mistral`.
 */

import type { Lane } from "../../../shared/types.ts";
import { OpenAiCompatibleProvider } from "./openaiCompatible.ts";

export interface OpenRouterConfig {
  apiKey: string;
  models: Partial<Record<Lane, string>>;
  rpm?: number;
  fetchFn?: typeof fetch;
}

export class OpenRouterProvider extends OpenAiCompatibleProvider {
  constructor(config: OpenRouterConfig, now?: () => number) {
    super(
      {
        id: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: config.apiKey,
        models: config.models,
        costTier: "free-remote",
        rpm: config.rpm ?? 15,
        maxConcurrent: 2,
        extraHeaders: { "X-Title": "JARVIS" },
        ...(config.fetchFn !== undefined ? { fetchFn: config.fetchFn } : {}),
      },
      now,
    );
  }
}
