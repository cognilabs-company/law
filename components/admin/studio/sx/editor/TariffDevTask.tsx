"use client";

import "@/components/admin/plans/tariffs.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { DevTask } from "@/components/admin/plans/PlanVersions";
import { isAborted, logApiError } from "@/lib/http";
import { listPlanVersions, type PlanVersion } from "@/lib/services/tariffs";

// TSK-692647 in Studio K17, where tariffs are managed: for every revision
// that created a developer task or went to the superadmin, the task (code,
// title, status, deadline, assignees) and the approval, read from the
// plan's versions. The newest is open; earlier ones fold below it, so the
// revision history stays visible. Nothing shows until a version has either.
export default function TariffDevTask({ planId }: { planId: string }): ReactElement | null {
  const t = useTranslations("admin.tariffs.dev");
  const [rows, setRows] = useState<PlanVersion[]>([]);
  useEffect(() => {
    const ctl = new AbortController();
    listPlanVersions(planId, ctl.signal).then(
      (v) => setRows(v.items.filter((x) => x.devTask || x.approval).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))),
      (e) => {
        if (!isAborted(e)) logApiError("studio.k17.devTask", e);
      },
    );
    return () => ctl.abort();
  }, [planId]);
  if (!rows.length) return null;
  const [latest, ...earlier] = rows;
  return (
    <section className="trf-devbox" aria-label={t("panel", { n: latest.version ?? 1 })}>
      <b className="trf-devbox__h">{t("panel", { n: latest.version ?? 1 })}</b>
      <DevTask task={latest.devTask} approval={latest.approval} />
      {earlier.length ? (
        <details className="trf-devbox__past">
          <summary>{t("earlier", { n: earlier.length })}</summary>
          {earlier.map((v) => (
            <div key={v.id} className="trf-devbox__rev">
              <b className="trf-devbox__h">{t("versionN", { n: v.version ?? 1 })}</b>
              <DevTask task={v.devTask} approval={v.approval} />
            </div>
          ))}
        </details>
      ) : null}
    </section>
  );
}
