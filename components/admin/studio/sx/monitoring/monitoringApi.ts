import { asArr, asDict, asNum, http } from "@/lib/http";
import { normStudioActivity, type StudioActivity, type StudioMonitoringSummary, type StudioMonitoringUser } from "@/lib/services/studio";

export const MON_PAGE = 200;
export const MON_PAGE_MAX = 500;

export type MonFetchQuery = { date?: string; dateFrom?: string; dateTo?: string; limit: number; offset: number };
export type MonPage = { items: StudioActivity[]; users: StudioMonitoringUser[]; summary: StudioMonitoringSummary; total: number; offset: number; hasMore: boolean };

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const firstText = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = text(v);
    if (s) return s;
  }
  return "";
};
const count = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function userOf(value: unknown): StudioMonitoringUser {
  const row = asDict(value);
  const user = asDict(row.user);
  return {
    id: firstText(row.user_id, row.id, user.id),
    name: firstText(row.user_name, row.name, row.full_name, user.full_name, user.name),
    role: firstText(row.role, user.role),
    online: row.online === true || row.is_online === true,
    sessions: asNum(row.sessions_count ?? row.sessions ?? row.session_count),
    durationSeconds: asNum(row.duration_seconds ?? row.worked_seconds),
    saveCount: asNum(row.save_count ?? row.saves),
    objects: asNum(row.objects_count ?? row.objects),
    submitted: asNum(row.submitted_count ?? row.submitted),
    lastSeenAt: firstText(row.last_seen_at, row.lastSeenAt),
  };
}

export async function fetchMonitoring(q: MonFetchQuery): Promise<MonPage> {
  const p = new URLSearchParams();
  if (q.date) p.set("date", q.date);
  if (q.dateFrom) p.set("date_from", q.dateFrom);
  if (q.dateTo) p.set("date_to", q.dateTo);
  p.set("limit", String(Math.min(MON_PAGE_MAX, Math.max(1, Math.floor(q.limit)))));
  p.set("offset", String(Math.max(0, Math.floor(q.offset))));
  const d = asDict(await http(`/admin/studio/monitoring?${p}`));
  const now = Date.now();
  const list = Array.isArray(d.items) ? d.items : asArr(d.sessions ?? d.activity ?? d.data ?? d.results);
  const items = list.map((r) => normStudioActivity(r, now));
  const users = asArr(d.users).map(userOf).filter((u) => u.id || u.name);
  const s = asDict(d.summary);
  const offset = count(d.offset) ?? q.offset;
  const total = count(d.total) ?? offset + items.length;
  const hasMore = typeof d.has_more === "boolean" ? d.has_more : offset + items.length < total;
  const online = count(s.online ?? d.online ?? d.online_count) ?? items.filter((a) => a.online).length;
  return {
    items,
    users,
    total,
    offset,
    hasMore,
    summary: {
      online,
      sessions: count(s.sessions ?? s.session_count) ?? total,
      users: count(s.users ?? s.user_count) ?? (users.length || new Set(items.map((a) => a.userId).filter(Boolean)).size),
      objectsCreated: asNum(s.objects_created ?? s.objectsCreated),
      submittedForApproval: asNum(s.submitted_for_approval ?? s.submittedForApproval),
      saveCount: count(s.save_count ?? s.saves) ?? items.reduce((n, a) => n + a.saveCount, 0),
      durationSeconds: count(s.duration_seconds ?? s.worked_seconds) ?? items.reduce((n, a) => n + a.durationSec, 0),
    },
  };
}
