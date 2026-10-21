"use client";

import { useTranslations } from "next-intl";
import { isContactSpeed, type MarketOrder } from "@/lib/services/marketplace";

export function useContactSpeedText(): (o: Pick<MarketOrder, "contactSpeed" | "contactSpeedLabel">) => string {
  const t = useTranslations("marketplace.purchase.speeds");
  return (o) => o.contactSpeedLabel || (isContactSpeed(o.contactSpeed) ? t(o.contactSpeed) : "");
}
