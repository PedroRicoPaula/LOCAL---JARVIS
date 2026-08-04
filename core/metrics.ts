/**
 * core/metrics.ts — turns raw `routing_stats`/`events` rows into
 * `DashboardMetrics` (SOAK 1: "how do I know real usage is actually
 * working, without reading logs by hand"). A pure function over rows
 * already fetched, not a SQL aggregation query, so it's testable with
 * plain fixture arrays -- no DB needed, same fakes-first rule as every
 * other module here (CLAUDE.md § 3).
 */

import type { DashboardMetrics, Lane, MemoryEvent, SkillHitRate } from "../shared/types.ts";
import type { RoutingStatRow } from "./memory/routingStats.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function computeMetrics(events: readonly MemoryEvent[], stats: readonly RoutingStatRow[], now: number = Date.now()): DashboardMetrics {
  const todayStart = now - DAY_MS;
  const weekStart = now - WEEK_MS;

  const utterancesToday = events.filter((e) => e.kind === "utterance" && e.ts >= todayStart).length;
  const utterancesThisWeek = events.filter((e) => e.kind === "utterance" && e.ts >= weekStart).length;

  const laneDistribution: Partial<Record<Lane, number>> = {};
  const hitCounts = new Map<string, SkillHitRate>();
  let noSkillMatchedCount = 0;

  for (const stat of stats) {
    laneDistribution[stat.lane] = (laneDistribution[stat.lane] ?? 0) + 1;
    if (!stat.matched || stat.skillId === null || stat.intentId === null) {
      noSkillMatchedCount += 1;
      continue;
    }
    const key = `${stat.skillId}.${stat.intentId}`;
    const existing = hitCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      hitCounts.set(key, { skillId: stat.skillId, intentId: stat.intentId, count: 1 });
    }
  }

  const skillHitRate = [...hitCounts.values()].sort((a, b) => b.count - a.count);
  const totalRoutingDecisions = stats.length;

  return {
    utterancesToday,
    utterancesThisWeek,
    laneDistribution,
    skillHitRate,
    noSkillMatchedCount,
    noSkillMatchedRate: totalRoutingDecisions === 0 ? 0 : noSkillMatchedCount / totalRoutingDecisions,
    totalRoutingDecisions,
  };
}
