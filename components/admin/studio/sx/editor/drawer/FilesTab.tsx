"use client";

import "../../sx-core.css";
import "../sx-editor-panels.css";
import { useId, useState, type DragEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { STUDIO_FILE_ACCEPT, STUDIO_FILE_EXT, downloadStudioVersionFile } from "@/lib/services/studio";
import { SxButton } from "../../Button";
import { useStudioLabels } from "../../useStudioLabels";
import { CheckCircleIcon, DownloadSimpleIcon, InfoIcon, PaperclipIcon, UploadSimpleIcon, WarningCircleIcon, WarningIcon, glyph } from "../../icons";
import type { EditorState } from "../useEditorState";
import { useEditorErrorText } from "../useEditorErrorText";
import { fileExt } from "../model";

export type FilePickProblem = "" | "badType" | "empty";

export function filePickProblem(file: { name: string; size: number }): FilePickProblem {
  const ext = `.${fileExt(file.name)}`;
  if (!STUDIO_FILE_EXT.includes(ext.toLowerCase())) return "badType";
  if (file.size === 0) return "empty";
  return "";
}

export function FilesTab({ st }: { st: EditorState }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errText = useEditorErrorText();
  const uid = useId();
  const [over, setOver] = useState(false);
  const [pickErr, setPickErr] = useState("");
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const uploading = st.busy === "upload";
  const saved = st.mode === "object" && Boolean(st.detail);
  const canDrop = st.can.upload && saved && !st.readOnly;
  const enabled = canDrop && !uploading;
  const version = st.currentVersion;
  const has = Boolean(version?.hasFile) || st.hasFile;
  const name = version?.fileName || "";
  const ext = fileExt(name);
  const inputId = `${uid}-file`;
  const rulesId = `${uid}-rules`;
  const errId = `${uid}-err`;
  const list = STUDIO_FILE_EXT.join(" ");
  const fieldErr = st.errors.file && st.policy.visible("file", st.errors) ? labels.error(st.errors.file, { type: "file", key: "file" }) : "";
  const uploadErr = failed && st.alert?.kind === "action" ? errText(st.alert.error).text || t("sx.editor.files.uploadFail") : "";
  const shownErr = pickErr || uploadErr || (has ? "" : fieldErr);

  async function pick(file: File | null) {
    setPickErr("");
    setFailed(false);
    if (!file || !enabled) return;
    const problem = filePickProblem(file);
    if (problem === "badType") {
      setPickErr(t("sx.editor.files.badType", { list }));
      return;
    }
    if (problem === "empty") {
      setPickErr(t("sx.editor.files.empty"));
      return;
    }
    const ok = await st.upload(file);
    if (!ok) setFailed(true);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (enabled && !over) setOver(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    const to = e.relatedTarget;
    if (to instanceof Node && e.currentTarget.contains(to)) return;
    setOver(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (!enabled) return;
    void pick(e.dataTransfer.files?.[0] ?? null);
  }

  async function download() {
    if (!version?.id || downloading) return;
    setDownloading(true);
    try {
      await downloadStudioVersionFile(version.id, version.fileName);
    } catch (e) {
      logApiError("studio.sx.file.download", e);
      toast(errText(e).text || t("sx.editor.files.downloadFail"), { tone: "err" });
    } finally {
      setDownloading(false);
    }
  }

  const dropText = uploading ? t("sx.editor.files.uploading") : over ? t("sx.editor.files.dropNow") : has ? t("sx.editor.files.replace") : t("sx.editor.files.drop");

  return (
    <div className="sx-ed-file" data-ai-id="admin.studio.editor.file" data-ai-type="section" data-ai-label={t("sx.editor.tab.files")}>
      {st.fileRequired ? (
        <p className="sx-ed-file__note" data-tone={has ? "ok" : "warn"}>
          {glyph(has ? CheckCircleIcon : WarningIcon, { size: 18 })}
          <span>{has ? t("sx.editor.files.requiredOk") : t("sx.editor.files.required")}</span>
        </p>
      ) : null}

      {has ? (
        <div className="sx-ed-file__card">
          <span className="sx-ed-file__ext" aria-hidden="true">
            {(ext || "file").toUpperCase()}
          </span>
          <span className="sx-ed-file__meta">
            <span className="sx-ed-file__name" title={name || undefined}>
              {name || t("sx.editor.files.unnamed")}
            </span>
            <span className="sx-ed-file__sub">
              {[version?.version ? t("sx.editor.versionTag", { v: version.version }) : "", version?.createdAt ? labels.dateTime(version.createdAt) : ""].filter(Boolean).join(" · ")}
            </span>
          </span>
          {version?.id ? (
            <SxButton size="sm" icon={DownloadSimpleIcon} busy={downloading} onClick={() => void download()} aiId="admin.studio.editor.file.download">
              {t("sx.editor.files.download")}
            </SxButton>
          ) : null}
        </div>
      ) : (
        <div className="sx-ed-none">
          {glyph(PaperclipIcon, { size: 24 })}
          <p>{t("sx.editor.files.none")}</p>
        </div>
      )}

      {!saved ? (
        <p className="sx-ed-file__note">
          {glyph(InfoIcon, { size: 18 })}
          <span>{t("sx.editor.files.saveFirst")}</span>
        </p>
      ) : canDrop ? (
        <div
          className="sx-ed-file__drop"
          data-over={over ? "" : undefined}
          data-busy={uploading ? "" : undefined}
          onDragEnter={onDragOver}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          data-ai-id="admin.studio.editor.file.drop"
          data-ai-type="file_dropzone"
          data-ai-label={t("sx.editor.files.drop")}
        >
          <input
            id={inputId}
            className="sx-ed-file__input"
            type="file"
            accept={STUDIO_FILE_ACCEPT}
            disabled={!enabled}
            aria-describedby={[rulesId, shownErr ? errId : ""].filter(Boolean).join(" ")}
            aria-invalid={shownErr ? true : undefined}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              void pick(f);
            }}
          />
          <label htmlFor={inputId} className="sx-ed-file__label" aria-disabled={!enabled || undefined}>
            <span className="sx-ed-file__icon" aria-hidden="true">
              {uploading ? <span className="sx-spin" /> : glyph(UploadSimpleIcon, { size: 22 })}
            </span>
            <span className="sx-ed-file__lt">{dropText}</span>
            <span className="sx-ed-file__ls">{t("sx.editor.files.choose")}</span>
            <span className="sx-ed-file__rules" id={rulesId}>
              {t("sx.editor.files.rules", { list })}
            </span>
          </label>
        </div>
      ) : null}

      {shownErr ? (
        <p className="sx-ed-file__err" role="alert" id={errId}>
          {glyph(WarningCircleIcon, { size: 16 })}
          <span>{shownErr}</span>
        </p>
      ) : null}
      {has && canDrop ? <p className="sx-ed-file__hint">{t("sx.editor.files.versionHint")}</p> : null}
    </div>
  );
}
