"use client";

import "../sx-core.css";
import "./sx-ctorpage.css";
import { useId, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { logApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { cloneStudioObject, type StudioRecord } from "@/lib/services/studio";
import { SxButton } from "../Button";
import { SxDialog, SxDialogError } from "../editor/SxDialog";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { Field } from "../form/Field";
import { TextInput } from "../form/TextInput";

export const CLONE_NAME_MAX = 200;

export type CloneDialogProps = { rec: StudioRecord | null; onClose: () => void; onCloned: () => void };

export function cloneNameOf(template: string): string {
  return template.slice(0, CLONE_NAME_MAX);
}

export function CloneDialog({ rec, onClose, onCloned }: CloneDialogProps): ReactElement {
  const t = useTranslations("studio");
  const router = useRouter();
  const errText = useEditorErrorText();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [name, setName] = useState(() => (rec ? cloneNameOf(t("sx.editor.cloneDlg.nameDefault", { title: rec.title.trim() || t("sx.ui.untitled") })) : ""));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const empty = !name.trim();

  const confirm = async () => {
    setTried(true);
    if (!rec || empty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const made = await cloneStudioObject(rec.actions.clone, name.trim().slice(0, CLONE_NAME_MAX));
      notify.success(t("sx.editor.toast.cloned"));
      onClose();
      if (made.id) router.push(`/admin/studio/o/${encodeURIComponent(made.id)}`);
      else onCloned();
    } catch (e) {
      logApiError("studio.clone", e);
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const fieldErr = tried && empty ? t("sx.err.required") : "";
  return (
    <SxDialog
      open={rec !== null}
      onClose={onClose}
      title={t("sx.editor.cloneDlg.title")}
      description={t("sx.editor.cloneDlg.lead")}
      busy={busy}
      size="sm"
      aiId="admin.studio.list.clone-modal"
      footer={
        <>
          <SxButton variant="ghost" onClick={onClose} disabled={busy} aiId="admin.studio.list.clone-modal.cancel">
            {t("sx.ui.cancel")}
          </SxButton>
          <SxButton variant="primary" busy={busy} onClick={() => void confirm()} aiId="admin.studio.list.clone-modal.confirm">
            {t("sx.editor.cloneDlg.confirm")}
          </SxButton>
        </>
      }
    >
      <SxDialogError error={error ? errText(error) : null} id={`${uid}-err`} />
      <Field id={`${uid}-name`} label={t("sx.editor.cloneDlg.name")} required error={fieldErr}>
        {(a11y) => (
          <TextInput
            {...a11y}
            value={name}
            onChange={(v) => setName(v.slice(0, CLONE_NAME_MAX))}
            maxLength={CLONE_NAME_MAX}
            invalid={!!fieldErr}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void confirm();
              }
            }}
            aiId="admin.studio.list.clone-modal.name"
            aiLabel={t("sx.editor.cloneDlg.name")}
          />
        )}
      </Field>
    </SxDialog>
  );
}
