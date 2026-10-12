"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

type Zone = RefObject<HTMLElement | null>;

export type SwipeDismissOptions = {
  enabled: boolean;
  panel: Zone;
  scroller?: Zone;
  handles?: Zone[];
  canStart?: () => boolean;
  onDismiss: () => void;
  distance?: number;
  velocity?: number;
};

export const SWIPE_DISTANCE = 80;
export const SWIPE_VELOCITY = 0.5;

const SLOP = 4;
const FLICK_MIN = 24;
const SPRING = "translate .22s cubic-bezier(.2,.8,.3,1)";

function scrolledBetween(from: Element | null, stop: Element | null): boolean {
  for (let n = from; n && n !== stop; n = n.parentElement) {
    if (n.scrollTop > 0) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === "auto" || oy === "scroll") return true;
    }
  }
  return false;
}

export function useSwipeDismiss(o: SwipeDismissOptions): void {
  const latest = useRef(o);
  useLayoutEffect(() => {
    latest.current = o;
  });
  const enabled = o.enabled;

  useEffect(() => {
    if (!enabled) return;
    const panel = latest.current.panel.current;
    if (!panel) return;
    let start: { x: number; y: number; zone: "head" | "body" } | null = null;
    let dragging = false;
    let dy = 0;
    let lastY = 0;
    let lastT = 0;
    let speed = 0;
    let settle = 0;

    const release = (animate: boolean) => {
      window.clearTimeout(settle);
      panel.style.transition = animate ? SPRING : "";
      panel.style.translate = "";
      if (!animate) return;
      settle = window.setTimeout(() => {
        panel.style.transition = "";
      }, 260);
    };

    const onStart = (e: TouchEvent) => {
      start = null;
      dragging = false;
      dy = 0;
      speed = 0;
      if (e.touches.length !== 1) return;
      const opts = latest.current;
      if (opts.canStart && !opts.canStart()) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const scroller = opts.scroller?.current ?? null;
      let zone: "head" | "body" | null = (opts.handles ?? []).some((h) => h.current?.contains(target)) ? "head" : null;
      if (!zone && scroller && scroller.contains(target) && scroller.scrollTop <= 0 && !scrolledBetween(target, scroller)) zone = "body";
      if (!zone) return;
      const p = e.touches[0];
      start = { x: p.clientX, y: p.clientY, zone };
      lastY = p.clientY;
      lastT = e.timeStamp;
    };

    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return;
      const p = e.touches[0];
      const dx = p.clientX - start.x;
      const ddy = p.clientY - start.y;
      if (!dragging) {
        if (Math.abs(dx) < SLOP && Math.abs(ddy) < SLOP) return;
        const scroller = latest.current.scroller?.current ?? null;
        if (ddy <= 0 || Math.abs(dx) > Math.abs(ddy) || (start.zone === "body" && (scroller?.scrollTop ?? 0) > 0)) {
          start = null;
          return;
        }
        dragging = true;
        window.clearTimeout(settle);
        panel.style.transition = "none";
      }
      dy = Math.max(0, ddy);
      const dt = e.timeStamp - lastT;
      if (dt > 0) speed = (p.clientY - lastY) / dt;
      lastY = p.clientY;
      lastT = e.timeStamp;
      panel.style.translate = `0 ${dy}px`;
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      const was = dragging;
      start = null;
      dragging = false;
      if (!was) return;
      const opts = latest.current;
      const far = dy > (opts.distance ?? SWIPE_DISTANCE);
      const flick = dy > FLICK_MIN && speed > (opts.velocity ?? SWIPE_VELOCITY);
      release(true);
      if (far || flick) opts.onDismiss();
    };

    const onCancel = () => {
      const was = dragging;
      start = null;
      dragging = false;
      if (was) release(true);
    };

    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onCancel);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onCancel);
      window.clearTimeout(settle);
      panel.style.transition = "";
      panel.style.translate = "";
    };
  }, [enabled]);
}
