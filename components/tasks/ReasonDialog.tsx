"use client";

import { useId, useState, type FormEvent } from "react";
import Modal from "@/components/admin/Modal";
import { Archive, MessageSquareText, Trash2, Undo2 } from "lucide-react";
import { STROKE, useTaskText } from "./parts";

export default function ReasonDialog({
  title,
  lead,
  label,
  confirm,
  danger,
  approve,
  onClose,
  onSubmit,
}: {
  title: string;
  lead: string;
  label: string;
  confirm: string;
  danger?: boolean;
  approve?: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<string | null>;
}) {
  const { t } = useTaskText();
  const uid = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState("");
  const empty = !text.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (empty || busy) return;
    setBusy(true);
    setErr("");
    const fail = await onSubmit(text);
    setBusy(false);
    if (fail) setErr(fail);
  };

  const msg = err || (tried && empty ? t("reasonNeeded") : "");

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      icon={danger ? <Trash2 aria-hidden strokeWidth={STROKE} /> : approve ? <Archive aria-hidden strokeWidth={STROKE} /> : <Undo2 aria-hidden strokeWidth={STROKE} />}
      busy={busy}
      dirty={!empty}
      size="sm"
      description={lead}
      footer={
        <>
          <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="submit" form={`${uid}-f`} className={`btn ${danger ? "btn--danger" : "btn--pri"}`} disabled={busy}>
            {busy ? t("saving") : confirm}
          </button>
        </>
      }
    >
      <form id={`${uid}-f`} className="cform ttk-form ttk-scope" onSubmit={submit} noValidate>
        <div>
          <label htmlFor={`${uid}-r`} className="ttk-lbl">
            <MessageSquareText aria-hidden strokeWidth={STROKE} />
            {label} <span aria-hidden>*</span>
          </label>
          <textarea id={`${uid}-r`} rows={4} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} aria-invalid={!!msg} aria-describedby={msg ? `${uid}-e` : undefined} />
          {msg ? (
            <p id={`${uid}-e`} className="cform__bad" role="alert">
              {msg}
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
