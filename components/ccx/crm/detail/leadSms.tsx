"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { AI_LANGUAGES, approveSms, createLeadSms, crmCan, crmField, listLeadSms, smsEditable, type CrmContact, type CrmLead, type CrmMeta, type CrmSms } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import { prettyPhone } from "../../now/feed";
import { Note } from "../../panel/bits";
import { IcCheck, IcClock, IcRefresh } from "../../icons";
import { IcAlert, IcEdit, IcSend } from "./glyphs";
import { DateTimeInput, Empty, Failed, Pill, SelectInput, Shim, TextArea, fromLocal, type Tone } from "./kit";
import { useCrmErr } from "../leads/util";

const MAX = 1000;

export function SmsPane({ meta, lead, phones, preset, onPresetUsed }: { meta: CrmMeta; lead: CrmLead; phones: CrmContact[] | null; preset: string; onPresetUsed: () => void }) {
  const t = useTranslations("crm.sms");
  const locale = useLocale();
  const crmErr = useCrmErr();
  const can = crmCan(meta, "crm.sms.manage");
  const [items, setItems] = useState<CrmSms[] | null>(null);
  const [err, setErr] = useState("");
  const [body, setBody] = useState("");
  const [language, setLanguage] = useState(lead.language && lead.language !== "auto" ? lead.language : "uz_latn");
  const [picked, setPicked] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState("");
  const [bad, setBad] = useState("");
  const list = phones ?? [];
  const contact = picked || list.find((x) => x.primary)?.id || list[0]?.id || "";

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setItems(await listLeadSms(lead.id, signal));
        setErr("");
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.sms", e);
        setErr(crmErr(e));
      }
    },
    [lead.id, crmErr],
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
    if (!preset) return;
    const id = window.setTimeout(() => {
      setBody(preset.slice(0, MAX));
      onPresetUsed();
    }, 0);
    return () => window.clearTimeout(id);
  }, [preset, onPresetUsed]);
  useCrmEvents((ev) => {
    if (ev.invalidate.includes("all") || (ev.leadId === lead.id && (ev.invalidate.includes("sms") || ev.invalidate.includes("lead")))) void load();
  });

  const draft = async () => {
    if (busy || !body.trim()) return;
    setBusy("new");
    try {
      const s = await createLeadSms(lead.id, { body, language, contactId: contact, scheduledAt: when ? fromLocal(when) : "" });
      setItems((cur) => [s, ...(cur ?? [])]);
      setBody("");
      setWhen("");
      toast(t("drafted"), { tone: "ok" });
      setBad("");
    } catch (e) {
      setBad(crmField(e));
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy("");
    }
  };
  const approve = async (s: CrmSms, text?: string) => {
    if (busy) return;
    setBusy(s.id);
    try {
      const saved = await approveSms(s.id, text);
      setItems((cur) => (cur ?? []).map((x) => (x.id === saved.id ? saved : x)));
      toast(saved.status === "provider_configuration_required" ? t("noProvider") : t.has(`state.${saved.status}`) ? t(`state.${saved.status}`) : t("state.other"), { tone: saved.status === "provider_configuration_required" || saved.status === "failed" ? "err" : "ok" });
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
      void load();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="opx-cd-pane">
      <Note tone="info">{t("autoRule", { n: meta.noAnswerSmsDelaySec ?? 180 })}</Note>
      {can ? (
        <section className="opx-cd-blk" aria-label={t("newTitle")}>
          <h4>
            <IcEdit size={16} />
            {t("newTitle")}
          </h4>
          {phones === null ? (
            <Shim h={60} />
          ) : list.length ? (
            <>
              <TextArea label={t("text")} value={body} onChange={(v) => setBody(v.slice(0, MAX))} rows={3} max={MAX} counter placeholder={t("textPh")} invalid={bad === "body"} />
              <div className="opx-cd-grid3">
                <SelectInput label={t("to")} value={contact} onChange={setPicked} options={list.map((p) => ({ value: p.id, label: [prettyPhone(p.value), p.label].filter(Boolean).join(" · ") }))} invalid={bad === "contact_id"} />
                <SelectInput label={t("language")} value={language} onChange={setLanguage} options={AI_LANGUAGES.filter((l) => l !== "auto").map((l) => ({ value: l, label: t(`lang.${l}`) }))} />
                <DateTimeInput label={t("when")} value={when} onChange={setWhen} />
              </div>
              <p className="opx-cd-sub">{t("draftNote")}</p>
              <button type="button" className="opx-pbtn opx-pbtn--main opx-cd-self-start" onClick={() => void draft()} disabled={busy === "new" || !body.trim()} aria-busy={busy === "new" || undefined}>
                <IcEdit size={16} />
                {t("saveDraft")}
              </button>
            </>
          ) : (
            <Note tone="warn">{t("needPhone")}</Note>
          )}
        </section>
      ) : null}

      {err && !items ? (
        <Failed text={err} retry={t("retry")} onRetry={() => void load()} />
      ) : items === null ? (
        <Shim h={90} />
      ) : !items.length ? (
        <Empty icon={<IcSend size={22} />} title={t("none")} text={can ? t("noneText") : undefined} />
      ) : (
        <ol className="opx-cd-smslist">
          {items.map((s) => (
            <SmsRow key={s.id} s={s} can={can} busy={busy === s.id} locked={!!busy && busy !== s.id} onApprove={approve} locale={locale} />
          ))}
        </ol>
      )}
    </div>
  );
}

function smsTone(status: string): Tone {
  if (status === "delivered" || status === "sent") return "ok";
  if (status === "failed" || status === "provider_configuration_required") return "hot";
  if (status === "cancelled") return "mute";
  if (status === "scheduled" || status === "approved") return "info";
  return "warn";
}

function SmsRow({ s, can, busy, locked, onApprove, locale }: { s: CrmSms; can: boolean; busy: boolean; locked: boolean; onApprove: (s: CrmSms, text?: string) => Promise<void>; locale: string }) {
  const t = useTranslations("crm.sms");
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(s.body);
  const st = t.has(`state.${s.status}`) ? s.status : "other";
  const auto = /no_answer|automation|auto/.test(s.origin);
  return (
    <li className="opx-cd-sms" data-s={st}>
      <span className="opx-cd-sms__h">
        <Pill tone={smsTone(s.status)}>
          {s.status === "provider_configuration_required" ? <IcAlert size={13} /> : s.status === "delivered" || s.status === "sent" ? <IcCheck size={13} /> : <IcClock size={13} />}
          {s.status === "provider_configuration_required" ? t("noProvider") : t(`state.${st}`)}
        </Pill>
        {auto ? <Pill tone="mute">{t("auto")}</Pill> : null}
        <small className="opx-cd-mute opx-num">{[s.to.startsWith("+") ? prettyPhone(s.to) : s.to, s.createdAt ? shortDateTime(s.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
      </span>
      {edit ? (
        <TextArea label={t("text")} value={text} onChange={(v) => setText(v.slice(0, MAX))} rows={3} max={MAX} counter />
      ) : (
        <p className="opx-cd-sms__body">{s.body}</p>
      )}
      {s.status === "scheduled" && s.scheduledAt ? <small className="opx-cd-mute">{t("scheduledAt", { at: shortDateTime(s.scheduledAt, locale) })}</small> : null}
      {s.status === "cancelled" && auto ? <small className="opx-cd-mute">{t("autoCancelled")}</small> : null}
      {s.status === "provider_configuration_required" ? <small className="opx-cd-mute">{t("noProviderText")}</small> : null}
      {s.status === "failed" && s.error ? <small className="opx-cd-err">{s.error}</small> : null}
      {s.status === "delivered" && s.deliveredAt ? <small className="opx-cd-mute">{t("deliveredAt", { at: shortDateTime(s.deliveredAt, locale) })}</small> : null}
      {can && smsEditable(s) ? (
        <span className="opx-cd-sms__acts">
          {edit ? (
            <>
              <button
                type="button"
                className="opx-pbtn opx-cd-btn-sm"
                onClick={() => {
                  setEdit(false);
                  setText(s.body);
                }}
                disabled={busy}
              >
                {t("cancel")}
              </button>
              <button type="button" className="opx-pbtn opx-pbtn--main opx-cd-btn-sm" onClick={() => void onApprove(s, text).then(() => setEdit(false))} disabled={busy || locked || !text.trim()} aria-busy={busy || undefined}>
                <IcCheck size={15} />
                {t("approveEdited")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="opx-pbtn opx-cd-btn-sm" onClick={() => setEdit(true)} disabled={busy || locked}>
                <IcEdit size={15} />
                {t("edit")}
              </button>
              <button type="button" className="opx-pbtn opx-pbtn--main opx-cd-btn-sm" onClick={() => void onApprove(s)} disabled={busy || locked} aria-busy={busy || undefined}>
                <IcCheck size={15} />
                {t("approve")}
              </button>
            </>
          )}
        </span>
      ) : null}
      {can && s.status === "provider_configuration_required" ? (
        <span className="opx-cd-sms__acts">
          <button type="button" className="opx-pbtn opx-cd-btn-sm" onClick={() => void onApprove(s)} disabled={busy || locked} aria-busy={busy || undefined}>
            <IcRefresh size={15} />
            {t("retrySend")}
          </button>
        </span>
      ) : null}
    </li>
  );
}
