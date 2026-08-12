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

export function GesturePanel({
  gestures,
  onSetBlur,
}: {
  gestures: GestureDashboardState;
  /** Absent in the idle/no-preview state -- nothing running to blur. */
  onSetBlur?: (enabled: boolean) => void;
}) {
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
  const [blurOn, setBlurOn] = useState(false);
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

  // Blur is server-side, per gesture-tracking session -- a fresh session
  // always starts unblurred, so the button shouldn't claim otherwise once
  // tracking stops (and possibly restarts later). Adjusted during render
  // on the active->inactive transition, React's own sanctioned pattern
  // for "reset state when a prop changes" -- an effect here would (per
  // the same lint rule applyPinch above was restructured to satisfy) be
  // a cascading-render smell.
  const [wasActive, setWasActive] = useState(gestures.active);
  if (gestures.active !== wasActive) {
    setWasActive(gestures.active);
    if (!gestures.active && blurOn) setBlurOn(false);
  }

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
        ) : gestures.pointerControlActive ? (
          // Preview is deliberately not generated while pointer control
          // runs (senses/eyes/gestures.py) -- using the real cursor
          // means looking at the real screen, not this panel, so
          // skipping the encode is a real CPU saving, not a bug.
          <div className="absolute inset-0 grid place-items-center text-[9px] text-jarvis-dim text-center px-4">
            Preview off to save CPU while pointer control is active.
            <br />
            The skeleton below still tracks live.
          </div>
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
        {gestures.pointerControlActive ? (
          <div className="absolute top-1 right-2 flex items-center gap-1 text-[8px] tracking-widest text-jarvis-green">
            <span className="rounded-full status-dot-active" style={{ width: 5, height: 5, background: "#00FF9F" }} />
            POINTER ON · HOLD SPACE TO CLICK
          </div>
        ) : null}
      </div>

      {/* Voice-armed, not a dashboard button -- a real click can land
          anywhere on the real screen, so turning it on is deliberately
          the same "say it" weight as arming hand tracking itself, not a
          casual toggle next to blur/theremin. */}
      <div className="mt-2 text-[9px] text-jarvis-dim">
        {gestures.pointerControlActive
          ? "Cursor follows your index finger. Press Space to click -- never a gesture or voice alone."
          : <>Say <span className="text-jarvis-cyan">&quot;point with my hand&quot;</span> to control the real cursor.</>}
      </div>

      <div className="mt-2 flex items-center justify-between text-[9px]">
        <span className="text-jarvis-dim">Pinch to drag a shape</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              const next = !blurOn;
              setBlurOn(next);
              onSetBlur?.(next);
            }}
            className={`px-2 py-1 border text-[9px] tracking-wider transition-colors ${
              blurOn ? "border-jarvis-green text-jarvis-green" : "border-jarvis-cyan/30 text-jarvis-dim hover:text-jarvis-cyan"
            }`}
          >
            {blurOn ? "BLUR BG ON" : "BLUR BG OFF"}
          </button>
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
      </div>
      {thereminOn ? (
        <div className="mt-1 text-[9px] text-jarvis-dim">Open palm, move up/down to play.</div>
      ) : null}
    </Panel>
  );
}
