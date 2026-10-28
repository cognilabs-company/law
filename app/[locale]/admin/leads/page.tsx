"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

// The leads list is now the CRM (one board with the old pipeline since
// 2026-10-28). Keep this route working for old links by redirecting there.
export default function LeadsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/crm/leads?tab=all&view=board");
  }, [router]);
  return null;
}
