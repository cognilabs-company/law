import { useTranslations } from "next-intl";
import { http, asArr, asDict, asNum, asStr, ApiError, errDetail, parseServerTime } from "@/lib/http";
import { initials } from "@/lib/lawyers";
import { statusMap, type StatusMap, type StatusToneRule } from "@/lib/labels";
import type { LiveKitJoin } from "@/lib/services/backend";

export type HistoryItem = {
  roomId: string;
  callId: string;
  callType: "audio" | "video";
  title: string;
  callerName: string;
  callerUserId: string;
  status: string;
  callStatus: string;
  startedAt: string;
  autoEndAt: string;
  endedAt: string;
  durationSeconds: number;
  participantCount: number;
  canStartNow: boolean | null;
};

export type Active = { roomId: string; callId: string; callType: "audio" | "video"; isCaller: boolean; title?: string; lk: LiveKitJoin | null };

export type Tab = "today" | "scheduled" | "past" | "all";
export type ItemState = "live" | "next" | "done" | "out";

export const TABS: Tab[] = ["today", "scheduled", "past", "all"];
export const LIVE = new Set(["active", "scheduled"]);
export const OUT = new Set(["removed", "kicked", "declined"]);
export const RECHECK_WINDOW = 86400000;
export const RECHECK_DELAY = 1500;
export const START_ID = "meeting-start";
export const REFRESH_ID = "meetings-refresh";
export const PLAT_REFRESH_ID = "meetings-all-refresh";
export const QUICK_ID = "cc-meet";
export const PAGE = 20;
export const DETAIL_SHOWN = 8;
export const ENDED_ORDER = ["ended", "expired", "cancelled"];
export const STATUS_ORDER = ["active", "scheduled", "ended", "expired", "cancelled"];
export const DURATIONS = [15, 30, 45, 60];
export const DEFAULT_MINUTES = 60;
export const PART_JOINED = new Set(["joined", "left"]);
export const PART_ORDER: Record<string, number> = { joined: 1, left: 2, invited: 3 };
export const PART_TONE: Record<string, string> = { joined: "ok", left: "mute", invited: "info", declined: "hot", removed: "hot", kicked: "hot" };
export const CALL_TONE: Record<string, string> = { active: "ok", scheduled: "info", ended: "mute", expired: "warn", cancelled: "hot", missed: "hot" };
export const END_TONE: Record<string, string> = { expired: "warn", cancelled: "hot" };

const CALL_TONES: Readonly<Record<string, StatusToneRule>> = {
  active: { tone: "ok", dot: "live" },
  scheduled: "info",
  ended: "neutral",
  expired: "warn",
  cancelled: "err",
  missed: "err",
};

const TAB_KEY = "lexgo_ccx_meetings_tab";

export function readTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return TABS.includes(v as Tab) ? (v as Tab) : "today";
  } catch {
    return "today";
  }
}

export function saveTab(tab: Tab) {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {}
}

export function useCallStatusMap(): StatusMap {
  const t = useTranslations("admin.meetings");
  return statusMap(t, "callStatus", CALL_TONES);
}

export const isMissing = (e: unknown) => e instanceof ApiError && [404, 405, 501].includes(e.status);
export const reasonOf = (e: unknown) => (e instanceof ApiError && (e.status === 0 || e.status >= 500) ? "" : errDetail(e));
export const isTransient = (e: unknown) => !(e instanceof ApiError) || e.status === 0 || (e.status >= 500 && e.status !== 501);

export function dayStart(value: string, shift = 0): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + shift).getTime() : null;
}

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function countBy<T>(list: T[], key: (x: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of list) {
    const k = key(x);
    if (k) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

export const ordered = (counts: Map<string, number>, order: string[]) => [...order.filter((s) => counts.has(s)), ...[...counts.keys()].filter((s) => !order.includes(s))];

export async function loadHistory(): Promise<HistoryItem[]> {
  const raw = await http("/calls/invited");
  const list = Array.isArray(raw) ? raw : asArr(asDict(raw).items ?? asDict(raw).data ?? asDict(raw).calls);
  return list
    .map((v) => {
      const d = asDict(v);
      return {
        roomId: asStr(d.room_id),
        callId: asStr(d.call_id ?? d.id),
        callType: asStr(d.call_type) === "audio" ? ("audio" as const) : ("video" as const),
        title: asStr(d.title),
        callerName: asStr(d.caller_name),
        callerUserId: asStr(d.caller_user_id),
        status: asStr(d.status),
        callStatus: asStr(d.call_status ?? d.status),
        startedAt: asStr(d.started_at),
        autoEndAt: asStr(d.auto_end_at),
        endedAt: asStr(d.ended_at),
        durationSeconds: asNum(d.duration_seconds),
        participantCount: asNum(d.participant_count) || asArr(d.participants).length,
        canStartNow: typeof d.can_start_now === "boolean" ? d.can_start_now : null,
      };
    })
    .filter((c) => c.roomId && c.callId);
}

export function secondsOf(c: HistoryItem): number {
  if (c.durationSeconds > 0) return c.durationSeconds;
  const a = parseServerTime(c.startedAt);
  const b = parseServerTime(c.endedAt);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? (b - a) / 1000 : 0;
}

export const startMs = (c: HistoryItem) => {
  const at = parseServerTime(c.startedAt);
  return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY;
};

export function stateOf(c: HistoryItem): ItemState {
  if (OUT.has(c.status)) return "out";
  if (c.callStatus === "active") return "live";
  if (c.callStatus === "scheduled") return "next";
  return "done";
}

const minuteSubs = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | undefined;

export function subscribeMinute(cb: () => void) {
  minuteSubs.add(cb);
  if (minuteSubs.size === 1) minuteTimer = setInterval(() => minuteSubs.forEach((fn) => fn()), 15000);
  return () => {
    minuteSubs.delete(cb);
    if (!minuteSubs.size) clearInterval(minuteTimer);
  };
}

export const readMinute = () => Math.floor(Date.now() / 60000);
export const serverMinute = () => 0;

export const domSafe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");

export const avatarText = (name: string) =>
  initials(
    name
      .split(/\s+/)
      .filter((w) => /^\p{L}/u.test(w))
      .join(" "),
  );

export const partRank = (p: { role: string; status: string }) => (p.role === "host" ? 0 : PART_ORDER[p.status] ?? 4);

export function sameDay(a: string, b: string): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return !Number.isNaN(x.getTime()) && !Number.isNaN(y.getTime()) && x.toDateString() === y.toDateString();
}
