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
  /** Semantic search is best-effort, not required — recent turns and
   * facts (both DB-only, no embedding call) still make it into the
   * assembled context even if this times out. Found live, post Phase 5:
   * on a loaded 8GB machine, `Ollama` embedding calls can occasionally
   * take tens of seconds (confirmed independent of model size — even the
   * 45MB `all-minilm` was affected, ruling out "just use a smaller
   * model" as the fix). Recall must degrade, not block the whole
   * response, the same "even a degraded one" reasoning SPEC.md § 3
   * already applies to provider fallback. Default 1500ms. */
  semanticTimeoutMs?: number;
}

export interface AssembledContext {
  recentTurns: MemoryEvent[];
  semanticMatches: MemoryEvent[];
  facts: Fact[];
  text: string;
  /** True if anything that would have qualified was left out for space. */
  truncated: boolean;
  /** True if the embedding call for semantic search didn't return within
   * `semanticTimeoutMs` — `semanticMatches` is `[]` in that case, not
   * "genuinely nothing matched." Surfaced rather than hidden, so a
   * confusingly memory-less reply can be told apart from a slow embed. */
  semanticTimedOut: boolean;
}

const DEFAULTS = {
  recentTurnsLimit: 10,
  semanticTopK: 5,
  semanticMaxDistance: 0.5,
  factConfidenceFloor: 0.6,
  maxChars: 8000,
  semanticTimeoutMs: 1500,
};

const TIMED_OUT = Symbol("semanticSearch timed out");

/** Races `promise` against a timer. Does NOT cancel `promise` — `Embedder`
 * has no `AbortSignal` in its contract (Phase 3/4/5 code all assumes a
 * plain `embed(texts): Promise<number[][]>`), so a slow embed call keeps
 * running in the background after this gives up waiting on it. That's an
 * accepted, honest limitation: it stops *blocking the response*, it
 * doesn't reduce load on Ollama. Real cancellation would mean widening
 * `Embedder`'s interface across everything that implements or calls it —
 * not justified yet by a single caller's timeout need. */
function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return Promise.race([promise, new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), ms))]);
}

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

  const semanticTimeoutMs = opts.semanticTimeoutMs ?? DEFAULTS.semanticTimeoutMs;

  const recentTurns = recentEventsForSession(db, opts.sessionId, recentTurnsLimit);
  const recentIds = new Set(recentTurns.map((e) => e.id));

  const matchesOrTimeout = await raceTimeout(
    semanticSearch(db, embedder, opts.queryText, semanticTopK, semanticMaxDistance),
    semanticTimeoutMs,
  );
  const semanticTimedOut = matchesOrTimeout === TIMED_OUT;
  const matches = semanticTimedOut ? [] : matchesOrTimeout;
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
    semanticTimedOut,
  };
}
