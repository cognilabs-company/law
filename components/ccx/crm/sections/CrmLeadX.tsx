"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { statusColorVars } from "@/components/crm/bits";
import { getCrmCustomer, getCrmLead, isClaimRace, isCrmDenied, isVersionConflict, leadCan, type CrmContact, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { useCrmEvents, useNow } from "@/lib/crm/useCrm";
import { IcArrowLeft } from "../../icons";
import { crmHref, type CrmSectionProps } from "../nav";
import { ConvertCard } from "../detail/convert";
import { IcAlert } from "../detail/glyphs";
import { AiSheet } from "../detail/leadAi";
import { CustomerCard, DupCard, ExtraCard, NeedCard, NextCard, StatusHistoryCard, useLeadHistory } from "../detail/leadCards";
import { FeedCard, PANES, type Pane } from "../detail/leadFeed";
import { LeadHead } from "../detail/leadHead";
import { AssignSheet, ConflictSheet, DuplicateSheet, EditSheet, NextSheet, ReopenSheet, StatusSheet, WatcherSheet } from "../detail/leadSheets";
import { Empty, Shim } from "../detail/kit";
import type { LeadSheetKind, LeadWrite } from "../detail/types";
import { useCrmErr } from "../leads/util";

export default function CrmLeadX({ meta }: CrmSectionProps) {
  const params = useSearchParams();
  const id = params.get("lead") ?? "";
  const asked = params.get("pane");
  const pane: Pane = PANES.includes(asked as Pane) ? (asked as Pane) : "timeline";
  return <Workspace key={`${id}:${pane}`} meta={meta} leadId={id} startPane={pane} />;
}

function Workspace({ meta, leadId, startPane }: { meta: CrmMeta; leadId: string; startPane: Pane }) {
  const t = useTranslations("crm.lead");
  const crmErr = useCrmErr();
  const now = useNow();
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [conflict, setConflict] = useState<{ mine: CrmLead; fresh: CrmLead | null } | null>(null);
  const [pane, setPane] = useState<Pane>(startPane);
  const [smsPreset, setSmsPreset] = useState("");
  const [timelineKey, setTimelineKey] = useState(0);
  const [aiKey, setAiKey] = useState(0);
  const [callFocus, setCallFocus] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [sheet, setSheet] = useState<LeadSheetKind>("");
  const [to, setTo] = useState("");
  const [dupPreset, setDupPreset] = useState<"duplicate" | "not_duplicate">("not_duplicate");
  const [cust, setCust] = useState<{ id: string; contacts: CrmContact[] } | null>(null);
  const [custKey, setCustKey] = useState(0);
  const leadRef = useRef<CrmLead | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
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

  const customerId = lead?.customerId ?? "";
  useEffect(() => {
    if (!customerId) return;
    const ctl = new AbortController();
    getCrmCustomer(customerId, ctl.signal).then(
      (d) => setCust({ id: customerId, contacts: d.contacts.filter((x) => x.status !== "archived") }),
      (e) => {
        if (isAborted(e)) return;
        logApiError("crm.lead.customer", e);
        setCust({ id: customerId, contacts: [] });
      },
    );
    return () => ctl.abort();
  }, [customerId, custKey]);

  const scrolled = useRef(false);
  const hasLead = !!lead;
  useEffect(() => {
    if (!hasLead || scrolled.current || (startPane !== "calls" && startPane !== "sms")) return;
    scrolled.current = true;
    const id = window.setTimeout(() => feedRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
    return () => window.clearTimeout(id);
  }, [hasLead, startPane]);

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
    if (customerId && (ev.invalidate.includes("all") || (ev.customerId === customerId && ev.invalidate.includes("customer")))) setCustKey((k) => k + 1);
  });

  const history = useLeadHistory(lead ? leadId : "", lead?.lockVersion ?? 0);
  const onPresetUsed = useCallback(() => setSmsPreset(""), []);

  if (loadErr && !lead) {
    return (
      <div className="opx-cd">
        <Empty
          icon={<IcAlert size={22} />}
          title={isCrmDenied(loadErr) ? t("denied") : t("loadFailed")}
          text={crmErr(loadErr)}
          action={
            <Link href={crmHref("leads")} className="opx-pbtn">
              <IcArrowLeft size={16} />
              {t("back")}
            </Link>
          }
        />
      </div>
    );
  }
  if (!lead) {
    return (
      <div className="opx-cd" aria-busy="true">
        <Shim h={150} />
        <div className="opx-cd-grid">
          <div className="opx-cd-col">
            <Shim h={160} />
            <Shim h={360} />
          </div>
          <div className="opx-cd-col">
            <Shim h={200} />
            <Shim h={140} />
          </div>
        </div>
      </div>
    );
  }

  const phones = !lead.customerId ? [] : cust && cust.id === lead.customerId ? cust.contacts.filter((x) => x.type === "phone") : null;
  const contacts = cust && cust.id === lead.customerId ? cust.contacts : null;
  const callResult = () => {
    setPane("timeline");
    setCallFocus((n) => n + 1);
  };

  return (
    <div className="opx-cd opx-cd--lead" style={statusColorVars(meta)}>
      <LeadHead meta={meta} lead={lead} write={write} onSheet={setSheet} onStatus={setTo} onAi={leadCan(lead, "run_ai") ? () => setAiOpen(true) : undefined} />
      <div className="opx-cd-grid">
        <div className="opx-cd-col opx-cd-col--main">
          <div className="opx-cd-m2">
            <NeedCard lead={lead} onEdit={leadCan(lead, "edit") ? () => setSheet("edit") : undefined} />
          </div>
          <div className="opx-cd-m5">
            <ConvertCard lead={lead} onDone={() => void write(async () => null)} />
          </div>
          <div className="opx-cd-m6 opx-cd-anchor" ref={feedRef}>
            <FeedCard
              meta={meta}
              lead={lead}
              write={write}
              pane={pane}
              onPane={setPane}
              refreshKey={timelineKey}
              onAdded={() => setTimelineKey((k) => k + 1)}
              callFocus={callFocus}
              history={history}
              phones={phones}
              smsPreset={smsPreset}
              onPresetUsed={onPresetUsed}
            />
          </div>
        </div>
        <div className="opx-cd-col opx-cd-col--side">
          <div className="opx-cd-m1">
            <CustomerCard lead={lead} contacts={contacts} onCallResult={leadCan(lead, "add_activity") ? callResult : undefined} />
          </div>
          <div className="opx-cd-m3">
            <NextCard lead={lead} now={now} onChange={leadCan(lead, "set_next_action") ? () => setSheet("next") : undefined} />
          </div>
          {lead.duplicateStatus === "needs_review" ? (
            <div className="opx-cd-m4">
              <DupCard
                onDecide={
                  leadCan(lead, "resolve_duplicate") || leadCan(lead, "edit")
                    ? (d) => {
                        setDupPreset(d);
                        setSheet("dup");
                      }
                    : undefined
                }
              />
            </div>
          ) : null}
          <div className="opx-cd-m7">
            <StatusHistoryCard history={history} />
          </div>
          <div className="opx-cd-m8">
            <ExtraCard lead={lead} />
          </div>
        </div>
      </div>

      {to ? <StatusSheet meta={meta} lead={lead} to={to} write={write} onClose={() => setTo("")} /> : null}
      {sheet === "next" ? <NextSheet lead={lead} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "reopen" ? <ReopenSheet meta={meta} lead={lead} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "edit" ? <EditSheet meta={meta} lead={lead} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "assign" || sheet === "transfer" ? <AssignSheet lead={lead} mode={sheet} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "watchers" ? <WatcherSheet lead={lead} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "dup" ? <DuplicateSheet lead={lead} write={write} preset={dupPreset} onClose={() => setSheet("")} /> : null}
      {aiOpen ? (
        <AiSheet
          meta={meta}
          lead={lead}
          write={write}
          refreshKey={aiKey}
          onClose={() => setAiOpen(false)}
          onSmsDraft={(text) => {
            setSmsPreset(text);
            setPane("sms");
            setAiOpen(false);
          }}
        />
      ) : null}
      {conflict ? <ConflictSheet mine={conflict.mine} fresh={conflict.fresh} onClose={() => setConflict(null)} /> : null}
    </div>
  );
}
