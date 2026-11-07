"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

type Props = {
  /** Decorative layer painted behind the row. */
  behind: ReactNode;
  /** Panel text, rendered on the server and passed through untouched. */
  side: ReactNode;
  /** The ul of cards. */
  children: ReactNode;
  labelledBy: string;
  count: number;
  dragLabel: string;
  prevLabel: string;
  nextLabel: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Native horizontal scroller with mouse drag on top. Touch and trackpads keep
 * the browser's own scrolling and snap; a mouse has neither, so it drags here.
 *
 * Geometry comes from offsetLeft rather than scrollWidth: the entry animation
 * moves cards with transforms, and those inflate scrollWidth while they run.
 */
export default function LandingGallery({ behind, side, children, labelledBy, count, dragLabel, prevLabel, nextLabel }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const settle = useRef<() => void>(() => {});
  const drag = useRef({ id: -1, startX: 0, startLeft: 0, moved: false, lastX: 0, lastT: 0, v: 0 });

  const [index, setIndex] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const geometry = useCallback(() => {
    const view = viewRef.current;
    const row = view?.querySelector("ul");
    const cards = row ? Array.from(row.children) as HTMLElement[] : [];
    if (!view || !row || !cards.length) return { max: 0, targets: [0] };
    const style = getComputedStyle(row);
    const last = cards[cards.length - 1];
    const max = Math.max(0, last.offsetLeft + last.offsetWidth + parseFloat(style.paddingRight) - view.clientWidth);
    const start = parseFloat(style.paddingLeft);
    const targets = cards.map((c) => Math.min(max, Math.max(0, c.offsetLeft - start)));
    return { max, targets };
  }, []);

  const measure = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const { max } = geometry();
    const x = view.scrollLeft;
    const p = max > 0 ? Math.min(1, x / max) : 0;
    rootRef.current?.style.setProperty("--lh-p", p.toFixed(4));
    setIndex(Math.round(p * (count - 1)));
    setAtStart(x <= 2);
    setAtEnd(x >= max - 2);
  }, [count, geometry]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    measure();
    view.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    return () => {
      view.removeEventListener("scroll", measure);
      observer.disconnect();
      settle.current();
    };
  }, [measure]);

  const scrollToX = (left: number) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewRef.current?.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
  };

  const step = (dir: 1 | -1) => {
    const view = viewRef.current;
    if (!view) return;
    const { targets } = geometry();
    const x = view.scrollLeft;
    const next = dir > 0 ? targets.find((t) => t > x + 4) : [...targets].reverse().find((t) => t < x - 4);
    if (next !== undefined) scrollToX(next);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !viewRef.current) return;
    settle.current();
    drag.current = { id: e.pointerId, startX: e.clientX, startLeft: viewRef.current.scrollLeft, moved: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const view = viewRef.current;
    if (d.id !== e.pointerId || !view) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < 5) return;
      // Capture only once this is a drag, so that a plain click still reaches the link.
      d.moved = true;
      view.setPointerCapture(e.pointerId);
      view.classList.add("is-drag");
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    view.scrollLeft = d.startLeft - dx;
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const view = viewRef.current;
    if (d.id !== e.pointerId) return;
    d.id = -1;
    if (!d.moved || !view) return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 60);

    // Land on the nearest card, carrying the throw, then hand back to native snap.
    const { targets } = geometry();
    const aim = view.scrollLeft - d.v * 240;
    const target = targets.reduce((best, t) => (Math.abs(t - aim) < Math.abs(best - aim) ? t : best), targets[0]);
    const finish = () => {
      clearTimeout(timer);
      view.removeEventListener("scrollend", finish);
      view.classList.remove("is-drag");
      settle.current = () => {};
    };
    const timer = setTimeout(finish, 800);
    view.addEventListener("scrollend", finish);
    settle.current = finish;
    scrollToX(target);
  };

  return (
    <div className="lh-svc__grid" ref={rootRef} style={{ "--lh-n": count } as CSSProperties}>
      {behind}
      {side}
      <div
        className="lh-svc__view"
        ref={viewRef}
        role="group"
        tabIndex={0}
        aria-labelledby={labelledBy}
        data-lh-cursor="drag"
        data-lh-cursor-label={dragLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </div>
      <div className="lh-svc__ctrl">
        <span className="lh-svc__count" aria-hidden="true">
          <b>{pad2(index + 1)}</b> / {pad2(count)}
        </span>
        <span className="lh-svc__rail" aria-hidden="true">
          <i />
        </span>
        <button type="button" className="lh-round" aria-label={prevLabel} aria-disabled={atStart} onClick={() => step(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m14.5 6-6 6 6 6" />
          </svg>
        </button>
        <button type="button" className="lh-round lh-round--solid" aria-label={nextLabel} aria-disabled={atEnd} onClick={() => step(1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9.5 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
