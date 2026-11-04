"use client";

import { Suspense } from "react";
import CrmLiveOffice from "@/components/crm/CrmLiveOffice";

// Live calls (ROP contract §14): ?call= opens one call directly.
export default function AdminCrmLive() {
  return (
    <Suspense fallback={null}>
      <CrmLiveOffice />
    </Suspense>
  );
}
