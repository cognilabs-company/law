"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { logCcCall, type CcCallInput } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import Select from "@/components/Select";
import FieldError from "@/components/ui/FieldError";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

const RESULTS = ["answered", "no_answer", "busy", "callback", "wrong_number"];

// T4-01/T4-04 manual call log (POST /call-center/calls) — used until the
// telephony provider fills these records automatically. Prefilled from a
// client card or the queue when opened from there.
export default function CcCallForm({
  phone: initialPhone = "",
  clientUserId,
  onDone,
  onCancel,
  footSlot,
  cancelLabel,
  onDirtyChange,
  onBusyChange,
}: {
  phone?: string;
  clientUserId?: string;
  onDone: (call: CcCallInput) => void;
  onCancel: () => void;
  footSlot?: HTMLElement | null;
  cancelLabel?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useTranslations("admin.callCenter.calls");
  const tc = useTranslations("admin.callCenter");
  const ta = useTranslations("admin.form");
  const tp = useTranslations("admin.pipeline");
  const uid = useId();
  const formId = `${uid}-form`;
  const phoneErrId = `${uid}-phone-err`;
  const phoneBox = useRef<HTMLInputElement>(null);
  const [direction, setDirection] = useState("outgoing");
  const [phone, setPhone] = useState(initialPhone);
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState("answered");
  const [next, setNext] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const once = useSameTickGuard();
  const [phoneErr, setPhoneErr] = useState("");
  const dirty = direction !== "outgoing" || phone.trim() !== initialPhone.trim() || !!topic.trim() || result !== "answered" || !!next.trim() || !!minutes;
  const sent = useRef<boolean | null>(null);

  useEffect(() => {
    if (!onDirtyChange || sent.current === dirty) return;
    sent.current = dirty;
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  async function submit() {
    if (busy || !once()) return;
    const p = phone.trim();
    if (!p) {
      setPhoneErr(t("phoneRequired"));
      phoneBox.current?.focus();
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    // A call nobody answered is a "missed" record; the rest complete.
    const status = result === "no_answer" || result === "busy" ? "missed" : "completed";
    const input: CcCallInput = { phone: p, direction, status, topic: topic.trim(), result, next_action: next.trim(), duration_sec: Math.max(0, Math.round(Number(minutes) || 0) * 60) };
    if (clientUserId) input.client_user_id = clientUserId;
    try {
      await logCcCall(input);
      notify.success(tp("d.callLogged"), { id: `cc-call-save-${uid}`, body: [p, input.topic].filter(Boolean).join(" · ") });
      onDone(input);
    } catch (e) {
      notify.error(t("saveFailed"), { id: `cc-call-save-${uid}`, error: e, map: { 403: tc("queue.noPermission") } });
      if (e instanceof ApiError && e.status === 422 && e.fieldErrors.phone) {
        setPhoneErr(e.fieldErrors.phone);
        phoneBox.current?.focus();
      }
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const actions = (
    <>
      <button className="btn btn--line" type="button" onClick={onCancel} disabled={busy}>{cancelLabel || ta("cancel")}</button>
      <button className="btn btn--pri" type="submit" form={formId} aria-disabled={busy || undefined} aria-busy={busy || undefined}>{busy ? ta("saving") : t("submit")}</button>
    </>
  );

  return (
    <form
      id={formId}
      className="cform ccf"
      style={{ maxWidth: "none" }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="cform__row2">
        <div>
          <label id={`${uid}-dir`}>{t("direction")}</label>
          <Select value={direction} onChange={setDirection} labelId={`${uid}-dir`} options={[{ value: "outgoing", label: tc("dir.outgoing") }, { value: "incoming", label: tc("dir.incoming") }]} />
        </div>
        <div>
          <label htmlFor={`${uid}-phone`}>{t("phone")}</label>
          <input
            id={`${uid}-phone`}
            ref={phoneBox}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setPhoneErr(""); }}
            placeholder="+998 __ ___ __ __"
            aria-required="true"
            aria-invalid={phoneErr ? true : undefined}
            aria-describedby={phoneErr ? phoneErrId : undefined}
          />
          <FieldError id={phoneErrId} msg={phoneErr} />
        </div>
      </div>
      <div>
        <label htmlFor={`${uid}-topic`}>{t("topic")}</label>
        <input id={`${uid}-topic`} type="text" autoComplete="off" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("topicPh")} />
      </div>
      <div className="cform__row2">
        <div>
          <label id={`${uid}-result`}>{t("result")}</label>
          <Select value={result} onChange={setResult} labelId={`${uid}-result`} options={RESULTS.map((r) => ({ value: r, label: t(`results.${r}`) }))} />
        </div>
        <div>
          <label htmlFor={`${uid}-min`}>{t("duration")}</label>
          <input id={`${uid}-min`} type="text" autoComplete="off" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="0" />
        </div>
      </div>
      <div>
        <label htmlFor={`${uid}-next`}>{t("nextAction")}</label>
        <input id={`${uid}-next`} type="text" autoComplete="off" value={next} onChange={(e) => setNext(e.target.value)} placeholder={t("nextActionPh")} />
      </div>
      {footSlot === undefined ? <div className="cform__foot">{actions}</div> : footSlot ? createPortal(actions, footSlot) : null}
    </form>
  );
}
