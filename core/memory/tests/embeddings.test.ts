import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";
import { indexText, semanticSearch } from "../embeddings.ts";
import { orthogonalVector, ScriptedEmbedder } from "./fakes.ts";

test("semanticSearch finds an exact match with distance 0", async () => {
  const db = openDb(":memory:");
  const embedder = new ScriptedEmbedder(
    new Map([
      ["about pull-up resistors", orthogonalVector(0)],
      ["query: resistors", orthogonalVector(0)],
    ]),
  );
  await indexText(db, embedder, "event-1", "about pull-up resistors");

  const results = await semanticSearch(db, embedder, "query: resistors", 5);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.refId, "event-1");
  assert.ok(results[0]!.distance < 1e-6);
});

test("semanticSearch excludes matches beyond maxDistance", async () => {
  const db = openDb(":memory:");
  const embedder = new ScriptedEmbedder(
    new Map([
      ["unrelated topic", orthogonalVector(1)],
      ["query", orthogonalVector(0)],
    ]),
  );
  await indexText(db, embedder, "event-1", "unrelated topic");

  // orthogonal vectors -> cosine distance 1, well past a tight floor
  const results = await semanticSearch(db, embedder, "query", 5, 0.1);

  assert.deepEqual(results, []);
});

test("semanticSearch respects topK", async () => {
  const db = openDb(":memory:");
  const vectors = new Map<string, number[]>([["query", orthogonalVector(0)]]);
  for (let i = 0; i < 10; i++) vectors.set(`text-${i}`, orthogonalVector(0));
  const embedder = new ScriptedEmbedder(vectors);

  for (let i = 0; i < 10; i++) await indexText(db, embedder, `event-${i}`, `text-${i}`);

  const results = await semanticSearch(db, embedder, "query", 3, 1);

  assert.equal(results.length, 3);
});
