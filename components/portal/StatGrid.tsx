"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Skeleton, EmptyState } from "./DataState";
import { useSellerCabinet } from "./SellerCabinet";
import { uzs, fmtUzs } from "@/lib/money";
import {
  IconBriefcase,
  IconFileText,
  IconChat,
  IconClock,
  IconCard,
  IconEye,
  IconSearch,
  IconTarget,
  IconStar,
  IconTrendingUp,
} from "@/components/icons";

type Fmt = "int" | "som" | "rating" | "percent" | "minutes";
type Metric = { key: string; from: "workload" | "finance" | "performance"; label: string; Icon: (p: { className?: string }) => ReactNode; fmt: Fmt };

const num = (o: Record<string, unknown>, k: string): number => {
  const x = o?.[k];
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
};
const som = (n: number) => fmtUzs(n);

const WORKLOAD: Metric[] = [
  { key: "active_cases", from: "workload", label: "activeCases", Icon: IconBriefcase, fmt: "int" },
  { key: "open_orders", from: "workload", label: "openOrders", Icon: IconFileText, fmt: "int" },
  { key: "unread_messages", from: "workload", label: "unreadMessages", Icon: IconChat, fmt: "int" },
  { key: "deadlines_today", from: "workload", label: "deadlinesToday", Icon: IconClock, fmt: "int" },
  { key: "earnings_month", from: "finance", label: "earnings", Icon: IconCard, fmt: "som" },
  { key: "earnings_via_lexgo", from: "finance", label: "viaLexgo", Icon: IconTrendingUp, fmt: "som" },
];
const PERFORMANCE: Metric[] = [
  { key: "profile_views", from: "performance", label: "profileViews", Icon: IconEye, fmt: "int" },
  { key: "search_appearances", from: "performance", label: "searchAppearances", Icon: IconSearch, fmt: "int" },
  { key: "profile_clicks", from: "performance", label: "profileClicks", Icon: IconTarget, fmt: "int" },
  { key: "contact_requests", from: "performance", label: "contactRequests", Icon: IconChat, fmt: "int" },
  { key: "rating", from: "performance", label: "rating", Icon: IconStar, fmt: "rating" },
  { key: "response_rate", from: "performance", label: "responseRate", Icon: IconTrendingUp, fmt: "percent" },
  { key: "avg_response_minutes", from: "performance", label: "avgResponse", Icon: IconClock, fmt: "minutes" },
];

export default function StatGrid({
  variant,
  emptyTitle,
  emptyText,
}: {
  variant: "workload" | "performance";
  emptyTitle: string;
  emptyText: string;
}) {
  const t = useTranslations("portal.stats");
  // Stats come from the cabinet bootstrap loaded by the portal shell.
  const cabinet = useSellerCabinet();
  const metrics = variant === "workload" ? WORKLOAD : PERFORMANCE;

  if (cabinet.status === "loading") return <Skeleton rows={2} />;
  if (cabinet.status === "error" || !cabinet.data) {
    return <EmptyState icon={<IconTrendingUp />} title={emptyTitle} text={emptyText} />;
  }
  const s = cabinet.data.stats;

  function value(m: Metric): string {
    const n = num(s[m.from], m.key);
    if (m.fmt === "som") {
      const cur = String((s.finance.currency as string) || "UZS");
      return `${som(uzs(s[m.from], m.key))} ${cur}`;
    }
    if (m.fmt === "rating") return n ? n.toFixed(1) : "—";
    if (m.fmt === "percent") return `${Math.round(n <= 1 ? n * 100 : n)}%`;
    if (m.fmt === "minutes") return n ? t("minutes", { n: Math.round(n) }) : "—";
    return String(n);
  }
  // earnings_via_lexgo is a running total over the period the backend names
  // (e.g. "all_time").
  const period = String(s.finance?.earnings_via_lexgo_period ?? "");
  const caption = (m: Metric) =>
    m.key === "earnings_via_lexgo" && period
      ? `${t(m.label)} · ${t.has(`periods.${period}`) ? t(`periods.${period}`) : period.replace(/_/g, " ")}`
      : t(m.label);

  return (
    <div className="amet">
      {metrics.map((m) => (
        <div className="amet__c" key={m.key}>
          <span className="amet__i"><m.Icon /></span>
          <b>{value(m)}</b>
          <span className="amet__l">{caption(m)}</span>
        </div>
      ))}
    </div>
  );
}
