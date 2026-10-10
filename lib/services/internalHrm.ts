import { asArr, asDict, asNum, asStr, http, httpBlob, type Dict } from "@/lib/http";
import type { Session } from "@/lib/auth";

export const INTERNAL_PERMISSIONS = [
  "internal_hr.manage",
  "internal_org.manage",
  "internal_execution.manage",
  "internal_time.manage",
  "internal_payroll.manage",
  "internal_kpi.manage",
  "internal_analytics.view",
] as const;
export type InternalPermission = (typeof INTERNAL_PERMISSIONS)[number];

const ADMIN_ROLES = new Set(["admin", "superadmin"]);
const MANAGER_ROLES = new Set(["manager"]);
const INTERNAL_STAFF_ROLES = new Set(["employee", "internal_employee", "internal_staff", "staff", "hr"]);
const MANAGER_PERMISSIONS = new Set<InternalPermission>([
  "internal_execution.manage",
  "internal_time.manage",
  "internal_kpi.manage",
  "internal_analytics.view",
]);

export function internalRoles(session: Session | null): string[] {
  if (!session) return [];
  return [...new Set([...(session.roles ?? []), session.backendRole ?? ""].map((r) => r.trim().toLowerCase()).filter(Boolean))];
}

export function hasInternalAccess(session: Session | null): boolean {
  const roles = internalRoles(session);
  if (roles.some((role) => ADMIN_ROLES.has(role) || MANAGER_ROLES.has(role) || INTERNAL_STAFF_ROLES.has(role) || role.startsWith("internal_"))) return true;
  return (session?.permissions ?? []).some((permission) => (INTERNAL_PERMISSIONS as readonly string[]).includes(permission));
}

export function canInternal(session: Session | null, permission: InternalPermission): boolean {
  if (!session) return false;
  const roles = internalRoles(session);
  if (roles.some((role) => ADMIN_ROLES.has(role))) return true;
  if (roles.some((role) => MANAGER_ROLES.has(role)) && MANAGER_PERMISSIONS.has(permission)) return true;
  return session.permissions?.includes(permission) ?? false;
}

export type InternalPage<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type InternalRecord = Dict & { id?: string; employee_code?: string; work_code?: string };
export type InternalTask = InternalRecord & {
  title?: string;
  status?: string;
  priority?: string;
  due_at?: string;
  assignee_name?: string;
};
export type InternalMessage = InternalRecord & { subject?: string; body?: string; created_at?: string; unread?: boolean };
export type OrgBoardNode = { id: string; entityId: string; type: "department" | "employee" | string; label: string; subtitle: string; parentId: string; peopleCount: number; positionCount: number; level: number; raw: InternalRecord };
export type OrgBoardEdge = { id: string; source: string; target: string; raw: InternalRecord };
export type OrgBoard = { nodes: OrgBoardNode[]; edges: OrgBoardEdge[]; stats: InternalRecord; layout: InternalRecord; raw: InternalRecord };

const body = (value: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

const patchBody = (value: unknown): RequestInit => ({
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

function query(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : "";
}

function page<T extends InternalRecord>(raw: unknown, limit: number, offset: number, key = "items"): InternalPage<T> {
  const d = asDict(raw);
  const items = asArr(d[key] ?? d.data ?? raw) as T[];
  const actualOffset = asNum(d.offset, offset);
  const total = asNum(d.total, actualOffset + items.length);
  return { items, total, offset: actualOffset, limit, hasMore: typeof d.has_more === "boolean" ? d.has_more : actualOffset + items.length < total };
}

async function list<T extends InternalRecord>(path: string, params: Record<string, string | number | boolean | undefined>, key = "items", signal?: AbortSignal): Promise<InternalPage<T>> {
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25)));
  const offset = Math.max(0, Number(params.offset ?? 0));
  return page<T>(await http(`${path}${query({ ...params, limit, offset })}`, { signal }), limit, offset, key);
}

export const getMyProfile = (signal?: AbortSignal) => http<InternalRecord>("/internal/me/profile", { signal });
export const getMyToday = (signal?: AbortSignal) => http<InternalRecord>("/internal/me/today", { signal });
export const getMyTasks = (params: { q?: string; status?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalTask>("/internal/me/tasks", params, "items", signal);
export const getMyKpis = (params: { period?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalRecord>("/internal/me/kpis", params, "items", signal);
export const getMyAttendance = (params: { date_from?: string; date_to?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalRecord>("/internal/me/attendance", params, "items", signal);
export const getMyMessages = (params: { unread?: boolean; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalMessage>("/internal/me/messages", params, "items", signal);
export const sendInternalMessage = (payload: Dict) => http<InternalMessage>("/internal/messages", body(payload));

export const getPositions = (params: { q?: string; status?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalRecord>("/internal/org/positions", params, "items", signal);
export const createPosition = (payload: Dict) => http<InternalRecord>("/internal/org/positions", body(payload));
export const updatePosition = (id: string, payload: Dict) => http<InternalRecord>(`/internal/org/positions/${encodeURIComponent(id)}`, patchBody(payload));
export const getOrgBoard = (include = "people", signal?: AbortSignal) => http<InternalRecord>(`/internal/org/board${query({ include })}`, { signal });
export const getOrgUnitDetail = (unitId: string, signal?: AbortSignal) => http<InternalRecord>(`/internal/org/units/${encodeURIComponent(unitId)}`, { signal });
export const createOrgUnit = (payload: Dict) => http<InternalRecord>("/internal/org/units", body(payload));
export const updateOrgUnit = (id: string, payload: Dict) => http<InternalRecord>(`/internal/org/units/${encodeURIComponent(id)}`, patchBody(payload));

export const getEmployees = (params: { q?: string; status?: string; org_unit_id?: string; position_id?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalRecord>("/internal/employees", params, "items", signal);
export const createEmployee = (payload: Dict) => http<InternalRecord>("/internal/employees", body(payload));
export const updateEmployee = (id: string, payload: Dict) => http<InternalRecord>(`/internal/employees/${encodeURIComponent(id)}`, patchBody(payload));
export const assignEmployee = (id: string, payload: Dict) => http<InternalRecord>("/internal/employees/assignments", body({ employee_id: id, ...payload }));
export const getEmployee360 = (id: string, signal?: AbortSignal) => http<InternalRecord>(`/internal/employees/${encodeURIComponent(id)}/360`, { signal });

export const getExecutionTasks = (params: { q?: string; status?: string; responsible_employee_id?: string; project?: string; date_from?: string; date_to?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalTask>("/internal/execution/tasks", params, "items", signal);
export const createExecutionTask = (payload: Dict) => http<InternalTask>("/internal/execution/tasks", body(payload));
export const updateExecutionTask = (id: string, payload: Dict) => http<InternalTask>(`/internal/execution/tasks/${encodeURIComponent(id)}/status`, patchBody(payload));
export const commentExecutionTask = (id: string, payload: Dict) => http<InternalRecord>(`/internal/execution/tasks/${encodeURIComponent(id)}/comments`, body(payload));

export const getSchedules = (params: { employee_id?: string; org_unit_id?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalRecord>("/internal/time/schedules", params, "items", signal);
export const createSchedule = (payload: Dict) => http<InternalRecord>("/internal/time/schedules", body(payload));
export const createAttendanceEvent = (payload: Dict) => http<InternalRecord>("/internal/time/attendance/events", body(payload));
export const getAttendanceDays = (params: { employee_id?: string; date_from?: string; date_to?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalRecord>("/internal/time/attendance/days", params, "items", signal);

export const getKpiMetrics = (params: { employee_id?: string; period?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalRecord>("/internal/kpi/metrics", params, "items", signal);
export const createKpiMetric = (payload: Dict) => http<InternalRecord>("/internal/kpi/metrics", body(payload));

export const getPayrollEntries = (params: { employee_id?: string; period?: string; status?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalRecord>("/internal/payroll/entries", params, "items", signal);
export const createPayrollEntry = (payload: Dict) => http<InternalRecord>("/internal/payroll/entries", body(payload));
export const getPayrollSummary = (params: { period?: string } = {}, signal?: AbortSignal) => http<InternalRecord>(`/internal/payroll/summary${query(params)}`, { signal });

export const getMyApprovals = (params: { status?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalRecord>("/internal/me/approvals", params, "items", signal);
export const decideApproval = (id: string, payload: Dict) => http<InternalRecord>(`/internal/approvals/${encodeURIComponent(id)}/decision`, body(payload));

export const getAnalyticsDashboard = (params: { date_from?: string; date_to?: string; unit_id?: string } = {}, signal?: AbortSignal) => http<InternalRecord>(`/internal/analytics/dashboard${query(params)}`, { signal });
export const getAnalyticsExport = async (params: { date_from?: string; date_to?: string; unit_id?: string } = {}): Promise<Blob> => httpBlob(`/internal/analytics/export.xlsx${query(params)}`);

export function recordLabel(row: InternalRecord): string {
  return asStr(row.employee_code ?? row.work_code ?? row.name ?? row.title ?? row.id, "—");
}

export function recordName(row: InternalRecord): string {
  return asStr(row.full_name ?? row.name ?? row.title ?? row.employee_name ?? row.employee_code ?? row.work_code, "—");
}

export function recordStatus(row: InternalRecord): string {
  return asStr(row.status ?? row.employment_status ?? row.state ?? row.attendance_status, "—");
}

function boardNode(value: unknown, index: number, parentId = "", level = 0, typeHint = "department"): OrgBoardNode {
  const row = asDict(value) as InternalRecord;
  const type = asStr(row.type ?? row.node_type ?? row.entity_type, typeHint) || typeHint;
  const id = asStr(row.id ?? row.node_id ?? row.entity_id, `${type}-${index}`);
  const people = asArr(row.people ?? row.employees);
  return {
    id,
    entityId: asStr(row.entity_id ?? row.unit_id ?? row.employee_id ?? row.id),
    type,
    label: asStr(row.label ?? row.name ?? row.title ?? row.full_name, "—"),
    subtitle: asStr(row.subtitle ?? row.code ?? row.position_name ?? row.role),
    parentId: asStr(row.parent_id ?? row.parentId, parentId),
    peopleCount: asNum(row.people_count ?? row.employee_count, people.length),
    positionCount: asNum(row.position_count ?? row.positions_count, asArr(row.positions).length),
    level: asNum(row.level, level),
    raw: row,
  };
}

export function normOrgBoard(raw: unknown): OrgBoard {
  const root = asDict(raw);
  const source = asDict(root.board ?? raw);
  const direct = asArr(source.nodes);
  const nodes: OrgBoardNode[] = direct.length ? direct.map((value, index) => boardNode(value, index)) : [];
  const walk = (value: unknown, parentId = "", level = 0) => {
    const row = asDict(value);
    const node = boardNode(row, nodes.length, parentId, level, "department");
    nodes.push(node);
    for (const person of asArr(row.people ?? row.employees)) nodes.push(boardNode(person, nodes.length, node.id, level + 1, "employee"));
    for (const child of asArr(row.children ?? row.units ?? row.departments)) walk(child, node.id, level + 1);
  };
  if (!nodes.length) for (const unit of asArr(source.roots ?? source.units ?? source.departments ?? root.roots ?? root.units ?? root.departments)) walk(unit);
  const edges = asArr(source.edges).map((value, index) => {
    const row = asDict(value) as InternalRecord;
    return { id: asStr(row.id, `edge-${index}`), source: asStr(row.source ?? row.from ?? row.parent_id), target: asStr(row.target ?? row.to ?? row.child_id), raw: row };
  }).filter((edge) => edge.source && edge.target);
  return { nodes, edges, stats: asDict(source.stats) as InternalRecord, layout: asDict(source.layout) as InternalRecord, raw: source as InternalRecord };
}

// ── Normalised records ──────────────────────────────────────────────────────
// The list endpoints return the backend's own rows — display_name,
// employment_status, deadline_at, work_date, worked_minutes, an embedded
// responsible_employee, an assignment that only carries ids — not the
// pre-joined *_name fields the pages used to look for. Read that way, every
// table showed a bare code where a name belonged and "—" in most columns.
// These read the real fields once, here, so a page never guesses at a row.

const str = (v: unknown) => asStr(v).trim();
const optNum = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : asNum(v));

// A person's name the way the backend spells it: display_name first, then the
// name parts, and only then a code — never the UUID.
export function personName(raw: unknown): string {
  const d = asDict(raw);
  const parts = [str(d.last_name), str(d.first_name), str(d.middle_name)].filter(Boolean).join(" ");
  return str(d.display_name) || str(d.full_name) || parts || str(d.name) || str(d.employee_code) || "";
}

export type HrmEmployee = {
  id: string;
  userId: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  region: string;
  status: string;
  hireDate: string;
  unitId: string;
  positionId: string;
  managerId: string;
  salary: number | null;
  currency: string;
  employmentType: string;
  skills: string[];
  raw: InternalRecord;
};
export function normEmployee(value: unknown): HrmEmployee {
  const d = asDict(value) as InternalRecord;
  const a = asDict(d.assignment);
  const profile = asDict(d.profile);
  return {
    id: str(d.id),
    userId: str(d.user_id),
    code: str(d.employee_code),
    name: personName(d),
    phone: str(d.phone),
    email: str(d.email),
    region: str(d.region),
    status: str(d.employment_status ?? d.status),
    hireDate: str(d.hire_date),
    unitId: str(a.org_unit_id ?? d.org_unit_id),
    positionId: str(a.position_id ?? d.position_id),
    managerId: str(a.manager_employee_id),
    salary: optNum(a.salary_amount),
    currency: str(a.currency) || "UZS",
    employmentType: str(a.employment_type),
    skills: asArr(profile.skills).map((s) => asStr(s)).filter(Boolean),
    raw: d,
  };
}

export type HrmUnit = { id: string; code: string; name: string; type: string; parentId: string; headId: string; status: string; order: number; raw: InternalRecord };
export function normUnit(value: unknown): HrmUnit {
  const d = asDict(value) as InternalRecord;
  return {
    id: str(d.id),
    code: str(d.code),
    name: str(d.name ?? d.title),
    type: str(d.unit_type ?? d.type),
    parentId: str(d.parent_id),
    headId: str(d.head_employee_id),
    status: str(d.status),
    order: asNum(d.order_index ?? d.order),
    raw: d,
  };
}

export type HrmPosition = { id: string; code: string; title: string; category: string; grade: string; roleCode: string; description: string; status: string; raw: InternalRecord };
export function normPosition(value: unknown): HrmPosition {
  const d = asDict(value) as InternalRecord;
  return {
    id: str(d.id),
    code: str(d.code),
    title: str(d.title ?? d.name),
    category: str(d.category),
    grade: str(d.grade),
    roleCode: str(d.default_role_code),
    description: str(d.description),
    status: str(d.status),
    raw: d,
  };
}

export type HrmChecklistItem = { title: string; done: boolean };
export type HrmTask = {
  id: string;
  code: string;
  title: string;
  description: string;
  project: string;
  responsibleId: string;
  responsibleName: string;
  responsibleCode: string;
  creatorName: string;
  unitId: string;
  priority: string;
  status: string;
  deadline: string;
  createdAt: string;
  completedAt: string;
  checklist: HrmChecklistItem[];
  raw: InternalRecord;
};
export function normTask(value: unknown): HrmTask {
  const d = asDict(value) as InternalRecord;
  const responsible = asDict(d.responsible_employee ?? d.assignee);
  return {
    id: str(d.id),
    code: str(d.work_code),
    title: str(d.title),
    description: str(d.description),
    project: str(d.project),
    responsibleId: str(d.responsible_employee_id ?? responsible.id),
    responsibleName: personName(responsible) || str(d.assignee_name ?? d.responsible_name),
    responsibleCode: str(responsible.employee_code),
    creatorName: personName(d.creator),
    unitId: str(d.org_unit_id),
    priority: str(d.priority) || "normal",
    status: str(d.status) || "new",
    deadline: str(d.deadline_at ?? d.due_at ?? d.due_date),
    createdAt: str(d.created_at),
    completedAt: str(d.completed_at),
    checklist: asArr(d.checklist).map((c) => { const x = asDict(c); return { title: str(x.title ?? x.text), done: x.done === true }; }).filter((c) => c.title),
    raw: d,
  };
}

export type HrmAttendance = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: string;
  plannedMinutes: number;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  firstIn: string;
  lastOut: string;
  raw: InternalRecord;
};
export function normAttendance(value: unknown): HrmAttendance {
  const d = asDict(value) as InternalRecord;
  return {
    id: str(d.id),
    employeeId: str(d.employee_id),
    employeeName: personName(d.employee) || str(d.employee_name),
    date: str(d.work_date ?? d.date ?? d.day),
    status: str(d.status ?? d.attendance_status),
    plannedMinutes: asNum(d.planned_minutes),
    workedMinutes: asNum(d.worked_minutes),
    lateMinutes: asNum(d.late_minutes),
    earlyLeaveMinutes: asNum(d.early_leave_minutes),
    overtimeMinutes: asNum(d.overtime_minutes),
    firstIn: str(d.first_in_at ?? d.check_in),
    lastOut: str(d.last_out_at ?? d.check_out),
    raw: d,
  };
}

export type HrmKpi = { id: string; employeeId: string; period: string; code: string; title: string; target: number; actual: number; score: number; weight: number; source: string; status: string; unit: string; raw: InternalRecord };
export function normKpi(value: unknown): HrmKpi {
  const d = asDict(value) as InternalRecord;
  return {
    id: str(d.id),
    employeeId: str(d.employee_id),
    period: str(d.period),
    code: str(d.metric_code),
    title: str(d.title) || str(d.metric_code),
    target: asNum(d.target_value),
    actual: asNum(d.actual_value),
    score: asNum(d.score),
    weight: asNum(d.weight),
    source: str(d.source),
    status: str(d.status),
    unit: str(asDict(d.meta).unit),
    raw: d,
  };
}

export type HrmPayroll = { id: string; employeeId: string; period: string; type: string; title: string; amount: number; currency: string; status: string; paidAt: string; raw: InternalRecord };
export function normPayroll(value: unknown): HrmPayroll {
  const d = asDict(value) as InternalRecord;
  return {
    id: str(d.id),
    employeeId: str(d.employee_id),
    period: str(d.period),
    type: str(d.entry_type),
    title: str(d.title),
    amount: asNum(d.amount),
    currency: str(d.currency) || "UZS",
    status: str(d.status),
    paidAt: str(d.paid_at),
    raw: d,
  };
}

// Stored schedules spell the day out ("monday"); the create body the 10-08
// guide documents numbers it (1 = Monday). Both read as 1..7.
const WEEKDAY_NUM: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
export type HrmScheduleDay = { day: number; start: string; end: string; breakMinutes: number };
export type HrmSchedule = { id: string; employeeId: string; unitId: string; title: string; type: string; timezone: string; days: HrmScheduleDay[]; status: string; raw: InternalRecord };
export function normSchedule(value: unknown): HrmSchedule {
  const d = asDict(value) as InternalRecord;
  const days = asArr(d.weekly)
    .map((w) => {
      const x = asDict(w);
      const raw = x.day;
      const day = typeof raw === "number" ? raw : WEEKDAY_NUM[str(raw).toLowerCase()] ?? asNum(raw);
      return { day, start: str(x.start), end: str(x.end), breakMinutes: asNum(x.break_minutes), enabled: x.enabled !== false };
    })
    .filter((x) => x.day >= 1 && x.day <= 7 && x.enabled)
    .map(({ day, start, end, breakMinutes }) => ({ day, start, end, breakMinutes }))
    .sort((a, b) => a.day - b.day);
  return { id: str(d.id), employeeId: str(d.employee_id), unitId: str(d.org_unit_id), title: str(d.title ?? d.name), type: str(d.schedule_type), timezone: str(d.timezone), days, status: str(d.status), raw: d };
}

export type HrmMessage = { id: string; subject: string; body: string; senderName: string; senderUserId: string; createdAt: string; unread: boolean; raw: InternalRecord };
export function normMessage(value: unknown): HrmMessage {
  const d = asDict(value) as InternalRecord;
  return {
    id: str(d.id),
    subject: str(d.subject ?? d.title),
    body: str(d.body ?? d.preview ?? d.text),
    senderName: personName(d.sender) || str(d.sender_name ?? d.from_name),
    senderUserId: str(d.sender_user_id ?? asDict(d.sender).id),
    createdAt: str(d.created_at ?? d.sent_at),
    unread: d.unread === true || (d.read_at === null && d.is_read !== true && "read_at" in d),
    raw: d,
  };
}

export type HrmApproval = { id: string; title: string; type: string; targetType: string; requesterName: string; requesterUserId: string; status: string; description: string; amount: number | null; createdAt: string; payload: InternalRecord; raw: InternalRecord };
export function normApproval(value: unknown): HrmApproval {
  const d = asDict(value) as InternalRecord;
  const payload = asDict(d.payload ?? d.data);
  return {
    id: str(d.id ?? d.approval_id),
    title: str(d.title ?? d.subject) || str(payload.title),
    type: str(d.approval_type ?? d.type ?? d.entity_type),
    targetType: str(d.target_type),
    requesterName: personName(d.requester ?? d.requested_by) || str(d.requester_name ?? d.employee_name),
    requesterUserId: str(d.requester_user_id ?? asDict(d.requester).id),
    status: str(d.status),
    description: str(d.description ?? d.note ?? d.reason ?? d.comment),
    amount: optNum(d.amount ?? payload.amount),
    createdAt: str(d.created_at),
    payload: payload as InternalRecord,
    raw: d,
  };
}

export const getOrgUnits = (params: { q?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => list<InternalRecord>("/internal/org/units", params, "items", signal);

// /internal/me/kpis answers {period, employee_id, score, items}: the weighted
// score and its period are part of the answer, not only the metric list.
export async function getMyKpiSummary(params: { period?: string } = {}, signal?: AbortSignal): Promise<{ period: string; score: number | null; items: HrmKpi[] }> {
  const d = asDict(await http(`/internal/me/kpis${query({ ...params, limit: 50 })}`, { signal }));
  const items = asArr(d.items ?? d.metrics ?? d.data).map(normKpi);
  return { period: str(d.period), score: d.score === null || d.score === undefined ? null : asNum(d.score), items };
}
