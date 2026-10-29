"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAlert, IconCheck, IconMic, IconPhone, IconRefresh, IconSend, IconSparkle, IconUser } from "@/components/icons";
import CheckBox from "@/components/CheckBox";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import {
  CALL_END_STATUSES,
  aiCardsOf,
  appendTranscript,
  callEnded,
  completeCall,
  crmCan,
  crmCode,
  crmField,
  getAiRun,
  getCrmCustomer,
  leadCan,
  listLeadCalls,
  startLeadCall,
  type CallSegment,
  type CrmAiRun,
  type CrmCall,
  type CrmContact,
  type CrmLead,
  type CrmMeta,
} from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import { Empty, useCrmError } from "./bits";
import { CrmSelect } from "./fields";
import { pathKey, textOf } from "./CopilotPanel";

// A lead's calls (contract 13cb257 §14): start one on a phone contact (the
// backend refuses without one), read the Uzbek recording-consent text it
// returns to the customer, write the live transcript segment by segment
// with optional AI assist (never two at once), and complete it as
// completed / no answer / failed / cancelled with a summary. A no-answer
// call sends the standard SMS after the configured delay unless a later
// call is answered first.
export function LeadCalls({ meta, lead }: { meta: CrmMeta; lead: CrmLead }): ReactElement {
  const t = useTranslations("crm.calls");
  const locale = useLocale();
  const crmErr = useCrmError();
  const tel = meta.telephony;
  const recordings = crmCan(meta, "crm.calls.recordings.view");
  const canStart = leadCan(lead, "start_call") && crmCan(meta, "crm.calls.start");
  const [calls, setCalls] = useState<CrmCall[] | null>(null);
  const [err, setErr] = useState("");
  const [phones, setPhones] = useState<CrmContact[] | null>(null);
  const [contact, setContact] = useState("");
  const [purpose, setPurpose] = useState("");
  const [starting, setStarting] = useState(false);
  const [bad, setBad] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setCalls(await listLeadCalls(lead.id, recordings, signal));
        setErr("");
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.calls", e);
        setErr(crmErr(e));
      }
    },
    [lead.id, recordings, crmErr],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);
  useEffect(() => {
    if (!lead.customerId) return;
    const ctl = new AbortController();
    getCrmCustomer(lead.customerId, ctl.signal).then(
      (c) => {
        const list = c.contacts.filter((x) => x.type === "phone" && x.status !== "archived");
        setPhones(list);
        setContact((cur) => cur || list.find((x) => x.primary)?.id || list[0]?.id || "");
      },
      (e) => {
        if (!isAborted(e)) logApiError("crm.calls.contacts", e);
        setPhones([]);
      },
    );
    return () => ctl.abort();
  }, [lead.customerId]);
  useCrmEvents((ev) => {
    if (ev.invalidate.includes("all") || ((ev.invalidate.includes("call") || ev.name === "crm.call.completed") && (ev.leadId === lead.id || (ev.callId && calls?.some((c) => c.id === ev.callId))))) void load();
  });

  const start = async () => {
    if (starting || !contact) return;
    setStarting(true);
    try {
      const c = await startLeadCall(lead.id, { contactId: contact, purpose }, recordings);
      setCalls((cur) => [c, ...(cur ?? []).filter((x) => x.id !== c.id)]);
      setPurpose("");
      setBad("");
    } catch (e) {
      setBad(crmField(e) || (crmCode(e) === "crm_phone_contact_required" ? "contact_id" : ""));
      toast(crmErr(e), { tone: "err" });
    } finally {
      setStarting(false);
    }
  };
  const replace = (c: CrmCall) => setCalls((cur) => (cur ?? []).map((x) => (x.id === c.id ? { ...x, ...c } : x)));
  const active = (calls ?? []).find((c) => !callEnded(c));
  const past = (calls ?? []).filter((c) => callEnded(c));

  return (
    <div className="crm-callpane">
      <p className="crm-telline" data-on={tel.enabled || undefined}>
        <IconPhone aria-hidden="true" />
        <span>{tel.enabled ? t("telOn") : t("telOff")}</span>
        {tel.liveTranscription ? <em>{t("liveOn")}</em> : null}
      </p>

      {canStart && !active ? (
        <section className="crm-card crm-callstart" aria-labelledby="crm-cs-t">
          <h4 className="crm-card__h" id="crm-cs-t">
            <IconPhone aria-hidden="true" />
            {t("startTitle")}
          </h4>
          {phones === null ? (
            <span className="crm-sk" />
          ) : phones.length ? (
            <>
              <div className="crm-row2">
                <div className="crm-field" data-err={bad === "contact_id" ? "" : undefined}>
                  <span>{t("contact")}</span>
                  <CrmSelect value={contact} onChange={setContact} label={t("contact")} options={phones.map((p) => ({ value: p.id, label: [p.value, p.label].filter(Boolean).join(" · ") }))} />
                </div>
                <label className="crm-field">
                  <span>{t("purpose")}</span>
                  <input className="crm-input" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} placeholder={t("purposePh")} />
                </label>
              </div>
              {tel.recordingConsentRequired ? <p className="crm-sub">{t("consentFirst")}</p> : null}
              <button type="button" className="crm-btn crm-btn--pri" onClick={() => void start()} disabled={starting || !contact} aria-busy={starting || undefined} style={{ justifySelf: "start" }}>
                <IconPhone aria-hidden="true" />
                {t("start")}
              </button>
            </>
          ) : (
            <p className="crm-note">
              <IconAlert aria-hidden="true" />
              {t("needPhone")}
            </p>
          )}
        </section>
      ) : null}

      {active ? <ActiveCall meta={meta} call={active} onChange={replace} /> : null}

      {err && !calls ? (
        <div className="crm-err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{err}</span>
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => void load()}>
            <IconRefresh aria-hidden="true" />
            {t("retry")}
          </button>
        </div>
      ) : calls === null ? (
        <span className="crm-sk crm-sk--block" style={{ height: 90 }} />
      ) : !past.length && !active ? (
        <Empty icon={<IconPhone />} title={t("none")} text={canStart ? t("noneText") : undefined} />
      ) : past.length ? (
        <ol className="crm-calllog">
          {past.map((c) => (
            <li key={c.id} data-s={c.status}>
              <i aria-hidden="true">
                <IconPhone />
              </i>
              <span>
                <b>{t(`s.${t.has(`s.${c.status}`) ? c.status : "other"}`)}</b>
                <small>{[t(`dir.${c.direction === "inbound" ? "inbound" : "outbound"}`), c.durationSec ? t("dur", { m: Math.floor(c.durationSec / 60), s: c.durationSec % 60 }) : "", c.createdAt ? shortDateTime(c.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                {c.purpose ? <small>{c.purpose}</small> : null}
                {c.summary ? <p>{c.summary}</p> : null}
                {c.status === "no_answer" ? <small className="crm-muted">{t("noAnswerSms", { n: meta.noAnswerSmsDelaySec ?? 180 })}</small> : null}
                {c.transcript.length ? (
                  <details className="crm-transcript">
                    <summary>{t("transcriptN", { n: c.transcript.length })}</summary>
                    <Transcript segments={c.transcript} />
                  </details>
                ) : null}
              </span>
              {recordings && c.recordingUrl ? (
                <a className="crm-btn crm-btn--sm" href={c.recordingUrl} target="_blank" rel="noreferrer">
                  {t("recording")}
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function Transcript({ segments }: { segments: CallSegment[] }): ReactElement {
  const t = useTranslations("crm.calls");
  return (
    <ol className="crm-tscript">
      {segments.map((s, i) => (
        <li key={i} data-who={s.speaker === "operator" ? "operator" : "customer"}>
          <small>{s.speaker === "operator" ? t("who.operator") : t("who.customer")}</small>
          <span>{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

// The call in progress: the consent text to read out, the live transcript
// with AI assist, and the completion form.
function ActiveCall({ meta, call, onChange }: { meta: CrmMeta; call: CrmCall; onChange: (c: CrmCall) => void }): ReactElement {
  const t = useTranslations("crm.calls");
  const tc = useTranslations("crm.ai");
  const crmErr = useCrmError();
  const recordings = crmCan(meta, "crm.calls.recordings.view");
  const [segments, setSegments] = useState<CallSegment[]>(call.transcript);
  const [who, setWho] = useState<"customer" | "operator">("customer");
  const [text, setText] = useState("");
  const [assist, setAssist] = useState(true);
  const [sending, setSending] = useState(false);
  const [runId, setRunId] = useState(call.aiRunId);
  const [run, setRun] = useState<CrmAiRun | null>(null);
  const [status, setStatus] = useState<string>("completed");
  const [summary, setSummary] = useState("");
  const [closing, setClosing] = useState(false);
  const [tried, setTried] = useState(false);
  // Started on the first segment, so times are relative to the call.
  const [t0] = useState(() => Date.now());
  const assisting = !!runId && (!run || run.status === "queued" || run.status === "running");

  const fetchRun = useCallback(async (id: string) => {
    try {
      setRun(await getAiRun(id));
    } catch (e) {
      if (!isAborted(e)) logApiError("crm.calls.assist", e);
    }
  }, []);
  useCrmEvents((ev) => {
    if (runId && ev.runId === runId && (ev.name === "crm.ai.completed" || ev.name === "crm.ai.failed")) void fetchRun(runId);
    if (ev.callId === call.id && ev.name === "crm.call.transcript_updated") onChange({ ...call });
  });

  const send = async () => {
    const line = text.trim();
    if (!line || sending) return;
    setSending(true);
    const now = Date.now() - t0;
    const seg: CallSegment = { speaker: who, text: line, startMs: Math.max(0, now - 3000), endMs: now };
    try {
      // No overlapping live-assist runs: ask only when none is waiting.
      const r = await appendTranscript(call.id, [seg], assist && !assisting);
      setSegments((cur) => [...cur, seg]);
      setText("");
      if (r.aiRunId) {
        setRunId(r.aiRunId);
        setRun(null);
      }
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setSending(false);
    }
  };
  const close = async () => {
    setTried(true);
    if (closing || (status === "completed" && !summary.trim())) return;
    setClosing(true);
    try {
      const c = await completeCall(call.id, status, summary, segments, recordings);
      onChange(c.id ? c : { ...call, status, summary });
      toast(status === "no_answer" ? t("doneNoAnswer", { n: meta.noAnswerSmsDelaySec ?? 180 }) : t("done"), { tone: "ok" });
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setClosing(false);
    }
  };
  const cards = run?.status === "completed" ? aiCardsOf(run.output) : [];

  return (
    <section className="crm-card crm-livecall" aria-labelledby="crm-lc-t">
      <h4 className="crm-card__h" id="crm-lc-t">
        <span className="crm-livedot" aria-hidden="true" />
        {t("active")}
      </h4>
      {call.consentText ? (
        <div className="crm-consent" role="note">
          <b>
            <IconMic aria-hidden="true" />
            {t("consentRead")}
          </b>
          <p lang="uz">{call.consentText}</p>
        </div>
      ) : meta.telephony.recordingConsentRequired ? (
        <p className="crm-note">
          <IconAlert aria-hidden="true" />
          {t("consentMissing")}
        </p>
      ) : null}

      <div className="crm-livegrid">
        <div className="crm-livegrid__t">
          <b className="crm-sub">{t("transcript")}</b>
          {segments.length ? <Transcript segments={segments} /> : <p className="crm-sub">{t("noTranscript")}</p>}
          <div className="crm-seg" role="group" aria-label={t("speaker")}>
            {(["customer", "operator"] as const).map((w) => (
              <button key={w} type="button" aria-pressed={who === w} onClick={() => setWho(w)}>
                <IconUser aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: "-2px", marginRight: 4 }} />
                {t(`who.${w}`)}
              </button>
            ))}
          </div>
          <div className="crm-liveinput">
            <textarea
              className="crm-textarea"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={t("linePh")}
              aria-label={t("line")}
              maxLength={4000}
            />
            <button type="button" className="crm-btn crm-btn--pri" onClick={() => void send()} disabled={sending || !text.trim()} aria-busy={sending || undefined} aria-label={t("add")}>
              <IconSend aria-hidden="true" />
            </button>
          </div>
          <CheckBox checked={assist} onChange={setAssist} disabled={assisting}>
            {assisting ? t("assistBusy") : t("assist")}
          </CheckBox>
        </div>
        <aside className="crm-livegrid__ai" aria-live="polite">
          <b className="crm-sub">
            <IconSparkle aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: "-2px" }} /> {t("aiTitle")}
          </b>
          {assisting ? (
            <p className="crm-think__line">
              <i aria-hidden="true">
                <b />
                <b />
                <b />
              </i>
              {t("aiThinking")}
            </p>
          ) : run?.status === "failed" ? (
            <p className="crm-err">{run.error || t("aiFailed")}</p>
          ) : cards.length ? (
            <ul className="crm-assist">
              {cards.map((c) => (
                <li key={c.path}>
                  <small>{tAi(c.path)}</small>
                  <span>{textOf(c.value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crm-sub">{t("aiIdle")}</p>
          )}
          <small className="crm-muted">{t("aiAdvice")}</small>
        </aside>
      </div>

      <div className="crm-callend">
        <div className="crm-seg" role="group" aria-label={t("endAs")}>
          {CALL_END_STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {t(`s.${s}`)}
            </button>
          ))}
        </div>
        <label className="crm-field" data-err={tried && status === "completed" && !summary.trim() ? "" : undefined}>
          <span>{t("summary")}</span>
          <textarea className="crm-textarea" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={20000} placeholder={t("summaryPh")} />
          {tried && status === "completed" && !summary.trim() ? <em>{t("summaryNeed")}</em> : null}
        </label>
        {status === "no_answer" ? <p className="crm-note">{t("noAnswerSms", { n: meta.noAnswerSmsDelaySec ?? 180 })}</p> : null}
        <button type="button" className="crm-btn crm-btn--pri" onClick={() => void close()} disabled={closing} aria-busy={closing || undefined} style={{ justifySelf: "start" }}>
          <IconCheck aria-hidden="true" />
          {t("end")}
        </button>
      </div>
    </section>
  );
  function tAi(path: string): string {
    return tc.has(pathKey(path)) ? tc(pathKey(path)) : t("aiSuggestion");
  }
}
