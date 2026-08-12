"use client";

/**
 * ui/src/components/gesture-panel.tsx — the live camera feed with a hand
 * skeleton drawn over it, plus two things the owner can actually *do*
 * with their hands.
 *
 * The preview image and the skeleton are deliberately separate layers:
 * the image arrives at ~4fps (it's the expensive part, base64 over a
 * socket) while landmarks arrive at ~12fps, so drawing the skeleton
 * browser-side keeps hand movement smooth even between preview frames.
 *
 * All the real logic (pinch detection, note mapping) lives in
 * `ui/src/lib/hand.ts` so it's testable without a browser -- this file
 * is rendering and Web Audio wiring.
 */

import { useEffect, useRef, useState } from "react";
import { Panel } from "./panel";
import { applyPinch, HAND_CONNECTIONS, isOpenPalm, isPinching, noteForY, pinchPoint, type Shape } from "@/lib/hand";
import type { GestureDashboardState } from "@/lib/use-jarvis";

const INITIAL_SHAPES: Shape[] = [
  { id: "a", x: 0.25, y: 0.3, color: "#00D4FF", label: "◆" },
  { id: "b", x: 0.5, y: 0.6, color: "#FFB84D", label: "●" },
  { id: "c", x: 0.75, y: 0.35, color: "#00FF9F", label: "▲" },
];

function HandSkeleton({ hand, color }: { hand: GestureDashboardState["hands"][number]; color: string }) {
  return (
    <g>
      {HAND_CONNECTIONS.map(([a, b], i) => {
        const from = hand.landmarks[a];
        const to = hand.landmarks[b];
        if (!from || !to) return null;
        return (
          <line
            key={i}
            x1={`${from.x * 100}%`}
            y1={`${from.y * 100}%`}
            x2={`${to.x * 100}%`}
            y2={`${to.y * 100}%`}
            stroke={color}
            strokeWidth={1.5}
            opacity={0.7}
          />
        );
      })}
      {hand.landmarks.map((lm, i) => (
        <circle
          key={i}
          cx={`${lm.x * 100}%`}
          cy={`${lm.y * 100}%`}
          r={i === 4 || i === 8 ? 4 : 2.5}
          fill={color}
          opacity={i === 4 || i === 8 ? 1 : 0.75}
        />
      ))}
    </g>
  );
}

export function GesturePanel({ gestures }: { gestures: GestureDashboardState }) {
  // One piece of state, updated during render from the incoming landmark
  // frame -- not a `useEffect`. Dragging is a pure function of "where is
  // the pinch now" plus "what was already held"; React's own
  // derive-during-render pattern fits it exactly, and an effect here
  // would (rightly, per the lint rule) be a cascading-render smell.
  const [drag, setDrag] = useState<{ shapes: Shape[]; grabbedId: string | null }>({
    shapes: INITIAL_SHAPES,
    grabbedId: null,
  });
  const [thereminOn, setThereminOn] = useState(false);
  const audioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);

  const hand = gestures.hands[0] ?? null;
  const pinching = hand ? isPinching(hand) : false;
  const openPalm = hand ? isOpenPalm(hand) : false;
  const grabPoint = hand ? pinchPoint(hand) : null;

  const next = applyPinch(drag, pinching ? grabPoint : null);
  if (next !== drag) setDrag(next);
  const { shapes, grabbedId } = next;

  // --- open palm plays a note ------------------------------------------
  useEffect(() => {
    if (!thereminOn || !openPalm || !hand) {
      audioRef.current?.gain.gain.setTargetAtTime(0, audioRef.current.ctx.currentTime, 0.05);
      return;
    }
    const indexTip = hand.landmarks[8];
    if (!indexTip) return;

    if (!audioRef.current) {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      gain.gain.value = 0;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      audioRef.current = { ctx, osc, gain };
    }
    const { ctx, osc, gain } = audioRef.current;
    osc.frequency.setTargetAtTime(noteForY(indexTip.y), ctx.currentTime, 0.05);
    gain.gain.setTargetAtTime(0.12, ctx.currentTime, 0.05);
  }, [thereminOn, openPalm, hand]);

  useEffect(() => {
    return () => {
      audioRef.current?.osc.stop();
      audioRef.current?.ctx.close();
      audioRef.current = null;
    };
  }, []);

  if (!gestures.active) {
    return (
      <Panel title="Hand tracking" className="shrink-0" flat>
        <div className="text-[10px] text-jarvis-dim leading-relaxed">
          Say <span className="text-jarvis-cyan">&quot;turn on hand tracking&quot;</span> to see the camera here.
          {gestures.lastStoppedCause === "idle" ? (
            <div className="mt-1 text-jarvis-amber">Stopped: no hand seen for a while.</div>
          ) : null}
          {gestures.lastStoppedCause === "error" ? (
            <div className="mt-1 text-jarvis-amber">Stopped: the camera failed.</div>
          ) : null}
        </div>
      </Panel>
    );
  }

  const handColor = pinching ? "#FFB84D" : openPalm ? "#00FF9F" : "#00D4FF";

  return (
    <Panel title="Hand tracking" className="shrink-0" flat>
      <div className="relative w-full aspect-video bg-black/60 overflow-hidden border border-jarvis-cyan/10">
        {gestures.previewImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- a live base64 frame, not a static asset next/image can optimize
          <img
            src={`data:image/jpeg;base64,${gestures.previewImage}`}
            alt="camera preview"
            className="absolute inset-0 w-full h-full object-cover opacity-70"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[9px] text-jarvis-dim">waiting for camera…</div>
        )}

        <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
          {shapes.map((s) => (
            <g key={s.id}>
              <circle
                cx={`${s.x * 100}%`}
                cy={`${s.y * 100}%`}
                r={16}
                fill={s.color}
                opacity={grabbedId === s.id ? 0.35 : 0.18}
                stroke={s.color}
                strokeWidth={1}
              />
              <text
                x={`${s.x * 100}%`}
                y={`${s.y * 100}%`}
                textAnchor="middle"
                dominantBaseline="central"
                fill={s.color}
                fontSize={14}
              >
                {s.label}
              </text>
            </g>
          ))}
          {gestures.hands.map((h, i) => (
            <HandSkeleton key={i} hand={h} color={handColor} />
          ))}
        </svg>

        <div className="absolute bottom-1 left-2 text-[8px] tracking-widest text-jarvis-dim">
          {gestures.hands.length === 0 ? "NO HAND" : pinching ? "PINCH" : openPalm ? "OPEN PALM" : "TRACKING"}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[9px]">
        <span className="text-jarvis-dim">Pinch to drag a shape</span>
        <button
          type="button"
          onClick={() => setThereminOn((v) => !v)}
          className={`px-2 py-1 border text-[9px] tracking-wider transition-colors ${
            thereminOn ? "border-jarvis-green text-jarvis-green" : "border-jarvis-cyan/30 text-jarvis-dim hover:text-jarvis-cyan"
          }`}
        >
          {thereminOn ? "THEREMIN ON" : "THEREMIN OFF"}
        </button>
      </div>
      {thereminOn ? (
        <div className="mt-1 text-[9px] text-jarvis-dim">Open palm, move up/down to play.</div>
      ) : null}
    </Panel>
  );
}
