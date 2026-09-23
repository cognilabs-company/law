"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getServiceTemplateSourceFile,
  getDocumentRequestEditor,
  saveDocumentRequestDraft,
  createDocumentRequestMeeting,
  finalizeDocumentRequest,
  type LawyerDocumentRequest,
  type DocumentRequestEditorSession,
  type FinalizeDocumentRequestResult,
} from "@/lib/services/backend";
import { fetchAndDeliver } from "@/lib/download";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DocTemplateViewer from "./DocTemplateViewer";
import CallRoom from "@/components/chat/CallRoom";
import { IconCheck, IconDownload, IconEye, IconPhone, IconVideo } from "@/components/icons";

// LEXGO_FRONTEND_DOCUMENT_CALLCENTER_EDITOR_FLOW.md: the workspace for a
// request this advocate has already claimed — replaces FulfillModal's plain
// upload form for anything that went through the pool (target.editorUrl is
// only ever set for those; DocumentRequestsInbox falls back to FulfillModal
// for an older request with none). Two columns instead of one long stacked
// column (the previous "modal too big" complaint was really about height,
// not width — the old one used the same 980px, just as one tall column).
export default function ClaimedRequestWorkspace({
  ns,
  target,
  onClose,
  onDone,
}: {
  ns: string;
  target: LawyerDocumentRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations(ns);
  const [editor, setEditor] = useState<DocumentRequestEditorSession | null>(null);
  const [editorStatus, setEditorStatus] = useState<"loading" | "ready" | "error">("loading");
  const [preview, setPreview] = useState<"template" | "draft" | "final" | "">("");

  const [draftText, setDraftText] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftNote, setDraftNote] = useState<{ ok: boolean; msg: string } | null>(null);

  const [meeting, setMeeting] = useState<{ roomId: string; callId: string; lk: { url: string; room: string; token: string } | null } | null>(null);
  const [meetBusy, setMeetBusy] = useState(false);
  const [meetErr, setMeetErr] = useState(false);

  const [finalizeNotes, setFinalizeNotes] = useState("");
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeDocumentRequestResult | null>(null);
  const [finalizeErr, setFinalizeErr] = useState(false);

  // Only reset for a genuinely different request, not for `target` going
  // null — that's just the modal closing, which must not silently end an
  // active meeting (prevId isn't touched, so reopening the SAME request
  // later doesn't re-trigger this either: the meeting, draft text and
  // editor session are all still exactly where they were left).
  const [prevId, setPrevId] = useState(target?.id);
  if (target && target.id !== prevId) {
    setPrevId(target.id);
    setEditor(null);
    setEditorStatus("loading");
    setPreview("");
    setDraftText("");
    setDraftNote(null);
    setMeeting(null);
    setMeetErr(false);
    setFinalizeNotes("");
    setFinalizeResult(null);
    setFinalizeErr(false);
  }

  useEffect(() => {
    if (!target?.editorUrl) return;
    let alive = true;
    getDocumentRequestEditor(target.editorUrl)
      .then((r) => {
        if (alive) {
          setEditor(r);
          setEditorStatus("ready");
        }
      })
      .catch(() => alive && setEditorStatus("error"));
    return () => {
      alive = false;
    };
  }, [target?.editorUrl]);

  async function saveDraft() {
    if (!editor || draftBusy) return;
    setDraftBusy(true);
    setDraftNote(null);
    try {
      await saveDocumentRequestDraft(editor.draftUrl, { content_text: draftText });
      setDraftNote({ ok: true, msg: t("draftSaved") });
    } catch {
      setDraftNote({ ok: false, msg: t("draftError") });
    } finally {
      setDraftBusy(false);
    }
  }

  async function startMeeting() {
    if (!target?.meetingUrl || meetBusy || meeting) return;
    setMeetBusy(true);
    setMeetErr(false);
    try {
      const m = await createDocumentRequestMeeting(target.meetingUrl, {
        call_type: "video",
        title: target.clientName ? t("startMeeting") + " · " + target.clientName : t("startMeeting"),
        max_duration_minutes: 60,
      });
      setMeeting({
        roomId: m.roomId,
        callId: m.id,
        lk: m.livekitToken ? { url: m.livekitUrl, room: m.livekitRoom, token: m.livekitToken } : null,
      });
    } catch {
      setMeetErr(true);
    } finally {
      setMeetBusy(false);
    }
  }

  async function finalize() {
    if (!editor || finalizeBusy || finalizeResult) return;
    setFinalizeBusy(true);
    setFinalizeErr(false);
    try {
      setFinalizeResult(await finalizeDocumentRequest(editor.finalizeUrl, finalizeNotes.trim() || undefined));
      onDone();
    } catch {
      setFinalizeErr(true);
    } finally {
      setFinalizeBusy(false);
    }
  }

  async function downloadTemplate() {
    const tpl = target?.templateFile;
    if (!tpl?.hasFile) return;
    await fetchAndDeliver(() => getServiceTemplateSourceFile(tpl.downloadUrl || tpl.inlineUrl), tpl.fileName || "shablon.docx", true);
  }
  async function downloadEditorFile() {
    if (!editor?.editorFileDownloadUrl) return;
    await fetchAndDeliver(() => getServiceTemplateSourceFile(editor.editorFileDownloadUrl), target?.templateFile?.fileName || "loyiha.docx", true);
  }
  async function downloadFinalFile() {
    if (!finalizeResult?.fileDownloadUrl) return;
    await fetchAndDeliver(
      () => getServiceTemplateSourceFile(finalizeResult.fileDownloadUrl),
      `${target?.clientName || "hujjat"}.${finalizeResult.fileFormat || "docx"}`,
      true,
    );
  }

  const answerEntries = target ? Object.entries(target.answers).filter(([, v]) => v != null && v !== "") : [];
  const tpl = target?.templateFile;

  return (
    <>
    <Modal open={!!target} onClose={onClose} title={target?.clientName || target?.title || t("title")} wide>
      {target ? (
        <div className="cform docassist docassist--split" style={{ maxWidth: "none" }}>
          <div className="docassist--col">
            {target.clientPhone ? (
              <p className="advmuted" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <IconPhone style={{ width: 14, height: 14 }} />
                {target.clientPhone}
              </p>
            ) : null}

            <section className="docassist__sec">
              <label>{t("need")}</label>
              <p style={{ margin: 0, fontSize: ".92rem" }}>{target.need || "—"}</p>
              {answerEntries.length ? (
                <div className="oquote" style={{ marginTop: 4 }}>
                  {answerEntries.map(([k, v]) => (
                    <div className="oquote__row" key={k}>
                      <span>{humanizeSlug(k)}</span>
                      <b>{String(v)}</b>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="docassist__sec">
              <label>{t("templateLabel")}</label>
              {tpl?.hasFile ? (
                <div className="chiprow" style={{ margin: "4px 0 0" }}>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setPreview("template")}>
                    <IconEye /> {t("viewTemplate")}
                  </button>
                  <button type="button" className="btn btn--line btn--sm" onClick={downloadTemplate}>
                    <IconDownload /> {t("downloadTemplate")}
                  </button>
                </div>
              ) : (
                <p className="advmuted">{t("noTemplate")}</p>
              )}
            </section>

            <section className="docassist__sec">
              <button type="button" className="btn btn--line btn--full" onClick={startMeeting} disabled={meetBusy || !target.meetingUrl}>
                <IconVideo /> {meetBusy ? t("processingShort") : t("startMeeting")}
              </button>
              {meetErr ? <Notice ok={false} msg={t("meetingError")} /> : null}
            </section>
          </div>

          <div className="docassist--col">
            <section className="docassist__sec">
              <label>{t("workspaceEditor")}</label>
              {editorStatus === "loading" ? (
                <Skeleton rows={2} />
              ) : editorStatus === "error" ? (
                <Notice ok={false} msg={t("templateError")} />
              ) : (
                <>
                  {!editor?.configured ? <p className="advmuted" style={{ margin: 0 }}>{t("onlyofficeNotice")}</p> : null}
                  {editor?.editorFileDownloadUrl ? (
                    <div className="chiprow" style={{ margin: "4px 0 0" }}>
                      <button type="button" className="btn btn--line btn--sm" onClick={() => setPreview("draft")}>
                        <IconEye /> {t("viewEditorFile")}
                      </button>
                      <button type="button" className="btn btn--line btn--sm" onClick={downloadEditorFile}>
                        <IconDownload /> {t("downloadEditorFile")}
                      </button>
                    </div>
                  ) : null}

                  <label htmlFor="draft-text" style={{ marginTop: 10 }}>{t("draftLabel")}</label>
                  <textarea id="draft-text" rows={6} value={draftText} onChange={(e) => setDraftText(e.target.value)} />
                  <button type="button" className="btn btn--line btn--full" style={{ marginTop: 6 }} onClick={saveDraft} disabled={draftBusy}>
                    {draftBusy ? t("processingShort") : t("saveDraft")}
                  </button>
                  {draftNote ? <Notice ok={draftNote.ok} msg={draftNote.msg} /> : null}
                </>
              )}
            </section>

            <section className="docassist__sec">
              {finalizeResult ? (
                <>
                  <p className="cform__ok" style={{ margin: 0 }}>
                    <IconCheck style={{ width: 16, height: 16 }} /> {t("finalized")}
                  </p>
                  <div className="chiprow" style={{ margin: "8px 0 0" }}>
                    <button type="button" className="btn btn--line btn--sm" onClick={() => setPreview("final")}>
                      <IconEye /> {t("viewFinalFile")}
                    </button>
                    <button type="button" className="btn btn--line btn--sm" onClick={downloadFinalFile}>
                      <IconDownload /> {t("downloadFinalFile")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor="finalize-notes">{t("finalizeNotes")}</label>
                  <textarea id="finalize-notes" rows={2} value={finalizeNotes} onChange={(e) => setFinalizeNotes(e.target.value)} />
                  {finalizeErr ? <Notice ok={false} msg={t("finalizeError")} /> : null}
                  <button className="btn btn--grad btn--full btn--lg" type="button" onClick={finalize} disabled={finalizeBusy || editorStatus !== "ready"}>
                    {finalizeBusy ? t("processingShort") : t("finalize")}
                  </button>
                </>
              )}
            </section>
          </div>
        </div>
      ) : null}

      <DocTemplateViewer
        open={preview === "template"}
        onClose={() => setPreview("")}
        title={tpl?.fileName || t("templateLabel")}
        fetchBlob={tpl?.hasFile ? () => getServiceTemplateSourceFile(tpl.downloadUrl || tpl.inlineUrl) : null}
        fileName={tpl?.fileName || "shablon.docx"}
      />
      <DocTemplateViewer
        open={preview === "draft"}
        onClose={() => setPreview("")}
        title={t("editorFile")}
        fetchBlob={editor?.editorFileDownloadUrl ? () => getServiceTemplateSourceFile(editor.editorFileDownloadUrl) : null}
        fileName={target?.templateFile?.fileName || "loyiha.docx"}
      />
      <DocTemplateViewer
        open={preview === "final"}
        onClose={() => setPreview("")}
        title={t("viewFinalFile")}
        fetchBlob={finalizeResult?.fileInlineUrl || finalizeResult?.fileDownloadUrl ? () => getServiceTemplateSourceFile(finalizeResult.fileInlineUrl || finalizeResult.fileDownloadUrl) : null}
        fileName={`${target?.clientName || "hujjat"}.${finalizeResult?.fileFormat || "docx"}`}
      />

    </Modal>
    {/* Outside the Modal on purpose: Modal unmounts everything inside it the
        instant it closes (see Modal.tsx's `if (!open) return null`) — an
        active LiveKit call is a live connection, not modal content, and
        closing the workspace to go do something else must not silently drop
        it. Same pattern CcMeetingButton.tsx already uses elsewhere. */}
    {meeting ? (
      <CallRoom
        roomId={meeting.roomId}
        callId={meeting.callId}
        callType="video"
        isCaller
        title={target?.clientName ? `${t("startMeeting")} · ${target.clientName}` : t("startMeeting")}
        lk={meeting.lk}
        onEnd={() => setMeeting(null)}
      />
    ) : null}
    </>
  );
}
