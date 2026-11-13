"use client";

import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { confirmLawyerDraft, createLawyerDraft, type LawyerDraft } from "@/lib/services/executive";
import type { UrgentRequest } from "@/lib/services/backend";
import { Group } from "@/components/ccx/panel/Detail";
import { IcCheck, IcClose, IcCopy, IcDoc } from "@/components/ccx/icons";
import "./dutyDraft.css";

// The duty lawyer's AI draft (contract 2026-11-13 §10): the AI writes a
// draft answer and the questions still missing; the lawyer reads, edits and
// approves or rejects it. Approval changes nothing by itself — the backend
// answers ready_for_explicit_action — so the lawyer copies the approved text
// and sends it with their own hand. Internal duty lawyers only
// (call_center_lawyer); never shown to external marketplace lawyers.
const TASK = "legal_response";

export type DraftEntity = { type: string; id: string };

// What the AI is told about an urgent request: the work itself, never the
// client's phone or other contact details.
export function urgentDraftContext(u: UrgentRequest): Record<string, unknown> {
  return {
    urgent_request: { id: u.id, code: u.workId, service_kind: u.serviceKind, service: u.serviceTitle, need: u.need, directions: u.directions, region: u.region, status: u.status, meeting_note: u.meetingNote },
    documents: [],
  };
}

export default function DutyAiDraft({ entity, context }: { entity: DraftEntity; context: Record<string, unknown> }): ReactElement | null {
  const t = useTranslations("exec.drafts");
  const [instruction, setInstruction] = useState(() => t("defaultInstruction"));
  const [draft, setDraft] = useState<LawyerDraft | null>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "create" | "approve" | "reject">("");
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const fail = (e: unknown) => {
    const code = e instanceof ApiError ? e.code ?? "" : "";
    if (code === "duty_lawyer_ai_required") {
      setHidden(true);
      return;
    }
    setError(
      code === "lawyer_ai_cross_owner_access_denied"
        ? t("err.owner")
        : code === "lawyer_ai_draft_already_decided"
          ? t("err.decided")
          : code === "lawyer_ai_decision_invalid"
            ? t("err.decision")
            : e instanceof ApiError && e.status === 422
              ? t("err.invalid")
              : t("err.failed"),
    );
  };

  const create = async () => {
    if (busy) return;
    setBusy("create");
    setError("");
    try {
      const d = await createLawyerDraft({ entityType: entity.type, entityId: entity.id, taskType: TASK, instruction, context, language: "uz_latn" });
      setDraft(d);
      setText(d.content);
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    if (!draft || busy) return;
    setBusy(decision);
    setError("");
    try {
      const d = await confirmLawyerDraft(draft.id, decision === "approve" ? { decision, finalContent: text, note } : { decision, note });
      setDraft({ ...draft, ...d, decision, finalContent: decision === "approve" ? d.finalContent || text : "", content: draft.content });
    } catch (e) {
      fail(e);
      // Decided elsewhere: show it as decided rather than offer the buttons again.
      if (e instanceof ApiError && e.code === "lawyer_ai_draft_already_decided") setDraft({ ...draft, decision: "decided" });
    } finally {
      setBusy("");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft?.finalContent || text);
      notify.success(t("copied"));
    } catch {
      notify.error(t("copyFailed"));
    }
  };

  const decided = !!draft?.decision;
  return (
    <Group icon={<IcDoc size={16} />} title={t("title")} wide>
      <div className="dad">
        <p className="dad__note">{t("lead")}</p>
        {error ? <p className="dad__err" role="alert">{error}</p> : null}
        {!draft ? (
          <>
            <label className="dad__field">
              <span>{t("instruction")}</span>
              <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} />
            </label>
            <button type="button" className="btn btn--pri btn--sm" onClick={() => void create()} disabled={!!busy || !instruction.trim()} aria-busy={busy === "create" || undefined}>
              {busy === "create" ? t("creating") : t("create")}
            </button>
          </>
        ) : (
          <>
            {draft.requiresHumanConfirmation && !decided ? <p className="dad__must">{t("mustReview")}</p> : null}
            <label className="dad__field">
              <span>{t("draft")}</span>
              <textarea value={decided ? draft.finalContent || text : text} onChange={(e) => setText(e.target.value)} rows={7} readOnly={decided} />
            </label>
            {draft.questions.length ? (
              <div className="dad__q">
                <span>{t("questions")}</span>
                <ul>{draft.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            ) : null}
            {decided ? (
              draft.decision === "approve" ? (
                <div className="dad__done">
                  <b><IcCheck size={15} />{t("approved")}</b>
                  <p>{t("approvedNext")}</p>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => void copy()}>
                    <IcCopy size={15} />
                    {t("copy")}
                  </button>
                </div>
              ) : (
                <p className="dad__note">{draft.decision === "reject" ? t("rejected") : t("err.decided")}</p>
              )
            ) : (
              <>
                <label className="dad__field">
                  <span>{t("noteLabel")}</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePh")} />
                </label>
                <div className="dad__acts">
                  <button type="button" className="btn btn--pri btn--sm" onClick={() => void decide("approve")} disabled={!!busy || !text.trim()} aria-busy={busy === "approve" || undefined}>
                    <IcCheck size={15} />
                    {t("approve")}
                  </button>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => void decide("reject")} disabled={!!busy} aria-busy={busy === "reject" || undefined}>
                    <IcClose size={15} />
                    {t("reject")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Group>
  );
}
