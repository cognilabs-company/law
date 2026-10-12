// Internal HRM over the typed catalog (FRONTEND_STUDIO_HRM_TYPED_SCHEMAS
// 2026-10-12): 20 modules, 92 record types, each with its fields and its
// workflow, all read from GET /internal/hrm/catalog — nothing about a record
// type is written down here. Records, filters, dashboards, transitions and
// the field-level errors of a refused payload.
import { useSyncExternalStore } from "react";
import { ApiError, asArr, asDict, asNum, http, type Dict } from "@/lib/http";

const enc = encodeURIComponent;
const str = (...vals: unknown[]): string => {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
};
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ── Catalog ─────────────────────────────────────────────────────────────────

export type HrmField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  source: string;
  options: string[];
  default: unknown;
  min: number | null;
  max: number | null;
  currency: string;
};
export type HrmWorkflow = { key: string; initial: string; transitions: Record<string, string[]> };
export type HrmType = {
  key: string;
  domain: string;
  title: string;
  fields: HrmField[];
  workflow: string;
  allowChildren: boolean;
  initialStatus: string;
};
export type HrmModule = { key: string; title: string; types: HrmType[] };
export type HrmCatalog = { version: number; modules: HrmModule[]; workflows: Record<string, HrmWorkflow> };

function normField(raw: unknown): HrmField {
  const f = asDict(raw);
  return {
    key: str(f.key, f.name),
    label: str(f.label, f.key, f.name),
    type: str(f.type).toLowerCase() || "text",
    required: f.required === true,
    source: str(f.source),
    options: asArr(f.options).map((o) => (typeof o === "string" || typeof o === "number" ? String(o) : str(asDict(o).value, asDict(o).key))).filter(Boolean),
    default: f.default,
    min: numOrNull(f.min),
    max: numOrNull(f.max),
    currency: str(f.currency),
  };
}

export function normCatalog(raw: unknown): HrmCatalog {
  const d = asDict(raw);
  const workflows: Record<string, HrmWorkflow> = {};
  for (const [key, w] of Object.entries(asDict(d.workflows))) {
    const wd = asDict(w);
    const transitions: Record<string, string[]> = {};
    for (const [from, to] of Object.entries(asDict(wd.transitions))) transitions[from] = asArr(to).map((x) => str(x)).filter(Boolean);
    workflows[key] = { key, initial: str(wd.initial) || "draft", transitions };
  }
  const modules = asArr(d.domains ?? d.modules).map((m) => {
    const md = asDict(m);
    const key = str(md.key, md.domain);
    return {
      key,
      title: str(md.title, key),
      types: asArr(md.record_types ?? md.types).map((t) => {
        const td = asDict(t);
        return {
          key: str(td.key),
          domain: key,
          title: str(td.title, td.key),
          fields: asArr(td.fields).map(normField).filter((f) => f.key),
          workflow: str(td.workflow) || "direct",
          allowChildren: td.allow_children === true,
          initialStatus: str(td.initial_status),
        };
      }).filter((t) => t.key),
    };
  }).filter((m) => m.key);
  return { version: asNum(d.schema_version, 1), modules, workflows };
}

// One read per page load, shared by every screen.
let catalog: { state: "idle" | "loading" | "ready" | "error"; data: HrmCatalog | null; error: unknown } = { state: "idle", data: null, error: null };
let pending: Promise<HrmCatalog | null> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function loadHrmCatalog(force = false): Promise<HrmCatalog | null> {
  if (pending && !force) return pending;
  catalog = { ...catalog, state: "loading" };
  emit();
  pending = http("/internal/hrm/catalog")
    .then((raw) => {
      const data = normCatalog(raw);
      catalog = { state: "ready", data, error: null };
      emit();
      return data;
    })
    .catch((error: unknown) => {
      catalog = { state: "error", data: catalog.data, error };
      pending = null;
      emit();
      return null;
    });
  return pending;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  if (catalog.state === "idle") void loadHrmCatalog();
  return () => {
    listeners.delete(fn);
  };
};
const snapshot = () => catalog;
const serverSnapshot = () => ({ state: "idle" as const, data: null, error: null });

export function useHrmCatalog() {
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { ...s, reload: () => loadHrmCatalog(true) };
}

export const moduleOf = (cat: HrmCatalog | null, key: string) => cat?.modules.find((m) => m.key === key) ?? null;
export const typeOf = (cat: HrmCatalog | null, domain: string, key: string) => moduleOf(cat, domain)?.types.find((t) => t.key === key) ?? null;
// Every status a record type can be in, in workflow order.
export function statusesOf(cat: HrmCatalog | null, type: HrmType | null): string[] {
  const w = type ? cat?.workflows[type.workflow] : null;
  if (!w) return [];
  const out: string[] = [w.initial];
  for (const [from, to] of Object.entries(w.transitions)) for (const s of [from, ...to]) if (!out.includes(s)) out.push(s);
  return out;
}

// ── Records ─────────────────────────────────────────────────────────────────

export type HrmRow = {
  id: string;
  code: string;
  domain: string;
  type: string;
  employeeId: string;
  unitId: string;
  parentId: string;
  title: string;
  status: string;
  from: string;
  to: string;
  payload: Dict;
  allowed: string[];
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  approvedAt: string;
  raw: Dict;
};

export function normRow(raw: unknown, domain = ""): HrmRow {
  const d = asDict(raw);
  return {
    id: str(d.id),
    code: str(d.record_code, d.code),
    domain: str(d.domain) || domain,
    type: str(d.record_type, d.type),
    employeeId: str(d.employee_id),
    unitId: str(d.org_unit_id),
    parentId: str(d.parent_id),
    title: str(d.title),
    status: str(d.status) || "draft",
    from: str(d.effective_from),
    to: str(d.effective_to),
    payload: asDict(d.payload),
    allowed: asArr(d.allowed_transitions).map((x) => str(x)).filter(Boolean),
    schemaVersion: asNum(d.schema_version, 1),
    createdAt: str(d.created_at),
    updatedAt: str(d.updated_at),
    createdBy: str(d.created_by_user_id),
    approvedAt: str(d.approved_at),
    raw: d,
  };
}

export type HrmFilter = {
  type?: string;
  employeeId?: string;
  unitId?: string;
  statuses?: string[];
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};
export type HrmPage = { items: HrmRow[]; total: number; limit: number; offset: number; hasMore: boolean };

export async function listHrm(domain: string, f: HrmFilter = {}, signal?: AbortSignal): Promise<HrmPage> {
  const limit = f.limit ?? 25;
  const offset = f.offset ?? 0;
  const raw = asDict(
    await http(
      `/internal/hrm/${enc(domain)}/records${qs({ record_type: f.type, employee_id: f.employeeId, org_unit_id: f.unitId, status: f.statuses?.length ? f.statuses.join(",") : undefined, q: f.q, date_from: f.dateFrom, date_to: f.dateTo, limit, offset })}`,
      { signal },
    ),
  );
  const items = asArr(raw.items ?? raw.data).map((x) => normRow(x, domain)).filter((r) => r.id);
  const total = asNum(raw.total, items.length);
  return { items, total, limit: asNum(raw.limit, limit), offset: asNum(raw.offset, offset), hasMore: raw.has_more === true || offset + items.length < total };
}

export async function getHrm(domain: string, id: string, signal?: AbortSignal): Promise<{ row: HrmRow; children: HrmRow[] }> {
  const d = asDict(await http(`/internal/hrm/${enc(domain)}/records/${enc(id)}`, { signal }));
  return { row: normRow(d.record ?? d, domain), children: asArr(d.children).map((x) => normRow(x, domain)).filter((r) => r.id) };
}

// What is sent: never a status (the record type's workflow sets it), never
// an empty optional value.
export type HrmInput = { record_type: string; employee_id: string | null; org_unit_id: string | null; parent_id: string | null; title: string; effective_from: string | null; effective_to: string | null; payload: Dict };
export const createHrm = async (domain: string, body: HrmInput) => normRow(await http(`/internal/hrm/${enc(domain)}/records`, { method: "POST", body: JSON.stringify(body) }), domain);
export const patchHrm = async (domain: string, id: string, body: Partial<HrmInput>) => normRow(await http(`/internal/hrm/${enc(domain)}/records/${enc(id)}`, { method: "PATCH", body: JSON.stringify(body) }), domain);
export const transitionHrm = async (domain: string, id: string, status: string, reason: string) =>
  normRow(await http(`/internal/hrm/${enc(domain)}/records/${enc(id)}/transition`, { method: "POST", body: JSON.stringify({ status, reason }) }), domain);

export type HrmCheck = { ok: boolean; errors: Record<string, string>; message: string };
export async function validateHrm(domain: string, body: HrmInput): Promise<HrmCheck> {
  const d = asDict(await http(`/internal/hrm/${enc(domain)}/validate`, { method: "POST", body: JSON.stringify(body) }));
  const errors = errorMap(d.errors ?? asDict(d.detail).errors);
  return { ok: d.ok === true || (d.ok === undefined && !Object.keys(errors).length), errors, message: str(d.message) };
}

function errorMap(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of asArr(list)) {
    const e = asDict(it);
    const loc = Array.isArray(e.loc) ? e.loc.map((x) => str(x)).filter((x) => x && x !== "body").join(".") : "";
    const key = str(e.field, e.path, loc).replace(/^payload\./, "") || "_";
    const msg = str(e.message, e.msg);
    if (msg) out[key] = out[key] ? `${out[key]}; ${msg}` : msg;
  }
  return out;
}

// A refused payload (spec §18): every error under its field; whatever has
// no field is the form's general error.
export function hrmErrorOf(e: unknown): { fields: Record<string, string>; message: string; code: string } {
  if (!(e instanceof ApiError)) return { fields: {}, message: "", code: "" };
  const detail = asDict(e.data.detail);
  const code = str(detail.code, e.code);
  let fields = errorMap(detail.errors);
  if (!Object.keys(fields).length && Array.isArray(e.data.detail)) fields = errorMap(e.data.detail);
  const general = fields._ ?? "";
  delete fields._;
  return { fields, message: general || str(detail.message, typeof e.data.detail === "string" ? e.data.detail : ""), code };
}

// ── Dashboards ──────────────────────────────────────────────────────────────

export type HrmSummary = { domain: string; title: string; total: number; byStatus: Record<string, number>; byType: Record<string, number> };
const counts = (v: unknown) => Object.fromEntries(Object.entries(asDict(v)).map(([k, n]) => [k, asNum(n)]));
const normSummary = (raw: unknown): HrmSummary => {
  const d = asDict(raw);
  return { domain: str(d.domain), title: str(d.title), total: asNum(d.total), byStatus: counts(d.by_status), byType: counts(d.by_record_type) };
};
type Range = { employeeId?: string; unitId?: string; dateFrom?: string; dateTo?: string };
const rangeQs = (r: Range) => qs({ employee_id: r.employeeId, org_unit_id: r.unitId, date_from: r.dateFrom, date_to: r.dateTo });

export async function getHrmOverview(r: Range = {}, signal?: AbortSignal): Promise<{ total: number; pending: number; domains: HrmSummary[] }> {
  const d = asDict(await http(`/internal/hrm/overview${rangeQs(r)}`, { signal }));
  return { total: asNum(d.total), pending: asNum(d.pending), domains: asArr(d.domains).map(normSummary) };
}
export async function getHrmSummary(domain: string, r: Range = {}, signal?: AbortSignal): Promise<HrmSummary> {
  return normSummary(await http(`/internal/hrm/${enc(domain)}/summary${rangeQs(r)}`, { signal }));
}
export async function getHrmMe(signal?: AbortSignal): Promise<{ employee: Dict; active: HrmRow[]; pending: HrmRow[]; recent: HrmRow[] }> {
  const d = asDict(await http("/internal/hrm/me/overview", { signal }));
  const rows = (v: unknown) => asArr(v).map((x) => normRow(x)).filter((r) => r.id);
  return { employee: asDict(d.employee), active: rows(d.active), pending: rows(d.pending), recent: rows(d.recent) };
}

// ── References (spec §17) ───────────────────────────────────────────────────

export type HrmOption = { value: string; label: string; sub?: string };

// The label of one row of any reference list: a person, a unit, a position,
// a user, or another HRM record.
function optionOf(raw: unknown): HrmOption | null {
  const d = asDict(raw);
  const value = str(d.id, d.value);
  if (!value) return null;
  const name = [d.last_name, d.first_name].filter((x) => typeof x === "string" && x).join(" ");
  const label = str(d.display_name, d.full_name, d.name, d.title, name, d.label, d.record_code, d.code, d.phone, value);
  const sub = str(d.record_code && d.title ? d.record_code : "", d.employee_code, d.code && d.name ? d.code : "", d.lexgo_id, d.phone && label !== d.phone ? d.phone : "");
  return { value, label, sub: sub || undefined };
}

export async function searchHrmReference(source: string, q: string, limit = 30, signal?: AbortSignal): Promise<HrmOption[]> {
  const sep = source.includes("?") ? "&" : "?";
  const raw = await http(`${source}${sep}${new URLSearchParams({ ...(q ? { q } : {}), limit: String(limit) })}`, { signal });
  const list = Array.isArray(raw) ? raw : asArr(asDict(raw).items ?? asDict(raw).data ?? asDict(raw).results);
  return list.map(optionOf).filter((x): x is HrmOption => x !== null);
}

// Labels of ids already chosen: looked up once per source and kept.
const labelCache = new Map<string, Map<string, HrmOption>>();
export function rememberHrmOptions(source: string, opts: HrmOption[]) {
  const m = labelCache.get(source) ?? new Map<string, HrmOption>();
  for (const o of opts) m.set(o.value, o);
  labelCache.set(source, m);
}
export const cachedHrmOption = (source: string, id: string) => labelCache.get(source)?.get(id) ?? null;
export const cachedHrmOptions = (source: string): HrmOption[] => [...(labelCache.get(source)?.values() ?? [])];
const listLoads = new Map<string, Promise<void>>();
export function preloadHrmReference(source: string): Promise<void> {
  let p = listLoads.get(source);
  if (!p) {
    p = searchHrmReference(source, "", 200)
      .then((opts) => rememberHrmOptions(source, opts))
      .catch(() => {
        listLoads.delete(source);
      });
    listLoads.set(source, p);
  }
  return p;
}
