/**
 * core/router/laneHeuristic.ts — a no-model, no-network last resort for
 * lane classification, used only when `classifyLane` has already fallen
 * all the way down to the local `ollama` fallback (ADR-040).
 *
 * Why this exists: live-verified 2026-08-06, `qwen2.5:0.5b` answers
 * `classifyLane`'s request within its latency budget (no timeout, no
 * crash — ADR-028's original finding, re-confirmed) but frequently
 * *wrong* ("add butter to the shopping list" classified `see`), causing
 * silent misrouting rather than an honest failure. CLAUDE.md § 6: "a
 * confidently wrong father is worse than no father" — a model that
 * answers fast but wrong is worse here than a boring keyword match that
 * defaults to `converse` when unsure. Owner's own call (2026-08-06):
 * build this rather than either raising the timeout (doesn't fix
 * accuracy) or failing outright when only `ollama` is left (throws away
 * real capability during a total outage).
 *
 * Deliberately conservative: `reflex`/`see`/`act` have real behavioural
 * consequences (a skipped confirmation, an opened camera, a `SHELL_EXEC`
 * proposal) if guessed wrong, so only fairly unambiguous trigger phrases
 * match them. Everything else defaults to `converse` — general
 * conversation's own fallback already degrades gracefully (SPEC.md § 3),
 * so "unsure, ask a skill or say so" is a softer failure than confidently
 * routing to the wrong lane. Same spirit as `providers/rules.ts`'s own
 * "no rule fired: still a valid, honest response" -- not a model, not
 * meant to match NIM's accuracy, only to be less wrong than a
 * demonstrably-unreliable weak model on this specific structured task.
 *
 * Bilingual (ADR-039): English and PT-PT patterns side by side, same
 * phrases the lane classifier's own prompt was extended with.
 */

import type { Lane } from "../../shared/types.ts";

interface Rule {
  lane: Lane;
  pattern: RegExp;
}

// Order matters: checked top to bottom, first match wins. Narrower,
// higher-consequence lanes first so a broad `reason` pattern can't
// shadow a more specific `reflex`/`see`/`act` trigger later in the list.
const RULES: Rule[] = [
  // reflex -- short control/mechanics phrases, EN + PT-PT
  { lane: "reflex", pattern: /^\s*(stop|cancel|never ?mind|pause)\s*[.!]?\s*$/i },
  { lane: "reflex", pattern: /\bwhat time is it\b/i },
  { lane: "reflex", pattern: /\b(say that again|repeat that|louder|are you there|that'?s all)\b/i },
  { lane: "reflex", pattern: /\b(turn on the camera|open your eyes|close the camera)\b/i },
  { lane: "reflex", pattern: /^\s*para\s*[.!]?\s*$/i },
  { lane: "reflex", pattern: /\b(que horas são|diz outra vez|repete lá|mais alto|estás aí|é tudo)\b/i },
  { lane: "reflex", pattern: /\b(liga a câmara|desliga a câmara|abre os olhos)\b/i },

  // see -- needs a real physical thing looked at right now
  {
    lane: "see",
    pattern:
      /\b(look at this|what am i holding|check my wiring|read (this|me) (this )?label|is this .* the right one|what'?s on (the |my )?screen)\b/i,
  },
  {
    lane: "see",
    pattern: /\b(does this .* (go with|match)|combina com|olha para isto|verifica a (minha|a) cablagem|lê-me este rótulo|o que está no ecrã)\b/i,
  },

  // act -- changes files, runs commands, writes/edits code
  {
    lane: "act",
    pattern: /\b(run the tests|create a (new )?branch|commit (what|the)|rename (that|this) file|fix the .*bug|add a .* (toggle|page))\b/i,
  },
  {
    lane: "act",
    pattern: /\b(corre os testes|cria um (novo )?branch|faz commit|muda o nome (desse|deste) ficheiro|corrige o bug)\b/i,
  },

  // reason -- analysis, planning, comparisons, judgment calls
  {
    lane: "reason",
    pattern: /\b(why (does|is|do)|should i|explain|compare|how should i|what am i doing wrong|teach me|help me plan)\b/i,
  },
  {
    lane: "reason",
    pattern: /\b(porque é que|devo (usar|fazer)|explica-me|compara|como devo|o que estou a fazer mal|ensina-me|ajuda-me a planear)\b/i,
  },
];

/** Best-effort, not authoritative -- see this module's own docstring for
 * when it's actually consulted. Confidence is a fixed, honest 0.5
 * ("best-effort guess") when a rule fires, never claiming the certainty
 * a real classification call would; unmatched utterances default to
 * `converse` at the same confidence, matching `providers/rules.ts`'s own
 * "no rule fired: still a valid, honest response" precedent. */
export function classifyLaneHeuristically(utterance: string): { lane: Lane; confidence: number } {
  for (const rule of RULES) {
    if (rule.pattern.test(utterance)) return { lane: rule.lane, confidence: 0.5 };
  }
  return { lane: "converse", confidence: 0.5 };
}
