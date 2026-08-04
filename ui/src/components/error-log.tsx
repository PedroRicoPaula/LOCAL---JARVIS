import type { JarvisError } from "@/lib/use-jarvis";
import { Panel } from "./panel";

export function ErrorLog({ errors }: { errors: JarvisError[] }) {
  if (errors.length === 0) return null;
  return (
    <Panel title={`Errors (${errors.length})`} className="border-red-500/40 shrink-0">
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {[...errors].reverse().map((e, i) => (
          <div key={i} className="fade-in-up text-[9px] leading-snug">
            <span className="text-jarvis-dim">{new Date(e.ts).toLocaleTimeString("en-US", { hour12: false })} </span>
            <span className="text-red-400">{e.message}</span>
            {e.detail ? <div className="text-jarvis-dim pl-2">{e.detail}</div> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}
