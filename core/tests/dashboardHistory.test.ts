/**
 * core/tests/dashboardHistory.test.ts — pure in-memory logic, no network,
 * no DB, no socket -- nothing here needed a fake before this file existed
 * (found in a code review, 2026-08-06: the one file in core/ that touches
 * nothing external yet had zero test coverage).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createDashboardHistory } from "../dashboardHistory.ts";

function thought(text: string) {
  return { type: "thought" as const, lane: "converse" as const, ts: 0, text };
}

function errorEvent(message: string) {
  return { type: "error" as const, message, detail: "", ts: 0 };
}

test("recentThoughts/recentErrors start empty", () => {
  const history = createDashboardHistory();
  assert.deepEqual(history.recentThoughts(), []);
  assert.deepEqual(history.recentErrors(), []);
});

test("recordThought/recordError are readable back in order", () => {
  const history = createDashboardHistory();
  history.recordThought(thought("first"));
  history.recordThought(thought("second"));
  history.recordError(errorEvent("boom"));

  assert.deepEqual(
    history.recentThoughts().map((t) => t.text),
    ["first", "second"],
  );
  assert.deepEqual(
    history.recentErrors().map((e) => e.message),
    ["boom"],
  );
});

test("thoughts beyond the cap evict the oldest first, not the newest", () => {
  const history = createDashboardHistory();
  for (let i = 0; i < 55; i++) history.recordThought(thought(`t${i}`));

  const kept = history.recentThoughts();
  assert.equal(kept.length, 50);
  assert.equal(kept[0]?.text, "t5"); // the first 5 (t0-t4) evicted
  assert.equal(kept[kept.length - 1]?.text, "t54");
});

test("errors beyond the cap evict the oldest first, not the newest", () => {
  const history = createDashboardHistory();
  for (let i = 0; i < 25; i++) history.recordError(errorEvent(`e${i}`));

  const kept = history.recentErrors();
  assert.equal(kept.length, 20);
  assert.equal(kept[0]?.message, "e5");
  assert.equal(kept[kept.length - 1]?.message, "e24");
});

test("recentThoughts/recentErrors return a copy, not the live internal array", () => {
  const history = createDashboardHistory();
  history.recordThought(thought("first"));

  const snapshot = history.recentThoughts();
  history.recordThought(thought("second"));

  assert.equal(snapshot.length, 1); // mutating history after the snapshot doesn't retroactively change it
});
