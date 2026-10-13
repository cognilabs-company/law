"use client";

import { useTranslations } from "next-intl";
import { useHrmCatalog } from "@/lib/services/hrm";
import { HrmHead } from "@/components/internal/HrmUi";
import { MyRecords } from "./HrmHub";

// My HR records across every module: active, waiting, recent.
export default function MyRecordsPage() {
  const t = useTranslations("internal.myRecords");
  const cat = useHrmCatalog();
  return (
    <section className="hrm-page">
      <HrmHead title={t("title")} lead={t("lead")} />
      <MyRecords cat={cat.data} />
    </section>
  );
}
