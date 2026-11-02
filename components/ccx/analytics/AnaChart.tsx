"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useLocale } from "next-intl";
import { fmtDateTime, fmtInt, shortDate } from "@/lib/date";
import { niceTicks, smoothPath } from "./model";

export type AnaSeries = { key: string; label: string; tone: "aqua" | "hot"; values: number[] };

const PAD = { l: 46, r: 18, t: 22, b: 36 };

export default function AnaChart({ days, series, label, hint, totalLabel }: { days: string[]; series: AnaSeries[]; label: string; hint: string; totalLabel: string }) {
  const locale = useLocale();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = days.length;
  const at = hover !== null && hover < n ? hover : null;
  const h = w < 560 ? 230 : 290;
  const top = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(top);
  const ymax = ticks[ticks.length - 1] || 1;
  const iw = Math.max(1, w - PAD.l - PAD.r);
  const ih = h - PAD.t - PAD.b;
  const x = (i: number) => (n <= 1 ? PAD.l + iw / 2 : PAD.l + (i * iw) / (n - 1));
  const y = (v: number) => PAD.t + ih - (v / ymax) * ih;
  const base = y(0);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 74))));
  const lead = series[0];
  const peak = lead ? lead.values.reduce((best, v, i) => (v > (lead.values[best] ?? 0) ? i : best), 0) : -1;
  const sig = `${days[0] ?? ""}-${n}-${ymax}`;

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!n) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = n <= 1 ? 0 : Math.round(((px - PAD.l) / iw) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const cur = at ?? n - 1;
    const next = e.key === "ArrowRight" ? Math.min(n - 1, cur + 1) : e.key === "ArrowLeft" ? Math.max(0, cur - 1) : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setHover(next);
  };

  const tipX = at === null ? 0 : x(at);
  const pillX = Math.min(w - PAD.r - 34, Math.max(PAD.l + 34, tipX));
  const flip = tipX > w / 2;
  const sum = at === null ? 0 : series.reduce((s, ser) => s + (ser.values[at] ?? 0), 0);

  return (
    <div
      className="opx-an-plot"
      ref={box}
      tabIndex={0}
      role="group"
      aria-label={label}
      aria-describedby={`${uid}-hint`}
      onKeyDown={onKey}
      onFocus={() => setHover((v) => v ?? n - 1)}
      onBlur={() => setHover(null)}
    >
      <span className="opx-sr" id={`${uid}-hint`}>
        {hint}
      </span>
      <span className="opx-sr" role="status" aria-live="polite">
        {at !== null ? `${fmtDateTime(days[at], locale, false)}: ${series.map((s) => `${s.label} ${fmtInt(s.values[at] ?? 0, locale)}`).join(", ")}` : ""}
      </span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false" onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="opx-an-stop" data-tone={s.tone} stopOpacity={s.tone === "aqua" ? 0.34 : 0.22} />
              <stop offset="100%" className="opx-an-stop" data-tone={s.tone} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((tk) => (
          <g key={tk} className="opx-an-gl">
            <line x1={PAD.l} x2={w - PAD.r} y1={y(tk)} y2={y(tk)} className={tk === 0 ? "is-base" : undefined} />
            <text x={PAD.l - 10} y={y(tk)} dy="0.32em" textAnchor="end">
              {fmtInt(tk, locale)}
            </text>
          </g>
        ))}

        {days.map((d, i) =>
          (n - 1 - i) % every === 0 && (at === null || Math.abs(x(i) - pillX) > 62) ? (
            <text key={d || i} className="opx-an-x" x={x(i)} y={h - 12} textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"}>
              {shortDate(d, locale)}
            </text>
          ) : null,
        )}

        {series.map((s) => {
          const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
          const line = smoothPath(pts);
          const area = n > 1 ? `${line} L${x(n - 1)},${base} L${x(0)},${base} Z` : "";
          return (
            <g key={`${s.key}-${sig}`} className="opx-an-series" data-tone={s.tone}>
              {area ? <path className="opx-an-area" d={area} fill={`url(#${uid}-${s.key})`} /> : null}
              {n > 1 ? <path className="opx-an-line" d={line} pathLength={1} /> : null}
              {n <= 31
                ? pts.map(([px, py], i) => <circle key={i} className="opx-an-dot" cx={px} cy={py} r={n === 1 ? 5 : 3} style={{ animationDelay: `${Math.min(i, 30) * 18}ms` }} />)
                : null}
            </g>
          );
        })}

        {lead && peak >= 0 && at === null && (lead.values[peak] ?? 0) > 0 ? (
          <text className="opx-an-peak" x={x(peak)} y={y(lead.values[peak]) - 12} textAnchor={peak === 0 ? "start" : peak === n - 1 ? "end" : "middle"}>
            {fmtInt(lead.values[peak], locale)}
          </text>
        ) : null}

        {at !== null ? (
          <g className="opx-an-hover">
            <line className="opx-an-cross" x1={tipX} x2={tipX} y1={PAD.t - 6} y2={base} />
            {series.map((s) => (
              <circle key={s.key} className="opx-an-focus" data-tone={s.tone} cx={tipX} cy={y(s.values[at] ?? 0)} r={6} />
            ))}
            <g className="opx-an-xpill" transform={`translate(${pillX}, ${h - 17})`}>
              <rect x={-34} y={-12} width={68} height={24} rx={12} />
              <text textAnchor="middle" dy="0.34em">
                {shortDate(days[at], locale)}
              </text>
            </g>
          </g>
        ) : null}
      </svg>

      {at !== null ? (
        <div className={`opx-an-tip${flip ? " is-flip" : ""}`} style={{ left: tipX, top: PAD.t }} aria-hidden="true">
          <span className="opx-an-tip__day">{fmtDateTime(days[at], locale, false)}</span>
          {series.map((s) => (
            <span key={s.key} className="opx-an-tip__row" data-tone={s.tone}>
              <i aria-hidden="true" />
              <b className="opx-num">{fmtInt(s.values[at] ?? 0, locale)}</b>
              <small>{s.label}</small>
            </span>
          ))}
          {series.length > 1 ? (
            <span className="opx-an-tip__sum">
              <small>{totalLabel}</small>
              <b className="opx-num">{fmtInt(sum, locale)}</b>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
