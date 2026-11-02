import type { Page } from "@/lib/usePaged";
import { parseServerTime } from "@/lib/http";
import { byMessageTime, isActiveTicket, isVisibleMessage, isWaitingTicket, ticketActivity, timeOf, type SupportMessage, type SupportTicket } from "@/lib/services/support";
import type { AssistCapabilities } from "@/lib/services/supportAssist";

export type Tab = "new" | "mine" | "transferred" | "closed";
export type Order = "old" | "new";
export type Tone = "ok" | "warn" | "hot";
export type PillTone = "ok" | "warn" | "hot" | "info" | "mute";
export type Who = "me" | "staff" | "client" | "ai" | "sys";
export type Caps = { id: string; transfer: boolean; call: boolean };

export const TABS: Tab[] = ["new", "mine", "transferred", "closed"];
export const MINE_TABS: Tab[] = ["transferred", "closed"];
export const NEW_STATUSES = ["waiting_operator", "reopened"];
export const EMPTY_PAGE: Page<SupportTicket> = { items: [], total: 0, hasMore: false };
export const WAIT_WARN = 10;
export const WAIT_HOT = 30;
export const QUICK = ["hello", "wait", "thanks"] as const;

const GROUP_MS = 5 * 60 * 1000;
const AI_ROLES = new Set(["ai", "assistant", "ai_instructor", "bot"]);

export const asTab = (v: string): Tab | null => TABS.find((k) => k === v) ?? null;

export const aiNorm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ʻʼ'‘’`]/g, "")
    .replace(/[\s_-]+/g, " ")
    .trim();

export function queryOf(tab: Tab, onlyMine: boolean): { status?: string; assignedToMe?: boolean } {
  if (tab === "new") return { status: "waiting_operator" };
  if (tab === "mine") return { status: "active", assignedToMe: true };
  return onlyMine ? { status: tab, assignedToMe: true } : { status: tab };
}

export const oldest = (a: SupportTicket, b: SupportTicket) => timeOf(a.createdAt) - timeOf(b.createdAt);

export function pastLoaded(tk: SupportTicket, loaded: SupportTicket[]): boolean {
  const last = loaded[loaded.length - 1];
  return !last || timeOf(tk.createdAt) >= timeOf(last.createdAt);
}

export function belongs(tab: Tab, tk: SupportTicket, meId: string, onlyMine: boolean): boolean {
  const own = Boolean(meId) && tk.operatorUserId === meId;
  if (tab === "new") return isWaitingTicket(tk);
  if (tab === "mine") return own && isActiveTicket(tk);
  if (onlyMine && !own) return false;
  if (tab === "transferred") return tk.status === "transferred";
  return tk.status === "closed";
}

export function sortTickets(tab: Tab, items: SupportTicket[], order: Order): SupportTicket[] {
  const key = (t: SupportTicket) => (tab === "new" ? timeOf(t.createdAt) : ticketActivity(t));
  const dir = order === "old" ? 1 : -1;
  return [...items].sort((a, b) => (key(a) - key(b)) * dir);
}

export function matches(tk: SupportTicket, q: string): boolean {
  const needle = aiNorm(q);
  if (!needle) return true;
  return aiNorm([tk.title, tk.description, tk.lastMessage, tk.clientName, tk.clientLexgoId, tk.workId, tk.id, tk.operatorName].join(" ")).includes(needle);
}

export const codeOf = (tk: Pick<SupportTicket, "id" | "workId">) => tk.workId || (tk.id ? `#${tk.id.slice(0, 8).toUpperCase()}` : "");

export function waitTone(min: number | null): Tone {
  if (min === null) return "ok";
  return min >= WAIT_HOT ? "hot" : min >= WAIT_WARN ? "warn" : "ok";
}

export const waitShare = (min: number | null) => (min === null ? 0 : Math.max(6, Math.min(100, Math.round((min / WAIT_HOT) * 100))));

export const priorityTone = (p: string): PillTone => (p === "urgent" ? "hot" : p === "high" ? "warn" : "info");

export function statusTone(status: string): PillTone {
  if (status === "waiting_operator" || status === "reopened") return "warn";
  if (status === "closed" || status === "resolved") return "ok";
  if (status === "cancelled") return "mute";
  return "info";
}

export function mergeMessages(cur: SupportMessage[], next: SupportMessage[]): SupportMessage[] {
  const seen = new Map(cur.map((m) => [m.id, m]));
  for (const m of next) if (m.id && isVisibleMessage(m)) seen.set(m.id, m);
  return [...seen.values()].sort(byMessageTime);
}

export function near(a: string, b: string): boolean {
  const x = parseServerTime(a);
  const y = parseServerTime(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(y - x) <= GROUP_MS;
}

export function whoOf(m: SupportMessage, meId: string, clientUserId: string): Who {
  if (m.senderRole === "system" || m.messageType === "system") return "sys";
  if (meId && m.senderUserId === meId) return "me";
  if (AI_ROLES.has(m.senderRole)) return "ai";
  if ((clientUserId && m.senderUserId === clientUserId) || m.senderRole === "client") return "client";
  return "staff";
}

export function fileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function nextCaps(cur: Caps | null, id: string, c: Pick<AssistCapabilities, "operatorTransfer" | "supportCall">): Caps {
  return cur && cur.id === id && cur.transfer === c.operatorTransfer && cur.call === c.supportCall ? cur : { id, transfer: c.operatorTransfer, call: c.supportCall };
}
