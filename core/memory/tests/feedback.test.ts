import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";
import { appendEvent } from "../events.ts";
import { recentFeedback, setFeedback } from "../feedback.ts";

function realEvent(db: ReturnType<typeof openDb>): string {
  return appendEvent(db, { kind: "response", actor: "jarvis", content: "hi" }).id;
}

test("setFeedback then recentFeedback round-trips the rating", () => {
  const db = openDb(":memory:");
  const id = realEvent(db);
  setFeedback(db, id, "up");
  assert.deepEqual(recentFeedback(db, 10), { [id]: "up" });
});

test("setFeedback on the same event twice overwrites, last rating wins", () => {
  const db = openDb(":memory:");
  const id = realEvent(db);
  setFeedback(db, id, "up", 1000);
  setFeedback(db, id, "down", 2000);
  assert.deepEqual(recentFeedback(db, 10), { [id]: "down" });
});

test("a fabricated event id throws -- event_feedback.event_id references a real events row", () => {
  const db = openDb(":memory:");
  assert.throws(() => setFeedback(db, "not-a-real-event", "up"));
});
