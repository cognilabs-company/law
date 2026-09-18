// Seller working hours (T0-20 / T4-01): GET/PUT /lawyers/me/availability.
// Backend shape: {timezone, weekly:[{day 0..6 (0 = Monday), enabled, start, end}],
// exceptions:[], response_deadlines_minutes:{manual, auto, sos}}, source
// "default" | "custom". Days are exposed here as mon..sun keys.
import { http, asDict, asStr, asNum, asArr } from "@/lib/http";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type WeeklyDay = { day: DayKey; enabled: boolean; start: string; end: string };
export type ResponseDeadlines = { manual: number; auto: number; sos: number };
export type SellerAvailability = {
  timezone: string;
  weekly: WeeklyDay[];
  exceptions: Record<string, unknown>[];
  deadlines: ResponseDeadlines;
  source: "default" | "custom";
};

export const DEFAULT_DEADLINES: ResponseDeadlines = { manual: 30, auto: 15, sos: 5 };

function normAvailability(v: unknown): SellerAvailability {
  const d = asDict(v);
  const a = asDict(d.availability ?? d);
  const dl = asDict(a.response_deadlines_minutes);
  const weeklyRaw = asArr(a.weekly).map((x) => asDict(x));
  const weekly: WeeklyDay[] = DAY_KEYS.map((key, i) => {
    const row = weeklyRaw.find((r) => asNum(r.day) === i);
    return { day: key, enabled: row ? row.enabled !== false : i < 6, start: asStr(row?.start, "09:00"), end: asStr(row?.end, "19:00") };
  });
  return {
    timezone: asStr(a.timezone, "Asia/Tashkent"),
    weekly,
    exceptions: asArr(a.exceptions).map((x) => asDict(x)),
    deadlines: { manual: asNum(dl.manual) || 30, auto: asNum(dl.auto) || 15, sos: asNum(dl.sos) || 5 },
    source: asStr(d.source) === "custom" ? "custom" : "default",
  };
}

export async function getMyAvailability(): Promise<SellerAvailability> {
  return normAvailability(await http("/lawyers/me/availability"));
}

export async function putMyAvailability(a: { timezone?: string; weekly: WeeklyDay[]; exceptions?: Record<string, unknown>[]; deadlines: ResponseDeadlines }): Promise<SellerAvailability> {
  const body = {
    timezone: a.timezone || "Asia/Tashkent",
    weekly: a.weekly.map((w) => ({ day: DAY_KEYS.indexOf(w.day), enabled: w.enabled, start: w.start, end: w.end })),
    exceptions: a.exceptions ?? [],
    response_deadlines_minutes: a.deadlines,
  };
  return normAvailability(await http("/lawyers/me/availability", { method: "PUT", body: JSON.stringify(body) }));
}

// Helpers for the simple editor (one start/end for all enabled days).
export const enabledDays = (a: SellerAvailability): DayKey[] => a.weekly.filter((w) => w.enabled).map((w) => w.day);
export const weeklyFrom = (days: string[], start: string, end: string): WeeklyDay[] =>
  DAY_KEYS.map((day) => ({ day, enabled: days.includes(day), start: start || "09:00", end: end || "19:00" }));
