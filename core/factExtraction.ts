/**
 * core/factExtraction.ts — the piece Pedro's own question surfaced as
 * missing: Phase 4 built `facts` storage and recall, but nothing ever
 * decided *when* something said in conversation is worth remembering as a
 * durable fact. This is that decision, made by a model, on the owner's
 * side of every exchange.
 *
 * Deliberately not a graph engine (Neo4j/FalkorDB-backed, Graphiti/Zep
 * style) — researched and discussed with the owner. Real value for
 * multi-hop reasoning over large, densely interconnected datasets; real
 * infrastructure cost (a second database service, an extraction pipeline
 * of its own) neither justified by nor a good fit for one person's
 * personal facts. `facts` (Phase 4, flat, `key -> value`, confidence
 * scored) is the right shape for what this system actually needs. If real
 * use ever shows facts needing to reference each other, a lightweight
 * relation table on top of SQLite is the boring next step — not a new
 * database.
 */

import type { Memory } from "./memory/memory.ts";
import type { Registry } from "./router/registry.ts";
import { createSkillRouter } from "./skills/skillRouter.ts";

const EXTRACTION_SYSTEM = `You extract durable facts about the owner from a
single spoken utterance, for a personal assistant's long-term memory.

A fact is something true about the owner that would still matter in a
future, unrelated conversation: a preference, a restriction, a stable
project detail, a recurring circumstance. NOT a one-off request, a
question, small talk, or anything only about right now.

Keys are a short dotted namespace, e.g. "diet.avoids", "prefs.verbosity",
"project.<name>.stack".

Confidence is honest, not generous: 0.8-1.0 only for something stated
explicitly and unambiguously. 0.5-0.7 for something reasonably implied.
If you would say anything below 0.5, leave it out entirely instead.

Respond with JSON only. No prose, no markdown fences.
Schema: {"facts": [{"key": "...", "value": "...", "confidence": <0..1>}]}
If nothing in the utterance is a durable fact, respond {"facts": []}.

Example: "I don't eat peanuts, I'm allergic" ->
{"facts": [{"key": "diet.avoids", "value": "peanuts", "confidence": 0.95}]}

Example: "what time is it" -> {"facts": []}`;

export interface ExtractedFact {
  key: string;
  value: string;
  confidence: number;
}

function isExtractedFact(value: unknown): value is ExtractedFact {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f["key"] === "string" &&
    f["key"].trim() !== "" &&
    typeof f["value"] === "string" &&
    f["value"].trim() !== "" &&
    typeof f["confidence"] === "number"
  );
}

/** Never throws on a malformed model response -- a bad extraction means
 * nothing learned this turn, not a crash. CLAUDE.md § 0.5's "never guessed
 * at" spirit: a confidence below 0.5 is dropped outright rather than
 * stored as a shaky fact. */
export async function extractFacts(routerRegistry: Registry, utterance: string): Promise<ExtractedFact[]> {
  const router = createSkillRouter(routerRegistry);
  let raw: string;
  try {
    raw = await router.complete("converse", EXTRACTION_SYSTEM, utterance, { maxTokens: 200 });
  } catch {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as { facts?: unknown };
    if (!Array.isArray(parsed.facts)) return [];
    return parsed.facts.filter(isExtractedFact).filter((f) => f.confidence >= 0.5 && f.confidence <= 1);
  } catch {
    return [];
  }
}

/** Fire-and-forget from `core/main.ts`: extraction is not user-facing, so
 * it must never add latency to the spoken response (CLAUDE.md § 7).
 * Returns what it stored, for callers (tests, logging) that want to know. */
export async function extractAndRememberFacts(
  routerRegistry: Registry,
  memory: Memory,
  utterance: string,
  sourceEventId: string,
): Promise<ExtractedFact[]> {
  const facts = await extractFacts(routerRegistry, utterance);
  for (const fact of facts) {
    memory.upsertFact({ key: fact.key, value: fact.value, confidence: fact.confidence, sourceEventId });
  }
  return facts;
}
