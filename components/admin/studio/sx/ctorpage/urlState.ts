import type { CtorQuery } from "./CtorPage";

export type CtorSearchParams = Record<string, string | string[] | undefined>;

export const RUNTIME_STATUS_VALUES: readonly string[] = ["active", "inactive"];
export const STUDIO_STATUS_VALUES: readonly string[] = ["draft", "submitted", "in_review", "changes_requested", "approved", "published", "archived"];
export const STATUS_VALUES: readonly string[] = [...RUNTIME_STATUS_VALUES, ...STUDIO_STATUS_VALUES];
export const SOURCE_VALUES: readonly ("runtime" | "studio")[] = ["runtime", "studio"];
export const PLACEMENT_VALUES: readonly string[] = ["banner", "profile_boost", "service_boost"];
export const Q_MAX = 200;
const PAGE_MAX = 100000;

export const EMPTY_CTOR_QUERY: CtorQuery = { q: "", status: "", source: "", placement: "", page: 0 };

function first(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? v : "";
}

function pageOf(raw: string): number {
  if (!/^\d{1,6}$/.test(raw.trim())) return 0;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 && n <= PAGE_MAX ? n - 1 : 0;
}

export function ctorQueryOf(sp: CtorSearchParams): CtorQuery {
  const status = first(sp.status).trim();
  const source = first(sp.source).trim();
  const placement = first(sp.placement).trim();
  return {
    q: first(sp.q).slice(0, Q_MAX),
    status: STATUS_VALUES.includes(status) ? status : "",
    source: source === "runtime" || source === "studio" ? source : "",
    placement: PLACEMENT_VALUES.includes(placement) ? placement : "",
    page: pageOf(first(sp.page)),
  };
}

export function ctorQueryString(q: CtorQuery): string {
  const p = new URLSearchParams();
  const term = q.q.trim() ? q.q.slice(0, Q_MAX) : "";
  if (term) p.set("q", term);
  if (q.status && STATUS_VALUES.includes(q.status)) p.set("status", q.status);
  if (q.source === "runtime" || q.source === "studio") p.set("source", q.source);
  if (q.placement && PLACEMENT_VALUES.includes(q.placement)) p.set("placement", q.placement);
  if (Number.isInteger(q.page) && q.page > 0) p.set("page", String(q.page + 1));
  return p.toString();
}
