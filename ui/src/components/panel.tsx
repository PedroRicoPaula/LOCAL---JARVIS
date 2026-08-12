"use client";

import { useRef, useState, type ReactNode } from "react";

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

/** Max tilt in degrees. Deliberately small -- this is a subtle sense of
 * depth on a dense information display, not a novelty card flip; a large
 * angle makes small text genuinely harder to read. */
const MAX_TILT_DEG = 4;

export function Panel({
  title,
  children,
  className = "",
  /** Opt out of the tilt for panels where a moving surface would fight
   * the content (e.g. one the owner is aiming a hand at). */
  flat = false,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (flat) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // -0.5..0.5 from the panel's own centre, so the tilt follows the
    // cursor's position *within this panel*, not the page.
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * MAX_TILT_DEG * 2, y: px * MAX_TILT_DEG * 2 });
  }

  return (
    <div style={{ perspective: 900 }} className={className}>
      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        className="panel-3d relative h-full border border-jarvis-cyan/20 bg-black/40 backdrop-blur-[2px] px-4 py-3"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          // Glow follows the tilt so the panel reads as catching light
          // from where the cursor is, rather than just skewing.
          boxShadow:
            tilt.x === 0 && tilt.y === 0
              ? "none"
              : `${-tilt.y * 2}px ${tilt.x * 2}px 24px -12px rgba(0, 212, 255, 0.35)`,
        }}
      >
        <CornerBracket position="tl" />
        <CornerBracket position="tr" />
        <CornerBracket position="bl" />
        <CornerBracket position="br" />
        {title ? <div className="text-[10px] tracking-[0.2em] text-jarvis-dim uppercase mb-3">{title}</div> : null}
        {children}
      </div>
    </div>
  );
}
