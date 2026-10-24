import { describe, expect, it } from "vitest";
import { isOrderPending, marketPaymentSignalOf, marketPhaseOf, marketSignalOf, normMarketOrder } from "@/lib/services/marketplace";

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
      advance: { percent: 10, amount: 11000 },
      rest: { percent: 90, amount: 99000 },
      commission: { percent: 18, platform: 19800, net: 90200 },
      options: [{ label: "Shoshilinch", percent: 10, amount: 10000 }],
    });
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
