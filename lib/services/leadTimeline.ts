import { http, asArr, asDict, asStr, parseServerTime } from "@/lib/http";

export type LeadEventKind = "created" | "stage" | "reorder" | "updated" | "reengage" | "cleanup" | "other";

export type LeadEvent = {
  id: string;
  kind: LeadEventKind;
  from: string;
  to: string;
  at: string;
  ms: number;
  by: string;
  operatorId: string;
  duplicate: boolean;
  reason: string;
};

export type LeadEventRun = { key: string; newest: LeadEvent; oldest: LeadEvent; count: number };
export type LeadEventDay = { day: string; at: string; runs: LeadEventRun[] };

const STATUS_STAGE: Record<string, string> = { in_progress: "contacted", converted: "won", rejected: "lost" };

const stageKey = (v: unknown): string => {
  const s = asStr(v).trim();
  return STATUS_STAGE[s] ?? s;
};

export function normLeadEvent(v: unknown): LeadEvent {
  const d = asDict(v);
  const p = asDict(d.payload);
  const ms = parseServerTime(d.created_at ?? d.at ?? d.timestamp);
  const ok = Number.isFinite(ms) && ms > 0;
  const base: LeadEvent = {
    id: asStr(d.id),
    kind: "other",
    from: "",
    to: "",
    at: ok ? new Date(ms).toISOString() : "",
    ms: ok ? ms : 0,
    by: asStr(d.owner_user_id),
    operatorId: "",
    duplicate: false,
    reason: "",
  };
  const type = asStr(d.record_type ?? d.type ?? d.action).trim();
  if (type === "created") {
    const status = asStr(p.status).trim();
    return { ...base, kind: "created", to: stageKey(status), operatorId: asStr(p.assigned_operator_user_id), duplicate: !!p.duplicate_of || status === "duplicate" };
  }
  if (type === "kanban_move" || type === "status_change") {
    const from = stageKey(p.from);
    const to = stageKey(p.to);
    if (!to) return base;
    return { ...base, kind: type === "kanban_move" && from === to ? "reorder" : "stage", from, to };
  }
  if (type === "updated") return { ...base, kind: "updated" };
  if (type === "re_engage") return { ...base, kind: "reengage", reason: asStr(p.reason ?? p.note).trim() };
  if (type === "demo_cleanup") return { ...base, kind: "cleanup" };
  return base;
}

export async function getLeadHistory(leadId: string, scope: "admin" | "call-center" = "admin"): Promise<LeadEvent[]> {
  const raw = await http(`/${scope}/leads/${encodeURIComponent(leadId)}/timeline`);
  const d = asDict(raw);
  const list = Array.isArray(raw) ? raw : asArr(d.items ?? d.data ?? d.timeline);
  return list.map(normLeadEvent).sort((a, b) => b.ms - a.ms);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function prevDayKey(day: string): string {
  const [y, m, d] = day.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return "";
  return dayKeyOf(new Date(y, m - 1, d - 1).getTime());
}

const sigOf = (e: LeadEvent): string => [e.kind, e.from, e.to, e.reason, e.operatorId, e.duplicate ? "1" : "", e.by].join("|");

export function groupLeadEvents(events: readonly LeadEvent[]): LeadEventDay[] {
  const days: LeadEventDay[] = [];
  let lastSig = "";
  for (const e of events) {
    const day = e.ms > 0 ? dayKeyOf(e.ms) : "";
    let g = days[days.length - 1];
    if (!g || g.day !== day) {
      g = { day, at: e.at, runs: [] };
      days.push(g);
      lastSig = "";
    }
    const sig = sigOf(e);
    const run = g.runs[g.runs.length - 1];
    if (run && sig === lastSig) {
      run.count += 1;
      run.oldest = e;
    } else {
      g.runs.push({ key: e.id || `${day}:${g.runs.length}`, newest: e, oldest: e, count: 1 });
      lastSig = sig;
    }
  }
  return days;
}
