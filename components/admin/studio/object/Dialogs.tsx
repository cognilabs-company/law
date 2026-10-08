"use client";

import { useId, useState, type ComponentType, type FormEvent, type ReactNode, type SVGProps } from "react";
import Modal from "@/components/admin/Modal";
import type { StudioVersion } from "@/lib/services/studio";
import { StudioStatusPill, useStudioText } from "../bits";
import { VersionBadge } from "./ui";
import { IconAlert } from "@/components/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export type DialogError = { title: string; text: string } | null;

function NoteForm({
  aiId,
  lead,
  children,
  note,
  confirmLabel,
  confirmIcon: Glyph,
  tone,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  aiId: string;
  lead: ReactNode;
  children?: ReactNode;
  note?: { label: string; placeholder: string; required?: boolean };
  confirmLabel: string;
  confirmIcon: Icon;
  tone: "pri" | "grad" | "line";
  busy: boolean;
  error: DialogError;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const { t } = useStudioText();
  const uid = useId();
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const missing = Boolean(note?.required) && !text.trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    if (missing) {
      document.getElementById(`${uid}-note`)?.focus();
      return;
    }
    onConfirm(text.trim());
  }

  return (
    <form className="stu-odlg" onSubmit={submit} noValidate>
      <div className="stu-odlg__lead">{lead}</div>
      {children}
      {note ? (
        <div className="stu-fld">
          <label className="stu-fld__l" htmlFor={`${uid}-note`}>
            <span>
              {note.label}
              {note.required ? <i className="stu-req" aria-hidden>*</i> : null}
            </span>
            {!note.required ? <small>{t("common.optional")}</small> : null}
          </label>
          <textarea
            id={`${uid}-note`}
            rows={3}
            value={text}
            maxLength={1000}
            placeholder={note.placeholder}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={tried && missing}
            disabled={busy}
            data-ai-id={`${aiId}.note`}
            data-ai-type="textarea"
            data-ai-label={note.label}
          />
          {tried && missing ? <p className="stu-ferr">{t("fieldErr.required")}</p> : null}
        </div>
      ) : null}
      {error ? (
        <div className="stu-odlg__err" role="alert">
          <IconAlert aria-hidden />
          <div>
            <b>{error.title}</b>
            {error.text ? <p>{error.text}</p> : null}
          </div>
        </div>
      ) : null}
      <div className="stu-odlg__acts">
        <button type="button" className="btn btn--line btn--sm" onClick={onCancel} disabled={busy} data-ai-id={`${aiId}.cancel`} data-ai-type="button" data-ai-label={t("actions.cancel")}>
          {t("actions.cancel")}
        </button>
        <button type="submit" className={`btn btn--${tone} btn--sm`} disabled={busy} data-ai-id={`${aiId}.confirm`} data-ai-type="button" data-ai-label={confirmLabel}>
          {busy ? <span className="stu-spin" aria-hidden /> : <Glyph aria-hidden />}
          {confirmLabel}
        </button>
      </div>
    </form>
  );
}

export function NoteDialog({
  open,
  title,
  onClose,
  ...rest
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  aiId: string;
  lead: ReactNode;
  children?: ReactNode;
  note?: { label: string; placeholder: string; required?: boolean };
  confirmLabel: string;
  confirmIcon: Icon;
  tone: "pri" | "grad" | "line";
  busy: boolean;
  error: DialogError;
  onConfirm: (note: string) => void;
}) {
  const close = () => {
    if (!rest.busy) onClose();
  };
  return (
    <Modal open={open} onClose={close} title={title} aiId={rest.aiId}>
      {open ? <NoteForm {...rest} onCancel={close} /> : null}
    </Modal>
  );
}

export function VersionLine({ version }: { version: StudioVersion }) {
  const { t, when } = useStudioText();
  const meta = [when(version.createdAt), version.createdBy].filter(Boolean).join(" · ");
  return (
    <div className="stu-odlg__ver">
      <div className="stu-odlg__vtop">
        <VersionBadge version={version.version || "—"} />
        <StudioStatusPill status={version.status} raw={version.statusRaw} small />
      </div>
      {meta ? <small>{meta}</small> : null}
      {version.summary ? <p>{version.summary}</p> : <p className="stu-odlg__muted">{t("editor.versions.noSummary")}</p>}
    </div>
  );
}

export function PayloadPreview({ open, version, onClose }: { open: boolean; version: StudioVersion | null; onClose: () => void }) {
  const { t } = useStudioText();
  let text = "";
  try {
    text = JSON.stringify(version?.payload ?? {}, null, 2);
  } catch {
    text = "";
  }
  const empty = !version || Object.keys(version.payload).length === 0;
  return (
    <Modal open={open && Boolean(version)} onClose={onClose} title={t("editor.preview.title", { v: version?.version || "—" })} aiId="admin.studio.editor.preview" wide>
      {version ? (
        <div className="stu-odlg">
          <VersionLine version={version} />
          {empty ? <p className="stu-hint">{t("editor.preview.empty")}</p> : <pre className="stu-opre" tabIndex={0}>{text}</pre>}
        </div>
      ) : null}
    </Modal>
  );
}
