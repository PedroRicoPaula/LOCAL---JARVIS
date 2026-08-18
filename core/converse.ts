/**
 * core/converse.ts — the reply path docs/SKILLS.md § 3's routing diagram
 * names but never implements: "if nothing matches -> general conversation,
 * no skill." Without this, `no_skill_matched` was a dead end — the owner
 * would say something no skill's manifest covers and hear nothing back at
 * all. Grounded in real recalled memory (SPEC.md § 4's recall policy),
 * voiced through `core/persona.md`, same as any skill's spoken output.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Memory } from "./memory/memory.ts";
import type { Registry } from "./router/registry.ts";
import { routeChat } from "./router/router.ts";
import { SentenceAccumulator } from "./sentenceStream.ts";

const PERSONA_PATH = fileURLToPath(new URL("./persona.md", import.meta.url));

let cachedPersona: string | null = null;
function loadPersona(): string {
  cachedPersona ??= readFileSync(PERSONA_PATH, "utf8");
  return cachedPersona;
}

/**
 * Streams the reply, speaking each sentence through `onSentence` the
 * moment it completes, and resolves with the full text once the stream
 * ends (the caller still needs the whole thing for the transcript and
 * the `events` row).
 *
 * **This used to `await` the entire model response before speaking a
 * single word**, which CLAUDE.md § 7 forbids in as many words ("Never
 * `await` a full model response before starting playback... If you build
 * it synchronously 'for now', it will never be fixed"). Measured on real
 * providers before changing it (`bench/bench_latency.ts`, 2026-08-17,
 * 5 real utterances):
 *
 *   first chunk    p50  424ms   p95  615ms
 *   full response  p50 2343ms
 *
 * So the old shape spent ~1.9s per turn waiting for tokens the owner
 * could already have been hearing, and blew § 7's own 1500ms budget by
 * roughly 800ms on the single most common path in the system (every
 * utterance no skill claims lands here). `senses/voice` speaks each
 * `speak` message in order and blocks until its audio finishes, so
 * sentence-by-sentence delivery plays back seamlessly -- verified
 * against `senses/voice/main.py`'s own `run_forever` loop before
 * relying on it.
 *
 * `onSentence` is optional so a caller that only wants the final text
 * (tests, anything non-spoken) keeps the old shape exactly.
 */
export async function generalConversationReply(
  routerRegistry: Registry,
  memory: Memory,
  utterance: string,
  sessionId: string,
  loadedSkillIds: readonly string[],
  onSentence?: (sentence: string) => void,
): Promise<string> {
  const recalled = await memory.recall({ sessionId, queryText: utterance });
  const capabilities =
    loadedSkillIds.length > 0
      ? `Skills actually loaded right now: ${loadedSkillIds.join(", ")}. Nothing else.`
      : "No skills are loaded right now.";
  const system = `${loadPersona()}\n\n---\n\n${capabilities}\n\n---\n\nRelevant memory (may be empty):\n${recalled.text || "(nothing relevant)"}`;

  const accumulator = new SentenceAccumulator();
  let full = "";
  let spokeAnything = false;

  for await (const chunk of routeChat(routerRegistry, {
    lane: "converse",
    system,
    messages: [{ role: "user", content: utterance }],
    temperature: 0,
    timeoutMs: 3000,
  })) {
    full += chunk.delta;
    if (!onSentence) continue;
    for (const sentence of accumulator.push(chunk.delta)) {
      spokeAnything = true;
      onSentence(sentence);
    }
  }

  const reply = full.trim();
  if (!reply) {
    // Nothing usable came back -- fall back to the honest line this
    // function has always returned, and speak it, since by definition
    // nothing has been spoken yet in this case.
    const fallback = "I'm not sure how to help with that.";
    onSentence?.(fallback);
    return fallback;
  }

  if (onSentence) {
    const tail = accumulator.flush();
    if (tail) onSentence(tail);
    else if (!spokeAnything) onSentence(reply);
  }

  return reply;
}
