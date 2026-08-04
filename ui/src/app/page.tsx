"use client";

import { ApprovalQueue } from "@/components/approval-queue";
import { SkillHealthPanel } from "@/components/skill-health";
import { StatusBar } from "@/components/status-bar";
import { ThoughtStream } from "@/components/thought-stream";
import { Timeline } from "@/components/timeline";
import { Transcript } from "@/components/transcript";
import { useJarvis } from "@/lib/use-jarvis";

export default function Home() {
  const { connection, approvals, transcript, thoughts, events, skills, decide } = useJarvis();

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex gap-3 p-4">
        <div className="flex flex-col gap-3" style={{ width: "26%" }}>
          <Timeline events={events} />
        </div>

        <div className="flex flex-col gap-3" style={{ width: "24%" }}>
          <ThoughtStream thoughts={thoughts} />
          <div className="shrink-0">
            <SkillHealthPanel skills={skills} />
          </div>
        </div>

        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div style={{ maxHeight: "40%" }} className="flex flex-col min-h-0">
            <ApprovalQueue approvals={approvals} onDecide={decide} />
          </div>
          <Transcript lines={transcript} />
        </div>
      </div>
      <StatusBar connection={connection} />
    </div>
  );
}
