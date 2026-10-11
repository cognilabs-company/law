"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type Tone = "blue" | "violet" | "cyan" | "ok" | "warn" | "err" | "mute";

const DURATION = 700;

export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t0 = 0;
    const step = (now: number) => {
      if (!t0) t0 = now;
      const p = still ? 1 : Math.min(1, (now - t0) / DURATION);
      setShown(start + (value - start) * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

export type Slice = { key: string; label: string; value: number; tone: Tone };

export function Donut({ slices, center, sub, label }: { slices: Slice[]; center: ReactNode; sub: string; label: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  let at = 0;
  return (
    <div className="aov-donut" role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="aov-donut__track" cx="60" cy="60" r="48" pathLength={100} />
        {total > 0
          ? slices.map((s) => {
              const len = (s.value / total) * 100;
              const gap = slices.length > 1 && len > 1.6 ? 0.8 : 0;
              const seg = (
                <circle
                  key={s.key}
                  className={`aov-donut__seg aov-t-${s.tone}`}
                  cx="60"
                  cy="60"
                  r="48"
                  pathLength={100}
                  strokeDasharray={`${Math.max(0, len - gap)} ${100 - Math.max(0, len - gap)}`}
                  strokeDashoffset={-at}
                />
              );
              at += len;
              return seg;
            })
          : null}
      </svg>
      <span className="aov-donut__c">
        <b>{center}</b>
        <small>{sub}</small>
      </span>
    </div>
  );
}

export function Gauge({ pct, tone, value, label, note }: { pct: number; tone: Tone; value: ReactNode; label: string; note?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <figure className="aov-gauge">
      <svg viewBox="0 0 100 58" aria-hidden="true">
        <path className="aov-gauge__track" d="M8 52a42 42 0 0 1 84 0" pathLength={100} />
        {p > 0 ? <path className={`aov-gauge__arc aov-t-${tone}`} d="M8 52a42 42 0 0 1 84 0" pathLength={100} strokeDasharray={`${p} 100`} /> : null}
      </svg>
      <b className="aov-gauge__v">{value}</b>
      <figcaption>
        {label}
        {note ? <small>{note}</small> : null}
      </figcaption>
    </figure>
  );
}

export function SegmentBar({ slices, label }: { slices: Slice[]; label: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <div className="aov-seg" role="img" aria-label={label}>
      {total > 0
        ? slices
            .filter((s) => s.value > 0)
            .map((s) => <span key={s.key} className={`aov-t-${s.tone}`} style={{ flexGrow: s.value }} />)
        : null}
    </div>
  );
}

export function Legend({ slices, format, onPick }: { slices: Slice[]; format: (n: number) => string; onPick?: (key: string) => void }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <ul className="aov-legend">
      {slices.map((s) => (
        <li key={s.key} className={s.value ? undefined : "is-zero"}>
          <i className={`aov-t-${s.tone}`} aria-hidden="true" />
          {onPick ? (
            <button type="button" onClick={() => onPick(s.key)}>
              {s.label}
            </button>
          ) : (
            <span>{s.label}</span>
          )}
          <b>{format(s.value)}</b>
          <small>{Math.round((s.value / total) * 100)}%</small>
        </li>
      ))}
    </ul>
  );
}

export function Meter({ pct, tone }: { pct: number; tone: Tone }) {
  return (
    <span className="aov-meter" aria-hidden="true">
      <span className={`aov-t-${tone}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </span>
  );
}
