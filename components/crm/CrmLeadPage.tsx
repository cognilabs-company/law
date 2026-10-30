"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import Modal from "@/components/admin/Modal";
import { IconAlert, IconArrowRight, IconChat, IconHistory, IconLayers, IconPhone, IconRefresh } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { getCrmLead, isClaimRace, isCrmDenied, isVersionConflict, leadCan, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Empty, useCrmError, useStatusLabel } from "./bits";
import { LeadSide } from "./LeadSide";
import { LeadTimeline } from "./LeadTimeline";
import { CopilotPanel } from "./CopilotPanel";
import { LeadGlance } from "./LeadGlance";
import { LeadHistory } from "./LeadHistory";
import { LeadCalls } from "./LeadCalls";
import { LeadSms } from "./LeadSms";

type Pane = "timeline" | "history" | "calls" | "sms";
const PANES: Pane[] = ["timeline", "history", "calls", "sms"];
const PANE_ICON = { timeline: IconLayers, history: IconHistory, calls: IconPhone, sms: IconChat } as const;

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
  // A stale write (§3, §22): both copies, so the operator sees what changed.
  const [conflict, setConflict] = useState<{ mine: CrmLead; fresh: CrmLead | null } | null>(null);
  // §9: timeline, cycles, calls and SMS; ?pane= opens one directly.
  const params = useSearchParams();
  const [pane, setPane] = useState<Pane>(() => (PANES.includes(params.get("pane") as Pane) ? (params.get("pane") as Pane) : "timeline"));
  // A draft the AI Copilot handed to the SMS pane.
  const [smsPreset, setSmsPreset] = useState("");
  const [timelineKey, setTimelineKey] = useState(0);
  const [aiKey, setAiKey] = useState(0);
  // On a phone: the work (timeline and panes) or the details.
  const [tab, setTab] = useState<"info" | "timeline">("timeline");
  // "Write the call result": the composer opens on that type, focused.
  const [callFocus, setCallFocus] = useState(0);
  // The AI Copilot lives behind one button, in a drawer.
  const [aiOpen, setAiOpen] = useState(false);
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
          const fresh = await reload();
          setConflict({ mine: cur, fresh });
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
      <LeadGlance
        meta={meta}
        lead={lead}
        write={write}
        onCallResult={() => {
          setTab("timeline");
          setPane("timeline");
          setCallFocus((n) => n + 1);
        }}
        onAi={leadCan(lead, "run_ai") ? () => setAiOpen(true) : undefined}
      />
      {aiOpen ? (
        <Modal open onClose={() => setAiOpen(false)} variant="drawer" title={t("aiTitle")} size="lg">
          <div className="crm-pop crm-aidrawer">
            <CopilotPanel
              meta={meta}
              lead={lead}
              write={write}
              refreshKey={aiKey}
              onSmsDraft={(text) => {
                setSmsPreset(text);
                setPane("sms");
                setTab("timeline");
                setAiOpen(false);
              }}
            />
          </div>
        </Modal>
      ) : null}
      {conflict ? <ConflictDialog mine={conflict.mine} fresh={conflict.fresh} onClose={() => setConflict(null)} /> : null}
      <div className="crm-ws__tabs crm-tabs" role="tablist" aria-label={t("sections")}>
        {(["timeline", "info"] as const).map((k) => (
          <button key={k} type="button" role="tab" className="crm-tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`tab.${k}`)}
          </button>
        ))}
      </div>
      <div className="crm-ws" data-tab={tab}>
        <div className="crm-ws__col crm-ws__main">
          <div className="crm-panes" role="tablist" aria-label={t("panes")}>
            {PANES.map((k) => {
              const Icon = PANE_ICON[k];
              return (
                <button key={k} type="button" role="tab" aria-selected={pane === k} onClick={() => setPane(k)}>
                  <Icon aria-hidden="true" />
                  {t(`pane.${k}`, { n: lead.cycleNumber })}
                </button>
              );
            })}
          </div>
          {pane === "timeline" ? (
            <LeadTimeline lead={lead} write={write} refreshKey={timelineKey} onAdded={() => setTimelineKey((k) => k + 1)} callFocus={callFocus} />
          ) : pane === "history" ? (
            <LeadHistory lead={lead} />
          ) : pane === "calls" ? (
            <LeadCalls meta={meta} lead={lead} />
          ) : (
            <LeadSms meta={meta} lead={lead} preset={smsPreset} onPresetUsed={() => setSmsPreset("")} />
          )}
        </div>
        <div className="crm-ws__col crm-ws__side">
          <LeadSide meta={meta} lead={lead} write={write} />
        </div>
      </div>
    </>
  );
}

// A stale write never overwrites silently (§3, §22): what the other user
// changed, side by side; the operator's own typing stays in its sheet.
function ConflictDialog({ mine, fresh, onClose }: { mine: CrmLead; fresh: CrmLead | null; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.lead");
  const ts = useStatusLabel();
  const locale = useLocale();
  const when = (v: string) => (v ? shortDateTime(v, locale) : t("none"));
  const urg = (v: string) => (v && t.has(`urg.${v}`) ? t(`urg.${v}`) : "");
  const rows = fresh
    ? ([
        [t("cf.status"), ts(mine.status), ts(fresh.status)],
        [t("cf.operator"), mine.operator?.name || t("none"), fresh.operator?.name || t("none")],
        [t("cf.next"), when(mine.nextActionAt), when(fresh.nextActionAt)],
        [t("cf.title"), mine.title, fresh.title],
        [t("cf.urgency"), urg(mine.urgency), urg(fresh.urgency)],
        [t("cf.region"), mine.region, fresh.region],
      ] as [string, string, string][]).filter(([, a, b]) => a !== b)
    : [];
  return (
    <Modal
      open
      onClose={onClose}
      title={t("conflict")}
      description={t("conflictText")}
      icon={<IconRefresh />}
      footer={
        <button type="button" className="crm-btn crm-btn--pri" onClick={onClose}>
          {t("gotIt")}
        </button>
      }
    >
      <div className="crm-pop">
        {rows.length ? (
          <ul className="crm-conflict">
            {rows.map(([k, a, b]) => (
              <li key={k}>
                <small>{k}</small>
                <del>{a || t("none")}</del>
                <IconArrowRight aria-hidden="true" />
                <ins>{b || t("none")}</ins>
              </li>
            ))}
          </ul>
        ) : (
          <p className="crm-sub">{t("conflictSame")}</p>
        )}
      </div>
    </Modal>
  );
}
