"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { IconAlert, IconChartBar, IconClock, IconRefresh, IconTarget, IconTrendingUp } from "@/components/icons";
import { fmtNum } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { getMyCrmMetrics, type CrmMeta, type CrmMetrics } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Empty, useCrmError } from "./bits";
import { CrmDate } from "./fields";
import { StatusDonut } from "./StatusDonut";

// "My performance" (contract 13cb257 §18): only the signed-in operator's
// own numbers for the chosen days — never revenue (revenue_visible=false
// for operators) — and the historical cycle metrics, which keep counting a
// won cycle even after its lead was reopened.
export default function CrmPerformance(): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame section="performance" title={t("perf.title")}>
      {(api) => <Board meta={api.meta} />}
    </CrmFrame>
  );
}

function Board({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("crm.perf");
  const locale = useLocale();
  const router = useRouter();
  const crmErr = useCrmError();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [m, setM] = useState<CrmMetrics | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setM(await getMyCrmMetrics({ from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined }, signal));
        setErr("");
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.perf", e);
        setErr(crmErr(e));
      }
    },
    [from, to, crmErr],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);
  useCrmEvents((ev) => {
    if (ev.invalidate.some((k) => k === "all" || k === "metrics")) void load();
  });
  const n = (v: number) => fmtNum(v, locale);
  return (
    <>
      <div className="crm-filters">
        <span className="crm-range" role="group" aria-label={t("period")}>
          <CrmDate value={from} onChange={setFrom} label={t("from")} max={to || undefined} />
          <CrmDate value={to} onChange={setTo} label={t("to")} min={from || undefined} />
        </span>
        <span className="crm-hint">{t("onlyMine")}</span>
      </div>
      {err && !m ? (
        <div className="crm-card">
          <Empty
            icon={<IconAlert />}
            title={t("failed")}
            text={err}
            action={
              <button type="button" className="crm-btn" onClick={() => void load()}>
                <IconRefresh aria-hidden="true" />
                {t("retry")}
              </button>
            }
          />
        </div>
      ) : !m ? (
        <>
          <span className="crm-sk crm-sk--block" style={{ height: 120 }} />
          <span className="crm-sk crm-sk--block" style={{ height: 260 }} />
        </>
      ) : (
        <>
          {err ? (
            <p className="crm-err" role="alert">
              <IconAlert aria-hidden="true" />
              {err}
            </p>
          ) : null}
          <section className="crm-hero" aria-labelledby="crm-perf-h">
            <div className="crm-hero__top">
              <h2 id="crm-perf-h">{m.operator?.name || t("title")}</h2>
              <p>{t("lead")}</p>
            </div>
          <div className="crm-counters crm-perf">
            <div className="crm-counter">
              <small>{t("active")}</small>
              <b>{n(m.active)}</b>
              <span>{t("activeSub", { total: n(m.total) })}</span>
            </div>
            <div className="crm-counter">
              <small>{t("won")}</small>
              <b>{n(m.won)}</b>
              <span>{t("closedSub", { n: n(m.closed) })}</span>
            </div>
            <div className="crm-counter">
              <small>{t("conversion")}</small>
              <b>{`${fmtNum(m.conversion, locale, 1)}%`}</b>
              <span>{t("conversionSub")}</span>
            </div>
            <div className="crm-counter">
              <small>
                <IconClock aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: "-1px" }} /> {t("firstResponse")}
              </small>
              <b>{m.firstResponseMin === null ? "—" : t("min", { n: fmtNum(m.firstResponseMin, locale, 1) })}</b>
              <span>{t("firstResponseSub")}</span>
            </div>
            <div className="crm-counter" data-tone={m.overdue ? "bad" : undefined}>
              <small>{t("overdue")}</small>
              <b>{n(m.overdue)}</b>
              <span>{t("overdueSub")}</span>
            </div>
          </div>
          </section>
          <div className="crm-grid">
            <section className="crm-card" aria-labelledby="crm-perf-st">
              <h3 className="crm-card__h" id="crm-perf-st">
                <IconChartBar aria-hidden="true" />
                {t("byStatus")}
              </h3>
              {Object.values(m.statusCounts).some(Boolean) ? (
                <StatusDonut counts={m.statusCounts} statuses={meta.statuses} onPick={(s) => router.push(`/admin/crm/leads?tab=mine&status=${s}&view=table`)} />
              ) : (
                <Empty icon={<IconTarget />} title={t("empty")} text={t("emptyText")} />
              )}
            </section>
            <section className="crm-card" aria-labelledby="crm-perf-cy">
              <h3 className="crm-card__h" id="crm-perf-cy">
                <IconTrendingUp aria-hidden="true" />
                {t("cycles")}
              </h3>
              <p className="crm-sub">{t("cyclesLead")}</p>
              <dl className="crm-cyclestats">
                <div>
                  <dt>{t("c.total")}</dt>
                  <dd>{n(m.cycles.total)}</dd>
                </div>
                <div>
                  <dt>{t("c.open")}</dt>
                  <dd>{n(m.cycles.open)}</dd>
                </div>
                <div data-tone="ok">
                  <dt>{t("c.won")}</dt>
                  <dd>{n(m.cycles.won)}</dd>
                </div>
                <div data-tone="bad">
                  <dt>{t("c.rejected")}</dt>
                  <dd>{n(m.cycles.rejected)}</dd>
                </div>
                <div>
                  <dt>{t("c.completed")}</dt>
                  <dd>{n(m.cycles.completed)}</dd>
                </div>
                <div>
                  <dt>{t("c.conversion")}</dt>
                  <dd>{`${fmtNum(m.cycles.conversion, locale, 1)}%`}</dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}
    </>
  );
}
