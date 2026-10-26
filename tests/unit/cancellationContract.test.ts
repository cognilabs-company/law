import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { normCancellationChat, normCancellationReview, resolveBody } from "@/lib/services/marketRuntime";
import { marketSignalOf, normMarketOrder, reassignmentOf } from "@/lib/services/marketplace";
import { timelineItemOf } from "@/lib/services/resolution";
import { resolveFailureOf, resolveSig, EMPTY_DRAFT } from "@/components/admin/callcenter/cancellations/model";

// Contract 2026-10-26 (marketplace cancellation, reassignment, refund), read
// from the shapes production returned on 26 Oct 2026.

describe("cancellation review", () => {
  const live = {
    id: "rev-1",
    status: "open",
    reason: "qlomadim",
    requester: null,
    requester_role: null,
    parties: { client_user_id: "cl-1", lawyer_user_id: "sel-1" },
    chat: { room_id: null, status: null, read_only: false, participant_user_ids: [], messages_url: null, create_url: null, close_url: null },
    resolution_options: ["continue", "new_price", "cancel", "reassign", "refund"],
    history: [],
    context: { order: { id: "o1", status: "cancellation_review", payment_status: "paid", client_user_id: "cl-1", lawyer_user_id: "sel-1" } },
  };
  it("reads the parties as ids and no discussion when the room is null", () => {
    const r = normCancellationReview(live);
    expect(r.parties.client?.id).toBe("cl-1");
    expect(r.parties.seller?.id).toBe("sel-1");
    expect(r.discussion).toBeNull();
    expect(r.resolutionOptions).toEqual(["continue", "new_price", "cancel", "reassign", "refund"]);
  });
  it("takes the list's cancellation_chat_room_id as the discussion", () => {
    const r = normCancellationReview({ ...live, chat: null, cancellation_chat_room_id: "room-d" });
    expect(r.discussion?.roomId).toBe("room-d");
  });
  it("never takes the service room for the discussion", () => {
    const r = normCancellationReview({ ...live, context: { order: { ...live.context.order, secure_chat_room_id: "room-service" } } });
    expect(r.discussion).toBeNull();
    expect(r.serviceChatRoomId).toBe("room-service");
  });
  it("reads a created and a closed discussion", () => {
    const open = normCancellationChat({ room_id: "r", status: "active", read_only: false, participant_user_ids: ["op", "cl-1"], close_url: "/x/close" });
    expect(open).toMatchObject({ roomId: "r", readOnly: false, participantIds: ["op", "cl-1"] });
    expect(normCancellationChat({ room_id: "r", status: "closed" })?.readOnly).toBe(true);
  });
  it("sends the client-visible reason apart from the internal note", () => {
    expect(resolveBody({ action: "reassign", lawyerUserId: "u-new", note: "ichki", clientReason: "Boshqa mutaxassis davom ettiradi" })).toEqual({ action: "reassign", lawyer_user_id: "u-new", note: "ichki", client_visible_reason: "Boshqa mutaxassis davom ettiradi" });
  });
  it("keys a decision by what it is: the same decision, the same key", () => {
    const d = { ...EMPTY_DRAFT, action: "refund" as const, clientReason: "x" };
    expect(resolveSig("rev-1", d)).toBe(resolveSig("rev-1", { ...d }));
    expect(resolveSig("rev-1", d)).not.toBe(resolveSig("rev-1", { ...d, clientReason: "y" }));
  });
  it("maps the §7 error codes", () => {
    const err = (code: string, status = 409) => new ApiError(status, code, undefined, { code, data: { detail: { code } } });
    expect(resolveFailureOf(err("paid_order_requires_refund_action"))).toMatchObject({ kind: "field", field: "action" });
    expect(resolveFailureOf(err("cancellation_review_already_resolved"))).toMatchObject({ kind: "resolved", refresh: true });
    expect(resolveFailureOf(err("replacement_seller_must_differ"))).toMatchObject({ kind: "field", field: "lawyer" });
    expect(resolveFailureOf(err("lawyer_invalid", 422))).toMatchObject({ kind: "field", field: "lawyer" });
    expect(resolveFailureOf(err("callcenter_role_required", 403))).toMatchObject({ kind: "forbidden" });
    expect(resolveFailureOf(err("cancellation_review_not_found", 404))).toMatchObject({ kind: "gone" });
  });
});

describe("the client's order while a replacement decides", () => {
  it("shows no seller at all, even from flat fields", () => {
    const o = normMarketOrder({ id: "o1", status: "sent_to_seller", payment_status: "paid", waiting_replacement_acceptance: true, lawyer: null, lawyer_user_id: "u-new", lawyer_name: "Nomzod", client_status_message: "Call-markaz ko'rib chiqmoqda.", can_start_chat: false, calls_enabled: false, chat_read_only: true });
    expect(o.waitingReplacement).toBe(true);
    expect(o.lawyerName).toBe("");
    expect(o.lawyerUserId).toBe("");
    expect(o.clientMessage).toBe("Call-markaz ko'rib chiqmoqda.");
    expect(o.canStartChat).toBe(false);
  });
  it("shows the new seller once accepted", () => {
    const o = normMarketOrder({ id: "o1", status: "accepted", payment_status: "paid", waiting_replacement_acceptance: false, lawyer: { id: "u-new", name: "Yangi Advokat" } });
    expect(o.lawyerName).toBe("Yangi Advokat");
  });
  it("reads a reassignment history row", () => {
    const r = reassignmentOf({ id: "ra", status: "accepted", previous_seller: { id: "s1", name: "Eski" }, new_seller: { id: "s2", name: "Yangi" }, operator: { name: "Op" }, client_visible_reason: "Sabab", reassigned_at: "2026-10-26T18:30:00Z", accepted_at: "2026-10-26T18:40:00Z" });
    expect(r).toMatchObject({ previousSeller: { name: "Eski" }, newSeller: { name: "Yangi" }, operator: { name: "Op" }, reason: "Sabab", acceptedAt: "2026-10-26T18:40:00Z" });
  });
  it("tells reassignment events apart", () => {
    expect(marketSignalOf({ event: "marketplace.reassignment_started", order_id: "o1" })?.kind).toBe("reassigned");
    expect(marketSignalOf({ event: "marketplace.reassignment_accepted", order_id: "o1" })?.sub).toBe("accepted");
  });
});

describe("timeline privacy", () => {
  it("never shows a refund's internal reason or key, keeps the amount", () => {
    const it = timelineItemOf({ id: "t", type: "refund", status: "pending", at: "2026-10-26T15:59:57Z", data: { amount: 8000, reason: "internal operator text", idempotency_key: "k", lawyer_user_id: "s1" } });
    expect(it.message).toBe("");
    expect(it.amount).toBe(8000);
    expect(JSON.stringify(it)).not.toContain("internal operator text");
    expect(JSON.stringify(it)).not.toContain('"k"');
  });
  it("names the actor from data and shows only client-visible text", () => {
    const it = timelineItemOf({ id: "t", type: "status", status: "active", data: { actor: { name: "LexGo Advokat", role: "advokat" }, note: "Order accepted" } });
    expect(it.actor).toBe("LexGo Advokat");
    expect(it.message).toBe("");
    const r = timelineItemOf({ id: "r", type: "reassignment", status: "accepted", data: { client_visible_reason: "Boshqa mutaxassis" } });
    expect(r.message).toBe("Boshqa mutaxassis");
  });
});
