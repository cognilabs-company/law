"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import PlansPanel from "@/components/portal/PlansPanel";
import ClientGiftsPanel from "@/components/portal/ClientGiftsPanel";
import Tabs from "@/components/ui/Tabs";
import { CreditCard, Gift } from "lucide-react";
import { useUrlTab } from "@/lib/useUrlTab";

const PLAN_TABS = ["plans", "gifts"] as const;
type PlanTab = (typeof PLAN_TABS)[number];

function PlanTabs() {
  const t = useTranslations("portal.sidebar.client");
  const [tab, pick] = useUrlTab<PlanTab>(PLAN_TABS, "plans");
  return (
    <Tabs<PlanTab>
      items={[
        { key: "plans", label: t("subscription"), icon: <CreditCard aria-hidden="true" />, panel: <PlansPanel variant="personal" />, aiId: "client.plans.tabs.plans" },
        { key: "gifts", label: t("gifts"), icon: <Gift aria-hidden="true" />, panel: <ClientGiftsPanel />, lazy: true, aiId: "client.plans.tabs.gifts" },
      ]}
      value={tab}
      onChange={pick}
      label={t("subscription")}
      aiId="client.plans.tabs"
    />
  );
}

export default function ClientSubscription() {
  return (
    <Suspense fallback={<PlansPanel variant="personal" />}>
      <PlanTabs />
    </Suspense>
  );
}
