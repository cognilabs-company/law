"use client";

import { useMemo, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { monthTitle, weekdays } from "@/lib/date";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";

export type CalDay = { tone?: "ok" | "info" | "warn" | "err" | "violet" | "gray"; label?: string; sub?: string; items?: ReactNode };
const pad = (n: number) => String(n).padStart(2, "0");
export const monthOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${pad(new Date(y, m, 0).getDate())}` };
}

// A month as a grid of days, Monday first. Each day can carry a tone and a
// line or two; a legend and what a click does are the page's own.
export default function HrmCalendar({ month, onMonth, days, onPick, today, legend }: { month: string; onMonth: (m: string) => void; days: Record<string, CalDay>; onPick?: (date: string) => void; today: string; legend?: ReactNode }) {
  const locale = useLocale();
  const t = useTranslations("internal.ui");
  const [y, m] = month.split("-").map(Number);
  const cells = useMemo(() => {
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(y, m, 0).getDate();
    return [...Array.from({ length: lead }, () => ""), ...Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`)];
  }, [y, m, month]);
  const shift = (by: number) => {
    const d = new Date(y, m - 1 + by, 1);
    onMonth(monthOf(d));
  };
  return (
    <div className="hrm-cal">
      <div className="hrm-cal__bar">
        <button type="button" onClick={() => shift(-1)} aria-label={t("prevMonth")}><IconChevronLeft /></button>
        <b>{monthTitle(y, m - 1, locale)}</b>
        <button type="button" onClick={() => shift(1)} aria-label={t("nextMonth")}><IconChevronRight /></button>
        {month !== today.slice(0, 7) ? <button type="button" className="hrm-cal__now" onClick={() => onMonth(today.slice(0, 7))}>{t("thisMonth")}</button> : null}
      </div>
      <div className="hrm-cal__grid" role="grid">
        {weekdays(locale).map((w) => <span key={w} className="hrm-cal__wd" role="columnheader">{w}</span>)}
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} className="hrm-cal__cell is-pad" aria-hidden />;
          const d = days[date];
          const cls = `hrm-cal__cell${d?.tone ? ` hrm-cal__cell--${d.tone}` : " is-empty"}${date === today ? " is-today" : ""}`;
          const body = (
            <>
              <span className="hrm-cal__n">{Number(date.slice(8))}</span>
              {d?.label ? <b>{d.label}</b> : null}
              {d?.sub ? <small>{d.sub}</small> : null}
              {d?.items}
            </>
          );
          return onPick && d ? <button key={date} type="button" className={cls} onClick={() => onPick(date)} role="gridcell">{body}</button> : <div key={date} className={cls} role="gridcell">{body}</div>;
        })}
      </div>
      {legend ? <div className="hrm-cal__legend">{legend}</div> : null}
    </div>
  );
}
