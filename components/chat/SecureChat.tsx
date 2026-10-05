"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth, canMakeCalls, sessionRoles, type Session } from "@/lib/auth";
import { emitRoomCallEvent, isCallEvent, subscribeRoomCallEvents } from "@/lib/callEvents";
import { maskContacts } from "@/lib/chatFilter";
import { getToken } from "@/lib/client";
import { backoffMs, contactBlockedOf, errDetail, isConflict, logApiError, refreshAccessToken } from "@/lib/http";
import { playRingtone, primeCallAudio } from "@/lib/callSounds";
import {
  getSecureMessages,
  sendSecureMessage,
  uploadSecureMessage,
  getSecureMessageFile,
  normSecureMsgCore,
  normSecureMsgFile,
  secureSocketUrl,
  startCall,
  listCalls,
  setChatAutoDelete,
  deleteSecureChat,
  completeUrgentChat,
  getUrgentRequest,
  listSecureChats,
  rateUrgentRequest,
  ratingOpen,
  isRatingClosed,
  type SecureMessage,
  type SecureReply,
  type LiveKitJoin,
  type CallSession,
  type UrgentRequest,
} from "@/lib/services/backend";
import ChatFilePreview, { canPreviewFile } from "./ChatFilePreview";
import { statusLabel } from "@/lib/labels";
// The star is imported, not re-drawn: it needs pathLength on its path for the
// dashed-outline animation, and DocRatingBox is where that one widget lives —
// the same import UrgentAdvocatePanel makes for the very same reason.
import { RateStar } from "@/components/portal/DocRatingBox";
import { VoiceRecorder, canRecordVoice, voiceDuration } from "@/lib/voiceRecorder";
// The same player the order form's "listen back before you send" row uses.
// It lives beside that row because the chat file is already thirteen hundred
// lines of sockets and calls and a media control is presentation — but there
// is deliberately only one of it: the part that is hard to get right (a
// MediaRecorder blob whose duration is Infinity until it is probed) is the
// part you do not want two copies of.
import { VoiceNotePlayer } from "@/components/portal/AttachmentPreview";
import { fetchAndDeliver } from "@/lib/download";
import ImageLightbox from "./ImageLightbox";
import CallRoom from "./CallRoom";
import {
  IconSend,
  IconShieldCheck,
  IconClose,
  IconAlert,
  IconLock,
  IconCheck,
  IconCheckDouble,
  IconClock,
  IconUser,
  IconPhone,
  IconVideo,
  IconPaperclip,
  IconMic,
  IconTrash,
  IconFileText,
  IconDownload,
  IconEye,
  IconUsers,
  IconChevronLeft,
  IconClipboardCheck,
  IconInfo,
} from "../icons";
import { timeOnly, dateOnly } from "@/lib/date";
import { localizeApiDetail } from "@/lib/apiMessage";

type LocalMsg = SecureMessage & { pending?: boolean; failed?: boolean };
type Conn = "connecting" | "online" | "offline";

function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return timeOnly(iso, "uz");
}
function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toDateString();
}

const INCOMING_CALL_MAX_AGE_MS = 2 * 60 * 1000;
const TERMINAL_CALL_STATUSES = new Set(["ended", "cancelled", "expired", "completed"]);

function isFreshIncomingCall(call: CallSession, userId: string): boolean {
  const status = call.status.trim().toLowerCase();
  if (!call.id || call.callerUserId === userId || !["active", "ringing"].includes(status) || call.endedAt) return false;
  const startedAt = Date.parse(call.startedAt);
  if (!Number.isFinite(startedAt)) return false;
  const age = Date.now() - startedAt;
  return age >= -30_000 && age <= INCOMING_CALL_MAX_AGE_MS;
}

// A call link posted by the backend when a call starts (a zoom.us URL or the
// in-app /secure-chats/.../join path). The real call happens through the
// incoming-call banner (LiveKit), and the posted zoom.us links are demo/invalid,
// so show a plain "call" note instead of a broken external link.
const CALL_LINK_RE = /(https?:\/\/(?:[a-z0-9-]+\.)?zoom\.(?:us|com)\/\S+|\/secure-chats\/\S+\/join)/i;
const METADATA_ONLY = "[metadata_only]";
// Everything below renders `text` as a JSX text child, so emoji reach the DOM
// as the characters the sender typed: nothing here escapes or transliterates
// them, and maskContacts only matches links, @handles and digit runs.
function MsgBody({ text, label }: { text: string; label: string }) {
  if (text === METADATA_ONLY) return <em className="sbub__hidden">🔒</em>;
  const m = text.match(CALL_LINK_RE);
  if (!m) return <>{text}</>;
  const i = m.index ?? 0;
  const before = text.slice(0, i).trim();
  const after = text.slice(i + m[0].length).trim();
  return (
    <>
      {before ? `${before} ` : null}
      <span className="sbub__callnote">
        <IconVideo />
        {label}
      </span>
      {after ? ` ${after}` : null}
    </>
  );
}

// `sender.role` is the backend's own word. Captured live in a Tezkor Advokat
// room: "client", "advokat", "call_center" — and the auth layer knows about
// "yurist", "call_center_lawyer" and "advokat_tashkiloti" as well. An operator
// only differs from an advocate by this field, so the chip is what tells the
// three parties apart.
// The two call-centre roles carry their own label instead of sharing
// "roleOperator": the person a client meets in a Tezkor Advokat room is the
// advocate on duty, and "Operator" both sold them short and used wording the
// platform no longer uses. The generic "operator" role keeps roleOperator, so
// repurposing that key would have relabelled it too.
const ROLE_KEYS: Record<string, string> = {
  client: "roleClient",
  advokat: "roleAdvokat",
  advokat_tashkiloti: "roleAdvokat",
  yurist: "roleYurist",
  call_center: "roleDuty",
  call_center_lawyer: "roleDuty",
  operator: "roleOperator",
};
// A role we have no wording for is shown as the backend spelled it, tidied —
// guessing would label a new staff role as something it is not.
function roleLabel(role: string, t: ReturnType<typeof useTranslations>): string {
  const key = ROLE_KEYS[role.trim().toLowerCase()];
  if (key) return t(key);
  return role.replace(/[_-]+/g, " ").replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

// "Group chatni mijoz yakunlay olmaydi" — the backend answers a client 403, so
// the action is hidden instead of refused after the fact. Session.role maps
// every staff role to "client" (see lib/auth.tsx), so the decision is taken on
// the backend role list, the way canMakeCalls/hasAdminAccess take theirs.
// There is no ready-made "is staff" predicate: a client's role list holds
// nothing but "client", so any other entry in it means staff.
function isStaffSession(s: Session | null): boolean {
  return sessionRoles(s).some((r) => r !== "client");
}

// Is the Tezkor Advokat record behind this room over? R17 (MD L203-207):
// completion flips the request to `completed`, the room with it, and every
// further send answers 409. `lifecycle.final_statuses` is the backend's own
// word for "nothing follows this" — captured live it is
// ["cancelled","completed","expired"] — so it is read rather than a list of
// statuses hard-coded here; the literal is only the fallback for a payload
// that carries no lifecycle at all (the list endpoints omit it).
function urgentFinished(r: UrgentRequest | null): boolean {
  if (!r || !r.status) return false;
  return r.finalStatuses.length ? r.finalStatuses.includes(r.status) : r.status === "completed";
}

// R30/R2 (MD L255 + L10-15): "participantlar soni" — client, call-centre
// operator and the selected advocates. The room itself cannot answer this:
// probed read-only on production, /secure-chats rows carry only
// client_user_id/seller_user_id (no participants array) and
// GET /secure-chats/{id}/participants is 404, so the count is computed from
// the urgent record.
//
// A Set of user ids, not a sum, because the live records overlap: on
// 77ada6f5 (second_opinion_group, completed) `operator` and `claimed_by` are
// both "LexGo Superadmin", so adding the two would have said 5 people where
// there are 4 — client + operator + 2 group advocates. `assigned_lawyer` is
// in the seed because a single-advocate chat consultation (eba06e95) carries
// the advocate there with `operator` null, and that room has two people in it
// however the group fields read.
function countParticipants(r: UrgentRequest | null): number {
  if (!r) return 0;
  const ids = new Set<string>();
  for (const id of [r.clientUserId, r.operatorUserId, r.claimedByUserId, r.assignedLawyerUserId, ...r.groupLawyerUserIds]) {
    if (id) ids.add(id);
  }
  return ids.size;
}

// R24 (MD L247): "message type" has to be visible on every message. A `system`
// or `result` message is not somebody talking — live they are the backend's
// own "Tezkor Advokat so'rovi qabul qilindi" and the advocate's closing
// "Chat konsultatsiya yakunlandi" — so they are drawn as a centred notice
// instead of a bubble with an avatar and a reply handle.
const NOTICE_TYPES = new Set(["system", "result"]);

// The quote an optimistic bubble shows before the server echoes its own back,
// so a reply does not lose its context for the second it is in flight.
function quotePreview(m: LocalMsg | null): SecureReply | null {
  if (!m) return null;
  return { id: m.id, sender: m.sender, messageType: m.messageType, content: m.filteredContent, isBlocked: m.isBlocked };
}

const KB = 1024;
function fmtSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}

// True for anything the browser can show as a picture. The mime type is what
// the backend stored (normSecureMsgFile); a file uploaded from a phone camera
// sometimes arrives with an empty or generic type, so the extension is the
// fallback rather than the other way round.
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i;
function isImageAttachment(file: LocalMsg["file"]): boolean {
  if (!file) return false;
  const mime = (file.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (mime && !mime.startsWith("application/octet-stream")) return false;
  return IMAGE_EXT.test(file.fileName || "");
}

// A file, photo or voice message inside a bubble. The attachment endpoint is
// participants-only, so nothing here can be a plain <a href> or an <img src>
// pointing at the backend — both would arrive without the bearer token and
// 401. The bytes are fetched once and held as an object URL instead.
function Attachment({ roomId, msg, t }: { roomId: string; msg: LocalMsg; t: ReturnType<typeof useTranslations> }) {
  const voice = msg.messageType === "voice";
  const image = !voice && isImageAttachment(msg.file);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(false);
  const [prev, setPrev] = useState(false);
  // A photo is only worth fetching once it is close to being looked at — a
  // long history would otherwise pull every image in it on mount.
  const [want, setWant] = useState(false);
  const hostRef = useRef<HTMLSpanElement>(null);
  const name = msg.file?.fileName || (voice ? t("voiceNote") : t("fileGeneric"));

  // Voice notes play inline, so they load themselves; a photo loads when it
  // scrolls into view; a plain file waits for a deliberate click rather than
  // pulling every attachment in the history.
  useEffect(() => {
    if (!image || want) return;
    const el = hostRef.current;
    if (!el) return;
    // No observer (old Safari, jsdom): load it straight away, but from a
    // timer rather than the effect body — a setState there is a cascading
    // render, and one tick makes no difference to a picture.
    if (typeof IntersectionObserver === "undefined") {
      const h = setTimeout(() => setWant(true), 0);
      return () => clearTimeout(h);
    }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setWant(true); },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [image, want]);

  const load = voice || (image && want);
  useEffect(() => {
    if (!load || !msg.id || msg.pending) return;
    let alive = true;
    let made = "";
    getSecureMessageFile(roomId, msg.id)
      .then((b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [roomId, msg.id, msg.pending, load]);

  async function download() {
    if (busy || !msg.id) return;
    setBusy(true);
    const ok = await fetchAndDeliver(() => getSecureMessageFile(roomId, msg.id), name, true);
    if (!ok) setErr(true);
    setBusy(false);
  }

  // A voice note plays in the bubble. The native <audio controls> that used
  // to sit here was a 38px grey slab with its own typography and its own
  // shade of blue; inside a gradient "my" bubble it read as a foreign object
  // pasted on. .vnote--bub is the house player at bubble size, and the CSS
  // re-colours it for the gradient side (see wp-voice in globals.css).
  if (voice)
    return (
      <span className="sattach sattach--voice">
        {url ? (
          <VoiceNotePlayer
            src={url}
            className="vnote--bub"
            playLabel={t("voicePlay")}
            pauseLabel={t("voicePause")}
            seekLabel={t("voiceSeek")}
            // The message id, not the object URL: the URL is re-minted every
            // time the bytes are re-fetched and the waveform would reshuffle
            // under the listener. A pending bubble has no server id yet, so
            // the file name stands in until the echo replaces the whole row.
            seed={msg.id || name}
          />
        ) : (
          <span className="sattach__wait">{err ? t("attachFailed") : msg.pending ? t("attachSending") : t("attachLoading")}</span>
        )}
      </span>
    );

  // A photo opens in the chat. Downloading it is still possible, but it is the
  // secondary control — clicking the picture used to save the file, which is
  // never what someone wants from a photo they were just sent.
  if (image)
    return (
      <span className="sattach sattach--img" ref={hostRef}>
        {url ? (
          <button type="button" className="sattach__thumb" onClick={() => setOpen(true)} title={t("imageOpen")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={name} />
            <span className="sattach__zoom" aria-hidden><IconEye /></span>
          </button>
        ) : (
          <span className="sattach__ph">
            {err ? t("attachFailed") : msg.pending ? t("attachSending") : t("attachLoading")}
          </span>
        )}
        <span className="sattach__cap">
          <small>{name}</small>
          <button type="button" className="sattach__dlbtn" onClick={download} disabled={busy || msg.pending} aria-label={t("attachDownload")} title={t("attachDownload")}>
            {busy ? <IconClock /> : <IconDownload />}
          </button>
        </span>
        {open && url ? (
          <ImageLightbox
            url={url}
            name={name}
            onClose={() => setOpen(false)}
            onDownload={() => void download()}
            closeLabel={t("close")}
            downloadLabel={t("attachDownload")}
          />
        ) : null}
      </span>
    );

  const previewable = !msg.pending && canPreviewFile(msg.file);
  return (
    <span className="sattach sattach--file">
      <button
        type="button"
        className="sattach__open"
        onClick={() => (previewable ? setPrev(true) : void download())}
        disabled={busy || msg.pending}
        title={previewable ? t("previewOpen") : t("attachDownload")}
      >
        <span className="sattach__i"><IconFileText /></span>
        <span className="sattach__t">
          <b>{name}</b>
          <small>{err ? t("attachFailed") : msg.pending ? t("attachSending") : fmtSize(msg.file?.size || 0)}</small>
        </span>
      </button>
      <button
        type="button"
        className="sattach__dlbtn"
        onClick={download}
        disabled={busy || msg.pending}
        aria-label={t("attachDownload")}
        title={t("attachDownload")}
      >
        {busy ? <IconClock /> : <IconDownload />}
      </button>
      {prev && msg.file ? (
        <ChatFilePreview file={msg.file} size={fmtSize(msg.file.size || 0)} onClose={() => setPrev(false)} />
      ) : null}
    </span>
  );
}

type Tr = ReturnType<typeof useTranslations>;

// R15 (MD L189-199). `POST /urgent-advokat/requests/{id}/chat/complete` takes
// `{ "summary": "…" }`, and the summary is what the client and the next
// advocate read afterwards — it comes back as payload.result_summary and is
// posted into the room as the closing `result` message (both seen live on
// record 77ada6f5: "Frontend test yakunlandi"). A window.confirm could only
// ever send an empty one, so the irreversible action asks for its summary in
// a form and keeps the confirmation it always had.
//
// Portaled to <body> like ImageLightbox: this chat is mounted inside a
// scrolling message column, and in the advocate's workspace inside a 360px
// panel, both of which would clip a centred dialog.
function CompleteDialog({
  t,
  busy,
  onCancel,
  onSubmit,
}: {
  t: Tr;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (summary: string) => void;
}) {
  const [summary, setSummary] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    // Capture phase, for the same reason the lightbox uses it: a CallRoom or
    // a Modal further up also answers Escape and this is the topmost thing.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="scomp" role="dialog" aria-modal="true" aria-label={t("completeChat")} onClick={onCancel}>
      <div className="scomp__box" onClick={(e) => e.stopPropagation()}>
        <div className="scomp__h">
          <span className="scomp__i" aria-hidden><IconClipboardCheck /></span>
          <b>{t("completeChat")}</b>
          <button type="button" className="scomp__x" onClick={onCancel} aria-label={t("close")}>
            <IconClose />
          </button>
        </div>
        <p className="scomp__lead">{t("completeConfirm")}</p>
        <label className="scomp__lbl" htmlFor="schat-summary">{t("completeSummary")}</label>
        <textarea
          id="schat-summary"
          className="scomp__ta"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t("completeSummaryPh")}
          maxLength={2000}
          rows={4}
          autoFocus
          disabled={busy}
        />
        <div className="scomp__acts">
          <button type="button" className="btn btn--line btn--sm" onClick={onCancel} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className="btn btn--grad btn--sm" onClick={() => onSubmit(summary)} disabled={busy}>
            {busy ? <IconClock /> : <IconClipboardCheck />}
            {busy ? t("completing") : t("completeSubmit")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// R34 (MD L208-240, L264-267): "mijozga 15 daqiqalik baholash oynasi
// ochiladi", and the MD puts it in the chat the consultation happened in.
// The widget is the house rating row — the same `.drate` markup and the same
// imported RateStar the document rating uses — but the POST is the urgent
// one, /urgent-advokat/requests/{id}/rating, so DocRatingBox itself (which
// hard-codes the document endpoint and takes no way to change it) could not
// simply be mounted here.
//
// The countdown is computed from the backend's own `rating.deadline_at`, not
// counted down from fifteen: a tab left open overnight then shows the truth
// rather than an inviting window that closed hours ago. 409 is "already rated
// or too late" — an answer, which closes the block, not a failure.
function ClientRatingBox({
  recordId,
  rating,
  tu,
  tr,
}: {
  recordId: string;
  rating: UrgentRequest["rating"];
  tu: Tr;
  tr: Tr;
}) {
  const tcb = useTranslations("common");
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const [err, setErr] = useState("");
  // Ticks the countdown from a timer callback, never from the effect body.
  const [now, setNow] = useState(() => Date.now());

  const deadline = rating.deadlineAt ? Date.parse(rating.deadlineAt) : NaN;
  const timed = !Number.isNaN(deadline);
  const left = timed ? deadline - now : Infinity;
  const shown = hover || stars;

  useEffect(() => {
    if (!timed) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [timed]);

  async function send() {
    if (!stars || busy) return;
    setBusy(true);
    setErr("");
    try {
      await rateUrgentRequest(recordId, stars, comment.trim());
      setDone(true);
    } catch (e) {
      if (isRatingClosed(e)) {
        setClosed(true);
        return;
      }
      logApiError("urgent chat rating", e);
      setErr(contactBlockedOf(e) ? tcb("contactBlocked") : errDetail(e) || tu("rateError"));
    } finally {
      setBusy(false);
    }
  }

  if (done || rating.submitted)
    return (
      <p className="schat__rate drate drate__done">
        <IconCheck />
        {tu("rateThanks")}
        {rating.value ? <em>{tu("rateGiven", { n: rating.value })}</em> : null}
      </p>
    );
  // Closed by the clock, by a 409, or because the backend already says so.
  if (closed || !ratingOpen(rating) || left <= 0) return null;

  return (
    <div className="schat__rate drate">
      <div className="drate__h">
        <b><RateStar />{tu("rateTitle")}</b>
        {timed ? <span className="drate__left"><IconClock />{clockLeft(left)}</span> : null}
      </div>
      <p className="schat__ratelead">{tu("rateLead")}</p>
      {/* `on` is "draw this star gold" and follows the pointer; `set` is "this
          is the rating that will be sent" and only changes on a click, which
          keeps the pop animation to the moment a rating is actually given.
          Buttons stay in reading order (1..5) so Tab and a screen reader walk
          the row forwards — the CSS-only preview trick needs them reversed. */}
      <div
        className="drate__stars"
        role="radiogroup"
        aria-label={tu("rateTitle")}
        onPointerLeave={() => setHover(0)}
        onBlur={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={tu("rateN", { n })}
            className={`drate__s${n <= shown ? " on" : ""}${n <= stars ? " set" : ""}`}
            onClick={() => setStars(n)}
            onPointerEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            disabled={busy}
          >
            <RateStar />
          </button>
        ))}
      </div>
      <p className="drate__word" aria-hidden="true">{shown ? tr(`w${shown}`) : ""}</p>
      <input
        className="drate__c"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={tu("rateCommentPh")}
        aria-label={tu("rateCommentPh")}
        maxLength={500}
        disabled={busy}
      />
      {err ? <p className="drate__err" role="status">{err}</p> : null}
      <button type="button" className="btn btn--grad btn--sm" onClick={() => void send()} disabled={!stars || busy}>
        {busy ? tu("sending") : tu("rateSubmit")}
      </button>
    </div>
  );
}
// mm:ss of what is left of the rating window.
function clockLeft(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function SecureChat({
  roomId,
  onClose,
  compact,
  urgentRecordId,
  workId,
  serviceTitle,
  participantCount,
  status: statusProp,
}: {
  roomId: string;
  onClose?: () => void;
  // Embedded in a side panel: one slim status line instead of the full
  // page header, and no controls that duplicate the host screen's own.
  compact?: boolean;
  // The Tezkor Advokat request this room belongs to. A room id is not enough:
  // completion is a request-level action (POST /urgent-advokat/requests/{id}
  // /chat/complete), and a plain secure chat has no such record — hence
  // optional, and the action only exists when a host screen supplies it.
  urgentRecordId?: string;
  // Header context the room itself does not carry: SecureRoom models only
  // clientUserId/sellerUserId, so the work number, the service and the size
  // of a three-party room all have to come from the screen that opened it.
  workId?: string;
  serviceTitle?: string;
  participantCount?: number;
  // R31 (MD L257): the header shows the work's status. A host screen that
  // already holds the record passes it so the chip paints on the first frame;
  // standalone, the record fetched below fills it in. Named `statusProp`
  // inside because `status` is taken by the message-loading state machine.
  status?: string;
}) {
  const t = useTranslations("secureChat");
  // Status words are the shared backend-enum vocabulary, translated by
  // statusLabel out of portal.common — the same source the inbox and the
  // call-centre board read, so one record never reads "Yakunlandi" on the
  // board and something else in its own chat header.
  const tc = useTranslations("portal.common");
  // The rating block below is the urgent-advocate rating shown in a different
  // place, not a second one: it reuses that namespace's wording (and
  // portal.client.rate's five words) rather than duplicating it here.
  const tu = useTranslations("portal.client.urgent");
  const tr = useTranslations("portal.client.rate");
  const locale = useLocale();
  const { session, ready } = useAuth();
  const router = useRouter();
  // Standalone this chat IS the page, so closing it means going back. Mounted
  // inside a document request it is a panel, and going back would take the
  // client off the request they were reading.
  const close = onClose ?? (() => router.back());
  const searchParams = useSearchParams();
  const [msgs, setMsgs] = useState<LocalMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [conn, setConn] = useState<Conn>("connecting");
  const [activeCall, setActiveCall] = useState<{ callId: string; callType: "audio" | "video"; isCaller: boolean; lk?: LiveKitJoin | null } | null>(null);
  const [incoming, setIncoming] = useState<{ callId: string; callType: "audio" | "video" } | null>(null);
  const [callBusy, setCallBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ttl, setTtl] = useState(0); // auto-delete window in hours (0 = off)
  const [callErr, setCallErr] = useState<string | null>(null);
  // The message being answered. The whole bubble is kept, not just its id, so
  // the preview strip can show the same name and excerpt the quote will.
  const [replyTo, setReplyTo] = useState<LocalMsg | null>(null);
  // Completed room. Set by our own "yakunlash", and by any 409 from a send —
  // the backend refuses every message once the request is completed, and a
  // room can be completed by the other side while this tab sits open.
  const [finished, setFinished] = useState(false);
  const [completing, setCompleting] = useState(false);
  // The Tezkor Advokat record this room belongs to, once it has been read
  // back. It is what supplies the three header facts the room itself does not
  // carry (status, participant count, service/work id), the initial value of
  // `finished`, and the client's rating window.
  const [rec, setRec] = useState<UrgentRequest | null>(null);
  // R15 (MD L189-199): `POST .../chat/complete` takes a `summary`, so ending
  // the consultation opens a form rather than a bare window.confirm that had
  // nowhere to type one.
  const [askSummary, setAskSummary] = useState(false);
  // Bubble to glow after a jump from a quote.
  const [flashId, setFlashId] = useState("");
  // Attachments: a file picked from disk, or a voice note recorded here.
  // Both travel as multipart over HTTP — the socket carries JSON only — so
  // neither can use send()'s WebSocket fast path.
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachErr, setAttachErr] = useState("");
  const [recOn, setRecOn] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const recRef = useRef<VoiceRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeCallRef = useRef(activeCall);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => {
    if (!recOn) return;
    const iv = setInterval(() => setRecSec((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [recOn]);
  // Leaving the chat with the mic still open would keep the recording
  // indicator lit in the browser tab indefinitely.
  useEffect(() => () => recRef.current?.cancel(), []);
  // Bumped after a content reveal so the history is fetched again unmasked.
  // Bumped to re-read the history from scratch. The only caller was the
  // content-reveal bar, which no longer renders; the key stays because the
  // effect below keys on it and a future re-read will need it.
  const [reloadKey] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const dismissedCalls = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  // Latest messages for async socket handlers (kept in sync after each render).
  const msgsRef = useRef<LocalMsg[]>([]);
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

  // R17 (MD L203-207), and the header facts R28-R31 ask for. Until this ran,
  // `finished` started at false on every mount: after a reload the composer
  // of a completed consultation still offered to send, and the send answered
  // 409. The record is the authority — GET /urgent-advokat/requests/{id}
  // answers every participant (probed as the client: 200, can_view true,
  // can_manage false), and it carries the status, the people, the work id and
  // the rating window in one read.
  //
  // `finished` is in the deps on purpose: when it flips (our own completion,
  // a 409, or the `result` message the socket delivers) the record is read
  // again, and THAT read is the one that carries the 15-minute rating window
  // the backend opens on completion. Setting it true a second time is a
  // no-op, so this settles after exactly one extra request.
  useEffect(() => {
    if (!urgentRecordId) return;
    let alive = true;
    getUrgentRequest(urgentRecordId)
      .then((r) => {
        if (!alive) return;
        setRec(r);
        if (urgentFinished(r)) setFinished(true);
      })
      // A record the viewer may not read is not an error worth a banner: the
      // chat still works, it just has no header chips and no rating window.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [urgentRecordId, finished]);

  // A plain secure chat has no urgent record, so the only thing that can say
  // whether it is closed is the room row itself — /secure-chats carries a
  // `status` per room. Measured on production: all 23 live rooms read
  // "active", including the room of two completed urgent records, so this is
  // a best-effort second source and never the one that turns a working chat
  // off; only an explicitly closed room stops the composer.
  useEffect(() => {
    if (urgentRecordId) return;
    let alive = true;
    listSecureChats()
      .then((rooms) => {
        const mine = rooms.find((r) => r.id === roomId);
        const st = (mine?.status || "").toLowerCase();
        if (alive && (st === "completed" || st === "closed")) setFinished(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roomId, urgentRecordId]);

  // The glow is a one-shot: the timer clears it so a second jump to the same
  // bubble restarts the animation instead of doing nothing.
  useEffect(() => {
    if (!flashId) return;
    const h = setTimeout(() => setFlashId(""), 1600);
    return () => clearTimeout(h);
  }, [flashId]);

  // Scroll to the message a quote points at. The history endpoint has no
  // pagination, so everything the room holds is already rendered — a miss
  // means the original was deleted, and silence is the right answer.
  function jumpTo(id: string) {
    const host = bodyRef.current;
    if (!host || !id) return;
    const key = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
    const el = host.querySelector<HTMLElement>(`[data-mid="${key}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
  }

  const senderName = (s: { name: string } | null) => s?.name.trim() || t("unknownSender");

  // One line standing in for a whole message. Both gates the bubble body goes
  // through apply: "[metadata_only]" is staff without the content-reveal
  // permission, and everything else is masked — quoting unmasked text would
  // hand back the phone number maskContacts hid one bubble above.
  function msgExcerpt(m: LocalMsg): string {
    if (m.messageType === "voice") return t("voiceNote");
    if (m.messageType === "file" || m.file) return m.file?.fileName || t("fileGeneric");
    if (!m.filteredContent || m.filteredContent === METADATA_ONLY) return t("hiddenQuote");
    return maskContacts(m.filteredContent);
  }

  // The quoted payload carries no attachment metadata, so a reply to a file
  // reads better off the original bubble; the embedded copy is the fallback
  // for a message that is no longer in the history.
  function quoteExcerpt(r: SecureReply): string {
    const original = msgs.find((x) => x.id === r.id);
    if (original) return msgExcerpt(original);
    if (r.messageType === "voice") return t("voiceNote");
    if (r.messageType === "file") return t("fileGeneric");
    if (!r.content || r.content === METADATA_ONLY) return t("hiddenQuote");
    return maskContacts(r.content);
  }

  // A quote needs the server's id, which an optimistic bubble does not have
  // yet, and a completed room takes no new messages at all.
  const canReply = (m: LocalMsg) => !finished && !!m.id && !m.pending && !m.failed && !m.id.startsWith("tmp-");

  // Ends the consultation for everyone: the request flips to `completed`, the
  // room with it, further sends answer 409 and the client's 15-minute rating
  // window opens. Irreversible, hence the confirmation — but R15 (MD L189-199)
  // sends a `summary` with it, and a window.confirm has nowhere to type one,
  // so the confirmation is the summary form and this is what it submits.
  async function completeChat(summary: string) {
    if (!urgentRecordId || completing || finished) return;
    setCompleting(true);
    try {
      await completeUrgentChat(urgentRecordId, summary.trim());
      setAskSummary(false);
      setFinished(true);
      setReplyTo(null);
      setCallErr(null);
    } catch (e) {
      // Someone else completed it first — the end state is the one we wanted,
      // so the form closes on it rather than showing a failure.
      if (isConflict(e)) {
        setAskSummary(false);
        setFinished(true);
      } else setCallErr(t("completeFailed"));
    } finally {
      setCompleting(false);
    }
  }

  // Start a call, or join the one already active in this room.
  async function beginCall(kind: "audio" | "video") {
    primeCallAudio(); // user gesture → tones allowed in the room
    if (callBusy || activeCall) return;
    setCallBusy(true);
    setCallErr(null);
    try {
      const calls = await listCalls(roomId);
      const live = calls.find((c) => c.status === "active" || c.status === "ringing");
      if (live) {
        setActiveCall({ callId: live.id, callType: live.callType === "video" ? "video" : "audio", isCaller: false });
      } else {
        const c = await startCall(roomId, kind, t(kind === "video" ? "videoCall" : "audioCall"));
        // Caller already has its LiveKit token from the create response.
        setActiveCall({
          callId: c.id,
          callType: kind,
          isCaller: true,
          lk: c.livekitToken ? { url: c.livekitUrl, room: c.livekitRoom, token: c.livekitToken, hints: c.hints, quality: c.quality } : null,
        });
      }
      setIncoming(null);
    } catch {
      setCallErr(t("callFailed"));
    } finally {
      setCallBusy(false);
    }
  }
  function joinIncoming() {
    primeCallAudio();
    if (!incoming) return;
    setActiveCall({ callId: incoming.callId, callType: incoming.callType, isCaller: false });
    setIncoming(null);
  }

  // Chat retention controls. The backend keeps a ~1-month archive after delete.
  async function applyTtl(hours: number) {
    const prev = ttl;
    setTtl(hours);
    setMenuOpen(false);
    try {
      await setChatAutoDelete(roomId, hours);
    } catch {
      setTtl(prev); // revert — the change did not persist
      setCallErr(t("settingsFailed"));
    }
  }
  async function removeChat() {
    setMenuOpen(false);
    if (typeof window !== "undefined" && !window.confirm(t("deleteConfirm"))) return;
    try {
      await deleteSecureChat(roomId);
      close();
    } catch {
      setCallErr(t("deleteFailed"));
    }
  }
  const TTL_OPTS: { h: number; key: string }[] = [
    { h: 0, key: "ttlOff" },
    { h: 24, key: "ttl24h" },
    { h: 168, key: "ttl7d" },
    { h: 720, key: "ttl30d" },
  ];

  // A call another participant started: `call.created` on the room socket
  // (LEXGO_CALL_WEBSOCKET_FRONTEND_UPDATE); GET /calls only on open and when
  // the socket reconnects (`conn` flips back to online) — no periodic polling.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    const check = async () => {
      try {
        const calls = await listCalls(roomId);
        const live = calls
          .filter((c) => isFreshIncomingCall(c, session.id) && !dismissedCalls.current.has(c.id))
          .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
        if (alive) setIncoming(live && !activeCallRef.current ? { callId: live.id, callType: live.callType === "video" ? "video" : "audio" } : null);
      } catch {
        /* ignore */
      }
    };
    if (conn === "online") void check();
    const unsub = subscribeRoomCallEvents(roomId, (e) => {
      const call = (e.call && typeof e.call === "object" ? e.call : {}) as Record<string, unknown>;
      const callId = String(e.call_id ?? call.id ?? "");
      const callStatus = String(e.status ?? call.status ?? "").trim().toLowerCase();
      if (e.event === "call.ended" || TERMINAL_CALL_STATUSES.has(callStatus)) {
        setIncoming((cur) => (cur && cur.callId === callId ? null : cur));
        return;
      }
      if (callStatus && !["active", "ringing"].includes(callStatus)) return;
      if (e.event === "call.created") {
        const caller = String(e.caller_user_id ?? call.caller_user_id ?? "");
        if (!callId || caller === session.id || dismissedCalls.current.has(callId) || activeCall) return;
        // The caller's own `call.created` can arrive before setActiveCall — re-check shortly after.
        setTimeout(() => {
          if (activeCallRef.current || dismissedCalls.current.has(callId)) return;
          setIncoming({ callId, callType: String(call.call_type) === "audio" ? "audio" : "video" });
        }, caller ? 0 : 800);
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [roomId, session, activeCall, conn]);

  // Auto-join a call when arriving from an incoming-call notification (?join=id).
  useEffect(() => {
    const joinId = searchParams.get("join");
    if (!joinId || activeCall) return;
    let alive = true;
    listCalls(roomId)
      .then((calls) => {
        const c = calls.find((x) => x.id === joinId);
        if (alive && c && (c.status === "active" || c.status === "ringing")) setActiveCall({ callId: c.id, callType: c.callType === "video" ? "video" : "audio", isCaller: false });
        // Drop the deep link so a reload / back navigation doesn't re-open the call.
        if (alive && typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, roomId]);

  // Ring while an in-room incoming call is pending.
  useEffect(() => {
    if (!incoming || activeCall) return;
    const stop = playRingtone();
    return stop;
  }, [incoming, activeCall]);

  function push(list: LocalMsg[]) {
    const fresh = list.filter((m) => !m.id || !seen.current.has(m.id));
    if (!fresh.length) return;
    for (const m of fresh) if (m.id) seen.current.add(m.id);
    setMsgs((prev) => [...prev, ...fresh]);
  }

  useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let firstOpen = true;

    // Fetch history — also on every reconnect, to catch messages that arrived
    // while the socket was down.
    async function loadHistory() {
      try {
        const m = await getSecureMessages(roomId);
        if (!alive) return;
        push(m); // dedupes via the `seen` set
        setStatus("ready");
      } catch {
        if (alive) setStatus((s) => (s === "ready" ? s : "error"));
      }
    }

    // Exponential backoff with jitter (1s → 30s cap), reset on a successful open.
    function scheduleReconnect(delay = backoffMs(retry)) {
      if (!alive) return;
      retry = Math.min(retry + 1, 10);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delay);
    }

    // Optimistic bubbles still waiting for their echo.
    function failPending(reason?: string) {
      setSending(false);
      setMsgs((prev) => prev.map((x) => (x.pending ? { ...x, pending: false, failed: true } : x)));
      if (reason) setCallErr(reason);
    }

    // The socket answers auth problems with {event:"error", status_code} frames
    // instead of closing. 401: refresh the token, reopen the socket with it and
    // store the unsent messages over HTTP. 403: those messages can't be sent.
    let refreshingAuth = false;
    async function onAuthExpired() {
      if (refreshingAuth) return;
      refreshingAuth = true;
      const fresh = await refreshAccessToken().catch(() => null);
      refreshingAuth = false;
      if (!alive) return;
      if (!fresh) {
        failPending(t("wsSessionExpired"));
        return;
      }
      // Reopen with the new token (the old socket's URL carries the stale one).
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      retry = 0;
      clearTimeout(reconnectTimer);
      connect();
      // Messages the socket rejected: store them over HTTP.
      const pendingNow = msgsRef.current.filter((x) => x.pending);
      for (const p of pendingNow) {
        try {
          // R9c (MD L99-115): the quote travels as meta.reply_to_message_id,
          // and the optimistic bubble is already carrying the id it was
          // answering. Replaying it over HTTP without that id stored the
          // reply as a loose message — the one path in this file where a
          // quote could silently disappear between typing and sending.
          const m = await sendSecureMessage(roomId, p.filteredContent, p.replyToId);
          if (m.id) seen.current.add(m.id);
          if (alive) setMsgs((prev) => prev.map((x) => (x.id === p.id ? { ...m } : x)));
        } catch {
          if (alive) setMsgs((prev) => prev.map((x) => (x.id === p.id ? { ...x, pending: false, failed: true } : x)));
        }
      }
      if (alive) setSending(false);
    }

    function connect() {
      if (!alive) return;
      setConn("connecting");
      try {
        ws = new WebSocket(secureSocketUrl(roomId, getToken()));
        wsRef.current = ws;
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        if (!alive) return;
        retry = 0;
        setConn("online");
        if (!firstOpen) loadHistory(); // re-sync after a drop
        firstOpen = false;
      };
      ws.onmessage = (e) => {
        try {
          const o = JSON.parse(e.data);
          if (o && isCallEvent(o.event)) {
            emitRoomCallEvent(roomId, o);
            return;
          }
          if (o && o.event === "error") {
            const code = Number(o.status_code) || 0;
            const detail = typeof o.detail === "string" ? o.detail : "";
            if (code === 401) void onAuthExpired();
            // 409 on a send means the room is completed. It will stay
            // completed, so this is the end state, not a retryable failure.
            else if (code === 409) {
              setFinished(true);
              failPending(t("chatFinished"));
            } else failPending(code === 403 ? detail || t("wsForbidden") : detail || t("wsSendFailed"));
            return;
          }
          const raw = (o.message ?? o) as Record<string, unknown>;
          const m: LocalMsg = { ...normSecureMsgCore(raw), ...normSecureMsgFile(raw) };
          if (!m.id) return;
          // Completing the consultation posts a closing message into the room
          // itself — captured live in room f43fa109: message_type "result",
          // content "Chat konsultatsiya yakunlandi", meta carrying
          // urgent_advokat_request_id and source "tezkor_advokat". It is how
          // a client's open tab learns the advocate ended it (R17, MD L203-207)
          // without having to discover it from a 409 on their next message.
          // The raw frame is read for `meta` because the normalizer keeps only
          // the attachment half of it.
          if (m.messageType === "result" && urgentRecordId) {
            const meta = (raw.meta && typeof raw.meta === "object" ? raw.meta : {}) as Record<string, unknown>;
            if (String(meta.urgent_advokat_request_id ?? "") === urgentRecordId) setFinished(true);
          }
          // My own message echoed back → replace the optimistic bubble.
          if (session && m.senderId === session.id) {
            setSending(false);
            setMsgs((prev) => {
              if (seen.current.has(m.id)) return prev;
              const idx = prev.findIndex((x) => x.pending && (x.messageType || "text") === (m.messageType || "text"));
              seen.current.add(m.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = m;
                return next;
              }
              return [...prev, m];
            });
          } else {
            push([m]);
          }
        } catch {
          /* ignore non-JSON frames */
        }
      };
      const sock = ws;
      ws.onclose = () => {
        // A socket replaced after a token refresh must not schedule another reconnect.
        if (!alive || wsRef.current !== sock) return;
        setConn("offline");
        scheduleReconnect();
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* onclose handles reconnect */
        }
      };
    }

    // Don't sit out the backoff when the device comes back online (mobile
    // network switch, laptop wake): reconnect at once. Going offline shows the
    // state immediately instead of waiting for the socket to time out.
    const onOnline = () => {
      if (!alive || ws?.readyState === WebSocket.OPEN) return;
      retry = 0;
      clearTimeout(reconnectTimer);
      connect();
    };
    const onOffline = () => {
      if (alive) setConn("offline");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    loadHistory();
    connect();

    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, reloadKey]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs, sending]);

  // One upload path for both kinds. The bubble is optimistic like a text
  // message, but there is no socket echo to reconcile against on failure —
  // the HTTP response is the only confirmation, so it replaces the bubble.
  async function sendAttachment(file: File | Blob, messageType: "file" | "voice", fileName?: string) {
    if (attachBusy || finished) return;
    setAttachBusy(true);
    setAttachErr("");
    const quoted = replyTo;
    setReplyTo(null);
    const tempId = `tmp-${Date.now()}`;
    const name = fileName || (file instanceof File ? file.name : "");
    setMsgs((prev) => [
      ...prev,
      {
        id: tempId,
        senderId: session?.id ?? "",
        sender: null,
        replyToId: quoted?.id ?? "",
        replyTo: quotePreview(quoted),
        filteredContent: "",
        isBlocked: false,
        createdAt: new Date().toISOString(),
        messageType,
        file: { fileName: name, mimeType: file.type, size: file.size, downloadUrl: "", inlineUrl: "", preview: null },
        pending: true,
      },
    ]);
    try {
      const m = await uploadSecureMessage(roomId, { file, messageType, fileName: name, replyToId: quoted?.id });
      if (m.id) seen.current.add(m.id);
      setMsgs((prev) => prev.map((x) => (x.id === tempId ? m : x)));
    } catch (e) {
      setMsgs((prev) => prev.map((x) => (x.id === tempId ? { ...x, pending: false, failed: true } : x)));
      // The completed-room 409 is not the "try again" the generic notice
      // promises — the finished banner says so instead.
      if (isConflict(e)) setFinished(true);
      else setAttachErr(t("attachFailed"));
    } finally {
      setAttachBusy(false);
    }
  }

  function pickFile(files: FileList | null) {
    const f = files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    // 25 MB — past this the upload reliably times out on a phone connection
    // and the failure arrives long after the user has moved on.
    if (f.size > 25 * 1024 * 1024) {
      setAttachErr(t("attachTooBig"));
      return;
    }
    void sendAttachment(f, "file");
  }

  // Recording has to begin inside the click handler: iOS refuses the
  // microphone when getUserMedia is reached after an await boundary.
  async function toggleVoice() {
    if (attachBusy) return;
    const rec = recRef.current;
    if (rec?.active) {
      setRecOn(false);
      const note = await rec.stop();
      recRef.current = null;
      if (note) void sendAttachment(note.blob, "voice", `voice-${Date.now()}.${note.mime.includes("mp4") || note.mime.includes("aac") ? "m4a" : note.mime.includes("ogg") ? "ogg" : "webm"}`);
      return;
    }
    // Only the start is blocked once the room is completed: a recording that
    // was already running still has to be stoppable, or the mic stays lit.
    if (finished) return;
    setAttachErr("");
    const next = new VoiceRecorder();
    // Stored before the await — see AttachmentPicker for why.
    recRef.current = next;
    try {
      await next.start();
    } catch {
      recRef.current = null;
      setAttachErr(t("micDenied"));
      return;
    }
    if (!next.active) return;
    setRecSec(0);
    setRecOn(true);
  }

  function cancelVoice() {
    recRef.current?.cancel();
    recRef.current = null;
    setRecOn(false);
  }

  async function send() {
    const content = text.trim();
    if (!content || finished) return;
    setText("");
    const quoted = replyTo;
    setReplyTo(null);
    // Optimistic bubble; reconciled when the server echoes it back.
    const tempId = `tmp-${Date.now()}`;
    const optimistic: LocalMsg = {
      id: tempId,
      senderId: session?.id ?? "",
      sender: null,
      replyToId: quoted?.id ?? "",
      replyTo: quotePreview(quoted),
      filteredContent: content,
      isBlocked: false,
      createdAt: new Date().toISOString(),
      messageType: "text",
      file: null,
      pending: true,
    };
    setMsgs((prev) => [...prev, optimistic]);
    setSending(true);

    // Send over the WebSocket so the backend broadcasts it live to the other
    // participant (an HTTP POST is NOT broadcast). Fall back to HTTP if the
    // socket is down — that message is at least stored.
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        // The socket frame is the POST body: `meta.reply_to_message_id` is the
        // field the REST endpoint stores a quote from and the one the backend
        // echoes back on every message, so the quote rides the same envelope
        // the socket already carries.
        ws.send(JSON.stringify({ content, message_type: "text", meta: quoted?.id ? { reply_to_message_id: quoted.id } : {} }));
        return; // echo reconciles the optimistic bubble and clears "sending"
      } catch {
        /* fall through to HTTP */
      }
    }
    try {
      const m = await sendSecureMessage(roomId, content, quoted?.id ?? "");
      if (m.id) seen.current.add(m.id);
      setMsgs((prev) => prev.map((x) => (x.id === tempId ? { ...m } : x)));
    } catch (e) {
      setMsgs((prev) => prev.map((x) => (x.id === tempId ? { ...x, pending: false, failed: true } : x)));
      // A completed room refuses every send with 409, and will keep doing so —
      // the finished banner explains it instead of a "try again" that can't.
      if (isConflict(e)) setFinished(true);
    } finally {
      setSending(false);
    }
  }

  if (ready && !session) {
    return (
      <div className="schat schat--gate">
        <span className="schat__gicon"><IconLock /></span>
        <p>{t("loginRequired")}</p>
        <Link href="/login" className="btn btn--pri">{t("login")}</Link>
      </div>
    );
  }

  const connLabel = conn === "online" ? t("online") : conn === "connecting" ? t("connecting") : t("offline");

  // The four things MD L253-257 asks the header to carry (R28-R31). The host
  // screen's value wins where it has one — the call-centre board knows the
  // localised service name before this component has fetched anything — and
  // the record read above fills in the rest, including every case the room is
  // opened from a plain link.
  const headWorkId = workId || rec?.workId || "";
  const headService = serviceTitle || rec?.serviceTitle || "";
  const headStatus = statusProp || rec?.status || "";
  const headPeople = participantCount || countParticipants(rec);
  // R34 (MD L264-267): "Mijoz uchun: chat completed bo'lgandan keyin Baholash
  // chiqadi". Both halves are checked against the record rather than against
  // the session's role list, so an operator who also happens to be the client
  // on some other record is never offered it here: this is the rating for
  // THIS work, and only the person who asked for it may leave one.
  const viewerIsClient = !!rec && !!session && rec.clientUserId === session.id;
  const showRating = finished && !!urgentRecordId && viewerIsClient;

  let lastDay = "";

  return (
    <div className={`schat${compact ? " schat--compact" : ""}`}>
      <div className="schat__head">
        {compact ? null : (
          <button className="schat__x" type="button" aria-label={t("close")} onClick={close}>
            <IconClose />
          </button>
        )}
        <span className="schat__i">
          <IconShieldCheck />
          <i className={`schat__pulse schat__pulse--${conn}`} aria-hidden />
        </span>
        <div className="schat__t">
          <b>{t("title")}</b>
          {/* R28/R29/R31 (MD L253-257): the work id, the service and the
              status, on one line under the title. */}
          {headService || headWorkId || headStatus ? (
            <span className="schat__sub">
              {headService ? <span className="schat__svc">{headService}</span> : null}
              {headWorkId ? <span className="schat__wid">#{headWorkId}</span> : null}
              {headStatus ? (
                <span className={`schat__st schat__st--${headStatus}`} title={t("statusTitle")}>
                  {statusLabel(tc, headStatus)}
                </span>
              ) : null}
            </span>
          ) : null}
          <span className={`schat__conn schat__conn--${conn}`}>
            <i className="schat__cdot" aria-hidden />
            {connLabel}
          </span>
        </div>
        {headPeople ? (
          <span className="schat__ppl" title={t("participants", { count: headPeople })}>
            <IconUsers />
            {headPeople}
          </span>
        ) : null}
        {!compact && canMakeCalls(session) ? (
          <div className="schat__calls">
            <button
              className="schat__call"
              type="button"
              onClick={() => beginCall("audio")}
              disabled={callBusy || !!activeCall}
              aria-label={t("audioCall")}
            >
              <IconPhone />
            </button>
            <button
              className="schat__call schat__call--video"
              type="button"
              onClick={() => beginCall("video")}
              disabled={callBusy || !!activeCall}
              aria-label={t("videoCall")}
            >
              <IconVideo />
            </button>
          </div>
        ) : null}
        {compact ? null : (
          <span className="schat__lock" title={t("secured")}>
            <IconLock />
            {t("e2e")}
          </span>
        )}
        {/* Only an advocate or the operator may complete the consultation; a
            client is answered 403, so the action is not offered to one. */}
        {urgentRecordId && isStaffSession(session) && !finished ? (
          <button
            className="schat__done"
            type="button"
            onClick={() => setAskSummary(true)}
            disabled={completing}
            title={t("completeChat")}
          >
            {completing ? <IconClock /> : <IconClipboardCheck />}
            <span>{t("completeChat")}</span>
          </button>
        ) : null}
        <div className="schat__menu" hidden={compact}>
          <button
            className="schat__call"
            type="button"
            aria-label={t("chatSettings")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <IconClock />
          </button>
          {menuOpen ? (
            <div className="schat__drop" role="menu">
              <p className="schat__droplabel">{t("ttlTitle")}</p>
              {TTL_OPTS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={`schat__dropi${ttl === o.h ? " on" : ""}`}
                  onClick={() => applyTtl(o.h)}
                >
                  {ttl === o.h ? <IconCheck /> : <span className="schat__dropdot" />}
                  {t(o.key)}
                </button>
              ))}
              <div className="schat__dropsep" />
              <button type="button" className="schat__dropi schat__dropi--danger" onClick={removeChat}>
                <IconClose />
                {t("deleteChat")}
              </button>
              <p className="schat__dropnote">{t("archiveNote")}</p>
            </div>
          ) : null}
        </div>
      </div>

      {callErr ? (
        <div className="schat__err" role="alert">
          <IconAlert />
          {callErr}
          <button type="button" className="schat__errx" aria-label={t("close")} onClick={() => setCallErr(null)}><IconClose /></button>
        </div>
      ) : null}

      {incoming && !activeCall ? (
        <div className="schat__callbar">
          <span className="schat__callbar-l">
            <i className="schat__callpulse" aria-hidden />
            {incoming.callType === "video" ? <IconVideo /> : <IconPhone />}
            {t("incomingCall")}
          </span>
          <div className="schat__callbar-a">
            <button
              className="btn btn--line btn--sm"
              type="button"
              onClick={() => {
                if (incoming) dismissedCalls.current.add(incoming.callId);
                setIncoming(null);
              }}
            >
              {t("callDismiss")}
            </button>
            <button className="btn btn--sm schat__joincall" type="button" onClick={joinIncoming}>
              {t("callJoin")}
            </button>
          </div>
        </div>
      ) : null}

      {activeCall && session ? (
        <CallRoom
          roomId={roomId}
          callId={activeCall.callId}
          callType={activeCall.callType}
          isCaller={activeCall.isCaller}
          lk={activeCall.lk}
          onEnd={() => setActiveCall(null)}
        />
      ) : null}

      <div className="schat__body" ref={bodyRef}>
        <div className="schat__sys">
          <IconLock />
          <span>{t("encrypted")}</span>
        </div>

        {status === "loading" ? (
          <div className="schat__load" aria-hidden>
            <span className="sskel sskel--them" />
            <span className="sskel sskel--me" />
            <span className="sskel sskel--them" />
          </div>
        ) : status === "error" ? (
          <div className="schat__empty">
            <span className="schat__halo"><IconAlert /></span>
            <p>{t("errorLoad")}</p>
          </div>
        ) : msgs.length === 0 ? (
          <div className="schat__empty">
            <span className="schat__halo"><IconShieldCheck /></span>
            <p>{t("empty")}</p>
          </div>
        ) : (
          msgs.map((m, i) => {
            const mine = !!session && m.senderId === session.id;
            const quoted = m.replyTo;
            const dk = dayKey(m.createdAt);
            let sep: React.ReactNode = null;
            if (dk && dk !== lastDay) {
              lastDay = dk;
              const today = new Date().toDateString();
              const yday = new Date();
              yday.setDate(yday.getDate() - 1);
              const yd = yday.toDateString();
              const label = dk === today ? t("today") : dk === yd ? t("yesterday") : dateOnly(m.createdAt, locale);
              sep = <div className="schat__day" key={`d-${dk}`}><span>{label}</span></div>;
            }
            // R24 (MD L247). A `system` row is the backend narrating the work
            // ("Tezkor Advokat so'rovi qabul qilindi") and a `result` row is
            // the closing summary the advocate sent with the completion —
            // both are about the room, not messages in it, so neither gets an
            // avatar, a delivery tick or a reply handle. The type is named in
            // words on the row because that is what the MD asks for: every
            // message shows what kind of message it is.
            if (NOTICE_TYPES.has(m.messageType)) {
              const result = m.messageType === "result";
              return (
                <Fragment key={`w-${m.id || i}`}>
                  {sep}
                  <div className={`snote${result ? " snote--result" : ""}`} data-mid={m.id || undefined} role="note">
                    <span className="snote__i" aria-hidden>{result ? <IconClipboardCheck /> : <IconInfo />}</span>
                    <span className="snote__b">
                      <em className="snote__k">{result ? t("noticeResult") : t("noticeSystem")}</em>
                      {m.filteredContent ? <span className="snote__c">{maskContacts(m.filteredContent)}</span> : null}
                    </span>
                    <time className="snote__t" dateTime={m.createdAt || undefined}>{fmtTime(m.createdAt)}</time>
                  </div>
                </Fragment>
              );
            }
            return (
              <Fragment key={`w-${m.id || i}`}>
                {sep}
                <div className={`sbub sbub--${mine ? "me" : "them"}${flashId && flashId === m.id ? " sbub--flash" : ""}`} data-mid={m.id || undefined}>
                  {!mine ? <span className="sbub__av"><IconUser /></span> : null}
                  <div className="sbub__wrap">
                    {/* A Tezkor Advokat room has three parties, so "not mine"
                        does not identify anyone — name every incoming bubble. */}
                    {!mine && m.sender ? (
                      <div className="sbub__who">
                        <b>{senderName(m.sender)}</b>
                        {m.sender.role ? <span className="sbub__role">{roleLabel(m.sender.role, t)}</span> : null}
                      </div>
                    ) : null}
                    <div className={`sbub__c${m.failed ? " sbub__c--failed" : ""}`}>
                      {quoted ? (
                        <button
                          type="button"
                          className="sbub__quote"
                          onClick={() => jumpTo(quoted.id)}
                          title={t("replyJump")}
                        >
                          <b>{senderName(quoted.sender)}</b>
                          <span>{quoteExcerpt(quoted)}</span>
                        </button>
                      ) : null}
                      {m.messageType === "voice" || m.messageType === "file" || m.file ? (
                        <Attachment roomId={roomId} msg={m} t={t} />
                      ) : null}
                      {m.filteredContent ? <MsgBody text={maskContacts(m.filteredContent)} label={t("joinZoom")} /> : null}
                    </div>
                    {m.isBlocked ? (
                      <div className="sbub__blocked">
                        <IconAlert />
                        {m.blockReason ? localizeApiDetail(m.blockReason) : t("blocked")}
                      </div>
                    ) : null}
                    <div className="sbub__meta">
                      <span>{fmtTime(m.createdAt)}</span>
                      {mine ? (
                        m.failed ? (
                          <IconAlert className="sbub__rx sbub__rx--fail" />
                        ) : m.pending ? (
                          <IconClock className="sbub__rx" />
                        ) : (
                          <IconCheckDouble className="sbub__rx sbub__rx--ok" />
                        )
                      ) : null}
                    </div>
                  </div>
                  {/* Last child, so row-reverse on my own bubbles puts it on
                      the outer side of both columns without a second rule. */}
                  {canReply(m) ? (
                    <button
                      type="button"
                      className="sbub__reply"
                      onClick={() => setReplyTo(m)}
                      aria-label={t("reply")}
                      title={t("reply")}
                    >
                      <IconChevronLeft />
                    </button>
                  ) : null}
                </div>
              </Fragment>
            );
          })
        )}

        {sending ? (
          <div className="sbub sbub--me">
            <div className="sbub__wrap">
              <div className="sbub__typing"><i /><i /><i /></div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="schat__note">
        <IconLock />
        {t("safetyNote")}
      </div>

      {attachErr ? <div className="schat__attacherr" role="alert">{attachErr}</div> : null}

      {finished ? (
        <div className="schat__fin" role="status">
          <IconClipboardCheck />
          {t("chatFinished")}
        </div>
      ) : null}

      {/* R34 (MD L264-267): the client rates the work in the chat it happened
          in, once it is completed. It sits above the composer rather than
          inside the scrolling history so it cannot be scrolled past — the
          window is fifteen minutes long. */}
      {showRating && rec ? (
        <ClientRatingBox recordId={rec.id || urgentRecordId || ""} rating={rec.rating} tu={tu} tr={tr} />
      ) : null}

      {askSummary ? (
        <CompleteDialog
          t={t}
          busy={completing}
          onCancel={() => setAskSummary(false)}
          onSubmit={(summary) => void completeChat(summary)}
        />
      ) : null}

      {replyTo ? (
        <div className="schat__replybar">
          <span className="schat__replyi" aria-hidden><IconChevronLeft /></span>
          <span className="schat__replyt">
            <b>{senderName(replyTo.sender)}</b>
            <small>{msgExcerpt(replyTo)}</small>
          </span>
          <button type="button" className="schat__replyx" onClick={() => setReplyTo(null)} aria-label={t("replyCancel")} title={t("replyCancel")}>
            <IconClose />
          </button>
        </div>
      ) : null}

      <div className={`schat__bar${recOn ? " schat__bar--rec" : ""}`}>
        {recOn ? (
          <>
            <button type="button" className="schat__reccancel" onClick={cancelVoice} aria-label={t("voiceCancel")}>
              <IconTrash />
            </button>
            <span className="schat__rec" role="status">
              <i />
              {voiceDuration(recSec * 1000)}
              <small>{t("voiceHint")}</small>
            </span>
            <button type="button" onClick={() => void toggleVoice()} aria-label={t("voiceSend")}>
              <IconSend />
            </button>
          </>
        ) : (
          <>
            <input ref={fileRef} type="file" hidden onChange={(e) => pickFile(e.target.files)} />
            <button
              type="button"
              className="schat__attach"
              onClick={() => fileRef.current?.click()}
              disabled={attachBusy || finished}
              aria-label={t("attachFile")}
              title={t("attachFile")}
            >
              <IconPaperclip />
            </button>
            {/* Positioned over the text input, so it lives beside it rather
                than pinned to the bar — the attach button now takes the
                bar's left edge, and while recording there is no input. */}
            <span className="schat__barlock" aria-hidden><IconLock /></span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              disabled={finished}
            />
            {/* The mic replaces Send only while there is nothing typed, so a
                half-written message can never be lost to a stray tap. */}
            {!text.trim() && canRecordVoice() ? (
              <button type="button" className="schat__mic" onClick={() => void toggleVoice()} disabled={attachBusy || finished} aria-label={t("voiceRecord")} title={t("voiceRecord")}>
                <IconMic />
              </button>
            ) : (
              <button type="button" onClick={send} disabled={sending || finished || !text.trim()} aria-label={t("send")}>
                <IconSend />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
