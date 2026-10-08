"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useStudioText } from "../bits";
import { versionOk } from "./model";
import { IconCaretDown, IconSave } from "./ui";

export default function SaveButton({
  busy,
  disabled,
  isNew,
  primary,
  suggest,
  onSave,
}: {
  busy: boolean;
  disabled: boolean;
  isNew: boolean;
  primary: boolean;
  suggest: string;
  onSave: (meta: { summary?: string; version?: string }) => void;
}) {
  const { t } = useStudioText();
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [version, setVersion] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!versionOk(version)) {
      setBad(true);
      document.getElementById(`${uid}-v`)?.focus();
      return;
    }
    setOpen(false);
    onSave({ summary: summary.trim() || undefined, version: version.trim() || undefined });
    setSummary("");
    setVersion("");
    setBad(false);
  }

  const cls = primary ? "btn--pri" : "btn--line";
  const label = isNew ? t("editor.save.create") : t("actions.save");

  return (
    <div className="stu-osplit" ref={box}>
      <button type="button" className={`btn ${cls} btn--sm stu-osplit__main`} onClick={() => onSave({})} disabled={disabled || busy} data-ai-id="admin.studio.editor.save" data-ai-type="button" data-ai-label={label}>
        {busy ? <span className="stu-spin" aria-hidden /> : <IconSave aria-hidden />}
        {busy ? t("editor.save.saving") : label}
      </button>
      {!isNew ? (
        <button
          type="button"
          className={`btn ${cls} btn--sm stu-osplit__more`}
          onClick={() => setOpen((v) => !v)}
          disabled={disabled || busy}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t("editor.save.more")}
          title={t("editor.save.more")}
          data-ai-id="admin.studio.editor.save.more"
          data-ai-type="button"
          data-ai-label={t("editor.save.more")}
        >
          <IconCaretDown aria-hidden />
        </button>
      ) : null}
      {open ? (
        <form className="stu-opop" role="dialog" aria-label={t("editor.save.more")} onSubmit={submit}>
          <b className="stu-opop__t">{t("editor.save.more")}</b>
          <div className="stu-fld">
            <label className="stu-fld__l" htmlFor={`${uid}-s`}>
              <span>{t("editor.save.summary")}</span>
              <small>{t("common.optional")}</small>
            </label>
            <input
              id={`${uid}-s`}
              type="text"
              value={summary}
              maxLength={300}
              autoFocus
              placeholder={t("editor.save.summaryPh")}
              onChange={(e) => setSummary(e.target.value)}
              data-ai-id="admin.studio.editor.save.summary"
              data-ai-type="input"
              data-ai-label={t("editor.save.summary")}
            />
          </div>
          <div className="stu-fld">
            <label className="stu-fld__l" htmlFor={`${uid}-v`}>
              <span>{t("editor.save.version")}</span>
              <small>{t("common.optional")}</small>
            </label>
            <input
              id={`${uid}-v`}
              type="text"
              inputMode="decimal"
              value={version}
              maxLength={14}
              placeholder={suggest}
              aria-invalid={bad && !versionOk(version)}
              onChange={(e) => setVersion(e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, ""))}
              data-ai-id="admin.studio.editor.save.version"
              data-ai-type="input"
              data-ai-label={t("editor.save.version")}
            />
            {bad && !versionOk(version) ? <p className="stu-ferr">{t("editor.save.versionBad")}</p> : <p className="stu-hint">{t("editor.save.versionHint")}</p>}
          </div>
          <button type="submit" className="btn btn--pri btn--sm btn--full" data-ai-id="admin.studio.editor.save.confirm" data-ai-type="button" data-ai-label={t("actions.save")}>
            <IconSave aria-hidden />
            {t("actions.save")}
          </button>
        </form>
      ) : null}
    </div>
  );
}
