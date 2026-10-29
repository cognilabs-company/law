"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAlert, IconCheck, IconClock, IconEdit, IconInfo, IconRefresh, IconSend } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { AI_LANGUAGES, approveSms, createLeadSms, crmCan, crmField, getCrmCustomer, listLeadSms, smsEditable, type CrmContact, type CrmLead, type CrmMeta, type CrmSms } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import { Empty, useCrmError } from "./bits";
import { CrmDateTime, CrmSelect } from "./fields";
import { fromLocalInput } from "./LeadSheets";

// A lead's SMS (contract 13cb257 §15): an operator draft → edited and
// approved → its status. The provider is not configured yet: an approved
// SMS then shows "SMS provider is not configured" with a retry, and never
// "sent" or "delivered" until the backend says so. A no-answer call sends
// the standard SMS after the configured delay, cancelled automatically if a
// later call is answered first.
const MAX = 1000;
export function LeadSms({ meta, lead, preset, onPresetUsed }: { meta: CrmMeta; lead: CrmLead; preset?: string; onPresetUsed?: () => void }): ReactElement {
  const t = useTranslations("crm.sms");
  const locale = useLocale();
  const crmErr = useCrmError();
  const can = crmCan(meta, "crm.sms.manage");
  const [items, setItems] = useState<CrmSms[] | null>(null);
  const [err, setErr] = useState("");
  const [phones, setPhones] = useState<CrmContact[]>([]);
  const [body, setBody] = useState("");
  const [language, setLanguage] = useState(lead.language && lead.language !== "auto" ? lead.language : "uz_latn");
  const [contact, setContact] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState("");
  // The field a refusal names (detail.field), marked in place.
  const [bad, setBad] = useState("");

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
    if (!lead.customerId) return;
    const ctl = new AbortController();
    getCrmCustomer(lead.customerId, ctl.signal).then(
      (c) => {
        const list = c.contacts.filter((x) => x.type === "phone" && x.status !== "archived");
        setPhones(list);
        setContact((cur) => cur || list.find((x) => x.primary)?.id || list[0]?.id || "");
      },
      (e) => !isAborted(e) && logApiError("crm.sms.contacts", e),
    );
    return () => ctl.abort();
  }, [lead.customerId]);
  // A draft handed over from the AI Copilot (sms_draft) lands in the box.
  useEffect(() => {
    if (!preset) return;
    const id = window.setTimeout(() => {
      setBody(preset.slice(0, MAX));
      onPresetUsed?.();
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
      const s = await createLeadSms(lead.id, { body, language, contactId: contact, scheduledAt: when ? fromLocalInput(when) : "" });
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
      // Only what the backend answered: provider missing is never "sent".
      toast(saved.status === "provider_configuration_required" ? t("noProvider") : (t.has(`state.${saved.status}`) ? t(`state.${saved.status}`) : t("state.other")), { tone: saved.status === "provider_configuration_required" || saved.status === "failed" ? "err" : "ok" });
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
      void load();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="crm-smspane">
      <p className="crm-note crm-note--info">
        <IconInfo aria-hidden="true" />
        {t("autoRule", { n: meta.noAnswerSmsDelaySec ?? 180 })}
      </p>
      {can ? (
        <section className="crm-card" aria-labelledby="crm-sms-new">
          <h4 className="crm-card__h" id="crm-sms-new">
            <IconEdit aria-hidden="true" />
            {t("newTitle")}
          </h4>
          {phones.length ? (
            <>
              <label className="crm-field" data-err={bad === "body" ? "" : undefined}>
                <span>{t("text")}</span>
                <textarea className="crm-textarea" rows={3} value={body} onChange={(e) => setBody(e.target.value.slice(0, MAX))} maxLength={MAX} placeholder={t("textPh")} />
                <small>{t("chars", { n: body.length, max: MAX })}</small>
              </label>
              <div className="crm-row2">
                <div className="crm-field" data-err={bad === "contact_id" ? "" : undefined}>
                  <span>{t("to")}</span>
                  <CrmSelect value={contact} onChange={setContact} label={t("to")} options={phones.map((p) => ({ value: p.id, label: [p.value, p.label].filter(Boolean).join(" · ") }))} />
                </div>
                <div className="crm-field">
                  <span>{t("language")}</span>
                  <CrmSelect value={language} onChange={setLanguage} label={t("language")} options={AI_LANGUAGES.filter((l) => l !== "auto").map((l) => ({ value: l, label: t(`lang.${l}`) }))} />
                </div>
              </div>
              <div className="crm-field">
                <span>{t("when")}</span>
                <CrmDateTime value={when} onChange={setWhen} label={t("when")} />
              </div>
              <p className="crm-sub">{t("draftNote")}</p>
              <button type="button" className="crm-btn crm-btn--pri" onClick={() => void draft()} disabled={busy === "new" || !body.trim()} aria-busy={busy === "new" || undefined} style={{ justifySelf: "start" }}>
                <IconEdit aria-hidden="true" />
                {t("saveDraft")}
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

      {err && !items ? (
        <div className="crm-err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{err}</span>
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => void load()}>
            <IconRefresh aria-hidden="true" />
            {t("retry")}
          </button>
        </div>
      ) : items === null ? (
        <span className="crm-sk crm-sk--block" style={{ height: 90 }} />
      ) : !items.length ? (
        <Empty icon={<IconSend />} title={t("none")} text={can ? t("noneText") : undefined} />
      ) : (
        <ol className="crm-smslist">
          {items.map((s) => (
            <SmsRow key={s.id} s={s} can={can} busy={busy === s.id} locked={!!busy && busy !== s.id} onApprove={approve} locale={locale} />
          ))}
        </ol>
      )}
    </div>
  );
}

export function SmsRow({ s, can, busy, locked, onApprove, locale, as: Tag = "li" }: { s: CrmSms; can: boolean; busy: boolean; locked: boolean; onApprove: (s: CrmSms, text?: string) => Promise<void>; locale: string; as?: "li" | "div" }): ReactElement {
  const t = useTranslations("crm.sms");
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(s.body);
  const st = t.has(`state.${s.status}`) ? s.status : "other";
  const auto = /no_answer|automation|auto/.test(s.origin);
  return (
    <Tag className="crm-sms" data-s={st}>
      <span className="crm-sms__h">
        <span className="crm-sms__st" data-s={st}>
          {s.status === "provider_configuration_required" ? <IconAlert aria-hidden="true" /> : s.status === "delivered" || s.status === "sent" ? <IconCheck aria-hidden="true" /> : <IconClock aria-hidden="true" />}
          {s.status === "provider_configuration_required" ? t("noProvider") : t(`state.${st}`)}
        </span>
        {auto ? <em className="crm-sms__auto">{t("auto")}</em> : null}
        <small className="crm-muted">{[s.to, s.createdAt ? shortDateTime(s.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
      </span>
      {edit ? (
        <label className="crm-field">
          <span className="crm-sr">{t("text")}</span>
          <textarea className="crm-textarea" rows={3} value={text} onChange={(e) => setText(e.target.value.slice(0, MAX))} maxLength={MAX} />
          <small>{t("chars", { n: text.length, max: MAX })}</small>
        </label>
      ) : (
        <p className="crm-sms__body">{s.body}</p>
      )}
      {s.status === "scheduled" && s.scheduledAt ? <small className="crm-muted">{t("scheduledAt", { at: shortDateTime(s.scheduledAt, locale) })}</small> : null}
      {s.status === "cancelled" && auto ? <small className="crm-muted">{t("autoCancelled")}</small> : null}
      {s.status === "provider_configuration_required" ? <small className="crm-muted">{t("noProviderText")}</small> : null}
      {s.status === "failed" && s.error ? <small className="crm-bad">{s.error}</small> : null}
      {s.status === "delivered" && s.deliveredAt ? <small className="crm-muted">{t("deliveredAt", { at: shortDateTime(s.deliveredAt, locale) })}</small> : null}
      {can && smsEditable(s) ? (
        <span className="crm-sms__acts">
          {edit ? (
            <>
              <button type="button" className="crm-btn crm-btn--sm" onClick={() => (setEdit(false), setText(s.body))} disabled={busy}>
                {t("cancel")}
              </button>
              <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" onClick={() => void onApprove(s, text).then(() => setEdit(false))} disabled={busy || locked || !text.trim()} aria-busy={busy || undefined}>
                <IconCheck aria-hidden="true" />
                {t("approveEdited")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="crm-btn crm-btn--sm" onClick={() => setEdit(true)} disabled={busy || locked}>
                <IconEdit aria-hidden="true" />
                {t("edit")}
              </button>
              <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" onClick={() => void onApprove(s)} disabled={busy || locked} aria-busy={busy || undefined}>
                <IconCheck aria-hidden="true" />
                {t("approve")}
              </button>
            </>
          )}
        </span>
      ) : null}
      {can && s.status === "provider_configuration_required" ? (
        <span className="crm-sms__acts">
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => void onApprove(s)} disabled={busy || locked} aria-busy={busy || undefined}>
            <IconRefresh aria-hidden="true" />
            {t("retrySend")}
          </button>
        </span>
      ) : null}
    </Tag>
  );
}
