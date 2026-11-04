"use client";

import { Suspense } from "react";
import CrmLeads from "@/components/crm/CrmLeads";

// The Kanban board as a page of its own (ROP contract §4): the same lead
// list in its board view, the view switch hidden.
export default function AdminCrmKanban() {
  return (
    <Suspense fallback={null}>
      <CrmLeads forceView="board" />
    </Suspense>
  );
}
