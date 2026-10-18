"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "../sx-editor-panels.css";
import { useEffect, useId, useState, type FormEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { listApprovalUsers, reassignApprovalStep, type StudioApprover, type StudioPerson, type StudioStep } from "@/lib/services/studio";
import { SxButton } from "../../Button";
import { Field } from "../../form/Field";
import { Picker } from "../../form/Picker";
import { TextArea } from "../../form/TextArea";
import { useStudioLabels } from "../../useStudioLabels";
import type { SxOption } from "../../types";
import { ArrowRightLeftIcon } from "../../icons";
import { SxDialog, SxDialogError } from "../SxDialog";
import { useEditorErrorText } from "../useEditorErrorText";
import { normRole } from "../model";

export const REASSIGN_MESSAGE_MAX = 500;

export function reassignTargets(users: readonly StudioApprover[], approvers: readonly StudioPerson[], roleName: (code: string) => string): SxOption[] {
  const taken = new Set(approvers.map((p) => p.id));
  return users
    .filter((u) => u.id && !taken.has(u.id))
    .map((u) => ({ value: u.id, label: u.name || "—", description: [u.employeeCode, u.roles.map((r) => { const c = normRole(r); const n = roleName(c); return n && n !== c ? n : ""; }).filter(Boolean).join(", ")].filter(Boolean).join(" · ") || undefined }));
}

export function ReassignDialog({ step, code, from, onClose, onDone }: { step: StudioStep; code: string; from: readonly StudioPerson[]; onClose: () => void; onDone: () => void }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errText = useEditorErrorText();
  const uid = useId();
  const formId = `${uid}-form`;
  const [fromId, setFromId] = useState(from[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [people, setPeople] = useState<{ key: string; list: SxOption[] } | null>(null);
  const peopleKey = `${code}|${step.id}`;
  const roleName = labels.role;

  useEffect(() => {
    const c = new AbortController();
    listApprovalUsers("", code, c.signal).then(
      (users) => {
        if (!c.signal.aborted) setPeople({ key: peopleKey, list: reassignTargets(users, step.approvers, roleName) });
      },
      (e: unknown) => {
        if (c.signal.aborted) return;
        logApiError("studio.sx.reassign.users", e);
        setPeople({ key: peopleKey, list: [] });
      },
    );
    return () => c.abort();
  }, [code, peopleKey, step.approvers, roleName]);

  const options = people?.key === peopleKey ? people.list : null;
  const fromOptions: SxOption[] = from.map((p) => ({ value: p.id, label: p.name || "—" }));
  const fromErr = tried && !fromId ? t("sx.err.requiredPick") : "";
  const toErr = tried && !to ? t("sx.err.requiredPick") : "";

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setTried(true);
    if (!fromId || !to) {
      document.getElementById(!fromId ? `${uid}-from` : `${uid}-to`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reassignApprovalStep(step.id, { fromUserId: fromId, toUserId: to, message: message.trim() });
      toast(t("sx.editor.steps.reassigned"), { tone: "ok" });
      onDone();
    } catch (err) {
      logApiError("studio.sx.reassign", err);
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={t("sx.editor.steps.reassignTitle")}
      busy={busy}
      size="sm"
      aiId="admin.studio.approvals.reassign"
      footer={
        <>
          <SxButton variant="secondary" onClick={onClose} disabled={busy} aiId="admin.studio.approvals.reassign.cancel">
            {t("sx.ui.cancel")}
          </SxButton>
          <SxButton type="submit" form={formId} variant="primary" icon={ArrowRightLeftIcon} busy={busy} aiId="admin.studio.approvals.reassign.confirm">
            {t("sx.editor.steps.reassignConfirm")}
          </SxButton>
        </>
      }
    >
      <form id={formId} className="sx-dlg__form" onSubmit={submit} noValidate>
        <Field id={`${uid}-from`} label={t("sx.editor.steps.from")} required error={fromErr}>
          {(a11y) => <Picker {...a11y} label={t("sx.editor.steps.from")} value={fromId} onChange={setFromId} options={fromOptions} required disabled={busy} invalid={Boolean(fromErr)} />}
        </Field>
        <Field id={`${uid}-to`} label={t("sx.editor.steps.to")} required error={toErr}>
          {(a11y) => (
            <Picker
              {...a11y}
              label={t("sx.editor.steps.to")}
              value={to}
              onChange={setTo}
              options={options ?? []}
              searchable
              required
              disabled={busy}
              invalid={Boolean(toErr)}
              placeholder={t("sx.form.pick")}
              emptyText={options === null ? t("sx.ui.loading") : t("sx.form.empty")}
            />
          )}
        </Field>
        <Field id={`${uid}-msg`} label={t("sx.editor.steps.message")}>
          {(a11y) => (
            <TextArea
              {...a11y}
              value={message}
              onChange={(v) => setMessage(v.slice(0, REASSIGN_MESSAGE_MAX))}
              maxLength={REASSIGN_MESSAGE_MAX}
              counter
              minRows={3}
              placeholder={t("sx.editor.steps.messagePh")}
              disabled={busy}
            />
          )}
        </Field>
        <SxDialogError error={error ? errText(error) : null} />
      </form>
    </SxDialog>
  );
}
