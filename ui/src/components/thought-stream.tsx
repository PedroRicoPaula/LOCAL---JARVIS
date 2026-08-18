"use client";

import { useEffect, useRef } from "react";
import type { Thought } from "@/lib/use-jarvis";
import { Panel } from "./panel";

export function ThoughtStream({ thoughts }: { thoughts: Thought[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [thoughts]);

  return (
    <Panel title="Thought Stream" className="lg:flex-1 lg:min-h-0 flex flex-col shrink-0">
      <div ref={logRef} className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-48 lg:max-h-none">
        {thoughts.length === 0 ? (
          <div className="text-[12px] text-jarvis-dim">No routing activity yet.</div>
        ) : (
          thoughts.map((t, i) => (
            <div key={i} className="fade-in-up text-[11px] leading-snug">
              <span className="text-jarvis-dim">{new Date(t.ts).toLocaleTimeString("en-US", { hour12: false })} </span>
              <span className="text-jarvis-amber uppercase">[{t.lane}] </span>
              <span className="text-jarvis-text">{t.text}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
