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

// Mirror of ORDER_TRANSITIONS (marketplace_routes.py): what each status may
// become. Which side may trigger a move is a product rule (S-22) kept here.
const TRANSITIONS: Record<string, string[]> = {
  new: ["waiting_info", "waiting_docs", "waiting_payment", "seller_selection", "sent_to_seller", "paid", "accepted", "cancelled"],
  waiting_info: ["waiting_docs", "waiting_payment", "seller_selection", "cancelled"],
  waiting_docs: ["waiting_payment", "seller_selection", "sent_to_seller", "cancelled"],
  waiting_payment: ["paid", "cancelled"],
  seller_selection: ["sent_to_seller", "waiting_payment", "cancelled"],
  sent_to_seller: ["accepted", "declined", "cancelled"],
  paid: ["accepted", "started", "in_progress", "cancelled"],
  accepted: ["started", "in_progress", "result_ready", "cancelled"],
  started: ["in_progress", "result_ready", "cancelled"],
  in_progress: ["result_ready", "quality_check", "delivered", "cancelled"],
  result_ready: ["quality_check", "delivered", "client_confirmation"],
  quality_check: ["delivered", "in_progress"],
  delivered: ["client_confirmation", "completed", "rated"],
  client_confirmation: ["completed", "rated", "in_progress"],
  completed: ["rated"],
};
export type OrderSide = "client" | "seller" | "staff";
const SELLER_MOVES = new Set(["started", "in_progress", "result_ready", "delivered", "waiting_info", "waiting_docs"]);
const CLIENT_MOVES = new Set(["completed", "cancelled"]);
// Next statuses this side may set from `status` (staff: everything legal).
export function nextStatusesFor(side: OrderSide, status: string): string[] {
  const all = TRANSITIONS[norm(status)] ?? [];
  if (side === "staff") return all;
  const ok = side === "seller" ? SELLER_MOVES : CLIENT_MOVES;
  // A client may only cancel before the work starts (S-22).
  return all.filter((s) => ok.has(s) && !(side === "client" && s === "cancelled" && !["new", "waiting_info", "waiting_docs", "waiting_payment", "seller_selection"].includes(norm(status))));
}

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
