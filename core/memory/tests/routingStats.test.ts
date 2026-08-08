import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";
import { appendEvent } from "../events.ts";
import { recentRoutingMisses, recordRoutingStat, routingStatsSince } from "../routingStats.ts";

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

test("recentRoutingMisses: a matched decision never appears", () => {
  const db = openDb(":memory:");
  recordRoutingStat(db, { lane: "converse", skillId: "weather", intentId: "get", matched: true, eventId: "e1" }, 1000);
  assert.deepEqual(recentRoutingMisses(db, 10), []);
});

test("recentRoutingMisses: joins the real utterance text via event_id, most recent first", () => {
  const db = openDb(":memory:");
  const id1 = appendEvent(db, { kind: "utterance", actor: "owner", content: "peel me a grape" }).id;
  const id2 = appendEvent(db, { kind: "utterance", actor: "owner", content: "what's the vibe today" }).id;
  recordRoutingStat(db, { lane: "converse", skillId: null, intentId: null, matched: false, eventId: id1 }, 1000);
  recordRoutingStat(db, { lane: "reason", skillId: null, intentId: null, matched: false, eventId: id2 }, 2000);

  const misses = recentRoutingMisses(db, 10);

  assert.deepEqual(misses, [
    { ts: 2000, lane: "reason", eventId: id2, utterance: "what's the vibe today" },
    { ts: 1000, lane: "converse", eventId: id1, utterance: "peel me a grape" },
  ]);
});

test("recentRoutingMisses: a stat with no eventId (recorded before this column existed) shows an unknown utterance honestly, not a guess", () => {
  const db = openDb(":memory:");
  recordRoutingStat(db, { lane: "see", skillId: null, intentId: null, matched: false }, 1000);

  const misses = recentRoutingMisses(db, 10);

  assert.deepEqual(misses, [{ ts: 1000, lane: "see", eventId: null, utterance: null }]);
});

test("recentRoutingMisses respects the limit", () => {
  const db = openDb(":memory:");
  for (let i = 0; i < 5; i++) {
    recordRoutingStat(db, { lane: "converse", skillId: null, intentId: null, matched: false }, i);
  }
  assert.equal(recentRoutingMisses(db, 2).length, 2);
});
