/**
 * shared/types/metrics.ts -- dashboard metrics (SOAK 1), aggregated from
 * `routing_stats` and `events`. Split out of shared/types.ts, 2026-08-12.
 */

import type { Lane } from "./router.ts";

// ---------------------------------------------------------------------------
// Dashboard metrics (SOAK 1) — aggregated from `routing_stats` (one row per
// dispatch decision) and `events`, so the dashboard can show whether real
// usage is actually working, not just individual turns. See
// `core/metrics.ts`'s own docstring for why this is a pure, separately
// testable function over raw rows rather than SQL aggregation.
// ---------------------------------------------------------------------------

export interface SkillHitRate {
  skillId: string;
  intentId: string;
  count: number;
}

export interface DashboardMetrics {
  utterancesToday: number;
  utterancesThisWeek: number;
  laneDistribution: Partial<Record<Lane, number>>;
  skillHitRate: SkillHitRate[];
  noSkillMatchedCount: number;
  /** 0..1 of all routing decisions in the window, not just today's. */
  noSkillMatchedRate: number;
  totalRoutingDecisions: number;
}
