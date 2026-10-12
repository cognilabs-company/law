"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { LOST_REASONS } from "@/lib/leadLabels";

export type LostReason = (typeof LOST_REASONS)[number];

export type LostReasonDialogProps = {
  open: boolean;
  leadName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: LostReason, note: string) => void;
};

export default function LostReasonDialog(props: LostReasonDialogProps) {
  if (!props.open) return null;
  return <LostReasonForm {...props} />;
}

function LostReasonForm({ leadName, busy, onCancel, onConfirm }: LostReasonDialogProps) {
  const t = useTranslations("admin.pipeline");
  const tc = useTranslations("common.confirm");
  const uid = useId();
  const [reason, setReason] = useState<LostReason | "">("");
  const [note, setNote] = useState("");
  const name = (leadName || "").trim();
  const groupId = `${uid}-reason`;
  const noteId = `${uid}-note`;

  function submit() {
    if (!reason || busy) return;
    onConfirm(reason, note.trim());
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={name ? t("lost.titleFor", { name }) : t("lost.title")}
      description={t("lost.lead")}
      size="sm"
      busy={busy}
      dirty={!busy && !!note.trim()}
      footer={
        <>
          <button className="btn btn--line" type="button" disabled={busy} onClick={onCancel}>
            {tc("cancel")}
          </button>
          <button className="btn btn--pri" type="button" disabled={!reason || busy} aria-busy={busy || undefined} onClick={submit}>
            {busy ? t("d.saving") : t("lost.mark")}
          </button>
        </>
      }
    >
      <div className="lrsn">
        <div className="lrsn__sec">
          <span className="lrsn__lbl" id={groupId}>
            {t("lost.reason")}
          </span>
          <div className="lrsn__chips" role="radiogroup" aria-labelledby={groupId} aria-required="true">
            {LOST_REASONS.map((r) => (
              <label key={r} className={`lrsn__chip${reason === r ? " on" : ""}`}>
                <input
                  type="radio"
                  name={groupId}
                  value={r}
                  checked={reason === r}
                  disabled={busy}
                  onChange={() => setReason(r)}
                />
                <span>{t(`lost.reasons.${r}`)}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="lrsn__sec">
          <label className="lrsn__lbl" htmlFor={noteId}>
            {t("lost.note")}
          </label>
          <textarea
            id={noteId}
            className="lrsn__note"
            rows={2}
            maxLength={500}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
      </div>
    </Modal>
  );
}
