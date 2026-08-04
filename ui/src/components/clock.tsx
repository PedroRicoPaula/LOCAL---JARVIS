"use client";

import { useEffect, useState } from "react";
import { Panel } from "./panel";

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Starts null (server and first client render must match -- no
    // server-side "now" to agree on) and fills in async rather than a
    // synchronous setState call directly in the effect body.
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const timeStr = now?.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "--:--:--";
  const dateStr = now?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" }).toUpperCase() ?? "";

  return (
    <Panel className="shrink-0">
      <div className="text-[28px] font-mono font-light tracking-[0.1em] leading-none text-jarvis-text">{timeStr}</div>
      <div className="text-[9px] tracking-[0.2em] text-jarvis-dim mt-1">{dateStr}</div>
    </Panel>
  );
}
