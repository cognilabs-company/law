import type { MarketOrder, MarketPhase } from "@/lib/services/marketplace";
import type { RuntimeConfig } from "@/lib/services/marketRuntime";

export type OrderView = "client" | "seller";
export type LoadState = "idle" | "loading" | "ready" | "error" | "none";
export type OrderSectionProps = {
  o: MarketOrder;
  phase: MarketPhase;
  view: OrderView;
  aiBase: string;
  runtime: RuntimeConfig | null;
  onChanged: (patch?: Partial<MarketOrder>) => void;
};

export const SECTION_ID = {
  checklist: "mod-checklist",
  negotiation: "mod-negotiation",
  documents: "mod-documents",
  opinion: "mod-opinion",
  cancel: "mod-cancel",
  rating: "mod-rating",
  result: "mod-result",
} as const;

export function orderAiBase(view: OrderView): string {
  return view === "client" ? "marketplace.orders.detail" : "advocate.marketplace-orders.detail";
}
