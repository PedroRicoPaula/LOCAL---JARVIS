/**
 * core/memory/facts.ts — durable, editable beliefs (SPEC.md § 4). Unlike
 * `events`, `facts` is meant to be updated: `UNIQUE(key)` plus an upsert is
 * literally "durable, editable beliefs about the owner," not a second
 * append-only log.
 */

import type { DatabaseSync } from "node:sqlite";
import { ulid } from "ulid";
import type { Fact } from "../../shared/types.ts";

interface FactRow {
  id: string;
  key: string;
  value: string;
  confidence: number;
  source_event: string | null;
  updated_at: number;
}

function rowToFact(row: FactRow): Fact {
  const fact: Fact = {
    id: row.id,
    key: row.key,
    value: row.value,
    confidence: row.confidence,
    updatedAt: row.updated_at,
  };
  if (row.source_event !== null) fact.sourceEventId = row.source_event;
  return fact;
}

/** Insert or overwrite the fact at `key` — "durable, editable," not
 * append-only. Confidence is never rounded up; pass what was actually
 * observed (CLAUDE.md § 6). */
export function upsertFact(
  db: DatabaseSync,
  input: { key: string; value: string; confidence: number; sourceEventId?: string; updatedAt?: number },
): Fact {
  const updatedAt = input.updatedAt ?? Date.now();
  const existing = db.prepare("SELECT id FROM facts WHERE key = ?").get(input.key) as { id: string } | undefined;
  const id = existing?.id ?? ulid();

  db.prepare(
    `INSERT INTO facts (id, key, value, confidence, source_event, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       confidence = excluded.confidence,
       source_event = excluded.source_event,
       updated_at = excluded.updated_at`,
  ).run(id, input.key, input.value, input.confidence, input.sourceEventId ?? null, updatedAt);

  const fact: Fact = { id, key: input.key, value: input.value, confidence: input.confidence, updatedAt };
  if (input.sourceEventId !== undefined) fact.sourceEventId = input.sourceEventId;
  return fact;
}

export function getFact(db: DatabaseSync, key: string): Fact | null {
  const row = db.prepare("SELECT * FROM facts WHERE key = ?").get(key) as unknown as FactRow | undefined;
  return row ? rowToFact(row) : null;
}

/** SPEC.md § 4's recall policy step 3: "All facts with confidence > 0.6." */
export function factsAboveConfidence(db: DatabaseSync, threshold = 0.6): Fact[] {
  const rows = db
    .prepare("SELECT * FROM facts WHERE confidence > ? ORDER BY updated_at DESC")
    .all(threshold) as unknown as FactRow[];
  return rows.map(rowToFact);
}
