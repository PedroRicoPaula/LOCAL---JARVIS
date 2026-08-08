import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("routing_stats gains an event_id column on a real, already-populated database file, without losing existing rows", () => {
  // A real file, not :memory: -- reopening the same real path twice
  // simulates two `core` boots against Pedro's real data/jarvis.db, the
  // exact scenario this migration has to be safe for. ALTER TABLE ADD
  // COLUMN isn't idempotent on its own; this proves the PRAGMA-guarded
  // version genuinely is.
  const dir = mkdtempSync(join(tmpdir(), "jarvis-db-test-"));
  const path = join(dir, "jarvis.db");

  const first = openDb(path);
  first.prepare("INSERT INTO routing_stats (id, ts, lane, skill_id, intent_id, matched) VALUES (?, ?, ?, ?, ?, ?)").run(
    "row-1",
    1000,
    "converse",
    "weather",
    "get",
    1,
  );

  assert.doesNotThrow(() => openDb(path));

  const second = openDb(path);
  const columns = second.prepare("PRAGMA table_info(routing_stats)").all() as { name: string }[];
  assert.ok(columns.some((c) => c.name === "event_id"));

  const preserved = second.prepare("SELECT id, lane FROM routing_stats WHERE id = ?").get("row-1") as { id: string; lane: string } | undefined;
  assert.equal(preserved?.id, "row-1");
  assert.equal(preserved?.lane, "converse");
});
