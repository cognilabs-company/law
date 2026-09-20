"use client";

// CRM lead assignment, auto-distribution and filters (GM item 7).
//
// The backend (HEAD f6c94f8) has no assignee column and no assign /
// auto-assign endpoint, so an assignment lives inside `lead.details`:
//   assigned_to_user_id · assigned_at · assigned_by
// written through PATCH /admin/leads/{id} (leads.manage). That PATCH replaces
// `details` whole (only the kanban key is preserved server-side), so the
// current details are always merged in before the write.
//
// backend.ts's normLead reads the score as a number, but the backend stores
// "hot" | "warm" | "cold" — so the boards are re-read raw here and normalised
// with the score kept (`scoreKey`). Everything else mirrors normLead.
import { useEffect, useState, useSyncExternalStore } from "react";
import { http, asDict, asStr, asNum, asArr, ApiError, parseServerTime } from "@/lib/http";
import { adminUpdateLead, type Lead, type KanbanColumn } from "@/lib/services/backend";
import { listOperators, type AdminUser } from "@/lib/services/users";
import { sessionRoles, type Session } from "@/lib/auth";

export type LeadScore = "hot" | "warm" | "cold";
export const LEAD_SCORES: readonly LeadScore[] = ["hot", "warm", "cold"];

export type LeadX = Lead & {
  scoreKey: LeadScore | "";
  assignedTo: string; // user id ("" = unassigned)
  assignedAt: string;
  assignedBy: string;
};
export type KanbanCardX = { lead: LeadX; position: number };
export type KanbanColumnX = Omit<KanbanColumn, "cards"> & { cards: KanbanCardX[] };

const normScore = (v: unknown): LeadScore | "" => {
  const s = asStr(v).trim().toLowerCase();
  return s === "hot" || s === "warm" || s === "cold" ? s : "";
};

// Assignee id carried in the details (works for a plain Lead too).
export const assigneeOf = (lead: Lead): string => asStr(asDict(lead.details).assigned_to_user_id);
// Platform user behind the lead, when the backend recorded one.
export const leadUserId = (lead: Lead): string => { const d = asDict(lead.details); return asStr(d.user_id ?? d.client_user_id ?? d.created_by_user_id); };

export function normLeadX(v: unknown): LeadX {
  const d = asDict(v);
  const det = asDict(d.details) as Record<string, unknown>;
  return {
    id: asStr(d.id),
    name: asStr(det.name ?? d.name),
    phone: asStr(det.phone ?? d.phone),
    source: asStr(d.source),
    category: asStr(d.category),
    region: asStr(d.region),
    urgency: asStr(d.urgency),
    note: asStr(det.note ?? det.message ?? d.note),
    status: asStr(d.status),
    score: asNum(d.score),
    createdAt: asStr(d.created_at ?? d.createdAt),
    details: det,
    scoreKey: normScore(d.score ?? det.score),
    assignedTo: asStr(det.assigned_to_user_id),
    assignedAt: asStr(det.assigned_at),
    assignedBy: asStr(det.assigned_by),
  };
}

function listFrom(data: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  const d = asDict(data);
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as unknown[];
  return [];
}

function normKanbanX(data: unknown): KanbanColumnX[] {
  return listFrom(data, "columns", "items", "data")
    .map((c) => {
      const d = asDict(c);
      return {
        key: asStr(d.key),
        title: asStr(d.title),
        color: asStr(d.color),
        order: asNum(d.order),
        isFinal: Boolean(d.is_final),
        count: asNum(d.count),
        cards: asArr(d.leads).map((x) => {
          const l = asDict(x);
          return { lead: normLeadX(l.lead ?? l), position: asNum(l.position) };
        }),
      };
    })
    .sort((a, b) => a.order - b.order);
}

// Admin sales board (leads.manage).
export async function getLeadKanbanX(f?: LeadFilter): Promise<KanbanColumnX[]> {
  const cols = normKanbanX(await http(`/admin/leads/kanban${leadQuery(f)}`));
  rememberAssignees(cols);
  return cols;
}

// Call-center board (call-center staff or leads.manage). Concurrent callers
// on the same page (board + queue) share one request per filter.
const ccInflight = new Map<string, Promise<KanbanColumnX[]>>();
export function getCallCenterKanbanX(f?: LeadFilter): Promise<KanbanColumnX[]> {
  const qs = leadQuery(f);
  const inflight = ccInflight.get(qs);
  if (inflight) return inflight;
  const p = http(`/call-center/leads/kanban${qs}`)
    .then((raw) => {
      const cols = normKanbanX(raw);
      rememberAssignees(cols);
      return cols;
    })
    .finally(() => {
      ccInflight.delete(qs);
    });
  ccInflight.set(qs, p);
  return p;
}

// Flat list of the board's leads.
export const leadsOf = (cols: KanbanColumnX[]): LeadX[] => cols.flatMap((c) => c.cards.map((x) => x.lead));

// Replace one lead on the board in place (optimistic updates).
export function patchLeadInColumns(cols: KanbanColumnX[], leadId: string, patch: (l: LeadX) => LeadX): KanbanColumnX[] {
  return cols.map((c) => (c.cards.some((x) => x.lead.id === leadId) ? { ...c, cards: c.cards.map((x) => (x.lead.id === leadId ? { ...x, lead: patch(x.lead) } : x)) } : c));
}

// ── Permissions ──────────────────────────────────────────────────
// PATCH /admin/leads/{id} needs leads.manage (admins hold everything). The
// server's 403 is still handled by every caller — this only decides what to
// show up front.
export function canManageLeads(s: Session | null): boolean {
  if (!s) return false;
  if (sessionRoles(s).some((r) => r === "admin" || r === "superadmin")) return true;
  return (s.permissions ?? []).includes("leads.manage");
}

// ── Assignment ───────────────────────────────────────────────────
export const isForbiddenErr = (e: unknown): boolean => e instanceof ApiError && e.status === 403;

// Details with the assignment set (userId "") or cleared.
function assignedDetails(details: Record<string, unknown>, userId: string, byUserId: string, at: string): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(details ?? {}) };
  if (userId) {
    next.assigned_to_user_id = userId;
    next.assigned_at = at;
    next.assigned_by = byUserId;
  } else {
    delete next.assigned_to_user_id;
    delete next.assigned_at;
    delete next.assigned_by;
  }
  return next;
}

// The lead as it will look once the assignment is saved.
export function withAssignment(lead: LeadX, userId: string, byUserId: string, at: string): LeadX {
  return {
    ...lead,
    details: assignedDetails(lead.details, userId, byUserId, at),
    assignedTo: userId,
    assignedAt: userId ? at : "",
    assignedBy: userId ? byUserId : "",
  };
}

// (Re)assign one lead; userId "" removes the assignment. Throws ApiError
// (403 for accounts without leads.manage).
export async function assignLead(lead: Lead, userId: string, byUserId = ""): Promise<Lead> {
  const at = new Date().toISOString();
  const saved = await adminUpdateLead(lead.id, { details: assignedDetails(asDict(lead.details) as Record<string, unknown>, userId, byUserId, at) });
  rememberAssignee(lead.id, userId);
  return saved;
}

export type AssignStrategy = "round_robin" | "least_loaded";
export type Assignment = { lead: LeadX; operator: AdminUser };

const regionKey = (r: string) => r.trim().toLowerCase();

// Plan a distribution of the UNASSIGNED leads over the operators. An operator
// in the lead's region is preferred; when none matches every operator is a
// candidate. round_robin walks the operator list in order (one global cursor,
// so region-matched picks still rotate); least_loaded picks the candidate with
// the fewest leads, counting the ones already assigned on the board.
// Pure: nothing is persisted here.
export function autoAssign(leads: LeadX[], operators: AdminUser[], strategy: AssignStrategy = "round_robin"): Assignment[] {
  const ops = operators.filter((o) => o.id);
  if (!ops.length) return [];
  const load = new Map<string, number>(ops.map((o) => [o.id, 0]));
  for (const l of leads) if (l.assignedTo && load.has(l.assignedTo)) load.set(l.assignedTo, (load.get(l.assignedTo) ?? 0) + 1);
  let cursor = 0;
  const out: Assignment[] = [];
  for (const lead of leads) {
    if (lead.assignedTo) continue;
    const rk = regionKey(lead.region);
    const same = rk ? ops.filter((o) => regionKey(o.region) === rk) : [];
    const pool = same.length ? same : ops;
    let pick: AdminUser = pool[0];
    if (strategy === "least_loaded") {
      for (const o of pool) if ((load.get(o.id) ?? 0) < (load.get(pick.id) ?? 0)) pick = o;
    } else {
      for (let i = 0; i < ops.length; i++) {
        const j = (cursor + i) % ops.length;
        if (pool.includes(ops[j])) {
          pick = ops[j];
          cursor = j + 1;
          break;
        }
      }
    }
    load.set(pick.id, (load.get(pick.id) ?? 0) + 1);
    out.push({ lead, operator: pick });
  }
  return out;
}

export type ApplyResult = { done: number; failed: number; forbidden: boolean };

// Save a plan lead by lead (there is no bulk endpoint). Stops at the first 403
// — the account can't assign at all — and reports how far it got. `onEach`
// runs after every successful save so the board can update as it goes.
export async function applyAssignments(plan: Assignment[], byUserId: string, onEach?: (a: Assignment, at: string) => void): Promise<ApplyResult> {
  const res: ApplyResult = { done: 0, failed: 0, forbidden: false };
  for (const a of plan) {
    const at = new Date().toISOString();
    try {
      await adminUpdateLead(a.lead.id, { details: assignedDetails(a.lead.details, a.operator.id, byUserId, at) });
      rememberAssignee(a.lead.id, a.operator.id);
      res.done += 1;
      onEach?.(a, at);
    } catch (e) {
      if (isForbiddenErr(e)) {
        res.forbidden = true;
        break;
      }
      res.failed += 1;
    }
  }
  return res;
}

// ── Filters (client-side over the loaded board / queue) ──────────
export type LeadFilter = {
  q: string;
  region: string;
  source: string;
  stage: string; // column key / status — applied by the caller (columns, queue status)
  score: string; // hot | warm | cold | ""
  urgency: string;
  assignee: string; // "" all · "unassigned" · "mine" · a user id
  from: string; // YYYY-MM-DD (lead.createdAt, local day)
  to: string;
};
export const EMPTY_LEAD_FILTER: LeadFilter = { q: "", region: "", source: "", stage: "", score: "", urgency: "", assignee: "", from: "", to: "" };
export const filterActive = (f: LeadFilter): boolean => Object.values(f).some((v) => v !== "");

// `?region=&source=&assigned_operator_user_id=&date_from=&date_to=` (2026-09-19
// backend: GET /admin/leads, /admin/leads/kanban and /call-center/leads/kanban
// all take these server-side now). "unassigned"/"mine" have no backend
// equivalent, so only a real operator id is forwarded — the client-side
// filter below still runs afterwards as the final pass either way.
function leadQuery(f?: LeadFilter): string {
  if (!f) return "";
  const qs = new URLSearchParams();
  if (f.region) qs.set("region", f.region);
  if (f.source) qs.set("source", f.source);
  if (f.assignee && f.assignee !== "unassigned" && f.assignee !== "mine") qs.set("assigned_operator_user_id", f.assignee);
  if (f.from) qs.set("date_from", f.from);
  if (f.to) qs.set("date_to", f.to);
  const q = qs.toString();
  return q ? `?${q}` : "";
}

// Local calendar day of a server timestamp ("" when unusable).
export function leadDay(createdAt: string): string {
  const t = parseServerTime(createdAt);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The minimum a list entry needs for matching (leads and queue items alike).
export type LeadFilterable = { text: string; region: string; source: string; scoreKey: string; urgency: string; createdAt: string; assignedTo: string };
export const leadFilterable = (l: LeadX): LeadFilterable => ({
  text: `${l.name} ${l.phone} ${l.category} ${l.note}`,
  region: l.region,
  source: l.source,
  scoreKey: l.scoreKey,
  urgency: l.urgency,
  createdAt: l.createdAt,
  assignedTo: l.assignedTo,
});

export function leadMatches(x: LeadFilterable, f: LeadFilter, meId: string): boolean {
  const q = f.q.trim().toLowerCase();
  if (q && !x.text.toLowerCase().includes(q)) return false;
  if (f.region && x.region !== f.region) return false;
  if (f.source && x.source !== f.source) return false;
  if (f.score && x.scoreKey !== f.score) return false;
  if (f.urgency && x.urgency !== f.urgency) return false;
  if (f.assignee === "unassigned") {
    if (x.assignedTo) return false;
  } else if (f.assignee === "mine") {
    if (!meId || x.assignedTo !== meId) return false;
  } else if (f.assignee && x.assignedTo !== f.assignee) return false;
  if (f.from || f.to) {
    const day = leadDay(x.createdAt);
    if (!day) return false;
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
  }
  return true;
}

// ── Assignee map shared across the call-center page ──────────────
// The queue (GET /call-center/queue) returns no details, so its "my leads"
// toggle and chips read the lead → assignee map that the last board fetch
// produced. `ensureAssignees` loads it when nothing recent is there.
const EMPTY_MAP: Record<string, string> = {};
let assigneeMap: Record<string, string> = EMPTY_MAP;
let assigneesAt = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
function rememberAssignees(cols: KanbanColumnX[]): void {
  const next: Record<string, string> = {};
  for (const l of leadsOf(cols)) next[l.id] = l.assignedTo;
  assigneeMap = next;
  assigneesAt = Date.now();
  emit();
}
function rememberAssignee(leadId: string, userId: string): void {
  assigneeMap = { ...assigneeMap, [leadId]: userId };
  emit();
}
const subscribeAssignees = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const readAssignees = () => assigneeMap;
export function useLeadAssignees(): Record<string, string> {
  return useSyncExternalStore(subscribeAssignees, readAssignees, () => EMPTY_MAP);
}
export function ensureAssignees(maxAgeMs = 60_000): Promise<void> {
  if (Date.now() - assigneesAt < maxAgeMs) return Promise.resolve();
  return getCallCenterKanbanX().then(
    () => undefined,
    () => undefined,
  );
}

// ── Operator directory ───────────────────────────────────────────
// GET /admin/users needs users.manage, which call-center operators lack —
// they get status "forbidden" and the UI falls back to "you" / "operator".
export type OpsStatus = "loading" | "ready" | "forbidden" | "error";
let opsCache: { ops: AdminUser[]; at: number } | null = null;
let opsInflight: Promise<AdminUser[]> | null = null;
const OPS_TTL = 5 * 60_000;
export function loadOperators(): Promise<AdminUser[]> {
  if (opsCache && Date.now() - opsCache.at < OPS_TTL) return Promise.resolve(opsCache.ops);
  if (opsInflight) return opsInflight;
  opsInflight = listOperators()
    .then((ops) => {
      opsCache = { ops, at: Date.now() };
      return ops;
    })
    .finally(() => {
      opsInflight = null;
    });
  return opsInflight;
}
export function useOperators(): { ops: AdminUser[]; status: OpsStatus } {
  const [st, setSt] = useState<{ ops: AdminUser[]; status: OpsStatus }>({ ops: [], status: "loading" });
  useEffect(() => {
    let alive = true;
    loadOperators()
      .then((ops) => alive && setSt({ ops, status: "ready" }))
      .catch((e) => alive && setSt({ ops: [], status: isForbiddenErr(e) ? "forbidden" : "error" }));
    return () => {
      alive = false;
    };
  }, []);
  return st;
}
