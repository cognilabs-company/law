"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { weekdays } from "@/lib/date";
import { evalBusinessHours } from "@/lib/businessHours";
import { DEFAULT_BUSINESS_HOURS, getBusinessHours, type BusinessHours } from "@/lib/services/backend";

// Call-center working hours (Mon-Sat 09:00-19:00, Asia/Tashkent). Reads
// GET /calendar/business-hours when signed in and falls back to the same
// schedule computed on the client when that call fails. Not holiday-aware,
// so it never shows a "next opening" time.
const REFRESH_MIN = 15;
// The server's own open/closed flags are trusted only this long after a fetch.
const FLAGS_TTL_MS = 2 * REFRESH_MIN * 60_000;

// Minute clock: null on the server and during hydration (no mismatch), and
// keeps Date.now() out of render.
const subscribeClock = (cb: () => void) => {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
};
const readMinute = () => Math.floor(Date.now() / 60_000);
const serverMinute = () => null;

export default function BusinessHoursBadge({ note, showHolidayNote = false }: { note?: string; showHolidayNote?: boolean }) {
  const t = useTranslations("common.businessHours");
  const locale = useLocale();
  const { session } = useAuth();
  const token = session?.token ?? "";
  const minute = useSyncExternalStore<number | null>(subscribeClock, readMinute, serverMinute);
  const bucket = minute === null ? null : Math.floor(minute / REFRESH_MIN);
  const [loaded, setLoaded] = useState<{ token: string; data: BusinessHours } | null>(null);

  useEffect(() => {
    if (!token || bucket === null) return;
    let alive = true;
    getBusinessHours()
      .then((data) => {
        if (alive) setLoaded({ token, data });
      })
      .catch(() => {
        /* 401/403/404/network: keep the client-side schedule */
      });
    return () => {
      alive = false;
    };
  }, [token, bucket]);

  if (minute === null) return null;
  const api = loaded && loaded.token === token ? loaded.data : null;
  const bh = api ?? DEFAULT_BUSINESS_HOURS;
  const nowMs = minute * 60_000;
  const skew = api?.serverNow != null ? api.serverNow - api.fetchedAt : 0;
  let status = evalBusinessHours(bh, nowMs + skew);
  // Trust the server when its flags disagreed with this math at fetch time
  // (rules we don't know about, or a non-Tashkent timezone), while fresh.
  if (api && api.isWorkingTime !== null && nowMs - api.fetchedAt < FLAGS_TTL_MS) {
    const atFetch = evalBusinessHours(bh, api.fetchedAt + skew);
    if (
      bh.timezone !== "Asia/Tashkent" ||
      atFetch.workingTime !== api.isWorkingTime ||
      (api.isWorkingDay !== null && atFetch.workingDay !== api.isWorkingDay)
    ) {
      status = { workingDay: api.isWorkingDay ?? atFetch.workingDay, workingTime: api.isWorkingTime };
    }
  }
  const state = status.workingTime ? "open" : status.workingDay ? "closed" : "dayOff";

  const w = weekdays(locale);
  const run = bh.days.length > 1 && bh.days.every((d, i) => i === 0 || d === bh.days[i - 1] + 1);
  const days = run
    ? `${w[bh.days[0] - 1]}–${w[bh.days[bh.days.length - 1] - 1]}`
    : bh.days.map((d) => w[d - 1]).join(", ");

  // Spans only: `.ppanel__h b` would restyle a <b>.
  return (
    <span className={`bhours bhours--${state}`} title={t("holidayNote")}>
      <i className="bhours__dot" aria-hidden />
      <span className="bhours__st">{t(state)}</span>
      <span className="bhours__sch">{t("schedule", { days, start: bh.start, end: bh.end })}</span>
      {note && state !== "open" ? <span className="bhours__note">{note}</span> : null}
      {showHolidayNote ? <span className="bhours__note">{t("holidayNote")}</span> : null}
    </span>
  );
}
