/**
 * core/memory/recall.ts — SPEC.md § 4's recall policy, assembled and
 * capped: "A local 8B model with 30k tokens of memory performs worse than
 * the same model with 2k tokens of *relevant* memory."
 *
 * The cap (`maxChars`) is character-based, not a real tokenizer count —
 * deliberately: a tokenizer is another dependency for a number that only
 * has to be a reasonable, consistent budget, not a billing-accurate one.
 * Pieces are added in SPEC.md § 4's own priority order (recent turns
 * always first, then semantic matches, then facts) and a piece that
 * wouldn't fit is skipped whole, never truncated mid-text — simpler to
 * reason about and to test "never exceeds the cap" against exactly.
 *
 * Facts are recalled by confidence threshold (SPEC.md § 4 step 3), not
 * semantic search — `memory_vec` in this phase indexes events only; nothing
 * in the recall policy asks for semantic fact search, so it isn't built
 * ahead of a real need (CLAUDE.md § 0.6).
 */

import type { DatabaseSync } from "node:sqlite";
import type { Fact, MemoryEvent } from "../../shared/types.ts";
import type { Embedder } from "./embeddings.ts";
import { semanticSearch } from "./embeddings.ts";
import { getEvent, recentEventsForSession } from "./events.ts";
import { factsAboveConfidence } from "./facts.ts";

export interface RecallOptions {
  sessionId: string;
  queryText: string;
  recentTurnsLimit?: number;
  semanticTopK?: number;
  semanticMaxDistance?: number;
  factConfidenceFloor?: number;
  maxChars?: number;
}

export interface AssembledContext {
  recentTurns: MemoryEvent[];
  semanticMatches: MemoryEvent[];
  facts: Fact[];
  text: string;
  /** True if anything that would have qualified was left out for space. */
  truncated: boolean;
}

const DEFAULTS = {
  recentTurnsLimit: 10,
  semanticTopK: 5,
  semanticMaxDistance: 0.5,
  factConfidenceFloor: 0.6,
  maxChars: 8000,
};

function renderEvent(e: MemoryEvent): string {
  return `[${e.actor}] ${e.content}`;
}

function renderFact(f: Fact): string {
  return `${f.key}: ${f.value}`;
}

export async function assembleContext(
  db: DatabaseSync,
  embedder: Embedder,
  opts: RecallOptions,
): Promise<AssembledContext> {
  const recentTurnsLimit = opts.recentTurnsLimit ?? DEFAULTS.recentTurnsLimit;
  const semanticTopK = opts.semanticTopK ?? DEFAULTS.semanticTopK;
  const semanticMaxDistance = opts.semanticMaxDistance ?? DEFAULTS.semanticMaxDistance;
  const factConfidenceFloor = opts.factConfidenceFloor ?? DEFAULTS.factConfidenceFloor;
  const maxChars = opts.maxChars ?? DEFAULTS.maxChars;

  const recentTurns = recentEventsForSession(db, opts.sessionId, recentTurnsLimit);
  const recentIds = new Set(recentTurns.map((e) => e.id));

  const matches = await semanticSearch(db, embedder, opts.queryText, semanticTopK, semanticMaxDistance);
  const semanticMatches = matches
    .map((m) => getEvent(db, m.refId))
    .filter((e): e is MemoryEvent => e !== null && !recentIds.has(e.id));

  const facts = factsAboveConfidence(db, factConfidenceFloor);

  const included: string[] = [];
  let truncated = false;
  let used = 0;

  function tryAdd(piece: string): void {
    const size = piece.length + (included.length > 0 ? 1 : 0); // +1 for the joining newline
    if (used + size > maxChars) {
      truncated = true;
      return;
    }
    included.push(piece);
    used += size;
  }

  for (const e of recentTurns) tryAdd(renderEvent(e));
  for (const e of semanticMatches) tryAdd(renderEvent(e));
  for (const f of facts) tryAdd(renderFact(f));

  return {
    recentTurns,
    semanticMatches,
    facts,
    text: included.join("\n"),
    truncated,
  };
}
