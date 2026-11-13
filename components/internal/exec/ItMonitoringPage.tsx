"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ApiError, isForbidden } from "@/lib/http";
import { useLoad } from "@/lib/useLoad";
import { humanizeSlug } from "@/lib/lawyers";
import { connectorTone, getItMonitoring, IT_CONNECTOR_ORDER, type ItConnector } from "@/lib/services/executive";
import { IconAlert, IconCheck, IconLock, IconMonitor, IconRefresh } from "@/components/icons";
import { HrmEmpty, HrmError, HrmHead, HrmLoading, HrmPanel, HrmStat, useHrmFormat } from "@/components/internal/HrmUi";
import "@/components/internal/handmade.css";
import "./execHrm.css";

// IT monitoring (contract 2026-11-13 §5): the latest snapshot, open
// incidents and each connector. Technical health lives here, never on the
// CEO page. Shown only when the backend allows it.
const REFRESH_MS = 60_000;

export default function ItMonitoringPage() {
  const t = useTranslations("exec.it");
  const f = useHrmFormat();
  const res = useLoad((signal) => getItMonitoring(signal), []);
  const { reload } = res;
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [reload]);

  const d = res.data;
  const err = res.status === "error" ? res.error : null;
  const denied = !!err && isForbidden(err) && (!(err instanceof ApiError) || !err.code || err.code === "it_monitoring_permission_required");
  const name = (c: ItConnector) => (t.has(`connector.${c.key}`) ? t(`connector.${c.key}`) : humanizeSlug(c.key));
  const status = (s: string) => (s ? (t.has(`status.${s.toLowerCase()}`) ? t(`status.${s.toLowerCase()}`) : humanizeSlug(s)) : t("status.unknown"));
  const healthy = d ? d.connectors.filter((c) => connectorTone(c.status) === "ok").length : 0;
  // Every documented connector has a card, even before the backend lists it.
  const cards: ItConnector[] = d
    ? [...d.connectors, ...IT_CONNECTOR_ORDER.filter((k) => !d.connectors.some((c) => c.key === k)).map((key) => ({ key, status: "", latencyMs: null, detail: "", checkedAt: "" }))]
    : [];

  if (denied) {
    return (
      <section className="hrm-page">
        <HrmHead title={t("title")} />
        <HrmEmpty icon={IconLock} title={t("denied.title")} text={t("denied.text")} />
      </section>
    );
  }

  return (
    <section className="hrm-page">
      <HrmHead
        title={t("title")}
        lead={t("lead")}
        meta={d?.snapshotAt ? <span className="hrm-muted">{t("snapshot", { at: f.dateTime(d.snapshotAt) })}</span> : null}
        actions={
          <button className="btn btn--line btn--sm" type="button" onClick={reload} disabled={res.refreshing} aria-busy={res.refreshing || undefined}>
            <IconRefresh className={res.refreshing ? "mk-spin" : undefined} />
            {t("refresh")}
          </button>
        }
      />
      {err && d ? <HrmError text={t("stale")} onRetry={reload} retryLabel={t("refresh")} /> : null}
      {res.status === "loading" ? (
        <HrmPanel><HrmLoading rows={6} /></HrmPanel>
      ) : !d ? (
        <HrmError text={t("failed")} onRetry={reload} retryLabel={t("refresh")} />
      ) : (
        <>
          <div className="hrm-stats exh-stats">
            <HrmStat icon={IconCheck} tone="ok" label={t("healthy")} value={`${healthy} / ${cards.length}`} />
            <HrmStat icon={IconAlert} tone={d.incidents.length ? "err" : "ok"} label={t("incidentsOpen")} value={d.incidents.length} />
          </div>
          <HrmPanel title={t("connectors")} icon={IconMonitor}>
            <ul className="exh-conn">
              {cards.map((c) => {
                const tone = connectorTone(c.status);
                return (
                  <li key={c.key} className={`exh-conn__i is-${tone}`}>
                    <span className="exh-dot" aria-hidden="true" />
                    <div>
                      <b>{name(c)}</b>
                      <span className="exh-conn__s">{status(c.status)}</span>
                      {c.latencyMs !== null ? <small>{t("latency", { ms: Math.round(c.latencyMs) })}</small> : null}
                      {c.detail ? <small className="exh-conn__d">{c.detail}</small> : null}
                      {c.checkedAt ? <small>{t("checked", { at: f.dateTime(c.checkedAt) })}</small> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </HrmPanel>
          <HrmPanel title={t("incidents")} icon={IconAlert} count={d.incidents.length}>
            {d.incidents.length ? (
              <ul className="exh-inc">
                {d.incidents.map((i) => (
                  <li key={i.id || i.title}>
                    <span className={`exh-sev is-${/crit|high|p1|major/i.test(i.severity) ? "bad" : /med|warn|p2/i.test(i.severity) ? "warn" : "info"}`}>{i.severity ? (t.has(`severity.${i.severity.toLowerCase()}`) ? t(`severity.${i.severity.toLowerCase()}`) : humanizeSlug(i.severity)) : t("severity.unknown")}</span>
                    <div>
                      <b>{i.title || t("untitled")}</b>
                      <small>
                        {[i.component ? (t.has(`connector.${i.component}`) ? t(`connector.${i.component}`) : humanizeSlug(i.component)) : "", i.openedAt ? t("opened", { at: f.dateTime(i.openedAt) }) : ""].filter(Boolean).join(" · ")}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <HrmEmpty icon={IconCheck} title={t("noIncidents")} text={t("noIncidentsText")} />
            )}
          </HrmPanel>
        </>
      )}
    </section>
  );
}
