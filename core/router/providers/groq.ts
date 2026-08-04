/**
 * core/router/providers/groq.ts — `free-remote` provider, Groq
 * (OpenAI-compatible, `https://api.groq.com/openai/v1`). Added
 * 2026-08-04 (SOAK 1, ADR-031).
 *
 * Fastest of the three new free-tier keys tested live: ~200ms for
 * `llama-3.1-8b-instant`, ~220ms for the 70B `llama-3.3-70b-versatile`
 * -- both real dedicated-inference numbers, not a shared/community
 * backend the way some of `openrouter.ts`'s free models turned out to
 * be. First in the fallback chain after `nim` for both `converse` and
 * `reason`.
 */

import type { Lane } from "../../../shared/types.ts";
import { OpenAiCompatibleProvider } from "./openaiCompatible.ts";

export interface GroqConfig {
  apiKey: string;
  models: Partial<Record<Lane, string>>;
  rpm?: number;
  fetchFn?: typeof fetch;
}

export class GroqProvider extends OpenAiCompatibleProvider {
  constructor(config: GroqConfig, now?: () => number) {
    super(
      {
        id: "groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: config.apiKey,
        models: config.models,
        costTier: "free-remote",
        rpm: config.rpm ?? 25,
        maxConcurrent: 4,
        ...(config.fetchFn !== undefined ? { fetchFn: config.fetchFn } : {}),
      },
      now,
    );
  }
}
