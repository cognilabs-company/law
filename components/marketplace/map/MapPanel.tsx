"use client";

import { useEffect, useEffectEvent, useRef, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import "./mapPanel.css";

export type PanelVariant = "float" | "sheet" | "full" | "flat";
export type Snap = "peek" | "half" | "full";
export type Inset = { left: number; bottom: number };
export type SegOption<T extends string> = { value: T; label: ReactNode; icon?: ReactNode; ai?: string; title?: string };

export const PEEK_PX = 92;
const SNAPS: readonly Snap[] = ["peek", "half", "full"];
const NARROW = "(max-width: 720px)";

function subscribeNarrow(cb: () => void): () => void {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  disabled,
  ai,
}: {
  value: T;
  options: readonly SegOption<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  ai?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const at = options.findIndex((o) => o.value === value);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const from = Math.max(0, at);
    const last = options.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (from + 1) % options.length : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (from - 1 + options.length) % options.length : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    box.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div
      ref={box}
      className={`mseg${className ? ` ${className}` : ""}`}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      style={{ "--n": options.length, "--i": Math.max(0, at) } as CSSProperties}
      data-none={at < 0 ? "" : undefined}
      data-ai-id={ai}
    >
      <span className="mseg__ind" aria-hidden="true" />
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={i === at}
          tabIndex={i === at || (at < 0 && i === 0) ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={onKey}
          disabled={disabled}
          title={o.title}
          data-ai-id={o.ai}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

const FULL_GAP_PX = 72;
const HALF_SHARE = 0.48;
const heightOf = (s: Snap, stage: number) => (s === "full" ? Math.max(PEEK_PX, stage - FULL_GAP_PX) : s === "half" ? Math.max(PEEK_PX, stage * HALF_SHARE) : PEEK_PX);
const stageOf = (el: HTMLElement) => (el.offsetParent as HTMLElement | null)?.clientHeight ?? el.offsetHeight;

// The panel beside the map (or the bottom sheet on a phone). The sheet keeps
// one height and slides: only `transform` changes, on the compositor, so the
// map under it never has to lay out again while it moves.
export default function MapPanel({
  variant,
  snap,
  onSnap,
  labelId,
  head,
  children,
  detail,
  detailKey,
  hidden,
  onInset,
}: {
  variant: PanelVariant;
  snap: Snap;
  onSnap: (s: Snap) => void;
  labelId: string;
  head: ReactNode;
  children: ReactNode;
  detail: ReactNode | null;
  detailKey: string;
  hidden?: boolean;
  onInset?: (v: Inset) => void;
}) {
  const t = useTranslations("marketMap.panel");
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; base: number; stage: number; moved: boolean; last: number; at: number; v: number } | null>(null);
  const skipClick = useRef(false);
  const sheet = variant === "sheet";

  const report = useEffectEvent(() => {
    const el = ref.current;
    if (!el) return;
    if (sheet) {
      const h = heightOf(snap, stageOf(el));
      el.style.setProperty("--mpn-h", `${Math.round(h)}px`);
      el.style.setProperty("--mpn-rest", `${Math.round(h)}px`);
      if (!onInset) return;
      if (hidden) onInset({ left: 0, bottom: 0 });
      else onInset({ left: 0, bottom: Math.round(h) });
      return;
    }
    el.style.removeProperty("--mpn-h");
    el.style.removeProperty("--mpn-rest");
    if (!onInset) return;
    if (hidden || variant === "full" || variant === "flat") return onInset({ left: 0, bottom: 0 });
    onInset({ left: Math.round(el.offsetLeft + el.offsetWidth), bottom: 0 });
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    report();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => report());
    if (el.offsetParent) ro.observe(el.offsetParent);
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant, snap, hidden]);

  const step = (d: 1 | -1) => {
    const next = SNAPS[Math.min(SNAPS.length - 1, Math.max(0, SNAPS.indexOf(snap) + d))];
    if (next !== snap) onSnap(next);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!sheet || (e.pointerType === "mouse" && e.button !== 0)) return;
    const target = e.target as Element;
    if (target.closest("a,input,select,textarea,[role=radio],button:not(.mpn__grip)")) return;
    const el = ref.current;
    if (!el) return;
    drag.current = { y: e.clientY, base: heightOf(snap, stageOf(el)), stage: stageOf(el), moved: false, last: e.clientY, at: performance.now(), v: 0 };
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 5) return;
    if (!d.moved) e.currentTarget.setPointerCapture?.(e.pointerId);
    d.moved = true;
    const now = performance.now();
    if (now > d.at) d.v = (e.clientY - d.last) / (now - d.at);
    d.last = e.clientY;
    d.at = now;
    el.dataset.drag = "";
    el.style.setProperty("--mpn-h", `${Math.min(Math.max(d.base - dy, PEEK_PX), heightOf("full", d.stage))}px`);
  };

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    const el = ref.current;
    if (!d || !el || !d.moved) return;
    skipClick.current = true;
    window.setTimeout(() => {
      skipClick.current = false;
    }, 0);
    delete el.dataset.drag;
    const aim = d.base - (e.clientY - d.y) - d.v * 200;
    let best: Snap = snap;
    let gap = Number.POSITIVE_INFINITY;
    for (const s of SNAPS) {
      const g = Math.abs(heightOf(s, d.stage) - aim);
      if (g < gap) {
        gap = g;
        best = s;
      }
    }
    el.style.setProperty("--mpn-h", `${Math.round(heightOf(best, d.stage))}px`);
    onSnap(best);
  };

  const onGrip = () => {
    if (skipClick.current) return;
    onSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");
  };

  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      step(-1);
    }
  };

  const open = !!detail;

  return (
    <aside
      ref={ref}
      className={`mpn mpn--${variant}${open ? " has-detail" : ""}${hidden ? " is-hidden" : ""}`}
      data-snap={sheet ? snap : undefined}
      aria-labelledby={labelId}
      inert={hidden || undefined}
      data-ai-id="marketplace.map.panel"
      data-ai-type="section"
    >
      {sheet ? (
        <div className="mpn__drag" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <button type="button" className="mpn__grip" aria-label={snap === "full" ? t("collapse") : t("expand")} aria-expanded={snap !== "peek"} onClick={onGrip} onKeyDown={onGripKey} data-ai-id="marketplace.map.panel.grip">
            <span aria-hidden="true" />
          </button>
          <div className="mpn__head">{head}</div>
        </div>
      ) : (
        <div className="mpn__head">{head}</div>
      )}
      <div className="mpn__body">
        <div className="mpn__layer mpn__layer--list" inert={open || undefined} aria-hidden={open || undefined}>
          {children}
        </div>
        {detail ? (
          <div key={detailKey} className="mpn__layer mpn__layer--detail">
            {detail}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
