/**
 * core/memory/tests/fakes.ts — no Ollama, no network, no models loaded
 * (CLAUDE.md § 3). `FakeEmbedder` is a deterministic bag-of-words hashing
 * embedder: shared words push vectors closer together, unrelated words
 * don't — real enough semantic behavior to test the recall pipeline
 * meaningfully, without any actual model.
 */

import { EMBEDDING_DIMENSIONS } from "../db.ts";
import type { Embedder } from "../embeddings.ts";

function hashWord(word: string): number {
  let h = 0;
  for (let i = 0; i < word.length; i++) {
    h = (h * 31 + word.charCodeAt(i)) >>> 0;
  }
  return h;
}

function embedOne(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const word of words) {
    const index = hashWord(word) % EMBEDDING_DIMENSIONS;
    vector[index] = (vector[index] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

export class FakeEmbedder implements Embedder {
  calls: string[][] = [];

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push(texts);
    return texts.map(embedOne);
  }
}

/** Produces a vector with a 1 in a distinct, deterministic slot per index —
 * guaranteed near-orthogonal to every other index, for tests that need
 * precise control over similarity/distance rather than realistic text. */
export function orthogonalVector(index: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[index % EMBEDDING_DIMENSIONS] = 1;
  return vector;
}

export class ScriptedEmbedder implements Embedder {
  private readonly byText: Map<string, number[]>;

  constructor(byText: Map<string, number[]>) {
    this.byText = byText;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const vector = this.byText.get(t);
      if (!vector) throw new Error(`ScriptedEmbedder has no vector for ${JSON.stringify(t)}`);
      return vector;
    });
  }
}
