// Real checkout (T0-09): outside the staging demo provider every paid action
// creates an invoice through POST /payments and the client pays on the
// provider page (payment_url). The demo flows stay behind isDemoCheckout().
import { checkoutProvider, createPayment, isDemoCheckout, type PaymentIntent } from "./backend";

export { isDemoCheckout };
export type { PaymentIntent };

// One-time private chat fee in whole so'm, the same default the backend's
// demo-private-chat request uses (DemoPrivateChatPaymentRequest.amount).
export const PRIVATE_CHAT_PRICE_UZS = 10000;

export type CheckoutTarget =
  | { kind: "order"; orderId: string; amount: number; payload?: Record<string, unknown> }
  | { kind: "subscription_plan"; planId: string; amount: number; payload?: Record<string, unknown> }
  | { kind: "private_chat"; sellerUserId: string; amount?: number; payload?: Record<string, unknown> };

// Create the invoice; the caller shows amount + status, then sends the user to paymentUrl.
export function createCheckout(target: CheckoutTarget): Promise<PaymentIntent> {
  const base = { provider: checkoutProvider(), currency: "UZS" };
  if (target.kind === "order") {
    return createPayment({
      ...base,
      amount: Math.round(target.amount),
      order_id: target.orderId,
      target_type: "order",
      target_id: target.orderId,
      provider_payload: target.payload ?? {},
    });
  }
  if (target.kind === "subscription_plan") {
    return createPayment({
      ...base,
      amount: Math.round(target.amount),
      target_type: "subscription_plan",
      target_id: target.planId,
      provider_payload: target.payload ?? {},
    });
  }
  return createPayment({
    ...base,
    amount: Math.round(target.amount ?? PRIVATE_CHAT_PRICE_UZS),
    target_type: "private_chat",
    target_id: target.sellerUserId,
    provider_payload: { title: "Private consultation chat", ...(target.payload ?? {}) },
  });
}
