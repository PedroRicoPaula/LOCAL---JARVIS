/**
 * core/memory/routingStats.ts — one durable row per dispatch decision
 * (SOAK 1), the raw material `core/metrics.ts` aggregates into
 * `DashboardMetrics`. See `db.ts`'s `routing_stats` table docstring for
 * why this is a separate table from `events`, not a query over it.
 */

import type { DatabaseSync } from "node:sqlite";
import { ulid } from "ulid";
import type { Lane } from "../../shared/types.ts";

export interface RoutingStatRow {
  ts: number;
  lane: Lane;
  skillId: string | null;
  intentId: string | null;
  matched: boolean;
}

/** A no_skill_matched decision, with the owner's actual utterance --
 * docs/BACKLOG.md's "reviewable list of routing misses" idea: closing a
 * gap like ADR-026's coffee collision becomes reading this list instead
 * of re-reading a whole conversation log by hand. `utterance` is `null`
 * when `eventId` doesn't resolve to a real `events` row (a stat recorded
 * before this column existed, or the event was somehow never written) --
 * shown honestly as unknown, never guessed at. */
export interface RoutingMiss {
  ts: number;
  lane: Lane;
  eventId: string | null;
  utterance: string | null;
}

interface RawRow {
  ts: number;
  lane: string;
  skill_id: string | null;
  intent_id: string | null;
  matched: number;
}

interface RawMissRow {
  ts: number;
  lane: string;
  event_id: string | null;
  utterance: string | null;
}

export function recordRoutingStat(
  db: DatabaseSync,
  input: { lane: Lane; skillId: string | null; intentId: string | null; matched: boolean; eventId?: string | null },
  ts: number = Date.now(),
): void {
  db.prepare(
    "INSERT INTO routing_stats (id, ts, lane, skill_id, intent_id, matched, event_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(ulid(), ts, input.lane, input.skillId, input.intentId, input.matched ? 1 : 0, input.eventId ?? null);
}

export function routingStatsSince(db: DatabaseSync, sinceTs: number): RoutingStatRow[] {
  const rows = db
    .prepare("SELECT ts, lane, skill_id, intent_id, matched FROM routing_stats WHERE ts >= ? ORDER BY ts")
    .all(sinceTs) as unknown as RawRow[];
  return rows.map((r) => ({
    ts: r.ts,
    lane: r.lane as Lane,
    skillId: r.skill_id,
    intentId: r.intent_id,
    matched: r.matched === 1,
  }));
}

/** Most recent `no_skill_matched` decisions first, joined against `events`
 * for the real utterance text. */
export function recentRoutingMisses(db: DatabaseSync, limit: number): RoutingMiss[] {
  const rows = db
    .prepare(
      `SELECT rs.ts AS ts, rs.lane AS lane, rs.event_id AS event_id, e.content AS utterance
       FROM routing_stats rs
       LEFT JOIN events e ON e.id = rs.event_id
       WHERE rs.matched = 0
       ORDER BY rs.ts DESC
       LIMIT ?`,
    )
    .all(limit) as unknown as RawMissRow[];
  return rows.map((r) => ({ ts: r.ts, lane: r.lane as Lane, eventId: r.event_id, utterance: r.utterance }));
}
