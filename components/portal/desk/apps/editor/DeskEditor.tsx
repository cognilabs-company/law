"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  EDITOR_MOUNT,
  type EditorFile,
  type EditorView,
  type RightTab,
  type StartChoice,
} from "@/components/portal/DocumentEditorWorkspace";
import FileViewer from "../FileViewer";
import CallRoom from "@/components/chat/CallRoom";
import { ApiError } from "@/lib/http";
import { shortDateTime } from "@/lib/date";
import { humanizeSlug } from "@/lib/lawyers";
import {
  editorClaimNeeded,
  fulfillLawyerDocumentRequestFile,
  getEditorSources,
  isDocxFile,
  setEditorSource,
  uploadEditorSource,
  type EditorSources,
} from "@/lib/services/backend";
import {
  IconAlert,
  IconChat,
  IconCheck,
  IconClock,
  IconClose,
  IconDownload,
  IconEdit,
  IconExpand,
  IconEye,
  IconFileText,
  IconInfo,
  IconLayers,
  IconLock,
  IconMenu,
  IconMinus,
  IconPaperclip,
  IconPhone,
  IconRefresh,
  IconSparkle,
  IconUpload,
  IconUsers,
  IconVideo,
} from "@/components/icons";
import {
  App,
  Avatar,
  Banner,
  Btn,
  Dialog,
  Empty,
  Field,
  Loading,
  Seg,
  Spinner,
  Tag,
  TextArea,
  Tool,
  Toolbar,
  useOs,
  type Tone,
} from "../../kit/kit";
import DeskCall from "../call/DeskCall";
import { ChatPane } from "../messages/MessagesApp";
import "./editor.css";

// The document editor as a desktop program — Word on Windows, Pages on the
// Mac. The request sits in the sidebar (who, what they need, their answers,
// the template), the document fills the middle, and the inspector on the
// right holds the chat with the client, the meeting, the versions and the
// record's ids. A meeting floats in the corner of the window over the
// document, so the advocate keeps writing while they talk. OnlyOffice draws
// the page itself; everything around it — and every state before it opens —
// is this program's.

// The way back to the queue, from the window that holds the editor.
export const EditorBack = createContext<{
  label: string;
  go: () => void;
} | null>(null);

const BADGE: Record<EditorView["badge"], Tone> = {
  new: "info",
  taken: "accent",
  progress: "warn",
  ready: "ok",
  sent: "ok",
};
const START_ICON: Record<StartChoice, ReactNode> = {
  upload: <IconUpload />,
  client_file: <IconFileText />,
  ai_draft: <IconSparkle />,
};
const TABS: RightTab[] = ["chat", "meeting", "versions", "info"];
const TAB_KEY: Record<RightTab, string> = {
  chat: "tabChat",
  meeting: "tabMeeting",
  versions: "tabVersions",
  info: "tabInfo",
};

export default function DeskEditor({ v }: { v: EditorView }) {
  const t = useTranslations(v.ns);
  const d = useTranslations("portal.desk.docs");
  const os = useOs();
  const back = useContext(EditorBack);
  const [big, setBig] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  // The panes open by default on a wide screen; in a window too narrow for
  // the page and both of them, they start closed and float when opened.
  const { setLeft, setRight } = v.panels;
  useEffect(() => {
    const w = body.current?.closest(".dx")?.clientWidth ?? 0;
    const h = setTimeout(() => {
      if (w && w < 1240) setRight(false);
      if (w && w < 860) setLeft(false);
    }, 0);
    return () => clearTimeout(h);
  }, [setLeft, setRight]);
  const req = v.req;
  const title = req?.title || req?.clientName || t("title");
  const sub =
    [req?.clientName, req?.serviceName].filter(Boolean).join(" · ") ||
    t("subtitleFallback");
  const saveText =
    v.save === "saving"
      ? t("saveSaving")
      : v.save === "saved"
        ? t("saveSaved")
        : v.save === "error"
          ? t("saveError")
          : "";

  const status = (
    <span className="dxe-status">
      <Tag tone={BADGE[v.badge]}>{v.badgeLabel}</Tag>
      {saveText ? (
        <span className={`dxe-save is-${v.save}`}>
          {v.save === "saving" ? (
            <Spinner small />
          ) : v.save === "saved" ? (
            <IconCheck aria-hidden />
          ) : (
            <IconAlert aria-hidden />
          )}
          {saveText}
        </span>
      ) : null}
    </span>
  );
  const send = (
    <Btn
      kind="primary"
      icon={<IconCheck />}
      disabled={!v.finalize.can}
      onClick={() => v.finalize.setOpen(true)}
    >
      {v.isSent ? t("statusSent") : t("finalize")}
    </Btn>
  );

  return (
    <App
      name="editor"
      sidebar={v.panels.left ? <RequestPane v={v} /> : undefined}
    >
      <Toolbar
        title={title}
        subtitle={os === "mac" ? sub : undefined}
        back={back ? { label: back.label, onClick: back.go } : undefined}
        end={
          os === "win" ? (
            <>
              {status}
              {send}
            </>
          ) : undefined
        }
      >
        <Tool
          icon={<IconMenu />}
          label={t("need")}
          active={v.panels.left}
          onClick={() => v.panels.setLeft(!v.panels.left)}
        />
        <Tool
          icon={<IconLayers />}
          label={t("chooseSource")}
          disabled={!v.source.can}
          onClick={() => v.source.setOpen(true)}
        />
        <Tool
          icon={<IconVideo />}
          label={v.meeting.busy ? t("processingShort") : t("startMeeting")}
          disabled={!v.meeting.canStart}
          onClick={v.meeting.start}
        />
        <Tool
          icon={<IconChat />}
          label={t("tabChat")}
          active={v.panels.right}
          onClick={() => v.panels.setRight(!v.panels.right)}
        />
        {os === "mac" ? (
          <>
            {status}
            {send}
          </>
        ) : null}
      </Toolbar>
      {os === "win" ? <p className="dxe-sub">{sub}</p> : null}

      <div className="dxe-body" ref={body}>
        <div className="dxe-page">
          <Stage v={v} />
          {v.meeting.call ? (
            <div className={`dxe-call${big ? " is-big" : ""}`}>
              <button
                type="button"
                className="dxe-call__size"
                onClick={() => setBig(!big)}
                aria-label={big ? d("callSmall") : d("callBig")}
                title={big ? d("callSmall") : d("callBig")}
              >
                {big ? <IconMinus /> : <IconExpand />}
              </button>
              <CallRoom
                roomId={v.meeting.call.roomId}
                callId={v.meeting.call.callId}
                callType="video"
                isCaller={v.meeting.call.isCaller}
                title={v.meeting.call.title}
                lk={v.meeting.call.lk}
                skin={DeskCall}
                onEnd={v.meeting.end}
              />
            </div>
          ) : null}
        </div>
        {v.panels.right ? <Inspector v={v} /> : null}
      </div>

      <Dialog
        open={v.finalize.open}
        title={t("finalize")}
        onClose={() => v.finalize.setOpen(false)}
        onSubmit={v.finalize.run}
        actions={
          <>
            <Btn
              onClick={() => v.finalize.setOpen(false)}
              disabled={v.finalize.busy}
            >
              {d("cancel")}
            </Btn>
            <Btn kind="primary" type="submit" busy={v.finalize.busy}>
              {t("finalizeConfirmYes")}
            </Btn>
          </>
        }
      >
        <p className="dx-dlg__text">{t("finalizeConfirmText")}</p>
        <Field label={t("finalizeNotes")}>
          <TextArea
            value={v.finalize.notes}
            onChange={v.finalize.setNotes}
            placeholder={t("finalizeNotesDefault")}
            rows={3}
            maxLength={1000}
            ariaLabel={t("finalizeNotes")}
          />
        </Field>
      </Dialog>
      {v.source.open ? <SourceDialog v={v} /> : null}
      {v.upload.open && req ? <UploadDialog v={v} /> : null}
      {(["template", "editorFile", "final"] as EditorFile[]).map((k) => (
        <FileViewer
          key={k}
          open={v.files.preview === k}
          onClose={() => v.files.setPreview("")}
          title={
            k === "template"
              ? req?.templateFile?.fileName || t("templateLabel")
              : k === "editorFile"
                ? t("editorFile")
                : t("viewFinalFile")
          }
          fetchBlob={v.files.fetch(k)}
          fileName={v.files.fileName(k)}
        />
      ))}
    </App>
  );
}

// What fills the middle: the document, or the state before it.
function Stage({ v }: { v: EditorView }) {
  const t = useTranslations(v.ns);
  const msg = (e: unknown) =>
    e instanceof ApiError && typeof e.data?.detail === "string"
      ? e.data.detail
      : "";
  if (v.stage === "editor") return <div id={EDITOR_MOUNT} className="dxe-oo" />;
  if (v.stage === "loading") return <Loading label={t("title")} />;
  if (v.stage === "start")
    return (
      <div className="dxe-start">
        <header>
          <h2>{t("startTitle")}</h2>
          <p>{t("startLead")}</p>
        </header>
        <div className="dxe-start__grid">
          {v.startOptions.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`dxe-opt${o.recommended && o.enabled ? " is-rec" : ""}`}
              onClick={() => v.start(o.key)}
              disabled={!o.enabled}
            >
              <span className={`dxe-opt__art is-${o.key}`} aria-hidden>
                <span className="dxe-opt__sheet">{START_ICON[o.key]}</span>
              </span>
              <b>{o.title}</b>
              <small>{o.text}</small>
              {o.enabled ? (
                o.recommended ? (
                  <Tag tone="accent">{t("startRecommended")}</Tag>
                ) : null
              ) : (
                <Tag>{t("startUnavailable")}</Tag>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  if (v.stage === "blocked")
    return (
      <Empty
        icon={<IconLock />}
        title={t("editorBlockedTitle")}
        text={[
          v.blockReason || t("editorBlockedFallback"),
          v.systemEditorSupported === false ? t("editorBlockedNoSystem") : "",
        ]
          .filter(Boolean)
          .join(" ")}
        action={
          <span className="dxe-acts">
            {v.files.template ? (
              <Btn
                icon={<IconDownload />}
                onClick={() => v.files.download("template")}
              >
                {t("downloadTemplate")}
              </Btn>
            ) : null}
            <Btn icon={<IconRefresh />} onClick={v.reloadReq}>
              {t("retryLater")}
            </Btn>
          </span>
        }
      />
    );
  if (v.stage === "claim")
    return (
      <Empty
        icon={<IconAlert />}
        title={t("needClaimTitle")}
        text={v.claim.taken ? t("claimedByOther") : t("needClaimLead")}
        action={
          v.claim.taken ? undefined : (
            <Btn kind="primary" busy={v.claim.busy} onClick={v.claim.run}>
              {v.claim.busy ? t("claiming") : t("claim")}
            </Btn>
          )
        }
      />
    );
  if (v.stage === "error")
    return (
      <Empty
        icon={<IconAlert />}
        title={v.editorErr.title}
        text={msg(v.editorErr.error) || undefined}
        action={
          <Btn icon={<IconRefresh />} onClick={v.reloadEditor}>
            {t("retryLater")}
          </Btn>
        }
      />
    );
  return (
    <Empty
      icon={<IconFileText />}
      title={t("editorNotConfigured")}
      text={t("editorNotConfiguredLead")}
      action={
        <span className="dxe-acts">
          <Btn
            icon={<IconEye />}
            onClick={() => v.files.setPreview("editorFile")}
          >
            {t("openDocx")}
          </Btn>
          <Btn
            icon={<IconDownload />}
            onClick={() => v.files.download("editorFile")}
          >
            {t("downloadDocx")}
          </Btn>
          <Btn icon={<IconRefresh />} onClick={v.reloadEditor}>
            {t("retryLaterDocx")}
          </Btn>
        </span>
      }
    />
  );
}

// The sidebar: the request the document answers.
function RequestPane({ v }: { v: EditorView }) {
  const t = useTranslations(v.ns);
  const tf = useTranslations("portal.client.documents.fields");
  const locale = useLocale();
  const req = v.req;
  return (
    <aside className="dx-side dxe-side" aria-label={t("need")}>
      {v.reqStatus === "loading" ? (
        <Loading label={t("need")} />
      ) : !req ? (
        <Empty
          icon={<IconAlert />}
          title={t("templateError")}
          action={<Btn onClick={v.reloadReq}>{t("retryLater")}</Btn>}
        />
      ) : (
        <div className="dxe-side__in">
          <section className="dxe-client">
            <Avatar name={req.clientName || "?"} size={40} />
            <span>
              <b>{req.clientName || "—"}</b>
              {req.clientPhone ? (
                <a href={`tel:${req.clientPhone.replace(/[^\d+]/g, "")}`}>
                  <IconPhone aria-hidden />
                  {req.clientPhone}
                </a>
              ) : (
                <small>{t("noPhone")}</small>
              )}
            </span>
          </section>
          {req.createdAt ? (
            <p className="dxe-when">
              <IconClock aria-hidden />
              {t("createdLabel")}: {shortDateTime(req.createdAt, locale)}
            </p>
          ) : null}
          <section className="dxe-sec">
            <h3>{t("need")}</h3>
            <p className="dxe-need">{req.need || "—"}</p>
            {v.answers.length ? (
              <dl className="dxe-facts">
                {v.answers.map(([k, val]) => (
                  <div key={k}>
                    <dt>
                      {tf.has(k.toLowerCase())
                        ? tf(k.toLowerCase())
                        : humanizeSlug(k)}
                    </dt>
                    <dd>
                      {typeof val === "object"
                        ? JSON.stringify(val)
                        : String(val)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
          <section className="dxe-sec">
            <h3>{t("documentLabel")}</h3>
            <dl className="dxe-facts">
              {req.serviceName ? (
                <div>
                  <dt>{t("serviceLabel")}</dt>
                  <dd>{req.serviceName}</dd>
                </div>
              ) : null}
              {v.templateLabel ? (
                <div>
                  <dt>{t("templateLabel")}</dt>
                  <dd>{v.templateLabel}</dd>
                </div>
              ) : null}
              {req.assignedLawyerName ? (
                <div>
                  <dt>{t("assignedLabel")}</dt>
                  <dd>{req.assignedLawyerName}</dd>
                </div>
              ) : null}
            </dl>
            {v.files.template ? (
              <div className="dxe-acts">
                <Btn
                  small
                  icon={<IconEye />}
                  onClick={() => v.files.setPreview("template")}
                >
                  {t("viewTemplate")}
                </Btn>
                <Btn
                  small
                  icon={<IconDownload />}
                  onClick={() => v.files.download("template")}
                >
                  {t("downloadTemplate")}
                </Btn>
              </div>
            ) : null}
            {v.canChangeStart ? (
              <div className="dxe-acts">
                <Btn small icon={<IconRefresh />} onClick={v.changeStart}>
                  {t("startChange")}
                </Btn>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </aside>
  );
}

// The inspector: chat, meeting, versions, info.
function Inspector({ v }: { v: EditorView }) {
  const t = useTranslations(v.ns);
  const locale = useLocale();
  const tab = v.panels.tab;
  return (
    <aside className="dxe-insp" aria-label={t(TAB_KEY[tab])}>
      <header className="dxe-insp__h">
        <Seg
          small
          label={t("togglePanels")}
          value={tab}
          onChange={v.panels.setTab}
          items={TABS.map((k) => ({ id: k, label: t(TAB_KEY[k]) }))}
        />
        <button
          type="button"
          className="dxe-insp__x"
          onClick={() => v.panels.setRight(false)}
          aria-label={t("togglePanels")}
          title={t("togglePanels")}
        >
          <IconClose />
        </button>
      </header>
      <div className={`dxe-insp__b is-${tab}`}>
        {tab === "chat" ? (
          v.chatRoomId ? (
            <ChatPane
              roomId={v.chatRoomId}
              title={v.req?.clientName || t("tabChat")}
            />
          ) : (
            <Empty icon={<IconChat />} title={t("chatUnavailable")} />
          )
        ) : tab === "meeting" ? (
          <div className="dxe-pane">
            <div
              className={`dxe-card${v.meeting.has ? (v.meeting.open ? " is-live" : " is-idle") : ""}`}
            >
              <span className="dxe-card__ic">
                <IconVideo />
              </span>
              <span>
                <b>
                  {v.meeting.has
                    ? v.meeting.open
                      ? t("meetingLive")
                      : t("meetingOpen")
                    : t("meetingNone")}
                </b>
                <small>
                  {v.meeting.has
                    ? t("meetingLimitHint")
                    : t("meetingStartHint")}
                </small>
              </span>
            </div>
            {v.meeting.has ? (
              <Btn
                kind="primary"
                icon={<IconVideo />}
                busy={v.meeting.busy}
                disabled={v.meeting.open}
                onClick={v.meeting.rejoin}
              >
                {t("meetingJoin")}
              </Btn>
            ) : (
              <Btn
                kind="primary"
                icon={<IconVideo />}
                busy={v.meeting.busy}
                disabled={!v.meeting.canStart}
                onClick={v.meeting.start}
              >
                {t("startMeeting")}
              </Btn>
            )}
            {v.meeting.has ? (
              <section className="dxe-sec">
                <h3>
                  <IconUsers aria-hidden />
                  {t("participants")}{" "}
                  <span className="dxe-n">{v.meeting.roster.length}</span>
                </h3>
                {v.meeting.roster.length ? (
                  <ul className="dxe-people">
                    {v.meeting.roster.map((p) => (
                      <li key={p.userId}>
                        <Avatar name={p.name || p.role || "?"} size={26} />
                        <span>{p.name || humanizeSlug(p.role || "—")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dxe-muted">{t("participantsNone")}</p>
                )}
              </section>
            ) : null}
            {v.meeting.ended && !v.meeting.has ? (
              <Banner tone="info" title={t("meetingEndedNote")} />
            ) : null}
          </div>
        ) : tab === "versions" ? (
          <div className="dxe-pane">
            <ul className="dxe-vers">
              <li className={v.savedAt ? "is-ok" : ""}>
                <span className="dxe-vers__ic">
                  <IconEdit />
                </span>
                <span>
                  <b>{t("draftSavedAt")}</b>
                  <small>
                    {v.savedAt
                      ? shortDateTime(v.savedAt, locale)
                      : t("noDraftYet")}
                  </small>
                </span>
              </li>
              <li className={v.files.final ? "is-ok" : ""}>
                <span className="dxe-vers__ic">
                  <IconFileText />
                </span>
                <span>
                  <b>{t("tabVersions")}</b>
                  <small>
                    {v.files.final
                      ? v.files.final.format.toUpperCase()
                      : t("noFinalYet")}
                  </small>
                </span>
              </li>
            </ul>
            {v.files.final ? (
              <div className="dxe-acts">
                <Btn
                  small
                  icon={<IconEye />}
                  onClick={() => v.files.setPreview("final")}
                >
                  {t("viewFinalFile")}
                </Btn>
                <Btn
                  small
                  icon={<IconDownload />}
                  onClick={() => v.files.download("final")}
                >
                  {t("downloadFinalFile")}
                </Btn>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="dxe-pane">
            <p className="dxe-muted">
              <IconInfo aria-hidden /> {t("infoLead")}
            </p>
            <dl className="dxe-ids">
              {v.ids.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <code>{value || "—"}</code>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </aside>
  );
}

// What the editor opens on (§7-8): the clean template, a blank page, the AI
// draft, the client's own files, or a .docx of the advocate's. Choosing one
// closes the editor session on the backend, so the editor reopens on it.
function SourceDialog({ v }: { v: EditorView }) {
  const t = useTranslations("portal.lawyer.editorSource");
  const tw = useTranslations(v.ns);
  const d = useTranslations("portal.desk.docs");
  const [data, setData] = useState<EditorSources | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "claim">(
    "loading",
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const close = () => v.source.setOpen(false);
  useEffect(() => {
    let alive = true;
    getEditorSources(v.recordId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setState("ready");
      })
      .catch((e) => {
        if (!alive) return;
        const claim = editorClaimNeeded(e);
        setNote(claim ? claim.message : "");
        setState(claim ? "claim" : "error");
      });
    return () => {
      alive = false;
    };
  }, [v.recordId, tick]);
  const done = () => {
    v.source.picked();
    close();
  };
  async function pick(type: string, attachmentId: string) {
    if (busy) return;
    setBusy(type + attachmentId);
    setErr("");
    try {
      await setEditorSource(v.recordId, {
        sourceType: type,
        attachmentId: attachmentId || undefined,
      });
      done();
    } catch {
      setErr(t("error"));
    } finally {
      setBusy("");
    }
  }
  async function upload(f: File) {
    if (busy) return;
    if (!isDocxFile(f)) {
      setErr(t("docxOnly"));
      return;
    }
    setBusy("upload");
    setErr("");
    try {
      await uploadEditorSource(v.recordId, f);
      done();
    } catch {
      setErr(t("error"));
    } finally {
      setBusy("");
    }
  }
  const icon = (k: string) =>
    k === "blank" ? (
      <IconEdit />
    ) : k === "ai_draft" ? (
      <IconSparkle />
    ) : k === "attachment" ? (
      <IconPaperclip />
    ) : (
      <IconFileText />
    );
  return (
    <Dialog
      open
      title={t("title")}
      onClose={close}
      width={500}
      actions={<Btn onClick={close}>{d("cancel")}</Btn>}
    >
      <p className="dx-dlg__text">{t("lead")}</p>
      {state === "loading" ? (
        <Loading label={t("title")} />
      ) : state === "claim" ? (
        <Banner tone="warn" title={note || t("claimFirst")} />
      ) : state === "error" ? (
        <Banner
          tone="err"
          title={t("error")}
          action={
            <Btn
              small
              onClick={() => (setState("loading"), setTick((n) => n + 1))}
            >
              {tw("retryLater")}
            </Btn>
          }
        />
      ) : (
        <div className="dxe-src" role="listbox" aria-label={t("title")}>
          {(data?.options ?? []).map((o) => {
            const on = data?.currentSource === o.sourceType;
            const key = o.sourceType + (o.attachmentId || "");
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={on}
                className={`dxe-src__o${on ? " is-on" : ""}`}
                disabled={!o.available || !!busy}
                onClick={() => void pick(o.sourceType, o.attachmentId)}
              >
                <span className="dxe-src__ic">{icon(o.sourceType)}</span>
                <span className="dxe-src__t">
                  <b>
                    {o.title ||
                      (t.has(`kind.${o.sourceType}`)
                        ? t(`kind.${o.sourceType}`)
                        : o.sourceType)}
                  </b>
                  {o.note || !o.available ? (
                    <small>{o.note || t("unavailable")}</small>
                  ) : null}
                </span>
                {busy === key ? (
                  <Spinner small />
                ) : on ? (
                  <IconCheck className="dxe-src__ok" />
                ) : !o.available ? (
                  <IconLock className="dxe-src__lock" />
                ) : null}
              </button>
            );
          })}
          <button
            type="button"
            className="dxe-src__o"
            disabled={!!busy}
            onClick={() => file.current?.click()}
          >
            <span className="dxe-src__ic">
              <IconUpload />
            </span>
            <span className="dxe-src__t">
              <b>{t("kind.upload")}</b>
              <small>{t("uploadHint")}</small>
            </span>
            {busy === "upload" ? <Spinner small /> : null}
          </button>
          <input
            ref={file}
            type="file"
            hidden
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </div>
      )}
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}

// §14 option 1: the advocate's own finished .docx, sent to the client.
function UploadDialog({ v }: { v: EditorView }) {
  const t = useTranslations(v.ns);
  const d = useTranslations("portal.desk.docs");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const close = () => v.upload.setOpen(false);
  async function send() {
    const url = v.req?.fulfillFileUrl;
    if (!url || !file || busy) return;
    setBusy(true);
    setErr("");
    try {
      await fulfillLawyerDocumentRequestFile(
        url,
        file,
        notes.trim() || undefined,
      );
      setSent(true);
      v.upload.done();
    } catch {
      setErr(t("fulfillError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("startUpload")}
      onClose={close}
      onSubmit={() => void send()}
      actions={
        sent ? (
          <Btn kind="primary" onClick={close}>
            {d("close")}
          </Btn>
        ) : (
          <>
            <Btn onClick={close}>{d("cancel")}</Btn>
            <Btn
              kind="primary"
              type="submit"
              icon={<IconUpload />}
              busy={busy}
              disabled={!file}
            >
              {t("fulfillSubmit")}
            </Btn>
          </>
        )
      }
    >
      {sent ? (
        <Banner tone="ok" title={t("fulfilled")} />
      ) : (
        <>
          <p className="dx-dlg__text">{t("startUploadText")}</p>
          <Field label={t("fileLabel")}>
            <span className="dxe-file">
              <Btn
                icon={<IconPaperclip />}
                onClick={() => pick.current?.click()}
              >
                {t("chooseFile")}
              </Btn>
              <span>{file ? file.name : t("filePlaceholder")}</span>
            </span>
            <input
              ref={pick}
              type="file"
              accept=".docx"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (f && !isDocxFile(f)) {
                  setFile(null);
                  setErr(t("invalidFileType"));
                } else {
                  setErr("");
                  setFile(f);
                }
              }}
            />
          </Field>
          <Field label={t("notesLabel")}>
            <TextArea
              value={notes}
              onChange={setNotes}
              rows={2}
              maxLength={1000}
              ariaLabel={t("notesLabel")}
            />
          </Field>
          {err ? <Banner tone="err" title={err} /> : null}
        </>
      )}
    </Dialog>
  );
}
