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

// Response deadline for a seller (T0-20 / S-20): `minutes` of working time
// after `fromMs`. Outside working hours the clock starts at the next working
// day's opening (09:00 → deadline 09:30 for a 30-minute window). Public
// holidays: `holidays` as YYYY-MM-DD strings when the backend sends them.
export function responseDeadline(bh: Pick<BusinessHours, "days" | "start" | "end"> & { holidays?: string[] }, fromMs: number, minutes = 30): number {
  const holidays = new Set(bh.holidays ?? []);
  let t = new Date(fromMs + TASHKENT_OFFSET_MS); // Tashkent wall clock in UTC fields
  const startMin = toMin(bh.start), endMin = toMin(bh.end);
  const isWorking = (d: Date) => bh.days.includes(d.getUTCDay() || 7) && !holidays.has(d.toISOString().slice(0, 10));
  let left = minutes;
  for (let guard = 0; guard < 400; guard++) {
    const minute = t.getUTCHours() * 60 + t.getUTCMinutes();
    if (!isWorking(t) || minute >= endMin) {
      // Jump to the next day's opening.
      t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, Math.floor(startMin / 60), startMin % 60));
      continue;
    }
    if (minute < startMin) { t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), Math.floor(startMin / 60), startMin % 60)); continue; }
    const avail = endMin - minute;
    if (left <= avail) { t = new Date(t.getTime() + left * 60000); break; }
    left -= avail;
    t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, Math.floor(startMin / 60), startMin % 60));
  }
  return t.getTime() - TASHKENT_OFFSET_MS;
}

// "Bugun 14:30" / "Ertaga 09:30" / "18.09, 09:30" for a deadline, in Tashkent time.
export function deadlineLabel(deadlineMs: number, nowMs: number, words: { today: string; tomorrow: string }): string {
  const d = new Date(deadlineMs + TASHKENT_OFFSET_MS), n = new Date(nowMs + TASHKENT_OFFSET_MS);
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const dayDiff = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())) / 86400000);
  if (dayDiff === 0) return `${words.today} ${hm}`;
  if (dayDiff === 1) return `${words.tomorrow} ${hm}`;
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}, ${hm}`;
}
