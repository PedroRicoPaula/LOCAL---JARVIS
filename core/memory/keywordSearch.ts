/**
 * core/memory/keywordSearch.ts — the lexical half of hybrid recall (SOAK
 * 1). Indexes into `events_fts` alongside `embeddings.ts`'s
 * `indexText()`/`memory_vec` write, fused with it by `rrf.ts` in
 * `recall.ts`. Synchronous, local, no network/model call -- unlike
 * `semanticSearch()`, there is no realistic timeout case to guard here.
 */

import type { DatabaseSync } from "node:sqlite";

export interface KeywordMatch {
  refId: string;
  /** FTS5's own rank (bm25, negated -- smaller is a better match). Kept
   * for callers that want it; `recall.ts` only cares about ordering. */
  rank: number;
}

export function indexKeywords(db: DatabaseSync, refId: string, text: string): void {
  db.prepare("INSERT INTO events_fts (ref_id, content) VALUES (?, ?)").run(refId, text);
}

/** Tokenizes on word characters and quotes each token individually,
 * OR-joined -- avoids handing raw owner text straight to FTS5's own
 * query syntax (`-`, `"`, `*`, `:` etc. are all meaningful there and a
 * syntax error would otherwise surface as a thrown exception on
 * whatever the owner happened to say, not a search result). OR, not
 * AND: this is a recall floor to feed into rank fusion, not a strict
 * filter -- any keyword overlap is a real signal worth ranking, and
 * `maxDistance`-style precision is `semanticSearch()`'s job, not this
 * one's. */
/** Unicode-aware, not `\w`. Found live 2026-08-17: `\w` is ASCII-only in
 * JavaScript (even with the `u` flag), so every accented Portuguese word
 * was shredded into meaningless single letters -- and this system is
 * bilingual by mandate (CLAUDE.md § 0.1). Real, reproduced against the
 * running index:
 *
 *   indexKeywords("Não consigo encontrar a resistência de precisão")
 *   keywordSearch("resistência") -> []   (the exact word IS in the text)
 *   keywordSearch("precisão")    -> []
 *   keywordSearch("não")         -> matched an unrelated event about a
 *                                   cat, via the fragments "n" OR "o"
 *
 * So the half of hybrid recall that exists precisely for "exact tokens
 * an embedding misses" was returning nothing for real Portuguese, and
 * false positives for short accented words. `\p{L}\p{N}` with `u`
 * matches letters and digits in any script. */
const WORD = /[\p{L}\p{N}]+/gu;

function toFtsQuery(text: string): string | null {
  const tokens = text.match(WORD);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}

export function keywordSearch(db: DatabaseSync, queryText: string, topK: number): KeywordMatch[] {
  const query = toFtsQuery(queryText);
  if (query === null) return [];
  const rows = db
    .prepare("SELECT ref_id, rank FROM events_fts WHERE events_fts MATCH ? ORDER BY rank LIMIT ?")
    .all(query, topK) as unknown as { ref_id: string; rank: number }[];
  return rows.map((r) => ({ refId: r.ref_id, rank: r.rank }));
}
