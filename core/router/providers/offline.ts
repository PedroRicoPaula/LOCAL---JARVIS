/**
 * core/router/providers/offline.ts — last-resort, always-available provider
 * for lanes with no real free-local option (`reason`: a 70B-class model has
 * no viable local substitute on this hardware, per DECISIONS.md ADR-002).
 *
 * SPEC.md § 3 requires every lane to have at least one free-local fallback
 * "even a degraded one" so the system stays usable offline. For `reason`
 * that can't mean an actual reasoning capability — it means never hanging
 * or hard-failing, and being honest about the gap instead, per CLAUDE.md
 * § 6: "If the system does not know, it says so."
 */

import type { ChatChunk, ChatRequest, Lane } from "../../../shared/types.ts";
import type { ModelProvider, ProviderHealth } from "../provider.ts";

export class OfflineFallbackProvider implements ModelProvider {
  readonly id = "offline-fallback";
  readonly costTier = "free-local" as const;
  readonly lanes: readonly Lane[];
  private readonly message: string;

  constructor(lanes: readonly Lane[], message: string) {
    this.lanes = lanes;
    this.message = message;
  }

  async *chat(_req: ChatRequest): AsyncIterable<ChatChunk> {
    yield { delta: this.message, done: true };
  }

  async health(): Promise<ProviderHealth> {
    return { ok: true };
  }
}
