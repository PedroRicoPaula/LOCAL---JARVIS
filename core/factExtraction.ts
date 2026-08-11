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
 *
 * Writes go through `Gate.propose()` (`MEMORY_WRITE`, `core/executors/
 * memory.ts`'s real executor), not a direct `memory.upsertFact()` call —
 * found live, SOAK 1: this used to write straight to `facts` with no
 * review at all, and real conversation produced garbage ("skills.create:
 * true" at confidence 0.8, "abilities.musical: whistle", a fact literally
 * keyed "weather" valued "tomorrow's weather" that `converse` later
 * regurgitated verbatim as its entire answer to a real weather question).
 * CLAUDE.md § 5 is unconditional -- "nothing performs a side-effecting
 * action without an approval recorded in the audit log first" -- and a
 * silent `facts` write was never actually exempt from that, it just
 * predated the gate (Phase 5b, before Phase 6). Still fire-and-forget
 * from the caller's side (`core/main.ts` never awaits this), so a pending
 * approval adds no latency to the spoken response; it just means facts
 * accumulate in the dashboard's approval queue for review instead of
 * silently mutating memory.
 *
 * Runs on a batched, idle-triggered window (`core/factExtractionScheduler.ts`),
 * not once per utterance -- found live, real usage: one-utterance-at-a-time
 * extraction produced garbage from isolated fragments with no surrounding
 * context (`docs/BACKLOG.md`'s "5 of 6 garbage in one live run" entry),
 * and drove real approval fatigue (13 of 17 `MEMORY_WRITE` proposals
 * rejected in one real session). A short recent window gives the model
 * more context to judge "is this actually durable" from, and produces
 * fewer, more deliberate extraction passes -- same shape N.E.K.O's own
 * idle-threshold memory-consolidation pass already validated (`docs/
 * BACKLOG.md`'s external-research section).
 */

import type { PendingUtterance } from "./factExtractionScheduler.ts";
import type { Gate } from "./gate/gate.ts";
import type { Registry } from "./router/registry.ts";
import { createSkillRouter } from "./skills/skillRouter.ts";

const EXTRACTION_SYSTEM = `You extract durable facts about the owner from
one or more recent spoken utterances, given one per line (oldest first),
for a personal assistant's long-term memory.

A fact is something true about the owner that would still matter in a
future, unrelated conversation: a preference, a restriction, a stable
project detail, a recurring circumstance. NOT a one-off request, a
question, small talk, a task/reminder/shopping item (those have their own
skills), or anything only about right now.

Keys are a short dotted namespace, e.g. "diet.avoids", "prefs.verbosity",
"project.<name>.stack".

Confidence is honest, not generous: 0.8-1.0 only for something stated
explicitly and unambiguously as a fact about the owner. 0.5-0.7 for
something reasonably implied. If you would say anything below 0.5, leave
it out entirely instead.

Respond with JSON only. No prose, no markdown fences.
Schema: {"facts": [{"key": "...", "value": "...", "confidence": <0..1>}]}
If nothing in the utterance is a durable fact, respond {"facts": []}.

Example: "I don't eat peanuts, I'm allergic" ->
{"facts": [{"key": "diet.avoids", "value": "peanuts", "confidence": 0.95}]}

Example: "what time is it" -> {"facts": []}

Example: "can you create a skill to track my CPU?" -> {"facts": []}
(a request to the assistant, not a fact about the owner -- do not record
"the owner wants a skill" or anything the assistant said back as a fact)

Example: "remind me to drink coffee at 9am" -> {"facts": []}
(a task, not a durable fact -- skills/tasks owns this, not memory)

Example: "can you tell me the weather for tomorrow" -> {"facts": []}
(a question the assistant should answer, not something true about the
owner -- never invent a fact keyed by the topic of a question)`;

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
 * it must never add latency to the spoken response (CLAUDE.md § 7). Each
 * extracted fact is proposed to the gate individually (not awaited to
 * completion here in a way that would block the caller -- `core/main.ts`
 * never awaits this function's own promise either), so the owner reviews
 * and approves what actually gets remembered instead of it landing
 * silently. Returns what was *extracted* (for tests/logging), not what
 * was ultimately approved -- that's the gate's own audit log's job.
 *
 * `utterances` is the batch `core/factExtractionScheduler.ts` accumulated
 * over one idle window -- every fact this pass finds is attributed to
 * the *last* utterance in the batch as `sourceEventId` (a deliberate
 * simplification: the model isn't asked to attribute each fact back to
 * a specific line, since `facts.source_event` is a soft debugging
 * reference, not something anything else queries precisely). */
export async function extractAndRememberFacts(
  routerRegistry: Registry,
  gate: Gate,
  utterances: readonly PendingUtterance[],
): Promise<ExtractedFact[]> {
  if (utterances.length === 0) return [];
  const combinedText = utterances.map((u) => u.text).join("\n");
  const sourceEventId = utterances[utterances.length - 1]!.eventId;
  const facts = await extractFacts(routerRegistry, combinedText);
  for (const fact of facts) {
    gate
      .propose(
        {
          capability: "MEMORY_WRITE",
          humanSummary: `Remember: ${fact.key} = ${fact.value}`,
          payload: { kind: "fact", key: fact.key, value: fact.value, confidence: fact.confidence, sourceEventId },
        },
        "fact-extraction",
      )
      .catch(() => undefined);
  }
  return facts;
}
