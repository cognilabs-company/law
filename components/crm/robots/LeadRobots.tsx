"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bot, ClipboardCheck, ListChecks } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { listApprovalDrafts, listAutomationRunsX, type ApprovalDraft, type AutomationRunX } from "@/lib/services/crmAutomation";
import { useCrmEvents } from "@/lib/crm/useCrm";
import { actionLabel, statusTone, useCatalog, useRunStatus } from "./shared";

// A lead's robots (ROP contract §24 lead detail): the drafts robots
// prepared for this lead and wait for approval, and the robot run history.

export function useLeadDrafts(leadId: string, enabled: boolean): number {
  const [n, setN] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    listApprovalDrafts({ status: "pending_approval", leadId, limit: 1 }, ctl.signal).then(
      (r) => setN(r.total),
      (e) => !isAborted(e) && logApiError("crm.lead.drafts", e),
    );
    return () => ctl.abort();
  }, [leadId, enabled, tick]);
  useCrmEvents((ev) => {
    if (enabled && (ev.invalidate.includes("all") || (ev.invalidate.includes("automation") && (!ev.leadId || ev.leadId === leadId)))) setTick((x) => x + 1);
  });
  return n;
}

export function LeadRobots({ leadId }: { leadId: string }): ReactElement {
  const t = useTranslations("rop.leadRobots");
  const locale = useLocale();
  const st = useRunStatus();
  const { data: catalog } = useCatalog();
  const [runs, setRuns] = useState<AutomationRunX[] | null>(null);
  const [drafts, setDrafts] = useState<ApprovalDraft[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    Promise.allSettled([listAutomationRunsX({ leadId, limit: 20 }, ctl.signal), listApprovalDrafts({ status: "pending_approval", leadId, limit: 20 }, ctl.signal)]).then(([r, d]) => {
      if (r.status === "fulfilled") setRuns(r.value.items);
      else if (!isAborted(r.reason)) {
        logApiError("crm.lead.runs", r.reason);
        setRuns([]);
      }
      if (d.status === "fulfilled") setDrafts(d.value.items);
      else if (!isAborted(d.reason)) setDrafts([]);
    });
    return () => ctl.abort();
  }, [leadId, tick]);
  useCrmEvents((ev) => {
    if (ev.invalidate.includes("all") || (ev.invalidate.includes("automation") && (!ev.leadId || ev.leadId === leadId))) setTick((x) => x + 1);
  });
  const id = encodeURIComponent(leadId);
  return (
    <div className="rb-lead" data-lead-robots="">
      <section className="crm-card">
        <div className="rop-card__h">
          <h3 className="rop-h2" style={{ fontSize: "1rem" }}><ClipboardCheck aria-hidden="true" />{t("drafts")}</h3>
          {drafts?.length ? <Link href={`/admin/crm/automation/drafts?lead=${id}`} className="crm-btn crm-btn--pri">{t("review", { n: drafts.length })}</Link> : null}
        </div>
        {!drafts ? <span className="rop-sk" /> : drafts.length ? (
          <ul className="rop-list">
            {drafts.map((d) => (
              <li key={d.id} className="rop-row" style={{ cursor: "default" }}>
                <span className="rop-ic" data-tone="warn"><ClipboardCheck /></span>
                <span className="rop-row__b">
                  <b>{d.title || actionLabel(catalog, d.type)}</b>
                  <small>{[d.ruleName, d.createdAt ? fmtDateTime(d.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="rop-pill rop-pill--warn">{st(d.status)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rop-muted">{t("noDrafts")}</p>
        )}
      </section>
      <section className="crm-card">
        <div className="rop-card__h">
          <h3 className="rop-h2" style={{ fontSize: "1rem" }}><Bot aria-hidden="true" />{t("runs")}</h3>
          <Link href={`/admin/crm/automation/runs?lead=${id}`} className="crm-btn"><ListChecks aria-hidden="true" />{t("allRuns")}</Link>
        </div>
        {!runs ? <span className="rop-sk" /> : runs.length ? (
          <ul className="rop-list">
            {runs.map((r) => (
              <li key={r.id}>
                <Link className="rop-row" href={`/admin/crm/automation/runs?lead=${id}&run=${encodeURIComponent(r.id)}`}>
                  <span className="rop-ic" data-tone={statusTone(r.status) || undefined}><Bot /></span>
                  <span className="rop-row__b">
                    <b>{r.ruleName || t("robot")}</b>
                    <small>{[r.startedAt || r.scheduledAt ? fmtDateTime(r.startedAt || r.scheduledAt, locale) : "", r.error].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className={`rop-pill${statusTone(r.status) ? ` rop-pill--${statusTone(r.status)}` : ""}`}>{st(r.status)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rop-muted">{t("noRuns")}</p>
        )}
      </section>
    </div>
  );
}
