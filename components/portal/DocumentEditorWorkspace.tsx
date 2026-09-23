"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  getMyLawyerDocumentRequest,
  getDocumentRequestEditor,
  createDocumentRequestMeeting,
  finalizeDocumentRequest,
  claimDocumentRequest,
  getServiceTemplateSourceFile,
  type LawyerDocumentRequest,
  type DocumentRequestEditorSession,
  type FinalizeDocumentRequestResult,
} from "@/lib/services/backend";
import { ApiError, asDict, asStr } from "@/lib/http";
import { fetchAndDeliver, extFromMime } from "@/lib/download";
import { humanizeSlug } from "@/lib/lawyers";
import { shortDateTime } from "@/lib/date";
import { subscribeUserEvents } from "@/lib/userSocket";
import { Skeleton } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DocTemplateViewer from "./DocTemplateViewer";
import CallRoom from "@/components/chat/CallRoom";
import {
  IconChevronLeft,
  IconUser,
  IconPhone,
  IconClock,
  IconCheck,
  IconAlert,
  IconVideo,
  IconChat,
  IconInfo,
  IconClipboardCheck,
  IconDownload,
  IconEye,
  IconRefresh,
  IconMenu,
} from "@/components/icons";

// LEXGO_FRONTEND_WORD_EDITOR_DESIGN_GUIDE.md: a dedicated full-page
// workspace, not a small in-card iframe/modal ("Editor sahifa card ichida
// kichik iframe bo'lmasin, full workspace bo'lsin") — this replaces the
// earlier ClaimedRequestWorkspace modal. The editor endpoint is called with
// a URL built straight from `recordId` (the route param), not a field off
// the request-detail fetch: the doc's own documented mechanism for an
// unclaimed record is to attempt this and read `claim_url` back off the 409
// body, which only works if the attempt happens regardless of whatever the
// detail fetch did or didn't say about claim state.
declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (containerId: string, config: unknown) => { destroyEditor?: () => void } };
  }
}

type RightTab = "chat" | "meeting" | "versions" | "info";
type EditorState = "loading" | "ready" | "needsClaim" | "error";

function badgeState(req: LawyerDocumentRequest | null): "new" | "taken" | "progress" | "ready" | "sent" {
  if (!req) return "new";
  if (req.status === "completed" || req.request.status === "file_ready") return req.status === "completed" ? "sent" : "ready";
  if (req.status === "claimed") return "progress";
  return "new";
}

export default function DocumentEditorWorkspace({
  ns,
  recordId,
  backHref,
}: {
  ns: string;
  recordId: string;
  backHref: string;
}) {
  const t = useTranslations(ns);
  const tc = useTranslations("cta");
  const locale = useLocale();
  const router = useRouter();

  const [reloadKey, setReloadKey] = useState(0);
  const [req, setReq] = useState<LawyerDocumentRequest | null>(null);
  const [reqStatus, setReqStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let alive = true;
    // Reload (reloadKey bump) fetches in the background without flashing
    // the skeleton — reqStatus only ever needs to leave "loading" once, on
    // the very first mount, when its useState("loading") initial value is
    // already exactly right.
    getMyLawyerDocumentRequest(recordId)
      .then((r) => {
        if (alive) {
          setReq(r);
          setReqStatus("ready");
        }
      })
      .catch(() => alive && setReqStatus("error"));
    return () => {
      alive = false;
    };
  }, [recordId, reloadKey]);

  // The editor session — fetched independently of the request-detail call
  // above (see the file header comment) so an unclaimed record's 409 is
  // always the real signal, not a client-side guess from req.canOpenEditor.
  const editorUrl = `/lawyers/me/document-requests/${recordId}/editor`;
  const [editor, setEditor] = useState<DocumentRequestEditorSession | null>(null);
  const [editorState, setEditorState] = useState<EditorState>("loading");
  const [claimUrl, setClaimUrl] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimErr, setClaimErr] = useState(false);

  useEffect(() => {
    let alive = true;
    // Same reasoning as the request-detail effect above: no synchronous
    // setState here, so a reload refetches quietly instead of flashing
    // back to a loading skeleton over an editor that's already open.
    getDocumentRequestEditor(editorUrl)
      .then((r) => {
        if (alive) {
          setEditor(r);
          setEditorState("ready");
        }
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 409) {
          const dd = asDict(e.data.detail);
          setClaimUrl(asStr(dd.claim_url) || `/call-center/document-requests/${recordId}/claim`);
          setEditorState("needsClaim");
        } else {
          setEditorState("error");
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorUrl, reloadKey]);

  async function claimAndRetry() {
    if (!claimUrl || claimBusy) return;
    setClaimBusy(true);
    setClaimErr(false);
    try {
      await claimDocumentRequest(claimUrl);
      setReloadKey((k) => k + 1);
    } catch {
      setClaimErr(true);
    } finally {
      setClaimBusy(false);
    }
  }

  // Realtime — refetch on anything that could change this exact record's
  // claim/finalize state, no polling. Deliberately NOT document_request.
  // editor_saved: that fires on every OnlyOffice autosave (seconds apart
  // while this advocate is the one actively typing), and a refetch gives
  // `editor` a new object identity each time — which the embed effect below
  // treats as "load a different session", destroying and recreating the
  // live iframe mid-edit. It's a signal for other viewers of this record,
  // not for the person currently inside the editor.
  useEffect(() => {
    return subscribeUserEvents((e) => {
      const evId = typeof e.record_id === "string" ? e.record_id : typeof e.id === "string" ? e.id : "";
      if (evId && evId !== recordId) return;
      if (e.event === "document_request.claimed" || e.event === "document_request.completed") {
        setReloadKey((k) => k + 1);
      }
    });
  }, [recordId]);

  // ── OnlyOffice embed ────────────────────────────────────────────
  // Keyed on sessionId, not the whole `editor` object: getDocumentRequestEditor
  // returns a fresh object on every fetch even when nothing actually
  // changed, and a background reload (a realtime event, claimAndRetry,
  // finalize) must not tear down and rebuild an iframe the advocate may be
  // actively typing into just because its container object's identity
  // changed.
  const ooRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const sessionId = editor?.sessionId || "";
  useEffect(() => {
    if (editorState !== "ready" || !editor?.configured || !editor.onlyoffice) return;
    const oo = editor.onlyoffice as Record<string, unknown>;
    const serverUrl = typeof oo.document_server_url === "string" ? oo.document_server_url.replace(/\/$/, "") : "";
    if (!serverUrl) return;
    let cancelled = false;
    function init() {
      if (cancelled || !window.DocsAPI) return;
      try {
        ooRef.current = new window.DocsAPI.DocEditor("onlyoffice-editor", oo);
      } catch {
        /* the fallback view stays visible if this throws */
      }
    }
    if (window.DocsAPI) {
      init();
    } else {
      const src = `${serverUrl}/web-apps/apps/api/documents/api.js`;
      const existing = document.querySelector<HTMLScriptElement>(`script[data-onlyoffice-src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", init, { once: true });
      } else {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.onlyofficeSrc = src;
        script.addEventListener("load", init, { once: true });
        document.body.appendChild(script);
      }
    }
    return () => {
      cancelled = true;
      try {
        ooRef.current?.destroyEditor?.();
      } catch {
        /* ignore */
      }
      ooRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorState, sessionId]);

  // ── Fallback (configured:false) view/download ──────────────────
  const [preview, setPreview] = useState<"template" | "editorFile" | "final" | "">("");
  async function downloadTemplate() {
    const tpl = req?.templateFile;
    if (!tpl?.hasFile) return;
    await fetchAndDeliver(() => getServiceTemplateSourceFile(tpl.downloadUrl || tpl.inlineUrl), tpl.fileName || "shablon.docx", true);
  }
  async function downloadEditorFile() {
    if (!editor?.editorFileDownloadUrl) return;
    await fetchAndDeliver(() => getServiceTemplateSourceFile(editor.editorFileDownloadUrl), req?.templateFile?.fileName || "loyiha.docx", true);
  }

  // ── Meeting (reuses the app's existing LiveKit CallRoom, same pattern
  // as CcMeetingButton.tsx) ────────────────────────────────────────
  const [meeting, setMeeting] = useState<{ roomId: string; callId: string; lk: { url: string; room: string; token: string } | null } | null>(null);
  const [meetBusy, setMeetBusy] = useState(false);
  const [meetErr, setMeetErr] = useState(false);
  async function startMeeting() {
    if (!req?.meetingUrl || meetBusy || meeting) return;
    setMeetBusy(true);
    setMeetErr(false);
    try {
      const m = await createDocumentRequestMeeting(req.meetingUrl, {
        call_type: "video",
        title: req.clientName ? `${t("startMeeting")} · ${req.clientName}` : t("startMeeting"),
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

  // ── Finalize ─────────────────────────────────────────────────────
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeErr, setFinalizeErr] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeDocumentRequestResult | null>(null);
  async function doFinalize() {
    if (!editor || finalizeBusy) return;
    setFinalizeBusy(true);
    setFinalizeErr(false);
    try {
      const r = await finalizeDocumentRequest(editor.finalizeUrl);
      setFinalizeResult(r);
      setFinalizeConfirmOpen(false);
      setReloadKey((k) => k + 1);
    } catch {
      setFinalizeErr(true);
    } finally {
      setFinalizeBusy(false);
    }
  }

  const cf = req?.request.contractFile;
  const finalFile = finalizeResult
    ? { inline: finalizeResult.fileInlineUrl, download: finalizeResult.fileDownloadUrl, format: finalizeResult.fileFormat }
    : cf
      ? { inline: cf.inlineUrl, download: cf.downloadUrl, format: extFromMime(cf.mimeType) || "docx" }
      : null;
  async function downloadFinalFile() {
    if (!finalFile || (!finalFile.download && !finalFile.inline)) return;
    await fetchAndDeliver(
      () => getServiceTemplateSourceFile(finalFile.download || finalFile.inline),
      `${req?.clientName || "hujjat"}.${finalFile.format || "docx"}`,
      true,
    );
  }
  const isSent = req?.status === "completed";

  // ── Panels ───────────────────────────────────────────────────────
  // Panels are grid columns on desktop (both open by default) but fixed
  // overlay drawers on mobile (see .deditor__left/.deditor__right's own
  // media query) — starting them open there would cover the whole editor
  // the instant this page mounts, so the default itself is viewport-aware.
  const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1101px)").matches;
  const [leftOpen, setLeftOpen] = useState(wide);
  const [rightOpen, setRightOpen] = useState(wide);
  const [rightTab, setRightTab] = useState<RightTab>("meeting");

  const answerEntries = req ? Object.entries(req.answers).filter(([, v]) => v != null && v !== "") : [];
  const badge = badgeState(req);
  const badgeLabel = { new: t("statusNew"), taken: t("statusTaken"), progress: t("statusInProgress"), ready: t("statusReady"), sent: t("statusSent") }[badge];

  return (
    <div className="deditor">
      <div className="deditor__top">
        <button type="button" className="deditor__back" onClick={() => router.push(backHref)}>
          <IconChevronLeft />
          {tc("back")}
        </button>
        {/* Mobile-only (see .deditor__toggle's own media query) — on
            desktop both panels are already open as grid columns. The left
            panel's own close button lives inside it, but nothing else
            could ever open it in the first place once it starts closed on
            a narrow screen without this. */}
        <button type="button" className="deditor__toggle" onClick={() => setLeftOpen((v) => !v)} aria-label={t("togglePanels")}>
          <IconMenu />
        </button>
        <b className="deditor__title">{req?.title || req?.clientName || t("title")}</b>
        <span className={`deditor__badge deditor__badge--${badge}`}>{badgeLabel}</span>
        <span className="deditor__spacer" />
        <button type="button" className="deditor__act" onClick={startMeeting} disabled={meetBusy || !req?.meetingUrl || isSent}>
          <IconVideo />
          {meetBusy ? t("processingShort") : t("startMeeting")}
        </button>
        <button
          type="button"
          className="deditor__act deditor__act--primary"
          onClick={() => setFinalizeConfirmOpen(true)}
          disabled={isSent || editorState !== "ready" || finalizeBusy}
        >
          <IconCheck />
          {isSent ? t("statusSent") : t("finalize")}
        </button>
        <button type="button" className="deditor__toggle" onClick={() => setRightOpen((v) => !v)} aria-label={t("togglePanels")}>
          <IconMenu />
        </button>
      </div>

      {finalizeErr ? <Notice ok={false} msg={t("finalizeError")} /> : null}
      {meetErr ? <Notice ok={false} msg={t("meetingError")} /> : null}

      <div className={`deditor__body${leftOpen ? "" : " deditor__body--leftClosed"}${rightOpen ? "" : " deditor__body--rightClosed"}`}>
        <aside className={`deditor__left${leftOpen ? " on" : ""}`}>
          <button type="button" className="deditor__panelToggle" onClick={() => setLeftOpen((v) => !v)}>
            <IconChevronLeft />
          </button>
          {reqStatus === "loading" ? (
            <Skeleton rows={5} />
          ) : !req ? (
            <Notice ok={false} msg={t("templateError")} />
          ) : (
            <>
              <div className="deditor__row">
                <IconUser />
                <b>{req.clientName || "—"}</b>
              </div>
              {req.clientPhone ? (
                <div className="deditor__row">
                  <IconPhone />
                  <span>{req.clientPhone}</span>
                </div>
              ) : null}
              {req.serviceName ? (
                <div className="deditor__field">
                  <label>{t("serviceLabel")}</label>
                  <p>{req.serviceName}</p>
                </div>
              ) : null}
              {req.templateFile?.fileName ? (
                <div className="deditor__field">
                  <label>{t("templateLabel")}</label>
                  <p>{req.templateFile.fileName}</p>
                </div>
              ) : null}
              <div className="deditor__field">
                <label>{t("need")}</label>
                <p className="deditor__need">{req.need || "—"}</p>
                {answerEntries.length ? (
                  <div className="oquote" style={{ marginTop: 6 }}>
                    {answerEntries.map(([k, v]) => (
                      <div className="oquote__row" key={k}>
                        <span>{humanizeSlug(k)}</span>
                        <b>{String(v)}</b>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {req.createdAt ? (
                <div className="deditor__row">
                  <IconClock />
                  <span>{shortDateTime(req.createdAt, locale)}</span>
                </div>
              ) : null}
              {req.templateFile?.hasFile ? (
                <div className="chiprow" style={{ margin: "4px 0 0" }}>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setPreview("template")}>
                    <IconEye /> {t("viewTemplate")}
                  </button>
                  <button type="button" className="btn btn--line btn--sm" onClick={downloadTemplate}>
                    <IconDownload /> {t("downloadTemplate")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </aside>

        <main className="deditor__main">
          {editorState === "loading" ? (
            <div className="deditor__mainState">
              <Skeleton rows={6} />
            </div>
          ) : editorState === "needsClaim" ? (
            <div className="deditor__mainState">
              <IconAlert />
              <b>{t("needClaimTitle")}</b>
              <p className="advmuted">{t("needClaimLead")}</p>
              {claimErr ? <Notice ok={false} msg={t("claimError")} /> : null}
              <button className="btn btn--grad btn--lg" type="button" onClick={claimAndRetry} disabled={claimBusy}>
                {claimBusy ? t("claiming") : t("claim")}
              </button>
            </div>
          ) : editorState === "error" ? (
            <div className="deditor__mainState">
              <IconAlert />
              <Notice ok={false} msg={t("templateError")} />
              <button className="btn btn--line" type="button" onClick={() => setReloadKey((k) => k + 1)}>
                <IconRefresh /> {t("retryLater")}
              </button>
            </div>
          ) : editor?.configured ? (
            <div id="onlyoffice-editor" className="deditor__oo" />
          ) : (
            <div className="deditor__mainState">
              <b>{t("editorNotConfigured")}</b>
              <p className="advmuted">{t("editorNotConfiguredLead")}</p>
              <div className="chiprow">
                <button type="button" className="btn btn--line" onClick={() => setPreview("editorFile")}>
                  <IconEye /> {t("openDocx")}
                </button>
                <button type="button" className="btn btn--line" onClick={downloadEditorFile}>
                  <IconDownload /> {t("downloadDocx")}
                </button>
                <button type="button" className="btn btn--line" onClick={() => setReloadKey((k) => k + 1)}>
                  <IconRefresh /> {t("retryLater")}
                </button>
              </div>
            </div>
          )}
        </main>

        <aside className={`deditor__right${rightOpen ? " on" : ""}`}>
          <div className="deditor__tabs">
            {(["meeting", "chat", "versions", "info"] as RightTab[]).map((tab) => (
              <button key={tab} type="button" className={rightTab === tab ? "on" : ""} onClick={() => setRightTab(tab)}>
                {tab === "meeting" ? <IconVideo /> : tab === "chat" ? <IconChat /> : tab === "versions" ? <IconClipboardCheck /> : <IconInfo />}
                {t(tab === "meeting" ? "tabMeeting" : tab === "chat" ? "tabChat" : tab === "versions" ? "tabVersions" : "tabInfo")}
              </button>
            ))}
          </div>
          <div className="deditor__tabBody">
            {rightTab === "meeting" ? (
              <div className="deditor__field">
                <button type="button" className="btn btn--grad btn--full" onClick={startMeeting} disabled={meetBusy || !req?.meetingUrl || !!meeting || isSent}>
                  <IconVideo /> {meeting ? t("statusInProgress") : meetBusy ? t("processingShort") : t("startMeeting")}
                </button>
                {meetErr ? <Notice ok={false} msg={t("meetingError")} /> : null}
              </div>
            ) : rightTab === "chat" ? (
              <p className="advmuted">{t("chatUnavailable")}</p>
            ) : rightTab === "versions" ? (
              <div className="deditor__field">
                <label>{t("tabVersions")}</label>
                {finalFile ? (
                  <div className="chiprow" style={{ margin: "6px 0 0" }}>
                    <button type="button" className="btn btn--line btn--sm" onClick={() => setPreview("final")}>
                      <IconEye /> {t("viewFinalFile")}
                    </button>
                    <button type="button" className="btn btn--line btn--sm" onClick={downloadFinalFile}>
                      <IconDownload /> {t("downloadFinalFile")}
                    </button>
                  </div>
                ) : (
                  <p className="advmuted">{t("noFinalYet")}</p>
                )}
              </div>
            ) : (
              <div className="deditor__field">
                <label>{t("infoLawyerRequestId")}</label>
                <p>{req?.id || "—"}</p>
                <label>{t("infoDocumentRequestId")}</label>
                <p>{req?.request.id || "—"}</p>
                <label>{t("infoTemplateId")}</label>
                <p>{req?.request.templateId || "—"}</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <DocTemplateViewer
        open={preview === "template"}
        onClose={() => setPreview("")}
        title={req?.templateFile?.fileName || t("templateLabel")}
        fetchBlob={req?.templateFile?.hasFile ? () => getServiceTemplateSourceFile(req.templateFile!.downloadUrl || req.templateFile!.inlineUrl) : null}
        fileName={req?.templateFile?.fileName || "shablon.docx"}
      />
      <DocTemplateViewer
        open={preview === "editorFile"}
        onClose={() => setPreview("")}
        title={t("editorFile")}
        fetchBlob={editor?.editorFileDownloadUrl ? () => getServiceTemplateSourceFile(editor.editorFileDownloadUrl) : null}
        fileName={req?.templateFile?.fileName || "loyiha.docx"}
      />
      <DocTemplateViewer
        open={preview === "final"}
        onClose={() => setPreview("")}
        title={t("viewFinalFile")}
        fetchBlob={finalFile?.inline || finalFile?.download ? () => getServiceTemplateSourceFile(finalFile.inline || finalFile.download) : null}
        fileName={`${req?.clientName || "hujjat"}.${finalFile?.format || "docx"}`}
      />

      <Modal open={finalizeConfirmOpen} onClose={() => setFinalizeConfirmOpen(false)} title={t("finalize")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p className="advmuted">{t("finalizeConfirmText")}</p>
          {finalizeErr ? <Notice ok={false} msg={t("finalizeError")} /> : null}
          <button className="btn btn--grad btn--full btn--lg" type="button" onClick={doFinalize} disabled={finalizeBusy}>
            {finalizeBusy ? t("processingShort") : t("finalizeConfirmYes")}
          </button>
        </div>
      </Modal>

      {/* Outside the page's own conditional rendering: an active LiveKit call
          must survive whatever else happens on this page (tab switches,
          panel toggles) — same reasoning as ClaimedRequestWorkspace before
          it, just without a Modal to accidentally unmount it here. */}
      {meeting ? (
        <CallRoom
          roomId={meeting.roomId}
          callId={meeting.callId}
          callType="video"
          isCaller
          title={req?.clientName ? `${t("startMeeting")} · ${req.clientName}` : t("startMeeting")}
          lk={meeting.lk}
          onEnd={() => setMeeting(null)}
        />
      ) : null}
    </div>
  );
}
