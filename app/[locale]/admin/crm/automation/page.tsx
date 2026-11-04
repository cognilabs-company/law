"use client";

import { Suspense } from "react";
import RobotsPage from "@/components/crm/robots/RobotsPage";

// CRM robots (ROP contract §16–§17): the rules, smart scripts and the
// catalog-driven builder.
export default function AdminCrmAutomation() {
  return (
    <Suspense fallback={null}>
      <RobotsPage />
    </Suspense>
  );
}
