"use client";

// Compact "this month" calendar for a dashboard card: a small day grid (today
// highlighted, a dot on days that have a real deadline) plus an agenda list of
// the next few upcoming items — no navigation, no fetching of its own; it just
// renders whatever deadlines the caller already has in hand.

import { useLocale, useTranslations } from "next-intl";
import { monthTitle, weekdays } from "@/lib/date";
import { IconClock } from "../icons";

export type MiniCalEvent = { id: string; date: string; label: string; sub?: string };

export default function MiniCalendar({ events }: { events: MiniCalEvent[] }) {
  const locale = useLocale();
  const t = useTranslations("portal.miniCal");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const byDay = new Map<number, MiniCalEvent[]>();
  for (const e of events) {
    const d = new Date(e.date);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const upcoming = events
    .filter((e) => !Number.isNaN(new Date(e.date).getTime()) && new Date(e.date).getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 4);

  return (
    <div className="minical">
      <div className="minical__title">{monthTitle(year, month, locale)}</div>
      <div className="minical__wd">
        {weekdays(locale).map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="minical__grid">
        {cells.map((d, i) => (
          <span key={i} className={`minical__d${d === today ? " on" : ""}${d && byDay.has(d) ? " has" : ""}`}>
            {d ?? ""}
          </span>
        ))}
      </div>
      <div className="minical__agenda">
        {upcoming.length ? (
          upcoming.map((e) => (
            <div className="minical__ev" key={e.id}>
              <span className="minical__evt">
                {new Date(e.date).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="minical__dot" />
              <div className="minical__evm">
                <b>{e.label}</b>
                {e.sub ? <span>{e.sub}</span> : null}
              </div>
            </div>
          ))
        ) : (
          <div className="minical__empty">
            <IconClock />
            {t("empty")}
          </div>
        )}
      </div>
    </div>
  );
}
