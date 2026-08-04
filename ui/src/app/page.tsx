"use client";

import { ApprovalQueue } from "@/components/approval-queue";
import { Clock } from "@/components/clock";
import { ErrorLog } from "@/components/error-log";
import { Orb } from "@/components/orb";
import { SkillHealthPanel } from "@/components/skill-health";
import { StatusBar } from "@/components/status-bar";
import { ThoughtStream } from "@/components/thought-stream";
import { Timeline } from "@/components/timeline";
import { Transcript } from "@/components/transcript";
import { useJarvis } from "@/lib/use-jarvis";

export default function Home() {
  const { connection, connectedSince, orbState, approvals, transcript, thoughts, events, skills, errors, decide } = useJarvis();
  const lastOwnerLine = [...transcript].reverse().find((l) => l.speaker === "owner");

  return (
    <div className="relative h-full flex flex-col select-none">
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="absolute left-0 right-0 h-px pointer-events-none scan-line" style={{ zIndex: 10 }} />

        <div className="absolute top-3 left-3 text-[9px] text-jarvis-dim tracking-wider opacity-60">
          <div>JARVIS</div>
          <div>PHASE 7 · DASHBOARD</div>
        </div>
        <div className="absolute top-3 right-3 text-[9px] text-jarvis-dim tracking-wider opacity-60 text-right">
          <div>{process.env["NEXT_PUBLIC_JARVIS_CORE_URL"] ?? "http://localhost:8787"}</div>
        </div>

        <div className="absolute inset-0 flex gap-3" style={{ padding: "28px 16px 8px 16px" }}>
          {/* LEFT — telemetry */}
          <div className="flex flex-col gap-3 min-w-0" style={{ width: "22%" }}>
            <Clock />
            <div className="shrink-0">
              <SkillHealthPanel skills={skills} />
            </div>
            <Timeline events={events} />
          </div>

          {/* CENTER — orb + live activity */}
          <div className="flex flex-col items-center flex-1 min-w-0 gap-4 pt-2">
            {lastOwnerLine ? (
              <div className="text-[11px] font-mono text-jarvis-dim opacity-60 truncate max-w-full text-center">
                <span className="text-jarvis-cyan opacity-50 mr-1">›</span>
                {lastOwnerLine.text}
              </div>
            ) : null}

            <Orb state={orbState} />

            <ErrorLog errors={errors} />

            <ThoughtStream thoughts={thoughts} />
          </div>

          {/* RIGHT — approvals + conversation */}
          <div className="flex flex-col gap-3 min-w-0" style={{ width: "26%" }}>
            <div style={{ maxHeight: "40%" }} className="flex flex-col min-h-0 shrink-0">
              <ApprovalQueue approvals={approvals} onDecide={decide} />
            </div>
            <Transcript lines={transcript} />
          </div>
        </div>
      </div>

      <StatusBar connection={connection} connectedSince={connectedSince} />
    </div>
  );
}
