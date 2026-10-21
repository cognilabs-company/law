import { phoneWaitsForPayment } from "@/lib/services/clientPhone";
import type { MarketOrder } from "@/lib/services/marketplace";

export type ClientPhoneShow = "show" | "payment" | "hidden" | "none";

export function clientPhoneShow(o: Pick<MarketOrder, "clientPhone" | "clientPhoneVisible" | "clientPhoneHiddenReason" | "paymentStatus">): ClientPhoneShow {
  if (o.clientPhoneVisible === false) return phoneWaitsForPayment(o.clientPhoneHiddenReason) ? "payment" : "hidden";
  if (o.clientPhoneVisible !== true && o.paymentStatus !== "paid") return "payment";
  return o.clientPhone ? "show" : "none";
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
