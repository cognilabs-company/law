"use client";

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { insideLayer, useLayer } from "./layers";

export type PopoverCloseReason = "escape" | "outside" | "blur" | "hidden" | "select";
export type PopoverPlacement = "below" | "above" | "sheet";
export type PopoverFit = "list" | "content";

export type PopoverOptions = {
  open: boolean;
  onClose: (reason: PopoverCloseReason) => void;
  trigger: RefObject<HTMLElement | null>;
  popup: RefObject<HTMLElement | null>;
  anchor?: RefObject<HTMLElement | null>;
  fit?: PopoverFit;
  maxHeight?: number;
  minWidth?: number;
  maxWidth?: number;
  gap?: number;
  sheet?: boolean;
  closeOnBlur?: boolean;
  returnFocus?: boolean;
};

export type PopoverState = {
  style: CSSProperties;
  placement: PopoverPlacement;
  isSheet: boolean;
  ready: boolean;
  z: number;
  close: (reason?: PopoverCloseReason) => void;
  update: () => void;
};

export const SHEET_QUERY = "(max-width: 640px), (pointer: coarse)";
export const COARSE_QUERY = "(pointer: coarse)";
export const LIST_MAX_HEIGHT = 330;
export const POPOVER_MIN_WIDTH = 240;
export const POPOVER_MAX_WIDTH = 360;

const PAD = 8;
const MIN_ROOM = 120;
const SHEET_SHARE = 0.86;
const TEXT_ENTRY =
  'input:not([type]),input[type="text"],input[type="search"],input[type="email"],input[type="tel"],input[type="url"],input[type="number"],input[type="password"],textarea,[contenteditable=""],[contenteditable="true"]';
const FOCUSABLE =
  'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';

type Geo = { side: PopoverPlacement; top: number; bottom: number; left: number; width: number; maxHeight: number };
type Size = { w: number; h: number; fw: number; room: number };
type Box = { get: () => Geo | null; set: (g: Geo | null) => void; sub: (fn: () => void) => () => void };

function sameGeo(a: Geo | null, b: Geo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.side === b.side &&
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.left === b.left &&
    a.width === b.width &&
    a.maxHeight === b.maxHeight
  );
}

function makeBox(): Box {
  let cur: Geo | null = null;
  const subs = new Set<() => void>();
  return {
    get: () => cur,
    set: (g) => {
      if (sameGeo(cur, g)) return;
      cur = g;
      subs.forEach((fn) => fn());
    },
    sub: (fn) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

function media(query: string) {
  return {
    sub: (fn: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    get: () => window.matchMedia(query).matches,
  };
}

const sheetMedia = media(SHEET_QUERY);
const coarseMedia = media(COARSE_QUERY);
const serverFalse = () => false;

export function useIsSheet(enabled = true): boolean {
  const on = useSyncExternalStore(sheetMedia.sub, sheetMedia.get, serverFalse);
  return enabled && on;
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(coarseMedia.sub, coarseMedia.get, serverFalse);
}

export function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia(COARSE_QUERY).matches;
}

export function focusField(el: HTMLElement | null): void {
  if (!el || !el.isConnected) return;
  const target = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus({ preventScroll: true });
}

function viewport() {
  const vv = window.visualViewport;
  const de = document.documentElement;
  return {
    top: vv ? vv.offsetTop : 0,
    left: vv ? vv.offsetLeft : 0,
    width: vv ? vv.width : de.clientWidth,
    height: vv ? vv.height : window.innerHeight,
    layoutH: de.clientHeight,
  };
}

function measure(p: HTMLElement, fieldW: number, fit: PopoverFit, minW: number, maxW: number): Size {
  const s = p.style;
  const w0 = s.width;
  const mh0 = s.maxHeight;
  s.maxHeight = "none";
  s.width = "max-content";
  const contentW = Math.ceil(p.offsetWidth);
  const room = Math.max(0, Math.floor(viewport().width - PAD * 2));
  let w: number;
  if (fit === "list") {
    const base = Math.max(fieldW, minW);
    w = Math.min(Math.max(base, contentW), Math.max(base, maxW));
  } else {
    w = Math.min(Math.max(contentW, minW), maxW);
  }
  w = Math.min(Math.round(w), room);
  s.width = `${w}px`;
  const h = Math.ceil(Math.max(p.offsetHeight, p.scrollHeight));
  s.width = w0;
  s.maxHeight = mh0;
  return { w, h, fw: fieldW, room };
}

function anchorGeo(r: DOMRect, size: Size, cap: number, gap: number, prev: PopoverPlacement | undefined): Geo {
  const v = viewport();
  const need = Math.min(size.h, cap);
  const below = v.top + v.height - r.bottom - gap - PAD;
  const above = r.top - v.top - gap - PAD;
  let side: "below" | "above";
  if (prev === "above" && need <= above) side = "above";
  else if (need <= below) side = "below";
  else side = above > below ? "above" : "below";
  const room = side === "below" ? below : above;
  const maxHeight = Math.round(Math.max(Math.min(cap, room), Math.min(need, MIN_ROOM)));
  const lo = v.left + PAD;
  const hi = v.left + v.width - PAD - size.w;
  return {
    side,
    top: Math.round(r.bottom + gap),
    bottom: Math.round(v.layoutH - r.top + gap),
    left: Math.round(Math.max(lo, Math.min(r.left, hi))),
    width: size.w,
    maxHeight,
  };
}

function sheetGeo(): Geo {
  const v = viewport();
  return {
    side: "sheet",
    top: 0,
    bottom: Math.max(0, Math.round(v.layoutH - v.top - v.height)),
    left: 0,
    width: 0,
    maxHeight: Math.round(v.height * SHEET_SHARE),
  };
}

function styleOf(g: Geo | null, sheet: boolean, z: number): CSSProperties {
  if (sheet) {
    const placed = g && g.side === "sheet" ? g : null;
    return { position: "fixed", left: 0, right: 0, bottom: placed ? placed.bottom : 0, maxHeight: placed?.maxHeight, zIndex: z };
  }
  if (!g || g.side === "sheet") return { position: "fixed", top: 0, left: 0, zIndex: z, opacity: 0, pointerEvents: "none" };
  const base: CSSProperties = { position: "fixed", left: g.left, width: g.width, maxHeight: g.maxHeight, zIndex: z };
  return g.side === "below" ? { ...base, top: g.top } : { ...base, bottom: g.bottom };
}

export function usePopover(o: PopoverOptions): PopoverState {
  const { open, trigger, popup, anchor } = o;
  const fit = o.fit ?? "list";
  const cap = fit === "list" ? (o.maxHeight ?? LIST_MAX_HEIGHT) : Number.POSITIVE_INFINITY;
  const minW = o.minWidth ?? POPOVER_MIN_WIDTH;
  const maxW = o.maxWidth ?? POPOVER_MAX_WIDTH;
  const gap = o.gap ?? 6;
  const blur = o.closeOnBlur ?? true;
  const isSheet = useIsSheet(o.sheet ?? true);
  const id = useId();
  const field = anchor ?? trigger;
  const [box] = useState(makeBox);
  const geo = useSyncExternalStore(box.sub, box.get, box.get);
  const latest = useRef(o);
  const runRef = useRef<((full: boolean) => void) | null>(null);
  const live = useRef(false);

  useLayoutEffect(() => {
    latest.current = o;
  });

  const close = (reason: PopoverCloseReason = "select") => {
    const cur = latest.current;
    live.current = false;
    cur.onClose(reason);
    if ((reason === "escape" || reason === "select") && cur.returnFocus !== false) focusField(cur.trigger.current);
  };

  const z = useLayer(open, {
    id,
    kind: "popover",
    scrim: isSheet,
    el: popup,
    trigger: field,
    onEscape: () => close("escape"),
    onOutside: () => close("outside"),
  });

  useLayoutEffect(() => {
    if (!open) return;
    let size: Size | null = null;
    let side: PopoverPlacement | undefined;
    let raf = 0;
    live.current = true;

    const shut = (reason: PopoverCloseReason) => {
      if (!live.current) return;
      live.current = false;
      latest.current.onClose(reason);
    };

    const run = (full: boolean) => {
      if (isSheet) {
        box.set(sheetGeo());
        return;
      }
      const f = field.current;
      const p = popup.current;
      if (!f || !p) return;
      const r = f.getBoundingClientRect();
      if (full || !size || Math.abs(size.fw - r.width) > 0.5) {
        const next = measure(p, r.width, fit, minW, maxW);
        if (size && Math.abs(size.fw - r.width) <= 0.5) next.w = Math.min(Math.max(next.w, size.w), next.room);
        size = next;
      }
      const g = anchorGeo(r, size, cap, gap, side);
      side = g.side;
      box.set(g);
    };

    const typing = () => {
      if (!isCoarsePointer()) return false;
      const a = document.activeElement;
      if (!(a instanceof HTMLElement) || !a.matches(TEXT_ENTRY)) return false;
      return !!(field.current?.contains(a) || trigger.current?.contains(a) || popup.current?.contains(a));
    };

    runRef.current = run;
    run(true);

    const onScroll = (e: Event) => {
      const p = popup.current;
      if (p && e.target instanceof Node && p.contains(e.target)) return;
      run(false);
    };
    const onResize = () => run(true);
    const onView = () => run(false);
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => run(true));
    };
    const onFocusIn = (e: FocusEvent) => {
      const n = e.target instanceof Node ? e.target : null;
      if (!n || n === document.body || n === document.documentElement) return;
      if (popup.current?.contains(n) || field.current?.contains(n) || trigger.current?.contains(n)) return;
      if (insideLayer(id, n)) return;
      shut("blur");
    };

    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onView);
    vv?.addEventListener("scroll", onView);
    if (blur) document.addEventListener("focusin", onFocusIn, true);

    let ro: ResizeObserver | null = null;
    if (!isSheet && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(later);
      if (field.current) ro.observe(field.current);
      if (popup.current) ro.observe(popup.current);
    }

    let io: IntersectionObserver | null = null;
    const watched = field.current;
    if (!isSheet && watched && typeof IntersectionObserver !== "undefined") {
      let seen = false;
      let half = false;
      io = new IntersectionObserver(
        (entries) => {
          const en = entries[entries.length - 1];
          if (!en) return;
          if (en.isIntersecting) seen = true;
          if (en.intersectionRatio >= 0.5) half = true;
          const gone = (seen && !en.isIntersecting) || (half && en.intersectionRatio < 0.5);
          if (!gone || (typing() && en.isIntersecting)) return;
          shut("hidden");
        },
        { threshold: [0, 0.5] },
      );
      io.observe(watched);
    }

    return () => {
      live.current = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      vv?.removeEventListener("resize", onView);
      vv?.removeEventListener("scroll", onView);
      if (blur) document.removeEventListener("focusin", onFocusIn, true);
      ro?.disconnect();
      io?.disconnect();
      runRef.current = null;
      box.set(null);
    };
  }, [open, isSheet, fit, cap, minW, maxW, gap, blur, box, id, field, trigger, popup]);

  const placed = geo && (isSheet ? geo.side === "sheet" : geo.side !== "sheet") ? geo : null;
  return {
    style: styleOf(placed, isSheet, z),
    placement: isSheet ? "sheet" : placed ? placed.side : "below",
    isSheet,
    ready: open && !!placed,
    z,
    close,
    update: () => runRef.current?.(true),
  };
}
