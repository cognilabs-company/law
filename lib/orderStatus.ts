// Order statuses (T1-10) as the backend names them (ORDER_STATUSES in
// marketplace_routes.py), their labels, and the 5 simplified steps a client sees.
import { useTranslations } from "next-intl";
import { humanizeSlug } from "@/lib/lawyers";

export const ORDER_STATUSES = [
  "new",
  "waiting_info",
  "waiting_docs",
  "waiting_payment",
  "seller_selection",
  "sent_to_seller",
  "paid",
  "accepted",
  "started",
  "in_progress",
  "result_ready",
  "quality_check",
  "delivered",
  "client_confirmation",
  "completed",
  "rated",
  "lost",
  "cancelled",
  "declined",
] as const;

// Client-facing steps, in order. "closed" (lost / cancelled / declined) sits outside the track.
export const CLIENT_STAGES = ["request", "matching", "payment", "work", "done"] as const;
export type ClientStage = (typeof CLIENT_STAGES)[number] | "closed";

const STAGE_OF: Record<string, ClientStage> = {
  new: "request",
  waiting_info: "request",
  waiting_docs: "request",
  seller_selection: "matching",
  sent_to_seller: "matching",
  accepted: "matching",
  waiting_payment: "payment",
  paid: "work",
  started: "work",
  in_progress: "work",
  result_ready: "work",
  quality_check: "work",
  delivered: "done",
  client_confirmation: "done",
  completed: "done",
  rated: "done",
  lost: "closed",
  cancelled: "closed",
  canceled: "closed",
  declined: "closed",
};

const norm = (s: string) => (s || "").trim().toLowerCase();

// null for a status the backend doesn't list (legacy or case statuses).
export function clientStageOf(status: string): ClientStage | null {
  return STAGE_OF[norm(status)] ?? null;
}

// Label for an order status; unknown values are humanized ("on_hold" → "On hold").
export function useOrderStatusLabel(): (status: string) => string {
  const t = useTranslations("portal.common");
  return (status: string) => {
    const s = norm(status);
    if (!s) return "";
    return t.has(`orderStatus.${s}`) ? t(`orderStatus.${s}`) : humanizeSlug(s);
  };
}
