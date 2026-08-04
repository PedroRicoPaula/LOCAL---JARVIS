/**
 * core/router/provider.ts — the `ModelProvider` interface (SPEC.md § 3).
 *
 * Lives here, not in `shared/types.ts`: providers are a core-internal
 * abstraction, never called from `senses/`, `skills/`, or `ui/` directly —
 * everything crosses through the router. `shared/types.ts` is reserved for
 * shapes that cross a real process boundary (core <-> ui, core <-> senses,
 * core <-> skills); this isn't one.
 */

import type { ChatChunk, ChatRequest, CostTier, Lane, VisionRequest, VisionResult } from "../../shared/types.ts";

export interface ProviderHealth {
  ok: boolean;
  detail?: string;
}

export interface ModelProvider {
  readonly id: string;
  readonly lanes: readonly Lane[];
  readonly costTier: CostTier;

  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  vision?(req: VisionRequest): Promise<VisionResult>;
  embed?(texts: string[]): Promise<number[][]>;
  health(): Promise<ProviderHealth>;
}

/** Thrown by a provider to signal "try the next one in the chain" rather
 * than "the request itself is bad." Timeouts, connection failures, and
 * rate limits (429) all map to this — see `router.ts`. */
export class ProviderUnavailableError extends Error {
  readonly providerId: string;

  constructor(providerId: string, message: string, cause?: unknown) {
    super(`${providerId}: ${message}`, cause !== undefined ? { cause } : undefined);
    this.name = "ProviderUnavailableError";
    this.providerId = providerId;
  }
}
