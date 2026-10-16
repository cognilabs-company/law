// Internal HRM — Live Office, corrections, product feedback and
// payroll calculation (FRONTEND_INTERNAL_HRM_LIVE_OFFICE_2026_10_11.md).
// Every reader is lenient about field names: the guide names the endpoints
// and payloads, the rows are read under the spellings the backend has used.
import { asArr, asDict, asNum, asStr, http, httpBlobNamed, type Dict } from "@/lib/http";

const enc = encodeURIComponent;
const str = (...vals: unknown[]): string => {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
};
const send = (method: "POST" | "PATCH", value: unknown, signal?: AbortSignal): RequestInit => ({ method, body: JSON.stringify(value), signal });

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

function rows(raw: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const d = asDict(raw);
  for (const k of [...keys, "items", "data", "results"]) if (Array.isArray(d[k])) return d[k] as unknown[];
  return [];
}

const personName = (raw: unknown): string => {
  const d = asDict(raw);
  return str(d.display_name, d.full_name, [d.last_name, d.first_name].filter(Boolean).join(" "), d.name, d.user_name, d.employee_code);
};

// ── Catalog ─────────────────────────────────────────────────────────────────

export const LIVE_STATUSES = ["online", "working", "busy", "break", "inactive", "offline"] as const;
export type LiveStatus = (typeof LIVE_STATUSES)[number];
export const ROOM_TYPES = ["virtual", "physical", "hybrid"] as const;
export const MEMBERSHIP_TYPES = ["primary", "additional"] as const;
export const CORRECTION_TYPES = ["activity", "attendance", "department", "room", "other"] as const;
export const CORRECTION_DECISIONS = ["approved", "rejected", "returned", "resolved", "closed"] as const;
export const FEEDBACK_TYPES = ["bug", "suggestion", "usability", "data_issue", "other"] as const;
export const FEEDBACK_SEVERITIES = ["low", "normal", "high", "critical"] as const;
export const FEEDBACK_STATUSES = ["new", "triaged", "in_progress", "resolved", "rejected", "closed"] as const;

export type LiveCatalog = { heartbeatSeconds: number; inactiveAfterSeconds: number; retentionDays: number; domains: string[] };

export async function getLiveCatalog(signal?: AbortSignal): Promise<LiveCatalog> {
  const d = asDict(await http("/internal/live-office/catalog", { signal }));
  return {
    heartbeatSeconds: asNum(d.heartbeat_interval_seconds, 30) || 30,
    inactiveAfterSeconds: asNum(d.inactive_after_seconds, 300) || 300,
    retentionDays: asNum(d.detail_retention_days, 365),
    domains: asArr(d.hrm_domains).map((x) => asStr(x)).filter(Boolean),
  };
}

// ── Board ───────────────────────────────────────────────────────────────────

export type LiveUnit = { id: string; code: string; name: string; type: string; parentId: string; headEmployeeId: string; order: number };
export type LiveRoom = { id: string; unitId: string; code: string; name: string; type: string; capacity: number; status: string; order: number; raw: Dict };
export type LiveActivity = {
  id: string;
  at: string;
  module: string;
  code: string;
  label: string;
  entityType: string;
  entityId: string;
  detailUrl: string;
  unitId: string;
  roomId: string;
  raw: Dict;
};
export type LiveBusy = { id: string; reason: string; startedAt: string; endedAt: string; stopReason: string; raw: Dict };
export type LivePerson = {
  id: string;
  userId: string;
  name: string;
  code: string;
  position: string;
  status: string;
  unitId: string;
  roomId: string;
  extraUnitIds: string[];
  activity: LiveActivity | null;
  lastSeenAt: string;
  since: string;
  busy: LiveBusy | null;
  raw: Dict;
};
export type LiveBoard = {
  units: LiveUnit[];
  rooms: LiveRoom[];
  people: LivePerson[];
  statuses: Record<string, number>;
  wsPath: string;
  heartbeatSeconds: number;
  generatedAt: string;
  // A temporary monitoring grant the viewer is looking through, when the
  // backend says so: what it covers and until when (§13, §23).
  grants: LiveGrant[];
  raw: Dict;
};

export function normUnit(raw: unknown): LiveUnit {
  const d = asDict(raw);
  return {
    id: str(d.id, d.org_unit_id),
    code: str(d.code),
    name: str(d.name, d.title, d.label),
    type: str(d.unit_type, d.type),
    parentId: str(d.parent_id),
    headEmployeeId: str(d.head_employee_id),
    order: asNum(d.order_index ?? d.order, 0),
  };
}

export function normRoom(raw: unknown): LiveRoom {
  const d = asDict(raw);
  return {
    id: str(d.id, d.room_id),
    unitId: str(d.org_unit_id, d.unit_id),
    code: str(d.code),
    name: str(d.name, d.title),
    type: str(d.room_type, d.type) || "virtual",
    capacity: asNum(d.capacity, 0),
    status: str(d.status) || "active",
    order: asNum(d.order_index ?? d.order, 0),
    raw: d,
  };
}

export function normActivity(raw: unknown): LiveActivity | null {
  const d = asDict(raw);
  if (!Object.keys(d).length) return null;
  const ctx = asDict(d.context);
  return {
    id: str(d.id, d.event_id),
    at: str(d.occurred_at, d.created_at, d.at, d.started_at, d.updated_at, d.last_seen_at),
    module: str(d.module, ctx.module),
    code: str(d.action_code, d.code),
    label: str(d.action_label, d.label, ctx.action_label, d.title, d.action),
    entityType: str(d.entity_type, ctx.entity_type),
    entityId: str(d.entity_id, ctx.entity_id),
    detailUrl: str(d.detail_url, ctx.detail_url, d.url),
    unitId: str(d.org_unit_id, ctx.org_unit_id),
    roomId: str(d.room_id, ctx.room_id),
    raw: d,
  };
}

export function normBusy(raw: unknown): LiveBusy | null {
  const d = asDict(raw);
  const id = str(d.id, d.busy_id);
  if (!id && !str(d.reason)) return null;
  return {
    id,
    reason: str(d.reason, d.start_reason),
    startedAt: str(d.started_at, d.start_at, d.created_at),
    endedAt: str(d.ended_at, d.stopped_at, d.end_at),
    stopReason: str(d.stop_reason, d.end_reason, d.ended_reason),
    raw: d,
  };
}

// One person on the board. The employee may come flat or nested, the
// presence and the current activity under several names.
export function normPerson(raw: unknown): LivePerson {
  const d = asDict(raw);
  const emp = asDict(d.employee);
  const pres = asDict(d.presence);
  const base = Object.keys(emp).length ? emp : d;
  const activity = normActivity(d.current_activity ?? d.activity ?? d.last_activity ?? pres.activity ?? pres.context ?? d.context);
  const busyRaw = d.busy ?? d.active_busy ?? d.busy_interval ?? pres.busy;
  const busy = busyRaw && typeof busyRaw === "object" ? normBusy(busyRaw) : null;
  const primary = asDict(d.primary_membership);
  return {
    id: str(d.employee_id, emp.id, d.id),
    userId: str(d.user_id, emp.user_id),
    name: personName(base) || personName(d),
    code: str(base.employee_code, d.employee_code),
    position: str(d.position_title, asDict(d.position).title, base.position_title),
    status: str(d.status, d.presence_status, pres.status) || "offline",
    unitId: str(d.org_unit_id, primary.org_unit_id, d.unit_id, pres.org_unit_id, asDict(base.assignment).org_unit_id),
    roomId: str(d.room_id, primary.room_id, pres.room_id),
    extraUnitIds: asArr(d.additional_org_unit_ids ?? d.additional_units).map((x) => (typeof x === "string" ? x : str(asDict(x).org_unit_id, asDict(x).id))).filter(Boolean),
    activity,
    lastSeenAt: str(d.last_seen_at, d.last_heartbeat_at, pres.last_seen_at, pres.last_heartbeat_at),
    since: str(d.status_since, d.since, pres.started_at, d.started_at),
    busy: busy ?? (str(d.busy_reason) ? { id: str(d.busy_id), reason: str(d.busy_reason), startedAt: str(d.busy_started_at), endedAt: "", stopReason: "", raw: {} } : null),
    raw: d,
  };
}

export function normGrant(raw: unknown): LiveGrant {
  const d = asDict(raw);
  return {
    id: str(d.id, d.grant_id),
    granteeUserId: str(d.grantee_user_id),
    granteeName: personName(d.grantee) || str(d.grantee_name),
    scopeType: str(d.scope_type),
    scopeId: str(d.scope_id),
    scopeName: str(d.scope_name, personName(d.scope), asDict(d.scope).name),
    permissions: asArr(d.permissions).map((x) => asStr(x)).filter(Boolean),
    validFrom: str(d.valid_from),
    validUntil: str(d.valid_until),
    status: str(d.status) || "active",
    reason: str(d.reason),
  };
}

export async function getLiveBoard(filter: { unitId?: string; roomId?: string; status?: string; q?: string } = {}, signal?: AbortSignal): Promise<LiveBoard> {
  const d = asDict(await http(`/internal/live-office/board${qs({ org_unit_id: filter.unitId, room_id: filter.roomId, status: filter.status, q: filter.q })}`, { signal }));
  const stats = asDict(d.stats);
  const rt = asDict(d.realtime);
  const grants = rows(d.access_grants ?? d.grants ?? d.access).map(normGrant).filter((g) => g.id || g.validUntil);
  return {
    units: rows(d.units).map(normUnit).filter((u) => u.id),
    rooms: rows(d.rooms).map(normRoom).filter((r) => r.id),
    people: rows(d.employees ?? d.people ?? d.presence).map(normPerson).filter((p) => p.id),
    statuses: Object.fromEntries(Object.entries(asDict(stats.statuses)).map(([k, v]) => [k, asNum(v)])),
    wsPath: str(rt.ws_url) || "/internal/live-office/ws?token={access_token}",
    heartbeatSeconds: asNum(rt.heartbeat_interval_seconds, 30) || 30,
    generatedAt: str(d.generated_at),
    grants,
    raw: d,
  };
}

// ── Heartbeat & sessions ────────────────────────────────────────────────────

export type HeartbeatInput = {
  session_key: string;
  device_id: string;
  platform: "web";
  module: string;
  action_label: string;
  entity_type: string | null;
  entity_id: string | null;
  detail_url: string;
  org_unit_id: string | null;
  room_id: string | null;
  status: string;
  meta: Dict;
};

export async function sendHeartbeat(input: HeartbeatInput): Promise<{ sessionId: string; status: string; intervalSeconds: number }> {
  const d = asDict(await http("/internal/live-office/heartbeat", send("POST", input)));
  const session = asDict(d.session);
  return {
    sessionId: str(d.session_id, session.id, asDict(d.presence).session_id, d.id),
    status: str(d.status, asDict(d.presence).status),
    intervalSeconds: asNum(d.heartbeat_interval_seconds ?? d.next_heartbeat_seconds, 0),
  };
}

// ── Employee detail ─────────────────────────────────────────────────────────

export type LiveMembership = { id: string; employeeId: string; unitId: string; roomId: string; type: string; status: string; from: string; to: string };
export type LiveSession = { id: string; startedAt: string; endedAt: string; lastSeenAt: string; platform: string; status: string; seconds: number };
export type LiveDay = { date: string; online: number; active: number; inactive: number; busy: number; busyCount: number; actions: number; completed: number };
export type LiveEmployeeDetail = {
  employee: { id: string; userId: string; name: string; code: string; phone: string; email: string; region: string };
  memberships: LiveMembership[];
  timeline: LiveActivity[];
  sessions: LiveSession[];
  busy: LiveBusy[];
  days: LiveDay[];
};

export function normMembership(raw: unknown): LiveMembership {
  const d = asDict(raw);
  return {
    id: str(d.id),
    employeeId: str(d.employee_id),
    unitId: str(d.org_unit_id, asDict(d.org_unit).id),
    roomId: str(d.room_id, asDict(d.room).id),
    type: str(d.membership_type, d.type) || "primary",
    status: str(d.status) || "active",
    from: str(d.effective_from),
    to: str(d.effective_to),
  };
}

const seconds = (d: Dict, ...keys: string[]) => {
  for (const k of keys) if (d[k] !== undefined && d[k] !== null) return asNum(d[k]);
  return 0;
};

export function normDay(raw: unknown): LiveDay {
  const d = asDict(raw);
  return {
    date: str(d.date, d.day, d.work_date),
    online: seconds(d, "online_seconds", "online"),
    active: seconds(d, "active_seconds", "active"),
    inactive: seconds(d, "inactive_seconds", "inactive"),
    busy: seconds(d, "busy_seconds", "busy"),
    busyCount: seconds(d, "busy_count"),
    actions: seconds(d, "action_count", "actions"),
    completed: seconds(d, "completed_count", "completed"),
  };
}

export async function getLiveEmployee(id: string, range: { from?: string; to?: string; limit?: number } = {}, signal?: AbortSignal): Promise<LiveEmployeeDetail> {
  const d = asDict(await http(`/internal/live-office/employees/${enc(id)}${qs({ date_from: range.from, date_to: range.to, limit: range.limit ?? 500 })}`, { signal }));
  const e = asDict(d.employee);
  return {
    employee: { id: str(e.id, id), userId: str(e.user_id), name: personName(e), code: str(e.employee_code), phone: str(e.phone), email: str(e.email), region: str(e.region) },
    memberships: rows(d.memberships).map(normMembership),
    timeline: rows(d.timeline ?? d.activity ?? d.activities).map(normActivity).filter((x): x is LiveActivity => Boolean(x)),
    sessions: rows(d.sessions ?? d.presence_sessions).map((x) => {
      const s = asDict(x);
      return {
        id: str(s.id, s.session_id),
        startedAt: str(s.started_at, s.created_at),
        endedAt: str(s.ended_at, s.closed_at),
        lastSeenAt: str(s.last_seen_at, s.last_heartbeat_at),
        platform: str(s.platform),
        status: str(s.status),
        seconds: seconds(s, "duration_seconds", "online_seconds"),
      };
    }),
    busy: rows(d.busy_intervals ?? d.busy).map(normBusy).filter((x): x is LiveBusy => Boolean(x)),
    days: rows(d.daily_summaries ?? d.days).map(normDay),
  };
}

// The employee record as it comes, for its virtual_monitor and
// parallel_contexts (§15) when the board card has none.
export async function getLiveEmployeeRaw(id: string, signal?: AbortSignal): Promise<Dict> {
  return asDict(await http(`/internal/live-office/employees/${enc(id)}${qs({ limit: 1 })}`, { signal }));
}

// A Live Office character is kept on the employee's HRM profile; the rest of
// the profile is read first and sent back untouched.
export async function saveLiveCharacter(employeeId: string, character: Dict): Promise<void> {
  const rec = asDict(await http(`/internal/employees/${enc(employeeId)}`));
  const emp = Object.keys(asDict(rec.employee)).length ? asDict(rec.employee) : rec;
  await http(`/internal/employees/${enc(employeeId)}`, send("PATCH", { profile: { ...asDict(emp.profile), live_character: character } }));
}

// ── Analytics ───────────────────────────────────────────────────────────────

export type LiveTotals = { online: number; active: number; inactive: number; busy: number; busyCount: number; actions: number; completed: number; modules: Record<string, number> };
export type LiveAnalyticsRow = LiveTotals & { id: string; name: string; code: string; reasons: { reason: string; count: number; seconds: number }[]; days: LiveDay[] };
export type LiveAnalytics = { from: string; to: string; totals: LiveTotals; employees: LiveAnalyticsRow[]; days: LiveDay[] };

function totalsOf(raw: unknown): LiveTotals {
  const d = asDict(raw);
  return {
    online: seconds(d, "online_seconds"),
    active: seconds(d, "active_seconds"),
    inactive: seconds(d, "inactive_seconds"),
    busy: seconds(d, "busy_seconds"),
    busyCount: seconds(d, "busy_count"),
    actions: seconds(d, "action_count"),
    completed: seconds(d, "completed_count"),
    modules: Object.fromEntries(Object.entries(asDict(d.module_actions)).map(([k, v]) => [k, asNum(v)])),
  };
}

export async function getLiveAnalytics(filter: { from?: string; to?: string; employeeId?: string; unitId?: string } = {}, signal?: AbortSignal): Promise<LiveAnalytics> {
  const d = asDict(await http(`/internal/live-office/analytics${qs({ date_from: filter.from, date_to: filter.to, employee_id: filter.employeeId, org_unit_id: filter.unitId })}`, { signal }));
  const employees = rows(d.employees).map((x) => {
    const r = asDict(x);
    const e = asDict(r.employee);
    return {
      ...totalsOf(r),
      id: str(e.id, r.employee_id),
      name: personName(e),
      code: str(e.employee_code),
      reasons: asArr(r.busy_reasons).map((y) => {
        const b = asDict(y);
        return typeof y === "string" ? { reason: y, count: 1, seconds: 0 } : { reason: str(b.reason), count: asNum(b.count, 1), seconds: seconds(b, "seconds", "busy_seconds", "duration_seconds") };
      }).filter((b) => b.reason),
      days: rows(r.days).map(normDay),
    };
  });
  // The day-by-day cut: the backend's own, else summed from the people.
  const own = rows(d.days ?? d.daily).map(normDay);
  const byDay = new Map<string, LiveDay>();
  for (const e of employees) for (const day of e.days) {
    const cur = byDay.get(day.date) ?? { date: day.date, online: 0, active: 0, inactive: 0, busy: 0, busyCount: 0, actions: 0, completed: 0 };
    byDay.set(day.date, { date: day.date, online: cur.online + day.online, active: cur.active + day.active, inactive: cur.inactive + day.inactive, busy: cur.busy + day.busy, busyCount: cur.busyCount + day.busyCount, actions: cur.actions + day.actions, completed: cur.completed + day.completed });
  }
  return {
    from: str(d.date_from),
    to: str(d.date_to),
    totals: totalsOf(d.totals),
    employees,
    days: (own.length ? own : [...byDay.values()]).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ── Busy ────────────────────────────────────────────────────────────────────

export async function startBusy(reason: string): Promise<LiveBusy | null> {
  const d = await http("/internal/live-office/busy/start", send("POST", { reason }));
  return normBusy(asDict(d).busy ?? d);
}
export const stopBusy = (busyId: string, reason: string) => http(`/internal/live-office/busy/${enc(busyId)}/stop`, send("POST", { reason }));

// ── Rooms & memberships ─────────────────────────────────────────────────────

export async function getLiveRooms(filter: { unitId?: string; status?: string } = {}, signal?: AbortSignal): Promise<LiveRoom[]> {
  return rows(await http(`/internal/live-office/rooms${qs({ org_unit_id: filter.unitId, status: filter.status })}`, { signal })).map(normRoom).filter((r) => r.id);
}
export const createRoom = (payload: Dict) => http("/internal/live-office/rooms", send("POST", payload));
export const updateRoom = (id: string, payload: Dict) => http(`/internal/live-office/rooms/${enc(id)}`, send("PATCH", payload));

export async function getMemberships(employeeId = "", signal?: AbortSignal): Promise<LiveMembership[]> {
  return rows(await http(`/internal/live-office/memberships${qs({ employee_id: employeeId })}`, { signal })).map(normMembership);
}
export const saveMembership = (payload: Dict) => http("/internal/live-office/memberships", send("POST", payload));

// ── Temporary access ────────────────────────────────────────────────────────

export type LiveGrant = { id: string; granteeUserId: string; granteeName: string; scopeType: string; scopeId: string; scopeName: string; permissions: string[]; validFrom: string; validUntil: string; status: string; reason: string };

export async function createGrant(payload: Dict): Promise<LiveGrant> {
  const d = await http("/internal/live-office/access-grants", send("POST", payload));
  return normGrant(asDict(d).grant ?? d);
}
export const revokeGrant = (id: string, reason: string) => http(`/internal/live-office/access-grants/${enc(id)}/revoke`, send("POST", { reason }));

// ── Corrections ─────────────────────────────────────────────────────────────

export type Correction = {
  id: string;
  type: string;
  targetType: string;
  targetId: string;
  title: string;
  description: string;
  requested: Dict;
  status: string;
  resolution: string;
  requester: string;
  reviewer: string;
  createdAt: string;
  reviewedAt: string;
};

export function normCorrection(raw: unknown): Correction {
  const d = asDict(raw);
  return {
    id: str(d.id, d.request_id),
    type: str(d.correction_type, d.type),
    targetType: str(d.target_type),
    targetId: str(d.target_id),
    title: str(d.title),
    description: str(d.description),
    requested: asDict(d.requested),
    status: str(d.status) || "pending",
    resolution: str(d.resolution),
    requester: personName(d.requester ?? d.employee ?? d.created_by_user) || str(d.requester_name),
    reviewer: personName(d.reviewer ?? d.reviewed_by_user) || str(d.reviewer_name),
    createdAt: str(d.created_at),
    reviewedAt: str(d.reviewed_at, d.updated_at),
  };
}

export async function getCorrections(filter: { mine?: boolean; status?: string } = {}, signal?: AbortSignal): Promise<Correction[]> {
  return rows(await http(`/internal/live-office/corrections${qs({ mine: filter.mine ? "true" : undefined, status: filter.status })}`, { signal })).map(normCorrection).filter((c) => c.id);
}
export const createCorrection = (payload: Dict) => http("/internal/live-office/corrections", send("POST", payload));
export const reviewCorrection = (id: string, decision: string, resolution: string) => http(`/internal/live-office/corrections/${enc(id)}/review`, send("POST", { decision, resolution }));

// ── Product feedback ────────────────────────────────────────────────────────

export type Feedback = {
  id: string;
  type: string;
  severity: string;
  module: string;
  pageUrl: string;
  entityType: string;
  entityId: string;
  title: string;
  description: string;
  expected: string;
  actual: string;
  steps: string[];
  status: string;
  assigneeUserId: string;
  resolution: string;
  author: string;
  createdAt: string;
  updatedAt: string;
};

export function normFeedback(raw: unknown): Feedback {
  const d = asDict(raw);
  return {
    id: str(d.id, d.feedback_id),
    type: str(d.feedback_type, d.type) || "bug",
    severity: str(d.severity) || "normal",
    module: str(d.module),
    pageUrl: str(d.page_url),
    entityType: str(d.entity_type),
    entityId: str(d.entity_id),
    title: str(d.title),
    description: str(d.description),
    expected: str(d.expected_result),
    actual: str(d.actual_result),
    steps: asArr(d.steps).map((x) => asStr(x)).filter(Boolean),
    status: str(d.status) || "new",
    assigneeUserId: str(d.assignee_user_id),
    resolution: str(d.resolution),
    author: personName(d.reporter ?? d.author ?? d.created_by_user ?? d.user) || str(d.reporter_name, d.author_name),
    createdAt: str(d.created_at),
    updatedAt: str(d.updated_at),
  };
}

export async function getFeedback(filter: { mine?: boolean; status?: string; type?: string } = {}, signal?: AbortSignal): Promise<Feedback[]> {
  return rows(await http(`/internal/product-feedback${qs({ mine: filter.mine ? "true" : undefined, status: filter.status, feedback_type: filter.type })}`, { signal })).map(normFeedback).filter((f) => f.id);
}
export const createFeedback = (payload: Dict) => http("/internal/product-feedback", send("POST", payload));
export const updateFeedback = (id: string, payload: Dict) => http(`/internal/product-feedback/${enc(id)}`, send("PATCH", payload));

// ── Activity registry ───────────────────────────────────────────────────────

export type RegistryRule = { id: string; method: string; path: string; module: string; code: string; label: string; entityType: string; detailUrl: string; unitId: string; roomId: string; active: boolean };

export async function getActivityRegistry(signal?: AbortSignal): Promise<RegistryRule[]> {
  return rows(await http("/internal/activity-registry", { signal })).map((x) => {
    const d = asDict(x);
    return {
      id: str(d.id),
      method: str(d.method).toUpperCase(),
      path: str(d.path_pattern),
      module: str(d.module),
      code: str(d.action_code),
      label: str(d.action_label),
      entityType: str(d.entity_type),
      detailUrl: str(d.detail_url_pattern),
      unitId: str(d.org_unit_id),
      roomId: str(d.room_id),
      active: d.is_active !== false,
    };
  });
}
export const createRegistryRule = (payload: Dict) => http("/internal/activity-registry", send("POST", payload));

// ── Payroll calculation ─────────────────────────────────────────────────────

export type PayrollCalc = {
  entryId: string;
  baseSalary: number;
  plannedMinutes: number;
  workedMinutes: number;
  coefficient: number;
  bonus: number;
  penalty: number;
  advance: number;
  payable: number;
  currency: string;
  status: string;
  raw: Dict;
};

export async function calculatePayroll(payload: { employee_id: string; period: string; bonus_amount: number; penalty_amount: number; advance_amount: number; note: string }): Promise<PayrollCalc> {
  const d = asDict(await http("/internal/payroll/calculate", send("POST", payload)));
  const c = asDict(d.calculation ?? d.result ?? d.breakdown ?? d);
  const entry = asDict(d.entry);
  const num = (...keys: string[]) => {
    for (const k of keys) {
      if (c[k] !== undefined && c[k] !== null) return asNum(c[k]);
      if (d[k] !== undefined && d[k] !== null) return asNum(d[k]);
    }
    return 0;
  };
  return {
    entryId: str(entry.id, d.entry_id, c.entry_id),
    baseSalary: num("base_salary", "base_salary_amount", "salary_amount"),
    plannedMinutes: num("planned_minutes"),
    workedMinutes: num("worked_minutes"),
    coefficient: num("attendance_coefficient", "attendance_ratio", "coefficient"),
    bonus: num("bonus_amount", "bonus"),
    penalty: num("penalty_amount", "penalty"),
    advance: num("advance_amount", "advance"),
    payable: num("payable_amount", "net_amount", "final_amount", "total_amount", "amount"),
    currency: str(c.currency, d.currency, entry.currency) || "UZS",
    status: str(entry.status, d.status),
    raw: d,
  };
}
export const setPayrollStatus = (entryId: string, status: string, note = "") => http(`/internal/payroll/entries/${enc(entryId)}/status`, send("POST", note ? { status, note } : { status }));

// ── Excel ───────────────────────────────────────────────────────────────────

export const exportInternalAnalytics = (params: { date_from?: string; date_to?: string }) => httpBlobNamed(`/internal/analytics/export.xlsx${qs(params)}`);
