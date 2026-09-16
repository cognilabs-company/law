"use client";

import { useTranslations } from "next-intl";
import SellerDashboard from "@/components/portal/SellerDashboard";
import StatGrid from "@/components/portal/StatGrid";
import TwoFactorCard from "@/components/portal/TwoFactorCard";
import TelegramLinkCard from "@/components/portal/TelegramLinkCard";
import NotificationPrefsCard from "@/components/portal/NotificationPrefsCard";
import { useSellerCabinet } from "@/components/portal/SellerCabinet";

// Lawyers have no profile route, so account settings (mandatory 2FA, Telegram
// link, notification preferences) live on the dashboard.
export default function LawyerDashboard() {
  const t = useTranslations("portal.advocate.dashboard");
  const cabinet = useSellerCabinet();
  return (
    <>
      <SellerDashboard role="lawyer" />
      {cabinet.data?.limitedAccess ? null : (
        <div className="ppanel">
          <div className="ppanel__h">
            <b>{t("performance")}</b>
          </div>
          <StatGrid variant="performance" emptyTitle={t("performanceEmpty")} emptyText={t("performanceEmptyText")} />
        </div>
      )}
      <TwoFactorCard />
      <TelegramLinkCard />
      <NotificationPrefsCard />
    </>
  );
}
