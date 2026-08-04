/**
 * core/memory/embeddings.ts — indexes text into `memory_vec` and runs
 * semantic search over it (SPEC.md § 4: "Search is `sqlite-vec`. No
 * external vector database.").
 *
 * `Embedder` is a minimal structural interface, not `ModelProvider`
 * itself — `OllamaProvider` already satisfies it (`embed(texts):
 * Promise<number[][]>`), but this module shouldn't need to know about
 * providers, lanes, or the router at all. Tests inject a fake.
 */

import type { DatabaseSync } from "node:sqlite";

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

export interface SemanticMatch {
  refId: string;
  distance: number;
}

export async function indexText(db: DatabaseSync, embedder: Embedder, refId: string, text: string): Promise<void> {
  const [vector] = await embedder.embed([text]);
  if (!vector) throw new Error("embedder returned no vector for the given text");
  db.prepare("INSERT INTO memory_vec (embedding, ref_id) VALUES (?, ?)").run(JSON.stringify(vector), refId);
}

/** SPEC.md § 4's recall policy step 2: "Top-k semantic matches from
 * `memory_vec` above a similarity floor." `maxDistance` is a cosine
 * distance ceiling (lower = more similar) — see `db.ts`'s schema comment
 * for why cosine, not vec0's L2 default. */
export async function semanticSearch(
  db: DatabaseSync,
  embedder: Embedder,
  queryText: string,
  topK: number,
  maxDistance = 0.5,
): Promise<SemanticMatch[]> {
  const [vector] = await embedder.embed([queryText]);
  if (!vector) return [];
  const rows = db
    .prepare("SELECT ref_id, distance FROM memory_vec WHERE embedding MATCH ? AND k = ? ORDER BY distance")
    .all(JSON.stringify(vector), topK) as unknown as { ref_id: string; distance: number }[];
  return rows.filter((r) => r.distance <= maxDistance).map((r) => ({ refId: r.ref_id, distance: r.distance }));
}
