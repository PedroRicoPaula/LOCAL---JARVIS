/**
 * core/memory/events.ts — append-only writes and reads against `events`.
 * The trigger in `db.ts` is the real enforcement; this module just never
 * offers an update/delete method to begin with.
 */

import type { DatabaseSync } from "node:sqlite";
import { ulid } from "ulid";
import type { EventKind, MemoryEvent } from "../../shared/types.ts";

interface EventRow {
  id: string;
  ts: number;
  kind: string;
  actor: string;
  content: string;
  meta: string | null;
  session_id: string | null;
}

function rowToEvent(row: EventRow): MemoryEvent {
  const event: MemoryEvent = {
    id: row.id,
    ts: row.ts,
    kind: row.kind as EventKind,
    actor: row.actor as MemoryEvent["actor"],
    content: row.content,
  };
  if (row.meta !== null) event.meta = JSON.parse(row.meta) as Record<string, unknown>;
  if (row.session_id !== null) event.sessionId = row.session_id;
  return event;
}

export function appendEvent(db: DatabaseSync, input: Omit<MemoryEvent, "id" | "ts"> & { ts?: number }): MemoryEvent {
  const event: MemoryEvent = {
    id: ulid(),
    ts: input.ts ?? Date.now(),
    kind: input.kind,
    actor: input.actor,
    content: input.content,
  };
  if (input.meta !== undefined) event.meta = input.meta;
  if (input.sessionId !== undefined) event.sessionId = input.sessionId;

  db.prepare(
    "INSERT INTO events (id, ts, kind, actor, content, meta, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    event.id,
    event.ts,
    event.kind,
    event.actor,
    event.content,
    event.meta !== undefined ? JSON.stringify(event.meta) : null,
    event.sessionId ?? null,
  );
  return event;
}

/** Last N turns of a session, oldest first — SPEC.md § 4's recall policy
 * step 1: "Last N turns of the current session (always)." */
export function recentEventsForSession(db: DatabaseSync, sessionId: string, limit: number): MemoryEvent[] {
  const rows = db
    .prepare("SELECT * FROM events WHERE session_id = ? ORDER BY ts DESC LIMIT ?")
    .all(sessionId, limit) as unknown as EventRow[];
  return rows.map(rowToEvent).reverse();
}

export function getEvent(db: DatabaseSync, id: string): MemoryEvent | null {
  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as unknown as EventRow | undefined;
  return row ? rowToEvent(row) : null;
}
