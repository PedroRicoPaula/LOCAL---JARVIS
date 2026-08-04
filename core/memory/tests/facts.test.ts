import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";
import { factsAboveConfidence, getFact, upsertFact } from "../facts.ts";

test("upsertFact inserts a new fact", () => {
  const db = openDb(":memory:");
  const fact = upsertFact(db, { key: "diet.avoids", value: "peanuts", confidence: 0.9 });

  assert.equal(fact.key, "diet.avoids");
  assert.deepEqual(getFact(db, "diet.avoids"), fact);
});

test("upsertFact on an existing key overwrites, not duplicates -- durable and editable, not append-only", () => {
  const db = openDb(":memory:");
  upsertFact(db, { key: "diet.avoids", value: "peanuts", confidence: 0.9 });
  const updated = upsertFact(db, { key: "diet.avoids", value: "shellfish", confidence: 0.7 });

  assert.equal(updated.value, "shellfish");
  assert.equal(getFact(db, "diet.avoids")?.value, "shellfish");
  const all = factsAboveConfidence(db, 0);
  assert.equal(all.length, 1);
});

test("factsAboveConfidence excludes low-confidence facts -- honest, not rounded up", () => {
  const db = openDb(":memory:");
  upsertFact(db, { key: "a", value: "1", confidence: 0.9 });
  upsertFact(db, { key: "b", value: "2", confidence: 0.5 });
  upsertFact(db, { key: "c", value: "3", confidence: 0.61 });

  const keys = factsAboveConfidence(db, 0.6).map((f) => f.key);
  assert.deepEqual(new Set(keys), new Set(["a", "c"]));
});

test("getFact returns null for an unknown key", () => {
  const db = openDb(":memory:");
  assert.equal(getFact(db, "nope"), null);
});
