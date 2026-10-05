import { http, asDict, asStr, asNum, asArr, parseServerTime, type Dict } from "@/lib/http";

export const COMPLAINT_CATEGORIES = ["service", "lawyer", "payment", "quality", "sla", "other"] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 150;
export const DESC_MIN = 15;
export const DESC_MAX = 4000;

export type ComplaintKind = "manual" | "quality";
export type ComplaintSource = "" | "document" | "urgent";
export type ComplaintPhase = "open" | "rework" | "resolved" | "closed";

export type ComplaintItem = {
  key: string;
  id: string;
  workId: string;
  kind: ComplaintKind;
  category: string;
  subject: string;
  description: string;
  status: string;
  relatedRef: string;
  source: ComplaintSource;
  lawyerName: string;
  operatorName: string;
  operatorNote: string;
  resolvedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ComplaintDetail = {
  status: string;
  rating: number;
  comment: string;
  workTitle: string;
  lawyerName: string;
  operatorName: string;
  operatorNote: string;
  resolvedAt: string;
  updatedAt: string;
};

export type WorkRef = { id: string; workId: string; type: string; title: string };

export type ComplaintFeed = { items: ComplaintItem[]; manualFailed: boolean; qualityFailed: boolean };

export type NewComplaint = { category: string; subject: string; description: string; relatedRef: string };

const WORKS_LIMIT = 100;
const WORKS_MAX_PAGES = 10;
const COMPLAINT_TYPES = new Set(["complaint", "quality_complaint"]);
const STATUS_ORDER = ["new", "pending", "under_review", "rework_required", "rework_in_progress", "resolved", "rejected", "closed", "cancelled"];

function iso(v: unknown): string {
  const t = parseServerTime(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

function first(...vals: unknown[]): string {
  for (const v of vals) {
    const s = asStr(v).trim();
    if (s) return s;
  }
  return "";
}

function bareTitle(title: string): string {
  const s = title.trim();
  return s.replace(/^shikoyat\s*:\s*/i, "").trim() || s;
}

function rowsOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const d = asDict(raw);
  return asArr(d.items ?? d.data);
}

function normManual(v: unknown): ComplaintItem {
  const d = asDict(v);
  const p = asDict(d.payload);
  const id = asStr(d.id);
  return {
    key: `manual-${id}`,
    id,
    workId: first(d.work_id, p.work_id),
    kind: "manual",
    category: first(d.record_type, d.category),
    subject: first(d.title, d.subject),
    description: first(p.description, d.description),
    status: first(d.status) || "new",
    relatedRef: first(p.case_id, d.case_id),
    source: "",
    lawyerName: "",
    operatorName: first(p.operator_name),
    operatorNote: first(p.operator_note, p.resolution_note),
    resolvedAt: iso(p.resolved_at),
    createdAt: iso(d.created_at),
    updatedAt: iso(d.updated_at),
  };
}

function normQuality(v: unknown): ComplaintItem {
  const d = asDict(v);
  const id = asStr(d.id);
  const urgentId = first(d.urgent_advokat_request_id);
  const documentId = first(d.document_request_id);
  return {
    key: `quality-${id}`,
    id,
    workId: first(d.work_id),
    kind: "quality",
    category: "",
    subject: bareTitle(asStr(d.title)),
    description: "",
    status: first(d.status) || "new",
    relatedRef: "",
    source: urgentId ? "urgent" : documentId ? "document" : "",
    lawyerName: first(asDict(d.assigned_lawyer).name),
    operatorName: first(asDict(d.operator).name),
    operatorNote: "",
    resolvedAt: "",
    createdAt: iso(d.created_at),
    updatedAt: iso(d.updated_at),
  };
}

function normWorkRef(v: unknown): WorkRef {
  const d = asDict(v);
  return { id: asStr(d.id), workId: asStr(d.work_id), type: asStr(d.type), title: first(d.title, d.document_title) };
}

const stamp = (s: string) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

function newestFirst(a: ComplaintItem, b: ComplaintItem): number {
  return stamp(b.createdAt) - stamp(a.createdAt) || stamp(b.updatedAt) - stamp(a.updatedAt);
}

async function listMyComplaints(): Promise<ComplaintItem[]> {
  return rowsOf(await http("/complaints")).map(normManual).filter((x) => x.id);
}

async function listMyQualityComplaints(): Promise<ComplaintItem[]> {
  const out: ComplaintItem[] = [];
  let offset = 0;
  for (let page = 0; page < WORKS_MAX_PAGES; page++) {
    const d = asDict(await http(`/clients/me/works?type=quality_complaint&limit=${WORKS_LIMIT}&offset=${offset}`));
    const rows = asArr(d.items);
    for (const row of rows) {
      const r = asDict(row);
      if (r.type !== "quality_complaint" && r.source !== "quality_complaint") continue;
      const item = normQuality(r);
      if (item.id) out.push(item);
    }
    offset += rows.length;
    if (!rows.length || offset >= asNum(d.total, offset)) break;
  }
  return out;
}

export async function loadComplaintFeed(): Promise<ComplaintFeed> {
  const [manual, quality] = await Promise.allSettled([listMyComplaints(), listMyQualityComplaints()]);
  if (manual.status === "rejected" && quality.status === "rejected") throw manual.reason;
  const items = [
    ...(manual.status === "fulfilled" ? manual.value : []),
    ...(quality.status === "fulfilled" ? quality.value : []),
  ].sort(newestFirst);
  return { items, manualFailed: manual.status === "rejected", qualityFailed: quality.status === "rejected" };
}

export async function getQualityComplaintDetail(ref: string): Promise<ComplaintDetail> {
  const d = asDict(await http(`/clients/me/works/${encodeURIComponent(ref)}`));
  const summary = asDict(d.summary);
  const c = asDict(d.complaint);
  const p = asDict(c.payload);
  const review = asDict(d.review);
  const doc = asDict(d.document);
  return {
    status: first(summary.status, c.status),
    rating: asNum(p.rating) || asNum(review.rating),
    comment: first(p.comment, review.comment),
    workTitle: first(p.document_title, p.service_title, doc.title),
    lawyerName: first(review.lawyer_name, asDict(summary.assigned_lawyer).name),
    operatorName: first(p.operator_name, asDict(summary.operator).name),
    operatorNote: first(p.operator_note),
    resolvedAt: iso(p.resolved_at),
    updatedAt: iso(summary.updated_at ?? c.updated_at),
  };
}

export async function getWorkRef(ref: string): Promise<WorkRef> {
  const d = asDict(await http(`/clients/me/works/${encodeURIComponent(ref)}`));
  return normWorkRef(d.summary);
}

export async function listComplaintTargets(): Promise<WorkRef[]> {
  const out: WorkRef[] = [];
  let offset = 0;
  for (let page = 0; page < WORKS_MAX_PAGES; page++) {
    const d = asDict(await http(`/clients/me/works?limit=${WORKS_LIMIT}&offset=${offset}`));
    const rows = asArr(d.items);
    for (const row of rows) {
      const w = normWorkRef(row);
      if (w.id && !COMPLAINT_TYPES.has(w.type)) out.push(w);
    }
    offset += rows.length;
    if (!rows.length || offset >= asNum(d.total, offset)) break;
  }
  return out;
}

export async function fileComplaint(input: NewComplaint): Promise<ComplaintItem> {
  const body: Dict = { category: input.category, subject: input.subject, description: input.description };
  if (input.relatedRef) body.case_id = input.relatedRef;
  return normManual(await http("/complaints", { method: "POST", body: JSON.stringify(body) }));
}

export function complaintPhase(status: string): ComplaintPhase {
  if (status === "resolved") return "resolved";
  if (status === "rework_required" || status === "rework_in_progress") return "rework";
  if (status === "rejected" || status === "closed" || status === "cancelled") return "closed";
  return "open";
}

export function sortStatuses(list: string[]): string[] {
  const rank = (s: string) => {
    const i = STATUS_ORDER.indexOf(s);
    return i < 0 ? STATUS_ORDER.length : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function matchesRef(item: Pick<ComplaintItem, "id" | "workId">, ref: string): boolean {
  const r = ref.trim().toLowerCase();
  return !!r && (item.id.toLowerCase() === r || item.workId.toLowerCase() === r);
}

export function workRefValue(w: WorkRef): string {
  return w.type === "legal_case" ? w.id : w.workId || w.id;
}

export function findWorkRef(list: WorkRef[], ref: string): WorkRef | null {
  if (!ref) return null;
  return list.find((w) => workRefValue(w) === ref) ?? list.find((w) => matchesRef(w, ref)) ?? null;
}

export function workHref(type: string): string {
  if (type === "document_lawyer_work") return "/portal/client/documents";
  if (type === "urgent_advokat") return "/portal/client/urgent";
  if (type === "legal_case") return "/portal/client/cases";
  if (type === "service_order") return "/portal/client/payments";
  return "/portal/client/works";
}

export function sourceHref(source: ComplaintSource): string {
  if (source === "document") return "/portal/client/documents";
  if (source === "urgent") return "/portal/client/urgent";
  return "";
}

const isComplaintName = (name: string) => name.startsWith("quality_complaint.") || name.startsWith("complaint.");

export function isComplaintEvent(ev: Dict): boolean {
  const name = asStr(ev.event);
  if (isComplaintName(name)) return true;
  if (name !== "notification.created") return false;
  const n = asDict(ev.notification);
  return isComplaintName(first(asDict(n.data).event, asDict(n.meta).event));
}
