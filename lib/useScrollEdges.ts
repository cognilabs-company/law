"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export type ScrollEdges = {
  atStart: boolean;
  atEnd: boolean;
  atTop: boolean;
  atBottom: boolean;
  overflowX: boolean;
  overflowY: boolean;
};

export type ScrollEdgesTarget = RefObject<HTMLElement | null> | HTMLElement | null;

export type ScrollEdgesOptions = {
  silent?: boolean;
  slack?: number;
};

export const SCROLL_EDGES_NONE: ScrollEdges = { atStart: true, atEnd: true, atTop: true, atBottom: true, overflowX: false, overflowY: false };

const SCROLLABLE = new Set(["auto", "scroll", "overlay"]);
const MAX_KIDS = 400;
const noop = () => {};

type Attached = { el: HTMLElement; silent: boolean; slack: number; off: () => void };

function resolveTarget(t: ScrollEdgesTarget): HTMLElement | null {
  if (!t) return null;
  return t instanceof HTMLElement ? t : t.current;
}

function sameEdges(a: ScrollEdges, b: ScrollEdges): boolean {
  return a.atStart === b.atStart && a.atEnd === b.atEnd && a.atTop === b.atTop && a.atBottom === b.atBottom && a.overflowX === b.overflowX && a.overflowY === b.overflowY;
}

function edgesOf(el: HTMLElement, canX: boolean, canY: boolean, slack: number): ScrollEdges {
  const w = canX ? el.scrollWidth - el.clientWidth : 0;
  const h = canY ? el.scrollHeight - el.clientHeight : 0;
  const x = Math.abs(el.scrollLeft);
  const y = el.scrollTop;
  const overflowX = w > slack;
  const overflowY = h > slack;
  return {
    atStart: !overflowX || x <= slack,
    atEnd: !overflowX || x >= w - slack,
    atTop: !overflowY || y <= slack,
    atBottom: !overflowY || y >= h - slack,
    overflowX,
    overflowY,
  };
}

export function scrollEdgeTokens(e: ScrollEdges): string {
  return [e.atStart ? "" : "start", e.atEnd ? "" : "end", e.atTop ? "" : "top", e.atBottom ? "" : "bottom"].filter(Boolean).join(" ");
}

export function measureScrollEdges(el: HTMLElement, slack = 2): ScrollEdges {
  const cs = getComputedStyle(el);
  return edgesOf(el, SCROLLABLE.has(cs.overflowX), SCROLLABLE.has(cs.overflowY), slack);
}

export function scrollStep(el: HTMLElement, dir: 1 | -1, share = 0.8): void {
  const rtl = getComputedStyle(el).direction === "rtl";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const by = Math.max(1, Math.round(el.clientWidth * share));
  el.scrollBy({ left: dir * (rtl ? -1 : 1) * by, behavior: reduce ? "auto" : "smooth" });
}

function watch(el: HTMLElement, slack: number, report: (e: ScrollEdges) => void): () => void {
  let canX = false;
  let canY = false;
  let raf = 0;
  let kids = new Set<Element>();

  const read = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (!el.isConnected) return;
    const e = edgesOf(el, canX, canY, slack);
    const tokens = scrollEdgeTokens(e);
    if ((el.getAttribute("data-more") ?? "") !== tokens) {
      if (tokens) el.setAttribute("data-more", tokens);
      else el.removeAttribute("data-more");
    }
    report(e);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(read);
  };
  const restyle = () => {
    const cs = getComputedStyle(el);
    canX = SCROLLABLE.has(cs.overflowX);
    canY = SCROLLABLE.has(cs.overflowY);
  };

  const ro =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          restyle();
          read();
        });
  const observeKids = () => {
    if (!ro) return;
    const next = new Set(Array.from(el.children).slice(0, MAX_KIDS));
    kids.forEach((k) => {
      if (!next.has(k)) ro.unobserve(k);
    });
    next.forEach((k) => {
      if (!kids.has(k)) ro.observe(k);
    });
    kids = next;
  };
  const mo =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          observeKids();
          schedule();
        });

  ro?.observe(el);
  observeKids();
  mo?.observe(el, { childList: true });
  el.addEventListener("scroll", read, { passive: true });
  window.addEventListener("resize", schedule);
  restyle();
  schedule();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    el.removeEventListener("scroll", read);
    window.removeEventListener("resize", schedule);
    ro?.disconnect();
    mo?.disconnect();
    el.removeAttribute("data-more");
  };
}

export function useScrollEdges(target: ScrollEdgesTarget, options: ScrollEdgesOptions = {}): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>(SCROLL_EDGES_NONE);
  const silent = Boolean(options.silent);
  const slack = options.slack ?? 2;
  const box = useRef<{ cur: Attached | null }>({ cur: null });

  useEffect(() => {
    const holder = box.current;
    const el = resolveTarget(target);
    const cur = holder.cur;
    if (cur && cur.el === el && cur.silent === silent && cur.slack === slack) return;
    if (!cur && !el) return;
    cur?.off();
    const report = silent ? noop : (e: ScrollEdges) => setEdges((p) => (sameEdges(p, e) ? p : e));
    holder.cur = el ? { el, silent, slack, off: watch(el, slack, report) } : null;
  });

  useEffect(() => {
    const holder = box.current;
    return () => {
      holder.cur?.off();
      holder.cur = null;
    };
  }, []);

  return edges;
}
