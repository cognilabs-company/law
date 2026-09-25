"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  getMyLawyerDocumentRequest,
  getDocumentRequestEditor,
  createDocumentRequestMeeting,
  finalizeDocumentRequest,
  claimDocumentRequest,
  getServiceTemplateSourceFile,
  getCall,
  joinCall,
  type LawyerDocumentRequest,
  type DocumentRequestEditorSession,
  type FinalizeDocumentRequestResult,
  type CallParticipant,
} from "@/lib/services/backend";
import { ApiError, asDict, asStr, isConflict, logApiError } from "@/lib/http";
import { fetchAndDeliver, extFromMime } from "@/lib/download";
import { humanizeSlug, initials } from "@/lib/lawyers";
import { shortDateTime } from "@/lib/date";
import { subscribeUserEvents } from "@/lib/userSocket";
import { Skeleton } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DocTemplateViewer from "./DocTemplateViewer";
import CallRoom from "@/components/chat/CallRoom";
import SecureChat from "@/components/chat/SecureChat";
import {
  IconChevronLeft,
  IconUsers,
  IconPhone,
  IconClock,
  IconCheck,
  IconAlert,
  IconVideo,
  IconChat,
  IconInfo,
  IconDownload,
  IconEye,
  IconRefresh,
  IconMenu,
  IconFileText,
  IconHeadset,
} from "@/components/icons";

// LEXGO_FRONTEND_WORD_EDITOR_DESIGN_GUIDE.md: a dedicated full-page
// workspace, not a small in-card iframe/modal ("Editor sahifa card ichida
// kichik iframe bo'lmasin, full workspace bo'lsin"). PortalShell puts this
// route into its `portal--full` mode, which is what gives the OnlyOffice
// iframe a real viewport-height chain to fill.
//
// The editor endpoint is called with a URL built straight from `recordId`
// (the route param), not a field off the request-detail fetch: the doc's own
// documented mechanism for an unclaimed record is to attempt this and read
// `claim_url` back off the 409 body, which only works if the attempt happens
// regardless of whatever the detail fetch did or didn't say about claim state.
declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (containerId: string, config: unknown) => { destroyEditor?: () => void } };
  }
}

type RightTab = "chat" | "meeting" | "versions" | "info";
type EditorState = "loading" | "ready" | "needsClaim" | "error";
type SaveState = "" | "saving" | "saved" | "error";
type Meeting = { roomId: string; callId: string; lk: { url: string; room: string; token: string } | null; open: boolean; isCaller: boolean };

// MD2's five documented states: Yangi / Olingan / Jarayonda / Tayyor / Yuborilgan.
// "Olingan" is a claimed record nobody has saved anything on yet; it becomes
// "Jarayonda" as soon as there is a save to show for it.
function badgeState(
  req: LawyerDocumentRequest | null,
  finalized: boolean,
  touched: boolean,
): "new" | "taken" | "progress" | "ready" | "sent" {
  if (finalized || req?.status === "completed") return "sent";
  if (req?.request.status === "file_ready") return "ready";
  if (req?.status === "claimed") return touched ? "progress" : "taken";
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
  const tf = useTranslations("portal.client.documents.fields");
  const locale = useLocale();
  const router = useRouter();

  const [reloadKey, setReloadKey] = useState(0);
  // Refetch of the REQUEST RECORD only. Bumping reloadKey re-runs the editor
  // effect too, and getDocumentRequestEditor hands back a fresh session id, so
  // the OnlyOffice embed below tore the iframe down and built a new one — the
  // "editor refreshed itself" the advocate saw the moment they pressed "send
  // to the client". Status changes need the record, never a new editor
  // session, so they bump this instead.
  const [reqReloadKey, setReqReloadKey] = useState(0);
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
      .catch((e) => {
        if (!alive) return;
        logApiError("document-request detail", e);
        setReqStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [recordId, reloadKey, reqReloadKey]);

  // The editor session — fetched independently of the request-detail call
  // above (see the file header comment) so an unclaimed record's 409 is
  // always the real signal, not a client-side guess from req.canOpenEditor.
  const editorUrl = `/lawyers/me/document-requests/${recordId}/editor`;
  const [editor, setEditor] = useState<DocumentRequestEditorSession | null>(null);
  const [editorState, setEditorState] = useState<EditorState>("loading");
  const [editorErrStatus, setEditorErrStatus] = useState(0);
  const [claimUrl, setClaimUrl] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimErr, setClaimErr] = useState<"" | "taken" | "generic">("");

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
          return;
        }
        logApiError("document-request editor", e);
        setEditorErrStatus(e instanceof ApiError ? e.status : 0);
        setEditorState("error");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorUrl, reloadKey]);

  async function claimAndRetry() {
    if (!claimUrl || claimBusy) return;
    setClaimBusy(true);
    setClaimErr("");
    try {
      await claimDocumentRequest(claimUrl);
      setReloadKey((k) => k + 1);
    } catch (e) {
      // Someone else got there first: retrying can never succeed, so say so
      // instead of offering the same button again.
      setClaimErr(isConflict(e) ? "taken" : "generic");
      if (!isConflict(e)) logApiError("document-request claim", e);
    } finally {
      setClaimBusy(false);
    }
  }

  // ── Save status (MD2 top bar: Saqlanmoqda… / Saqlangan / Saqlashda xatolik)
  const [saveState, setSaveState] = useState<SaveState>("");
  const [savedAt, setSavedAt] = useState("");

  // Realtime. Only claim/finalize refetch the record; `editor_saved` must
  // NOT — it fires on every OnlyOffice autosave (seconds apart while this
  // advocate is typing) and a refetch gives `editor` a new object identity,
  // which the embed effect below would treat as "load a different session"
  // and tear the live iframe down mid-edit. It only moves the save chip.
  useEffect(() => {
    return subscribeUserEvents((e) => {
      const evId = typeof e.record_id === "string" ? e.record_id : typeof e.id === "string" ? e.id : "";
      if (evId && evId !== recordId) return;
      if (e.event === "document_request.editor_saved") {
        setSaveState("saved");
        setSavedAt(typeof e.saved_at === "string" ? e.saved_at : new Date().toISOString());
        return;
      }
      // Claiming is what unlocks the editor (it answers 409 until then), so
      // that one really does need the editor session refetched. The other two
      // are status changes — including the echo of this advocate's own
      // finalize, which would otherwise reload the editor a second time.
      if (e.event === "document_request.claimed") { setReloadKey((k) => k + 1); return; }
      if (e.event === "document_request.completed" || e.event === "document_request.meeting_created") {
        setReqReloadKey((k) => k + 1);
      }
    });
  }, [recordId]);

  // ── OnlyOffice embed ────────────────────────────────────────────
  // Keyed on sessionId + configured, not the whole `editor` object:
  // getDocumentRequestEditor returns a fresh object on every fetch even when
  // nothing changed, and a background reload must not tear down and rebuild
  // an iframe the advocate may be actively typing into. `configured` is in
  // the key so a false→true retry actually mounts the editor.
  const ooRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const sessionId = editor?.sessionId || "";
  const configured = !!editor?.configured;
  useEffect(() => {
    if (editorState !== "ready" || !configured || !editor?.onlyoffice) return;
    const oo = editor.onlyoffice as Record<string, unknown>;
    const serverUrl = typeof oo.document_server_url === "string" ? oo.document_server_url.replace(/\/$/, "") : "";
    if (!serverUrl) return;
    let cancelled = false;
    const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    const editorConfig = asDict(oo.editorConfig);
    // The save chip needs OnlyOffice to tell us when a change is pending vs
    // flushed; onError covers a failed save. These are browser-side
    // callbacks — never part of what the document server validates.
    const events = {
      onDocumentStateChange: (ev: { data?: unknown }) => setSaveState(ev && ev.data ? "saving" : "saved"),
      onError: () => setSaveState("error"),
    };
    // A `token` means the backend signed this config (JWT_ENABLED=true is the
    // Document Server default since 7.2). The server validates the config the
    // browser hands to api.js against that signature, so changing ANY field
    // here — type, customization — makes it reject the document with "The
    // document security token is not correctly formed". A signed config is
    // therefore passed through untouched, and the desktop/mobile switch plus
    // the autosave flags are the backend's to set inside what it signs.
    const cfg = asStr(oo.token)
      ? { ...oo, events }
      : {
          ...oo,
          // "Mobile editor uchun OnlyOffice mobile view ishlatiladi" — the
          // backend always sends type:"desktop", so the phone case is
          // decided here whenever it is safe to touch the config at all.
          type: mobile ? "mobile" : "desktop",
          editorConfig: {
            ...editorConfig,
            customization: { ...asDict(editorConfig.customization), autosave: true, forcesave: true },
          },
          events,
        };
    function init() {
      if (cancelled || !window.DocsAPI) return;
      try {
        ooRef.current = new window.DocsAPI.DocEditor("onlyoffice-editor", cfg);
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
  }, [editorState, sessionId, configured]);

  // ── Files ────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<"template" | "editorFile" | "final" | "">("");
  const [fileErr, setFileErr] = useState(false);
  async function downloadTemplate() {
    const tpl = req?.templateFile;
    if (!tpl?.hasFile) return;
    const ok = await fetchAndDeliver(() => getServiceTemplateSourceFile(tpl.downloadUrl || tpl.inlineUrl), tpl.fileName || "shablon.docx", true);
    if (!ok) setFileErr(true);
  }
  async function downloadEditorFile() {
    if (!editor?.editorFileDownloadUrl) return;
    const ok = await fetchAndDeliver(() => getServiceTemplateSourceFile(editor.editorFileDownloadUrl), req?.templateFile?.fileName || "loyiha.docx", true);
    if (!ok) setFileErr(true);
  }

  // ── Meeting ──────────────────────────────────────────────────────
  // The created meeting survives closing the call window: MD2's Meeting tab
  // wants an "Active meeting status" and a "Join button", which means the
  // room has to stay addressable after the advocate steps out of it.
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [meetBusy, setMeetBusy] = useState(false);
  const [meetErr, setMeetErr] = useState(false);
  const [roster, setRoster] = useState<CallParticipant[]>([]);
  async function startMeeting() {
    if (!req?.meetingUrl || meetBusy || meeting) return;
    setMeetBusy(true);
    setMeetErr(false);
    try {
      // No max_duration_minutes: LEXGO_MEETING_EXTENSION_FRONTEND_UPDATE.md
      // makes the backend default 15 minutes for a document meeting, and
      // sending 60 here would quietly override the limit the extension and
      // billing flow is built around.
      const m = await createDocumentRequestMeeting(req.meetingUrl, {
        call_type: "video",
        title: req.clientName ? `${t("meetingTitle")} · ${req.clientName}` : t("meetingTitle"),
      });
      setMeeting({
        roomId: m.roomId,
        callId: m.id,
        lk: m.livekitToken ? { url: m.livekitUrl, room: m.livekitRoom, token: m.livekitToken } : null,
        open: true,
        isCaller: true,
      });
    } catch (e) {
      logApiError("document-request meeting", e);
      setMeetErr(true);
    } finally {
      setMeetBusy(false);
    }
  }
  async function rejoinMeeting() {
    if (!meeting || meetBusy) return;
    setMeetBusy(true);
    setMeetErr(false);
    try {
      const lk = await joinCall(meeting.roomId, meeting.callId);
      setMeeting((m) => (m ? { ...m, lk, open: true, isCaller: false } : m));
    } catch (e) {
      logApiError("document-request meeting join", e);
      setMeetErr(true);
    } finally {
      setMeetBusy(false);
    }
  }

  // ── Panels ───────────────────────────────────────────────────────
  // Grid columns on desktop, fixed overlay drawers on mobile — starting them
  // open there would cover the whole editor the instant this page mounts, so
  // the default is viewport-aware.
  const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1101px)").matches;
  const [leftOpen, setLeftOpen] = useState(wide);
  const [rightOpen, setRightOpen] = useState(wide);
  const [rightTab, setRightTab] = useState<RightTab>("chat");

  // The participants list only matters while the Meeting tab is on screen;
  // polling it anywhere else would be pure noise against the call API.
  const showRoster = rightOpen && rightTab === "meeting" && !!meeting;
  const meetRoomId = meeting?.roomId || "";
  const meetCallId = meeting?.callId || "";
  useEffect(() => {
    if (!showRoster) return;
    let alive = true;
    const tick = () => {
      getCall(meetRoomId, meetCallId)
        .then((c) => alive && setRoster(c.participants || []))
        .catch(() => {
          /* roster is a nicety; a failure must not break the panel */
        });
    };
    tick();
    const iv = setInterval(tick, 15000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [showRoster, meetRoomId, meetCallId]);

  // ── Finalize ─────────────────────────────────────────────────────
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeErr, setFinalizeErr] = useState(false);
  const [finalizeOk, setFinalizeOk] = useState(false);
  const [finalizeNotes, setFinalizeNotes] = useState("");
  const [finalizeResult, setFinalizeResult] = useState<FinalizeDocumentRequestResult | null>(null);
  async function doFinalize() {
    if (!editor || finalizeBusy) return;
    setFinalizeBusy(true);
    setFinalizeErr(false);
    try {
      const r = await finalizeDocumentRequest(editor.finalizeUrl, finalizeNotes.trim() || t("finalizeNotesDefault"));
      setFinalizeResult(r);
      setFinalizeConfirmOpen(false);
      setFinalizeOk(true);
      // Record only: finalizeResult already carries the final file and the new
      // status that drive this screen, and the open document must stay open.
      setReqReloadKey((k) => k + 1);
    } catch (e) {
      logApiError("document-request finalize", e);
      setFinalizeErr(true);
    } finally {
      setFinalizeBusy(false);
    }
  }

  // Short-lived banners, not permanent ones wedged under the sticky bar:
  // MD2's error guidance is "qisqa toast", and a stuck banner shrinks the
  // editor for the rest of the session.
  const clearLater = useCallback((fn: () => void) => {
    const h = setTimeout(fn, 4500);
    return () => clearTimeout(h);
  }, []);
  useEffect(() => (finalizeOk ? clearLater(() => setFinalizeOk(false)) : undefined), [finalizeOk, clearLater]);
  useEffect(() => (finalizeErr ? clearLater(() => setFinalizeErr(false)) : undefined), [finalizeErr, clearLater]);
  useEffect(() => (meetErr ? clearLater(() => setMeetErr(false)) : undefined), [meetErr, clearLater]);
  useEffect(() => (fileErr ? clearLater(() => setFileErr(false)) : undefined), [fileErr, clearLater]);

  const cf = req?.request.contractFile;
  const finalFile = finalizeResult
    ? { inline: finalizeResult.fileInlineUrl, download: finalizeResult.fileDownloadUrl, format: finalizeResult.fileFormat }
    : cf
      ? { inline: cf.inlineUrl, download: cf.downloadUrl, format: extFromMime(cf.mimeType) || "docx" }
      : null;
  async function downloadFinalFile() {
    if (!finalFile || (!finalFile.download && !finalFile.inline)) return;
    const ok = await fetchAndDeliver(
      () => getServiceTemplateSourceFile(finalFile.download || finalFile.inline),
      `${req?.clientName || "hujjat"}.${finalFile.format || "docx"}`,
      true,
    );
    if (!ok) setFileErr(true);
  }

  // Optimistic: the finalize response already said completed/file_ready, so
  // the badge and the disabled button must not wait on the refetch landing.
  const finalized = finalizeResult?.lawyerRequestStatus === "completed" || finalizeResult?.documentRequestStatus === "file_ready";
  const isSent = req?.status === "completed" || finalized;
  const touched = !!savedAt || saveState === "saved" || saveState === "saving";
  const badge = badgeState(req, finalized, touched);
  const badgeLabel = { new: t("statusNew"), taken: t("statusTaken"), progress: t("statusInProgress"), ready: t("statusReady"), sent: t("statusSent") }[badge];
  const answerEntries = req ? Object.entries(req.answers).filter(([, v]) => v != null && v !== "") : [];
  // A template-backed request names the same thing twice — show the second
  // line only when it adds something.
  const rawTemplate = req?.templateName || req?.templateFile?.fileName || "";
  const templateLabel = rawTemplate && rawTemplate.trim() !== (req?.serviceName || "").trim() ? rawTemplate : "";
  const chatRoomId = req?.secureChatRoomId || "";
  const editorErrMsg = editorErrStatus === 403 ? t("noAccess") : editorErrStatus === 404 ? t("notFound") : t("templateError");

  return (
    <div className="deditor">
      <div className="deditor__top">
        <button type="button" className="deditor__back" onClick={() => router.push(backHref)}>
          <IconChevronLeft />
          {tc("back")}
        </button>
        {/* Visible on mobile (drawers) and, on desktop, whenever its panel is
            collapsed — the in-panel toggle collapses along with the panel, so
            without this a closed panel could never be reopened. */}
        <button
          type="button"
          className={`deditor__toggle${leftOpen ? "" : " deditor__toggle--show"}`}
          onClick={() => setLeftOpen((v) => !v)}
          aria-label={t("togglePanels")}
        >
          <IconMenu />
        </button>
        <span className="deditor__ident">
          <b className="deditor__title">{req?.title || req?.clientName || t("title")}</b>
          <small className="deditor__sub">
            {[req?.clientName, req?.serviceName].filter(Boolean).join(" · ") || t("subtitleFallback")}
          </small>
        </span>
        <span className="deditor__status">
          <span className={`deditor__badge deditor__badge--${badge}`}>{badgeLabel}</span>
          {saveState ? (
            <span className={`deditor__save deditor__save--${saveState}`}>
              <i aria-hidden />
              {saveState === "saving" ? t("saveSaving") : saveState === "saved" ? t("saveSaved") : t("saveError")}
            </span>
          ) : null}
        </span>
        <span className="deditor__spacer" />
        <button type="button" className="deditor__act" onClick={startMeeting} disabled={meetBusy || !req?.meetingUrl || isSent || !!meeting}>
          <IconVideo />
          <span className="deditor__actLabel">{meetBusy ? t("processingShort") : t("startMeeting")}</span>
        </button>
        <button
          type="button"
          className="deditor__act deditor__act--primary"
          onClick={() => setFinalizeConfirmOpen(true)}
          disabled={isSent || editorState !== "ready" || finalizeBusy}
        >
          <IconCheck />
          <span className="deditor__actLabel">{isSent ? t("statusSent") : t("finalize")}</span>
        </button>
        <button
          type="button"
          className={`deditor__toggle${rightOpen ? "" : " deditor__toggle--show"}`}
          onClick={() => setRightOpen((v) => !v)}
          aria-label={t("togglePanels")}
        >
          <IconMenu />
        </button>
      </div>

      <div className="deditor__toasts" aria-live="polite">
        {finalizeOk ? <Notice ok msg={t("finalizeSent")} /> : null}
        {finalizeErr ? <Notice ok={false} msg={t("finalizeError")} /> : null}
        {meetErr ? <Notice ok={false} msg={t("meetingError")} /> : null}
        {fileErr ? <Notice ok={false} msg={t("templateError")} /> : null}
      </div>

      <div className={`deditor__body${leftOpen ? "" : " deditor__body--leftClosed"}${rightOpen ? "" : " deditor__body--rightClosed"}`}>
        <aside className={`deditor__left${leftOpen ? " on" : ""}`}>
          <button type="button" className="deditor__panelToggle" onClick={() => setLeftOpen((v) => !v)} aria-label={t("togglePanels")}>
            <IconChevronLeft />
          </button>
          {reqStatus === "loading" ? (
            <Skeleton rows={5} />
          ) : !req ? (
            <Notice ok={false} msg={t("templateError")} />
          ) : (
            <>
              {/* Who this is for. The phone is a real tel: link — the whole
                  point of the card-centre advocate having it. */}
              <div className="dclient">
                <span className="dclient__av" aria-hidden>{initials(req.clientName || "?")}</span>
                <span className="dclient__t">
                  <b>{req.clientName || "—"}</b>
                  {req.clientPhone ? (
                    <a className="dclient__tel" href={`tel:${req.clientPhone.replace(/[^\d+]/g, "")}`}>
                      <IconPhone />
                      {req.clientPhone}
                    </a>
                  ) : (
                    <small className="advmuted">{t("noPhone")}</small>
                  )}
                </span>
              </div>

              {req.createdAt ? (
                <small className="dstrip__at">
                  <IconClock />
                  {t("createdLabel")}: {shortDateTime(req.createdAt, locale)}
                </small>
              ) : null}

              {/* The request itself — the one thing the advocate actually
                  has to read before typing anything. */}
              <section className="dsec">
                <h3 className="dsec__h"><IconChat />{t("need")}</h3>
                <blockquote className="dneed">{req.need || "—"}</blockquote>
                {answerEntries.length ? (
                  <dl className="dfacts">
                    {answerEntries.map(([k, v]) => (
                      <div className="dfacts__row" key={k}>
                        <dt>{tf.has(k.toLowerCase()) ? tf(k.toLowerCase()) : humanizeSlug(k)}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </section>

              <section className="dsec">
                <h3 className="dsec__h"><IconFileText />{t("documentLabel")}</h3>
                {req.serviceName ? (
                  <div className="dmeta">
                    <span>{t("serviceLabel")}</span>
                    <b>{req.serviceName}</b>
                  </div>
                ) : null}
                {/* Only when it differs: on a template-backed request the
                    service and the template carry the same title, and
                    printing it twice was the panel's biggest space waste. */}
                {templateLabel ? (
                  <div className="dmeta">
                    <span>{t("templateLabel")}</span>
                    <b>{templateLabel}</b>
                  </div>
                ) : null}
                {req.assignedLawyerName ? (
                  <div className="dmeta dmeta--who">
                    <span><IconHeadset />{t("assignedLabel")}</span>
                    <b>{req.assignedLawyerName}</b>
                  </div>
                ) : null}
                {req.templateFile?.hasFile ? (
                  <div className="dsec__acts">
                    <button type="button" className="dchip" onClick={() => setPreview("template")}>
                      <IconEye /> {t("viewTemplate")}
                    </button>
                    <button type="button" className="dchip" onClick={downloadTemplate}>
                      <IconDownload /> {t("downloadTemplate")}
                    </button>
                  </div>
                ) : null}
              </section>
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
              {claimErr === "taken" ? (
                <Notice ok={false} msg={t("claimedByOther")} />
              ) : (
                <>
                  {claimErr === "generic" ? <Notice ok={false} msg={t("claimError")} /> : null}
                  <button className="btn btn--grad btn--lg" type="button" onClick={claimAndRetry} disabled={claimBusy}>
                    {claimBusy ? t("claiming") : t("claim")}
                  </button>
                </>
              )}
            </div>
          ) : editorState === "error" ? (
            <div className="deditor__mainState">
              <IconAlert />
              <Notice ok={false} msg={editorErrMsg} />
              <button className="btn btn--line" type="button" onClick={() => setReloadKey((k) => k + 1)}>
                <IconRefresh /> {t("retryLater")}
              </button>
            </div>
          ) : configured ? (
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
                  <IconRefresh /> {t("retryLaterDocx")}
                </button>
              </div>
            </div>
          )}
        </main>

        <aside className={`deditor__right${rightOpen ? " on" : ""}`}>
          <button
            type="button"
            className="deditor__panelToggle deditor__panelToggle--right"
            onClick={() => setRightOpen((v) => !v)}
            aria-label={t("togglePanels")}
          >
            <IconChevronLeft />
          </button>
          <div className="deditor__tabs" role="tablist">
            {(["chat", "meeting", "versions", "info"] as RightTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={rightTab === tab}
                className={rightTab === tab ? "on" : ""}
                onClick={() => setRightTab(tab)}
                title={t(tab === "meeting" ? "tabMeeting" : tab === "chat" ? "tabChat" : tab === "versions" ? "tabVersions" : "tabInfo")}
              >
                {tab === "meeting" ? <IconVideo /> : tab === "chat" ? <IconChat /> : tab === "versions" ? <IconClock /> : <IconInfo />}
                <span>{t(tab === "meeting" ? "tabMeeting" : tab === "chat" ? "tabChat" : tab === "versions" ? "tabVersions" : "tabInfo")}</span>
                {tab === "meeting" && meeting ? <i className="deditor__tabdot" aria-hidden /> : null}
              </button>
            ))}
          </div>
          <div className="deditor__tabBody">
            {rightTab === "chat" ? (
              chatRoomId ? (
                <div className="deditor__chat">
                  <SecureChat roomId={chatRoomId} onClose={() => setRightOpen(false)} compact />
                </div>
              ) : (
                <p className="dempty"><IconChat />{t("chatUnavailable")}</p>
              )
            ) : rightTab === "meeting" ? (
              <div className="dpane">
                <div className={`dstate${meeting ? (meeting.open ? " dstate--live" : " dstate--idle") : ""}`}>
                  <span className="dstate__i"><IconVideo /></span>
                  <span className="dstate__t">
                    <b>{meeting ? (meeting.open ? t("meetingLive") : t("meetingOpen")) : t("meetingNone")}</b>
                    <small>{meeting ? t("meetingLimitHint") : t("meetingStartHint")}</small>
                  </span>
                </div>
                {meeting ? (
                  <button type="button" className="btn btn--grad btn--full" onClick={rejoinMeeting} disabled={meetBusy || meeting.open}>
                    <IconVideo /> {meetBusy ? t("processingShort") : t("meetingJoin")}
                  </button>
                ) : (
                  <button type="button" className="btn btn--grad btn--full" onClick={startMeeting} disabled={meetBusy || !req?.meetingUrl || isSent}>
                    <IconVideo /> {meetBusy ? t("processingShort") : t("startMeeting")}
                  </button>
                )}
                {meeting ? (
                  <section className="dsec">
                    <h3 className="dsec__h"><IconUsers />{t("participants")} <b className="dsec__n">{roster.length}</b></h3>
                    {roster.length ? (
                      <ul className="dppl">
                        {roster.map((p) => (
                          <li key={p.userId}>
                            <span className="dppl__av" aria-hidden>{initials(p.name || p.role || "?")}</span>
                            <span>{p.name || humanizeSlug(p.role || "—")}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="dempty"><IconUsers />{t("participantsNone")}</p>
                    )}
                  </section>
                ) : null}
                {meetErr ? <Notice ok={false} msg={t("meetingError")} /> : null}
              </div>
            ) : rightTab === "versions" ? (
              <div className="dpane">
                <div className={`dstate${savedAt ? " dstate--ok" : ""}`}>
                  <span className="dstate__i"><IconClock /></span>
                  <span className="dstate__t">
                    <b>{t("draftSavedAt")}</b>
                    <small>{savedAt ? shortDateTime(savedAt, locale) : t("noDraftYet")}</small>
                  </span>
                </div>
                <div className={`dstate${finalFile ? " dstate--ok" : ""}`}>
                  <span className="dstate__i"><IconFileText /></span>
                  <span className="dstate__t">
                    <b>{t("tabVersions")}</b>
                    <small>{finalFile ? `${(finalFile.format || "docx").toUpperCase()}` : t("noFinalYet")}</small>
                  </span>
                </div>
                {finalFile ? (
                  <div className="dsec__acts">
                    <button type="button" className="dchip" onClick={() => setPreview("final")}>
                      <IconEye /> {t("viewFinalFile")}
                    </button>
                    <button type="button" className="dchip" onClick={downloadFinalFile}>
                      <IconDownload /> {t("downloadFinalFile")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="dpane">
                <p className="dempty dempty--lead"><IconInfo />{t("infoLead")}</p>
                <dl className="dids">
                  {[
                    [t("infoLawyerRequestId"), req?.id],
                    [t("infoDocumentRequestId"), req?.request.id],
                    [t("infoServiceId"), req?.serviceId],
                    [t("infoTemplateId"), req?.templateId || req?.request.templateId],
                  ].map(([label, value]) => (
                    <div className="dids__row" key={label as string}>
                      <dt>{label}</dt>
                      <dd><code>{(value as string) || "—"}</code></dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile only (CSS): tapping outside an open drawer closes it. */}
        {leftOpen || rightOpen ? (
          <button
            type="button"
            className="deditor__scrim"
            aria-label={t("togglePanels")}
            onClick={() => {
              setLeftOpen(false);
              setRightOpen(false);
            }}
          />
        ) : null}
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
          <label htmlFor="finalize-notes">{t("finalizeNotes")}</label>
          <textarea id="finalize-notes" rows={2} value={finalizeNotes} onChange={(e) => setFinalizeNotes(e.target.value)} placeholder={t("finalizeNotesDefault")} />
          {finalizeErr ? <Notice ok={false} msg={t("finalizeError")} /> : null}
          <button className="btn btn--grad btn--full btn--lg" type="button" onClick={doFinalize} disabled={finalizeBusy}>
            {finalizeBusy ? t("processingShort") : t("finalizeConfirmYes")}
          </button>
        </div>
      </Modal>

      {/* Outside the page's own conditional rendering: an active LiveKit call
          must survive whatever else happens on this page (tab switches,
          panel toggles). Closing it keeps the meeting addressable so the
          Meeting tab can offer a Join button. `float` is MD2's recommended
          variant here ("Tavsiya: editor sahifada floating video panel") —
          a full-screen call would hide the very document being discussed. */}
      {meeting && meeting.open ? (
        <CallRoom
          roomId={meeting.roomId}
          callId={meeting.callId}
          callType="video"
          isCaller={meeting.isCaller}
          title={req?.clientName ? `${t("meetingTitle")} · ${req.clientName}` : t("meetingTitle")}
          lk={meeting.lk}
          float
          onEnd={() => setMeeting((m) => (m ? { ...m, open: false } : m))}
        />
      ) : null}
    </div>
  );
}
