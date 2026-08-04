/**
 * core/router/registry.ts — per-lane ordered provider chains.
 *
 * SPEC.md § 3: "Providers are registered... adding one is a file plus a
 * config line — never a change to calling code." Registration order is
 * preference order: the first provider registered for a lane is tried
 * first, `router.ts` falls through in that order on failure.
 */

import type { Lane } from "../../shared/types.ts";
import type { ModelProvider } from "./provider.ts";

export class Registry {
  private readonly chains = new Map<Lane, ModelProvider[]>();

  /** Registers `provider` for `lanes` (defaults to `provider.lanes`), each
   * lane appended to its chain in call order. */
  register(provider: ModelProvider, lanes: readonly Lane[] = provider.lanes): void {
    for (const lane of lanes) {
      const chain = this.chains.get(lane) ?? [];
      chain.push(provider);
      this.chains.set(lane, chain);
    }
  }

  chainFor(lane: Lane): readonly ModelProvider[] {
    return this.chains.get(lane) ?? [];
  }
}
