import type { DashboardMetrics } from "@/lib/types";
import { Panel } from "./panel";

/** SOAK 1: is real usage actually working, at a glance -- the whole point
 * of a testing-heavy soak is collecting this instead of reading logs by
 * hand. Aggregated by `core/metrics.ts` from `routing_stats`/`events`. */
export function MetricsWidget({ metrics }: { metrics: DashboardMetrics | null }) {
  if (metrics === null) {
    return (
      <Panel title="Metrics" className="shrink-0">
        <div className="text-[10px] text-jarvis-dim">Waiting for core…</div>
      </Panel>
    );
  }

  const lanes = Object.entries(metrics.laneDistribution).sort(([, a], [, b]) => b - a);
  const topSkills = metrics.skillHitRate.slice(0, 4);
  const missRatePct = Math.round(metrics.noSkillMatchedRate * 100);

  return (
    <Panel title="Metrics (30d)" className="shrink-0">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <div className="text-[9px] text-jarvis-dim uppercase">Today</div>
          <div className="text-[14px] text-jarvis-cyan font-mono">{metrics.utterancesToday}</div>
        </div>
        <div>
          <div className="text-[9px] text-jarvis-dim uppercase">This week</div>
          <div className="text-[14px] text-jarvis-cyan font-mono">{metrics.utterancesThisWeek}</div>
        </div>
      </div>

      {lanes.length > 0 ? (
        <div className="space-y-1 mb-2">
          <div className="text-[9px] text-jarvis-dim uppercase">Lane distribution</div>
          {lanes.map(([lane, count]) => (
            <div key={lane} className="flex justify-between text-[9px]">
              <span className="text-jarvis-text">{lane}</span>
              <span className="text-jarvis-dim font-mono">{count}</span>
            </div>
          ))}
        </div>
      ) : null}

      {topSkills.length > 0 ? (
        <div className="space-y-1 mb-2">
          <div className="text-[9px] text-jarvis-dim uppercase">Top skills</div>
          {topSkills.map((s) => (
            <div key={`${s.skillId}.${s.intentId}`} className="flex justify-between text-[9px]">
              <span className="text-jarvis-text truncate">
                {s.skillId}.{s.intentId}
              </span>
              <span className="text-jarvis-dim font-mono">{s.count}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex justify-between text-[9px] pt-1 border-t border-white/10">
        <span className="text-jarvis-dim uppercase">No-skill-matched</span>
        <span className={missRatePct > 20 ? "text-jarvis-amber font-mono" : "text-jarvis-dim font-mono"}>
          {metrics.noSkillMatchedCount} ({missRatePct}%)
        </span>
      </div>
    </Panel>
  );
}
