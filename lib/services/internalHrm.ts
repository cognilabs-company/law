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
  return asStr(row.status ?? row.state ?? row.attendance_status, "—");
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
