import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";
import { recordRoutingStat, routingStatsSince } from "../routingStats.ts";

test("recordRoutingStat then routingStatsSince round-trips a matched decision", () => {
  const db = openDb(":memory:");
  recordRoutingStat(db, { lane: "converse", skillId: "weather", intentId: "get", matched: true }, 5000);
  const rows = routingStatsSince(db, 0);
  assert.deepEqual(rows, [{ ts: 5000, lane: "converse", skillId: "weather", intentId: "get", matched: true }]);
});

test("an unmatched decision stores null skill/intent", () => {
  const db = openDb(":memory:");
  recordRoutingStat(db, { lane: "see", skillId: null, intentId: null, matched: false }, 5000);
  const rows = routingStatsSince(db, 0);
  assert.deepEqual(rows, [{ ts: 5000, lane: "see", skillId: null, intentId: null, matched: false }]);
});

test("routingStatsSince excludes rows before the cutoff, ordered oldest first", () => {
  const db = openDb(":memory:");
  recordRoutingStat(db, { lane: "converse", skillId: "a", intentId: "b", matched: true }, 1000);
  recordRoutingStat(db, { lane: "converse", skillId: "c", intentId: "d", matched: true }, 3000);
  const rows = routingStatsSince(db, 2000);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.skillId, "c");
});
