"use client";

/**
 * ui/src/components/audio-waveform.tsx — real microphone level, not a
 * decorative animation.
 *
 * The Figma reference had a waveform whose bars were driven by
 * `Math.random()`. This one is driven by real per-frame RMS from
 * `senses/ears` (`audio_level.py`), relayed through `core` -- so it goes
 * flat when the room is quiet and moves when the owner actually speaks.
 * "Seeing JARVIS work," for the listening half of the system.
 */

import { Panel } from "./panel";

const BAR_COUNT = 32;

export function AudioWaveform({ levels }: { levels: number[] }) {
  // Right-align the history so the newest sample is always at the same
  // edge, padding with silence when there isn't a full window yet.
  const padded = [...Array<number>(Math.max(0, BAR_COUNT - levels.length)).fill(0), ...levels.slice(-BAR_COUNT)];
  const peak = Math.max(...padded, 0);

  return (
    <Panel title="Audio Input">
      <div className="flex items-end gap-[2px] h-8">
        {padded.map((level, i) => (
          <div
            key={i}
            className="flex-1 rounded-full transition-[height] duration-100 ease-out"
            style={{
              // A floor of 2px so the bar row stays visible (and reads as
              // "listening, silent") rather than disappearing entirely.
              height: `${Math.max(2, level * 32)}px`,
              background: level > 0.6 ? "#00FF9F" : "#00D4FF",
              opacity: 0.35 + level * 0.65,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] tracking-wider text-jarvis-dim">
        <span>{peak > 0.05 ? "SIGNAL" : "QUIET"}</span>
        <span className="text-jarvis-cyan">{Math.round(peak * 100)}%</span>
      </div>
    </Panel>
  );
}
