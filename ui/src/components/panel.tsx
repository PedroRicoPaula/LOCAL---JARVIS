import type { ReactNode } from "react";

function CornerBracket({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const size = 8;
  const styles: Record<string, React.CSSProperties> = {
    tl: { top: 0, left: 0, borderTop: "1px solid #00D4FF", borderLeft: "1px solid #00D4FF", width: size, height: size },
    tr: { top: 0, right: 0, borderTop: "1px solid #00D4FF", borderRight: "1px solid #00D4FF", width: size, height: size },
    bl: { bottom: 0, left: 0, borderBottom: "1px solid #00D4FF", borderLeft: "1px solid #00D4FF", width: size, height: size },
    br: {
      bottom: 0,
      right: 0,
      borderBottom: "1px solid #00D4FF",
      borderRight: "1px solid #00D4FF",
      width: size,
      height: size,
    },
  };
  return <div className="absolute" style={styles[position]} />;
}

export function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative border border-jarvis-cyan/20 bg-black/40 backdrop-blur-[2px] px-4 py-3 ${className}`}
    >
      <CornerBracket position="tl" />
      <CornerBracket position="tr" />
      <CornerBracket position="bl" />
      <CornerBracket position="br" />
      {title ? <div className="text-[9px] tracking-[0.2em] text-jarvis-dim uppercase mb-3">{title}</div> : null}
      {children}
    </div>
  );
}
