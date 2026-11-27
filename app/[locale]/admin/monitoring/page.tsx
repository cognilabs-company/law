"use client";

import MonitoringPage from "@/components/admin/monitoring/MonitoringPage";
import AdminTabs from "@/components/admin/AdminTabs";

export default function AdminMonitoring() {
  return (
    <>
      <AdminTabs set="monitoring" />
      <MonitoringPage />
    </>
  );
}
