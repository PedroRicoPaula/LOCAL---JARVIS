/**
 * core/router/wiring.ts — assembles the real `Registry` for v0.1
 * (SPEC.md § 3's "Providers at v0.1" table), applying DECISIONS.md's
 * ADR-001/ADR-002 model choices. The only place lane→provider→model
 * assignment is decided; `bench/bench_router_lane.ts` and, later, `core`'s
 * own entrypoint both call `buildRegistry()` rather than duplicating it.
 *
 * `converse`/`reason` chains (2026-08-04, ADR-031): `nim` first (ADR-001's
 * best real option, unchanged), then four more free-tier keys the owner
 * provided and this project tested live -- `groq` (fastest, ~200ms),
 * `mistral` (~380ms), `google`/Gemini (~1.6s, thinks before answering),
 * `openrouter` (slowest and least reliable: free models route through a
 * shared upstream pool and skew toward reasoning models) -- in that
 * order, ordered by measured latency/reliability, not reputation, same
 * "data not reputation" rule ADR-001 already used once. `ollama` is now
 * the true last resort on every lane it serves, after every free API has
 * been tried, per the owner's explicit instruction: local-model quality
 * (`qwen2.5:0.5b`, ADR-001's accepted "even degraded" fallback) is worse
 * than any of these four real remote models, so it should only ever be
 * reached when every one of them is unreachable.
 *
 * Each of the four new keys is optional at boot: `tryKeychainSecret`
 * returns `null` instead of throwing when a service isn't in Keychain
 * (unlike `jarvis-nim-key`, which stays required setup per the README).
 * A machine that only has `nim` configured still starts and runs
 * correctly with a shorter chain -- adding a new free provider is
 * additive, never a new hard requirement.
 *
 * Cerebras was a fifth key the owner provided and tested the same day --
 * live testing found the account authenticates but has no usable free
 * quota (HTTP 402 on every model in its catalogue). No `CerebrasProvider`
 * exists in this codebase; wiring a provider for a key that cannot
 * actually serve a request would be dead code pretending to be a real
 * fallback option. Revisit only if the owner's Cerebras account gets
 * free quota later.
 *
 * `reflex`: `rules` only — see that module's own docstring for why a
 * pattern-matcher is the right answer for a lane whose own definition is
 * "trivial, instant, no reasoning."
 */

import type { Lane } from "../../shared/types.ts";
import { getKeychainSecret } from "./keychain.ts";
import { GoogleProvider } from "./providers/google.ts";
import { GroqProvider } from "./providers/groq.ts";
import { MistralProvider } from "./providers/mistral.ts";
import { NimProvider } from "./providers/nim.ts";
import { OfflineFallbackProvider } from "./providers/offline.ts";
import { OllamaProvider } from "./providers/ollama.ts";
import { OpenRouterProvider } from "./providers/openrouter.ts";
import { RulesProvider } from "./providers/rules.ts";
import { Registry } from "./registry.ts";

export const CONVERSE_NIM_MODEL = "meta/llama-3.1-8b-instruct";
export const REASON_NIM_MODEL = "meta/llama-3.3-70b-instruct";
// Live-confirmed 2026-08-06 against the real `/v1/models` catalog with
// the owner's own key (not guessed -- this project has been burned more
// than once trusting a provider's model name ahead of checking it live),
// and smoke-tested end to end against a real image through
// /chat/completions. See Phase 8's plan and PROGRESS.md's log.
export const NIM_VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";
export const CONVERSE_OLLAMA_FALLBACK_MODEL = "qwen2.5:0.5b";
export const OLLAMA_EMBED_MODEL = "mxbai-embed-large";
export const OLLAMA_VISION_MODEL = "moondream";

export const CONVERSE_GROQ_MODEL = "llama-3.1-8b-instant";
export const REASON_GROQ_MODEL = "llama-3.3-70b-versatile";
export const CONVERSE_MISTRAL_MODEL = "mistral-small-latest";
export const REASON_MISTRAL_MODEL = "mistral-medium-latest";
// Rolling aliases, not dated snapshots -- both `gemini-1.5-flash` and
// `gemini-2.5-flash` already 404'd as "no longer available to new
// users" during testing the same day this was written. See google.ts.
export const CONVERSE_GOOGLE_MODEL = "gemini-flash-latest";
export const REASON_GOOGLE_MODEL = "gemini-pro-latest";
export const CONVERSE_OPENROUTER_MODEL = "openai/gpt-oss-20b:free";
export const REASON_OPENROUTER_MODEL = "openai/gpt-oss-20b:free";

/** Like `getKeychainSecret`, but a missing entry returns `null` instead
 * of throwing -- for keys that are a real upgrade when present, not a
 * requirement to boot at all. */
async function tryKeychainSecret(service: string): Promise<string | null> {
  try {
    return await getKeychainSecret(service);
  } catch {
    return null;
  }
}

export async function buildRegistry(): Promise<Registry> {
  const nimKey = await getKeychainSecret("jarvis-nim-key");
  const [groqKey, mistralKey, googleKey, openrouterKey] = await Promise.all([
    tryKeychainSecret("jarvis-groq-key"),
    tryKeychainSecret("jarvis-mistral-key"),
    tryKeychainSecret("jarvis-google-key"),
    tryKeychainSecret("jarvis-openrouter-key"),
  ]);

  const nim = new NimProvider({
    apiKey: nimKey,
    models: {
      converse: process.env["NIM_CONVERSE_MODEL"] ?? CONVERSE_NIM_MODEL,
      reason: process.env["NIM_MODEL"] ?? REASON_NIM_MODEL,
    },
    visionModel: process.env["NIM_VISION_MODEL"] ?? NIM_VISION_MODEL,
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

  // converse/reason: nim, then the four free APIs by measured
  // latency/reliability, then ollama last (converse only -- no local
  // model on this hardware is viable for reason, ADR-001), then the
  // honest offline fallback (reason only).
  registry.register(nim, ["converse"]);
  registry.register(nim, ["reason"]);

  // see: nim first, ollama (moondream, local) second -- a real,
  // hardware-driven deviation from SPEC.md § 6's originally stated
  // "local Qwen3-VL first" default. Qwen3-VL's smallest locally-runnable
  // variant is 4B (Ollama's own catalog), and ADR-001 already found this
  // 8GB M1 can't reliably run even a 4B *text* model without
  // OOM-thrashing -- a VLM needs more memory than an equivalent text
  // model (vision encoder + image tokens on top), so local-first is
  // very unlikely to win here. `ollama` stays registered as a real,
  // benchmarked second option, not assumed working -- see this phase's
  // plan for the full reasoning.
  registry.register(nim, ["see"]);

  // ONE instance per API key, registered for both lanes -- the same shape
  // `nim` above already uses, and for a real reason. Each provider
  // constructs its own `TokenBucket` and `ConcurrencyLimiter`
  // (`openaiCompatible.ts`), so building a second instance for the second
  // lane gave that one account key *two* independent budgets. Measured
  // 2026-08-22 against the real `GroqProvider`: two instances on one key
  // allowed 25 + 25 = 50 requests before throttling, against the 25 rpm
  // ADR-031 documents as the conservative default. Every free-tier limit
  // here is per *account*, not per lane, so the throttle has to be too.
  if (groqKey) {
    registry.register(
      new GroqProvider({ apiKey: groqKey, models: { converse: CONVERSE_GROQ_MODEL, reason: REASON_GROQ_MODEL } }),
      ["converse", "reason"],
    );
  }
  if (mistralKey) {
    registry.register(
      new MistralProvider({ apiKey: mistralKey, models: { converse: CONVERSE_MISTRAL_MODEL, reason: REASON_MISTRAL_MODEL } }),
      ["converse", "reason"],
    );
  }
  if (googleKey) {
    registry.register(
      new GoogleProvider({ apiKey: googleKey, models: { converse: CONVERSE_GOOGLE_MODEL, reason: REASON_GOOGLE_MODEL } }),
      ["converse", "reason"],
    );
  }
  if (openrouterKey) {
    registry.register(
      new OpenRouterProvider({
        apiKey: openrouterKey,
        models: { converse: CONVERSE_OPENROUTER_MODEL, reason: REASON_OPENROUTER_MODEL },
      }),
      ["converse", "reason"],
    );
  }

  registry.register(ollama, ["converse"]);
  registry.register(ollama, ["see"]);
  registry.register(reasonOffline, ["reason"]);
  return registry;
}
