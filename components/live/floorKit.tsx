"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type MouseEvent, type PointerEvent } from "react";

// What the two office floors (the admin Live Office and the HRM one) share:
// the projection that turns a floor plan into a view from above and to the
// side, a box drawn in it, and the camera that glides between the whole
// floor and one room and can be dragged about.

export type Rect = { x: number; y: number; w: number; h: number };

// One floor unit in pixels of the drawing, and the two axes of the projection.
export const U = 24;
const AX = U * 0.866;
const AY = U * 0.5;

export const pt = (x: number, y: number, z = 0): [number, number] => [(x - y) * AX, (x + y) * AY - z * U];
export const pts = (...p: [number, number, number][]) => p.map(([x, y, z]) => pt(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" ");

export function Block({ x, y, w, d, h, z = 0, cls }: { x: number; y: number; w: number; d: number; h: number; z?: number; cls: string }) {
  const t = z + h;
  return (
    <g className={cls}>
      <polygon className="lf-f1" points={pts([x, y + d, z], [x + w, y + d, z], [x + w, y + d, t], [x, y + d, t])} />
      <polygon className="lf-f2" points={pts([x + w, y, z], [x + w, y + d, z], [x + w, y + d, t], [x + w, y, t])} />
      <polygon className="lf-f0" points={pts([x, y, t], [x + w, y, t], [x + w, y + d, t], [x, y + d, t])} />
    </g>
  );
}

// The screen box of a floor rectangle with everything that stands on it up
// to `top` floor units high.
export function boxOf(x: number, y: number, w: number, d: number, pad: number, top = 2.9): Rect {
  const c = [pt(x, y, top), pt(x + w, y), pt(x, y + d), pt(x + w, y + d), pt(x + w, y, top), pt(x, y + d, top)];
  const xs = c.map((p) => p[0]);
  const ys = c.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
}

// The camera: `goal` is where it should rest, and it glides there. The view
// box is written straight to the SVG, frame by frame, so React does not
// render the floor sixty times a second.
export function useFloorCamera(goal: Rect) {
  const svgRef = useRef<SVGSVGElement>(null);
  const view = useRef<Rect | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const swallow = useRef(false);

  const apply = useCallback((b: Rect) => {
    const svg = svgRef.current;
    if (!svg) return;
    view.current = b;
    svg.setAttribute("viewBox", `${b.x.toFixed(2)} ${b.y.toFixed(2)} ${b.w.toFixed(2)} ${b.h.toFixed(2)}`);
    // Drawing units per screen pixel: labels are sized by it so that a room's
    // name reads the same from far and from near.
    const k = Math.max(b.w / (svg.clientWidth || 1), b.h / (svg.clientHeight || 1));
    svg.style.setProperty("--lf-k", k.toFixed(4));
  }, []);

  const { x: gx, y: gy, w: gw, h: gh } = goal;
  useLayoutEffect(() => {
    const to = { x: gx, y: gy, w: gw, h: gh };
    const from = view.current;
    if (!from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (at: number) => {
      const p = Math.min(1, (at - start) / 520);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      apply({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [gx, gy, gw, gh, apply]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (view.current) apply(view.current);
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [apply]);

  // The current view scaled about its middle: what "+" and "−" aim at.
  const scaled = useCallback(
    (f: number): Rect => {
      const b = view.current ?? { x: gx, y: gy, w: gw, h: gh };
      const w = b.w * f;
      const h = b.h * f;
      return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
    },
    [gx, gy, gw, gh],
  );

  // Dragging moves the floor; a drag must not also count as a press.
  const onPointerDown = useCallback((e: PointerEvent<SVGSVGElement>) => {
    if (e.button === 0) drag.current = { x: e.clientX, y: e.clientY, moved: false };
  }, []);
  const onPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      const b = view.current;
      const svg = svgRef.current;
      if (!d || !b || !svg) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      if (!d.moved) svg.setPointerCapture(e.pointerId);
      d.moved = true;
      d.x = e.clientX;
      d.y = e.clientY;
      const k = Math.max(b.w / (svg.clientWidth || 1), b.h / (svg.clientHeight || 1));
      apply({ ...b, x: b.x - dx * k, y: b.y - dy * k });
    },
    [apply],
  );
  const onPointerUp = useCallback(() => {
    swallow.current = !!drag.current?.moved;
    drag.current = null;
  }, []);
  const onClickCapture = useCallback((e: MouseEvent<SVGSVGElement>) => {
    if (!swallow.current) return;
    swallow.current = false;
    e.stopPropagation();
  }, []);

  return { svgRef, scaled, onPointerDown, onPointerMove, onPointerUp, onClickCapture };
}
