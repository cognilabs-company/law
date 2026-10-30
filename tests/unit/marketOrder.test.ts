import { describe, expect, it } from "vitest";
import { awaitingSeller, isOrderPending, marketPaymentSignalOf, marketPhaseOf, marketSignalOf, normMarketOrder, phaseOfStatus, purchaseOf, trackPhaseOf } from "@/lib/services/marketplace";

// Trimmed from live GET /marketplace/me/orders/{id} responses (24 Oct 2026).
const paidOrder = (extra: Record<string, unknown> = {}) => ({
  id: "o1",
  status: "paid",
  payment_status: "paid",
  price: 110000,
  currency: "UZS",
  secure_chat_room_id: "r1",
  can_start_chat: true,
  can_create_call: true,
  chat_url: "/secure-chats/r1",
  call_create_url: "/secure-chats/r1/calls",
  contact_unlocked: true,
  details: {
    pricing_snapshot: { selected_price: 100000, effective_price: 100000, final_price: 110000, price_capped: false, min_allowed: 70000, max_allowed: 100000, modifiers: [{ code: "region", key: "default", multiplier: 1.0, amount: 0 }] },
    option_quote: { base_price: 100000, breakdown: [{ id: "e2e_urgent", label: "Shoshilinch", adjustment_type: "percent", value: 10.0, amount: 10000 }] },
    financial_snapshot: {
      gross_amount: 110000,
      commission: { base_percent: 18, effective_percent: 18, platform_amount: 19800, seller_net_amount: 90200 },
      payment: { advance_percent: 10, advance_amount: 11000, final_percent: 90, final_amount: 99000 },
    },
  },
  ...extra,
});

describe("order phase (state machine as the UI reads it)", () => {
  const phase = (status: string, payment_status = "paid", extra: Record<string, unknown> = {}) => marketPhaseOf(normMarketOrder({ id: "o", status, payment_status, ...extra }));
  it.each([
    ["pending_payment", "pending", "pending"],
    ["pending", "pending", "pending"],
    ["paid", "paid", "paid"],
    ["in_progress", "paid", "in_progress"],
    ["cancellation_review", "paid", "review"],
    ["completed", "paid", "completed"],
    ["rated", "paid", "rated"],
    ["cancelled", "cancelled", "cancelled"],
    ["refunded", "refunded", "cancelled"],
  ])("%s / %s → %s", (status, pay, want) => {
    expect(phase(status, pay)).toBe(want);
  });

  it("a completed order with a rating reads as rated", () => {
    expect(phase("completed", "paid", { rating: { value: 5 } })).toBe("rated");
  });

  it("final payment never sends a completed order back to paid", () => {
    expect(phase("completed", "paid")).toBe("completed");
  });

  it("pending means unpaid", () => {
    expect(isOrderPending({ status: "pending", paymentStatus: "pending" })).toBe(true);
    expect(isOrderPending({ status: "pending", paymentStatus: "paid" })).toBe(false);
  });
});

describe("protected contact", () => {
  it("opens chat and calls once the advance is confirmed", () => {
    const o = normMarketOrder(paidOrder());
    expect(o.canStartChat).toBe(true);
    expect(o.canCreateCall).toBe(true);
  });

  it("keeps chat and calls shut while contact_unlocked is false, whatever else says", () => {
    const o = normMarketOrder(paidOrder({ contact_unlocked: false }));
    expect(o.canStartChat).toBe(false);
    expect(o.canCreateCall).toBe(false);
  });
});

describe("price snapshot", () => {
  it("is read as sent, with the client's extras and the commission", () => {
    const p = normMarketOrder(paidOrder()).pricing;
    expect(p).toMatchObject({
      selected: 100000,
      final: 110000,
      min: 70000,
      max: 100000,
      capped: false,
      commission: { percent: 18, platform: 19800, net: 90200 },
      options: [{ label: "Shoshilinch", percent: 10, amount: 10000 }],
    });
    // The 10% advance split is gone (TSK-900422 replaced TSK-783253).
    expect(p).not.toHaveProperty("advance");
    expect(p).not.toHaveProperty("rest");
  });

  it("is absent when the order has no snapshot", () => {
    expect(normMarketOrder({ id: "o", status: "paid" }).pricing).toBeNull();
  });
});

describe("realtime signals", () => {
  it.each(["marketplace.advance_paid", "marketplace.final_paid"])("%s refreshes the order as a payment", (event) => {
    const sig = marketSignalOf({ event, order_id: "o1" });
    expect(sig?.orderId).toBe("o1");
    expect(marketPaymentSignalOf({ event, order_id: "o1" })?.orderId).toBe("o1");
  });

  it("a payment notification names its order", () => {
    const sig = marketSignalOf({ event: "notification.created", notification: { data: { event: "order_payment_updated", order_id: "o9" } } });
    expect(sig?.orderId).toBe("o9");
  });
});

describe("pricing snapshot and resolution (contract of 24 Oct 2026)", () => {
  it("keeps the snapshot's components in order, with their explanations", () => {
    const o = normMarketOrder(
      paidOrder({
        details: {
          pricing_snapshot: {
            final_price: 879749,
            historical_policy_exact: false,
            components: [
              { code: "base_price", amount: 850000, percent: null, explanation: { uz: "Xizmatning asosiy narxi", ru: "Базовая стоимость услуги" } },
              { code: "selected_option", amount: 29749, explanation: { uz: "Shoshilinch bajarish" } },
            ],
          },
        },
      }),
    );
    expect(o.pricing?.components.map((c) => [c.code, c.amount, c.label.ru ?? c.label.uz])).toEqual([
      ["base_price", 850000, "Базовая стоимость услуги"],
      ["selected_option", 29749, "Shoshilinch bajarish"],
    ]);
    expect(o.pricing?.historical).toBe(true);
  });

  it("reads the client's pending choice and treats a refund as stopped", () => {
    const o = normMarketOrder({ id: "o", status: "resolution_required", resolution: { offer: { id: "of", status: "pending_client_choice", options: ["reassign", "refund"], deadline_at: "2026-10-24T09:00:00Z" }, refund: null, can_choose: true } });
    expect(o.resolution).toMatchObject({ canChoose: true, offer: { options: ["reassign", "refund"] } });
    expect(marketPhaseOf(normMarketOrder({ id: "o", status: "refund_pending", payment_status: "paid" }))).toBe("cancelled");
    expect(normMarketOrder({ id: "o", status: "paid" }).resolution).toBeNull();
  });
});

describe("waiting for the seller to accept (live shape, 24 Oct 2026)", () => {
  const live = {
    id: "o9",
    status: "sent_to_seller",
    payment_status: "unpaid",
    price: 879749,
    currency: "UZS",
    payment: { target_type: "marketplace_advance", status: "awaiting_seller_acceptance", amount: 87974, currency: "UZS", provider_payload: { stage: "advance" } },
    details: {
      assignment_mode: "client_selected_external",
      assignment_status: "waiting_seller_response",
      acceptance_deadline_at: "2026-10-24T11:36:08Z",
      seller_response_minutes: 30,
      client_status: "request_received",
      client_status_message: "So‘rovingiz qabul qilindi. Xizmat boshlanishi bo‘yicha tez orada xabar beramiz.",
    },
  };
  it("is not read as paid anywhere", () => {
    const o = normMarketOrder(live);
    expect(awaitingSeller(o)).toBe(true);
    expect(trackPhaseOf(o)).toBe("accepting");
    expect(phaseOfStatus("sent_to_seller")).toBe("accepting");
    expect(marketPhaseOf(o)).toBe("pending");
    expect(o.advance).toEqual({ status: "awaiting_seller_acceptance", amount: 87974, currency: "UZS" });
    expect(o.clientMessage).toMatch(/qabul qilindi/);
  });
  it("reads the purchase answer the same way", () => {
    const p = purchaseOf({ work_id: "ADV-5IIPV", order: { ...live, payment: undefined }, payment: live.payment });
    expect(p).toMatchObject({ accepting: true, deadlineAt: "2026-10-24T11:36:08Z", amount: 879749 });
    expect(p).not.toHaveProperty("advanceAmount");
  });
});

describe("2026-10-24 assignment contract", () => {
  it("a paid order still waits for the seller while its assignment says so", () => {
    expect(awaitingSeller({ status: "sent_to_seller", paymentStatus: "paid", assignment: { status: "waiting_seller_acceptance" } as never })).toBe(true);
    expect(awaitingSeller({ status: "accepted", paymentStatus: "paid", assignment: { status: "accepted" } as never })).toBe(false);
  });
  it("reads assignment events as a new request and a reminder with minutes left", () => {
    const fresh = marketSignalOf({ event: "marketplace.assignment_received", order_id: "o1", room_id: "r1", acceptance_deadline_at: "2026-10-25T10:30:00Z" });
    expect(fresh).toMatchObject({ kind: "assigned", sub: "new", orderId: "o1", deadlineAt: "2026-10-25T10:30:00Z" });
    const soon = marketSignalOf({ event: "marketplace.assignment_deadline_soon", order_id: "o1", acceptance_deadline_at: "2026-10-25T10:30:00Z", minutes_left: 10 });
    expect(soon).toMatchObject({ kind: "assigned", sub: "soon", minutesLeft: 10 });
  });
});

describe("a direct-seller order before the advance is paid", () => {
  // Live 26 Oct 2026: the seller accepted, the order stays "accepted" and unpaid.
  const accepted = normMarketOrder({ id: "o1", status: "accepted", payment_status: "unpaid", payment: { target_type: "marketplace_advance", status: "pending", amount: 87974 }, details: { assignment_status: "accepted" } });
  it("waits for the advance instead of claiming a payment", () => {
    expect(isOrderPending(accepted)).toBe(true);
    expect(trackPhaseOf(accepted)).toBe("pending");
    expect(phaseOfStatus("accepted")).toBe("pending");
  });
  it("is in the chat once paid with a room", () => {
    const paid = normMarketOrder({ id: "o1", status: "paid", payment_status: "paid", can_start_chat: true, secure_chat_room_id: "r1", details: { assignment_status: "accepted" } });
    expect(trackPhaseOf(paid)).toBe("chat");
  });
});
