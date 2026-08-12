import type { MemoryEvent } from "@/lib/types";
import { Panel } from "./panel";

const KIND_COLOR: Record<string, string> = {
  utterance: "#A8BDD4",
  response: "#00D4FF",
  observation: "#FFB84D",
  action: "#00FF9F",
  approval: "#00FF9F",
  rejection: "#FF5D5D",
  note: "#6B8299",
};

export function Timeline({ events }: { events: MemoryEvent[] }) {
  const newestFirst = [...events].reverse();
  return (
    <Panel title="Timeline" className="lg:flex-1 lg:min-h-0 flex flex-col shrink-0">
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-48 lg:max-h-none">
        {newestFirst.length === 0 ? (
          <div className="text-[10px] text-jarvis-dim">No events yet.</div>
        ) : (
          newestFirst.map((e) => (
            <div key={e.id} className="flex gap-2 items-start">
              <span className="text-[8px] font-mono shrink-0 text-jarvis-dim" style={{ minWidth: 56 }}>
                {new Date(e.ts).toLocaleTimeString("en-US", { hour12: false })}
              </span>
              <div className="min-w-0">
                <span className="text-[8px] tracking-wider uppercase mr-1" style={{ color: KIND_COLOR[e.kind] ?? "#6B8299" }}>
                  {e.kind}
                </span>
                <span className="text-[9px] text-jarvis-text/80">{e.content}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
