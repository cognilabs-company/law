"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { findTarget } from "@/lib/guide/targets";
import { resolveExact } from "@/lib/ai/resolve";

type Box = { x: number; y: number; w: number; h: number; r: number };

const CLIPS = /(auto|scroll|hidden|clip)/;

function clippers(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const cs = window.getComputedStyle(p);
    if (CLIPS.test(cs.overflow + cs.overflowX + cs.overflowY)) out.push(p);
    if (cs.position === "fixed") break;
    p = p.parentElement;
  }
  return out;
}

function visibleBox(el: HTMLElement, clip: HTMLElement[], pad: number): Box | null {
  const r = el.getBoundingClientRect();
  let left = r.left - pad;
  let top = r.top - pad;
  let right = r.right + pad;
  let bottom = r.bottom + pad;
  for (const c of clip) {
    const cr = c.getBoundingClientRect();
    left = Math.max(left, cr.left);
    top = Math.max(top, cr.top);
    right = Math.min(right, cr.right);
    bottom = Math.min(bottom, cr.bottom);
  }
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, window.innerWidth);
  bottom = Math.min(bottom, window.innerHeight);
  if (right - left < 4 || bottom - top < 4) return null;
  const radius = parseFloat(window.getComputedStyle(el).borderTopLeftRadius) || 10;
  return { x: left, y: top, w: right - left, h: bottom - top, r: radius + pad };
}

function holePath(W: number, H: number, b: Box): string {
  const k = Math.max(0, Math.min(b.r, b.w / 2, b.h / 2));
  const { x, y, w, h } = b;
  const f = (n: number) => Math.round(n * 10) / 10;
  return `path(evenodd, "M0 0H${f(W)}V${f(H)}H0Z M${f(x + k)} ${f(y)}H${f(x + w - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + w)} ${f(y + k)}V${f(y + h - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + w - k)} ${f(y + h)}H${f(x + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x)} ${f(y + h - k)}V${f(y + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + k)} ${f(y)}Z")`;
}

export default function Spotlight({ targetId, stepKey, variant, strict = false }: { targetId: string; stepKey: string; variant?: "pulse" | "soft"; strict?: boolean }) {
  const scrim = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const soft = variant === "soft";

  useEffect(() => {
    const s = scrim.current;
    const g = ring.current;
    if (!g || (!soft && !s)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let cur: Box | null = null;
    let el: HTMLElement | null = null;
    let clip: HTMLElement[] = [];
    let last = "";
    let scrollTimer = 0;
    const onScroll = () => {
      if (!s) return;
      s.dataset.scrolling = "1";
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        delete s.dataset.scrolling;
      }, 180);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    const loop = () => {
      const found = strict ? (resolveExact(targetId)?.el ?? null) : findTarget(targetId);
      if (found !== el) {
        el = found;
        clip = el ? clippers(el) : [];
      }
      const pad = window.innerWidth < 600 ? 6 : 8;
      const want = el ? visibleBox(el, clip, pad) : null;
      if (!want) {
        if (s) s.style.opacity = "0";
        g.style.opacity = "0";
        cur = null;
        last = "";
      } else {
        if (!cur || reduce) cur = { ...want };
        else {
          const ease = 0.28;
          cur = {
            x: cur.x + (want.x - cur.x) * ease,
            y: cur.y + (want.y - cur.y) * ease,
            w: cur.w + (want.w - cur.w) * ease,
            h: cur.h + (want.h - cur.h) * ease,
            r: want.r,
          };
          if (Math.abs(cur.x - want.x) + Math.abs(cur.y - want.y) + Math.abs(cur.w - want.w) + Math.abs(cur.h - want.h) < 0.6) cur = { ...want };
        }
        const path = holePath(window.innerWidth, window.innerHeight, cur);
        if (path !== last) {
          if (s) {
            s.style.clipPath = path;
            s.style.setProperty("-webkit-clip-path", path);
          }
          g.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
          g.style.width = `${cur.w}px`;
          g.style.height = `${cur.h}px`;
          g.style.borderRadius = `${Math.min(cur.r, cur.w / 2, cur.h / 2)}px`;
          last = path;
        }
        if (s) s.style.opacity = "1";
        g.style.opacity = "1";
        const mid = want.y + want.h / 2;
        const dock = mid > window.innerHeight * (window.innerWidth < 720 ? 0.52 : 0.68) ? "top" : "bottom";
        if (document.body.dataset.guideDock !== dock) document.body.dataset.guideDock = dock;
      }
      raf = window.requestAnimationFrame(loop);
    };
    loop();
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(scrollTimer);
      window.removeEventListener("scroll", onScroll, { capture: true });
      delete document.body.dataset.guideDock;
    };
  }, [targetId, soft, strict]);

  useEffect(() => {
    const g = ring.current;
    if (!g) return;
    g.classList.remove("is-in");
    void g.offsetWidth;
    g.classList.add("is-in");
  }, [stepKey]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {soft ? null : <div className="gscrim" ref={scrim} aria-hidden="true" />}
      <div className={`gring${variant === "pulse" ? " gring--pulse" : soft ? " gring--soft" : ""}`} ref={ring} aria-hidden="true">
        <i className="gring__glow" />
      </div>
    </>,
    document.body,
  );
}
