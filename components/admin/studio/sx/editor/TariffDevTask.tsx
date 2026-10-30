"use client";

import "@/components/admin/plans/tariffs.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { DevTask } from "@/components/admin/plans/PlanVersions";
import { isAborted, logApiError } from "@/lib/http";
import { listPlanVersions, type PlanVersion } from "@/lib/services/tariffs";

// TSK-692647 in Studio K17, where tariffs are managed: the developer task a
// published version created (code, title, status, deadline, assignees) and
// the superadmin's approval, read from the plan's versions. Nothing shows
// until a version carries a task or an approval.
export default function TariffDevTask({ planId }: { planId: string }): ReactElement | null {
  const t = useTranslations("admin.tariffs.dev");
  const [latest, setLatest] = useState<PlanVersion | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    listPlanVersions(planId, ctl.signal).then(
      (v) => {
        const withTask = v.items.filter((x) => x.devTask || x.approval).sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
        setLatest(withTask[0] ?? null);
      },
      (e) => {
        if (!isAborted(e)) logApiError("studio.k17.devTask", e);
      },
    );
    return () => ctl.abort();
  }, [planId]);
  if (!latest) return null;
  return (
    <section className="trf-devbox" aria-label={t("panel", { n: latest.version ?? 1 })}>
      <b className="trf-devbox__h">{t("panel", { n: latest.version ?? 1 })}</b>
      <DevTask task={latest.devTask} approval={latest.approval} />
    </section>
  );
}
