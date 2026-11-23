import { ApiError, asArr, asDict, asNum, asStr, http } from "@/lib/http";

// Refunds that wait for a call-center decision (TEZKOR_HIMOYA_FRONTEND_
// UPDATE_2026_11_21 §2). Click and ATMOS refund on their own; a request lands
// here only when the provider refund failed, or the payment is from before
// the provider era and cannot go back through one.
//   GET  /call-center/marketplace/refund-requests?status=…&limit=&offset=
//   POST /call-center/marketplace/refund-requests/{id}/decision
// Access: call-center operators and payments.manage; anyone else gets 403.

export const REFUND_OPEN_STATUSES = ["operator_required", "pending", "processing"] as const;
export const REFUND_ACTIONS = ["retry_provider", "confirm_manual_refund", "reject"] as const;
export type RefundAction = (typeof REFUND_ACTIONS)[number];
// confirm_manual_refund and reject need a note of at least 5 characters.
export const REFUND_NOTE_MIN = 5;
export const refundNeedsNote = (a: RefundAction) => a !== "retry_provider";

export type RefundRequest = {
  id: string;
  workId: string;
  status: string;
  amount: number;
  currency: string;
  orderId: string;
  orderWorkId: string;
  paymentId: string;
  refundType: string;
  provider: string;
  reason: string;
  providerError: string;
  clientName: string;
  clientUserId: string;
  serviceTitle: string;
  createdAt: string;
};

function providerErrorText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  const d = asDict(v);
  return asStr(d.message ?? d.detail ?? d.error_note ?? d.error ?? d.code).trim();
}

export function refundRequestOf(raw: unknown): RefundRequest {
  const d = asDict(raw);
  const p = asDict(d.payload);
  return {
    id: asStr(d.id),
    workId: asStr(d.work_id ?? p.work_id),
    status: asStr(d.status).toLowerCase(),
    amount: asNum(p.amount ?? d.price ?? d.amount),
    currency: asStr(d.currency ?? p.currency, "UZS") || "UZS",
    orderId: asStr(p.order_id ?? d.order_id),
    orderWorkId: asStr(p.order_work_id ?? d.order_work_id),
    paymentId: asStr(p.payment_id ?? d.payment_id),
    refundType: asStr(p.refund_type, "full").toLowerCase(),
    provider: asStr(p.provider ?? d.provider).toLowerCase(),
    reason: asStr(p.reason ?? d.reason).trim(),
    providerError: providerErrorText(p.provider_error ?? d.provider_error),
    clientName: asStr(p.client_name ?? d.client_name ?? asDict(d.client).name).trim(),
    clientUserId: asStr(p.client_user_id ?? d.client_user_id ?? asDict(d.client).id),
    serviceTitle: asStr(p.service_title ?? d.service_title ?? d.title).trim(),
    createdAt: asStr(d.created_at),
  };
}

export type RefundPage = { items: RefundRequest[]; total: number };

export async function listRefundRequests(opts: { statuses?: readonly string[]; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<RefundPage> {
  const q = new URLSearchParams({ status: (opts.statuses ?? REFUND_OPEN_STATUSES).join(","), limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) });
  const d = asDict(await http(`/call-center/marketplace/refund-requests?${q}`, { signal }));
  const items = asArr(d.items).map(refundRequestOf).filter((r) => r.id);
  return { items, total: asNum(d.total, items.length) };
}

export type RefundDecision = { message: string; refund: RefundRequest | null; orderStatus: string };

export async function decideRefund(id: string, action: RefundAction, note = ""): Promise<RefundDecision> {
  const body: Record<string, unknown> = { action };
  if (note.trim()) body.note = note.trim();
  const d = asDict(await http(`/call-center/marketplace/refund-requests/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify(body) }));
  return {
    message: asStr(d.message),
    refund: d.refund_request ? refundRequestOf(d.refund_request) : null,
    orderStatus: asStr(asDict(d.order).status).toLowerCase(),
  };
}

// §2.2 errors, by their code; anything else is a generic failure.
export type RefundErrorKey = "providerFailed" | "alreadyDecided" | "noteRequired" | "actionInvalid" | "generic";
export function refundErrorOf(e: unknown): { key: RefundErrorKey; refund: RefundRequest | null } {
  if (!(e instanceof ApiError)) return { key: "generic", refund: null };
  const detail = asDict(asDict(e.data).detail);
  const code = e.code || asStr(detail.code);
  const refund = detail.refund_request ? refundRequestOf(detail.refund_request) : asDict(e.data).refund_request ? refundRequestOf(asDict(e.data).refund_request) : null;
  if (code === "provider_refund_failed") return { key: "providerFailed", refund };
  if (code === "refund_already_decided") return { key: "alreadyDecided", refund };
  if (code === "refund_note_required") return { key: "noteRequired", refund };
  if (code === "refund_action_invalid") return { key: "actionInvalid", refund };
  return { key: "generic", refund };
}
