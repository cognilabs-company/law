// Working-hours math for the Asia/Tashkent schedule (GET /calendar/business-hours).
// Uzbekistan is UTC+05:00 all year (no DST since 1992), so a fixed offset is
// exact and needs no Intl time-zone data (same no-Intl style as lib/date.ts).
// Public holidays are not modelled — the backend doesn't store them yet.
import type { BusinessHours } from "@/lib/services/backend";

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

export type BusinessStatus = { workingDay: boolean; workingTime: boolean };

const toMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function evalBusinessHours(bh: Pick<BusinessHours, "days" | "start" | "end">, nowMs: number): BusinessStatus {
  const t = new Date(nowMs + TASHKENT_OFFSET_MS);
  const isoDay = t.getUTCDay() || 7;
  const minute = t.getUTCHours() * 60 + t.getUTCMinutes();
  const workingDay = bh.days.includes(isoDay);
  return { workingDay, workingTime: workingDay && minute >= toMin(bh.start) && minute < toMin(bh.end) };
}
