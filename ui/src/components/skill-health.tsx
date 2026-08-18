import { Badge } from "@/components/ui/badge";
import type { SkillHealth } from "@/lib/types";
import { Panel } from "./panel";

export function SkillHealthPanel({ skills }: { skills: SkillHealth[] }) {
  return (
    <Panel title="Skill Health" className="px-4 py-4">
      {/* Scrolls inside its own panel: with all 13 real skills loaded this
          list is ~500px tall, which previously pushed Metrics and Timeline
          out of the left column entirely -- found live 2026-08-17 against a
          running core, invisible with an empty registry. */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {skills.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="rounded-full status-dot-active shrink-0"
                style={{
                  width: 5,
                  height: 5,
                  background: s.status === "loaded" ? "#00D4FF" : "#FF5D5D",
                  boxShadow: `0 0 4px ${s.status === "loaded" ? "#00D4FF" : "#FF5D5D"}`,
                }}
              />
              <span className="text-[12px] tracking-wider text-jarvis-text truncate">{s.id}</span>
            </div>
            <Badge variant={s.status === "loaded" ? "outline" : "destructive"} className="text-[10px] shrink-0">
              {s.status === "loaded" ? `v${s.version}` : "DISABLED"}
            </Badge>
          </div>
        ))}
        {skills.filter((s) => s.status === "disabled").map((s) =>
          s.lastError ? (
            <div key={`${s.id}-error`} className="text-[10px] text-red-400 leading-tight pl-[13px]">
              {s.lastError}
            </div>
          ) : null,
        )}
        {skills.length === 0 ? <div className="text-[12px] text-jarvis-dim">No skills loaded.</div> : null}
      </div>
    </Panel>
  );
}
