/**
 * core/memory/rrf.ts — Reciprocal Rank Fusion, combining several
 * already-ranked-best-first id lists into one fused ranking. Used by
 * `recall.ts` to merge `semanticSearch()`'s vector-distance ranking with
 * `keywordSearch()`'s FTS5 ranking without needing to normalize or
 * compare their two entirely different score scales (cosine distance vs.
 * bm25) -- RRF only ever looks at rank *position*, never the raw score,
 * which is exactly what sidesteps that problem.
 *
 * `k = 60` is the constant the original RRF paper (Cormack et al.) used
 * and that stuck as the de facto default across hybrid-search
 * implementations since -- not tuned against this project's own data,
 * kept as the well-established starting point rather than an invented
 * number.
 */

const DEFAULT_K = 60;

export function reciprocalRankFusion(rankedLists: readonly (readonly string[])[], k: number = DEFAULT_K): string[] {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, index) => {
      const rank = index + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
