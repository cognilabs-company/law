// When the seller declines or lets the 30-minute acceptance pass, the call
// center resolves the order (TSK-131840; FRONTEND_MARKETPLACE_CONTRACT_GAPS
// _CLOSED §1): an operator offers the client a choice between another
// specialist and a full refund, reassigns, messages, cancels or refunds.
// Every mutation carries an Idempotency-Key; a repeated key answers
// `idempotent_replay: true`, which counts as success. Deadlines come from
// the backend; a local timer only redraws them.

import { ApiError, asArr, asDict, asStr, http, type Dict } from "@/lib/http";
import { normMarketOrder, type MarketOrder } from "./marketplace";

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export type ResolutionOffer = { id: string; status: string; options: string[]; deadlineAt: string; message: string; selectedChoice: string };
export type OrderRefund = { requestId: string; amount: number | null; currency: string; status: string; providerEnabled: boolean; createdAt: string; updatedAt: string };
export type OrderResolution = { offer: ResolutionOffer | null; refund: OrderRefund | null; canChoose: boolean };

function offerOf(v: unknown): ResolutionOffer | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id && !asStr(d.status)) return null;
  return { id, status: asStr(d.status), options: asArr(d.options).map((x) => asStr(x)).filter(Boolean), deadlineAt: asStr(d.deadline_at), message: asStr(d.message), selectedChoice: asStr(d.selected_choice) };
}

export function refundOf(v: unknown, providerEnabled?: unknown): OrderRefund | null {
  const d = asDict(v);
  const status = asStr(d.status ?? d.refund_status);
  if (!status && !asStr(d.request_id ?? d.id)) return null;
  return {
    requestId: asStr(d.request_id ?? d.id ?? d.refund_request_id),
    amount: num(d.amount),
    currency: asStr(d.currency) || "UZS",
    status,
    providerEnabled: (d.provider_enabled ?? providerEnabled) === true,
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
  };
}

export function resolutionOf(v: unknown): OrderResolution | null {
  const d = asDict(v);
  if (!Object.keys(d).length) return null;
  const offer = offerOf(d.offer);
  const refund = refundOf(d.refund);
  if (!offer && !refund && d.can_choose !== true) return null;
  return { offer, refund, canChoose: d.can_choose === true };
}

// One key per user action; the same key again only when retrying that
// exact request after its result was lost (a network failure). Any answer
// from the server settles it.
export type IdemSlot = { current: { sig: string; key: string } | null };
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
export function idemKeyFor(slot: IdemSlot, sig: string): string {
  if (slot.current?.sig !== sig) slot.current = { sig, key: uuid() };
  return slot.current.key;
}
export function idemSettle(slot: IdemSlot, e?: unknown): void {
  if (!idemLost(e)) slot.current = null;
}
// The request may have reached the server: its answer was lost. It is then
// sent again unchanged, with the same key, never edited into a new one.
export const idemLost = (e: unknown): boolean => (e instanceof ApiError ? e.status === 0 : e !== undefined);
// The escalation was resolved already (by this request's lost first try,
// or by another operator): refresh rather than report a failure.
export const escalationClosed = (e: unknown): boolean => e instanceof ApiError && (e.code === "assignment_escalation_closed" || e.code === "resolution_offer_closed" || e.code === "resolution_already_selected");

// ── Call center ────────────────────────────────────────────────────────

export const ESCALATION_ACTIONS = ["offer_resolution", "reassign", "message", "cancel", "full_refund"] as const;
export type EscalationAction = (typeof ESCALATION_ACTIONS)[number];
export type EscalationEvent = { id: string; type: string; status: string; message: string; actor: string; at: string };
export type EscalationAttempt = { sellerUserId: string; sellerName: string; status: string; reason: string; rank: number | null; at: string };
export type AssignmentEscalation = {
  id: string;
  status: string;
  orderId: string;
  order: MarketOrder;
  reason: string;
  previousSellerUserId: string;
  previousSellerName: string;
  history: EscalationEvent[];
  attempts: EscalationAttempt[];
  resolution: OrderResolution | null;
  actions: EscalationAction[];
  createdAt: string;
};

const eventOf = (v: unknown): EscalationEvent => {
  const d = asDict(v);
  const actor = asDict(d.actor);
  return {
    id: asStr(d.id),
    type: asStr(d.type ?? d.event ?? d.action),
    status: asStr(d.status ?? d.to_status),
    message: asStr(d.message ?? d.comment ?? d.note ?? d.reason),
    actor: asStr(actor.name ?? d.actor_name ?? d.operator_name),
    at: asStr(d.at ?? d.created_at),
  };
};
const attemptOf = (v: unknown): EscalationAttempt => {
  const d = asDict(v);
  const seller = asDict(d.seller);
  return {
    sellerUserId: asStr(d.seller_user_id ?? seller.id),
    sellerName: asStr(d.seller_name ?? seller.name ?? seller.full_name),
    status: asStr(d.status ?? d.outcome),
    reason: asStr(d.reason ?? d.decline_reason ?? d.rejection_reason),
    rank: num(d.rank ?? d.ranking ?? d.score),
    at: asStr(d.at ?? d.created_at ?? d.assigned_at),
  };
};

export function escalationOf(v: unknown): AssignmentEscalation | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id) return null;
  const order = asDict(d.order);
  const prev = asDict(d.previous_seller);
  return {
    id,
    status: asStr(d.status),
    orderId: asStr(d.order_id ?? order.id),
    order: normMarketOrder({ id: d.order_id, ...order }),
    reason: asStr(d.reason),
    previousSellerUserId: asStr(d.previous_seller_user_id ?? prev.id),
    previousSellerName: asStr(d.previous_seller_name ?? prev.name ?? prev.full_name),
    history: asArr(d.history).map(eventOf),
    attempts: asArr(d.assignment_history).map(attemptOf),
    resolution: resolutionOf(d.resolution),
    actions: asArr(d.actions)
      .map((x) => asStr(x))
      .filter((a): a is EscalationAction => (ESCALATION_ACTIONS as readonly string[]).includes(a)),
    createdAt: asStr(d.created_at),
  };
}

export async function listAssignmentEscalations(opts: { status?: string; offset?: number } = {}, signal?: AbortSignal): Promise<{ items: AssignmentEscalation[]; total: number; hasMore: boolean }> {
  const qs = new URLSearchParams({ status: opts.status ?? "open", limit: "50", offset: String(opts.offset ?? 0) });
  const d = asDict(await http(`/call-center/marketplace/assignment-escalations?${qs}`, { signal }));
  const items = asArr(d.items).map(escalationOf).filter((x): x is AssignmentEscalation => !!x);
  return { items, total: num(d.total) ?? items.length, hasMore: d.has_more === true };
}

export type EscalationInput = { action: EscalationAction; message?: string; reason?: string; target?: "client" | "seller"; deadlineMinutes?: number };

export async function resolveAssignmentEscalation(id: string, input: EscalationInput, idemKey: string): Promise<{ replay: boolean; raw: Dict }> {
  // The operator's text travels as `message` for every action (for cancel
  // and refund it is the reason); `reason` repeats it for the audit.
  const text = (input.message || input.reason || "").trim();
  const body: Dict = { action: input.action, message: text, reason: (input.reason ?? "").trim() || text };
  if (input.target) body.target = input.target;
  if (input.action === "offer_resolution") body.deadline_minutes = input.deadlineMinutes ?? 30;
  const raw = asDict(await http(`/call-center/marketplace/assignment-escalations/${encodeURIComponent(id)}/resolve`, { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": idemKey } }));
  return { replay: raw.idempotent_replay === true, raw };
}

// ── Client ─────────────────────────────────────────────────────────────

export type ResolutionChoice = "reassign" | "refund";

export async function chooseOrderResolution(orderId: string, choice: ResolutionChoice, reason: string, idemKey: string): Promise<Dict> {
  return asDict(
    await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}/resolution`, {
      method: "POST",
      body: JSON.stringify({ choice, reason: reason.trim() }),
      headers: { "Idempotency-Key": idemKey },
    }),
  );
}

export async function getOrderRefund(orderId: string, signal?: AbortSignal): Promise<OrderRefund | null> {
  const d = asDict(await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}/refund`, { signal }));
  return refundOf(d.refund, d.provider_enabled);
}

export type TimelineItem = { id: string; type: string; status: string; at: string };

export async function getOrderTimeline(orderId: string, signal?: AbortSignal): Promise<TimelineItem[]> {
  const d = asDict(await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}/timeline`, { signal }));
  return asArr(d.items).map((x) => {
    const i = asDict(x);
    return { id: asStr(i.id), type: asStr(i.type), status: asStr(i.status), at: asStr(i.at) };
  });
}

export const RESOLUTION_EVENTS = [
  "marketplace.resolution_offered",
  "marketplace.resolution_selected",
  "marketplace.resolution_expired",
  "marketplace.assignment_received",
  "marketplace.assignment_escalation_resolved",
  "marketplace.refund_processing",
  "marketplace.refund_approved",
  "marketplace.refund_rejected",
] as const;
export const isResolutionEvent = (name: unknown) => (RESOLUTION_EVENTS as readonly string[]).includes(String(name ?? "")) || /assignment_escalat/.test(String(name ?? ""));
