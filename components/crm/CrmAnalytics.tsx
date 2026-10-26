"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import DonutChart from "@/components/admin/DonutChart";
import { IconAlert, IconChartBar, IconLock, IconTarget, IconUsers } from "@/components/icons";
import { fmtNum } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { CRM_STATUSES, crmGlobalAnalytics, getCrmAnalytics, type CrmAnalytics as Data, type CrmMeta } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Avatar, Empty, statusVar, useCrmError } from "./bits";

type Period = "7" | "30" | "90" | "all";

export default function CrmAnalytics(): ReactElement {
  const t = useTranslations("crm");
  return <CrmFrame title={t("analytics.title")}>{(api) => <Board meta={api.meta} />}</CrmFrame>;
}

// Superadmin only: crm.analytics.global AND revenue_visible (§8). Anyone
// else gets a lock, never a number.
function Board({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("crm.analytics");
  const ts = useTranslations("crm.status");
  const locale = useLocale();
  const crmErr = useCrmError();
  const [period, setPeriod] = useState<Period>("30");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const allowed = crmGlobalAnalytics(meta);
  useEffect(() => {
    if (!allowed) return;
    const ctl = new AbortController();
    const from = period === "all" ? undefined : new Date(Date.now() - Number(period) * 86_400_000).toISOString().slice(0, 10);
    getCrmAnalytics({ from }, ctl.signal).then(
      (d) => {
        setData(d);
        setErr("");
      },
      (e) => {
        if (isAborted(e)) return;
        logApiError("crm.analytics", e);
        setErr(crmErr(e));
      },
    );
    return () => ctl.abort();
  }, [allowed, period, tick, crmErr]);
  useCrmEvents((ev) => {
    if (ev.invalidate.some((k) => k === "all" || k === "metrics")) setTick((n) => n + 1);
  });
  if (!allowed) return <div className="crm-card"><Empty icon={<IconLock />} title={t("locked")} text={t("lockedText")} /></div>;
  const max = Math.max(1, ...CRM_STATUSES.map((s) => data?.statusCounts[s] ?? 0));
  return (
    <>
      <div className="crm-filters">
        <span className="crm-period" role="group" aria-label={t("period")} style={{ marginLeft: 0 }}>
          {(["7", "30", "90", "all"] as Period[]).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {t(`p${p}`)}
            </button>
          ))}
        </span>
      </div>
      {err ? (
        <div className="crm-err" role="alert">
          <IconAlert aria-hidden="true" />
          {err}
        </div>
      ) : null}
      {!data ? (
        <span className="crm-sk crm-sk--block" style={{ height: 260 }} />
      ) : (
        <>
          <div className="crm-counters" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {data.revenueVisible && data.paidRevenue !== null ? (
              <div className="crm-revenue">
                <small>{t("revenue")}</small>
                <b>
                  {fmtUzs(data.paidRevenue)} <small>{data.currency === "UZS" ? t("som") : data.currency}</small>
                </b>
              </div>
            ) : null}
            <div className="crm-card">
              <small className="crm-muted">{t("total")}</small>
              <b style={{ font: "800 2rem/1 var(--fd)" }}>{fmtNum(data.totalLeads, locale)}</b>
            </div>
            <div className="crm-card">
              <small className="crm-muted">{t("won")}</small>
              <b style={{ font: "800 2rem/1 var(--fd)" }}>{fmtNum(data.statusCounts.won ?? 0, locale)}</b>
            </div>
          </div>
          <div className="crm-grid">
            <section className="crm-card" aria-labelledby="crm-fun-t">
              <h3 className="crm-card__h" id="crm-fun-t">
                <IconTarget aria-hidden="true" />
                {t("funnel")}
              </h3>
              <div className="crm-funnel">
                {CRM_STATUSES.map((s) => (
                  <div key={s} style={statusVar(s)}>
                    <small>{ts(s)}</small>
                    <span style={{ width: `${((data.statusCounts[s] ?? 0) / max) * 100}%` }} />
                    <b>{data.statusCounts[s] ?? 0}</b>
                  </div>
                ))}
              </div>
            </section>
            <section className="crm-card" aria-labelledby="crm-src-t">
              <h3 className="crm-card__h" id="crm-src-t">
                <IconChartBar aria-hidden="true" />
                {t("sources")}
              </h3>
              {Object.keys(data.sourceCounts).length ? <DonutChart data={Object.entries(data.sourceCounts).map(([label, value]) => ({ label, value }))} centerLabel={t("leads")} /> : <p className="crm-sub">{t("none")}</p>}
            </section>
          </div>
          <section className="crm-card" aria-labelledby="crm-lb-t">
            <h3 className="crm-card__h" id="crm-lb-t">
              <IconUsers aria-hidden="true" />
              {t("leaderboard")}
            </h3>
            {data.operators.length ? (
              <ol className="crm-board">
                {[...data.operators]
                  .sort((a, b) => b.won - a.won || b.conversion - a.conversion)
                  .map((o, i) => (
                    <li key={o.operator?.id ?? i}>
                      <em>{i + 1}</em>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <Avatar name={o.operator?.name ?? ""} />
                        <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.operator?.name || "—"}</b>
                      </span>
                      <span className="crm-muted">{t("wonOf", { won: o.won, total: o.total })}</span>
                      <b>{fmtNum(o.conversion, locale, 1)}%</b>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="crm-sub">{t("none")}</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
