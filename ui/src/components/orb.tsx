"use client";

/**
 * ui/src/components/orb.tsx — ported from the owner's Figma reference
 * (`~/Developer/Programação/JARVIS Desktop Interface Design/src/App.tsx`)
 * near-verbatim (the SVG dot-ring math is pure, framework-agnostic). The
 * only real change: `state` is a live `OrbState` driven by real signals
 * from `core` (`senses/ears` arming the mic, an utterance landing in the
 * dispatch loop, `senses/voice` actually producing audio) instead of a
 * hardcoded `useState("READY")`.
 */

import type { OrbState } from "@/lib/use-jarvis";

const STATE_COLOR: Record<OrbState, string> = {
  idle: "#00D4FF",
  listening: "#00FF9F",
  thinking: "#FFB84D",
  speaking: "#00D4FF",
};

const STATE_LABEL: Record<OrbState, string> = {
  idle: "READY",
  listening: "LISTENING…",
  thinking: "THINKING…",
  speaking: "SPEAKING…",
};

// radius, dot count, dot radius, base opacity, animation speed (s), phase offset (s)
const DOT_RINGS = [
  { r: 14, count: 8, dotR: 2.0, opacity: 0.95, speed: 2.8, phase: 0 },
  { r: 32, count: 16, dotR: 1.7, opacity: 0.75, speed: 3.6, phase: 0.4 },
  { r: 54, count: 26, dotR: 1.4, opacity: 0.55, speed: 4.2, phase: 0.8 },
  { r: 80, count: 36, dotR: 1.1, opacity: 0.38, speed: 5.0, phase: 1.2 },
  { r: 108, count: 48, dotR: 0.9, opacity: 0.24, speed: 5.8, phase: 1.6 },
] as const;

export function Orb({ state }: { state: OrbState }) {
  const color = STATE_COLOR[state];
  const active = state === "listening" || state === "thinking";
  const cx = 120;
  const cy = 120;
  const size = 240;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size,
            height: size,
            background: `radial-gradient(circle at 50% 50%, ${color}22 0%, ${color}10 28%, ${color}05 50%, transparent 72%)`,
            animation: `orb-pulse ${active ? 1.4 : 3.2}s ease-in-out infinite`,
          }}
        />
        <svg width={size} height={size} className="absolute inset-0" style={{ overflow: "visible" }}>
          <defs>
            <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="60%" stopColor={color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
            <filter id="dot-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="1.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="core-filter" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {DOT_RINGS.map((ring, ri) => (
            <g key={ri}>
              {Array.from({ length: ring.count }, (_, i) => {
                const angle = (2 * Math.PI * i) / ring.count;
                const x = cx + ring.r * Math.cos(angle);
                const y = cy + ring.r * Math.sin(angle);
                const dotDelay = ring.phase + (i / ring.count) * 0.6;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={ring.dotR}
                    fill={color}
                    opacity={ring.opacity}
                    filter="url(#dot-glow)"
                    style={{ animation: `orb-pulse ${ring.speed}s ease-in-out ${dotDelay}s infinite` }}
                  />
                );
              })}
            </g>
          ))}

          <circle cx={cx} cy={cy} r={4} fill="url(#core-glow)" filter="url(#core-filter)" />
          <circle cx={cx} cy={cy} r={2} fill={color} opacity={1} />
        </svg>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span
          className="rounded-full status-dot-active"
          style={{ width: 6, height: 6, background: color, boxShadow: `0 0 8px ${color}` }}
        />
        <span
          className="text-[16px] font-mono font-light tracking-[0.3em]"
          style={{ color, textShadow: `0 0 20px ${color}60` }}
        >
          {STATE_LABEL[state]}
        </span>
        <span className="cursor-blink text-[16px] font-mono font-light" style={{ color }}>
          _
        </span>
      </div>
    </div>
  );
}
