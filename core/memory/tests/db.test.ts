import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";

test("events is genuinely append-only: UPDATE raises", () => {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO events (id, ts, kind, actor, content) VALUES (?, ?, ?, ?, ?)").run(
    "1",
    1,
    "note",
    "system",
    "hello",
  );

  assert.throws(() => {
    db.prepare("UPDATE events SET content = ? WHERE id = ?").run("bye", "1");
  }, /append-only/);
});

test("events is genuinely append-only: DELETE raises", () => {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO events (id, ts, kind, actor, content) VALUES (?, ?, ?, ?, ?)").run(
    "1",
    1,
    "note",
    "system",
    "hello",
  );

  assert.throws(() => {
    db.prepare("DELETE FROM events WHERE id = ?").run("1");
  }, /append-only/);
});

test("facts is editable, not append-only -- UPDATE does not raise", () => {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO facts (id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    "1",
    "diet.avoids",
    "peanuts",
    0.9,
    1,
  );

  assert.doesNotThrow(() => {
    db.prepare("UPDATE facts SET value = ? WHERE id = ?").run("shellfish", "1");
  });
});

test("sqlite-vec is loaded and the memory_vec table works", () => {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO memory_vec (embedding, ref_id) VALUES (?, ?)").run(
    JSON.stringify(new Array(1024).fill(0).map((_, i) => (i === 0 ? 1 : 0))),
    "ref-a",
  );
  const row = db.prepare("SELECT ref_id FROM memory_vec WHERE ref_id = ?").get("ref-a") as { ref_id: string } | undefined;
  assert.equal(row?.ref_id, "ref-a");
});
