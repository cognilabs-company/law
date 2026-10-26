"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { RA_MARK_TTL_MS, markAlive, markOpacity, type RaMark } from "@/lib/remoteAssist/marks";

// The drawn marks of remote assistance v2, painted in px over a box (the
// client's whole viewport, or the operator's picture of it). Each mark lives
// RA_MARK_TTL_MS: a quick fade-in, a soft fade-out, then it is removed.
// Pointer events never reach it.

export type LiveMark = { mark: RaMark; born: number };

export function useMarks(): { marks: LiveMark[]; add: (m: RaMark) => void; clear: () => void } {
  const [marks, setMarks] = useState<LiveMark[]>([]);
  const add = useCallback((mark: RaMark) => {
    setMarks((cur) => [...cur.filter((x) => x.mark.id !== mark.id && markAlive(x.born, Date.now())).slice(-30), { mark, born: Date.now() }]);
  }, []);
  const clear = useCallback(() => setMarks([]), []);
  // Prune what has faded, a little after it has.
  useEffect(() => {
    if (!marks.length) return;
    const next = Math.min(...marks.map((x) => x.born)) + RA_MARK_TTL_MS + 30 - Date.now();
    const id = setTimeout(() => setMarks((cur) => cur.filter((x) => markAlive(x.born, Date.now()))), Math.max(16, next));
    return () => clearTimeout(id);
  }, [marks]);
  return { marks, add, clear };
}

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Shape({ m, w, h }: { m: RaMark; w: number; h: number }): ReactElement | null {
  const pts = m.points.map(([x, y]) => [x * w, y * h] as const);
  if (m.tool === "pointer") {
    const [x, y] = pts[0];
    return (
      <g className="ra-mk__ptr" transform={`translate(${x} ${y})`}>
        <circle r={18} className="ra-mk__halo" />
        <circle r={7} className="ra-mk__dot" />
      </g>
    );
  }
  if (m.tool === "pen") return <polyline points={pts.map(([x, y]) => `${x},${y}`).join(" ")} className="ra-mk__line" />;
  const [[x1, y1], [x2, y2]] = pts;
  if (m.tool === "rect") return <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} rx={6} className="ra-mk__line" />;
  if (m.tool === "circle") return <ellipse cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={Math.abs(x2 - x1) / 2} ry={Math.abs(y2 - y1) / 2} className="ra-mk__line" />;
  // arrow: shaft + a head that keeps its size whatever the box
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = 16;
  const hx = (a: number) => x2 - head * Math.cos(ang + a);
  const hy = (a: number) => y2 - head * Math.sin(ang + a);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="ra-mk__line" />
      <polyline points={`${hx(0.45)},${hy(0.45)} ${x2},${y2} ${hx(-0.45)},${hy(-0.45)}`} className="ra-mk__line" />
    </g>
  );
}

// `fixed`: the whole viewport (client). Otherwise it fills its positioned
// parent, offset to the picture's content box (`box`).
// `draft`: the mark being drawn right now, shown solid until it is sent.
export function RaMarkLayer({ marks, fixed = false, box, draft = null }: { marks: LiveMark[]; fixed?: boolean; box?: { x: number; y: number; w: number; h: number }; draft?: RaMark | null }): ReactElement | null {
  const ref = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [now, setNow] = useState(() => Date.now());
  const reduced = reducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Redraw while anything is fading.
  useEffect(() => {
    if (!marks.length || reduced) return;
    let raf = 0;
    const loop = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [marks.length, reduced]);

  const w = box ? box.w : size.w;
  const h = box ? box.h : size.h;
  return (
    <svg
      ref={ref}
      className={`ra-mk${fixed ? " ra-mk--fixed" : ""}`}
      style={box ? { left: box.x, top: box.y, width: box.w, height: box.h } : undefined}
      aria-hidden="true"
      data-ra-ignore=""
      data-ai-ignore=""
    >
      {w && h
        ? marks.map(({ mark, born }) => (
            <g key={mark.id} className={`ra-mk__g ra-mk--${mark.color}`} style={{ opacity: reduced ? 1 : markOpacity(Math.max(0, now - born), false) }} data-tool={mark.tool}>
              <Shape m={mark} w={w} h={h} />
            </g>
          ))
        : null}
      {w && h && draft ? (
        <g className={`ra-mk__g ra-mk--${draft.color} ra-mk__draft`} data-tool={draft.tool}>
          <Shape m={draft} w={w} h={h} />
        </g>
      ) : null}
    </svg>
  );
}
