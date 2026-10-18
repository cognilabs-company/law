"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "../../editor/sx-editor-panels.css";
import "./sx-review.css";
import { useId, useState, type FormEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { logApiError } from "@/lib/http";
import { publishStudioObject, reviewStudioObject, type StudioDetail } from "@/lib/services/studio";
import { SxButton, type SxButtonVariant } from "../../Button";
import { Field } from "../../form/Field";
import { TextArea } from "../../form/TextArea";
import { useStudioLabels } from "../../useStudioLabels";
import type { SxIcon } from "../../types";
import { ArrowUUpLeftIcon, CheckCircleIcon, ProhibitIcon, RocketLaunchIcon } from "../../icons";
import { SxDialog, SxDialogError } from "../../editor/SxDialog";
import { VersionLine } from "../../editor/drawer/VersionsTab";
import { actionErrorOf, allowedBy, decisionOf, needsComment, type ActionError, type ReviewKind } from "./actions";
import { WarningNote } from "./ChangeList";
import type { ReviewState } from "./useReview";

export type ActionDialogProps = {
  kind: ReviewKind;
  state: ReviewState;
  changed: readonly string[];
  onClose: () => void;
  onDone: (kind: ReviewKind, after: StudioDetail | null) => void;
  onStale?: () => void;
  onRunning?: (running: boolean) => void;
};

export const DECISION_MAX = 2000;
export const PUBLISH_NOTE_MAX = 1000;

const AI = "admin.studio.approvals.decision";
const FIELD_SELECTOR = `textarea[data-ai-id="${AI}.comment"]`;

const CONFIRM: Readonly<Record<ReviewKind, { variant: SxButtonVariant; icon: SxIcon; key: string }>> = {
  approve: { variant: "primary", icon: CheckCircleIcon, key: "sx.appr.act.approve" },
  return: { variant: "secondary", icon: ArrowUUpLeftIcon, key: "sx.appr.act.return" },
  reject: { variant: "danger", icon: ProhibitIcon, key: "sx.appr.act.reject" },
  publish: { variant: "primary", icon: RocketLaunchIcon, key: "sx.editor.publishDlg.confirm" },
};

export function ActionDialog({ kind, state, changed, onClose, onDone, onStale, onRunning }: ActionDialogProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useId();
  const formId = `${uid}-form`;
  const fieldId = `${uid}-c`;
  const errId = `${uid}-err`;
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<ActionError | null>(null);
  const publish = kind === "publish";
  const required = needsComment(kind);
  const missing = required && !text.trim();
  const max = publish ? PUBLISH_NOTE_MAX : DECISION_MAX;
  const fieldErr = tried && missing ? t(`sx.appr.dlg.${kind}.required`) : err?.field === "comment" ? t(err.key) : "";
  const boxErr = err && err.field !== "comment" ? err : null;
  const blocked = !!err && err.stale && !allowedBy(state.can, kind);
  const confirm = CONFIRM[kind];
  const label = publish ? t("sx.editor.publishDlg.note") : t(`sx.appr.dlg.${kind}.label`);
  const optional = !required ? <span className="sx-dlg__opt">{t("sx.ui.optional")}</span> : undefined;

  const focusField = () => requestAnimationFrame(() => document.getElementById(fieldId)?.focus());

  const busy = (on: boolean) => {
    setRunning(on);
    onRunning?.(on);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (running || blocked) return;
    setTried(true);
    if (missing) {
      setErr(null);
      focusField();
      return;
    }
    busy(true);
    setErr(null);
    try {
      const note = text.trim();
      const res = kind === "publish" ? await publishStudioObject(state.id, { note }) : await reviewStudioObject(state.id, { decision: decisionOf(kind), comment: note });
      busy(false);
      onDone(kind, res && res.id ? res : null);
    } catch (ex) {
      const a = actionErrorOf(ex);
      logApiError(`studio.sx.approvals.${kind}`, ex);
      setErr(a);
      busy(false);
      if (a.field === "comment") focusField();
      if (a.stale) {
        await state.refresh();
        onStale?.();
      }
    }
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={publish ? t("sx.editor.publishDlg.title") : t(`sx.appr.dlg.${kind}.title`)}
      description={publish ? t("sx.editor.publishDlg.lead") : t(`sx.appr.dlg.${kind}.lead`)}
      busy={running}
      dirty={!!text.trim() && !running}
      aiId={AI}
      initialFocus={required ? FIELD_SELECTOR : undefined}
      footer={
        <>
          <SxButton variant="secondary" onClick={onClose} disabled={running} aiId={`${AI}.cancel`}>
            {t("sx.ui.cancel")}
          </SxButton>
          <SxButton
            type="submit"
            form={formId}
            variant={confirm.variant}
            icon={confirm.icon}
            busy={running}
            aria-disabled={blocked || undefined}
            aria-describedby={boxErr ? errId : undefined}
            aiId={`${AI}.confirm`}
          >
            {t(confirm.key)}
          </SxButton>
        </>
      }
    >
      <form id={formId} className="sx-dlg__form sx-rv-dlg" onSubmit={submit} noValidate>
        {publish ? (
          <>
            {state.current ? <VersionLine version={state.current} detail={state.detail} /> : null}
            {changed.length ? (
              <section className="sx-dlg__sec" aria-label={t("sx.editor.submitDlg.changed")}>
                <p className="sx-dlg__h">{t("sx.editor.submitDlg.changed")}</p>
                <p className="sx-dlg__muted">{labels.list(changed, 6)}</p>
              </section>
            ) : null}
            <WarningNote warnings={state.warnings} />
          </>
        ) : null}
        <div data-code={err?.field === "comment" ? err.code || undefined : undefined}>
          <Field id={fieldId} label={label} required={required} labelAside={optional} error={fieldErr}>
            {(a11y) => (
              <TextArea
                {...a11y}
                value={text}
                onChange={(v) => setText(v.slice(0, max))}
                maxLength={max}
                counter
                minRows={3}
                placeholder={publish ? t("sx.editor.publishDlg.notePh") : t(`sx.appr.dlg.${kind}.ph`)}
                disabled={running}
                aiId={`${AI}.comment`}
                aiLabel={label}
              />
            )}
          </Field>
        </div>
        {boxErr ? (
          <div className="sx-rv-dlgerr" data-code={boxErr.code || undefined}>
            <SxDialogError id={errId} error={{ title: t("sx.editor.alert.actionTitle"), text: t(boxErr.key) }} />
          </div>
        ) : null}
      </form>
    </SxDialog>
  );
}
