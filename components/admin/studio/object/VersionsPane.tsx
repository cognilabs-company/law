"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { downloadStudioVersionFile, exportStudioVersionsXlsx, type StudioDetail, type StudioVersion } from "@/lib/services/studio";
import { StudioStatusPill, useStudioErrorText, useStudioText } from "../bits";
import { VersionBadge } from "./ui";
import { IconDownload, IconEye, IconHistory, IconPaperclip, IconRocket } from "@/components/icons";

const ROLLBACK_OK = new Set(["approved", "published"]);

export default function VersionsPane({
  detail,
  canRollback,
  canExport,
  busy,
  onRollback,
  onPreview,
}: {
  detail: StudioDetail;
  canRollback: boolean;
  canExport: boolean;
  busy: boolean;
  onRollback: (v: StudioVersion) => void;
  onPreview: (v: StudioVersion) => void;
}) {
  const { t, when } = useStudioText();
  const errText = useStudioErrorText();
  const [exporting, setExporting] = useState(false);
  const [loadingFile, setLoadingFile] = useState("");

  async function doExport() {
    setExporting(true);
    try {
      await exportStudioVersionsXlsx(detail.id, detail.title);
      toast(t("shell.exportOk"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.versions.export", e);
      toast(errText(e).text || t("shell.exportFail"), { tone: "err" });
    } finally {
      setExporting(false);
    }
  }

  async function download(v: StudioVersion) {
    setLoadingFile(v.id);
    try {
      await downloadStudioVersionFile(v.id, v.fileName);
    } catch (e) {
      logApiError("studio.version.file", e);
      toast(errText(e).text || t("editor.file.downloadFail"), { tone: "err" });
    } finally {
      setLoadingFile("");
    }
  }

  const list = detail.versions;

  return (
    <div className="stu-opane" data-ai-id="admin.studio.editor.versions" data-ai-type="section" data-ai-label={t("actions.versions")}>
      <div className="stu-opane__bar">
        <small>{list.length ? t("editor.versions.count", { n: list.length }) : t("editor.versions.none")}</small>
        {canExport && list.length ? (
          <button type="button" className="btn btn--line btn--sm" onClick={doExport} disabled={exporting} data-ai-id="admin.studio.editor.versions.export" data-ai-type="button" data-ai-label={t("actions.exportVersions")}>
            {exporting ? <span className="stu-spin" aria-hidden /> : <IconDownload aria-hidden />}
            {t("editor.versions.excel")}
          </button>
        ) : null}
      </div>
      {list.length ? (
        <ol className="stu-overs">
          {list.map((v) => {
            const isCur = Boolean(v.id) && v.id === detail.currentVersionId;
            const isPub = Boolean(v.id) && v.id === detail.publishedVersionId;
            const rollback = canRollback && v.id && !isCur && !isPub && ROLLBACK_OK.has(v.status);
            const meta = [when(v.createdAt), v.createdBy].filter(Boolean).join(" · ");
            return (
              <li key={v.id || `${v.version}-${v.createdAt}`} className={`stu-overs__i${isCur ? " is-cur" : ""}`}>
                <span className="stu-overs__dot" aria-hidden />
                <div className="stu-overs__m">
                  <div className="stu-overs__top">
                    <VersionBadge version={v.version || "—"} />
                    <StudioStatusPill status={v.status} raw={v.statusRaw} small />
                    {isCur ? <em className="stu-overs__tag">{t("editor.versions.current")}</em> : null}
                    {isPub ? (
                      <em className="stu-overs__tag stu-overs__tag--live">
                        <IconRocket aria-hidden />
                        {t("editor.versions.live")}
                      </em>
                    ) : null}
                  </div>
                  {meta ? <small className="stu-overs__meta">{meta}</small> : null}
                  {v.summary ? <p className="stu-overs__sum">{v.summary}</p> : null}
                  <div className="stu-overs__acts">
                    <button type="button" className="stu-olnk" onClick={() => onPreview(v)} data-ai-id="admin.studio.editor.versions.preview" data-ai-type="button" data-ai-label={t("editor.versions.preview")}>
                      <IconEye aria-hidden />
                      {t("editor.versions.preview")}
                    </button>
                    {v.hasFile && v.id ? (
                      <button type="button" className="stu-olnk" onClick={() => void download(v)} disabled={loadingFile === v.id} title={v.fileName || undefined} data-ai-id="admin.studio.editor.versions.file" data-ai-type="button" data-ai-label={t("editor.file.download")}>
                        {loadingFile === v.id ? <span className="stu-spin" aria-hidden /> : <IconPaperclip aria-hidden />}
                        {t("editor.versions.file")}
                      </button>
                    ) : null}
                    {rollback ? (
                      <button type="button" className="stu-olnk stu-olnk--warn" onClick={() => onRollback(v)} disabled={busy} data-ai-id="admin.studio.editor.versions.rollback" data-ai-type="button" data-ai-label={t("editor.rollback.cta")}>
                        <IconHistory aria-hidden />
                        {t("editor.rollback.cta")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="stu-opane__empty">{t("editor.versions.emptyText")}</p>
      )}
    </div>
  );
}
