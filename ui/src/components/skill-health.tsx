import { Badge } from "@/components/ui/badge";
import type { SkillHealth } from "@/lib/types";
import { Panel } from "./panel";

export function SkillHealthPanel({ skills }: { skills: SkillHealth[] }) {
  return (
    <Panel title="Skill Health" className="px-4 py-4">
      <div className="space-y-2">
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
              <span className="text-[10px] tracking-wider text-jarvis-text truncate">{s.id}</span>
            </div>
            <Badge variant={s.status === "loaded" ? "outline" : "destructive"} className="text-[8px] shrink-0">
              {s.status === "loaded" ? `v${s.version}` : "DISABLED"}
            </Badge>
          </div>
        ))}
        {skills.filter((s) => s.status === "disabled").map((s) =>
          s.lastError ? (
            <div key={`${s.id}-error`} className="text-[8px] text-red-400 leading-tight pl-[13px]">
              {s.lastError}
            </div>
          ) : null,
        )}
        {skills.length === 0 ? <div className="text-[10px] text-jarvis-dim">No skills loaded.</div> : null}
      </div>
    </Panel>
  );
}
