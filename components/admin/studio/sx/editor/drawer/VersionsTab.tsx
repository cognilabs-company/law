"use client";

import "../../sx-core.css";
import "../sx-editor-panels.css";
import { useId, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { downloadStudioVersionFile, exportStudioVersionsXlsx, type StudioDetail, type StudioVersion } from "@/lib/services/studio";
import { SxButton } from "../../Button";
import { StatusPill } from "../../StatusPill";
import { useStudioLabels } from "../../useStudioLabels";
import { RotateCcwIcon, DownloadIcon, EyeIcon, PaperclipIcon, HistoryIcon, glyph } from "../../icons";
import type { EditorState } from "../useEditorState";
import { useEditorErrorText } from "../useEditorErrorText";
import { routeStepNames, versionRollbackable } from "../model";
import { sxStatus } from "../../status";

export function versionsNewestFirst(list: readonly StudioVersion[]): StudioVersion[] {
  return list
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const at = a.v.createdAt || "";
      const bt = b.v.createdAt || "";
      if (at && bt && at !== bt) return at < bt ? 1 : -1;
      return a.i - b.i;
    })
    .map((x) => x.v);
}

export function canRollbackVersion(canRollback: boolean, detail: StudioDetail | null, v: StudioVersion): boolean {
  return canRollback && versionRollbackable(v, detail);
}

export function versionLiveMarks(v: StudioVersion, detail: StudioDetail | null): { live: boolean; tag: boolean; plainPill: boolean } {
  const live = Boolean(v.id) && v.id === detail?.publishedVersionId;
  const liveStatus = sxStatus(v.statusRaw || v.status).live;
  return { live, tag: live && !liveStatus, plainPill: liveStatus && !live && Boolean(detail?.publishedVersionId) };
}

export function VersionLine({ version, detail = null }: { version: StudioVersion; detail?: StudioDetail | null }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const meta = [version.createdAt ? labels.dateTime(version.createdAt) : "", version.createdBy].filter(Boolean).join(" · ");
  const marks = versionLiveMarks(version, detail);
  return (
    <div className="sx-ed-vline">
      <div className="sx-ed-vline__top">
        <span className="sx-code">{t("sx.editor.versionTag", { v: version.version || "—" })}</span>
        <StatusPill status={version.statusRaw || version.status} size="sm" label={marks.plainPill ? labels.status(version.statusRaw || version.status) : undefined} />
        {marks.tag ? (
          <span className="sx-ed-tag" data-live="">
            {t("sx.editor.versions.live")}
          </span>
        ) : null}
      </div>
      {meta ? <p className="sx-ed-vline__meta">{meta}</p> : null}
      {version.summary ? <p className="sx-ed-vline__sum">{version.summary}</p> : <p className="sx-ed-vline__sum" data-muted="">{t("sx.editor.versions.noSummary")}</p>}
    </div>
  );
}

export function VersionsTab({ st, onPreview, onRollback }: { st: EditorState; onPreview: (v: StudioVersion) => void; onRollback: (v: StudioVersion) => void }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errText = useEditorErrorText();
  const [exporting, setExporting] = useState(false);
  const [loadingFile, setLoadingFile] = useState("");
  const saveFirstId = useId();
  const detail = st.detail;
  const list = detail ? versionsNewestFirst(detail.versions) : [];

  async function doExport() {
    if (!detail || exporting) return;
    setExporting(true);
    try {
      await exportStudioVersionsXlsx(detail.id, st.title || detail.title);
    } catch (e) {
      logApiError("studio.sx.versions.export", e);
      toast(errText(e).text || t("sx.editor.versions.exportFail"), { tone: "err" });
    } finally {
      setExporting(false);
    }
  }

  async function download(v: StudioVersion) {
    if (!v.id || loadingFile) return;
    setLoadingFile(v.id);
    try {
      await downloadStudioVersionFile(v.id, v.fileName);
    } catch (e) {
      logApiError("studio.sx.versions.file", e);
      toast(errText(e).text || t("sx.editor.files.downloadFail"), { tone: "err" });
    } finally {
      setLoadingFile("");
    }
  }

  return (
    <div className="sx-ed-vers" data-ai-id="admin.studio.editor.versions" data-ai-type="section" data-ai-label={t("sx.editor.tab.versions")}>
      {st.can.exportVersions && list.length ? (
        <div className="sx-ed-vers__bar">
          <SxButton size="sm" icon={DownloadIcon} busy={exporting} onClick={() => void doExport()} aiId="admin.studio.editor.versions.export">
            {t("sx.editor.versions.export")}
          </SxButton>
        </div>
      ) : null}
      {st.dirty ? (
        <span className="sx-vh" id={saveFirstId}>
          {t("sx.editor.saveFirst")}
        </span>
      ) : null}
      {list.length ? (
        <ol className="sx-ed-vers__list">
          {list.map((v) => {
            const isCur = Boolean(v.id) && v.id === detail?.currentVersionId;
            const marks = versionLiveMarks(v, detail);
            const rollback = canRollbackVersion(st.can.rollback, detail, v);
            const meta = [v.createdAt ? labels.dateTime(v.createdAt) : "", v.createdBy].filter(Boolean).join(" · ");
            const steps = v.routeSnapshot?.steps ?? [];
            const stepNames = routeStepNames(labels, steps, detail?.steps ?? []);
            return (
              <li key={v.id || `${v.version}-${v.createdAt}`} className="sx-ed-vers__item" data-current={isCur ? "" : undefined}>
                <div className="sx-ed-vers__top">
                  <span className="sx-code">{t("sx.editor.versionTag", { v: v.version || "—" })}</span>
                  <StatusPill status={v.statusRaw || v.status} size="sm" label={marks.plainPill ? labels.status(v.statusRaw || v.status) : undefined} />
                  {isCur ? <span className="sx-ed-tag">{t("sx.editor.versions.current")}</span> : null}
                  {marks.tag ? (
                    <span className="sx-ed-tag" data-live="">
                      {t("sx.editor.versions.live")}
                    </span>
                  ) : null}
                </div>
                {meta ? <p className="sx-ed-vers__meta">{meta}</p> : null}
                {v.summary ? <p className="sx-ed-vers__sum">{v.summary}</p> : <p className="sx-ed-vers__sum" data-muted="">{t("sx.editor.versions.noSummary")}</p>}
                {steps.length ? (
                  <div className="sx-ed-vers__route">
                    <p className="sx-ed-vers__routet">{t("sx.editor.versions.route")}</p>
                    <ol>
                      {steps.map((s, i) => (
                        <li key={`${s.role}-${i}`} data-bare={stepNames[i] ? undefined : ""}>
                          {stepNames[i] || t("sx.editor.steps.step", { n: i + 1 })}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                <div className="sx-ed-vers__acts">
                  <SxButton variant="ghost" size="sm" icon={EyeIcon} onClick={() => onPreview(v)} aiId="admin.studio.editor.versions.preview" aria-label={`${t("sx.ui.view")}: ${t("sx.editor.versionTag", { v: v.version || "—" })}`} aiLabel={t("sx.ui.view")}>
                    {t("sx.ui.view")}
                  </SxButton>
                  {v.hasFile && v.id ? (
                    <SxButton variant="ghost" size="sm" icon={PaperclipIcon} busy={loadingFile === v.id} title={v.fileName || undefined} onClick={() => void download(v)} aiId="admin.studio.editor.versions.file">
                      {t("sx.editor.versions.file")}
                    </SxButton>
                  ) : null}
                  {rollback ? (
                    <SxButton
                      variant="ghost"
                      size="sm"
                      icon={RotateCcwIcon}
                      disabled={Boolean(st.busy)}
                      aria-disabled={st.dirty || undefined}
                      aria-describedby={st.dirty ? saveFirstId : undefined}
                      title={st.dirty ? t("sx.editor.saveFirst") : undefined}
                      onClick={() => onRollback(v)}
                      aiId="admin.studio.editor.versions.rollback"
                    >
                      {t("sx.editor.versions.rollback")}
                    </SxButton>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="sx-ed-none">
          {glyph(HistoryIcon, { size: 24 })}
          <p>{t("sx.editor.versions.empty")}</p>
        </div>
      )}
    </div>
  );
}
