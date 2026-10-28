// TSK-906326 — marketplace 30-30-40 payouts (enterprise contract 2026-10-27
// §9, §13). The backend owns the arithmetic: seller acceptance 30% of the
// gross, the first required checklist stage 30%, completion after the
// 15-minute rating/complaint window 40% less LexGo's 18% (22% to the seller).
// Nothing here works an amount out — every number is the backend's.
// No typed schema exists yet, so the readers accept the field names the
// contract uses and the usual variants; an unknown stage is "other".
import { http, asArr, asDict, asNum, asStr, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";

export type PayoutStage = "accept" | "checklist" | "completion" | "other";
export const PAYOUT_STAGES: readonly PayoutStage[] = ["accept", "checklist", "completion"];

// "seller_accept_30", "first_checklist_complete", "completion_40", …
export function payoutStageOf(raw: string): PayoutStage {
  const s = raw.toLowerCase();
  if (/accept/.test(s)) return "accept";
  if (/checklist|first_stage|stage_1|milestone/.test(s)) return "checklist";
  if (/complet|final|settle/.test(s)) return "completion";
  return "other";
}

export type PayoutStatus = "waiting" | "due" | "held" | "paid" | "cancelled";
export function payoutStatusOf(raw: string): PayoutStatus {
  const s = raw.toLowerCase();
  if (s === "paid" || s === "completed" || s === "settled" || s === "transferred") return "paid";
  if (s === "held" || s === "on_hold" || s === "hold" || s === "blocked") return "held";
  if (s === "cancelled" || s === "canceled" || s === "voided" || s === "reversed" || s === "recovered") return "cancelled";
  if (s === "required" || s === "due" || s === "queued" || s === "pending" || s === "ready" || s === "operator_required" || s === "created") return "due";
  return "waiting";
}

export type Person = { id: string; name: string };
const personOf = (v: unknown, id: unknown, name: unknown): Person | null => {
  const d = asDict(v);
  const pid = asStr(d.id ?? d.user_id ?? id);
  const pname = asStr(d.name ?? d.full_name ?? name);
  return pid || pname ? { id: pid, name: pname } : null;
};

export type Payout = {
  id: string;
  orderId: string;
  workId: string;
  serviceTitle: string;
  stage: PayoutStage;
  percent: number | null;
  amount: number;
  commission: number;
  status: PayoutStatus;
  seller: Person | null;
  reference: string;
  paidAt: string;
  createdAt: string;
};

export function payoutOf(v: unknown): Payout {
  const d = asDict(v);
  const order = asDict(d.order);
  const pct = d.stage_percent ?? d.percent ?? d.gross_percent;
  return {
    id: asStr(d.id),
    orderId: asStr(d.order_id ?? order.id),
    workId: asStr(d.work_id ?? d.order_work_id ?? order.work_id),
    serviceTitle: asStr(d.service_title ?? order.service_title ?? d.title),
    stage: payoutStageOf(asStr(d.stage ?? d.stage_key ?? d.payout_stage ?? d.kind)),
    percent: pct === undefined || pct === null || pct === "" ? null : asNum(pct),
    amount: uzs(d, "amount", "net_amount", "seller_amount", "payout_amount"),
    commission: uzs(d, "commission_amount", "platform_fee"),
    status: payoutStatusOf(asStr(d.status)),
    seller: personOf(d.seller, d.seller_user_id, d.seller_name),
    reference: asStr(d.transaction_reference),
    paidAt: asStr(d.paid_at),
    createdAt: asStr(d.created_at ?? d.due_at),
  };
}

export type Page<T> = { items: T[]; total: number; hasMore: boolean };
function pageOf<T>(raw: unknown, map: (v: unknown) => T, limit: number, offset: number): Page<T> {
  const d = asDict(raw);
  const items = asArr(d.items).map(map);
  const total = asNum(d.total) || items.length;
  return { items, total, hasMore: typeof d.has_more === "boolean" ? d.has_more : offset + items.length < total };
}
const qs = (p: Record<string, string | number | undefined>) =>
  Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export async function listCcPayouts(p: { status?: string; limit?: number; offset?: number }, signal?: AbortSignal): Promise<Page<Payout>> {
  const limit = p.limit ?? 20;
  const offset = p.offset ?? 0;
  return pageOf(await http(`/call-center/marketplace/payouts?${qs({ status: p.status, limit, offset })}`, { signal }), payoutOf, limit, offset);
}

// The transfer reference is required (§9); evidence and a note are optional.
export type PaidInput = { reference: string; note?: string; evidenceIds?: string[] };
export function paidBody(input: PaidInput): Dict {
  return { transaction_reference: input.reference.trim(), evidence_ids: input.evidenceIds ?? [], note: (input.note ?? "").trim() };
}
export async function markPayoutPaid(id: string, input: PaidInput): Promise<Payout> {
  return payoutOf(await http(`/call-center/marketplace/payouts/${encodeURIComponent(id)}/mark-paid`, { method: "POST", body: JSON.stringify(paidBody(input)) }));
}

// A refund after the seller was already paid (§13): the seller, a legal
// entity, returns the money; the operator records that it came back.
export type Recovery = {
  id: string;
  orderId: string;
  workId: string;
  serviceTitle: string;
  amount: number;
  status: PayoutStatus;
  seller: Person | null;
  reason: string;
  reference: string;
  createdAt: string;
};
export function recoveryOf(v: unknown): Recovery {
  const d = asDict(v);
  const order = asDict(d.order);
  return {
    id: asStr(d.id),
    orderId: asStr(d.order_id ?? order.id),
    workId: asStr(d.work_id ?? order.work_id),
    serviceTitle: asStr(d.service_title ?? order.service_title),
    amount: uzs(d, "amount", "recovery_amount", "paid_amount"),
    status: payoutStatusOf(asStr(d.status)),
    seller: personOf(d.seller, d.seller_user_id, d.seller_name),
    reason: asStr(d.client_visible_reason ?? d.reason_text ?? d.reason),
    reference: asStr(d.transaction_reference),
    createdAt: asStr(d.created_at),
  };
}
export async function listPayoutRecoveries(p: { status?: string; limit?: number; offset?: number }, signal?: AbortSignal): Promise<Page<Recovery>> {
  const limit = p.limit ?? 20;
  const offset = p.offset ?? 0;
  return pageOf(await http(`/call-center/marketplace/payout-recoveries?${qs({ status: p.status, limit, offset })}`, { signal }), recoveryOf, limit, offset);
}
// Idempotent on the backend: a second resolve returns the finished result.
export async function resolvePayoutRecovery(id: string, input: PaidInput): Promise<Recovery> {
  return recoveryOf(await http(`/call-center/marketplace/payout-recoveries/${encodeURIComponent(id)}/resolve`, { method: "POST", body: JSON.stringify(paidBody(input)) }));
}

// The seller's own view of an order's payouts, from …/financials. Only the
// seller and staff get these rows; the client's response leaves them out.
export function orderPayoutsOf(raw: unknown): Payout[] {
  const d = asDict(raw);
  const settlement = asDict(d.settlement);
  const list = asArr(d.payouts ?? d.payout_stages ?? settlement.stages ?? settlement.payouts);
  const out = list.map(payoutOf).filter((p) => p.stage !== "other" || p.amount > 0);
  const order = (s: PayoutStage) => (s === "other" ? 9 : PAYOUT_STAGES.indexOf(s));
  return out.sort((a, b) => order(a.stage) - order(b.stage));
}
export async function getOrderPayouts(orderId: string, signal?: AbortSignal): Promise<Payout[]> {
  return orderPayoutsOf(await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}/financials`, { signal }));
}
// The settlement is held while the 15-minute window or a complaint is open.
export function settlementHeld(raw: unknown): boolean {
  const s = asDict(raw).settlement;
  const st = typeof s === "string" ? s : asStr(asDict(s).status);
  return /hold|held/.test(st.toLowerCase());
}
