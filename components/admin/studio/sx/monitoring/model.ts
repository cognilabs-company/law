import { asDict, parseServerTime } from "@/lib/http";
import type { InternalEvent } from "@/lib/internalSocket";
import { isStudioEvent, type StudioActivity, type StudioAuditEvent, type StudioMonitoringUser } from "@/lib/services/studio";
import type { UserEvent } from "@/lib/userSocket";

export type MonPeriod = "today" | "yesterday" | "week" | "month" | "all" | "custom";
export const MON_PERIODS: readonly Exclude<MonPeriod, "custom">[] = ["today", "yesterday", "week", "month", "all"];

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const TZ_OFFSET_MS = 5 * HOUR_MS;
export const STALE_MS = 5 * 60_000;
export const SHORT_SEC = 5;
export const POLL_MS = 60_000;

export type MonRange = { from: number | null; to: number | null };
export type MonQuery = { date?: string; dateFrom?: string; dateTo?: string };

const pad = (n: number) => String(n).padStart(2, "0");

export function localDayKey(ms: number): string {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

export function localDayStart(key: string): number {
  return Date.parse(`${key}T00:00:00Z`) - TZ_OFFSET_MS;
}

export function shiftDayKey(key: string, n: number): string {
  return localDayKey(localDayStart(key) + n * DAY_MS + 12 * HOUR_MS);
}

export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function localHour(ms: number): number {
  return new Date(ms + TZ_OFFSET_MS).getUTCHours();
}

export function hm(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + TZ_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function dm(ms: number): string {
  const d = new Date(ms + TZ_OFFSET_MS);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`;
}

export function isoAt(ms: number): string {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

export function rangeOf(period: MonPeriod, dateFrom: string, dateTo: string, now: number): MonRange {
  const today = localDayStart(localDayKey(now));
  if (period === "today") return { from: today, to: today + DAY_MS };
  if (period === "yesterday") return { from: today - DAY_MS, to: today };
  if (period === "week") return { from: today - 6 * DAY_MS, to: today + DAY_MS };
  if (period === "month") return { from: today - 29 * DAY_MS, to: today + DAY_MS };
  if (period === "custom") {
    return { from: dateFrom ? localDayStart(dateFrom) : null, to: dateTo ? localDayStart(dateTo) + DAY_MS : null };
  }
  return { from: null, to: null };
}

export function queryOf(r: MonRange): MonQuery {
  const a = r.from === null ? "" : utcDayKey(r.from);
  const b = r.to === null ? "" : utcDayKey(r.to - 1);
  if (a && b && a === b) return { date: a };
  return { dateFrom: a || undefined, dateTo: b || undefined };
}

export function auditQueryOf(r: MonRange): { dateFrom?: string; dateTo?: string } {
  const q = queryOf(r);
  return { dateFrom: q.date ?? q.dateFrom, dateTo: q.date ?? q.dateTo };
}

export function rangeIsOpen(r: MonRange, now: number): boolean {
  return r.to === null || r.to > now;
}

export function inRange(ms: number, r: MonRange): boolean {
  if (!Number.isFinite(ms)) return false;
  if (r.from !== null && ms < r.from) return false;
  if (r.to !== null && ms >= r.to) return false;
  return true;
}

export type MonRow = { a: StudioActivity; at: number };

export type MonSession = {
  key: string;
  a: StudioActivity;
  at: number;
  start: number;
  end: number;
  live: boolean;
  stale: boolean;
  sec: number;
  short: boolean;
  day: string;
};

export function sessionOf(r: MonRow, now: number): MonSession {
  const a = r.a;
  const start = parseServerTime(a.startedAt);
  const seen = parseServerTime(a.lastSeenAt);
  const stale = a.online && now > 0 && Number.isFinite(seen) && now - seen > STALE_MS;
  const live = a.online && !stale;
  let end: number;
  let sec: number;
  if (live) {
    end = now > 0 ? now : Number.isFinite(seen) ? seen : start;
    sec = a.durationSec + (now > 0 && r.at ? Math.max(0, (now - r.at) / 1000) : 0);
  } else if (stale) {
    end = seen;
    sec = a.durationSec > 0 ? a.durationSec : Number.isFinite(start) ? Math.max(0, (seen - start) / 1000) : 0;
  } else {
    const e = parseServerTime(a.endedAt || a.lastSeenAt);
    end = Number.isFinite(e) ? e : Number.isFinite(start) ? start + a.durationSec * 1000 : NaN;
    sec = a.durationSec;
  }
  if (Number.isFinite(start) && Number.isFinite(end) && end < start) end = start;
  return {
    key: a.sessionId || `${a.userId}-${a.startedAt}`,
    a,
    at: r.at,
    start,
    end,
    live,
    stale,
    sec,
    short: !live && sec < SHORT_SEC,
    day: Number.isFinite(start) ? localDayKey(start) : "",
  };
}

export function overlaps(s: MonSession, r: MonRange): boolean {
  if (!Number.isFinite(s.start)) return r.from === null && r.to === null;
  const end = Number.isFinite(s.end) ? s.end : s.start;
  if (r.to !== null && s.start >= r.to) return false;
  if (r.from !== null && end < r.from) return false;
  return true;
}

export function sortSessions(list: readonly MonSession[]): MonSession[] {
  return [...list].sort((x, y) => Number(y.live) - Number(x.live) || (Number.isFinite(y.start) ? y.start : 0) - (Number.isFinite(x.start) ? x.start : 0));
}

export function activeMs(s: MonSession, from: number, to: number): number {
  if (!Number.isFinite(s.start) || !Number.isFinite(s.end)) return 0;
  const lo = Math.max(from, s.start);
  const hi = Math.min(to, s.end);
  if (hi <= lo) return 0;
  const wall = s.end - s.start;
  const ratio = wall > 0 ? Math.min(1, (s.sec * 1000) / wall) : 1;
  return (hi - lo) * ratio;
}

export type MonBucket = { from: number; to: number; ms: number; people: number; current: boolean };
export type MonAxis = { from: number; to: number; unit: "hour" | "day" | "week"; ticks: { at: number; label: string }[] };

export function axisOf(r: MonRange, sessions: readonly MonSession[], now: number): MonAxis | null {
  const starts = sessions.map((s) => s.start).filter(Number.isFinite);
  const today = localDayStart(localDayKey(now || Date.UTC(2000, 0, 1)));
  const from = r.from ?? (starts.length ? localDayStart(localDayKey(Math.min(...starts))) : null);
  if (from === null) return null;
  const ends = sessions.map((s) => s.end).filter(Number.isFinite);
  const to = r.to ?? Math.max(today + DAY_MS, ends.length ? localDayStart(localDayKey(Math.max(...ends))) + DAY_MS : from + DAY_MS);
  const days = Math.max(1, Math.round((to - from) / DAY_MS));
  const ticks: MonAxis["ticks"] = [];
  if (days <= 1) {
    for (let h = 0; h <= 24; h += 3) ticks.push({ at: from + h * HOUR_MS, label: `${pad(h)}:00` });
    return { from, to, unit: "hour", ticks };
  }
  const step = Math.max(1, Math.ceil(days / 7));
  for (let d = 0; d < days; d += step) ticks.push({ at: from + d * DAY_MS, label: dm(from + d * DAY_MS) });
  return { from, to, unit: days > 62 ? "week" : "day", ticks };
}

export function bucketsOf(axis: MonAxis, sessions: readonly MonSession[], now: number): MonBucket[] {
  const size = axis.unit === "hour" ? HOUR_MS : axis.unit === "day" ? DAY_MS : 7 * DAY_MS;
  const out: MonBucket[] = [];
  for (let at = axis.from; at < axis.to; at += size) {
    const to = Math.min(axis.to, at + size);
    let ms = 0;
    const people = new Set<string>();
    for (const s of sessions) {
      const v = activeMs(s, at, to);
      if (v > 0) {
        ms += v;
        people.add(s.a.userId || s.a.userName);
      }
    }
    out.push({ from: at, to, ms, people: people.size, current: now >= at && now < to });
  }
  return out;
}

export type MonPerson = {
  id: string;
  name: string;
  role: string;
  live: boolean;
  lastSeen: number;
  sec: number;
  sessions: number;
  saves: number;
  list: MonSession[];
};

export function peopleOf(sessions: readonly MonSession[], users: readonly StudioMonitoringUser[]): MonPerson[] {
  const byId = new Map<string, MonPerson>();
  const known = new Map(users.map((u) => [u.id, u]));
  for (const s of sessions) {
    const id = s.a.userId || s.a.userName;
    if (!id) continue;
    let p = byId.get(id);
    if (!p) {
      const u = known.get(id);
      p = { id, name: s.a.userName || u?.name || "", role: s.a.role || u?.role || "", live: false, lastSeen: 0, sec: 0, sessions: 0, saves: 0, list: [] };
      byId.set(id, p);
    }
    p.list.push(s);
    p.live = p.live || s.live;
    p.sec += s.sec;
    if (!s.short) p.sessions += 1;
    p.saves += s.a.saveCount;
    if (Number.isFinite(s.end)) p.lastSeen = Math.max(p.lastSeen, s.end);
  }
  return [...byId.values()].sort((x, y) => Number(y.live) - Number(x.live) || y.sec - x.sec || x.name.localeCompare(y.name));
}

export function actsOf(s: MonSession, events: readonly StudioAuditEvent[]): StudioAuditEvent[] {
  if (!Number.isFinite(s.start)) return [];
  const end = Number.isFinite(s.end) ? s.end : s.start;
  return events.filter((x) => x.userId === s.a.userId && x.at >= s.start - 1000 && x.at <= end + 5000 && (!s.a.objectId || x.targetId === s.a.objectId)).sort((x, y) => x.at - y.at);
}

export function eventRaw(e: UserEvent): Record<string, unknown> {
  const d = asDict(e.data ?? e.payload ?? e.activity ?? e.session);
  const base = Object.keys(d).length ? d : (e as Record<string, unknown>);
  const inner = asDict(base.activity ?? base.session);
  return Object.keys(inner).length ? { ...base, ...inner } : base;
}

export function sessionKey(raw: Record<string, unknown>): string {
  const v = raw.session_id ?? raw.sessionId ?? raw.id;
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

export function channelEvent(e: InternalEvent): UserEvent | null {
  if (isStudioEvent(e.event)) return e;
  if (!sessionKey(eventRaw(e))) return null;
  return { ...e, event: /end|close|stop|offline/i.test(e.event) ? "studio.activity_ended" : "studio.activity" };
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0][0] ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : (parts[0][1] ?? "");
  return (a + b).toUpperCase();
}

const AVATAR_HUES = ["blue", "violet", "jade", "cyan", "amber", "crimson", "orange", "teal", "iris", "plum"] as const;

export function avatarHue(seed: string): (typeof AVATAR_HUES)[number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function matches(q: string, parts: readonly string[]): boolean {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = parts.join(" ").toLowerCase();
  return terms.every((t) => hay.includes(t));
}
