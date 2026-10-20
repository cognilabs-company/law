"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "./sx-legal.css";
import { useState, type DragEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { STUDIO_FILE_ACCEPT, STUDIO_FILE_EXT } from "@/lib/services/studio";
import { SxButton } from "../../Button";
import { filePickProblem } from "../../editor/drawer/FilesTab";
import { fileExt } from "../../editor/model";
import { PaperclipIcon, UploadIcon, XIcon, glyph } from "../../icons";
import type { SxFileSlot } from "../../contract";

export type TemplateFileProps = {
  id: string;
  ai: string;
  label: string;
  slot: SxFileSlot | null;
  readOnly: boolean;
  error: string;
  describedBy?: string;
};

export function TemplateFile({ id, ai, label, slot, readOnly, error, describedBy }: TemplateFileProps): ReactElement {
  const t = useTranslations("studio");
  const [over, setOver] = useState(false);
  const [pickErr, setPickErr] = useState("");
  const list = STUDIO_FILE_EXT.join(" ");
  const name = slot?.name ?? "";
  const has = !!slot && (slot.has || slot.pending);
  const enabled = !!slot && slot.canPick && !readOnly && !slot.busy;
  const inputId = `${id}-input`;
  const rulesId = `${id}-rules`;
  const shownErr = pickErr || (has ? "" : error);

  const pick = (file: File | null) => {
    setPickErr("");
    if (!file || !slot || !enabled) return;
    const problem = filePickProblem(file);
    if (problem === "badType") {
      setPickErr(t("sx.editor.files.badType", { list }));
      return;
    }
    if (problem === "empty") {
      setPickErr(t("sx.editor.files.empty"));
      return;
    }
    slot.pick(file);
  };

  const onDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (enabled && !over) setOver(true);
  };

  if (!slot) {
    return (
      <p className="sx-tf__note" id={id}>
        {glyph(PaperclipIcon, { size: 16 })}
        <span>{t("sx.k06.file.elsewhere")}</span>
      </p>
    );
  }

  return (
    <div className="sx-tf" data-invalid={shownErr ? "" : undefined}>
      {has ? (
        <div className="sx-tf__card" data-pending={slot.pending ? "" : undefined}>
          <span className="sx-tf__ext" aria-hidden="true">
            {(fileExt(name) || "file").toUpperCase()}
          </span>
          <span className="sx-tf__meta">
            <span className="sx-tf__name" title={name || undefined}>
              {name || t("sx.editor.files.unnamed")}
            </span>
            <span className="sx-tf__sub">{slot.pending ? t("sx.k06.file.pending") : slot.meta || t("sx.k06.file.current")}</span>
          </span>
          {slot.pending && !readOnly ? (
            <SxButton variant="ghost" size="sm" icon={XIcon} onClick={() => slot.pick(null)} aiId={makeAiId(ai, "remove")}>
              {t("sx.k06.file.remove")}
            </SxButton>
          ) : null}
        </div>
      ) : null}
      {readOnly ? (
        has ? null : <p className="sx-tf__note">{t("sx.editor.files.none")}</p>
      ) : (
        <div
          className="sx-tf__drop"
          data-over={over ? "" : undefined}
          data-busy={slot.busy ? "" : undefined}
          onDragEnter={onDrag}
          onDragOver={onDrag}
          onDragLeave={(e) => {
            const to = e.relatedTarget;
            if (to instanceof Node && e.currentTarget.contains(to)) return;
            setOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <input
            id={inputId}
            className="sx-tf__input"
            type="file"
            accept={STUDIO_FILE_ACCEPT}
            disabled={!enabled}
            aria-labelledby={`${id}-label`}
            aria-describedby={[describedBy, rulesId, shownErr ? `${id}-perr` : ""].filter(Boolean).join(" ") || undefined}
            aria-invalid={shownErr ? true : undefined}
            aria-required={true}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              pick(f);
            }}
            data-ai-id={ai}
            data-ai-type="file_input"
            data-ai-label={label}
          />
          <label htmlFor={inputId} className="sx-tf__label" aria-disabled={!enabled || undefined}>
            <span className="sx-tf__icon" aria-hidden="true">
              {slot.busy ? <span className="sx-spin" /> : glyph(UploadIcon, { size: 20 })}
            </span>
            <span className="sx-tf__lt">{slot.busy ? t("sx.editor.files.uploading") : over ? t("sx.editor.files.dropNow") : has ? t("sx.k06.file.replace") : t("sx.editor.files.drop")}</span>
            <span className="sx-tf__ls">{t("sx.editor.files.choose")}</span>
            <span className="sx-tf__rules" id={rulesId}>
              {t("sx.editor.files.rules", { list })}
            </span>
          </label>
        </div>
      )}
      {pickErr ? (
        <p className="sx-field__err" id={`${id}-perr`} role="alert">
          {pickErr}
        </p>
      ) : null}
    </div>
  );
}
