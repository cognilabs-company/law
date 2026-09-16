"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { logCcCall, type CcCallInput } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import Select from "@/components/Select";
import { Notice } from "@/components/admin/AdminBits";

const RESULTS = ["answered", "no_answer", "busy", "callback", "wrong_number"];

// T4-01/T4-04 manual call log (POST /call-center/calls) — used until the
// telephony provider fills these records automatically. Prefilled from a
// client card or the queue when opened from there.
export default function CcCallForm({
  phone: initialPhone = "",
  clientUserId,
  onDone,
  onCancel,
}: {
  phone?: string;
  clientUserId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.callCenter.calls");
  const tc = useTranslations("admin.callCenter");
  const ta = useTranslations("admin.form");
  const [direction, setDirection] = useState("outgoing");
  const [phone, setPhone] = useState(initialPhone);
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState("answered");
  const [next, setNext] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    const p = phone.trim();
    if (!p) { setErr(t("phoneRequired")); return; }
    setBusy(true);
    setErr(null);
    // A call nobody answered is a "missed" record; the rest complete.
    const status = result === "no_answer" || result === "busy" ? "missed" : "completed";
    const input: CcCallInput = { phone: p, direction, status, topic: topic.trim(), result, next_action: next.trim(), duration_sec: Math.max(0, Math.round(Number(minutes) || 0) * 60) };
    if (clientUserId) input.client_user_id = clientUserId;
    try {
      await logCcCall(input);
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 403 ? tc("queue.noPermission") : ta("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cform" style={{ maxWidth: "none" }}>
      <div className="cform__row2">
        <div>
          <label>{t("direction")}</label>
          <Select value={direction} onChange={setDirection} ariaLabel={t("direction")} options={[{ value: "outgoing", label: tc("dir.outgoing") }, { value: "incoming", label: tc("dir.incoming") }]} />
        </div>
        <div>
          <label>{t("phone")}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 __ ___ __ __" inputMode="tel" />
        </div>
      </div>
      <div>
        <label>{t("topic")}</label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("topicPh")} />
      </div>
      <div className="cform__row2">
        <div>
          <label>{t("result")}</label>
          <Select value={result} onChange={setResult} ariaLabel={t("result")} options={RESULTS.map((r) => ({ value: r, label: t(`results.${r}`) }))} />
        </div>
        <div>
          <label>{t("duration")}</label>
          <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="0" />
        </div>
      </div>
      <div>
        <label>{t("nextAction")}</label>
        <input value={next} onChange={(e) => setNext(e.target.value)} placeholder={t("nextActionPh")} />
      </div>
      {err ? <Notice ok={false} msg={err} /> : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn--ghost" type="button" onClick={onCancel}>{ta("cancel")}</button>
        <button className="btn btn--pri" type="button" onClick={submit} disabled={busy}>{busy ? ta("saving") : t("save")}</button>
      </div>
    </div>
  );
}
