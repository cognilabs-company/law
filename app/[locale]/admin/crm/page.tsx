"use client";

import CrmOverview from "@/components/crm/CrmOverview";
import RopOverview from "@/components/crm/rop/RopOverview";
import { useInRop } from "@/components/crm/rop/ropCtx";

// The ROP workspace opens on its operational overview (ROP contract §6);
// everyone else keeps the CRM's own overview.
export default function AdminCrm() {
  return useInRop() ? <RopOverview /> : <CrmOverview />;
}
