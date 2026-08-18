import type { SystemMetrics } from "@/lib/types";
import { Panel } from "./panel";

function MetricBar({ value, label, color = "#00D4FF" }: { value: number; label: string; color?: string }) {
  return (
    <div className="space-y-[3px]">
      <div className="flex justify-between items-center">
        <span className="text-[11px] tracking-widest text-jarvis-dim uppercase">{label}</span>
        <span className="text-[11px] font-mono" style={{ color }}>{value}%</span>
      </div>
      <div className="h-[2px] bg-white/10 w-full relative">
        <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function uptimeStr(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function SystemStatus({ system }: { system: SystemMetrics | null }) {
  return (
    <Panel title="System Status" className="shrink-0">
      {system === null ? (
        <div className="text-[12px] text-jarvis-dim">Waiting for core…</div>
      ) : (
        <div className="space-y-3">
          <MetricBar value={system.cpuLoadPct} label="CPU load" color="#00D4FF" />
          <MetricBar value={system.memUsedPct} label="Memory" color="#00D4FF" />
          <MetricBar value={100 - system.diskFreePct} label="Disk" color="#FFB84D" />
          <div className="pt-2 border-t border-white/10 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-jarvis-dim">MEM</span>
              <span className="text-jarvis-text tabular-nums">
                {system.memUsedGB} / {system.memTotalGB} GB
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-jarvis-dim">DISK FREE</span>
              {/* Rounded, not raw: `228.3 - 179.2` is 49.10000000000002 in
                  IEEE-754, and that exact string was on screen against a
                  real core (2026-08-17). A dashboard reading out 14 decimal
                  places of float noise reads as broken. */}
              <span className="text-jarvis-text tabular-nums">
                {system.diskFreePct}% ({(system.diskTotalGB - system.diskUsedGB).toFixed(1)} GB)
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-jarvis-dim">UPTIME</span>
              <span className="text-jarvis-cyan tabular-nums">{uptimeStr(system.uptimeSec)}</span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
