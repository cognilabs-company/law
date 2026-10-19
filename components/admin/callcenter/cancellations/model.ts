import { ApiError, asNum, asStr, errDetail } from "@/lib/http";
import { marketErrorInfo, type CancellationReview, type ChecklistItem, type ReviewAction, type ReviewList, type ReviewResolveInput } from "@/lib/services/marketRuntime";
import { marketSignalOf, type MarketSeller } from "@/lib/services/marketplace";
import type { MkmSeller } from "@/lib/services/adminMarketplace";

export const CCX_PAGE = 20;
export const CCX_AI = "call_center.cancellations";
export const NOTE_MAX = 1000;
export const STATUS_FALLBACK: readonly string[] = ["open", "resolved"];
export type CcxTone = "draft" | "submitted" | "review" | "approved" | "published" | "returned" | "archived";
export type OrderPhaseKey = "pending" | "paid" | "in_progress" | "review" | "completed" | "rated" | "cancelled";

const low = (v: unknown): string => asStr(v).trim().toLowerCase();
const OPEN_RE = /^(open|pending|new|requested)$/;

export function reviewTone(status: string): CcxTone {
  const s = low(status);
  if (OPEN_RE.test(s)) return "submitted";
  if (/^(in_review|reviewing)$/.test(s)) return "review";
  if (/^(resolved|closed|done)$/.test(s)) return "published";
  if (/^(cancelled|rejected|withdrawn)$/.test(s)) return "archived";
  return "draft";
}

export function orderPhaseKey(status: string): OrderPhaseKey | "" {
  const s = low(status);
  if (/^(pending_payment|pending|waiting_payment)$/.test(s)) return "pending";
  if (s === "paid") return "paid";
  if (s === "in_progress") return "in_progress";
  if (s === "cancellation_review") return "review";
  if (/^(completed|done)$/.test(s)) return "completed";
  if (s === "rated") return "rated";
  if (/^(cancelled|canceled|refunded|rejected)$/.test(s)) return "cancelled";
  return "";
}

const PHASE_TONE: Readonly<Record<OrderPhaseKey, CcxTone>> = {
  pending: "submitted",
  paid: "approved",
  in_progress: "review",
  review: "returned",
  completed: "published",
  rated: "published",
  cancelled: "archived",
};

export function orderPhaseTone(key: OrderPhaseKey | ""): CcxTone {
  return key ? PHASE_TONE[key] : "draft";
}

export function isOpenReview(r: Pick<CancellationReview, "status" | "action">): boolean {
  const s = low(r.status);
  return OPEN_RE.test(s) || (s === "" && !r.action);
}

function statusValue(v: unknown): string {
  if (typeof v === "string") return low(v);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const d = v as Record<string, unknown>;
    return low(d.value ?? d.status ?? d.key);
  }
  return "";
}

export function reviewStatusesOf(list: ReviewList | null): string[] {
  const raw = list?.raw ?? {};
  const extra = [raw.statuses, raw.allowed_statuses].flatMap((x) => (Array.isArray(x) ? x.map(statusValue) : []));
  const all = [...new Set([...STATUS_FALLBACK.map(low), ...extra].filter(Boolean))];
  return all.includes("open") ? ["open", ...all.filter((s) => s !== "open")] : all;
}

export type QueuePage = { total: number | null; hasMore: boolean; from: number; to: number };

export function reviewPageOf(list: ReviewList, limit: number, offset: number): QueuePage {
  const total = "total" in list.raw ? asNum(list.raw.total) : null;
  const n = list.items.length;
  return {
    total,
    hasMore: total !== null ? offset + n < total : n >= limit,
    from: n ? offset + 1 : 0,
    to: offset + n,
  };
}

export type ChecklistSummary = { done: number; total: number; requiredDone: number; requiredTotal: number };

export function checklistSummary(items: readonly ChecklistItem[]): ChecklistSummary {
  let done = 0;
  let requiredDone = 0;
  let requiredTotal = 0;
  for (const i of items) {
    const ok = i.status !== "pending";
    if (ok) done++;
    if (i.required) {
      requiredTotal++;
      if (ok) requiredDone++;
    }
  }
  return { done, total: items.length, requiredDone, requiredTotal };
}

export type ResolveDraft = { action: ReviewAction | ""; amount: number | undefined; lawyerUserId: string; note: string };
export const EMPTY_DRAFT: ResolveDraft = { action: "", amount: undefined, lawyerUserId: "", note: "" };
export type ResolveField = "action" | "amount" | "lawyer" | "note";
export type ResolveErrors = Partial<Record<ResolveField, string>>;

export function validateResolve(d: ResolveDraft, currentSellerId: string): ResolveErrors {
  const out: ResolveErrors = {};
  if (!d.action) out.action = "dialog.actionRequired";
  if (d.action === "new_price") {
    if (d.amount === undefined || !Number.isFinite(d.amount)) out.amount = "dialog.amountRequired";
    else if (d.amount <= 0) out.amount = "dialog.amountPositive";
  }
  if (d.action === "reassign") {
    const id = d.lawyerUserId.trim();
    if (!id) out.lawyer = "dialog.sellerRequired";
    else if (currentSellerId && id === currentSellerId) out.lawyer = "dialog.sellerSame";
  }
  if (d.note.length > NOTE_MAX) out.note = "dialog.noteLong";
  return out;
}

export function toResolveInput(d: ResolveDraft): ReviewResolveInput | null {
  if (Object.keys(validateResolve(d, "")).length || !d.action) return null;
  const note = d.note.trim() || undefined;
  if (d.action === "new_price") return { action: "new_price", amount: Math.round(d.amount ?? 0), note };
  if (d.action === "reassign") return { action: "reassign", lawyerUserId: d.lawyerUserId.trim(), note };
  return { action: d.action, note };
}

export type ResolveFailure =
  | { kind: "field"; field: "amount" | "lawyer"; key: string; server: string }
  | { kind: "forbidden" | "gone" | "resolved" | "generic"; key: string; server: string; refresh: boolean };

const AMOUNT_RE = /amount|price|narx|summa/i;
const LAWYER_RE = /lawyer|seller|assignee|ijrochi|yurist|advokat/i;
const RESOLVED_RE = /already|resolved|closed|not_open|status/i;

export function resolveFailureOf(e: unknown): ResolveFailure {
  const server = errDetail(e);
  if (!(e instanceof ApiError) || e.status === 0) return { kind: "generic", key: "dialog.errorText", server, refresh: false };
  const info = marketErrorInfo(e);
  const status = e.status;
  if (status === 401 || status === 403) return { kind: "forbidden", key: "dialog.errorForbidden", server, refresh: false };
  if (status === 404) return { kind: "gone", key: "dialog.errorGone", server, refresh: true };
  const fields = info?.fieldErrors ?? {};
  const text = `${info?.code ?? ""} ${info?.message ?? ""}`;
  if (status === 400 || status === 422) {
    if ("amount" in fields || "new_price" in fields || AMOUNT_RE.test(text)) return { kind: "field", field: "amount", key: "dialog.amountServer", server };
    if ("lawyer_user_id" in fields || "seller_user_id" in fields || LAWYER_RE.test(text)) return { kind: "field", field: "lawyer", key: "dialog.sellerServer", server };
  }
  if (status === 409 || RESOLVED_RE.test(text)) return { kind: "resolved", key: "dialog.errorResolved", server, refresh: true };
  return { kind: "generic", key: "dialog.errorText", server, refresh: false };
}

const hasValue = (v: unknown): boolean => {
  if (v === "" || v === null || v === undefined || v === 0) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
};

export function mergeReview(base: CancellationReview, full: CancellationReview | null): CancellationReview {
  if (!full || (full.id && full.id !== base.id)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(full)) if (k !== "raw" && hasValue(v)) out[k] = v;
  out.raw = { ...base.raw, ...full.raw };
  return out as CancellationReview;
}

export function staffChatHref(roomId: string, workId: string, serviceTitle: string): string {
  const room = roomId.trim();
  if (!room) return "";
  const qs = new URLSearchParams();
  if (workId.trim()) qs.set("wid", workId.trim());
  if (serviceTitle.trim()) qs.set("svc", serviceTitle.trim());
  const tail = qs.toString();
  return `/portal/chat/${encodeURIComponent(room)}${tail ? `?${tail}` : ""}`;
}

const REVIEW_INNER_RE = /^marketplace[._]cancellation_review/;

export function isReviewQueueEvent(ev: { event: string } & Record<string, unknown>): boolean {
  if (marketSignalOf(ev)?.kind === "review") return true;
  if (ev.event !== "notification.created") return false;
  const n = ev.notification;
  const data = n && typeof n === "object" ? (n as Record<string, unknown>).data : null;
  const inner = data && typeof data === "object" ? asStr((data as Record<string, unknown>).event) : "";
  return REVIEW_INNER_RE.test(inner);
}

export function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new ApiError(0, "aborted"));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new ApiError(0, "aborted"));
    signal.addEventListener("abort", stop, { once: true });
    p.then(
      (value) => {
        signal.removeEventListener("abort", stop);
        resolve(value);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", stop);
        reject(e);
      },
    );
  });
}

export type SellerCandidate = { userId: string; name: string; lexgoId: string; sellerType: string; region: string; rating: number; verified: boolean; offersService: boolean };

export function mergeSellerCandidates(admin: readonly MkmSeller[], pub: readonly MarketSeller[], serviceId: string): SellerCandidate[] {
  const map = new Map<string, SellerCandidate>();
  const sid = serviceId.trim();
  for (const a of admin) {
    const userId = a.userId.trim();
    if (!userId) continue;
    map.set(userId, { userId, name: a.name.trim(), lexgoId: a.lexgoId.trim(), sellerType: low(a.sellerType), region: a.region.trim(), rating: a.rating || 0, verified: a.isVerified, offersService: false });
  }
  for (const p of pub) {
    const userId = p.userId.trim();
    if (!userId) continue;
    const offers = !!sid && p.services.some((s) => s.id === sid);
    const prev = map.get(userId);
    if (!prev) {
      map.set(userId, { userId, name: p.name.trim(), lexgoId: p.publicId.trim(), sellerType: low(p.sellerType), region: p.region.trim(), rating: p.rating || 0, verified: p.verified, offersService: offers });
      continue;
    }
    map.set(userId, {
      ...prev,
      name: prev.name || p.name.trim(),
      lexgoId: prev.lexgoId || p.publicId.trim(),
      sellerType: prev.sellerType || low(p.sellerType),
      region: prev.region || p.region.trim(),
      rating: Math.max(prev.rating, p.rating || 0),
      verified: prev.verified || p.verified,
      offersService: prev.offersService || offers,
    });
  }
  return [...map.values()]
    .filter((c) => c.userId && c.name)
    .sort((a, b) => Number(b.offersService) - Number(a.offersService) || Number(b.verified) - Number(a.verified) || b.rating - a.rating || a.name.localeCompare(b.name));
}
