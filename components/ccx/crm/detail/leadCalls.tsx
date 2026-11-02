"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { prettyPhone } from "../../now/feed";
import { Note } from "../../panel/bits";
import { IcCheck, IcPhone, IcUser } from "../../icons";
import { pathKey, textOf } from "./aiText";
import { IcMic, IcPlay, IcSend, IcSpark } from "./glyphs";
import { Check, Empty, Failed, Pill, Seg, SelectInput, Shim, TextArea, TextInput } from "./kit";
import { useCrmErr } from "../leads/util";

export function CallsPane({ meta, lead, phones }: { meta: CrmMeta; lead: CrmLead; phones: CrmContact[] | null }) {
  const t = useTranslations("crm.calls");
  const locale = useLocale();
  const crmErr = useCrmErr();
  const tel = meta.telephony;
  const recordings = crmCan(meta, "crm.calls.recordings.view");
  const canStart = leadCan(lead, "start_call") && crmCan(meta, "crm.calls.start");
  const [calls, setCalls] = useState<CrmCall[] | null>(null);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState("");
  const [purpose, setPurpose] = useState("");
  const [starting, setStarting] = useState(false);
  const [bad, setBad] = useState("");
  const contact = picked || phones?.find((x) => x.primary)?.id || phones?.[0]?.id || "";

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
    <div className="opx-cd-pane">
      <p className="opx-cd-telline" data-on={tel.enabled || undefined}>
        <IcPhone size={15} />
        <span>{tel.enabled ? t("telOn") : t("telOff")}</span>
        {tel.liveTranscription ? <Pill tone="ok">{t("liveOn")}</Pill> : null}
      </p>

      {canStart && !active ? (
        <section className="opx-cd-blk" aria-label={t("startTitle")}>
          <h4>
            <IcPhone size={16} />
            {t("startTitle")}
          </h4>
          {phones === null ? (
            <Shim h={44} />
          ) : phones.length ? (
            <>
              <div className="opx-pgrid2">
                <SelectInput label={t("contact")} value={contact} onChange={setPicked} options={phones.map((p) => ({ value: p.id, label: [prettyPhone(p.value), p.label].filter(Boolean).join(" · ") }))} invalid={bad === "contact_id"} />
                <TextInput label={t("purpose")} value={purpose} onChange={setPurpose} max={500} placeholder={t("purposePh")} />
              </div>
              {tel.recordingConsentRequired ? <p className="opx-cd-sub">{t("consentFirst")}</p> : null}
              <button type="button" className="opx-pbtn opx-pbtn--main opx-cd-self-start" onClick={() => void start()} disabled={starting || !contact} aria-busy={starting || undefined}>
                <IcPhone size={16} />
                {t("start")}
              </button>
            </>
          ) : (
            <Note tone="warn">{t("needPhone")}</Note>
          )}
        </section>
      ) : null}

      {active ? <ActiveCall key={active.id} meta={meta} call={active} onChange={replace} /> : null}

      {err && !calls ? (
        <Failed text={err} retry={t("retry")} onRetry={() => void load()} />
      ) : calls === null ? (
        <Shim h={90} />
      ) : !past.length && !active ? (
        <Empty icon={<IcPhone size={22} />} title={t("none")} text={canStart ? t("noneText") : undefined} />
      ) : past.length ? (
        <ol className="opx-cd-calllog">
          {past.map((c) => (
            <li key={c.id} data-s={c.status}>
              <span className="opx-cd-calllog__ic" aria-hidden="true">
                <IcPhone size={16} />
              </span>
              <span className="opx-cd-calllog__txt">
                <b>{t(`s.${t.has(`s.${c.status}`) ? c.status : "other"}`)}</b>
                <small className="opx-num">{[t(`dir.${c.direction === "inbound" ? "inbound" : "outbound"}`), c.durationSec ? t("dur", { m: Math.floor(c.durationSec / 60), s: c.durationSec % 60 }) : "", c.createdAt ? shortDateTime(c.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                {c.purpose ? <small>{c.purpose}</small> : null}
                {c.summary ? <p>{c.summary}</p> : null}
                {c.status === "no_answer" ? <small className="opx-cd-mute">{t("noAnswerSms", { n: meta.noAnswerSmsDelaySec ?? 180 })}</small> : null}
                {c.transcript.length ? (
                  <details className="opx-cd-act__more">
                    <summary>{t("transcriptN", { n: c.transcript.length })}</summary>
                    <Transcript segments={c.transcript} />
                  </details>
                ) : null}
              </span>
              {recordings && c.recordingUrl ? (
                <a className="opx-pbtn opx-cd-btn-sm" href={c.recordingUrl} target="_blank" rel="noreferrer">
                  <IcPlay size={14} />
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

function Transcript({ segments }: { segments: CallSegment[] }) {
  const t = useTranslations("crm.calls");
  return (
    <ol className="opx-cd-tscript">
      {segments.map((s, i) => (
        <li key={i} data-who={s.speaker === "operator" ? "operator" : "customer"}>
          <small>{s.speaker === "operator" ? t("who.operator") : t("who.customer")}</small>
          <span>{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

function ActiveCall({ meta, call, onChange }: { meta: CrmMeta; call: CrmCall; onChange: (c: CrmCall) => void }) {
  const t = useTranslations("crm.calls");
  const tc = useTranslations("crm.ai");
  const crmErr = useCrmErr();
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
  const aiLabel = (path: string) => (tc.has(pathKey(path)) ? tc(pathKey(path)) : t("aiSuggestion"));
  const summaryErr = tried && status === "completed" && !summary.trim() ? t("summaryNeed") : undefined;

  return (
    <section className="opx-cd-blk opx-cd-live" aria-label={t("active")}>
      <h4>
        <span className="opx-cd-livedot" aria-hidden="true" />
        {t("active")}
      </h4>
      {call.consentText ? (
        <div className="opx-cd-consent" role="note">
          <b>
            <IcMic size={16} />
            {t("consentRead")}
          </b>
          <p lang="uz">{call.consentText}</p>
        </div>
      ) : meta.telephony.recordingConsentRequired ? (
        <Note tone="warn">{t("consentMissing")}</Note>
      ) : null}

      <div className="opx-cd-live__grid">
        <div className="opx-cd-live__t">
          <b className="opx-cd-cap">{t("transcript")}</b>
          {segments.length ? <Transcript segments={segments} /> : <p className="opx-cd-sub">{t("noTranscript")}</p>}
          <Seg
            label={t("speaker")}
            value={who}
            onChange={setWho}
            size="sm"
            options={(["customer", "operator"] as const).map((w) => ({ value: w, label: t(`who.${w}`), icon: <IcUser size={14} /> }))}
          />
          <div className="opx-cd-live__input">
            <textarea
              className="opx-cd-input"
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
            <button type="button" className="opx-pbtn opx-pbtn--main" onClick={() => void send()} disabled={sending || !text.trim()} aria-busy={sending || undefined} aria-label={t("add")} title={t("add")}>
              <IcSend size={16} />
            </button>
          </div>
          <Check checked={assist} onChange={setAssist} disabled={assisting}>
            {assisting ? t("assistBusy") : t("assist")}
          </Check>
        </div>
        <aside className="opx-cd-live__ai" aria-live="polite">
          <b className="opx-cd-cap">
            <IcSpark size={14} />
            {t("aiTitle")}
          </b>
          {assisting ? (
            <p className="opx-cd-think">
              <i aria-hidden="true" />
              {t("aiThinking")}
            </p>
          ) : run?.status === "failed" ? (
            <p className="opx-cd-err">{run.error || t("aiFailed")}</p>
          ) : cards.length ? (
            <ul className="opx-cd-assist">
              {cards.map((c) => (
                <li key={c.path}>
                  <small>{aiLabel(c.path)}</small>
                  <span>{textOf(c.value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="opx-cd-sub">{t("aiIdle")}</p>
          )}
          <small className="opx-cd-mute">{t("aiAdvice")}</small>
        </aside>
      </div>

      <div className="opx-cd-callend">
        <Seg label={t("endAs")} value={status} onChange={setStatus} options={CALL_END_STATUSES.map((s) => ({ value: s, label: t(`s.${s}`) }))} />
        <TextArea label={t("summary")} value={summary} onChange={setSummary} rows={3} max={20000} placeholder={t("summaryPh")} required={status === "completed"} error={summaryErr} />
        {status === "no_answer" ? <Note tone="info">{t("noAnswerSms", { n: meta.noAnswerSmsDelaySec ?? 180 })}</Note> : null}
        <button type="button" className="opx-pbtn opx-pbtn--main opx-cd-self-start" onClick={() => void close()} disabled={closing} aria-busy={closing || undefined}>
          <IcCheck size={16} />
          {t("end")}
        </button>
      </div>
    </section>
  );
}
