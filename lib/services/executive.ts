// Executive HRM, Live Office, realtime AI and CEO analytics
// (TEZKOR_HIMOYA_EXECUTIVE_HRM_LIVE_AI_FRONTEND_2026_11_13.md).
//
// The backend decides who sees what (§2, §11): permissions, CEO totals,
// finance visibility, department scope, schedule ownership and AI
// priorities are all its verdicts. Nothing here computes them; the
// normalizers only read the response, tolerating the key variants the
// backend uses elsewhere, and keep "not connected" apart from zero.
import { asArr, asDict, asNum, asStr, backendOrigin, http, type Dict } from "@/lib/http";

const enc = encodeURIComponent;
const post = (value: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(value) });

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

// A number the backend sent, or null when it sent none (never a made-up 0).
export function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
const first = (d: Dict, keys: string[]): unknown => {
  for (const k of keys) if (d[k] !== undefined && d[k] !== null) return d[k];
  return undefined;
};
const listOf = (v: unknown, ...keys: string[]): unknown[] => {
  if (Array.isArray(v)) return v;
  const d = asDict(v);
  for (const k of [...keys, "items", "data", "results"]) if (Array.isArray(d[k])) return d[k] as unknown[];
  return [];
};

export const NOT_CONNECTED = "not_connected";
export const isNotConnected = (status: string): boolean => /^(not_connected|not_configured|disconnected|unavailable)$/i.test(status);

// ── A metric with its previous period ───────────────────────────────
export type Metric = { value: number | null; previous: number | null; changePct: number | null; status: string; unit: string };
const NO_METRIC: Metric = { value: null, previous: null, changePct: null, status: "", unit: "" };
export function metricOf(v: unknown): Metric {
  if (v === undefined || v === null) return NO_METRIC;
  if (typeof v === "number" || typeof v === "string") {
    const n = numOrNull(v);
    return n === null ? { ...NO_METRIC, status: typeof v === "string" ? v : "" } : { ...NO_METRIC, value: n };
  }
  const d = asDict(v);
  const status = asStr(d.status ?? d.connector_status ?? d.state);
  const value = numOrNull(first(d, ["value", "current", "count", "total", "amount", "pct", "percent"]));
  const previous = numOrNull(first(d, ["previous", "previous_value", "prev", "previous_count", "previous_total"]));
  let changePct = numOrNull(first(d, ["change_pct", "delta_pct", "change_percent", "growth_pct", "change"]));
  // Only a backend-sent change is shown; when it sent both values but no
  // change, the change is plain arithmetic on its own numbers.
  if (changePct === null && value !== null && previous !== null && previous !== 0) changePct = ((value - previous) / Math.abs(previous)) * 100;
  return { value, previous, changePct, status, unit: asStr(d.unit ?? d.currency) };
}

// ── CEO platform analytics (§4) ─────────────────────────────────────
export type Period = { from: string; to: string; timezone: string };
export type Connector = { key: string; label: string; status: string; detail: string; checkedAt: string };
export type CeoKpiKey = "unique_users" | "sessions" | "avg_session_duration" | "orders" | "paid_revenue" | "ai_runs" | "calls";
export const CEO_KPI_KEYS: readonly CeoKpiKey[] = ["unique_users", "sessions", "avg_session_duration", "orders", "paid_revenue", "ai_runs", "calls"];
export type PlatformRow = { platform: string; users: Metric; sessions: Metric; events: Metric };
export type EventRow = { name: string; count: Metric };
export type VersionRow = { platform: string; version: string; users: number | null; sharePct: number | null };
export type FunnelStep = { key: string; count: number | null; conversionPct: number | null };
export type CeoPlatform = {
  period: Period;
  previous: Period;
  kpis: Record<CeoKpiKey, Metric>;
  installs: { platform: string; value: Metric; status: string }[];
  connectors: Connector[];
  platforms: PlatformRow[];
  events: EventRow[];
  retention: { d1: number | null; d7: number | null; d30: number | null; status: string };
  versions: VersionRow[];
  crashFreePct: Metric;
  funnel: FunnelStep[];
  calls: { inbound: Metric; outbound: Metric; answered: Metric; missed: Metric; status: string };
  ai: { completed: Metric; failed: Metric };
  hrm: { present: Metric; active: Metric };
  generatedAt: string;
};

function periodOf(v: unknown): Period {
  const d = asDict(v);
  return { from: asStr(d.date_from ?? d.from ?? d.start), to: asStr(d.date_to ?? d.to ?? d.end), timezone: asStr(d.timezone ?? d.tz) };
}

// The same block as an object keyed by name or as a list of rows.
function rowsOf(v: unknown, nameKeys: string[]): { name: string; d: Dict }[] {
  if (Array.isArray(v)) return v.map((x) => ({ name: asStr(first(asDict(x), nameKeys)), d: asDict(x) })).filter((r) => r.name);
  const d = asDict(v);
  return Object.entries(d)
    .filter(([, x]) => x !== null && (typeof x === "object" || typeof x === "number"))
    .map(([name, x]) => ({ name, d: typeof x === "number" ? { value: x } : asDict(x) }));
}

const KPI_ALIASES: Record<CeoKpiKey, string[]> = {
  unique_users: ["unique_users", "users", "active_users", "unique_user_count"],
  sessions: ["sessions", "session_count", "total_sessions"],
  avg_session_duration: ["avg_session_duration_ms", "average_session_duration_ms", "avg_session_duration", "average_session_duration", "avg_session_seconds"],
  orders: ["orders", "order_count", "orders_count"],
  paid_revenue: ["paid_revenue", "revenue", "paid_revenue_uzs", "revenue_paid"],
  ai_runs: ["ai_runs", "ai_run_count", "ai_requests"],
  calls: ["calls", "call_count", "calls_total"],
};

export function normCeoPlatform(raw: unknown): CeoPlatform {
  const d = asDict(raw);
  const sum = asDict(d.summary ?? d.totals ?? d.kpis ?? d.overview ?? d.metrics);
  const kpis = {} as Record<CeoKpiKey, Metric>;
  for (const key of CEO_KPI_KEYS) {
    const v = first(sum, KPI_ALIASES[key]) ?? first(d, KPI_ALIASES[key]);
    const m = metricOf(v);
    // Seconds → ms, so the page has one unit for durations.
    const secs = key === "avg_session_duration" && (sum.avg_session_seconds !== undefined || d.avg_session_seconds !== undefined);
    kpis[key] = secs ? { ...m, value: m.value === null ? null : m.value * 1000, previous: m.previous === null ? null : m.previous * 1000 } : m;
  }

  const connectorsRaw = d.connectors ?? d.integrations ?? asDict(d.installs).connectors;
  const connectors: Connector[] = rowsOf(connectorsRaw, ["key", "name", "connector", "code"]).map(({ name, d: c }) => ({
    key: name,
    label: asStr(c.label ?? c.title ?? c.name, name),
    status: asStr(c.status ?? c.state, ""),
    detail: asStr(c.detail ?? c.message ?? c.note),
    checkedAt: asStr(c.checked_at ?? c.updated_at),
  }));

  const installsRaw = d.installs ?? d.app_installs ?? d.install_counters;
  const installs = rowsOf(installsRaw, ["platform", "store", "name"])
    .filter((r) => r.name !== "connectors")
    .map(({ name, d: i }) => {
      const value = metricOf(i.installs ?? i.count ?? i.value ?? i);
      const status = asStr(i.status ?? i.connector_status ?? value.status);
      return { platform: name, value: isNotConnected(status) ? { ...value, value: null } : value, status };
    });

  const platforms: PlatformRow[] = rowsOf(d.platform_usage ?? d.platforms ?? d.by_platform, ["platform", "name"]).map(({ name, d: p }) => ({
    platform: name,
    users: metricOf(p.unique_users ?? p.users),
    sessions: metricOf(p.sessions),
    events: metricOf(p.events ?? p.event_count),
  }));

  const events: EventRow[] = rowsOf(d.event_comparison ?? d.events ?? d.events_by_name, ["event_name", "name", "event"]).map(({ name, d: e }) => ({
    name,
    count: metricOf(e.count !== undefined || e.value !== undefined || e.current !== undefined ? e : e.total ?? e),
  }));

  const ret = asDict(d.retention);
  const retPct = (k: string) => numOrNull(first(ret, [k, `${k}_pct`, `${k}_percent`, `${k.toUpperCase()}`]) ?? (typeof ret[k] === "object" ? first(asDict(ret[k]), ["pct", "value", "rate"]) : undefined));
  const retention = { d1: retPct("d1"), d7: retPct("d7"), d30: retPct("d30"), status: asStr(ret.status) };

  const versions: VersionRow[] = listOf(d.app_versions ?? d.version_adoption ?? d.versions).map((x) => {
    const v = asDict(x);
    return {
      platform: asStr(v.platform),
      version: asStr(v.app_version ?? v.version),
      users: numOrNull(first(v, ["users", "unique_users", "count", "installs"])),
      sharePct: numOrNull(first(v, ["share_pct", "share", "adoption_pct", "pct"])),
    };
  }).filter((v) => v.version);

  const stab = asDict(d.stability);
  const crashFreePct = metricOf(first(d, ["crash_free_pct", "crash_free_percent", "crash_free"]) ?? first(stab, ["crash_free_pct", "crash_free"]));

  const funnel: FunnelStep[] = rowsOf(d.funnel ?? d.registration_funnel ?? d.registration_to_payment, ["step", "event_name", "stage", "key", "name"]).map(({ name, d: f }) => ({
    key: name,
    count: numOrNull(first(f, ["count", "users", "value", "unique_users"])),
    conversionPct: numOrNull(first(f, ["conversion_pct", "conversion", "rate_pct", "pct"])),
  }));

  const c = asDict(d.calls ?? d.call_metrics);
  const calls = {
    inbound: metricOf(c.inbound),
    outbound: metricOf(c.outbound),
    answered: metricOf(c.answered),
    missed: metricOf(c.missed),
    status: asStr(c.status ?? asDict(c.sip).status ?? c.connector_status),
  };
  const a = asDict(d.ai ?? d.ai_runs_breakdown);
  const ai = { completed: metricOf(a.completed), failed: metricOf(a.failed) };
  const h = asDict(d.hrm ?? d.presence ?? d.workforce);
  const hrm = { present: metricOf(first(h, ["present", "online", "present_now", "presence"])), active: metricOf(first(h, ["active_employees", "active", "employees_active"])) };

  return {
    period: periodOf(d.period ?? d.selected_period ?? { date_from: d.date_from, date_to: d.date_to, timezone: d.timezone }),
    previous: periodOf(d.previous_period ?? d.comparison_period ?? d.compare_period),
    kpis,
    installs,
    connectors,
    platforms,
    events,
    retention,
    versions,
    crashFreePct,
    funnel,
    calls,
    ai,
    hrm,
    generatedAt: asStr(d.generated_at ?? d.computed_at ?? d.updated_at),
  };
}

export async function getCeoPlatform(p: { from?: string; to?: string; timezone?: string } = {}, signal?: AbortSignal): Promise<CeoPlatform> {
  return normCeoPlatform(await http(`/analytics/ceo/platform${qs({ date_from: p.from, date_to: p.to, timezone: p.timezone || "Asia/Tashkent" })}`, { signal }));
}

// ── IT monitoring (§5) ──────────────────────────────────────────────
export type ItIncident = { id: string; title: string; severity: string; status: string; component: string; openedAt: string };
export type ItConnector = { key: string; status: string; latencyMs: number | null; detail: string; checkedAt: string };
export type ItMonitoring = { snapshotAt: string; snapshot: Dict; incidents: ItIncident[]; connectors: ItConnector[] };
export const IT_CONNECTOR_ORDER = ["database", "redis", "websocket", "workers", "ai", "payments", "sip"];
export function normItMonitoring(raw: unknown): ItMonitoring {
  const d = asDict(raw);
  const snap = asDict(d.snapshot ?? d.latest_snapshot ?? d.latest);
  const incidents = listOf(d.open_incidents ?? d.incidents).map((x) => {
    const i = asDict(x);
    return {
      id: asStr(i.id),
      title: asStr(i.title ?? i.summary ?? i.message ?? i.code),
      severity: asStr(i.severity ?? i.level ?? i.priority),
      status: asStr(i.status, "open"),
      component: asStr(i.component ?? i.connector ?? i.service),
      openedAt: asStr(i.opened_at ?? i.created_at ?? i.started_at),
    };
  });
  const connectors = rowsOf(d.connectors ?? d.connector_state ?? snap.connectors, ["key", "name", "connector"]).map(({ name, d: c }) => ({
    key: name,
    status: asStr(c.status ?? c.state ?? (typeof c.ok === "boolean" ? (c.ok ? "ok" : "down") : ""), ""),
    latencyMs: numOrNull(first(c, ["latency_ms", "latency", "response_ms"])),
    detail: asStr(c.detail ?? c.message ?? c.error),
    checkedAt: asStr(c.checked_at ?? c.updated_at),
  }));
  connectors.sort((x, y) => {
    const ix = IT_CONNECTOR_ORDER.indexOf(x.key), iy = IT_CONNECTOR_ORDER.indexOf(y.key);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
  });
  return {
    snapshotAt: asStr(snap.captured_at ?? snap.created_at ?? snap.timestamp ?? d.snapshot_at ?? d.generated_at),
    snapshot: snap,
    incidents,
    connectors,
  };
}
export async function getItMonitoring(signal?: AbortSignal): Promise<ItMonitoring> {
  return normItMonitoring(await http("/internal/it/monitoring/overview", { signal }));
}
export type ConnectorTone = "ok" | "warn" | "bad" | "off";
export function connectorTone(status: string): ConnectorTone {
  const s = status.toLowerCase();
  if (isNotConnected(s)) return "off";
  if (/^(ok|healthy|up|connected|online|running|ready|pass)$/.test(s)) return "ok";
  if (/(degraded|slow|warn|partial|lag)/.test(s)) return "warn";
  if (!s || s === "unknown") return "off";
  return "bad";
}

// ── Department head (§6) ────────────────────────────────────────────
export type DeptUnit = { id: string; name: string };
export type DepartmentDashboard = {
  headEmployeeId: string;
  units: DeptUnit[];
  employeeCount: number | null;
  onlineCount: number | null;
  scheduleCount: number | null;
  payrollVisible: boolean;
  financeVisible: boolean;
};
export function normDepartmentDashboard(raw: unknown): DepartmentDashboard {
  const d = asDict(raw);
  const named = listOf(d.units ?? d.org_units).map((x) => {
    const u = asDict(x);
    return { id: asStr(u.id ?? u.org_unit_id), name: asStr(u.name ?? u.title) };
  }).filter((u) => u.id);
  const ids = asArr(d.allowed_unit_ids ?? d.unit_ids ?? d.scope_unit_ids).map((x) => asStr(x)).filter(Boolean);
  const units = named.length ? named : ids.map((id) => ({ id, name: "" }));
  return {
    headEmployeeId: asStr(d.head_employee_id ?? d.employee_id),
    units,
    employeeCount: numOrNull(first(d, ["employee_count", "employees", "employees_count"])),
    onlineCount: numOrNull(first(d, ["online_count", "online_now", "currently_online"])),
    scheduleCount: numOrNull(first(d, ["schedule_count", "schedules", "schedules_count"])),
    // Only an explicit true opens them; anything else keeps them hidden.
    payrollVisible: d.payroll_visible === true,
    financeVisible: d.finance_visible === true,
  };
}
export async function getDepartmentDashboard(signal?: AbortSignal): Promise<DepartmentDashboard> {
  return normDepartmentDashboard(await http("/internal/department/dashboard", { signal }));
}

export type WeekSlot = { weekday: number; start: string; end: string };
export type ScheduleType = "weekly" | "24_7";
export type DepartmentScheduleInput = {
  target: { employeeId: string } | { orgUnitId: string };
  title: string;
  type: ScheduleType;
  timezone: string;
  weekly: WeekSlot[];
};
// Exactly one target (§6): employee_id or org_unit_id, never both.
export function scheduleBody(input: DepartmentScheduleInput): Dict {
  const target = "employeeId" in input.target ? { employee_id: input.target.employeeId } : { org_unit_id: input.target.orgUnitId };
  return {
    ...target,
    title: input.title.trim(),
    schedule_type: input.type,
    timezone: input.timezone || "Asia/Tashkent",
    // 24/7: the backend fills all seven days as 00:00–24:00 itself.
    weekly: input.type === "24_7" ? [] : input.weekly.map((w) => ({ weekday: w.weekday, start: w.start, end: w.end })),
  };
}
export type DeptSchedule = { id: string; title: string; type: string; employeeId: string; orgUnitId: string; timezone: string; weekly: WeekSlot[]; createdAt: string };
export function normDeptSchedule(raw: unknown): DeptSchedule {
  const d = asDict(raw);
  return {
    id: asStr(d.id),
    title: asStr(d.title ?? d.name),
    type: asStr(d.schedule_type ?? d.type),
    employeeId: asStr(d.employee_id),
    orgUnitId: asStr(d.org_unit_id),
    timezone: asStr(d.timezone),
    weekly: asArr(d.weekly ?? d.days).map((x) => {
      const w = asDict(x);
      return { weekday: asNum(w.weekday), start: asStr(w.start ?? w.start_time), end: asStr(w.end ?? w.end_time) };
    }),
    createdAt: asStr(d.created_at),
  };
}
export async function createDepartmentSchedule(input: DepartmentScheduleInput): Promise<DeptSchedule> {
  return normDeptSchedule(await http("/internal/department/schedules", post(scheduleBody(input))));
}
// Not in the 2026-11-13 contract: read when the backend has it, else the
// page shows only the count from the dashboard.
export async function listDepartmentSchedules(signal?: AbortSignal): Promise<DeptSchedule[]> {
  return listOf(await http("/internal/department/schedules", { signal }), "schedules").map(normDeptSchedule).filter((s) => s.id);
}

// ── Sales scripts (§8) ──────────────────────────────────────────────
export type ScriptContent = { opening: string; questions: string[]; objections: string[] };
export type ScriptVersion = { version: number; status: string; content: ScriptContent; changeNote: string; createdAt: string; publishedAt: string };
export type SalesScript = {
  id: string;
  code: string;
  title: string;
  audience: string;
  serviceScope: string;
  language: string;
  status: string;
  currentVersion: number | null;
  publishedVersion: number | null;
  content: ScriptContent;
  versions: ScriptVersion[];
  updatedAt: string;
};
const strList = (v: unknown) => asArr(v).map((x) => asStr(x).trim()).filter(Boolean);
export function scriptContentOf(v: unknown): ScriptContent {
  const d = asDict(v);
  return { opening: asStr(d.opening), questions: strList(d.questions), objections: strList(d.objections) };
}
function versionOf(v: unknown): ScriptVersion {
  const d = asDict(v);
  return {
    version: asNum(d.version ?? d.number),
    status: asStr(d.status),
    content: scriptContentOf(d.content),
    changeNote: asStr(d.change_note),
    createdAt: asStr(d.created_at),
    publishedAt: asStr(d.published_at),
  };
}
export function normSalesScript(raw: unknown): SalesScript {
  const d = asDict(raw);
  const versions = asArr(d.versions).map(versionOf).filter((v) => v.version > 0).sort((a, b) => b.version - a.version);
  const cur = asDict(d.current_version_detail ?? d.latest_version ?? d.version_detail);
  const currentVersion = numOrNull(typeof d.current_version === "object" ? asDict(d.current_version).version : first(d, ["current_version", "version", "latest_version_number"])) ?? versions[0]?.version ?? null;
  const published = versions.find((v) => v.status === "published")?.version ?? numOrNull(first(d, ["published_version", "published_version_number"]));
  const content = d.content !== undefined ? scriptContentOf(d.content) : cur.content !== undefined ? scriptContentOf(cur.content) : versions[0]?.content ?? { opening: "", questions: [], objections: [] };
  return {
    id: asStr(d.id ?? d.script_id),
    code: asStr(d.code),
    title: asStr(d.title),
    audience: asStr(d.audience),
    serviceScope: asStr(d.service_scope),
    language: asStr(d.language),
    status: asStr(d.status),
    currentVersion,
    publishedVersion: published ?? null,
    content,
    versions,
    updatedAt: asStr(d.updated_at ?? d.created_at),
  };
}
export type ScriptInput = { code: string; title: string; audience: string; serviceScope: string; language: string; content: ScriptContent; changeNote: string };
export function scriptBody(i: ScriptInput): Dict {
  return {
    code: i.code.trim(),
    title: i.title.trim(),
    audience: i.audience,
    service_scope: i.serviceScope.trim(),
    language: i.language,
    content: {
      opening: i.content.opening.trim(),
      questions: i.content.questions.map((q) => q.trim()).filter(Boolean),
      objections: i.content.objections.map((q) => q.trim()).filter(Boolean),
    },
    change_note: i.changeNote.trim(),
  };
}
export async function listSalesScripts(status?: string, signal?: AbortSignal): Promise<SalesScript[]> {
  return listOf(await http(`/internal/sales-scripts${qs({ status })}`, { signal }), "scripts").map(normSalesScript).filter((s) => s.id);
}
export async function getSalesScript(id: string, signal?: AbortSignal): Promise<SalesScript> {
  return normSalesScript(await http(`/internal/sales-scripts/${enc(id)}`, { signal }));
}
export async function createSalesScript(i: ScriptInput): Promise<SalesScript> {
  return normSalesScript(await http("/internal/sales-scripts", post(scriptBody(i))));
}
export async function createScriptVersion(id: string, i: ScriptInput): Promise<SalesScript> {
  return normSalesScript(await http(`/internal/sales-scripts/${enc(id)}/versions`, post(scriptBody(i))));
}
export async function publishScriptVersion(id: string, version: number): Promise<SalesScript> {
  return normSalesScript(await http(`/internal/sales-scripts/${enc(id)}/versions/${version}/publish`, { method: "POST" }));
}

// ── Realtime call-assistant AI (§9) ─────────────────────────────────
export type RtSourceType = "livekit" | "sip" | "crm";
export type RtSpeaker = "client" | "operator" | "lawyer";
export const RT_SUGGESTION_TYPES = ["next_question", "short_answer", "objection", "risk", "legal_basis", "service", "escalation", "lawyer_dispatch", "next_action"] as const;
export type RtSuggestion = {
  id: string;
  type: string;
  priority: number;
  text: string;
  rationale: string;
  language: string;
  startMs: number | null;
  endMs: number | null;
  status: string;
  editedText: string;
  usedAt: string;
  createdAt: string;
};
export type RtGeneration = "completed" | "provider_unavailable" | "not_requested" | "session_not_active" | string;
export type RtSession = { id: string; callId: string; status: string; sourceType: string; scriptVersionIds: string[]; startedAt: string };
export type RtUpdate = { sessionId: string; callId: string; items: RtSuggestion[]; generation: RtGeneration; errorCode: string };

export function rtSuggestionOf(v: unknown): RtSuggestion {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    type: asStr(d.type),
    priority: asNum(d.priority, 99),
    text: asStr(d.text),
    rationale: asStr(d.rationale),
    language: asStr(d.language),
    startMs: numOrNull(d.transcript_start_ms),
    endMs: numOrNull(d.transcript_end_ms),
    status: asStr(d.status, "new"),
    editedText: asStr(d.edited_text),
    usedAt: asStr(d.used_at),
    createdAt: asStr(d.created_at),
  };
}
// The backend picks 1–3 and their order; at most three are ever shown (§9).
export function topSuggestions(items: RtSuggestion[]): RtSuggestion[] {
  return [...items].filter((s) => s.id && s.text).sort((a, b) => a.priority - b.priority).slice(0, 3);
}
export function rtSessionOf(v: unknown): RtSession {
  const d = asDict(asDict(v).session ?? v);
  return {
    id: asStr(d.id ?? d.session_id),
    callId: asStr(d.call_id),
    status: asStr(d.status, "active"),
    sourceType: asStr(d.source_type),
    scriptVersionIds: asArr(d.script_version_ids ?? d.sales_script_version_ids).map((x) => asStr(x)).filter(Boolean),
    startedAt: asStr(d.started_at ?? d.created_at),
  };
}
export function rtUpdateOf(v: unknown): RtUpdate {
  const d = asDict(v);
  return {
    sessionId: asStr(d.session_id),
    callId: asStr(d.call_id),
    items: listOf(d.items ?? d.suggestions).map(rtSuggestionOf),
    generation: asStr(d.generation_status),
    errorCode: asStr(d.error_code),
  };
}
export async function createRtSession(input: { callId: string; sourceType: RtSourceType; clientUserId?: string; entityType?: string; entityId?: string; language?: string }): Promise<RtSession> {
  const body: Dict = { call_id: input.callId, source_type: input.sourceType, language: input.language ?? "auto" };
  if (input.clientUserId) body.client_user_id = input.clientUserId;
  if (input.entityType && input.entityId) {
    body.entity_type = input.entityType;
    body.entity_id = input.entityId;
  }
  return rtSessionOf(await http("/internal/realtime-ai/sessions", post(body)));
}
export type RtSegment = { key: string; speaker: RtSpeaker; text: string; startMs: number; endMs: number; final: boolean; language?: string };
// Suggestions only for final segments (§9).
export function transcriptBody(s: RtSegment, wantSuggestions: boolean): Dict {
  return {
    segment_key: s.key,
    speaker: s.speaker,
    text: s.text,
    language: s.language ?? "auto",
    start_ms: Math.max(0, Math.round(s.startMs)),
    end_ms: Math.max(0, Math.round(s.endMs)),
    is_final: s.final,
    generate_suggestions: s.final && wantSuggestions,
  };
}
export async function sendRtTranscript(sessionId: string, s: RtSegment, wantSuggestions: boolean): Promise<RtUpdate> {
  return rtUpdateOf(await http(`/internal/realtime-ai/sessions/${enc(sessionId)}/transcript`, post(transcriptBody(s, wantSuggestions))));
}
export type RtDecision = { action: "used" } | { action: "edited"; editedText: string } | { action: "dismissed" };
export async function decideRtSuggestion(id: string, d: RtDecision): Promise<RtSuggestion> {
  const body: Dict = { action: d.action };
  if (d.action === "edited") body.edited_text = d.editedText.trim();
  return rtSuggestionOf(asDict(await http(`/internal/realtime-ai/suggestions/${enc(id)}/decision`, post(body))).suggestion ?? {});
}
export async function setRtSessionState(id: string, action: "pause" | "resume" | "end"): Promise<RtSession> {
  return rtSessionOf(await http(`/internal/realtime-ai/sessions/${enc(id)}/${action}`, { method: "POST" }));
}
export type RtTimelineEntry = { kind: "transcript" | "suggestion"; atMs: number; endMs: number | null; speaker: string; text: string; suggestion: RtSuggestion | null };
export function normRtTimeline(raw: unknown): RtTimelineEntry[] {
  const d = asDict(raw);
  const out: RtTimelineEntry[] = [];
  for (const x of listOf(d.transcript ?? d.segments)) {
    const s = asDict(x);
    const text = asStr(s.text).trim();
    if (!text) continue;
    out.push({ kind: "transcript", atMs: asNum(s.start_ms ?? s.started_at_ms), endMs: numOrNull(s.end_ms ?? s.ended_at_ms), speaker: asStr(s.speaker), text, suggestion: null });
  }
  for (const x of listOf(d.suggestions)) {
    const s = rtSuggestionOf(x);
    if (!s.text) continue;
    out.push({ kind: "suggestion", atMs: s.startMs ?? s.endMs ?? 0, endMs: s.endMs, speaker: "", text: s.text, suggestion: s });
  }
  // One merged list (some backends send it that way already).
  for (const x of listOf(d.timeline ?? d.events)) {
    const e = asDict(x);
    const kind = /suggest/i.test(asStr(e.kind ?? e.type)) ? "suggestion" : "transcript";
    const sug = kind === "suggestion" ? rtSuggestionOf(e.suggestion ?? e) : null;
    const text = asStr(sug?.text || e.text).trim();
    if (!text) continue;
    out.push({ kind, atMs: asNum(e.at_ms ?? e.start_ms ?? e.transcript_start_ms), endMs: numOrNull(e.end_ms ?? e.transcript_end_ms), speaker: asStr(e.speaker), text, suggestion: sug });
  }
  return out.sort((a, b) => a.atMs - b.atMs || (a.kind === b.kind ? 0 : a.kind === "transcript" ? -1 : 1));
}
export async function getRtTimeline(id: string, signal?: AbortSignal): Promise<RtTimelineEntry[]> {
  return normRtTimeline(await http(`/internal/realtime-ai/sessions/${enc(id)}/timeline`, { signal }));
}
export function rtSocketUrl(sessionId: string, token: string): string {
  return `${backendOrigin("ws")}/internal/realtime-ai/ws/${enc(sessionId)}?token=${enc(token)}`;
}

// ── Duty-lawyer AI drafts (§10) ─────────────────────────────────────
export type LawyerDraft = {
  id: string;
  entityType: string;
  entityId: string;
  taskType: string;
  status: string;
  content: string;
  questions: string[];
  requiresHumanConfirmation: boolean;
  decision: string;
  finalContent: string;
  execution: string;
  createdAt: string;
};
export function lawyerDraftOf(v: unknown): LawyerDraft {
  const d = asDict(asDict(v).draft ?? v);
  const out = asDict(d.output ?? d.result);
  const content = asStr(d.content ?? d.draft_text ?? d.text ?? out.content ?? out.text ?? out.draft);
  return {
    id: asStr(d.id ?? d.draft_id),
    entityType: asStr(d.entity_type),
    entityId: asStr(d.entity_id),
    taskType: asStr(d.task_type),
    status: asStr(d.status),
    content,
    questions: strList(d.missing_questions ?? d.questions ?? out.missing_questions ?? out.questions),
    // The contract always asks for a person: only an explicit false lifts it.
    requiresHumanConfirmation: d.requires_human_confirmation !== false,
    decision: asStr(d.decision),
    finalContent: asStr(d.final_content),
    execution: asStr(asDict(v).execution ?? d.execution),
    createdAt: asStr(d.created_at),
  };
}
export async function createLawyerDraft(input: { entityType: string; entityId: string; taskType: string; instruction: string; context: Dict; language?: string }): Promise<LawyerDraft> {
  return lawyerDraftOf(
    await http(
      "/internal/lawyer-ai/drafts",
      post({ entity_type: input.entityType, entity_id: input.entityId, task_type: input.taskType, instruction: input.instruction.trim(), context: input.context, language: input.language ?? "uz_latn" }),
    ),
  );
}
export type DraftDecision = { decision: "approve"; finalContent: string; note: string } | { decision: "reject"; note: string };
export async function confirmLawyerDraft(id: string, d: DraftDecision): Promise<LawyerDraft> {
  const body: Dict = d.decision === "approve" ? { decision: "approve", final_content: d.finalContent.trim(), note: d.note.trim() } : { decision: "reject", note: d.note.trim() };
  return lawyerDraftOf(await http(`/internal/lawyer-ai/drafts/${enc(id)}/confirm`, post(body)));
}
