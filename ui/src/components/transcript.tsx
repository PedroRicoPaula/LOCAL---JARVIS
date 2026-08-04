"use client";

import { useEffect, useRef } from "react";
import type { TranscriptLine } from "@/lib/use-jarvis";
import { Panel } from "./panel";

export function Transcript({ lines }: { lines: TranscriptLine[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  return (
    <Panel title="Conversation Log" className="flex-1 min-h-0 flex flex-col">
      <div ref={logRef} className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {lines.length === 0 ? (
          <div className="text-[10px] text-jarvis-dim">Waiting for the first utterance.</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="fade-in-up">
              <div className="text-[8px] text-jarvis-dim mb-[3px]">
                {new Date(line.ts).toLocaleTimeString("en-US", { hour12: false })}
              </div>
              <div
                className="text-[10px] leading-relaxed"
                style={{ color: line.speaker === "jarvis" ? "#00D4FF" : "#A8BDD4" }}
              >
                {line.speaker === "owner" ? (
                  <span className="text-jarvis-dim">OWNER › </span>
                ) : (
                  <span className="text-jarvis-cyan opacity-70">JV › </span>
                )}
                {line.text}
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
