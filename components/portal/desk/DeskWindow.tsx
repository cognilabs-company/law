"use client";

import { useRef, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { IconClose, IconMinus } from "@/components/icons";

export type Snap = "" | "l" | "r" | "max";
export type Win = {
  id: string;
  kind: "app" | "folder";
  key: string;
  href: string;
  // Where the page in the window is now (it can be navigated inside).
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  min: boolean;
  snap: Snap;
  // Bumped to reload the page in the window.
  tick: number;
};
export type Area = { w: number; h: number };
export const MIN_W = 380;
export const MIN_H = 260;
const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type Edge = (typeof EDGES)[number];

// Where a window stands: its own box, or the half or whole of the desk it
// was snapped to.
export function boxOf(w: Win, area: Area) {
  if (w.snap === "max") return { x: 0, y: 0, w: area.w, h: area.h };
  if (w.snap === "l") return { x: 0, y: 0, w: Math.round(area.w / 2), h: area.h };
  if (w.snap === "r") return { x: Math.round(area.w / 2), y: 0, w: area.w - Math.round(area.w / 2), h: area.h };
  return { x: w.x, y: w.y, w: w.w, h: w.h };
}

// The snap a pointer at the desk's edge asks for.
export function snapAt(px: number, py: number, area: Area): Snap {
  if (py <= 2) return "max";
  if (px <= 4) return "l";
  if (px >= area.w - 4) return "r";
  return "";
}

// One window: a title bar to drag (to an edge of the desk to snap it, to
// the top to fill it), edges and corners to resize, and the three buttons.
// Double-clicking the title bar fills the desk or gives the window back.
export default function DeskWindow({
  win,
  area,
  active,
  title,
  icon,
  tools,
  labels,
  phone,
  onFocus,
  onChange,
  onClose,
  onMenu,
  onBusy,
  onSnapHint,
  children,
}: {
  win: Win;
  area: Area;
  active: boolean;
  title: string;
  icon: ReactNode;
  tools?: ReactNode;
  labels: { minimize: string; maximize: string; restore: string; close: string };
  phone: boolean;
  onFocus: () => void;
  onChange: (patch: Partial<Win>) => void;
  onClose: () => void;
  onMenu: (e: MouseEvent) => void;
  onBusy: (busy: boolean) => void;
  onSnapHint: (snap: Snap) => void;
  children: ReactNode;
}) {
  const box = phone ? { x: 0, y: 0, w: area.w, h: area.h } : boxOf(win, area);
  const drag = useRef<{ kind: "move" | Edge; sx: number; sy: number; box: { x: number; y: number; w: number; h: number }; snap: Snap; id: number } | null>(null);
  const full = phone || win.snap === "max";

  const begin = (e: PointerEvent<HTMLElement>, kind: "move" | Edge) => {
    if (e.button !== 0 || phone) return;
    onFocus();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    let start = box;
    // A snapped window dragged away gets its own size back, under the pointer.
    if (kind === "move" && win.snap) {
      const rel = (e.clientX - box.x) / box.w;
      start = { x: Math.round(e.clientX - win.w * rel), y: 0, w: win.w, h: win.h };
      onChange({ snap: "", x: start.x, y: start.y });
    }
    drag.current = { kind, sx: e.clientX, sy: e.clientY, box: start, snap: "", id: e.pointerId };
    onBusy(true);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    const b = d.box;
    if (d.kind === "move") {
      const x = Math.min(area.w - 80, Math.max(80 - b.w, b.x + dx));
      const y = Math.min(area.h - 40, Math.max(0, b.y + dy));
      onChange({ x, y });
      const rect = e.currentTarget.closest(".wd-desk")?.getBoundingClientRect();
      const snap = rect ? snapAt(e.clientX - rect.left, e.clientY - rect.top, area) : "";
      if (snap !== d.snap) {
        d.snap = snap;
        onSnapHint(snap);
      }
      return;
    }
    const k = d.kind;
    let { x, y, w, h } = b;
    if (k.includes("e")) w = Math.max(MIN_W, Math.min(area.w - x, b.w + dx));
    if (k.includes("s")) h = Math.max(MIN_H, Math.min(area.h - y, b.h + dy));
    if (k.includes("w")) {
      w = Math.max(MIN_W, b.w - dx);
      x = Math.max(0, b.x + b.w - w);
      w = b.x + b.w - x;
    }
    if (k.includes("n")) {
      h = Math.max(MIN_H, b.h - dy);
      y = Math.max(0, b.y + b.h - h);
      h = b.y + b.h - y;
    }
    onChange({ x, y, w, h, snap: "" });
  };
  const end = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    onBusy(false);
    onSnapHint("");
    if (d.kind === "move" && d.snap) onChange({ snap: d.snap });
  };
  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  return (
    <section
      className={`wd-win${active ? " is-active" : ""}${win.min ? " is-min" : ""}${full ? " is-max" : ""}${win.snap === "l" || win.snap === "r" ? " is-snap" : ""}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: win.z } as CSSProperties}
      role="dialog"
      aria-label={title}
      aria-hidden={win.min || undefined}
      inert={win.min || undefined}
      onPointerDownCapture={onFocus}
    >
      <header
        className="wd-win__bar"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          begin(e, "move");
        }}
        {...handlers}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button") || phone) return;
          onChange({ snap: win.snap === "max" ? "" : "max" });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu(e);
        }}
      >
        <span className="wd-win__icon" aria-hidden>
          {icon}
        </span>
        <h2 className="wd-win__title">{title}</h2>
        {tools ? <span className="wd-win__tools">{tools}</span> : null}
        <span className="wd-win__ctl">
          <button type="button" onClick={() => onChange({ min: true })} aria-label={labels.minimize} title={labels.minimize}>
            <IconMinus />
          </button>
          {phone ? null : (
            <button type="button" onClick={() => onChange({ snap: win.snap === "max" ? "" : "max" })} aria-label={win.snap === "max" ? labels.restore : labels.maximize} title={win.snap === "max" ? labels.restore : labels.maximize}>
              <i className={win.snap === "max" ? "wd-glyph-restore" : "wd-glyph-max"} aria-hidden />
            </button>
          )}
          <button type="button" className="wd-win__x" onClick={onClose} aria-label={labels.close} title={labels.close}>
            <IconClose />
          </button>
        </span>
      </header>
      <div className="wd-win__body">{children}</div>
      {full ? null : EDGES.map((k) => <i key={k} className={`wd-win__edge wd-win__edge--${k}`} onPointerDown={(e) => begin(e, k)} {...handlers} aria-hidden />)}
    </section>
  );
}
