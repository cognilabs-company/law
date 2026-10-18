import type { ApprNeed } from "./model";

export type ApprStatus = "" | "submitted" | "in_review" | "approved" | "changes_requested" | "published";
export type ApprQuery = { status: ApprStatus; ctor: string; group: string; need: ApprNeed; q: string; open: string };
export type ApprSearchParams = Record<string, string | string[] | undefined>;

export const APPR_STATUS_VALUES: readonly Exclude<ApprStatus, "">[] = ["submitted", "in_review", "approved", "changes_requested", "published"];
export const APPR_NEED_VALUES: readonly Exclude<ApprNeed, "">[] = ["review", "publish", "returned"];
export const APPR_Q_MAX = 200;

export const EMPTY_APPR_QUERY: ApprQuery = { status: "", ctor: "", group: "", need: "", q: "", open: "" };

const BASE = "/admin/studio/approvals";
const CTOR_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
const GROUP_RE = /^[a-z0-9_-]{1,64}$/i;
const OPEN_RE = /^[A-Za-z0-9-]{1,64}$/;

function first(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? v : "";
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function statusOf(v: unknown): ApprStatus {
  const s = clean(v);
  return (APPR_STATUS_VALUES as readonly string[]).includes(s) ? (s as ApprStatus) : "";
}

function needOf(v: unknown): ApprNeed {
  const s = clean(v);
  return (APPR_NEED_VALUES as readonly string[]).includes(s) ? (s as ApprNeed) : "";
}

const matchOr = (v: unknown, re: RegExp): string => {
  const s = clean(v);
  return re.test(s) ? s : "";
};

function normQuery(q: Partial<ApprQuery>): ApprQuery {
  return {
    status: statusOf(q.status),
    ctor: matchOr(q.ctor, CTOR_RE),
    group: matchOr(q.group, GROUP_RE),
    need: needOf(q.need),
    q: typeof q.q === "string" ? q.q.slice(0, APPR_Q_MAX) : "",
    open: matchOr(q.open, OPEN_RE),
  };
}

export function apprQueryOf(sp: ApprSearchParams): ApprQuery {
  return normQuery({
    status: first(sp.status) as ApprStatus,
    ctor: first(sp.ctor),
    group: first(sp.group),
    need: first(sp.need) as ApprNeed,
    q: first(sp.q),
    open: first(sp.open),
  });
}

export function apprQueryString(q: Partial<ApprQuery>): string {
  const n = normQuery(q);
  const p = new URLSearchParams();
  if (n.need) p.set("need", n.need);
  if (n.group) p.set("group", n.group);
  if (n.ctor) p.set("ctor", n.ctor);
  if (n.status) p.set("status", n.status);
  if (n.q.trim()) p.set("q", n.q);
  if (n.open) p.set("open", n.open);
  return p.toString();
}

export function approvalsHref(q?: Partial<ApprQuery>): string {
  const qs = q ? apprQueryString(q) : "";
  return qs ? `${BASE}?${qs}` : BASE;
}
