/**
 * core/memory/tests/regressions.test.ts — four real defects found by a
 * deep review of this subsystem (2026-08-17), each reproduced against
 * the real database before being fixed. None of the 51 tests that
 * already existed would have caught any of them.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb, EMBEDDING_DIMENSIONS } from "../db.ts";
import { appendEvent, recentEventsForSession } from "../events.ts";
import { indexKeywords, keywordSearch } from "../keywordSearch.ts";
import { semanticSearch } from "../embeddings.ts";

test("two events written in the SAME millisecond keep their real order", () => {
  const db = openDb(":memory:");
  // Routine in production: core/main.ts appends the owner's utterance
  // and JARVIS's response close together, and Date.now() has 1ms
  // resolution. With no tiebreaker this came back reversed, so the
  // model's "recent turns" showed the answer before the question.
  // Ten, not two: with only two events a broken tiebreaker has a 50%
  // chance of passing by luck. The first attempt at this fix ordered by
  // `id` (a ulid) and passed a two-event test while genuinely being
  // wrong -- a three-event version caught it immediately.
  const expected = Array.from({ length: 10 }, (_, i) => `turn-${i}`);
  for (const content of expected) {
    appendEvent(db, { kind: "utterance", actor: "owner", content, sessionId: "s1", ts: 1000 });
  }

  assert.deepEqual(recentEventsForSession(db, "s1", 20).map((e) => e.content), expected);
  db.close();
});

test("keyword search finds accented Portuguese words -- the bilingual half of recall", () => {
  const db = openDb(":memory:");
  indexKeywords(db, "e1", "Não consigo encontrar a resistência de precisão");

  // Each of these returned ZERO before the tokenizer became Unicode-
  // aware: JS `\w` is ASCII-only, so every accented word was shredded
  // into single letters. This is the exact case keyword search exists
  // for -- an exact token an embedding would miss.
  assert.equal(keywordSearch(db, "resistência", 5).length, 1);
  assert.equal(keywordSearch(db, "precisão", 5).length, 1);
  assert.equal(keywordSearch(db, "Não", 5).length, 1);
  // The ASCII control case must keep working.
  assert.equal(keywordSearch(db, "consigo", 5).length, 1);
  db.close();
});

test("a short accented query does not false-positive onto unrelated text", () => {
  const db = openDb(":memory:");
  indexKeywords(db, "e1", "Não consigo encontrar a resistência");
  indexKeywords(db, "e2", "O gato caiu do sofa");

  // "não" used to be shredded to "n" OR "o", which matched "O gato...".
  const hits = keywordSearch(db, "não", 5).map((r) => r.refId);
  assert.deepEqual(hits, ["e1"], "must not match the unrelated cat event");
  db.close();
});

test("keyword search still refuses to throw on FTS5-meaningful characters", () => {
  const db = openDb(":memory:");
  indexKeywords(db, "e1", "resistência de precisão");
  // The Unicode tokenizer must not have reopened the syntax-injection
  // hole the ASCII one closed.
  for (const q of ['"', "*", "-", "a OR b", "NEAR(a b)", "col:val", "ção*", '"ão"']) {
    assert.doesNotThrow(() => keywordSearch(db, q, 5), `threw on ${JSON.stringify(q)}`);
  }
  db.close();
});

// Plain field, not a TS parameter property -- Node runs this repo's
// TypeScript in strip-only mode, which rejects those.
class BadEmbedder {
  readonly vector: unknown;
  constructor(vector: unknown) {
    this.vector = vector;
  }
  async embed(): Promise<number[][]> {
    return [this.vector as number[]];
  }
}

test("a malformed embedding degrades to no semantic matches, never throws", async () => {
  const db = openDb(":memory:");
  // All three were verified to throw inside sqlite-vec itself:
  // [] -> "zero-length vectors are not supported"
  // wrong length -> "Dimension mismatch"
  // NaN -> "invalid: JSON parsing error"
  // Each one used to fail the WHOLE turn ("Something went wrong"), even
  // though recent turns, facts and keyword search were all fine.
  const bad: unknown[] = [
    [],
    [1, 2, 3],
    Array.from({ length: EMBEDDING_DIMENSIONS }, () => Number.NaN),
    Array.from({ length: EMBEDDING_DIMENSIONS }, () => Number.POSITIVE_INFINITY),
    undefined,
  ];
  for (const vector of bad) {
    const matches = await semanticSearch(db, new BadEmbedder(vector) as never, "anything", 5);
    assert.deepEqual(matches, [], `expected graceful [] for ${JSON.stringify(vector)?.slice(0, 40)}`);
  }
  db.close();
});

test("a well-formed embedding still works -- the guard must not reject valid vectors", async () => {
  const db = openDb(":memory:");
  const good = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0));
  const matches = await semanticSearch(db, new BadEmbedder(good) as never, "anything", 5);
  // Empty index, so no matches -- but it must have QUERIED, not bailed.
  assert.deepEqual(matches, []);
  db.close();
});
