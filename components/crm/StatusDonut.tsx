"use client";

import { useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtNum } from "@/lib/date";
import { statusVar } from "./bits";

const R = 70;
const C = 2 * Math.PI * R;
// A 2px surface gap between neighbouring slices (in circumference units),
// so touching hues never blend.
const GAP = 2.4;

export type DonutSlice = { status: string; count: number };

// Arc layout for the ring: each non-empty status gets its share of the
// circumference, minus the gap; order follows the lead journey.
export function donutArcs(slices: DonutSlice[]): { status: string; count: number; share: number; length: number; offset: number }[] {
  const total = slices.reduce((s, x) => s + Math.max(0, x.count), 0);
  if (!total) return [];
  const live = slices.filter((x) => x.count > 0);
  const gap = live.length > 1 ? GAP : 0;
  let at = 0;
  return live.map((x) => {
    const share = x.count / total;
    const span = share * C;
    const arc = { status: x.status, count: x.count, share, length: Math.max(0.5, span - gap), offset: at };
    at += span;
    return arc;
  });
}

// Leads by status as a donut: the ring for proportion, the legend beside it
// for the exact numbers (and as the accessible, clickable list). Hovering a
// slice or a legend row shows it in the centre; either opens that status.
export function StatusDonut({ counts, statuses, onPick }: { counts: Record<string, number>; statuses: readonly string[]; onPick: (status: string) => void }): ReactElement {
  const t = useTranslations("crm.overview.donut");
  const ts = useTranslations("crm.status");
  const locale = useLocale();
  const [active, setActive] = useState("");
  const slices = statuses.map((s) => ({ status: s, count: counts[s] ?? 0 }));
  const total = slices.reduce((s, x) => s + x.count, 0);
  const arcs = donutArcs(slices);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const name = (s: string) => (ts.has(s) ? ts(s) : s);
  const focus = active ? slices.find((x) => x.status === active) : null;
  return (
    <div className="crm-donut" data-active={active || undefined}>
      <div className="crm-donut__fig">
        <svg viewBox="0 0 180 180" role="img" aria-label={t("aria", { n: total })}>
          <circle className="crm-donut__track" cx="90" cy="90" r={R} />
          {arcs.map((a, i) => (
            <circle
              key={a.status}
              className="crm-donut__slice"
              cx="90"
              cy="90"
              r={R}
              style={{ ...statusVar(a.status), ["--len" as string]: a.length, ["--i" as string]: i }}
              strokeDasharray={`${a.length} ${C - a.length}`}
              strokeDashoffset={-a.offset}
              data-on={active === a.status || undefined}
              onPointerEnter={() => setActive(a.status)}
              onPointerLeave={() => setActive("")}
              onClick={() => onPick(a.status)}
            >
              <title>{`${name(a.status)}: ${a.count} (${pct(a.count)}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="crm-donut__center" aria-hidden="true">
          {focus ? (
            <>
              <b>{fmtNum(focus.count, locale)}</b>
              <span style={statusVar(focus.status)}>
                <i />
                {name(focus.status)}
              </span>
              <small>{pct(focus.count)}%</small>
            </>
          ) : (
            <>
              <b>{fmtNum(total, locale)}</b>
              <span>{total ? t("total") : t("empty")}</span>
            </>
          )}
        </div>
      </div>
      <ul className="crm-donut__legend">
        {slices.map((x) => (
          <li key={x.status}>
            <button
              type="button"
              style={statusVar(x.status)}
              data-on={active === x.status || undefined}
              data-zero={x.count === 0 || undefined}
              onPointerEnter={() => setActive(x.status)}
              onPointerLeave={() => setActive("")}
              onFocus={() => setActive(x.status)}
              onBlur={() => setActive("")}
              onClick={() => onPick(x.status)}
              aria-label={t("row", { status: name(x.status), n: x.count, p: pct(x.count) })}
            >
              <i aria-hidden="true" />
              <span className="crm-donut__name">{name(x.status)}</span>
              <b>{fmtNum(x.count, locale)}</b>
              <small>{pct(x.count)}%</small>
              <span className="crm-donut__bar" aria-hidden="true">
                <span style={{ width: `${pct(x.count)}%` }} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
