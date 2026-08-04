/**
 * core/router/wiring.ts — assembles the real `Registry` for v0.1
 * (SPEC.md § 3's "Providers at v0.1" table), applying DECISIONS.md's
 * ADR-001/ADR-002 model choices. The only place lane→provider→model
 * assignment is decided; `bench/bench_router_lane.ts` and, later, `core`'s
 * own entrypoint both call `buildRegistry()` rather than duplicating it.
 *
 * `converse`: `nim` (`meta/llama-3.1-8b-instruct`, ADR-001's best real
 * option) first, `ollama` (`qwen2.5:0.5b`) as the free-local fallback.
 * Deliberately NOT `gemma3:4b`/`qwen3:8b` — both OOM-thrash on this
 * machine's 8GB (ADR-001) — `qwen2.5:0.5b` is the "worth a cheap try"
 * sub-2B model ADR-001 left open, tried during Phase 3: no OOM, no
 * timeouts, ~370-490ms per call. Its accuracy is well below `nim`'s — that
 * is expected and fine, it is SPEC.md § 3's "even a degraded" fallback,
 * not an attempt to match `nim`.
 *
 * `reflex`: `rules` only — see that module's own docstring for why a
 * pattern-matcher is the right answer for a lane whose own definition is
 * "trivial, instant, no reasoning."
 *
 * `reason`: `nim` (`meta/llama-3.3-70b-instruct`, ADR-002) only, then
 * `offline-fallback` — an honest "can't reach it" message, not a real
 * local reasoning capability that doesn't exist on this hardware.
 */

import type { Lane } from "../../shared/types.ts";
import { getKeychainSecret } from "./keychain.ts";
import { NimProvider } from "./providers/nim.ts";
import { OfflineFallbackProvider } from "./providers/offline.ts";
import { OllamaProvider } from "./providers/ollama.ts";
import { RulesProvider } from "./providers/rules.ts";
import { Registry } from "./registry.ts";

export const CONVERSE_NIM_MODEL = "meta/llama-3.1-8b-instruct";
export const REASON_NIM_MODEL = "meta/llama-3.3-70b-instruct";
export const CONVERSE_OLLAMA_FALLBACK_MODEL = "qwen2.5:0.5b";
export const OLLAMA_EMBED_MODEL = "mxbai-embed-large";
export const OLLAMA_VISION_MODEL = "moondream";

export async function buildRegistry(): Promise<Registry> {
  const nimKey = await getKeychainSecret("jarvis-nim-key");

  const nim = new NimProvider({
    apiKey: nimKey,
    models: {
      converse: process.env["NIM_CONVERSE_MODEL"] ?? CONVERSE_NIM_MODEL,
      reason: process.env["NIM_MODEL"] ?? REASON_NIM_MODEL,
    },
  });

  const ollama = new OllamaProvider({
    models: { converse: CONVERSE_OLLAMA_FALLBACK_MODEL },
    embedModel: OLLAMA_EMBED_MODEL,
    visionModel: OLLAMA_VISION_MODEL,
  });

  const rules = new RulesProvider();
  const reasonOffline = new OfflineFallbackProvider(
    ["reason"] as Lane[],
    "I can't reach my reasoning model right now. Try again once you're back online.",
  );

  const registry = new Registry();
  registry.register(rules, ["reflex"]);
  registry.register(nim, ["converse"]);
  registry.register(ollama, ["converse"]);
  registry.register(nim, ["reason"]);
  registry.register(reasonOffline, ["reason"]);
  return registry;
}
