"use client";

import { useTranslations } from "next-intl";
import { isContactSpeed, type MarketOrder } from "@/lib/services/marketplace";

// The backend's own contact_speed_label; the four contact_speed values in
// words when it sent none. Never the code itself.
export function useContactSpeedText(): (o: Pick<MarketOrder, "contactSpeed" | "contactSpeedLabel">) => string {
  const t = useTranslations("marketplace.purchase.speeds");
  return (o) => o.contactSpeedLabel || (isContactSpeed(o.contactSpeed) ? t(o.contactSpeed) : "");
}
