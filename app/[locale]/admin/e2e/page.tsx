"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getE2eReadiness, type E2eReadiness } from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconClipboardCheck, IconRefresh, IconCheck, IconAlert } from "@/components/icons";

// T1-18 end-to-end readiness (GET /admin/e2e/readiness, users.manage): the
// state of each core flow with its routes, plus fixture counts for staging runs.
export default function AdminE2eReadiness() {
  const t = useTranslations("admin.e2e");
  const [key, setKey] = useState(0);
  const res = useResourceOne<E2eReadiness>(getE2eReadiness, [key]);
  const d = res.data;
  const ready = (s: string) => s === "ready" || s === "ok" || s === "passed" || s === "verified";
  const label = (group: string, k: string) => (t.has(`${group}.${k}`) ? t(`${group}.${k}`) : humanizeSlug(k));

  let checked = "";
  if (d?.checkedAt) {
    const at = new Date(d.checkedAt);
    if (!Number.isNaN(at.getTime())) checked = at.toLocaleString();
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setKey((k) => k + 1)} disabled={res.status === "loading"}>
          <IconRefresh />
          {t("refresh")}
        </button>
      </div>
      <p className="ppanel__note">{t("lead")}</p>

      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !d ? (
        <EmptyState icon={<IconClipboardCheck />} title={t("loadError")} text={t("loadErrorText")} />
      ) : (
        <>
          <div className={`e2e__sum${ready(d.status) ? " on" : ""}`}>
            <span className="e2e__si">{ready(d.status) ? <IconCheck /> : <IconAlert />}</span>
            <div>
              <b>{ready(d.status) ? t("allReady") : d.status === "needs_verification" ? t("needsVerification") : t("notReady")}</b>
              {checked ? <span>{t("checkedAt", { time: checked })}</span> : null}
            </div>
          </div>

          {d.fixtures.length ? (
            <>
              <h3 className="e2e__h">{t("fixtures")}</h3>
              <div className="amet">
                {d.fixtures.map((f) => (
                  <div className="amet__c" key={f.key}>
                    <b>{f.count}</b>
                    <span className="amet__l">{label("fixtureKeys", f.key)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <h3 className="e2e__h">{t("scenarios")}</h3>
          {d.scenarios.length ? (
            <div className="e2e__list">
              {d.scenarios.map((s, i) => (
                <div className="e2e__row" key={s.key || i}>
                  <div className="e2e__rt">
                    <b>{label("scenarioKeys", s.key)}</b>
                    <span className={`creq__badge${ready(s.status) ? " creq__badge--ok" : ""}`}>{label("status", s.status)}</span>
                  </div>
                  {s.checks.length ? (
                    <div className="e2e__checks">
                      {s.checks.map((c) => (
                        <span key={c.key} className={typeof c.value === "boolean" ? (c.value ? "on" : "off") : ""}>
                          {label("checkKeys", c.key)}
                          {typeof c.value === "boolean" ? null : <b>{String(c.value)}</b>}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {s.routes.length ? (
                    <div className="e2e__routes">
                      {s.routes.map((r) => (
                        <code key={r}>{r}</code>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="advmuted">{t("noScenarios")}</p>
          )}
        </>
      )}
    </div>
  );
}
