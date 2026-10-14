"use client";

import { Suspense, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { useUrlTab } from "@/lib/useUrlTab";
import type { ServiceScope } from "@/lib/services/sellerServices";
import { IconBriefcase, IconClock, IconPackage } from "@/components/icons";
import Tabs from "@/components/ui/Tabs";
import ServiceManager from "./ServiceManager";
import LegacyServicePicker from "./LegacyServicePicker";
import SellerPackagesSection from "./SellerPackagesSection";

const ME: ServiceScope = { kind: "me" };
const SELLER_TABS = ["services", "packages"] as const;
type SellerTab = (typeof SELLER_TABS)[number];
const TAB_REVEAL = { packages: /^seller\.packages(\.|$)/ };

function PendingLock({ role }: { role: "lawyer" | "advocate" }) {
  const t = useTranslations("sellerServices.pending");
  return (
    <div className="svm">
      <div className="svm__blocked is-wait" role="note">
        <span className="svm__bic" aria-hidden="true">
          <IconClock />
        </span>
        <b>{t("title")}</b>
        <p>{t("text")}</p>
        <Link href={`/portal/${role}/profile`} className="btn btn--line btn--sm">
          {t("action")}
        </Link>
      </div>
    </div>
  );
}

function SellerTabs({ role, fallback }: { role: "lawyer" | "advocate"; fallback: ReactNode }) {
  const t = useTranslations("sellerPackages");
  const [tab, pick] = useUrlTab<SellerTab>(SELLER_TABS, "services");
  return (
    <Tabs<SellerTab>
      items={[
        {
          key: "services",
          label: t("tabServices"),
          icon: <IconBriefcase aria-hidden="true" />,
          panel: <ServiceManager scope={ME} role={role} renderBlocked={(e) => (e.kind === "pendingAccount" ? fallback : null)} />,
          aiId: "seller.tabs.services",
        },
        { key: "packages", label: t("tabPackages"), icon: <IconPackage aria-hidden="true" />, panel: <SellerPackagesSection />, lazy: true, aiId: "seller.tabs.packages" },
      ]}
      value={tab}
      onChange={pick}
      label={t("tabsLabel")}
      aiId="seller.tabs"
      className="spk-tabs"
      reveal={TAB_REVEAL}
    />
  );
}

export default function SellerServicesPage({ role }: { role: "lawyer" | "advocate" }) {
  const { session } = useAuth();
  const fallback = role === "lawyer" ? <LegacyServicePicker /> : <PendingLock role={role} />;
  if (session?.accountStatus === "pending") return fallback;
  return (
    <Suspense fallback={<div className="svm" aria-busy="true"><div className="svm__hero is-skel" /></div>}>
      <SellerTabs role={role} fallback={fallback} />
    </Suspense>
  );
}
