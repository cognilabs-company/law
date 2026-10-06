"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDate, fmtDate } from "@/lib/date";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import { IconClock } from "@/components/icons";

// Responsive SVG line chart for time series (revenue trend etc.) with a
// date-range selector and hover tooltips. X labels are localized dates.
type Period = "all" | "d7" | "d30" | "d90" | "custom";

const RANGES: { key: Exclude<Period, "custom">; n: number }[] = [
  { key: "all", n: 0 },
  { key: "d7", n: 7 },
  { key: "d30", n: 30 },
  { key: "d90", n: 90 },
];

export default function LineChart({
  points,
  format,
  controls = true,
}: {
  points: { label: string; value: number }[];
  format?: (n: number) => string;
  // false when the page's own filter bar drives the range (no duplicate controls).
  controls?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("chart");
  const fmtV = format ?? ((n: number) => String(n));
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hover, setHover] = useState<number | null>(null);

  const custom = period === "custom";
  const span = RANGES.find((r) => r.key === period)?.n ?? 0;
  const base = custom
    ? points.filter((p) => {
        const iso = p.label.slice(0, 10);
        return (!from || iso >= from) && (!to || iso <= to);
      })
    : span > 0
      ? points.slice(-span)
      : points;
  const pts = base.slice(-120);

  const pickPeriod = (v: string) => {
    const next = (RANGES.some((r) => r.key === v) || v === "custom" ? v : "all") as Period;
    setPeriod(next);
    setHover(null);
    if (next !== "custom") {
      setFrom("");
      setTo("");
    }
  };

  const W = 600, H = 180, P = 6;
  const max = Math.max(...pts.map((p) => p.value), 1);
  const min = Math.min(...pts.map((p) => p.value), 0);
  const rng = max - min || 1;
  const xv = (i: number) => (pts.length < 2 ? W / 2 : P + (i / (pts.length - 1)) * (W - 2 * P));
  const yv = (v: number) => P + (1 - (v - min) / rng) * (H - 2 * P);
  const xp = (i: number) => (xv(i) / W) * 100;
  const yp = (v: number) => (yv(v) / H) * 100;

  const line = pts.map((p, i) => `${i ? "L" : "M"}${xv(i).toFixed(1)} ${yv(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${xv(pts.length - 1).toFixed(1)} ${(H - P).toFixed(1)} L${xv(0).toFixed(1)} ${(H - P).toFixed(1)} Z`;
  const idxs = pts.length > 1 ? [0, Math.floor(pts.length / 3), Math.floor((2 * pts.length) / 3), pts.length - 1] : [0];

  return (
    <div className="lchart">
      {controls ? (
        <div className="lchart__bar">
          <span className="lchart__lbl">
            <IconClock aria-hidden="true" />
            {t("period")}
          </span>
          <div className="lchart__sel">
            <Select
              value={period}
              onChange={pickPeriod}
              ariaLabel={t("period")}
              options={[...RANGES.map((r) => ({ value: r.key, label: t(r.key) })), { value: "custom", label: t("custom") }]}
            />
          </div>
          {custom ? (
            <div className="lchart__dates">
              <DatePicker value={from} max={to || undefined} placeholder={t("from")} ariaLabel={t("from")} clearLabel={t("clear")} onChange={(v) => { setFrom(v); setHover(null); }} />
              <span aria-hidden="true">–</span>
              <DatePicker value={to} min={from || undefined} placeholder={t("to")} ariaLabel={t("to")} clearLabel={t("clear")} onChange={(v) => { setTo(v); setHover(null); }} />
            </div>
          ) : null}
        </div>
      ) : null}

      {pts.length < 2 ? (
        <div className="lchart__empty">{pts.length ? `${shortDate(pts[0].label, locale)} · ${fmtV(pts[0].value)}` : "—"}</div>
      ) : (
        <>
          <div className="lchart__plot">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="lchart__svg" aria-hidden>
              <defs>
                <linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--b600)" stopOpacity="0.22" />
                  <stop offset="1" stopColor="var(--b600)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#lcg)" />
              <path d={line} fill="none" stroke="var(--b600)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>

            {hover != null && pts[hover] ? (
              <>
                <span className="lchart__guide" style={{ left: `${xp(hover)}%` }} />
                <span className="lchart__dot" style={{ left: `${xp(hover)}%`, top: `${yp(pts[hover].value)}%` }} />
                <div
                  className="lchart__tip"
                  style={{ left: `${Math.min(88, Math.max(12, xp(hover)))}%`, top: `${yp(pts[hover].value)}%` }}
                >
                  <b>{fmtV(pts[hover].value)}</b>
                  <span>{fmtDate(pts[hover].label, locale)}</span>
                </div>
              </>
            ) : null}

            <div className="lchart__hit" onMouseLeave={() => setHover(null)}>
              {pts.map((p, i) => (
                <span key={i} onMouseEnter={() => setHover(i)} aria-label={`${fmtDate(p.label, locale)}: ${fmtV(p.value)}`} />
              ))}
            </div>
          </div>

          <div className="lchart__x">
            {idxs.map((i, k) => (
              <span key={k}>{shortDate(pts[i].label, locale)}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
