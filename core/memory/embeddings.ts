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
import { EMBEDDING_DIMENSIONS } from "./db.ts";

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
/** A vector sqlite-vec will actually accept. Anything else means the
 * embedder misbehaved, and recall should degrade rather than fail the
 * turn -- see `semanticSearch`'s own comment for the three real errors
 * this prevents, each verified against the running extension. */
function isUsableVector(vector: number[] | undefined): vector is number[] {
  return (
    Array.isArray(vector) &&
    vector.length === EMBEDDING_DIMENSIONS &&
    vector.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

export async function semanticSearch(
  db: DatabaseSync,
  embedder: Embedder,
  queryText: string,
  topK: number,
  maxDistance = 0.5,
): Promise<SemanticMatch[]> {
  const [vector] = await embedder.embed([queryText]);
  // `!vector` alone only caught `undefined`. An empty array is truthy and
  // sailed straight through -- and sqlite-vec then *throws*, verified
  // against the real extension: `[]` -> "zero-length vectors are not
  // supported", a wrong-length vector -> "Dimension mismatch", a vector
  // containing NaN -> "invalid: JSON parsing error". None of those were
  // caught anywhere up the stack (`recall.ts`'s `raceTimeout` guards a
  // *slow* embedder, not a fast rejection), so a malformed embedding
  // failed the entire turn -- the owner heard "Something went wrong" --
  // even though recent turns, facts and keyword search would all have
  // worked. This module's own contract is that recall degrades and never
  // blocks, so a bad vector now returns no semantic matches, exactly like
  // the timeout path already does.
  if (!isUsableVector(vector)) return [];
  const rows = db
    .prepare("SELECT ref_id, distance FROM memory_vec WHERE embedding MATCH ? AND k = ? ORDER BY distance")
    .all(JSON.stringify(vector), topK) as unknown as { ref_id: string; distance: number }[];
  return rows.filter((r) => r.distance <= maxDistance).map((r) => ({ refId: r.ref_id, distance: r.distance }));
}
