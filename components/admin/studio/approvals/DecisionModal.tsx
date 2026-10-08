"use client";

import { useId, useState, type FormEvent } from "react";
import Modal from "@/components/admin/Modal";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { publishStudioObject, reviewStudioObject, studioErrorOf, type StudioDecision } from "@/lib/services/studio";
import { StudioErrorNote, useStudioText } from "../bits";
import { IconCircleCheck, IconCircleX, IconRefresh, IconRocket } from "@/components/icons";

export type DecisionKind = StudioDecision | "publish";

const MAX = 2000;

const AI_KEY: Record<DecisionKind, string> = {
  approve: "approve",
  changes_requested: "changes",
  reject: "reject",
  publish: "publish",
};

export default function DecisionModal({
  kind,
  objectId,
  objectTitle,
  stepName,
  onClose,
  onDone,
  onStale,
}: {
  kind: DecisionKind | null;
  objectId: string;
  objectTitle: string;
  stepName: string;
  onClose: () => void;
  onDone: (kind: DecisionKind) => void;
  onStale: () => void;
}) {
  const { t } = useStudioText();
  const title = kind ? t(`approvals.decide.${AI_KEY[kind]}.title`) : "";
  return (
    <Modal open={kind !== null} onClose={onClose} title={title} aiId="admin.studio.approvals.decision">
      {kind ? <DecisionForm key={`${kind}|${objectId}`} kind={kind} objectId={objectId} objectTitle={objectTitle} stepName={stepName} onClose={onClose} onDone={onDone} onStale={onStale} /> : null}
    </Modal>
  );
}

function DecisionForm({
  kind,
  objectId,
  objectTitle,
  stepName,
  onClose,
  onDone,
  onStale,
}: {
  kind: DecisionKind;
  objectId: string;
  objectTitle: string;
  stepName: string;
  onClose: () => void;
  onDone: (kind: DecisionKind) => void;
  onStale: () => void;
}) {
  const { t } = useStudioText();
  const uid = useId();
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const k = AI_KEY[kind];
  const needNote = kind === "changes_requested" || kind === "reject";
  const missing = needNote && !note.trim();
  const Glyph = kind === "approve" ? IconCircleCheck : kind === "publish" ? IconRocket : kind === "reject" ? IconCircleX : IconRefresh;
  const btnCls = kind === "publish" ? "btn btn--grad" : kind === "approve" ? "btn btn--pri" : kind === "reject" ? "btn btn--line stu-apm__danger" : "btn btn--soft";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    if (missing) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "publish") await publishStudioObject(objectId, { note: note.trim() });
      else await reviewStudioObject(objectId, { decision: kind, comment: note.trim() });
      toast(t(`approvals.decide.${k}.ok`), { tone: "ok" });
      onDone(kind);
    } catch (err) {
      logApiError(`studio.approvals.${k}`, err);
      const se = studioErrorOf(err);
      setError(err);
      if (se.kind === "publish_requires_approved" || se.kind === "conflict" || se.kind === "not_found") onStale();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stu-apm" onSubmit={submit} noValidate>
      <div className={`stu-apm__lead stu-apm__lead--${k}`}>
        <span className="stu-apm__ico" aria-hidden>
          <Glyph />
        </span>
        <div>
          <b>{objectTitle || t("approvals.untitled")}</b>
          <p>{t(`approvals.decide.${k}.text`, { step: stepName || "—" })}</p>
        </div>
      </div>
      <div className="stu-fld">
        <label htmlFor={`${uid}-note`} className="stu-fld__l">
          <span>
            {kind === "publish" ? t("approvals.decide.noteLabel") : t("approvals.decide.commentLabel")}
            {needNote ? <em className="stu-req">*</em> : null}
          </span>
          {!needNote ? <small>{t("common.optional")}</small> : null}
        </label>
        <textarea
          id={`${uid}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX))}
          rows={4}
          placeholder={t(`approvals.decide.${k}.ph`)}
          aria-invalid={tried && missing}
          autoFocus
          data-ai-id="admin.studio.approvals.decision.comment"
          data-ai-type="textarea"
          data-ai-label={t("approvals.decide.commentLabel")}
        />
        {tried && missing ? (
          <p className="stu-ferr" role="alert">
            {t("approvals.decide.needComment")}
          </p>
        ) : (
          <p className="stu-hint">{t(`approvals.decide.${k}.hint`)}</p>
        )}
      </div>
      {error ? <StudioErrorNote error={error} compact /> : null}
      <div className="stu-apm__acts">
        <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
          {t("actions.cancel")}
        </button>
        <button type="submit" className={btnCls} disabled={busy} data-ai-id="admin.studio.approvals.decision.confirm" data-ai-type="button" data-ai-label={t(`approvals.decide.${k}.cta`)}>
          {busy ? <span className="stu-spin" aria-hidden /> : <Glyph aria-hidden />}
          {t(`approvals.decide.${k}.cta`)}
        </button>
      </div>
    </form>
  );
}
