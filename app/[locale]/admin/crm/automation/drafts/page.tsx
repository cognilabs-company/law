"use client";

import { Suspense } from "react";
import ApprovalDrafts from "@/components/crm/robots/ApprovalDrafts";

// Approval drafts (ROP contract §18): what robots prepared for a client,
// reviewed and edited before anything is sent.
export default function AdminCrmApprovalDrafts() {
  return (
    <Suspense fallback={null}>
      <ApprovalDrafts />
    </Suspense>
  );
}
