import type { ConnectionState } from "@/lib/use-jarvis";

const CONNECTION_LABEL: Record<ConnectionState, { text: string; color: string }> = {
  open: { text: "CONNECTED", color: "#00D4FF" },
  connecting: { text: "CONNECTING…", color: "#FFB84D" },
  closed: { text: "DISCONNECTED", color: "#FF5D5D" },
};

export function StatusBar({ connection }: { connection: ConnectionState }) {
  const { text, color } = CONNECTION_LABEL[connection];
  return (
    <div
      className="flex items-center justify-between px-4 shrink-0"
      style={{ height: 36, borderTop: "1px solid rgba(0,212,255,0.18)", background: "rgba(5,8,15,0.9)" }}
    >
      <div className="flex items-center gap-4 text-[9px] font-mono tracking-widest">
        <span className="flex items-center gap-1">
          <span className="inline-block rounded-full status-dot-active" style={{ width: 4, height: 4, background: color, boxShadow: `0 0 4px ${color}` }} />
          <span style={{ color }}>CORE: {text}</span>
        </span>
        <span className="text-jarvis-dim">·</span>
        <span className="text-jarvis-dim">
          CAMERA: <span className="text-jarvis-dim">IDLE</span>
        </span>
      </div>
      <div className="flex items-center gap-4 text-[9px] font-mono text-jarvis-dim tracking-widest">
        <span>JARVIS DASHBOARD</span>
      </div>
    </div>
  );
}
