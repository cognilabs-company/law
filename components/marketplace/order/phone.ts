import { phoneWaitsForPayment } from "@/lib/services/clientPhone";
import type { MarketOrder } from "@/lib/services/marketplace";

export type ClientPhoneShow = "show" | "payment" | "hidden" | "none";

export function clientPhoneShow(o: Pick<MarketOrder, "clientPhone" | "clientPhoneVisible" | "clientPhoneHiddenReason" | "paymentStatus">): ClientPhoneShow {
  if (o.clientPhoneVisible === false) return phoneWaitsForPayment(o.clientPhoneHiddenReason) ? "payment" : "hidden";
  if (o.clientPhoneVisible !== true && o.paymentStatus !== "paid") return "payment";
  return o.clientPhone ? "show" : "none";
}

// The client's view of the advocate's phone: shown once paid, else why not.
export function lawyerPhoneShow(o: Pick<MarketOrder, "lawyerPhone" | "lawyerPhoneVisible" | "lawyerPhoneHiddenReason" | "paymentStatus">): ClientPhoneShow {
  if (o.lawyerPhoneVisible === false) return phoneWaitsForPayment(o.lawyerPhoneHiddenReason) ? "payment" : "hidden";
  if (o.lawyerPhoneVisible !== true && o.paymentStatus !== "paid") return "payment";
  return o.lawyerPhone ? "show" : "none";
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
