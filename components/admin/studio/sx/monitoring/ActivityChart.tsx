"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { ChartColumnIcon, glyph } from "../icons";
import { useMonFormat } from "./bits";
import { DAY_MS, dm, hm, type MonAxis, type MonBucket } from "./model";

const H = 168;
const PAD_TOP = 14;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setW(Math.floor(el.getBoundingClientRect().width));
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(el);
    const id = requestAnimationFrame(read);
    return () => {
      cancelAnimationFrame(id);
      ro?.disconnect();
    };
  }, []);
  return [ref, w] as const;
}

export type ActivityChartProps = { axis: MonAxis | null; buckets: readonly MonBucket[]; loading: boolean };

export function ActivityChart({ axis, buckets, loading }: ActivityChartProps): ReactElement {
  const t = useTranslations("studio");
  const fmt = useMonFormat();
  const [box, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const tipId = useId();
  const unit = axis?.unit ?? "hour";
  const total = buckets.reduce((n, b) => n + b.ms, 0);
  const max = buckets.reduce((m, b) => Math.max(m, b.ms), 0);
  const peakAt = buckets.findIndex((b) => b.ms === max && max > 0);
  const n = buckets.length;
  const slot = n ? width / n : 0;
  const barW = Math.max(2, Math.min(36, slot * (n > 40 ? 0.7 : 0.62)));
  const scale = (ms: number) => (max > 0 ? ((H - PAD_TOP) * ms) / max : 0);

  const label = (b: MonBucket) => (unit === "hour" ? `${hm(b.from)}–${hm(b.to)}` : unit === "day" ? dm(b.from) : `${dm(b.from)}–${dm(b.to - DAY_MS)}`);
  const lead = unit === "hour" ? t("sx.mon.chart.leadHour") : unit === "day" ? t("sx.mon.chart.leadDay") : t("sx.mon.chart.leadWeek");
  const summary = max > 0 ? t("sx.mon.chart.summary", { total: fmt.dur(total / 1000), peak: label(buckets[peakAt]), value: fmt.dur(max / 1000) }) : t("sx.mon.chart.empty");

  const pick = (e: MouseEvent<HTMLDivElement>) => {
    if (!n || !slot) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left) / slot)));
    if (i !== active) setActive(i);
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const cur = active ?? (buckets.findIndex((b) => b.current) >= 0 ? buckets.findIndex((b) => b.current) : n - 1);
    let next = cur;
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setActive(null);
      return;
    } else return;
    e.preventDefault();
    setActive(next);
  };

  const tickEvery = unit === "hour" ? (width < 520 ? 6 : 3) : Math.max(1, Math.ceil(n / (width < 520 ? 4 : 8)));
  const act = active !== null ? buckets[active] : null;
  const tipLeft = active !== null ? Math.min(Math.max(active * slot + slot / 2, 70), Math.max(70, width - 70)) : 0;
  const tipTop = act ? Math.max(72, H - scale(act.ms) - 8) : 0;

  return (
    <section className="sx-mon-card sx-mon-chart" data-hue="blue" data-ai-id="admin.studio.monitoring.chart" data-ai-type="section" data-ai-label={t("sx.mon.chart.title")}>
      <header className="sx-mon-card__head">
        <span className="sx-mon-sq" data-hue="blue" aria-hidden="true">
          {glyph(ChartColumnIcon, { size: 18 })}
        </span>
        <div className="sx-mon-card__titles">
          <h2 className="sx-mon-card__title">{t("sx.mon.chart.title")}</h2>
          <p className="sx-mon-card__lead">{lead}</p>
        </div>
        {!loading && max > 0 ? (
          <dl className="sx-mon-chart__facts">
            <div>
              <dt>{t("sx.mon.chart.total")}</dt>
              <dd className="sx-num">{fmt.dur(total / 1000)}</dd>
            </div>
            <div>
              <dt>{t("sx.mon.chart.peak")}</dt>
              <dd className="sx-num">{label(buckets[peakAt])}</dd>
            </div>
          </dl>
        ) : null}
      </header>
      <div className="sx-mon-chart__plot">
        <div className="sx-mon-chart__grid" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div
          ref={box}
          className="sx-mon-chart__area"
          tabIndex={loading || !n ? -1 : 0}
          role="group"
          aria-label={`${t("sx.mon.chart.title")}. ${summary}`}
          aria-describedby={act ? tipId : undefined}
          onMouseMove={pick}
          onMouseLeave={() => setActive(null)}
          onKeyDown={keys}
          onBlur={() => setActive(null)}
          data-ai-id="admin.studio.monitoring.chart.plot"
          data-ai-type="section"
          data-ai-label={t("sx.mon.chart.title")}
        >
          {loading ? (
            <div className="sx-mon-chart__sk" aria-hidden="true">
              {Array.from({ length: 16 }, (_, i) => (
                <span key={i} className="sx-sk" style={{ height: `${20 + ((i * 37) % 70)}%` }} />
              ))}
            </div>
          ) : width > 0 && n ? (
            <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true" className="sx-mon-chart__svg">
              {buckets.map((b, i) => {
                const hgt = scale(b.ms);
                const x = i * slot + (slot - barW) / 2;
                const shown = Math.max(hgt, 2);
                return (
                  <rect
                    key={b.from}
                    className="sx-mon-chart__bar"
                    data-zero={b.ms <= 0 ? "" : undefined}
                    data-current={b.current ? "" : undefined}
                    data-active={active === i ? "" : undefined}
                    x={x}
                    y={H - shown}
                    width={barW}
                    height={shown}
                    rx={Math.min(5, barW / 2)}
                    style={{ ["--i" as string]: Math.min(i, 40) }}
                  />
                );
              })}
            </svg>
          ) : null}
          {!loading && max <= 0 ? <p className="sx-mon-chart__none">{t("sx.mon.chart.empty")}</p> : null}
          {act ? (
            <div id={tipId} className="sx-mon-tip" role="status" style={{ left: tipLeft, top: tipTop }}>
              <b>{label(act)}</b>
              <span>{act.ms > 0 ? t("sx.mon.chart.tip", { time: fmt.dur(act.ms / 1000), n: act.people }) : t("sx.mon.chart.tipNone")}</span>
              {act.current ? <em>{unit === "hour" ? t("sx.mon.chart.nowHour") : t("monitoring.period.today")}</em> : null}
            </div>
          ) : null}
        </div>
        <div className="sx-mon-chart__x" aria-hidden="true">
          {buckets.map((b, i) =>
            i % tickEvery === 0 ? (
              <span key={b.from} style={{ left: i * slot + slot / 2 }} data-current={b.current ? "" : undefined}>
                {unit === "hour" ? hm(b.from).slice(0, 2) : dm(b.from)}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <p className="sx-vh">{summary}</p>
    </section>
  );
}
