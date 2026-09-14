// Payment intents via POST /payments. No mock amounts — the caller passes the
// price from the backend plan/product it is purchasing.
import { createPayment } from "./backend";

export type CheckoutResult =
  | { ok: true; invoiceId: string }
  | { ok: false; message: string };

// `amount` is whole so'm (legacy UZS), never tiyin (T0-16).
export async function checkout(amount: number): Promise<CheckoutResult> {
  if (amount <= 0) return { ok: true, invoiceId: "FREE" };
  try {
    const r = await createPayment({ provider: "payme", amount });
    return { ok: true, invoiceId: r.id || "PENDING" };
  } catch {
    return { ok: false, message: "payment_failed" };
  }
}
