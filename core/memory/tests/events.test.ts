import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";
import { appendEvent, getEvent, recentEventsForSession } from "../events.ts";

test("appendEvent generates an id and ts, roundtrips through getEvent", () => {
  const db = openDb(":memory:");
  const event = appendEvent(db, { kind: "utterance", actor: "owner", content: "hello", sessionId: "s1" });

  assert.ok(event.id.length > 0);
  assert.ok(event.ts > 0);
  assert.deepEqual(getEvent(db, event.id), event);
});

test("meta round-trips as an object, not a JSON string", () => {
  const db = openDb(":memory:");
  const event = appendEvent(db, { kind: "note", actor: "system", content: "x", meta: { foo: "bar" } });

  assert.deepEqual(getEvent(db, event.id)?.meta, { foo: "bar" });
});

test("recentEventsForSession returns oldest-first, limited, filtered by session", () => {
  const db = openDb(":memory:");
  appendEvent(db, { kind: "utterance", actor: "owner", content: "a", sessionId: "s1", ts: 1 });
  appendEvent(db, { kind: "utterance", actor: "owner", content: "b", sessionId: "s1", ts: 2 });
  appendEvent(db, { kind: "utterance", actor: "owner", content: "other-session", sessionId: "s2", ts: 3 });
  appendEvent(db, { kind: "utterance", actor: "owner", content: "c", sessionId: "s1", ts: 4 });

  const recent = recentEventsForSession(db, "s1", 2);

  assert.deepEqual(
    recent.map((e) => e.content),
    ["b", "c"],
  );
});

test("getEvent returns null for an unknown id", () => {
  const db = openDb(":memory:");
  assert.equal(getEvent(db, "nope"), null);
});
