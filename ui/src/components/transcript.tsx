"use client";

import { useEffect, useRef } from "react";
import type { FeedbackRating } from "@/lib/types";
import type { TranscriptLine } from "@/lib/use-jarvis";
import { Panel } from "./panel";

/** SOAK 1: a real, owner-only judgement call on a `jarvis` line -- labeled
 * data for later routing/prompt tuning, not something a model ever sets
 * (CLAUDE.md § 0.5). Only rendered when `eventId` exists (a real `events`
 * row to attach to). */
function FeedbackButtons({
  eventId,
  rating,
  onFeedback,
}: {
  eventId: string;
  rating: FeedbackRating | undefined;
  onFeedback: (eventId: string, rating: FeedbackRating) => void;
}) {
  return (
    <span className="inline-flex gap-1 ml-2 align-middle">
      <button
        onClick={() => onFeedback(eventId, "up")}
        className={`text-[10px] leading-none ${rating === "up" ? "opacity-100" : "opacity-30 hover:opacity-70"}`}
        title="Good response"
      >
        👍
      </button>
      <button
        onClick={() => onFeedback(eventId, "down")}
        className={`text-[10px] leading-none ${rating === "down" ? "opacity-100" : "opacity-30 hover:opacity-70"}`}
        title="Bad response"
      >
        👎
      </button>
    </span>
  );
}

export function Transcript({
  lines,
  feedback,
  onFeedback,
}: {
  lines: TranscriptLine[];
  feedback: Record<string, FeedbackRating>;
  onFeedback: (eventId: string, rating: FeedbackRating) => void;
}) {
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
                {line.speaker === "jarvis" && line.eventId ? (
                  <FeedbackButtons eventId={line.eventId} rating={feedback[line.eventId]} onFeedback={onFeedback} />
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
