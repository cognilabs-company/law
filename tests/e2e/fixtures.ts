// Backend responses the browser tests answer with, trimmed from live
// responses (24 Oct 2026). Every value is made up for the tests.

export const ORDER_ID = "11111111-2222-4333-8444-555555555555";

export function order(extra: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    work_id: "MP-TEST1",
    status: "paid",
    payment_status: "paid",
    service_id: "svc-1",
    service_title: "Test xizmat",
    price: 110000,
    currency: "UZS",
    created_at: "2026-10-20T10:00:00Z",
    lawyer_user_id: "u-adv",
    lawyer_name: "Test Advokat",
    client_user_id: "u-client",
    client: { id: "u-client", name: "Test Mijoz" },
    lawyer: { id: "u-adv", name: "Test Advokat" },
    secure_chat_room_id: "room-1",
    chat_url: "/secure-chats/room-1",
    call_create_url: "/secure-chats/room-1/calls",
    can_start_chat: true,
    can_create_call: true,
    contact_unlocked: true,
    payment: { amount: 110000, paid_amount: 110000, status: "paid" },
    details: {
      pricing_snapshot: {
        selected_price: 100000,
        effective_price: 100000,
        final_price: 110000,
        price_capped: false,
        min_allowed: 70000,
        max_allowed: 100000,
        modifiers: [
          { code: "region", key: "samarkand", multiplier: 1.05, amount: 4500 },
          { code: "region", key: "default", multiplier: 1.0, amount: 0 },
        ],
      },
      option_quote: { base_price: 100000, breakdown: [{ id: "urgent", label: "Shoshilinch", adjustment_type: "percent", value: 10.0, amount: 10000 }] },
      financial_snapshot: {
        gross_amount: 110000,
        currency: "UZS",
        commission: { base_percent: 18, effective_percent: 18, platform_amount: 19800, seller_net_amount: 90200 },
        payment: { advance_percent: 10, advance_amount: 11000, final_percent: 90, final_amount: 99000 },
      },
    },
    ...extra,
  };
}

// The financials' immutable snapshot with its planned payout stages, the
// only source of the plan (backend answers 2026-11-01 Q1).
export const PLAN_SNAPSHOT = {
  payment: {
    payout_stages: [
      { stage: "acceptance", gross_percent: 30, gross_amount: 33000, commission_deducted: 5940 },
      { stage: "first_checklist", gross_percent: 30, gross_amount: 33000, commission_deducted: 5940 },
      { stage: "completion", gross_percent: 40, gross_amount: 44000, commission_deducted: 7920, seller_amount: 36080 },
    ],
  },
};

export function financials(payments: { stage: string; status: string; amount: number }[], settlement: string | null = null) {
  return {
    order_id: ORDER_ID,
    payments: payments.map((p, i) => ({ id: `pay-${i}`, currency: "UZS", paid_amount: p.status === "paid" ? p.amount : 0, ...p })),
    settlement: settlement ? { status: settlement } : null,
  };
}
