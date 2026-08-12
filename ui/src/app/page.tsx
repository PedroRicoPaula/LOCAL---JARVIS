"use client";

import dynamic from "next/dynamic";
import { ApprovalQueue } from "@/components/approval-queue";
import { Clock } from "@/components/clock";
import { AudioWaveform } from "@/components/audio-waveform";
import { ErrorLog } from "@/components/error-log";
import { GesturePanel } from "@/components/gesture-panel";
import { MetricsWidget } from "@/components/metrics-widget";
import { SkillHealthPanel } from "@/components/skill-health";
import { StatusBar } from "@/components/status-bar";
import { StorePanel } from "@/components/store-panel";
import { SystemStatus } from "@/components/system-status";
import { TestConsole } from "@/components/test-console";
import { ThoughtStream } from "@/components/thought-stream";
import { Timeline } from "@/components/timeline";
import { Transcript } from "@/components/transcript";
import { useJarvis } from "@/lib/use-jarvis";

// SSR'd, the Orb's SVG dot-ring positions (Math.cos/Math.sin over ~130
// circles) came back from the server with values differing from the
// client's own computation in the last float digit -- a real, if tiny,
// cross-runtime floating-point discrepancy (Node's V8 vs the browser's),
// not a bug in the trig itself. React's hydration is byte-exact, so even
// a last-bit `cy` mismatch fails it. The Orb's actual state only exists
// client-side anyway (driven by the WebSocket, unavailable during SSR),
// so there's nothing SSR was giving us here worth chasing float-rounding
// tricks to keep -- render it client-only instead.
const Orb = dynamic(() => import("@/components/orb").then((m) => m.Orb), {
  ssr: false,
  loading: () => <div style={{ width: 480, height: 480 + 48 }} />,
});

export default function Home() {
  const {
    connection,
    connectedSince,
    orbState,
    approvals,
    transcript,
    thoughts,
    events,
    skills,
    errors,
    system,
    tasks,
    shoppingItems,
    metrics,
    feedback,
    camera,
    gestures,
    audioLevels,
    decide,
    setGestureBlur,
    injectUtterance,
    sendFeedback,
    toggleTask,
    deleteTask,
    deleteShoppingItem,
  } = useJarvis();
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

        <div
          className="absolute inset-0 flex flex-col lg:flex-row gap-3 overflow-y-auto lg:overflow-hidden"
          style={{ padding: "28px 16px 8px 16px" }}
        >
          {/* LEFT — telemetry. `overflow-y-auto`: SOAK 1 added Metrics on
              top of the existing four panels, and the column's natural
              height can now exceed the viewport -- found live, this scrolls
              instead of silently clipping whatever's last (was Timeline). */}
          <div className="flex flex-col gap-3 min-w-0 min-h-0 lg:overflow-y-auto w-full lg:w-[22%]">
            <Clock />
            <AudioWaveform levels={audioLevels} />
            <SystemStatus system={system} />
            <div className="shrink-0">
              <SkillHealthPanel skills={skills} />
            </div>
            <MetricsWidget metrics={metrics} />
            <Timeline events={events} />
          </div>

          {/* CENTER — orb + live activity */}
          <div className="flex flex-col items-center lg:flex-1 min-w-0 gap-3 pt-2 min-h-0 shrink-0">
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

          {/* RIGHT — approvals + live data + conversation. Same
              `overflow-y-auto` safety net as LEFT, now that `StorePanel`
              sits between the two existing panels. */}
          <div className="flex flex-col gap-3 min-w-0 min-h-0 lg:overflow-y-auto w-full lg:w-[26%]">
            <div className="flex flex-col min-h-0 shrink-0 lg:max-h-[32%]">
              <ApprovalQueue approvals={approvals} onDecide={decide} />
            </div>
            <GesturePanel gestures={gestures} onSetBlur={setGestureBlur} />
            <StorePanel
              tasks={tasks}
              shoppingItems={shoppingItems}
              onToggleTask={toggleTask}
              onDeleteTask={deleteTask}
              onDeleteItem={deleteShoppingItem}
            />
            <Transcript lines={transcript} feedback={feedback} onFeedback={sendFeedback} />
          </div>
        </div>
      </div>

      <TestConsole onSubmit={injectUtterance} />
      <StatusBar connection={connection} connectedSince={connectedSince} camera={camera} />
    </div>
  );
}
