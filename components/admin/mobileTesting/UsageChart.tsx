"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtDate, fmtNum, shortDate } from "@/lib/date";
import { addDays, daysInclusive, type MtmDaily } from "@/lib/services/mobileTesting";
import { useMinutes } from "./MtmBits";

// Daily foreground minutes over the period: one series, so no legend (the
// heading names it); one hue, thin bars with rounded tops on the baseline,
// a recessive grid, and a tooltip per bar on hover, focus and tap. Days the
// backend sent no row for get no bar (not a made-up zero). The daily table
// below is the table view.
const H = 220;
const PAD = { l: 44, r: 8, t: 12, b: 26 };

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export default function UsageChart({ daily, from, to }: { daily: MtmDaily[]; from: string; to: string }) {
  const t = useTranslations("admin.mtm.detail");
  const locale = useLocale();
  const minutes = useMinutes();
  const descId = useId();
  const [focus, setFocus] = useState<string | null>(null);
  // Drawn at the box's real width, so text never scales with the screen.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const days = useMemo(() => {
    const start = from || daily[0]?.date || "";
    const end = to || daily[daily.length - 1]?.date || "";
    if (!start || !end || start > end) return daily.map((d) => d.date);
    const n = Math.min(daysInclusive(start, end), 400);
    return Array.from({ length: n }, (_, i) => addDays(start, i));
  }, [daily, from, to]);
  const byDay = useMemo(() => new Map(daily.map((d) => [d.date, d])), [daily]);
  const max = niceMax(Math.max(0, ...daily.map((d) => d.foregroundMinutes)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(1, days.length);
  const gap = slot > 6 ? 2 : slot > 3 ? 1 : 0;
  const bw = Math.max(1, slot - gap);
  const y = (v: number) => PAD.t + ih - (Math.max(0, v) / max) * ih;
  const ticks = [0, max / 2, max];
  // Label at most ~7 dates along the axis.
  const every = Math.max(1, Math.ceil(days.length / Math.max(3, Math.floor(iw / 90))));
  const cur = focus ? byDay.get(focus) : undefined;
  const curIdx = focus ? days.indexOf(focus) : -1;

  return (
    <figure className="mtm-chart">
      <figcaption className="sr-only" id={descId}>
        {t("chartDesc", { from: from ? fmtDate(from, locale) : "", to: to ? fmtDate(to, locale) : "" })}
      </figcaption>
      <div className="mtm-chart__plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-labelledby={descId} className="mtm-chart__svg">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="mtm-chart__grid" />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="mtm-chart__ax">
                {fmtNum(v, locale)}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const row = byDay.get(d);
            const x = PAD.l + i * slot + gap / 2;
            const v = row?.foregroundMinutes ?? 0;
            const top = y(v);
            const h = Math.max(0, PAD.t + ih - top);
            const r = Math.min(4, bw / 2, h);
            return (
              <g key={d}>
                {/* The hit target is the whole column, bigger than the bar. */}
                <rect
                  x={PAD.l + i * slot}
                  y={PAD.t}
                  width={slot}
                  height={ih}
                  className="mtm-chart__hit"
                  onMouseEnter={() => setFocus(d)}
                  onMouseLeave={() => setFocus((f) => (f === d ? null : f))}
                  onClick={() => setFocus((f) => (f === d ? null : d))}
                />
                {row && h > 0 ? (
                  <path
                    d={`M${x},${PAD.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${PAD.t + ih} Z`}
                    className="mtm-chart__bar"
                    data-on={focus === d || undefined}
                  />
                ) : null}
                {i % every === 0 ? (
                  <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="mtm-chart__ax">
                    {shortDate(d, locale)}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} className="mtm-chart__base" />
        </svg>
        {focus && curIdx >= 0 ? (
          <div className="mtm-chart__tip" style={{ left: `${((PAD.l + (curIdx + 0.5) * slot) / W) * 100}%` }} role="status">
            <b>{fmtDate(focus, locale)}</b>
            {cur ? (
              <>
                <span>{minutes(cur.foregroundMinutes)}</span>
                <span>{t("sessionsN", { n: cur.sessions })}</span>
              </>
            ) : (
              <span>{t("noRow")}</span>
            )}
          </div>
        ) : null}
      </div>
      {/* Keyboard: step through the days with the arrow keys. */}
      <div
        className="mtm-chart__keys"
        tabIndex={0}
        role="group"
        aria-label={t("chartKeys")}
        onKeyDown={(e) => {
          if (!days.length) return;
          const i = focus ? days.indexOf(focus) : -1;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            setFocus(days[Math.min(days.length - 1, i + 1)]);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            setFocus(days[Math.max(0, i < 0 ? days.length - 1 : i - 1)]);
          } else if (e.key === "Escape") setFocus(null);
        }}
        onBlur={() => setFocus(null)}
      >
        {t("chartUnit")}
      </div>
    </figure>
  );
}
