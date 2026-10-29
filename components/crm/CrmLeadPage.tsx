"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconAlert, IconArrowRight, IconClock, IconFlame, IconMapPin, IconRefresh } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { crmNextStatuses, isFinalStatus, journeyOf, getCrmLead, isClaimRace, isCrmDenied, isVersionConflict, leadCan, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { useCrmEvents, useNow } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Empty, StatusIcon, StatusPill, WhenChip, statusVar, useCrmError, useStatusLabel } from "./bits";
import { LeadSide } from "./LeadSide";
import { LeadTimeline } from "./LeadTimeline";
import { CopilotPanel } from "./CopilotPanel";
import { StatusSheet } from "./LeadSheets";

export type LeadWrite = (run: (lead: CrmLead) => Promise<CrmLead | null | void>, okText?: string) => Promise<boolean>;

export default function CrmLeadPage({ leadId }: { leadId: string }): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame section="leads" title={t("lead.title")} back={{ href: "/admin/crm/leads", label: t("lead.back") }}>
      {(api) => <Workspace meta={api.meta} leadId={leadId} />}
    </CrmFrame>
  );
}

function Workspace({ meta, leadId }: { meta: CrmMeta; leadId: string }): ReactElement {
  const t = useTranslations("crm.lead");
  const crmErr = useCrmError();
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [conflict, setConflict] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);
  const [aiKey, setAiKey] = useState(0);
  const [tab, setTab] = useState<"info" | "timeline" | "ai">("timeline");
  const leadRef = useRef<CrmLead | null>(null);
  useEffect(() => {
    leadRef.current = lead;
  }, [lead]);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const l = await getCrmLead(leadId, signal);
        setLead(l);
        setLoadErr(null);
        return l;
      } catch (e) {
        if (!isAborted(e)) {
          logApiError("crm.lead", e);
          setLoadErr(e);
        }
        return null;
      }
    },
    [leadId],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void reload(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [reload]);

  // One way to write: the latest lock_version goes along; on a version
  // conflict the lead reloads and the operator retries on fresh data, with
  // whatever they typed kept in the sheet (§4.4).
  const write: LeadWrite = useCallback(
    async (run, okText) => {
      const cur = leadRef.current;
      if (!cur) return false;
      try {
        const next = await run(cur);
        if (next && next.id) setLead(next);
        else await reload();
        setConflict(false);
        setTimelineKey((k) => k + 1);
        if (okText) toast(okText, { tone: "ok" });
        return true;
      } catch (e) {
        // Someone else claimed it: reload, never show it as ours.
        if (isClaimRace(e)) {
          toast(crmErr(e), { tone: "err" });
          await reload();
          return false;
        }
        if (isVersionConflict(e)) {
          setConflict(true);
          await reload();
          return false;
        }
        toast(crmErr(e), { tone: "err" });
        return false;
      }
    },
    [reload, crmErr],
  );

  useCrmEvents((ev) => {
    if (ev.invalidate.includes("all") || (ev.leadId === leadId && ev.invalidate.includes("lead"))) {
      void reload();
      setTimelineKey((k) => k + 1);
    }
    if (ev.invalidate.includes("ai") && (!ev.leadId || ev.leadId === leadId)) setAiKey((k) => k + 1);
  });

  if (loadErr && !lead) {
    return (
      <div className="crm-card">
        <Empty
          icon={<IconAlert />}
          title={isCrmDenied(loadErr) ? t("denied") : t("loadFailed")}
          text={crmErr(loadErr)}
          action={
            <Link href="/admin/crm/leads" className="crm-btn">
              {t("back")}
            </Link>
          }
        />
      </div>
    );
  }
  if (!lead) {
    return (
      <>
        <span className="crm-sk crm-sk--block" style={{ height: 160 }} />
        <div className="crm-ws">
          <span className="crm-sk crm-sk--block" style={{ height: 320 }} />
          <span className="crm-sk crm-sk--block" style={{ height: 420 }} />
          <span className="crm-sk crm-sk--block" style={{ height: 380 }} />
        </div>
      </>
    );
  }
  return (
    <>
      <LeadHead meta={meta} lead={lead} write={write} />
      {conflict ? (
        <div className="crm-banner crm-banner--warn" role="alert">
          <IconRefresh aria-hidden="true" />
          <span>
            <b>{t("conflict")}</b>
            {t("conflictText")}
          </span>
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => setConflict(false)}>
            {t("gotIt")}
          </button>
        </div>
      ) : null}
      <div className="crm-ws__tabs crm-tabs" role="tablist" aria-label={t("sections")}>
        {(["info", "timeline", "ai"] as const).map((k) => (
          <button key={k} type="button" role="tab" className="crm-tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`tab.${k}`)}
          </button>
        ))}
      </div>
      <div className="crm-ws" data-tab={tab}>
        <div className="crm-ws__col crm-ws__side">
          <LeadSide meta={meta} lead={lead} write={write} />
        </div>
        <div className="crm-ws__col crm-ws__main">
          <LeadTimeline lead={lead} write={write} refreshKey={timelineKey} onAdded={() => setTimelineKey((k) => k + 1)} />
        </div>
        <div className="crm-ws__col crm-ws__ai">{leadCan(lead, "run_ai") ? <CopilotPanel meta={meta} lead={lead} write={write} refreshKey={aiKey} /> : null}</div>
      </div>
    </>
  );
}

// The banner: who, what, the journey, and only the moves the backend allows.
function LeadHead({ meta, lead, write }: { meta: CrmMeta; lead: CrmLead; write: LeadWrite }): ReactElement {
  const t = useTranslations("crm.lead");
  const ts = useStatusLabel();
  const tsc = useTranslations("crm.score");
  const locale = useLocale();
  const now = useNow();
  const [to, setTo] = useState("");
  // The open columns in the backend's order, then where the lead ended
  // (or the first final column, as the goal).
  const journey = journeyOf(meta, lead.status);
  const at = journey.indexOf(lead.status);
  const ended = isFinalStatus(meta, lead.status);
  const moves = leadCan(lead, "change_status") ? crmNextStatuses(meta, lead.status) : [];
  return (
    <section className="crm-lhead" aria-labelledby="crm-lead-title">
      <div className="crm-lhead__top">
        <span className="crm-code">{lead.workId}</span>
        <StatusPill status={lead.status} />
      </div>
      <h1 id="crm-lead-title">{lead.title || lead.workId}</h1>
      <div className="crm-lhead__meta">
        {lead.score ? (
          <span>
            <IconFlame aria-hidden="true" />
            {tsc.has(lead.score) ? tsc(lead.score) : lead.score}
          </span>
        ) : null}
        {lead.region ? (
          <span>
            <IconMapPin aria-hidden="true" />
            {lead.region}
          </span>
        ) : null}
        {lead.urgency ? (
          <span>
            <IconAlert aria-hidden="true" />
            {t.has(`urg.${lead.urgency}`) ? t(`urg.${lead.urgency}`) : lead.urgency}
          </span>
        ) : null}
        <span data-tone={lead.nextActionAt && now && Date.parse(lead.nextActionAt) < now ? "bad" : undefined}>
          <IconClock aria-hidden="true" />
          {lead.nextActionAt ? (
            <>
              {t("nextAt", { time: shortDateTime(lead.nextActionAt, locale) })} <WhenChip at={lead.nextActionAt} now={now} />
            </>
          ) : (
            t("noNext")
          )}
        </span>
      </div>
      <ol className="crm-stepper" aria-label={t("journey")}>
        {journey.map((s, i) => {
          const state = i < at ? "done" : i === at ? (ended ? "end" : "now") : "todo";
          return (
            <li key={s} data-state={state} style={statusVar(s)} aria-current={i === at ? "step" : undefined}>
              <i aria-hidden="true">
                <StatusIcon status={s} />
              </i>
              {ts(s)}
            </li>
          );
        })}
      </ol>
      {moves.length ? (
        <div className="crm-moves" role="group" aria-label={t("nextMoves")}>
          {moves.map((s) => (
            <button key={s} type="button" className="crm-move" style={statusVar(s)} onClick={() => setTo(s)}>
              <i aria-hidden="true" />
              {ts(s)}
              <IconArrowRight aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
      {to ? <StatusSheet lead={lead} to={to} write={write} onClose={() => setTo("")} /> : null}
    </section>
  );
}
