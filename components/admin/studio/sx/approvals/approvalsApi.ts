import { ApiError, asArr, asDict, http, isRouteMissing, parseServerTime, type Dict } from "@/lib/http";
import { normStudioDetail, type StudioDetail } from "@/lib/services/studio";

export const APPR_FETCH = 50;
export const APPR_FETCH_MAX = 200;
export const BULK_MAX = 100;
export const BULK_NOTE_MAX = 2000;

export type ApprCounts = Readonly<Record<string, number>>;
export type ApprQueueQuery = { constructorCode?: string; status?: string; q?: string; needsMe?: boolean; limit: number; offset: number };
export type ApprQueuePage = { items: StudioDetail[]; total: number; hasMore: boolean; counts: ApprCounts | null; offset: number };

export type ApprEventKind =
  | "comment"
  | "comment_updated"
  | "comment_deleted"
  | "reassign"
  | "rollback"
  | "restore"
  | "withdraw"
  | "archive"
  | "version"
  | "publish"
  | "overdue"
  | "auto"
  | "submit"
  | "returned"
  | "rejected"
  | "approved"
  | "created"
  | "save"
  | "other";

export type ApprEvent = {
  id: string;
  kind: ApprEventKind;
  type: string;
  at: string;
  ms: number;
  title: string;
  text: string;
  status: string;
  actor: string;
  actorCode: string;
  stage: string;
  stageRole: string;
  versionId: string;
  version: string;
  stepId: string;
  deleted: boolean;
  audit: boolean;
};

export type ApprSummaryItem = { key: string; n: number };
export type ApprHistory = { events: ApprEvent[]; summary: ApprSummaryItem[]; flags: Dict; raw: Dict };
export type BulkFailure = { id: string; code: string; message: string };
export type BulkOutcome = { published: string[]; failed: BulkFailure[] };

const enc = encodeURIComponent;

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

function personName(v: unknown): string {
  if (typeof v === "string") return v.trim();
  const d = asDict(v);
  return firstText(d.full_name, d.name, d.display_name, d.user_name, [text(d.first_name), text(d.last_name)].filter(Boolean).join(" "));
}

export function apprCountsOf(raw: unknown): ApprCounts | null {
  const out: Record<string, number> = {};
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const d = asDict(x);
      const k = text(d.status ?? d.key).toLowerCase();
      const n = count(d.count ?? d.total ?? d.n);
      if (k && n !== null) out[k] = n;
    }
  } else {
    for (const [k, v] of Object.entries(asDict(raw))) {
      const n = count(v);
      if (n !== null) out[k.toLowerCase()] = n;
    }
  }
  return Object.keys(out).length ? out : null;
}

export async function fetchApprovalQueue(q: ApprQueueQuery): Promise<ApprQueuePage> {
  const p = new URLSearchParams();
  if (q.constructorCode) p.set("constructor_code", q.constructorCode);
  if (q.status) p.set("status", q.status);
  const term = (q.q ?? "").trim();
  if (term) p.set("q", term);
  if (q.needsMe) p.set("needs_me", "true");
  p.set("limit", String(Math.min(APPR_FETCH_MAX, Math.max(1, Math.floor(q.limit)))));
  p.set("offset", String(Math.max(0, Math.floor(q.offset))));
  const res = asDict(await http(`/admin/studio/approvals?${p}`));
  const list = Array.isArray(res.items) ? res.items : asArr(res.approvals ?? res.objects ?? res.data ?? res.results);
  const items = list.map(normStudioDetail).filter((d) => d.id);
  const offset = count(res.offset) ?? q.offset;
  const total = count(res.total) ?? offset + items.length;
  const hasMore = typeof res.has_more === "boolean" ? res.has_more : offset + items.length < total;
  return { items, total, hasMore, counts: apprCountsOf(res.status_counts), offset };
}

export function safeStudioUrl(url: unknown, prefix = "/admin/studio/"): string {
  let u = text(url);
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      u = `${parsed.pathname}${parsed.search}`;
    } catch {
      return "";
    }
  }
  return u.startsWith(prefix) && !u.includes("..") && !u.startsWith("//") ? u : "";
}

export function publishUrlOf(d: StudioDetail | null, id: string): string {
  return safeStudioUrl(d?.raw.publish_url) || `/admin/studio/objects/${enc(id)}/publish`;
}

export async function publishApproval(id: string, url: string, note: string): Promise<StudioDetail> {
  const path = safeStudioUrl(url) || `/admin/studio/objects/${enc(id)}/publish`;
  return normStudioDetail(await http(path, { method: "POST", body: JSON.stringify({ note }) }));
}

function idOf(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return text(v);
  const d = asDict(v);
  return firstText(d.object_id, d.id, asDict(d.object).id);
}

export function bulkOutcomeOf(raw: unknown): BulkOutcome {
  const d = asDict(raw);
  const published = asArr(d.published ?? d.succeeded ?? d.ok).map(idOf).filter(Boolean);
  const failed = asArr(d.failed ?? d.errors).map((x) => {
    const f = asDict(x);
    const err = asDict(f.error ?? f.detail);
    return {
      id: idOf(x),
      code: firstText(f.code, err.code, f.error_code),
      message: firstText(f.message, err.message, typeof f.error === "string" ? f.error : "", typeof f.detail === "string" ? f.detail : ""),
    };
  }).filter((f) => f.id);
  return { published, failed };
}

export function isBulkMissing(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  if (isRouteMissing(e) || e.status === 405) return true;
  const code = firstText(e.code, asDict(e.data.detail).code);
  return e.status === 404 && code === "studio_object_not_found";
}

export async function bulkPublish(ids: readonly string[], note: string): Promise<BulkOutcome> {
  const res = await http("/admin/studio/approvals/bulk-publish", { method: "POST", body: JSON.stringify({ object_ids: ids, note }) });
  return bulkOutcomeOf(res);
}

const KIND_RULES: readonly [RegExp, ApprEventKind][] = [
  [/comment.*(delet|remov)|(delet|remov).*comment/, "comment_deleted"],
  [/comment.*(updat|edit)|(updat|edit).*comment/, "comment_updated"],
  [/comment/, "comment"],
  [/reassign/, "reassign"],
  [/rollback|roll_back|rolled back/, "rollback"],
  [/restor/, "restore"],
  [/withdr/, "withdraw"],
  [/archiv/, "archive"],
  [/version.*creat|creat.*version|version_created/, "version"],
  [/publish|publication/, "publish"],
  [/overdue|escalat/, "overdue"],
  [/auto.?approv|skipped|auto_publish/, "auto"],
  [/submit/, "submit"],
  [/changes.?requested|request.?changes|returned/, "returned"],
  [/reject/, "rejected"],
  [/approv/, "approved"],
  [/creat/, "created"],
  [/save|updat/, "save"],
];

export function eventKindOf(parts: readonly string[]): ApprEventKind {
  const hay = parts.map((p) => p.toLowerCase()).join(" | ");
  for (const [re, kind] of KIND_RULES) if (re.test(hay)) return kind;
  return "other";
}

function normEvent(raw: unknown, i: number): ApprEvent {
  const r = asDict(raw);
  const meta = asDict(r.metadata ?? r.meta ?? r.data);
  const type = text(r.type ?? r.kind).toLowerCase();
  const title = text(r.title);
  const status = text(r.status ?? meta.status ?? meta.decision).toLowerCase();
  const named = [text(r.event), text(r.event_type), text(r.action), text(meta.event), text(meta.action)];
  const kind = type === "comment" ? eventKindOf([...named, "comment"]) : eventKindOf([...named, type, status, title, text(meta.decision)]);
  const at = firstText(r.occurred_at, r.created_at, r.at, r.timestamp);
  const description = text(r.description);
  const note = firstText(meta.comment, meta.note, meta.message, meta.reason, r.comment);
  const deleted = r.is_deleted === true || meta.is_deleted === true || !!text(meta.deleted_at) || !!text(r.deleted_at) || status === "deleted" || kind === "comment_deleted";
  return {
    id: firstText(r.id, `${type}-${at}-${i}`),
    kind,
    type,
    at,
    ms: parseServerTime(at),
    title,
    text: description && description !== title ? description : note,
    status,
    actor: firstText(r.actor_name, personName(r.actor), personName(r.user), meta.actor_name, personName(meta.actor), r.user_name),
    actorCode: firstText(asDict(r.actor).lexgo_id, asDict(r.user).lexgo_id, asDict(meta.actor).lexgo_id),
    stage: firstText(meta.step_title, meta.step_name, meta.stage_title),
    stageRole: firstText(meta.step_role, meta.stage_role),
    versionId: firstText(r.version_id, meta.version_id),
    version: firstText(meta.version, meta.version_label, r.version_label, typeof r.version === "string" ? r.version : ""),
    stepId: firstText(r.step_id, meta.step_id),
    deleted,
    audit: type === "audit_activity" || type === "audit" || r.is_audit === true || text(r.source) === "audit",
  };
}

export function timelineOf(raw: unknown): ApprEvent[] {
  return asArr(raw)
    .map(normEvent)
    .filter((e) => e.at || e.title);
}

export function summaryOf(raw: unknown): ApprSummaryItem[] {
  const out: ApprSummaryItem[] = [];
  for (const [key, v] of Object.entries(asDict(raw))) {
    const n = count(v);
    if (n !== null && n > 0) out.push({ key: key.toLowerCase(), n });
  }
  return out;
}

const FLAG_KEYS = ["can_decide", "can_publish", "publish_url", "history_url", "current_step", "approval_steps", "approval_progress", "effective_route", "status"];

export async function fetchApprovalDetail(id: string): Promise<ApprHistory> {
  const res = asDict(await http(`/admin/studio/approvals/${enc(id)}`));
  const obj = asDict(res.object ?? res.item);
  const flags: Dict = {};
  for (const k of FLAG_KEYS) {
    const v = res[k] !== undefined ? res[k] : obj[k];
    if (v !== undefined && v !== null) flags[k] = v;
  }
  const tl = res.timeline;
  const events = timelineOf(Array.isArray(tl) ? tl : asArr(asDict(tl).items ?? asDict(tl).events));
  return { events, summary: summaryOf(res.history_summary), flags, raw: res };
}
