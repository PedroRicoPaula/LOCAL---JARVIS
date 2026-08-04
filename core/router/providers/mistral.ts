/**
 * core/router/providers/mistral.ts — `free-remote` provider, Mistral AI
 * (OpenAI-compatible, `https://api.mistral.ai/v1`). Added 2026-08-04
 * (SOAK 1, ADR-031). ~380ms for `mistral-small-latest` in live testing,
 * JSON mode confirmed working -- second in the fallback chain after
 * `groq`.
 */

import type { Lane } from "../../../shared/types.ts";
import { OpenAiCompatibleProvider } from "./openaiCompatible.ts";

export interface MistralConfig {
  apiKey: string;
  models: Partial<Record<Lane, string>>;
  rpm?: number;
  fetchFn?: typeof fetch;
}

export class MistralProvider extends OpenAiCompatibleProvider {
  constructor(config: MistralConfig, now?: () => number) {
    super(
      {
        id: "mistral",
        baseUrl: "https://api.mistral.ai/v1",
        apiKey: config.apiKey,
        models: config.models,
        costTier: "free-remote",
        rpm: config.rpm ?? 20,
        maxConcurrent: 3,
        ...(config.fetchFn !== undefined ? { fetchFn: config.fetchFn } : {}),
      },
      now,
    );
  }
}
