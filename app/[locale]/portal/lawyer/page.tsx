"use client";

import SellerDashboard from "@/components/portal/SellerDashboard";
import TwoFactorCard from "@/components/portal/TwoFactorCard";

// Lawyers have no profile route, so account security (mandatory 2FA) lives on
// the dashboard.
export default function LawyerDashboard() {
  return (
    <>
      <SellerDashboard role="lawyer" />
      <TwoFactorCard />
    </>
  );
}
