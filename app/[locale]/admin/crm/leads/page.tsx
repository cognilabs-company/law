"use client";

import { Suspense } from "react";
import CrmLeads from "@/components/crm/CrmLeads";

// The list reads ?tab= and ?status= (useSearchParams), so it renders in
// its own Suspense boundary.
export default function AdminCrmLeads() {
  return (
    <Suspense fallback={null}>
      <CrmLeads />
    </Suspense>
  );
}
