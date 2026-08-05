import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";
import { indexKeywords, keywordSearch } from "../keywordSearch.ts";

test("finds an exact token match", () => {
  const db = openDb(":memory:");
  indexKeywords(db, "event-1", "the resistor is R47");

  const results = keywordSearch(db, "R47", 5);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.refId, "event-1");
});

test("no match returns an empty array, not a throw", () => {
  const db = openDb(":memory:");
  indexKeywords(db, "event-1", "completely unrelated content");

  const results = keywordSearch(db, "xyzzy", 5);

  assert.deepEqual(results, []);
});

test("respects topK", () => {
  const db = openDb(":memory:");
  for (let i = 0; i < 10; i++) indexKeywords(db, `event-${i}`, "shared keyword content");

  const results = keywordSearch(db, "shared", 3);

  assert.equal(results.length, 3);
});

test("query text with FTS5-meaningful characters does not throw a syntax error -- found live risk, not hypothetical", () => {
  const db = openDb(":memory:");
  indexKeywords(db, "event-1", "some content");

  // -, ", *, : and similar are all meaningful in FTS5's own query syntax;
  // raw owner speech transcribed as-is could contain any of them.
  assert.doesNotThrow(() => keywordSearch(db, 'weather - "tomorrow"? *maybe* not: right', 5));
});

test("an empty or whitespace-only query returns no matches, not every row", () => {
  const db = openDb(":memory:");
  indexKeywords(db, "event-1", "some content");

  assert.deepEqual(keywordSearch(db, "   ", 5), []);
  assert.deepEqual(keywordSearch(db, "", 5), []);
});
