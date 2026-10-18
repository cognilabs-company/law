import { parseServerTime } from "@/lib/http";
import type { MarketOrder, MarketPhase } from "@/lib/services/marketplace";
import type { CalendarKind, RuntimeConfig, RuntimeDuration } from "@/lib/services/marketRuntime";

export type DeadlineKind = "none" | "waiting" | "running" | "paused" | "overdue" | "closed";
export type DeadlineInfo = {
  kind: DeadlineKind;
  dueAt: number;
  startedAt: number;
  leftMs: number;
  businessDaysLeft: number;
  calendarDaysLeft: number;
  overdueMs: number;
  calendar: CalendarKind;
  duration: RuntimeDuration | null;
};

const DAY_MS = 86_400_000;
const UNITS = ["minute", "hour", "day", "week", "month"] as const;
type DurationUnit = (typeof UNITS)[number];

export function isBusinessDay(d: Date): boolean {
  const w = d.getDay();
  return w !== 0 && w !== 6;
}

export function businessDaysLeft(now: number, dueAt: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(dueAt) || dueAt <= now) return 0;
  const cur = new Date(now);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(dueAt);
  end.setHours(0, 0, 0, 0);
  let n = 0;
  for (let guard = 0; guard < 3700; guard += 1) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getTime() > end.getTime()) break;
    if (isBusinessDay(cur)) n += 1;
  }
  return n;
}

export function calendarDaysLeft(now: number, dueAt: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(dueAt)) return 0;
  return Math.max(0, Math.ceil((dueAt - now) / DAY_MS));
}

export function durationParts(d: RuntimeDuration | null): { n: number; unit: DurationUnit } | null {
  if (!d || !(d.value > 0)) return null;
  const unit = (UNITS as readonly string[]).includes(d.unit) ? (d.unit as DurationUnit) : null;
  return unit ? { n: d.value, unit } : null;
}

export function deadlineOf(
  o: Pick<MarketOrder, "startedAt" | "expectedCompletedAt" | "duration" | "deadlinePaused" | "deadlineRemainingSeconds">,
  phase: MarketPhase,
  now: number,
  runtime?: RuntimeConfig | null,
): DeadlineInfo {
  const duration = o.duration ?? (runtime && runtime.duration.value > 0 ? runtime.duration : null);
  const calendar: CalendarKind = duration?.calendar ?? "calendar";
  const dueAt = parseServerTime(o.expectedCompletedAt);
  const startedAt = parseServerTime(o.startedAt);
  const base: DeadlineInfo = { kind: "none", dueAt, startedAt, leftMs: NaN, businessDaysLeft: 0, calendarDaysLeft: 0, overdueMs: 0, calendar, duration };
  if (phase === "pending" || phase === "paid") return { ...base, kind: "waiting" };
  if (phase === "completed" || phase === "rated" || phase === "cancelled") return { ...base, kind: "closed" };
  if (phase === "review" || o.deadlinePaused) {
    const left = o.deadlineRemainingSeconds !== null && Number.isFinite(o.deadlineRemainingSeconds) ? o.deadlineRemainingSeconds * 1000 : NaN;
    return { ...base, kind: "paused", leftMs: left };
  }
  if (!Number.isFinite(dueAt)) return base;
  const left = dueAt - now;
  if (left > 0) return { ...base, kind: "running", leftMs: left, businessDaysLeft: businessDaysLeft(now, dueAt), calendarDaysLeft: calendarDaysLeft(now, dueAt) };
  return { ...base, kind: "overdue", leftMs: left, overdueMs: -left };
}
