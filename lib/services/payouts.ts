// TSK-906326 — marketplace 30-30-22 payouts (enterprise contract 2026-10-27
// §9, §13; backend answers 2026-10-28 §3). The backend owns the arithmetic:
// seller acceptance 30% of the gross, the first required checklist stage
// 30%, completion after the 15-minute rating/complaint window 40% less
// LexGo's 18% (22% to the seller). Nothing here works an amount out.
import { http, asArr, asDict, asNum, asStr, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";

// The backend's stage values: acceptance | first_checklist | completion.
export type PayoutStage = "accept" | "checklist" | "completion" | "other";
export const PAYOUT_STAGES: readonly PayoutStage[] = ["accept", "checklist", "completion"];
const STAGE: Record<string, PayoutStage> = { acceptance: "accept", first_checklist: "checklist", completion: "completion" };
export const payoutStageOf = (raw: string): PayoutStage => STAGE[raw.toLowerCase()] ?? "other";

// Payout: operator_required | provider_pending | provider_failed |
// recovery_required | paid. Recovery: operator_required | under_review |
// recovered. "held" is the seller view's completion stage while the
// settlement is on hold (settlement.status, never derived).
export type PayoutStatus = "due" | "processing" | "failed" | "recovery" | "review" | "held" | "paid" | "other";
const STATUS: Record<string, PayoutStatus> = {
  operator_required: "due",
  provider_pending: "processing",
  provider_failed: "failed",
  recovery_required: "recovery",
  under_review: "review",
  paid: "paid",
  recovered: "paid",
};
export const payoutStatusOf = (raw: string): PayoutStatus => STATUS[raw.toLowerCase()] ?? "other";
// What the operator can act on: pay by hand, or record a recovery.
export const payoutActionable = (s: PayoutStatus) => s === "due" || s === "failed" || s === "review";

export type Person = { id: string; name: string };
const personOf = (v: unknown, id: unknown): Person | null => {
  const d = asDict(v);
  const pid = asStr(d.id ?? id);
  const pname = asStr(d.name);
  return pid || pname ? { id: pid, name: pname } : null;
};

export type Payout = {
  id: string;
  orderId: string;
  // Backend gap (answers §3.1): no work_id, service_title or nested seller
  // yet — read when they arrive, the seller's name is looked up by id.
  workId: string;
  serviceTitle: string;
  stage: PayoutStage;
  percent: number | null;
  gross: number;
  amount: number;
  commission: number;
  status: PayoutStatus;
  automatic: boolean;
  seller: Person | null;
  reason: string;
  reference: string;
  paidAt: string;
  createdAt: string;
};

export function payoutOf(v: unknown): Payout {
  const d = asDict(v);
  const pct = d.gross_percent;
  return {
    id: asStr(d.id),
    orderId: asStr(d.order_id),
    workId: asStr(d.work_id),
    serviceTitle: asStr(d.service_title),
    stage: payoutStageOf(asStr(d.stage)),
    percent: pct === undefined || pct === null || pct === "" ? null : asNum(pct),
    gross: uzs(d, "gross_amount"),
    amount: uzs(d, "payable_amount"),
    commission: uzs(d, "commission_amount"),
    status: payoutStatusOf(asStr(d.status)),
    automatic: asStr(d.mode) === "automatic_provider_payout",
    seller: personOf(d.seller, d.seller_user_id),
    reason: asStr(d.reason),
    reference: asStr(d.transaction_reference),
    paidAt: asStr(d.paid_at),
    createdAt: asStr(d.created_at),
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
  return {
    id: asStr(d.id),
    orderId: asStr(d.order_id),
    workId: asStr(d.work_id),
    serviceTitle: asStr(d.service_title),
    amount: uzs(d, "amount"),
    status: payoutStatusOf(asStr(d.status)),
    seller: personOf(d.seller, d.seller_user_id),
    // Answers §3.1: the reason sits in payload.reason.
    reason: asStr(asDict(d.payload).reason),
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

// The seller's own view (answers §3.2): the payout rows come with the
// order checklist ({ items, payouts }); the hold is the settlement's own
// status from …/financials, never worked out here.
export type Settlement = { status: string; held: boolean; heldAmount: number; holdReason: string; releaseAfter: string };
export function settlementOf(raw: unknown): Settlement {
  const s = asDict(asDict(raw).settlement);
  const status = asStr(s.status).toLowerCase();
  return { status, held: status === "held" || status === "complaint_hold", heldAmount: uzs(s, "held_amount"), holdReason: asStr(s.hold_reason), releaseAfter: asStr(s.release_after) };
}
export function orderPayoutsOf(checklist: unknown, settlement?: Settlement): Payout[] {
  const out = asArr(asDict(checklist).payouts)
    .map(payoutOf)
    .filter((p) => p.stage !== "other" || p.amount > 0)
    .map((p) => (settlement?.held && p.stage === "completion" && p.status !== "paid" ? { ...p, status: "held" as const } : p));
  const order = (s: PayoutStage) => (s === "other" ? 9 : PAYOUT_STAGES.indexOf(s));
  return out.sort((a, b) => order(a.stage) - order(b.stage));
}
export async function getOrderPayouts(orderId: string, signal?: AbortSignal): Promise<{ rows: Payout[]; settlement: Settlement }> {
  const id = encodeURIComponent(orderId);
  const [checklist, financials] = await Promise.all([http(`/marketplace/me/orders/${id}/checklist`, { signal }), http(`/marketplace/me/orders/${id}/financials`, { signal }).catch(() => ({}))]);
  const settlement = settlementOf(financials);
  return { rows: orderPayoutsOf(checklist, settlement), settlement };
}
