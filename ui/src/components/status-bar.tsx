"use client";

import { useEffect, useState } from "react";
import type { CameraDashboardState, ConnectionState, SenseConnections } from "@/lib/use-jarvis";

const CONNECTION_LABEL: Record<ConnectionState, { text: string; color: string }> = {
  open: { text: "CONNECTED", color: "#00D4FF" },
  connecting: { text: "CONNECTING…", color: "#FFB84D" },
  closed: { text: "DISCONNECTED", color: "#FF5D5D" },
};

function sessionUptime(connectedSince: number | null, now: number): string {
  if (connectedSince === null) return "--:--:--";
  const secs = Math.max(0, Math.floor((now - connectedSince) / 1000));
  const h = String(Math.floor(secs / 3600)).padStart(2, "0");
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** ARMED never means recording (SPEC.md § 6) -- this label is only ever
 * "idle" or "armed", ticking down to the real `expiresAt` `eyes` itself
 * reported, not a guessed countdown. */
function cameraLabel(camera: CameraDashboardState, now: number): { text: string; color: string } {
  if (camera.state === "idle") return { text: "CAMERA: IDLE", color: "" };
  const secsLeft = camera.expiresAt !== null ? Math.max(0, Math.ceil((camera.expiresAt - now) / 1000)) : null;
  const text = secsLeft !== null ? `CAMERA: ARMED · ${secsLeft}s` : "CAMERA: ARMED";
  return { text, color: "#00D4FF" };
}

/** `core` has broadcast `sense.connection` since ADR-051's reconnect
 * work, specifically so a dropped `ears`/`voice`/`eyes` would stop being
 * invisible from the dashboard -- but nothing rendered it until
 * 2026-08-17, so it stayed invisible anyway. A sense nothing has been
 * heard about yet (`null`) is drawn dim rather than as a failure: "not
 * reported yet" and "down" are different, and claiming the second when
 * it's the first is the kind of confidently-wrong signal CLAUDE.md § 6
 * is about. */
function SenseDots({ senses }: { senses: SenseConnections }) {
  const entries: [string, boolean | null][] = [
    ["EARS", senses.ears],
    ["VOICE", senses.voice],
    ["EYES", senses.eyes],
  ];
  return (
    <span className="flex items-center gap-2" data-testid="sense-connections">
      {entries.map(([label, up]) => {
        const color = up === null ? "#5A6B7C" : up ? "#00D4FF" : "#FF5D5D";
        return (
          <span key={label} className="flex items-center gap-1" title={up === null ? `${label}: no report yet` : `${label}: ${up ? "connected" : "disconnected"}`}>
            <span
              className="inline-block rounded-full"
              style={{ width: 4, height: 4, background: color, boxShadow: up ? `0 0 4px ${color}` : "none" }}
            />
            <span style={{ color }}>{label}</span>
          </span>
        );
      })}
    </span>
  );
}

export function StatusBar({
  connection,
  connectedSince,
  camera,
  senses,
}: {
  connection: ConnectionState;
  connectedSince: number | null;
  camera: CameraDashboardState;
  senses: SenseConnections;
}) {
  const { text, color } = CONNECTION_LABEL[connection];
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cameraStatus = cameraLabel(camera, now);

  return (
    <div
      className="flex items-center justify-between px-4 shrink-0"
      style={{ height: 36, borderTop: "1px solid rgba(0,212,255,0.18)", background: "rgba(5,8,15,0.9)" }}
    >
      <div className="flex items-center gap-4 text-[11px] font-mono tracking-widest">
        <span className="flex items-center gap-1">
          <span className="inline-block rounded-full status-dot-active" style={{ width: 4, height: 4, background: color, boxShadow: `0 0 4px ${color}` }} />
          <span style={{ color }}>CORE: {text}</span>
        </span>
        <span className="text-jarvis-dim">·</span>
        <SenseDots senses={senses} />
        <span className="text-jarvis-dim">·</span>
        <span className="text-jarvis-dim" style={cameraStatus.color ? { color: cameraStatus.color } : undefined} data-testid="camera-status">
          {cameraStatus.text}
        </span>
        <span className="text-jarvis-dim">·</span>
        <span className="text-jarvis-dim">
          SESSION <span className="text-jarvis-text">{sessionUptime(connectedSince, now)}</span>
        </span>
      </div>
      <div className="flex items-center gap-4 text-[11px] font-mono text-jarvis-dim tracking-widest">
        <span>JARVIS DASHBOARD</span>
      </div>
    </div>
  );
}
