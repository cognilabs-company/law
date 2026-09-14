"use client";

import SellerDashboard from "@/components/portal/SellerDashboard";
import TwoFactorCard from "@/components/portal/TwoFactorCard";
import TelegramLinkCard from "@/components/portal/TelegramLinkCard";

// Lawyers have no profile route, so account settings (mandatory 2FA, Telegram
// link) live on the dashboard.
export default function LawyerDashboard() {
  return (
    <>
      <SellerDashboard role="lawyer" />
      <TwoFactorCard />
      <TelegramLinkCard />
    </>
  );
}
