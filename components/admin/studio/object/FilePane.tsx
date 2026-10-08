"use client";

import { useId, useState, type DragEvent } from "react";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { STUDIO_FILE_ACCEPT, STUDIO_FILE_EXT, downloadStudioVersionFile, type StudioVersion } from "@/lib/services/studio";
import { useStudioErrorText, useStudioText } from "../bits";
import { fileExt } from "./model";
import { VersionBadge } from "./ui";
import { IconAlert, IconDownload, IconInfo, IconPaperclip, IconUpload } from "@/components/icons";

export default function FilePane({
  version,
  hasFile,
  canUpload,
  needsSave,
  required,
  readOnly,
  uploading,
  error,
  onUpload,
}: {
  version: StudioVersion | null;
  hasFile: boolean;
  canUpload: boolean;
  needsSave: boolean;
  required: boolean;
  readOnly: boolean;
  uploading: boolean;
  error: string;
  onUpload: (file: File) => Promise<boolean>;
}) {
  const { t, when } = useStudioText();
  const errText = useStudioErrorText();
  const uid = useId();
  const [over, setOver] = useState(false);
  const [pickErr, setPickErr] = useState("");
  const [downloading, setDownloading] = useState(false);
  const enabled = canUpload && !needsSave && !readOnly && !uploading;

  function pick(file: File | null) {
    setPickErr("");
    if (!file) return;
    const ext = `.${fileExt(file.name)}`;
    if (!STUDIO_FILE_EXT.includes(ext)) {
      setPickErr(t("editor.file.badType"));
      return;
    }
    if (file.size === 0) {
      setPickErr(t("editor.file.empty"));
      return;
    }
    void onUpload(file);
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
    pick(e.dataTransfer.files?.[0] ?? null);
  }

  async function download() {
    if (!version?.id) return;
    setDownloading(true);
    try {
      await downloadStudioVersionFile(version.id, version.fileName);
    } catch (e) {
      logApiError("studio.file.download", e);
      toast(errText(e).text || t("editor.file.downloadFail"), { tone: "err" });
    } finally {
      setDownloading(false);
    }
  }

  const has = Boolean(version?.hasFile) || hasFile;
  const name = version?.fileName || "";
  const ext = fileExt(name);
  const inputId = `${uid}-file`;
  const shownErr = pickErr || error;

  return (
    <div className="stu-opane" data-ai-id="admin.studio.editor.file" data-ai-type="section" data-ai-label={t("editor.side.file")}>
      {required ? (
        <p className={`stu-ofnote${has ? " stu-ofnote--ok" : ""}`}>
          {has ? <IconPaperclip aria-hidden /> : <IconAlert aria-hidden />}
          {has ? t("editor.file.requiredOk") : t("editor.file.required")}
        </p>
      ) : null}

      {has ? (
        <div className="stu-ofcard">
          <span className={`stu-ofcard__ext stu-ofcard__ext--${ext || "doc"}`} aria-hidden>
            {(ext || "file").toUpperCase()}
          </span>
          <span className="stu-ofcard__m">
            <b title={name || undefined}>{name || t("editor.file.unnamed")}</b>
            <small>
              {version?.version ? <VersionBadge version={version.version} /> : null}
              {version?.createdAt ? when(version.createdAt) : t("editor.file.current")}
            </small>
          </span>
          {version?.id ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => void download()} disabled={downloading} data-ai-id="admin.studio.editor.file.download" data-ai-type="button" data-ai-label={t("editor.file.download")}>
              {downloading ? <span className="stu-spin" aria-hidden /> : <IconDownload aria-hidden />}
              <span className="stu-ohide-sm">{t("actions.download")}</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="stu-opane__none">
          <IconPaperclip aria-hidden />
          <p>{t("editor.file.none")}</p>
        </div>
      )}

      {needsSave ? (
        <p className="stu-ofnote">
          <IconInfo aria-hidden />
          {t("editor.file.saveFirst")}
        </p>
      ) : canUpload && !readOnly ? (
        <div
          className={`stu-odrop${over ? " is-over" : ""}${uploading ? " is-busy" : ""}`}
          onDragEnter={onDragOver}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          data-ai-id="admin.studio.editor.file.drop"
          data-ai-type="file_dropzone"
          data-ai-label={t("editor.file.drop")}
        >
          <input
            id={inputId}
            className="sr-only"
            type="file"
            accept={STUDIO_FILE_ACCEPT}
            disabled={!enabled}
            onChange={(e) => {
              pick(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <label htmlFor={inputId} className="stu-odrop__l" aria-disabled={!enabled}>
            <span className="stu-odrop__ico" aria-hidden>
              {uploading ? <span className="stu-spin" /> : <IconUpload />}
            </span>
            <b>{uploading ? t("editor.file.uploading") : over ? t("editor.file.dropNow") : has ? t("editor.file.replace") : t("editor.file.drop")}</b>
            <span>
              {t("editor.file.or")} <u>{t("editor.file.choose")}</u>
            </span>
            <small>{t("editor.file.rules", { list: STUDIO_FILE_EXT.join(" ") })}</small>
          </label>
        </div>
      ) : null}

      {shownErr ? (
        <p className="stu-ferr" role="alert">
          {shownErr}
        </p>
      ) : null}
      {has && canUpload && !readOnly && !needsSave ? <p className="stu-hint">{t("editor.file.versionHint")}</p> : null}
    </div>
  );
}
