"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, Navigation } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { MarketOrder } from "@/lib/services/marketplace";
import "./orderRoute.css";

export default function OrderRouteCard({ o, view, aiBase }: { o: MarketOrder; view: string; aiBase: string }) {
  const t = useTranslations("marketMap.order");
  if (view !== "client" || !o.navigation.available || !o.lawyerUserId) return null;
  const q = new URLSearchParams({ mode: "nearby", route: o.lawyerUserId, order: o.navigation.paidOrderId || o.id });
  return (
    <Link href={`/portal/client/lawyers?${q.toString()}`} className="mor" data-ai-id={`${aiBase}.route`}>
      <span className="mor__ic" aria-hidden="true">
        <Navigation strokeWidth={1.75} />
      </span>
      <span className="mor__txt">
        <b>{t("route")}</b>
        <small>{t("routeText")}</small>
      </span>
      <ChevronRight className="mor__go" aria-hidden="true" strokeWidth={1.75} />
    </Link>
  );
}
