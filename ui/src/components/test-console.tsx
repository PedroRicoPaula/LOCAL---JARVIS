"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** SOAK 1: types a line and feeds it into `core`'s real utterance-handling
 * path (`ClientEvent` "utterance.inject") -- indistinguishable from a
 * transcribed one once it lands, so this is a way to generate real usage
 * data without needing a working mic every time (see `core/main.ts`'s
 * `handleUtterance` docstring). */
export function TestConsole({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");

  function submit(): void {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue("");
  }

  return (
    <div className="shrink-0 border-t border-jarvis-cyan/20 bg-black/40 px-4 py-2 flex items-center gap-2">
      <span className="text-[9px] tracking-widest text-jarvis-dim uppercase shrink-0">Test console</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Type an utterance as if spoken…"
        className="flex-1 bg-transparent border border-white/10 focus:border-jarvis-cyan/40 outline-none text-[11px] text-jarvis-text px-2 py-1 font-mono rounded-none"
      />
      <Button size="xs" onClick={submit}>
        Send
      </Button>
    </div>
  );
}
