import type { UrgentEligibleSource, UrgentRequest } from "@/lib/services/backend";
import { humanize } from "@/lib/labels";

export type Te = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

export const OFFLINE_POLL_MS = 45_000;
export const PAGE = 20;
export const SLA_MIN = 15;
export const MIN_SUMMARY = 5;
export const MIN_REASON = 3;
export const CAND_PAGE = 8;
export const SOURCES_SHOWN = 3;
export const GROUP = "second_opinion_group";
export const AI_ITEM = "call_center.urgent-advokat.item";

export const KINDS = [
  "video_consultation",
  "express_video_consultation",
  "traffic_accident_consultation",
  "chat_consultation",
  "second_opinion_single",
  "second_opinion_group",
] as const;

export const DIRECTION_SLUGS = ["jinoiy", "fuqarolik", "oila", "mehnat", "mamuriy", "iqtisodiy", "soliq", "shartnoma"];

export type View = { value: string; key: string; archive: boolean };

export const VIEWS: View[] = [
  { value: "active", key: "viewActive", archive: false },
  { value: "open_pool", key: "tabOpenPool", archive: false },
  { value: "claimed", key: "tabClaimed", archive: false },
  { value: "scheduled", key: "tabScheduled", archive: false },
  { value: "in_progress", key: "tabInProgress", archive: false },
  { value: "meeting_active", key: "tabMeetingActive", archive: false },
  { value: "archive", key: "viewArchive", archive: true },
];

export const FINAL = new Set(["completed", "cancelled", "expired"]);
export const STATUS_SKIP = new Set(["completed", "cancelled", "expired"]);

export type RowAct = "claim" | "join" | "chat" | "meeting" | "detail";
export type Step = "" | "complete" | "transfer" | "cancel" | "candidates" | "status";
export type Ask = { id: string; act: Step; n: number };
export type Change = { id: string; title: string; body?: string; status?: string };

export const statusOf = (r: UrgentRequest) => r.status || "open_pool";
export const isFinal = (r: UrgentRequest) => (r.finalStatuses.length ? r.finalStatuses.includes(statusOf(r)) : FINAL.has(statusOf(r)));
export const inView = (r: UrgentRequest, view: string) => (view === "active" ? !isFinal(r) : view === "archive" ? isFinal(r) : statusOf(r) === view);

export const stamp = (v: string, none: number) => {
  const n = v ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : none;
};

const dueAt = (r: UrgentRequest) => (r.slaBreached ? 0 : stamp(r.scheduledAt, Infinity));

export const byUrgency = (a: UrgentRequest, b: UrgentRequest) => {
  const pool = Number(statusOf(a) !== "open_pool") - Number(statusOf(b) !== "open_pool");
  if (pool) return pool;
  const due = dueAt(a) - dueAt(b);
  if (due) return due;
  return stamp(a.createdAt, Infinity) - stamp(b.createdAt, Infinity) || 0;
};

export const byRecent = (a: UrgentRequest, b: UrgentRequest) =>
  stamp(b.completedAt || b.cancelledAt || b.updatedAt || b.createdAt, 0) - stamp(a.completedAt || a.cancelledAt || a.updatedAt || a.createdAt, 0);

export const sorterFor = (view: string) => (VIEWS.find((x) => x.value === view)?.archive ? byRecent : byUrgency);

export const ntfId = (id: string) => `urgent-${id}`;

export function chatHref(r: Pick<UrgentRequest, "secureChatRoomId" | "id" | "workId" | "serviceTitle">, label?: string): string {
  const q = new URLSearchParams({ ua: r.id });
  if (r.workId) q.set("wid", r.workId);
  const svc = label || r.serviceTitle;
  if (svc) q.set("svc", svc);
  return `/portal/chat/${r.secureChatRoomId}?${q.toString()}`;
}

export function rowAction(r: UrgentRequest): RowAct {
  const st = statusOf(r);
  if (st === "open_pool" || (r.nextStatuses.includes("claimed") && !r.claimedByUserId)) return "claim";
  if (!r.nextStatuses.length) return "detail";
  if (r.channel === "chat") return r.secureChatRoomId ? "chat" : "detail";
  if (st === "meeting_active") return "join";
  if (r.serviceKind === GROUP && !r.groupLawyers.length) return "detail";
  return st === "claimed" || st === "scheduled" ? "meeting" : "detail";
}

export function statusChoicesOf(r: UrgentRequest, me: string): string[] {
  return r.nextStatuses.filter((s) => !STATUS_SKIP.has(s) && (s !== "claimed" || (!!r.claimedByUserId && r.claimedByUserId === me)));
}

export function kindName(tk: Te, r: Pick<UrgentRequest, "serviceKind" | "serviceTitle">): string {
  return tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || humanize(r.serviceKind);
}

export function dedupeSources(list: UrgentEligibleSource[]): UrgentEligibleSource[] {
  const by = new Map<string, UrgentEligibleSource>();
  for (const s of list) {
    const k = s.id || `${s.type}|${s.title}|${s.createdAt}`;
    const had = by.get(k);
    if (!had || stamp(s.createdAt, 0) > stamp(had.createdAt, 0)) by.set(k, s);
  }
  return [...by.values()].sort((a, b) => stamp(b.createdAt, 0) - stamp(a.createdAt, 0));
}

const FLOW_AT: Readonly<Record<string, number>> = { open_pool: 0, claimed: 1, scheduled: 2, in_progress: 2, meeting_active: 3, completed: 4 };

const flowOfStatus = (r: UrgentRequest, s: string): number => {
  if (r.channel === "chat" && s === "in_progress") return 3;
  return FLOW_AT[s] ?? -1;
};

export function flowIndex(r: UrgentRequest): number {
  const own = flowOfStatus(r, statusOf(r));
  if (own === 1 && (r.groupLawyers.length || r.assignedLawyer)) return 2;
  if (own >= 0) return own;
  return r.statusHistory.reduce((m, h) => Math.max(m, flowOfStatus(r, h.to)), 0);
}

export function claimedAtOf(r: UrgentRequest): number {
  const h = r.statusHistory.find((x) => x.to && x.to !== "open_pool");
  return h ? stamp(h.at, NaN) : NaN;
}

export function clockOf(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const telOf = (phone: string) => phone.replace(/[^+\d]/g, "");
