/**
 * core/skills/embeddingMatch.ts — stage 2a of skill routing
 * (docs/SKILLS.md § 3): embed the utterance, cosine-match against every
 * loaded skill's manifest examples. Cheap, local, deterministic — "handles
 * the 80% case with no model call and no latency" beyond the embedding
 * itself.
 *
 * Plain JS cosine similarity over an in-memory array, not `sqlite-vec`:
 * the candidate set is every manifest example across all loaded skills —
 * at most a few hundred short strings, not a corpus. Routing this through
 * SQLite would couple skill dispatch to `core/memory`'s database for no
 * real benefit.
 */

import type { Embedder } from "../memory/embeddings.ts";
import type { Skill } from "./types.ts";

export interface ExampleEmbedding {
  skillId: string;
  intentId: string;
  example: string;
  vector: number[];
}

export interface MatchCandidate {
  skillId: string;
  intentId: string;
  /** The best-matching example's score, and which example it was —
   * logged so "when the wrong skill fires, the log tells you whether to
   * add an example or move a threshold" (docs/SKILLS.md § 3). */
  score: number;
  matchedExample: string;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Embeds every example of every intent of every given skill. Call once
 * at load time, not per request — SkillRegistry caches the result. */
export async function embedManifestExamples(embedder: Embedder, skills: readonly Skill[]): Promise<ExampleEmbedding[]> {
  const flat: { skillId: string; intentId: string; example: string }[] = [];
  for (const skill of skills) {
    for (const intent of skill.manifest.intents) {
      for (const example of intent.examples) {
        flat.push({ skillId: skill.manifest.id, intentId: intent.id, example });
      }
    }
  }
  if (flat.length === 0) return [];

  const vectors = await embedder.embed(flat.map((f) => f.example));
  return flat.map((f, i) => ({ ...f, vector: vectors[i]! }));
}

/** Ranks intents by their single best-matching example, descending. One
 * entry per (skillId, intentId) pair, not per example. */
export async function matchUtterance(
  embedder: Embedder,
  utterance: string,
  index: readonly ExampleEmbedding[],
): Promise<MatchCandidate[]> {
  if (index.length === 0) return [];
  const [utteranceVector] = await embedder.embed([utterance]);
  if (!utteranceVector) return [];

  const bestByIntent = new Map<string, MatchCandidate>();
  for (const entry of index) {
    const score = cosineSimilarity(utteranceVector, entry.vector);
    const key = `${entry.skillId}::${entry.intentId}`;
    const current = bestByIntent.get(key);
    if (!current || score > current.score) {
      bestByIntent.set(key, {
        skillId: entry.skillId,
        intentId: entry.intentId,
        score,
        matchedExample: entry.example,
      });
    }
  }

  return [...bestByIntent.values()].sort((a, b) => b.score - a.score);
}
