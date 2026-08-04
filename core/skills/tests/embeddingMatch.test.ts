import assert from "node:assert/strict";
import { test } from "node:test";
import { orthogonalVector, ScriptedEmbedder } from "../../memory/tests/fakes.ts";
import { cosineSimilarity, embedManifestExamples, matchUtterance } from "../embeddingMatch.ts";
import type { Skill } from "../types.ts";

function skillFixture(id: string, intents: { id: string; examples: string[] }[]): Skill {
  return {
    manifest: {
      id,
      version: "1.0.0",
      description: "fixture",
      intents: intents.map((i) => ({ id: i.id, description: "d", examples: i.examples, lanes: ["converse"] })),
      capabilities: [],
    },
    async handle() {
      return { speech: "" };
    },
  };
}

test("cosineSimilarity: identical vectors score 1, orthogonal score 0", () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);
});

test("embedManifestExamples flattens every example of every intent of every skill", async () => {
  const skills = [
    skillFixture("a", [{ id: "i1", examples: ["hello", "hi"] }]),
    skillFixture("b", [{ id: "i1", examples: ["bye"] }]),
  ];
  const embedder = new ScriptedEmbedder(
    new Map([
      ["hello", orthogonalVector(0)],
      ["hi", orthogonalVector(0)],
      ["bye", orthogonalVector(1)],
    ]),
  );

  const index = await embedManifestExamples(embedder, skills);

  assert.equal(index.length, 3);
  assert.deepEqual(
    index.map((e) => [e.skillId, e.intentId, e.example]).sort(),
    [
      ["a", "i1", "hello"],
      ["a", "i1", "hi"],
      ["b", "i1", "bye"],
    ].sort(),
  );
});

test("matchUtterance returns one ranked candidate per intent, using its best-matching example", async () => {
  const skills = [skillFixture("a", [{ id: "i1", examples: ["hello", "totally unrelated"] }])];
  const embedder = new ScriptedEmbedder(
    new Map([
      ["hello", orthogonalVector(0)],
      ["totally unrelated", orthogonalVector(5)],
      ["hi there", orthogonalVector(0)], // near-identical to "hello"
    ]),
  );
  const index = await embedManifestExamples(embedder, skills);

  const results = await matchUtterance(embedder, "hi there", index);

  assert.equal(results.length, 1); // one entry per intent, not per example
  assert.equal(results[0]?.matchedExample, "hello");
  assert.ok(results[0]!.score > 0.99);
});

test("matchUtterance ranks multiple intents by score, descending", async () => {
  const skills = [
    skillFixture("a", [{ id: "close", examples: ["query text"] }]),
    skillFixture("b", [{ id: "far", examples: ["something else"] }]),
  ];
  const embedder = new ScriptedEmbedder(
    new Map([
      ["query text", orthogonalVector(0)],
      ["something else", orthogonalVector(1)],
      ["utterance", orthogonalVector(0)],
    ]),
  );
  const index = await embedManifestExamples(embedder, skills);

  const results = await matchUtterance(embedder, "utterance", index);

  assert.equal(results[0]?.intentId, "close");
  assert.ok(results[0]!.score >= (results[1]?.score ?? -1));
});
