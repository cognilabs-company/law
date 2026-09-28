"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth, canMakeCalls, hasAdminAccess, sessionRoles, type Session } from "@/lib/auth";
import ContentRevealBar from "./ContentRevealBar";
import { emitRoomCallEvent, isCallEvent, subscribeRoomCallEvents } from "@/lib/callEvents";
import { maskContacts } from "@/lib/chatFilter";
import { getToken } from "@/lib/client";
import { backoffMs, isConflict, refreshAccessToken } from "@/lib/http";
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
  type SecureMessage,
  type SecureReply,
  type LiveKitJoin,
} from "@/lib/services/backend";
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
  IconUpload,
  IconMic,
  IconTrash,
  IconFileText,
  IconDownload,
  IconEye,
  IconUsers,
  IconChevronLeft,
  IconClipboardCheck,
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

  return (
    <button type="button" className="sattach sattach--file" onClick={download} disabled={busy || msg.pending}>
      <span className="sattach__i"><IconFileText /></span>
      <span className="sattach__t">
        <b>{name}</b>
        <small>{err ? t("attachFailed") : msg.pending ? t("attachSending") : fmtSize(msg.file?.size || 0)}</small>
      </span>
      <span className="sattach__dl">{busy ? <IconClock /> : <IconDownload />}</span>
    </button>
  );
}

export default function SecureChat({
  roomId,
  onClose,
  compact,
  urgentRecordId,
  workId,
  serviceTitle,
  participantCount,
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
}) {
  const t = useTranslations("secureChat");
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
  const [reloadKey, setReloadKey] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const dismissedCalls = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  // Latest messages for async socket handlers (kept in sync after each render).
  const msgsRef = useRef<LocalMsg[]>([]);
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

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
  // window opens. Irreversible, hence the confirm.
  async function completeChat() {
    if (!urgentRecordId || completing || finished) return;
    if (typeof window !== "undefined" && !window.confirm(t("completeConfirm"))) return;
    setCompleting(true);
    try {
      await completeUrgentChat(urgentRecordId);
      setFinished(true);
      setReplyTo(null);
      setCallErr(null);
    } catch (e) {
      // Someone else completed it first — the end state is the one we wanted.
      if (isConflict(e)) setFinished(true);
      else setCallErr(t("completeFailed"));
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
          lk: c.livekitToken ? { url: c.livekitUrl, room: c.livekitRoom, token: c.livekitToken } : null,
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
        const live = calls.find(
          (c) => (c.status === "active" || c.status === "ringing") && c.callerUserId !== session.id && !dismissedCalls.current.has(c.id),
        );
        if (alive) setIncoming(live && !activeCall ? { callId: live.id, callType: live.callType === "video" ? "video" : "audio" } : null);
      } catch {
        /* ignore */
      }
    };
    if (conn === "online") void check();
    const unsub = subscribeRoomCallEvents(roomId, (e) => {
      const call = (e.call && typeof e.call === "object" ? e.call : {}) as Record<string, unknown>;
      const callId = String(e.call_id ?? call.id ?? "");
      if (e.event === "call.created") {
        const caller = String(e.caller_user_id ?? call.caller_user_id ?? "");
        if (!callId || caller === session.id || dismissedCalls.current.has(callId) || activeCall) return;
        // The caller's own `call.created` can arrive before setActiveCall — re-check shortly after.
        setTimeout(() => {
          if (activeCallRef.current || dismissedCalls.current.has(callId)) return;
          setIncoming({ callId, callType: String(call.call_type) === "audio" ? "audio" : "video" });
        }, caller ? 0 : 800);
      } else if (e.event === "call.ended") {
        setIncoming((cur) => (cur && cur.callId === callId ? null : cur));
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
    setMsgs((prev) => {
      const next = [...prev];
      for (const m of list) {
        if (m.id && seen.current.has(m.id)) continue;
        if (m.id) seen.current.add(m.id);
        next.push(m);
      }
      return next;
    });
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
          const m = await sendSecureMessage(roomId, p.filteredContent);
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
        file: { fileName: name, mimeType: file.type, size: file.size, downloadUrl: "" },
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
          {serviceTitle || workId ? (
            <span className="schat__sub">
              {serviceTitle ? <span className="schat__svc">{serviceTitle}</span> : null}
              {workId ? <span className="schat__wid">#{workId}</span> : null}
            </span>
          ) : null}
          <span className={`schat__conn schat__conn--${conn}`}>
            <i className="schat__cdot" aria-hidden />
            {connLabel}
          </span>
        </div>
        {participantCount ? (
          <span className="schat__ppl" title={t("participants", { count: participantCount })}>
            <IconUsers />
            {participantCount}
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
            onClick={() => void completeChat()}
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

      {hasAdminAccess(session) ? (
        <ContentRevealBar roomId={roomId} onChanged={() => { seen.current.clear(); setMsgs([]); setReloadKey((k) => k + 1); }} />
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
              <IconUpload />
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
