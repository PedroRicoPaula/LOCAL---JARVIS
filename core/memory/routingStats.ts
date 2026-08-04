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

interface RawRow {
  ts: number;
  lane: string;
  skill_id: string | null;
  intent_id: string | null;
  matched: number;
}

export function recordRoutingStat(
  db: DatabaseSync,
  input: { lane: Lane; skillId: string | null; intentId: string | null; matched: boolean },
  ts: number = Date.now(),
): void {
  db.prepare(
    "INSERT INTO routing_stats (id, ts, lane, skill_id, intent_id, matched) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(ulid(), ts, input.lane, input.skillId, input.intentId, input.matched ? 1 : 0);
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
