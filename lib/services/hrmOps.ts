// Internal HRM operational endpoints (FRONTEND_HRM_MEDCONTROL_PARITY
// 2026-10-14): the daily MedControl workflows the catalog alone does not
// carry — the employee directory, an employee's readiness and lifecycle,
// the org tree and headcount, today's team attendance and manual
// corrections, generated timesheets, the schedule matrix, leave balances,
// pre-check and calendar, payroll runs and their actions, payslips and
// notification reads. Every total, balance and status comes from the
// backend; the browser only lays it out. Readers are lenient about field
// spellings where the guide gives no example.
import { ApiError, asArr, asDict, asNum, http, httpBlobNamed, type Dict } from "@/lib/http";

const enc = encodeURIComponent;
const str = (...vals: unknown[]): string => {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
};
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const send = (method: "POST", value: unknown, signal?: AbortSignal): RequestInit => ({ method, body: JSON.stringify(value), signal });

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
  return str(d.display_name, d.full_name, [d.last_name, d.first_name].filter(Boolean).join(" "), d.name, d.employee_name, d.employee_code);
};

export type OpsPage<T> = { items: T[]; total: number; limit: number; offset: number; hasMore: boolean };
function page<T>(raw: unknown, map: (v: unknown) => T, limit: number, offset: number): OpsPage<T> {
  const d = asDict(raw);
  const items = rows(raw).map(map);
  const total = asNum(d.total, items.length);
  return { items, total, limit: asNum(d.limit, limit), offset: asNum(d.offset, offset), hasMore: d.has_more === true || offset + items.length < total };
}

// ── Employee directory (§4) ─────────────────────────────────────────────────

export type DirectoryPerson = { id: string; name: string; code: string; position: string; positionId: string; unit: string; unitId: string; avatar: string };
export function normDirectoryPerson(raw: unknown): DirectoryPerson {
  const d = asDict(raw);
  return {
    id: str(d.id, d.employee_id),
    name: personName(d),
    code: str(d.employee_code),
    position: str(d.position, asDict(d.position).title),
    positionId: str(d.position_id),
    unit: str(d.org_unit, asDict(d.org_unit).name),
    unitId: str(d.org_unit_id),
    avatar: str(d.avatar_url),
  };
}
// Every employee selector reads this list; it answers at most 100 rows a page.
export async function getDirectory(f: { q?: string; unitId?: string; positionId?: string; status?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<OpsPage<DirectoryPerson>> {
  const limit = Math.min(f.limit ?? 20, 100);
  const offset = f.offset ?? 0;
  const raw = await http(`/internal/employees/directory${qs({ q: f.q, org_unit_id: f.unitId, position_id: f.positionId, status: f.status ?? "active", limit, offset })}`, { signal });
  return page(raw, normDirectoryPerson, limit, offset);
}
// The whole directory, page by page (a few hundred people at most).
export async function getWholeDirectory(signal?: AbortSignal): Promise<DirectoryPerson[]> {
  const out: DirectoryPerson[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const p = await getDirectory({ limit: 100, offset }, signal);
    out.push(...p.items.filter((x) => x.id));
    if (!p.items.length || out.length >= p.total) break;
  }
  return out;
}

// ── Employees (§5) ──────────────────────────────────────────────────────────

export type ReadinessCheck = { key: string; status: string; label: string };
export type Readiness = { ready: boolean; checks: ReadinessCheck[] };
export async function getReadiness(id: string, signal?: AbortSignal): Promise<Readiness> {
  const d = asDict(await http(`/internal/employees/${enc(id)}/readiness`, { signal }));
  return {
    ready: d.ready === true,
    checks: rows(d.checks).map((x) => {
      const c = asDict(x);
      return { key: str(c.key, c.code), status: str(c.status) || "missing", label: str(c.label, c.title) };
    }).filter((c) => c.key),
  };
}

export type EmployeeDetail = { employee: Dict; assignment: Dict; records: Dict[]; counts: Record<string, number> };
export async function getEmployeeDetail(id: string, signal?: AbortSignal): Promise<EmployeeDetail> {
  const d = asDict(await http(`/internal/employees/${enc(id)}`, { signal }));
  return {
    employee: asDict(d.employee ?? d),
    assignment: asDict(d.assignment),
    records: rows(d.records).map(asDict),
    counts: Object.fromEntries(Object.entries(asDict(d.record_counts ?? d.counts)).map(([k, v]) => [k, asNum(v)])),
  };
}

// hire · status · dismiss · reinstate: the backend closes assignments and
// opens the offboarding record itself on a dismissal.
export const LIFECYCLE = ["hire", "status", "dismiss", "reinstate"] as const;
export type Lifecycle = (typeof LIFECYCLE)[number];
export const LIFECYCLE_STATUSES = ["active", "suspended", "on_leave", "inactive"] as const;
export const employeeLifecycle = (id: string, action: Lifecycle, body: { status?: string; date: string; reason: string }) =>
  http(`/internal/employees/${enc(id)}/${action}`, send("POST", body));

export const exportEmployees = () => httpBlobNamed("/internal/employees/export.xlsx");

// ── Organization (§6) ───────────────────────────────────────────────────────

export type OrgTreeNode = { id: string; code: string; name: string; type: string; headId: string; occupied: number; children: OrgTreeNode[] };
function normTree(raw: unknown): OrgTreeNode {
  const d = asDict(raw);
  return { id: str(d.id), code: str(d.code), name: str(d.name, d.title), type: str(d.unit_type, d.type), headId: str(d.head_employee_id), occupied: asNum(d.occupied ?? d.occupied_headcount), children: rows(d.children).map(normTree).filter((n) => n.id) };
}
export async function getOrgTree(asOf: string, signal?: AbortSignal): Promise<{ items: OrgTreeNode[]; units: number; employees: number }> {
  const d = asDict(await http(`/internal/org/tree${qs({ as_of: asOf })}`, { signal }));
  return { items: rows(d.items, "roots").map(normTree).filter((n) => n.id), units: asNum(d.total_units), employees: asNum(d.total_employees) };
}
export type Headcount = { planned: number; occupied: number; vacant: number; employees: number };
export async function getHeadcount(f: { unitId?: string; asOf: string }, signal?: AbortSignal): Promise<Headcount> {
  const d = asDict(await http(`/internal/org/headcount${qs({ org_unit_id: f.unitId, as_of: f.asOf })}`, { signal }));
  return { planned: asNum(d.planned_fte), occupied: asNum(d.occupied_fte), vacant: asNum(d.vacant_fte), employees: asNum(d.employees) };
}

// ── Attendance (§7) ─────────────────────────────────────────────────────────

export const TEAM_GROUPS = ["working", "late", "absent", "leave", "no_shift"] as const;
export type TeamGroup = (typeof TEAM_GROUPS)[number];
export type TeamMember = { id: string; name: string; code: string; unitId: string; positionId: string; firstIn: string; lastOut: string; lateMinutes: number; workedMinutes: number; status: string };
export type TeamToday = { date: string; groups: Record<TeamGroup, TeamMember[]>; counts: Record<TeamGroup, number> };
function normMember(raw: unknown): TeamMember {
  const d = asDict(raw);
  const e = asDict(d.employee ?? d);
  const a = asDict(e.assignment);
  const att = asDict(d.attendance);
  return {
    id: str(e.id, d.employee_id),
    name: personName(e),
    code: str(e.employee_code),
    unitId: str(a.org_unit_id, e.org_unit_id),
    positionId: str(a.position_id, e.position_id),
    firstIn: str(att.first_in_at),
    lastOut: str(att.last_out_at),
    lateMinutes: asNum(att.late_minutes),
    workedMinutes: asNum(att.worked_minutes),
    status: str(att.status),
  };
}
export async function getTeamToday(unitId = "", signal?: AbortSignal): Promise<TeamToday> {
  const d = asDict(await http(`/internal/hrm/attendance/team/today${qs({ org_unit_id: unitId })}`, { signal }));
  const g = asDict(d.groups);
  const c = asDict(d.counts);
  const groups = Object.fromEntries(TEAM_GROUPS.map((k) => [k, rows(g[k]).map(normMember).filter((m) => m.id)])) as Record<TeamGroup, TeamMember[]>;
  const counts = Object.fromEntries(TEAM_GROUPS.map((k) => [k, asNum(c[k], groups[k].length)])) as Record<TeamGroup, number>;
  return { date: str(d.date), groups, counts };
}

export const MANUAL_EVENTS = ["check_in", "check_out", "break_start", "break_end"] as const;
export type ManualEvent = (typeof MANUAL_EVENTS)[number];
// A correction always says why; the backend rebuilds the day and pushes it.
export const createManualEvent = (body: { employee_id: string; event_type: ManualEvent; event_at: string; reason: string }) =>
  http("/internal/time/attendance/events/manual", send("POST", body));

// ── Timesheets (§8) ─────────────────────────────────────────────────────────

export type SheetCell = { code: string; hours: number | null; source: string };
export type SheetRow = { employeeId: string; name: string; code: string; cells: Record<string, SheetCell>; totals: Dict };
export type Timesheet = { id: string; code: string; title: string; status: string; year: number; month: number; unitId: string; days: string[]; rows: SheetRow[]; allowed: string[]; raw: Dict };
function normCell(raw: unknown): SheetCell {
  const d = asDict(raw);
  return typeof raw === "string" ? { code: raw, hours: null, source: "" } : { code: str(d.code), hours: numOrNull(d.hours), source: str(d.source) };
}
function normSheetRow(raw: unknown): SheetRow {
  const d = asDict(raw);
  const cellsRaw = d.cells ?? d.days;
  const cells: Record<string, SheetCell> = {};
  // Cells come keyed by date, or as a list that carries its own date.
  if (Array.isArray(cellsRaw)) for (const c of cellsRaw) { const x = asDict(c); const day = str(x.date, x.work_date); if (day) cells[day.slice(0, 10)] = normCell(x); }
  else for (const [k, v] of Object.entries(asDict(cellsRaw))) cells[k.slice(0, 10)] = normCell(v);
  return { employeeId: str(d.employee_id, asDict(d.employee).id), name: personName(asDict(d.employee ?? d)), code: str(d.employee_code, asDict(d.employee).employee_code), cells, totals: asDict(d.totals ?? d.summary) };
}
export function normTimesheet(raw: unknown): Timesheet {
  const d = asDict(raw);
  const p = asDict(d.payload);
  const sheetRows = rows(d.rows ?? p.rows ?? p.employees ?? d.employees).map(normSheetRow).filter((r) => r.employeeId || r.name);
  const days = asArr(d.days ?? p.days).map((x) => str(x).slice(0, 10)).filter(Boolean);
  return {
    id: str(d.id),
    code: str(d.record_code, d.code),
    title: str(d.title, p.title),
    status: str(d.status) || "draft",
    year: asNum(d.year ?? p.year),
    month: asNum(d.month ?? p.month),
    unitId: str(d.org_unit_id, p.org_unit_id),
    days,
    rows: sheetRows,
    allowed: asArr(d.allowed_transitions).map((x) => str(x)).filter(Boolean),
    raw: d,
  };
}
export async function listTimesheets(f: { year?: number; month?: number; unitId?: string; limit?: number; offset?: number }, signal?: AbortSignal): Promise<OpsPage<Timesheet>> {
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  return page(await http(`/internal/hrm/timesheet/sheets${qs({ year: f.year, month: f.month, org_unit_id: f.unitId, limit, offset })}`, { signal }), normTimesheet, limit, offset);
}
export const createTimesheet = async (body: { title: string; year: number; month: number; org_unit_id: string | null }) =>
  normTimesheet(await http("/internal/hrm/timesheet/sheets", send("POST", body)));

// ── Scheduling (§9) ─────────────────────────────────────────────────────────

export type Shift = { start: string; end: string; breakMinutes: number; name: string };
export type MatrixCell = { shift: Shift | null; status: string };
export type MatrixRow = { employeeId: string; unitId: string; scheduleId: string; cells: Record<string, MatrixCell> };
export type Matrix = { from: string; to: string; days: string[]; rows: MatrixRow[]; total: number };
function normShift(raw: unknown): Shift | null {
  const d = asDict(raw);
  if (!Object.keys(d).length) return null;
  return { start: str(d.start, d.start_time).slice(0, 5), end: str(d.end, d.end_time).slice(0, 5), breakMinutes: asNum(d.break_minutes), name: str(d.name, d.title, d.code) };
}
function normMatrix(raw: unknown): Matrix {
  const d = asDict(raw);
  return {
    from: str(d.from, d.date_from),
    to: str(d.to, d.date_to),
    days: asArr(d.days).map((x) => str(x).slice(0, 10)).filter(Boolean),
    rows: rows(d.rows).map((r) => {
      const x = asDict(r);
      const cells: Record<string, MatrixCell> = {};
      for (const [k, v] of Object.entries(asDict(x.cells))) cells[k.slice(0, 10)] = { shift: normShift(asDict(v).shift), status: str(asDict(v).status) };
      return { employeeId: str(x.employee_id), unitId: str(x.org_unit_id), scheduleId: str(x.schedule_id), cells };
    }),
    total: asNum(d.total),
  };
}
export const getScheduleMatrix = async (f: { from: string; to: string; unitId?: string }, signal?: AbortSignal) =>
  normMatrix(await http(`/internal/hrm/scheduling/matrix${qs({ date_from: f.from, date_to: f.to, org_unit_id: f.unitId })}`, { signal }));
export const getMySchedule = async (f: { from: string; to: string }, signal?: AbortSignal) => normMatrix(await http(`/internal/me/schedule${qs({ date_from: f.from, date_to: f.to })}`, { signal }));
export async function getOnDuty(at: string, signal?: AbortSignal): Promise<TeamMember[]> {
  return rows(await http(`/internal/hrm/scheduling/on-duty${qs({ at })}`, { signal })).map(normMember).filter((m) => m.id);
}

// ── Leave (§10) ─────────────────────────────────────────────────────────────

export type LeaveBalance = { id: string; employeeId: string; employeeName: string; typeId: string; typeName: string; year: number; accrued: number; used: number; remaining: number };
function normBalance(raw: unknown): LeaveBalance {
  const d = asDict(raw);
  const p = asDict(d.payload);
  const v = (k: string) => asNum(d[k] ?? p[k]);
  const type = asDict(d.leave_type);
  return {
    id: str(d.id),
    employeeId: str(d.employee_id, p.employee_id),
    employeeName: personName(asDict(d.employee)) || str(d.employee_name),
    typeId: str(d.leave_type_id, p.leave_type_id, type.id),
    typeName: str(d.leave_type_name, type.name, type.title, d.leave_type_code, type.code, d.title),
    year: v("year"),
    accrued: v("accrued_days"),
    used: v("used_days"),
    remaining: v("remaining_days"),
  };
}
export async function getMyLeaveBalances(signal?: AbortSignal): Promise<LeaveBalance[]> {
  return rows(await http("/internal/me/leave/balances", { signal })).map(normBalance);
}
export async function getLeaveBalances(f: { unitId?: string; year: number; limit?: number; offset?: number }, signal?: AbortSignal): Promise<OpsPage<LeaveBalance>> {
  const limit = f.limit ?? 100;
  const offset = f.offset ?? 0;
  return page(await http(`/internal/hrm/leave/balances${qs({ org_unit_id: f.unitId, year: f.year, limit, offset })}`, { signal }), normBalance, limit, offset);
}

export type Finding = { level: string; code: string; message: string };
export type LeaveCheck = { ok: boolean; days: number | null; remaining: number | null; findings: Finding[] };
// A finding at level "block" stops the request before it is sent.
export const isBlocking = (c: LeaveCheck | null) => !!c && (c.ok === false || c.findings.some((f) => f.level === "block"));
export async function checkLeave(body: { employee_id: string; leave_type_id: string; start_date: string; end_date: string }, signal?: AbortSignal): Promise<LeaveCheck> {
  const d = asDict(await http("/internal/hrm/leave/requests/check", send("POST", body, signal)));
  return {
    ok: d.ok !== false,
    days: numOrNull(d.days ?? d.calculated_days ?? d.requested_days),
    remaining: numOrNull(d.remaining ?? d.remaining_days ?? d.remaining_balance ?? asDict(d.balance).remaining_days),
    findings: rows(d.findings).map((x) => {
      const f = asDict(x);
      return { level: str(f.level, f.severity) || "info", code: str(f.code, f.key), message: str(f.message, f.text, f.detail) };
    }),
  };
}

export type LeaveSpan = { id: string; employeeId: string; employeeName: string; typeName: string; start: string; end: string; status: string; days: number | null };
export async function getLeaveCalendar(f: { from: string; to: string; unitId?: string }, signal?: AbortSignal): Promise<LeaveSpan[]> {
  return rows(await http(`/internal/hrm/leave/calendar${qs({ date_from: f.from, date_to: f.to, org_unit_id: f.unitId })}`, { signal })).map((x) => {
    const d = asDict(x);
    const p = asDict(d.payload);
    return {
      id: str(d.id),
      employeeId: str(d.employee_id, p.employee_id),
      employeeName: personName(asDict(d.employee)) || str(d.employee_name),
      typeName: str(d.leave_type_name, asDict(d.leave_type).name, d.title),
      start: str(d.start_date, p.start_date, d.effective_from).slice(0, 10),
      end: str(d.end_date, p.end_date, d.effective_to).slice(0, 10),
      status: str(d.status),
      days: numOrNull(d.days ?? p.days),
    };
  }).filter((s) => s.start);
}

// ── Payroll runs (§11) ──────────────────────────────────────────────────────

export const RUN_ACTIONS = ["calculate", "recalculate", "submit", "approve", "pay", "close", "cancel"] as const;
export type RunAction = (typeof RUN_ACTIONS)[number];
export type RunHistory = { status: string; at: string; by: string; reason: string };
export type PayrollRun = {
  id: string;
  code: string;
  title: string;
  status: string;
  period: string;
  start: string;
  end: string;
  unitId: string;
  employeeIds: string[];
  totals: Record<string, number>;
  history: RunHistory[];
  allowed: string[];
  raw: Dict;
};
export function normRun(raw: unknown): PayrollRun {
  const d = asDict(raw);
  const p = asDict(d.payload);
  const totals = asDict(d.totals ?? p.totals);
  return {
    id: str(d.id),
    code: str(d.record_code, d.code),
    title: str(d.title, p.title),
    status: str(d.status) || "draft",
    period: str(d.period, p.period),
    start: str(d.period_start, p.period_start).slice(0, 10),
    end: str(d.period_end, p.period_end).slice(0, 10),
    unitId: str(d.org_unit_id, p.org_unit_id),
    employeeIds: asArr(d.employee_ids ?? p.employee_ids).map((x) => str(x)).filter(Boolean),
    totals: Object.fromEntries(Object.entries(totals).filter(([, v]) => numOrNull(v) !== null).map(([k, v]) => [k, numOrNull(v) as number])),
    history: rows(d.status_history ?? p.status_history ?? d.history ?? asDict(d.meta).status_history).map((x) => {
      const h = asDict(x);
      return { status: str(h.status, h.to_status, h.to, h.action), at: str(h.at, h.created_at, h.changed_at), by: str(h.by_name, h.actor_name, h.by, h.actor_user_id, h.user_id), reason: str(h.reason, h.comment) };
    }).filter((h) => h.status),
    allowed: asArr(d.allowed_actions ?? d.allowed_transitions).map((x) => str(x)).filter(Boolean),
    raw: d,
  };
}
export async function listPayrollRuns(f: { period?: string; limit?: number; offset?: number }, signal?: AbortSignal): Promise<OpsPage<PayrollRun>> {
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  return page(await http(`/internal/payroll/runs${qs({ period: f.period, limit, offset })}`, { signal }), normRun, limit, offset);
}
export const createPayrollRun = async (body: { title: string; period_start: string; period_end: string; period?: string; org_unit_id: string | null; employee_ids: string[] }) =>
  normRun(await http("/internal/payroll/runs", send("POST", body)));
export const payrollRunAction = async (id: string, action: RunAction, reason = "") =>
  normRun(await http(`/internal/payroll/runs/${enc(id)}/${action}`, send("POST", reason ? { reason } : {})));
// What can be done from a status when the run does not list it itself.
export const RUN_NEXT: Record<string, RunAction[]> = {
  draft: ["calculate", "cancel"],
  calculated: ["recalculate", "submit", "cancel"],
  submitted: ["approve", "cancel"],
  pending_approval: ["approve", "cancel"],
  approved: ["pay", "cancel"],
  paid: ["close"],
};

export type Payslip = { period: string; currency: string; total: number; entries: { id: string; type: string; title: string; amount: number; status: string }[] };
export async function getMyPayslips(signal?: AbortSignal): Promise<Payslip[]> {
  return rows(await http("/internal/me/payslips", { signal })).map((x) => {
    const d = asDict(x);
    return {
      period: str(d.period),
      currency: str(d.currency) || "UZS",
      total: asNum(d.total),
      entries: rows(d.entries).map((e) => {
        const r = asDict(e);
        return { id: str(r.id), type: str(r.type, r.entry_type), title: str(r.title), amount: asNum(r.amount), status: str(r.status) };
      }),
    };
  });
}

// ── Notifications (§12) ─────────────────────────────────────────────────────

// The internal inbox is the account's own notification list read through
// the internal routes; where a deployment does not have them yet (404) the
// general route marks the same rows.
const orGeneral = (e: unknown, path: string) => {
  if (e instanceof ApiError && e.status === 404) return http(path, { method: "POST" });
  throw e;
};
export const readInternalNotification = (id: string) =>
  http(`/internal/me/notifications/${enc(id)}/read`, { method: "POST" }).catch((e: unknown) => orGeneral(e, `/notifications/${enc(id)}/read`));
export const readAllInternalNotifications = () =>
  http("/internal/me/notifications/read-all", { method: "POST" }).catch((e: unknown) => orGeneral(e, "/notifications/read-all"));
