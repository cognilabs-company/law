"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  VideoPresets43,
  ScreenSharePresets,
  isVideoCodec,
  type ConnectionQuality,
  type LocalParticipant,
  type LocalVideoTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RoomOptions,
  type TrackPublication,
  type VideoResolution,
} from "livekit-client";
import {
  getCallJoinToken,
  getCall,
  endCall,
  endMeeting,
  leaveCall,
  updateCallParticipant,
  inviteCallParticipant,
  callSocketUrl,
  requestCallRecording,
  setCallRecordingPermission,
  startCallRecordingServer,
  freeExtendCall,
  requestCallExtensionPayment,
  pauseCall,
  resumeCall,
  type LiveKitJoin,
  type CallSession,
  type CallConnectionHints,
  type CallParticipant,
  type CallPermissions,
  type CallQualityPolicy,
} from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { getToken } from "@/lib/client";
import { emitRoomCallEvent, isCallEvent, subscribeRoomCallEvents } from "@/lib/callEvents";
import { subscribeUserEvents } from "@/lib/userSocket";
import { CaptureShield, MeetingWatermark, useCaptureGuard, type GuardTrip } from "./MeetingGuard";
import { backoffMs, refreshAccessToken } from "@/lib/http";
import { useAuth, canMakeCalls } from "@/lib/auth";
import { initials } from "@/lib/lawyers";
import { makeInviteSearch, type InviteSearch } from "@/lib/inviteSearch";
import SearchSelect from "@/components/SearchSelect";
import { playRingback, playEndTone, playJoinTone, playLeaveTone, playRecTone, primeCallAudio } from "@/lib/callSounds";
import { MeetingRecorder, canRecord, canRecordScreen, saveRecording, type RecordingFile, type RecordingMode } from "@/lib/meetingRecorder";
import { useFlip } from "@/lib/useFlip";
import { IconPhone, IconClose, IconMic, IconMicOff, IconVideo, IconUsers, IconUserPlus, IconChat, IconMonitor, IconRefresh, IconSend, IconGrid, IconUser, IconDownload, IconMinus, IconPlus, IconClock, IconRecord } from "../icons";
import { regionLabel } from "@/lib/labels";

type Props = {
  roomId: string;
  callId: string;
  callType: "audio" | "video";
  isCaller: boolean;
  title?: string;
  // Caller already has LiveKit creds from the create-call response; a joiner
  // fetches its own token via /join-token.
  lk?: LiveKitJoin | null;
  // LEXGO_FRONTEND_WORD_EDITOR_DESIGN_GUIDE.md §"Meeting UI" — "Tavsiya:
  // editor sahifada floating video panel": bottom-right, draggable,
  // resizable and minimizable, so the advocate keeps working on the document
  // while talking to the client instead of the call covering the workspace.
  float?: boolean;
  // "Nobody else is here" ends the call after a short grace period —
  // except for a host who may still invite people into a titled meeting.
  // That used to be inferred from `title`, which a plain one-to-one call
  // also passes just to label its header, leaving the caller stuck in an
  // empty room after the other side hung up.
  keepAlone?: boolean;
  onEnd: () => void;
};

const FLOAT_MIN_W = 260;
const FLOAT_MIN_H = 190;
type FloatBox = { right: number; bottom: number; w: number; h: number };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type ChatMsg = { id: string; from: string; name: string; text: string; at: number; system?: boolean };
type Toast = { id: number; text: string; kind: "join" | "leave" | "info" };
// A client's pending "may I record?" (approver side) / my own request (requester side).
type RecAsk = { id: string; name: string; mode: RecordingMode; at: number };
type RecReq = { mode: RecordingMode; left: number };

const MOBILE = () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
const EMPTY_GRACE_SEC = 10;
// Timestamp for data-channel messages (kept out of the component so the
// compiler lint does not treat the event handlers as impure render code).
const stamp = () => Date.now();
const REC_ASK_SEC = 30; // a recording request without an answer expires
// How long a hold lasts before the backend resumes the call by itself. The
// route's own default is 5 minutes, but it is sent explicitly so the hint the
// host reads ("to'xtatib turish — {n} daqiqa") and what the server does can
// never drift apart.
const PAUSE_MINUTES = 5;
const PORTRAIT_HINT = () => typeof window !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
// The LiveKit token carries {"role": <backend role>} as participant metadata.
const roleOf = (p: Participant): string => {
  try { return String((JSON.parse(p.metadata || "{}") as { role?: unknown }).role ?? ""); } catch { return ""; }
};

// ── Adaptive call quality ────────────────────────────────────────
// The backend ships a per-call quality policy (LexGo Call Adaptive Quality):
// the Room options it wants, a video profile ladder, and what this client
// should do at each LiveKit connection-quality rating. Measured over 148 live
// calls, every call carries one — but a null policy has to keep behaving
// exactly like the room did before it existed.
// The rungs, weakest first, so an action can be told apart as an upgrade or a
// downgrade without asking the backend which way the ladder runs.
const PROFILE_RANK = ["audio_only", "low", "medium", "high"];
// How long the connect path will wait for the policy before giving up on it.
// Ringing must never be held hostage to an extra read: past this the Room is
// built exactly the way it was built before policies existed.
const POLICY_WAIT_MS = 2500;
const rungOf = (name: string) => PROFILE_RANK.indexOf(name);
const resOf = (p: { width: number; height: number; fps: number }): VideoResolution => ({ width: p.width, height: p.height, frameRate: p.fps });
// Room options are frozen at construction, so the policy has to be in hand
// before `new Room` — hence the fetch on the connect path rather than a
// later hand-off from the meta poll. Without a policy this returns exactly
// the values the room has always used.
function roomOptionsFor(pol: CallQualityPolicy | null, phone: boolean): RoomOptions {
  const base: RoomOptions = {
    // Subscribers pick the layer their tile really needs (screen pixels, not
    // CSS pixels) — a tile that looks small on a retina screen still gets a
    // sharp layer; video keeps flowing while the tab is briefly hidden.
    adaptiveStream: { pixelDensity: "screen", pauseVideoInBackground: false },
    dynacast: true,
    publishDefaults: {
      simulcast: true,
      // Top layer = the capture resolution (720p desktop / 540p 4:3 phone);
      // weaker viewers fall back to 360p / 180p instead of a blurry single stream.
      videoSimulcastLayers: phone ? [VideoPresets43.h240, VideoPresets43.h360] : [VideoPresets.h360, VideoPresets.h540],
      screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
      screenShareSimulcastLayers: [ScreenSharePresets.h720fps15],
      videoEncoding: VideoPresets.h720.encoding,
    },
    // Phones: 4:3 capture (a 16:9 crop of a 4:3 sensor looks zoomed, especially on the back camera).
    videoCaptureDefaults: { facingMode: "user", resolution: phone ? VideoPresets43.h540.resolution : VideoPresets.h720.resolution },
  };
  if (!pol) return base;
  const low = pol.profiles.low;
  return {
    ...base,
    // The policy only says whether adaptiveStream is on at all; the tuning
    // inside it (pixel density, background behaviour) stays ours.
    adaptiveStream: pol.room.adaptiveStream ? base.adaptiveStream : false,
    dynacast: pol.room.dynacast,
    stopLocalTrackOnUnpublish: pol.room.stopLocalTrackOnUnpublish,
    audioCaptureDefaults: {
      echoCancellation: pol.audioCapture.echoCancellation,
      noiseSuppression: pol.audioCapture.noiseSuppression,
      autoGainControl: pol.audioCapture.autoGainControl,
    },
    publishDefaults: {
      ...base.publishDefaults,
      simulcast: pol.publish.simulcast,
      dtx: pol.publish.dtx,
      red: pol.publish.red,
      backupCodec: pol.publish.backupCodec,
      // The backend sends a free-form string; anything the SDK does not know
      // would be published as-is and fail, so an unknown name keeps vp8.
      ...(isVideoCodec(pol.publish.videoCodec) ? { videoCodec: pol.publish.videoCodec } : {}),
    },
    // start_profile is "low" on every video call: capture small and let the
    // connection-quality actions climb, rather than opening at 720p and
    // dropping once the link is already saturated.
    videoCaptureDefaults: low ? { facingMode: "user", resolution: resOf(low) } : base.videoCaptureDefaults,
  };
}

// The meeting-limit slice of a call, kept as its own object so the room can
// re-read it wholesale on every poll without re-rendering on unrelated
// roster churn.
type CallLimits = Pick<
  CallSession,
  "paused" | "pauseExpiresAt" | "pausedRemainingSeconds" | "freeExtensionUsed" | "freeExtensionAvailable" | "freeExtensionMaxMinutes" | "paidExtensionPricePerMinute" | "pendingExtensionRequest" | "maxDurationMinutes" | "clientCallUsage"
>;
function callLimitsOf(c: CallSession): CallLimits {
  return {
    paused: c.paused,
    pauseExpiresAt: c.pauseExpiresAt,
    pausedRemainingSeconds: c.pausedRemainingSeconds,
    freeExtensionUsed: c.freeExtensionUsed,
    freeExtensionAvailable: c.freeExtensionAvailable,
    freeExtensionMaxMinutes: c.freeExtensionMaxMinutes,
    paidExtensionPricePerMinute: c.paidExtensionPricePerMinute,
    pendingExtensionRequest: c.pendingExtensionRequest,
    maxDurationMinutes: c.maxDurationMinutes,
    clientCallUsage: c.clientCallUsage,
  };
}

// Whether a CallRoom is on screen (any page). IncomingCallWatcher uses it so a
// meeting resumed by a launcher isn't offered a second time by its own card;
// mounting also fires a "lexgo:callroom" window event.
let mountedRooms = 0;
export function isCallRoomMounted(): boolean { return mountedRooms > 0; }
export const CALLROOM_EVENT = "lexgo:callroom";

// In-app audio/video meeting over LiveKit (managed SFU + coturn on the
// backend). Everything stays inside LexGo: a tile per participant with name,
// mic state and speaking ring, screen share on a stage, in-call chat over the
// LiveKit data channel, and host controls from the backend roster.
export default function CallRoom({ roomId, callId, callType, isCaller, title, lk, float, keepAlone: keepAloneProp, onEnd }: Props) {
  const t = useTranslations("call");
  const te = useTranslations("enums");
  const { session } = useAuth();
  const roomRef = useRef<Room | null>(null);
  // The Room object is also kept in state so participants can be read during
  // render; a new one is created per call (see the connect effect).
  const [room, setRoom] = useState<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  // Connect/publish guards — the backend flags repeated connect/publish/
  // unpublish as a negotiation loop, so each must happen exactly once.
  const connectedRef = useRef(false);
  const publishedRef = useRef(false);
  const [status, setStatus] = useState<"connecting" | "ringing" | "live" | "ended" | "error">("connecting");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(callType === "video");
  const [camBusy, setCamBusy] = useState(false);
  // The call's adaptive-quality policy. In state because `video_enabled`
  // decides whether the camera control exists at all; in a ref because the
  // LiveKit handlers are registered once and would otherwise close over the
  // null it had at connect time.
  const [quality, setQuality] = useState<CallQualityPolicy | null>(null);
  const qualityRef = useRef<CallQualityPolicy | null>(null);
  // Guarded, so a poll that has not answered yet cannot wipe the policy the
  // connect path already fetched.
  useEffect(() => { if (quality) qualityRef.current = quality; }, [quality]);
  // Transport hints. Nothing here is rendered — only auto_quality is read,
  // as the switch that says whether this client may walk the ladder at all.
  const hintsRef = useRef<CallConnectionHints | null>(null);
  // Which rung the adaptive controller is currently on, so a repeated
  // "excellent" does not restart the camera over and over.
  const profileRef = useRef("");
  // What the USER wants the camera to be. An auto-upgrade may bring back a
  // camera the controller put away; it must never switch on one the person
  // deliberately switched off.
  const camWantedRef = useRef(false);
  const autoCamOffRef = useRef(false);
  // Set between Reconnecting and Reconnected: a LiveKit auto-reconnect is not
  // a hang-up and must not run the "everybody left" countdown.
  const reconnectingRef = useRef(false);
  const [sharing, setSharing] = useState(false);
  const [mirror, setMirror] = useState(true); // front camera preview is mirrored
  const facingRef = useRef<"user" | "environment">("user");
  const [tick, setTick] = useState(0); // bump to re-read LiveKit participant state
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  // LEXGO_MEETING_EXTENSION_FRONTEND_UPDATE.md — a document meeting runs 15
  // minutes. The host extends it once for free, then only by having the
  // client pay per minute, and the call is PAUSED (not ended) while that
  // payment is waiting on a Telegram approve/reject.
  const [limits, setLimits] = useState<CallLimits | null>(null);
  const [extBusy, setExtBusy] = useState(false);
  const [extErr, setExtErr] = useState("");
  const [extOpen, setExtOpen] = useState(false);
  const [extMinutes, setExtMinutes] = useState(10);
  // The pause control's own state is ONLY "is a request in the air". Whether
  // the meeting is held is `paused` below, which comes off the poll and the
  // call.paused / call.resumed events — so the other side resuming, or the
  // hold expiring, moves this button without it being told.
  const [pauseBusy, setPauseBusy] = useState(false);
  // Set when the pause route answers 404/405, i.e. this backend does not have
  // it deployed. A control that can only ever fail is worse than no control.
  const [pauseGone, setPauseGone] = useState(false);
  const paused = !!limits?.paused;
  // Read by the connect effect, which runs long before the pause effect and
  // must not publish into a call that is already paused.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [hostMuted, setHostMuted] = useState(false); // muted by host → can't self-unmute
  const [roster, setRoster] = useState<CallParticipant[]>([]);
  // Who has declined this call, so the room can say it instead of ringing on.
  const [declined, setDeclined] = useState<string[]>([]);
  const declinedRef = useRef<Set<string>>(new Set());
  const [perms, setPerms] = useState<CallPermissions | null>(null);
  const [panel, setPanel] = useState<"" | "chat" | "people">("");
  const [view, setView] = useState<"grid" | "speaker">("grid");
  const [pinned, setPinned] = useState<string | null>(null); // participant identity on the stage
  const [metaTick, setMetaTick] = useState(0); // bump to force a roster refresh
  const [invitePicks, setInvitePicks] = useState<string[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [canSwitchCam, setCanSwitchCam] = useState(false);
  // Local recording (audio of everyone) + who else is recording (data channel).
  const recorderRef = useRef<MeetingRecorder | null>(null);
  const [recOn, setRecOn] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [recFile, setRecFile] = useState<RecordingFile | null>(null);
  const [recBy, setRecBy] = useState<Set<string>>(new Set());
  const [more, setMore] = useState(false); // phone "more" sheet
  // Floating-panel geometry (float mode only). Anchored bottom-right, so the
  // resize grip sits at the TOP-LEFT corner: dragging it up/left grows the
  // panel, which is the direction there is room in.
  const [fbox, setFbox] = useState<FloatBox>({ right: 18, bottom: 18, w: 380, h: 300 });
  const [fmin, setFmin] = useState(false);
  // Seeded from the prop (the document editor opens straight into the panel),
  // but the user owns it from then on.
  const [floating, setFloating] = useState(!!float);
  const canFloat = true;
  const fdrag = useRef<{ mode: "move" | "size"; x: number; y: number; box: FloatBox } | null>(null);
  function beginFloat(mode: "move" | "size", e: ReactPointerEvent<HTMLElement>) {
    if (!floating) return;
    if (mode === "move" && (e.target as HTMLElement).closest("button")) return;
    fdrag.current = { mode, x: e.clientX, y: e.clientY, box: fbox };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  const dragFloat = (e: ReactPointerEvent<HTMLElement>) => beginFloat("move", e);
  const sizeFloat = (e: ReactPointerEvent<HTMLElement>) => beginFloat("size", e);
  const moveFloat = (e: ReactPointerEvent<HTMLElement>) => {
    const d = fdrag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setFbox(
      d.mode === "move"
        ? { ...d.box, right: clamp(d.box.right - dx, 4, Math.max(4, vw - d.box.w - 4)), bottom: clamp(d.box.bottom - dy, 4, Math.max(4, vh - d.box.h - 4)) }
        : { ...d.box, w: clamp(d.box.w - dx, FLOAT_MIN_W, Math.max(FLOAT_MIN_W, vw - d.box.right - 8)), h: clamp(d.box.h - dy, FLOAT_MIN_H, Math.max(FLOAT_MIN_H, vh - d.box.bottom - 8)) },
    );
  };
  const endFloat = () => { fdrag.current = null; };
  // Shrink the panel to whatever the window can actually hold before showing
  // it — the default 380x300 hangs off the side of a phone.
  function fitFloat() {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setFbox((b) => {
      const w = clamp(b.w, FLOAT_MIN_W, Math.max(FLOAT_MIN_W, vw - 16));
      const h = clamp(b.h, FLOAT_MIN_H, Math.max(FLOAT_MIN_H, vh - 16));
      return { w, h, right: clamp(b.right, 4, Math.max(4, vw - w - 4)), bottom: clamp(b.bottom, 4, Math.max(4, vh - h - 4)) };
    });
  }
  const [recPick, setRecPick] = useState(false); // choose audio / screen before recording
  const [recMode, setRecMode] = useState<RecordingMode>("audio");
  const stageRef = useRef<HTMLElement>(null);
  const [recUrl, setRecUrl] = useState("");
  const firstJoinRef = useRef(true);
  // Recording consent: a client may only record with a staff/seller's OK.
  // Approvers = call-center/staff (meetings.manage) and advocates/lawyers.
  // Their approval is asked through the backend (recording-request →
  // recording-permission), broadcast to the room over the call WebSocket.
  const iApprove = canMakeCalls(session) || session?.role === "advocate" || session?.role === "lawyer";
  const approverRef = useRef(iApprove);
  useEffect(() => { approverRef.current = iApprove; }, [iApprove]);
  const [recAsks, setRecAsks] = useState<RecAsk[]>([]); // approver: open requests
  const [recReq, setRecReq] = useState<RecReq | null>(null); // requester: my pending request
  const recReqRef = useRef<RecReq | null>(null);
  useEffect(() => { recReqRef.current = recReq; }, [recReq]);
  // Non-host approvers announce themselves ({t:"role"}); hosts are always
  // approvers (starting a meeting needs meetings.manage) and the token
  // metadata carries the backend role, so most cases need no announcement.
  const [announced, setAnnounced] = useState<Set<string>>(new Set());
  const startRecRef = useRef<(mode: RecordingMode) => void>(() => {});
  // Everyone else left (host closed the tab, network drop…): a short countdown,
  // then this side ends too — unless I host a titled meeting and may invite more.
  const hadRemoteRef = useRef(false);
  const [emptyLeft, setEmptyLeft] = useState<number | null>(null);
  const keepAlone = isCaller && !!keepAloneProp;
  // Call signalling socket (join/leave/end relayed to the other participants).
  const callWsRef = useRef<WebSocket | null>(null);
  const inviteSearchRef = useRef<InviteSearch | null>(null);
  const rosterRef = useRef<CallParticipant[]>([]);
  useEffect(() => { rosterRef.current = roster; }, [roster]);
  // Mount bookkeeping for isCallRoomMounted() + the window event.
  useEffect(() => {
    mountedRooms += 1;
    try { window.dispatchEvent(new CustomEvent(CALLROOM_EVENT)); } catch { /* ignore */ }
    return () => { mountedRooms -= 1; };
  }, []);
  const signal = (event: "call.join" | "call.leave" | "call.end") => {
    const ws = callWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({ event, payload: {} })); } catch { /* ignore */ } }
  };
  const prevMicRef = useRef<boolean | null>(null); // last roster mic value (detect host action)
  const leftRef = useRef(false); // guard against double-leave
  const toastSeq = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef(panel);
  useEffect(() => { panelRef.current = panel; }, [panel]);

  const clearActive = () => { try { sessionStorage.removeItem("lexgo_active_call"); } catch { /* ignore */ } recorderRef.current?.dispose(); recorderRef.current = null; };
  useEffect(() => {
    if (!recOn) return;
    const t0 = Date.now();
    const iv = setInterval(() => setRecSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [recOn]);
  const finish = () => { clearActive(); onEnd(); };
  // Remote end (call.ended on the room socket): tone, disconnect, close — no API call.
  const onEndRef = useRef<() => void>(() => {});
  useEffect(() => { onEndRef.current = () => { playEndTone(); roomRef.current?.disconnect(); clearActive(); onEnd(); }; });
  // Countdown once everyone else has left; a rejoin cancels it (see onJoin).
  useEffect(() => {
    if (emptyLeft == null) return;
    if (emptyLeft <= 0) { onEndRef.current?.(); return; }
    const tm = setTimeout(() => setEmptyLeft((s) => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(tm);
  }, [emptyLeft]);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  const toast = useCallback((text: string, kind: Toast["kind"]) => {
    const id = ++toastSeq.current;
    setToasts((ts) => [...ts, { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3200);
  }, []);
  // Display name: backend roster (identity = user id) → LiveKit name → id.
  // The LiveKit handlers are registered once, so they read the latest via a ref.
  const nameOf = useCallback((p: Participant) => roster.find((r) => r.userId === p.identity)?.name || p.name || t("someone"), [roster, t]);
  const nameOfRef = useRef(nameOf);
  useEffect(() => { nameOfRef.current = nameOf; }, [nameOf]);

  useEffect(() => {
    let alive = true;
    // adaptiveStream (subscriber only pulls the resolution its tile needs) +
    // dynacast + simulcast keep bandwidth down so audio doesn't lag on weak
    // connections. Phones capture with the front camera at 360p — a portrait
    // stream; tiles follow the stream's orientation (see Tile).
    const phone = PORTRAIT_HINT();
    // Built below rather than here: its options come from the backend's
    // quality policy and a Room cannot be reconfigured after construction.
    // Every handler closes over this binding, and none of them can fire
    // before it is filled.
    let room: Room | null = null;

    const attachAudio = (track: RemoteTrack) => {
      const c = audioRef.current;
      if (!c || track.kind !== Track.Kind.Audio) return;
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      c.appendChild(el);
    };
    // Approvers tell the room they can grant recording (newcomers too).
    const announceRole = () => {
      if (!approverRef.current || !connectedRef.current || !room) return;
      room.localParticipant.publishData(enc({ t: "role", approver: true, at: Date.now() }), { reliable: true }).catch(() => {});
    };
    const onJoin = (p: RemoteParticipant) => {
      if (!alive) return;
      bump();
      setStatus("live");
      hadRemoteRef.current = true;
      setEmptyLeft(null);
      playJoinTone(firstJoinRef.current);
      firstJoinRef.current = false;
      const name = nameOfRef.current(p);
      toast(t("joinedToast", { name }), "join");
      setMessages((m) => [...m, { id: `sys-${Date.now()}`, from: p.identity, name, text: t("joinedToast", { name }), at: Date.now(), system: true }]);
      announceRole();
    };
    const onLeave = (p: RemoteParticipant) => {
      if (!alive) return;
      bump();
      playLeaveTone();
      const name = nameOfRef.current(p);
      toast(t("leftToast", { name }), "leave");
      setMessages((m) => [...m, { id: `sys-${Date.now()}`, from: p.identity, name, text: t("leftToast", { name }), at: Date.now(), system: true }]);
      setPinned((cur) => (cur === p.identity ? null : cur));
      // Whoever left is no longer recording, asking or able to approve.
      setRecBy((cur) => { if (!cur.has(p.identity)) return cur; const n = new Set(cur); n.delete(p.identity); return n; });
      setRecAsks((a) => a.filter((x) => x.id !== p.identity));
      setAnnounced((cur) => { if (!cur.has(p.identity)) return cur; const n = new Set(cur); n.delete(p.identity); return n; });
      // Not while LiveKit is re-establishing the session: a full reconnect
      // drops and re-adds the remote participants, and that momentary empty
      // room used to be indistinguishable from everyone hanging up.
      if (room?.remoteParticipants.size === 0 && hadRemoteRef.current && !keepAlone && !reconnectingRef.current) {
        toast(t("emptyEnding", { s: EMPTY_GRACE_SEC }), "leave");
        setEmptyLeft(EMPTY_GRACE_SEC);
      }
    };

    // ── The quality ladder ───────────────────────────────────────
    // Silent by contract: user_visible_quality_prompt is false on every call
    // in production and connection_hints says "the client switches quality
    // silently", so nothing below may reach the screen — no toast, no status
    // line, no wording about the connection.
    const applyProfile = async (name: string, cameraAllowed: boolean) => {
      const pol = qualityRef.current;
      if (!room || !pol || !connectedRef.current) return;
      const lp = room.localParticipant;
      // audio_only (and any action that forbids the camera) drops video only:
      // audio_priority means the mic is the last thing to go, never the first.
      if (!cameraAllowed || name === "audio_only" || !pol.videoEnabled) {
        profileRef.current = "audio_only";
        if (!lp.isCameraEnabled) return;
        autoCamOffRef.current = true;
        await lp.setCameraEnabled(false).catch(() => {});
        if (alive) setCamOn(false);
        return;
      }
      const prof = pol.profiles[name];
      if (!prof) return;
      if (!lp.isCameraEnabled) {
        // Only a camera THIS controller put away comes back, and only into a
        // call that is not paused (a paused call publishes nothing at all).
        if (!autoCamOffRef.current || !camWantedRef.current || pausedRef.current) return;
        autoCamOffRef.current = false;
        profileRef.current = name;
        await lp.setCameraEnabled(true, { facingMode: facingRef.current, resolution: resOf(prof) }).catch(() => {});
        if (alive) { setCamOn(true); bump(); }
        return;
      }
      if (profileRef.current === name) return;
      profileRef.current = name;
      const track = lp.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
      // restartTrack swaps the capture track inside the existing publication:
      // no second publish, so the backend's negotiation-loop guard never sees
      // a quality change at all.
      if (track) await track.restartTrack({ facingMode: facingRef.current, resolution: resOf(prof) }).catch(() => {});
    };
    const onQuality = (q: ConnectionQuality, p: Participant) => {
      // Remote participants rate their own uplink; only mine says anything
      // about what this client should be publishing.
      if (!alive || !p.isLocal) return;
      const pol = qualityRef.current;
      if (!pol || hintsRef.current?.autoQuality === false) return;
      // Production ships user_visible_quality_prompt=false. Were it ever
      // true the contract would be "ask before switching", and this room has
      // no prompt to ask with — so it does nothing rather than switch behind
      // a flag that says not to.
      if (pol.userVisibleQualityPrompt) return;
      const act = pol.actions[q];
      if (!act) return; // ConnectionQuality.Unknown has no action
      const up = rungOf(act.profile) > rungOf(profileRef.current);
      if (up ? !pol.autoUpgrade : !pol.autoDowngrade) return;
      if (!pol.audioOnlyFallback && act.profile === "audio_only") return;
      void applyProfile(act.profile, act.cameraAllowed);
    };

    const wire = (r: Room) => r
      .on(RoomEvent.TrackSubscribed, (track) => { if (track.kind === Track.Kind.Audio) attachAudio(track); if (alive) { bump(); setStatus("live"); } })
      .on(RoomEvent.TrackUnsubscribed, (track) => { // Video elements belong to React tiles — only the hidden audio elements are removed.
        track.detach().forEach((e) => { if (e.tagName === "AUDIO") e.remove(); }); if (alive) bump(); })
      .on(RoomEvent.ParticipantConnected, onJoin)
      .on(RoomEvent.ParticipantDisconnected, onLeave)
      .on(RoomEvent.ActiveSpeakersChanged, () => { if (alive) bump(); })
      .on(RoomEvent.TrackStreamStateChanged, () => { if (alive) bump(); })
      .on(RoomEvent.ParticipantNameChanged, () => { if (alive) bump(); })
      .on(RoomEvent.LocalTrackPublished, (pub) => { if (alive) { bump(); if (pub.source === Track.Source.ScreenShare) setSharing(true); } })
      .on(RoomEvent.LocalTrackUnpublished, (pub) => { if (alive) { bump(); if (pub.source === Track.Source.ScreenShare) setSharing(false); } })
      // Browser autoplay policy can block remote audio until a user gesture.
      .on(RoomEvent.AudioPlaybackStatusChanged, () => { if (alive) setAudioBlocked(!r.canPlaybackAudio); })
      // Reflect a host/server mute of my own mic instantly in the UI.
      .on(RoomEvent.TrackMuted, (pub, p) => { if (!alive) return; bump(); if (p.isLocal && pub.source === Track.Source.Microphone) setMicOn(false); })
      .on(RoomEvent.TrackUnmuted, (pub, p) => { if (!alive) return; bump(); if (p.isLocal && pub.source === Track.Source.Microphone) setMicOn(true); })
      // In-call chat rides the LiveKit data channel — nothing to store.
      .on(RoomEvent.DataReceived, (payload, p) => {
        if (!alive) return;
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as { t?: string; text?: string; at?: number; on?: boolean; mode?: string; name?: string; to?: string; approver?: boolean; allowed?: boolean; why?: string };
          if (msg.t === "rec" && p) {
            const on = msg.on === true;
            setRecBy((cur) => { const n = new Set(cur); if (on) n.add(p.identity); else n.delete(p.identity); return n; });
            if (on) setRecAsks((a) => a.filter((x) => x.id !== p.identity)); // request answered elsewhere
            toast(on ? t("recStartedBy", { name: nameOfRef.current(p) }) : t("recStoppedBy", { name: nameOfRef.current(p) }), on ? "leave" : "join");
            return;
          }
          // Approver self-announcement (a non-host approver isn't otherwise
          // knowable from the LiveKit roster). Recording consent itself
          // (request/allow-deny/start) rides the call WebSocket, not this
          // data channel — see the recording-events effect below.
          if (msg.t === "role" && p) {
            if (msg.approver) setAnnounced((cur) => (cur.has(p.identity) ? cur : new Set(cur).add(p.identity)));
            return;
          }
          // Recording consent over the data channel. The backend broadcast is
          // the primary path (it is the one that writes server-side state);
          // this is the fallback that keeps the prompt working when the
          // broadcast never arrives, and it is deduped by user id on both ends.
          if (msg.t === "recask" && p && approverRef.current && p.identity !== session?.id) {
            const mode: RecordingMode = msg.mode === "screen" ? "screen" : "audio";
            setRecAsks((a) => (a.some((x) => x.id === p.identity) ? a : [...a, { id: p.identity, name: nameOfRef.current(p), mode, at: Date.now() }]));
            playJoinTone(false);
            toast(t("recAskToast", { name: nameOfRef.current(p) }), "info");
            return;
          }
          if (msg.t === "guard" && p) {
            toast(t("guardPeer", { name: nameOfRef.current(p) }), "leave");
            return;
          }
          if (msg.t === "recans" && p) {
            if (msg.to && msg.to !== session?.id) { setRecAsks((a) => a.filter((x) => x.id !== msg.to)); return; }
            const req = recReqRef.current;
            if (!req) return;
            setRecReq(null);
            const who = nameOfRef.current(p);
            if (msg.allowed) { toast(t("recAllowedBy", { name: who }), "join"); startRecRef.current(req.mode); }
            else toast(t("recDeniedBy", { name: who }), "leave");
            return;
          }
          if (msg.t === "chat" && msg.text) {
            const name = p ? nameOfRef.current(p) : t("someone");
            setMessages((m) => [...m, { id: `${p?.identity ?? "x"}-${msg.at ?? Date.now()}`, from: p?.identity ?? "", name, text: msg.text!, at: msg.at ?? Date.now() }]);
            if (panelRef.current !== "chat") setUnread((n) => n + 1);
          }
        } catch { /* not ours */ }
      })
      .on(RoomEvent.ConnectionQualityChanged, onQuality)
      // Three distinct states, where there used to be one. LiveKit drives its
      // own reconnect: the session is coming back, the tracks and the roster
      // survive it, and none of that is a hang-up — so it only falls back to
      // the generic "connecting" line the header already renders.
      .on(RoomEvent.Reconnecting, () => {
        if (!alive) return;
        reconnectingRef.current = true;
        setStatus("connecting");
      })
      .on(RoomEvent.Reconnected, () => {
        if (!alive) return;
        reconnectingRef.current = false;
        setStatus(r.remoteParticipants.size ? "live" : "ringing");
        bump();
        // A full reconnect renegotiates the publisher from scratch, so the
        // camera can come back down even though nobody touched it. Restore it
        // only where the policy still has video, the user still wants it, and
        // the last action did not take it away.
        const pol = qualityRef.current;
        const lp = r.localParticipant;
        if (!pol || !pol.videoEnabled || !camWantedRef.current || autoCamOffRef.current || pausedRef.current || lp.isCameraEnabled) return;
        const prof = pol.profiles[profileRef.current] ?? pol.profiles.low;
        void lp
          .setCameraEnabled(true, prof ? { facingMode: facingRef.current, resolution: resOf(prof) } : undefined)
          .then(() => { if (alive) { setCamOn(true); bump(); } })
          .catch(() => {});
      })
      // Terminal, exactly as before. LiveKit emits this only once its own
      // reconnect attempts are spent, so reaching here really is the end of
      // the call and not an attempt in progress.
      .on(RoomEvent.Disconnected, () => {
        if (!alive) return;
        reconnectingRef.current = false;
        setStatus("ended");
        finish();
      });

    (async () => {
      try {
        // Token and policy in parallel: the policy decides the Room options,
        // which cannot be changed after construction, so it has to be here
        // rather than handed over later by the meta poll. A call without one
        // (older backend, or a failed read) keeps every value this room used
        // before the policy existed.
        const [creds, call] = await Promise.all([
          lk && lk.token ? Promise.resolve(lk) : getCallJoinToken(roomId, callId),
          Promise.race([
            getCall(roomId, callId).then((c) => c, () => null),
            new Promise<null>((res) => setTimeout(() => res(null), POLICY_WAIT_MS)),
          ]),
        ]);
        if (!alive) return;
        if (call) {
          qualityRef.current = call.quality;
          hintsRef.current = call.hints;
          setQuality((cur) => cur ?? call.quality);
        }
        const pol = qualityRef.current;
        profileRef.current = pol?.startProfile || "low";
        const r = new Room(roomOptionsFor(pol, phone));
        room = r;
        roomRef.current = r;
        wire(r);
        setRoom(r);
        if (!creds.url || !creds.token) { setStatus("error"); return; }
        // Connect exactly once. Pass the backend livekit_url verbatim — no
        // manual /rtc suffix or query params.
        if (!connectedRef.current) {
          await r.connect(creds.url, creds.token, { autoSubscribe: true });
          connectedRef.current = true;
        }
        if (!alive) { r.disconnect(); return; }
        // Publish local tracks exactly once, after Connected. Mic and camera are
        // enabled independently so a denied camera (or no webcam) still leaves a
        // working audio call instead of erroring out.
        if (!publishedRef.current) {
          publishedRef.current = true;
          // A call that was already paused when this side connected must not
          // publish: the pause effect only fires on a CHANGE of `paused`, and
          // the first getCall can easily land before the LiveKit connect.
          if (pausedRef.current) {
            try { await r.localParticipant.setMicrophoneEnabled(false); } catch { /* nothing published yet */ }
            try { await r.localParticipant.setCameraEnabled(false); } catch { /* nothing published yet */ }
            if (alive) { setMicOn(false); setCamOn(false); }
          } else {
            try { await r.localParticipant.setMicrophoneEnabled(true); } catch { /* mic denied */ }
            // video_enabled is the truth, not the callType prop: an express
            // request opens an audio session for a service whose name says
            // "video", and that session must not publish a camera.
            const low = pol?.profiles.low;
            if (pol ? pol.videoEnabled : callType === "video") {
              camWantedRef.current = true;
              // start_profile is "low": the camera opens at the bottom rung
              // and the connection-quality actions climb from there.
              try { await r.localParticipant.setCameraEnabled(true, low ? { facingMode: "user", resolution: resOf(low) } : undefined); } catch { if (alive) setCamOn(false); }
            } else if (alive) setCamOn(false);
          }
        }
        // Kick off audio playback; if the browser blocks it, show a prompt.
        try { await r.startAudio(); } catch { /* needs a user gesture */ }
        if (alive) setAudioBlocked(!r.canPlaybackAudio);
        try { sessionStorage.setItem("lexgo_active_call", JSON.stringify({ roomId, callId, callType })); } catch { /* ignore */ }
        // More than one camera (phones) → offer a front/back switch.
        try {
          const cams = await Room.getLocalDevices("videoinput");
          if (alive) setCanSwitchCam(cams.length > 1);
        } catch { /* no device access */ }
        if (alive) {
          setStartedAt(Date.now());
          bump();
          if (r.remoteParticipants.size) hadRemoteRef.current = true;
          setStatus(r.remoteParticipants.size ? "live" : "ringing");
          signal("call.join");
          announceRole();
          // Welcome chime once I'm in (the room may already have people).
          playJoinTone(true);
          firstJoinRef.current = false;
        }
      } catch {
        if (alive) setStatus("error");
      }
    })();

    return () => {
      alive = false;
      publishedRef.current = false;
      connectedRef.current = false;
      reconnectingRef.current = false;
      camWantedRef.current = false;
      autoCamOffRef.current = false;
      profileRef.current = "";
      room?.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, callId, callType]);

  // The tone context must be created/resumed inside a user gesture: the first
  // tap / key inside the room does it (accepting the call already did).
  useEffect(() => {
    const prime = () => primeCallAudio();
    window.addEventListener("pointerdown", prime, { once: true, capture: true });
    window.addEventListener("keydown", prime, { once: true, capture: true });
    return () => { window.removeEventListener("pointerdown", prime, { capture: true }); window.removeEventListener("keydown", prime, { capture: true }); };
  }, []);

  // Elapsed meeting time.
  useEffect(() => {
    if (startedAt == null) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);

  // Caller hears a ringback until the other side connects.
  useEffect(() => {
    if (!isCaller || status !== "ringing") return;
    return playRingback();
  }, [isCaller, status]);

  // Requester: count my recording request down; no answer in time → give up.
  useEffect(() => {
    if (!recReq) return;
    if (recReq.left <= 0) {
      const tm = setTimeout(() => { setRecReq(null); toast(t("recNoAnswer"), "leave"); }, 0);
      return () => clearTimeout(tm);
    }
    const tm = setTimeout(() => setRecReq((r) => (r ? { ...r, left: r.left - 1 } : r)), 1000);
    return () => clearTimeout(tm);
  }, [recReq, toast, t]);
  // Approver: a request nobody answered expires with the requester's timer.
  useEffect(() => {
    if (!recAsks.length) return;
    const iv = setInterval(() => setRecAsks((a) => a.filter((x) => Date.now() - x.at < (REC_ASK_SEC + 5) * 1000)), 1000);
    return () => clearInterval(iv);
  }, [recAsks.length]);

  // Recording consent (2026-09-19 backend): request/allow-deny/start are now
  // server state, broadcast to the whole room over the same call WebSocket as
  // the roster refresh below — not the LiveKit data channel, and the frontend
  // never polls for it. Field names on the event payload aren't nailed down
  // 1:1 by the doc, so every lookup tries a couple of plausible keys.
  useEffect(() => {
    const seen = new Map<string, number>();
    const fresh = (key: string) => {
      const now = Date.now();
      for (const [k, at] of seen) if (now - at > 10000) seen.delete(k);
      if (seen.has(key)) return false;
      seen.set(key, now);
      return true;
    };
    const onCallEvent = (e: { event: string } & Record<string, unknown>) => {
      const id = String(e.call_id ?? "");
      if (id && id !== callId) return;
      const d = e as Record<string, unknown>;
      const nameFor = (uid: string) => rosterRef.current.find((p) => p.userId === uid)?.name || t("someone");

      if (e.event === "call.recording_requested") {
        const uid = String(d.recording_requested_by_user_id ?? d.requested_by_user_id ?? d.user_id ?? "");
        if (!approverRef.current || !uid || uid === session?.id) return;
        if (!fresh(`req:${uid}`)) return;
        const mode: RecordingMode = d.mode === "screen" ? "screen" : "audio";
        setRecAsks((a) => [...a.filter((x) => x.id !== uid), { id: uid, name: String(d.name ?? "").trim() || nameFor(uid), mode, at: Date.now() }]);
        playJoinTone(false);
        toast(t("recAskToast", { name: nameFor(uid) }), "info");
        return;
      }
      if (e.event === "call.recording_permission_updated") {
        const allowed = d.allowed === true || d.recording_status === "allowed" || d.status === "allowed";
        const askedId = String(d.recording_requested_by_user_id ?? d.requested_by_user_id ?? "");
        if (askedId) setRecAsks((a) => a.filter((x) => x.id !== askedId));
        const req = recReqRef.current;
        if (!req) return; // not my own pending request (or already given up)
        setRecReq(null);
        const byUid = String(d.recording_allowed_by_user_id ?? d.user_id ?? "");
        if (allowed) { toast(t("recAllowedBy", { name: nameFor(byUid) }), "join"); startRecRef.current(req.mode); }
        else toast(t("recDeniedBy", { name: nameFor(byUid) }), "leave");
        return;
      }
      if (e.event === "call.recording_started") {
        // LiveKit participant identity == backend user_id (the token metadata
        // pattern this room already relies on elsewhere, e.g. roster lookups).
        const uid = String(d.recording_started_by_user_id ?? d.user_id ?? "");
        if (!uid || !fresh(`started:${uid}`)) return;
        setRecBy((cur) => (cur.has(uid) ? cur : new Set(cur).add(uid)));
        if (uid !== session?.id) toast(t("recStartedBy", { name: nameFor(uid) }), "leave");
        return;
      }
      // The meeting-extension contract puts these on the USER socket:
      // "User level eventlar uchun mavjud user WS ishlatilsin. Incoming call,
      // extension approve/reject eventlari shu realtime oqimlarda keladi."
      // They only ever reached here from the call socket, so an approval that
      // came in on the user stream left the room paused until the 15-second
      // meta poll happened to notice.
      // call.paused / call.resumed join these (backend 2026-09-28, and urgent
      // meetings pause too now): the clock freezing or restarting is exactly
      // the kind of thing that must not wait out the 15-second poll. The
      // timer itself already honours `paused` — this is only about learning
      // of it at once.
      if (/^call[.](extended|payment_extension_|paused|resumed)/.test(e.event)) setMetaTick((n) => n + 1);
    };
    const unsub = subscribeRoomCallEvents(roomId, onCallEvent);
    // Both streams, one handler, one dedupe. The room socket carries them for
    // a chat that is open; the user socket carries them regardless.
    const unsubUser = subscribeUserEvents((e) => {
      if (!e.event.startsWith("call.")) return;
      const room = String((e as Record<string, unknown>).room_id ?? "");
      if (room && room !== roomId) return;
      onCallEvent(e);
    });
    return () => { unsub(); unsubUser(); };
  }, [roomId, callId, session?.id, toast, t]);

  // Meeting meta: participants roster, host permissions, remaining time.
  // Polls every 3s and refreshes immediately when a realtime event bumps
  // metaTick.
  useEffect(() => {
    let alive = true;
    const load = () =>
      getCall(roomId, callId)
        .then((c) => {
          if (!alive) return;
          if (c.status && ["ended", "cancelled", "expired"].includes(c.status)) { onEndRef.current?.(); return; }
          // Somebody pressed the red button: the record says so, and the
          // caller has been staring at a ringing room with no idea.
          const said = new Set(declinedRef.current);
          for (const p of c.participants) {
            if (p.status !== "declined" || !p.userId || p.userId === session?.id || said.has(p.userId)) continue;
            declinedRef.current.add(p.userId);
            setDeclined((cur) => (cur.includes(p.userId) ? cur : [...cur, p.userId]));
            toast(t("declinedBy", { name: p.name || t("someone") }), "leave");
          }
          setRoster(c.participants);
          setPerms(c.permissions);
          setLimits(callLimitsOf(c));
          // The quality policy and the transport hints are fixed for the life
          // of a call ("once per call"), so they are taken the first time they
          // arrive and never replaced — a freshly normalised copy on every
          // poll would re-render the whole room for an identical object. The
          // connect path reads them too, because Room options are frozen at
          // construction; this is the path that covers a room whose connect
          // read failed.
          if (!qualityRef.current && c.quality) qualityRef.current = c.quality;
          if (!hintsRef.current && c.hints) hintsRef.current = c.hints;
          setQuality((cur) => cur ?? c.quality);
          // A paused call freezes at pausedRemainingSeconds; an extension
          // RAISES the remaining time, so a server value that moved in
          // either direction has to be taken, not only a bigger one.
          const left = c.paused && c.pausedRemainingSeconds > 0 ? c.pausedRemainingSeconds : c.remainingSeconds;
          if (left > 0 || c.maxDurationMinutes > 0) setRemaining(left);
        })
        .catch(() => {});
    load();
    // Roster/permissions refresh on room-socket call events; the slow poll is
    // only a fallback (the invitee of a meeting has no room socket).
    const unsub = subscribeRoomCallEvents(roomId, (e) => {
      const id = String(e.call_id ?? (e.call && typeof e.call === "object" ? (e.call as Record<string, unknown>).id : "") ?? "");
      if (id && id !== callId) return;
      if (e.event === "call.ended") { onEndRef.current?.(); return; }
      load();
    });
    const iv = setInterval(load, 15000);
    return () => { alive = false; clearInterval(iv); unsub(); };
    // t/toast/session are stable for the life of the room; listing them would
    // tear down and rebuild the poll on every locale-context render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, callId, metaTick]);
  // Deliberately keyed on the two booleans, not on `remaining` itself: a
  // dependency on the number would tear down and rebuild the interval every
  // single second. While paused the clock stops — the backend is not
  // counting that time against the meeting either.
  useEffect(() => {
    if (remaining == null || paused) return;
    const iv = setInterval(() => setRemaining((s) => (s != null && s > 0 ? s - 1 : s)), 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining == null, paused]);

  // A paused call is a call somebody is waiting on, and whoever paused it may
  // be on a screen with no room socket at all — the call-centre board mounts
  // no SecureChat, so the in-page bus that carries call.resumed is silent
  // there and only the 15-second poll would notice. Verified: a resume took
  // the full poll to appear on that board. Three seconds, and only while
  // paused.
  useEffect(() => {
    if (!paused) return;
    const iv = setInterval(() => setMetaTick((n) => n + 1), 3000);
    return () => clearInterval(iv);
  }, [paused]);

  // The pause itself expires after 5 minutes; when it does the call simply
  // resumes with whatever time was left, so re-read it rather than waiting
  // out the 15s poll.
  useEffect(() => {
    const until = limits?.pauseExpiresAt ? Date.parse(limits.pauseExpiresAt) : 0;
    if (!paused || !until) return;
    // Always through a timer, never straight from the effect body: an
    // already-expired pause still has to refetch, just on the next tick.
    const ms = Math.max(0, until - Date.now());
    const h = setTimeout(() => setMetaTick((n) => n + 1), Math.min(ms + 1000, 5 * 60_000));
    return () => clearTimeout(h);
  }, [paused, limits?.pauseExpiresAt]);

  // "paused=true bo'lsa LiveKit join/publishni vaqtincha bloklang" — done by
  // muting the published tracks, never by disconnecting: the backend treats
  // repeated connect/publish cycles as a negotiation loop (see the note at
  // the top of this file).
  const wasPaused = useRef(false);
  // What was published when the pause began, read off LiveKit itself so it
  // survives however the tracks got into that state. Resuming restores THIS,
  // never a blanket "mic on" — someone who muted themselves before the pause
  // must not be put back on air by a payment being approved.
  const prePause = useRef({ mic: false, cam: false });
  const hostMutedRef = useRef(hostMuted);
  useEffect(() => {
    hostMutedRef.current = hostMuted;
  }, [hostMuted]);
  useEffect(() => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    // The state follows the track, not the other way round — LiveKit's
    // promise resolving is what makes the button reflect reality, and it
    // keeps these out of the effect body.
    if (paused) {
      if (!wasPaused.current) prePause.current = { mic: lp.isMicrophoneEnabled, cam: lp.isCameraEnabled };
      wasPaused.current = true;
      void lp.setMicrophoneEnabled(false).then(() => setMicOn(false)).catch(() => {});
      void lp.setCameraEnabled(false).then(() => setCamOn(false)).catch(() => {});
    } else if (wasPaused.current) {
      wasPaused.current = false;
      const { mic, cam } = prePause.current;
      if (mic && !hostMutedRef.current) void lp.setMicrophoneEnabled(true).then(() => setMicOn(true)).catch(() => {});
      if (cam) void lp.setCameraEnabled(true).then(() => setCamOn(true)).catch(() => {});
    }
  }, [paused]);

  // Self-enforce host actions: the backend only records status/mic on the
  // participant, it doesn't evict/mute at the LiveKit layer — so each client
  // watches its own roster entry and acts on it.
  useEffect(() => {
    const me = roster.find((p) => p.userId === session?.id);
    if (!me) return;
    if ((me.status === "removed" || me.status === "left") && !leftRef.current) {
      leftRef.current = true;
      playEndTone();
      roomRef.current?.disconnect();
      finish();
      return;
    }
    if (prevMicRef.current !== null && me.micEnabled !== prevMicRef.current && me.micEnabled !== micOn) {
      roomRef.current?.localParticipant.setMicrophoneEnabled(me.micEnabled).catch(() => {});
      setMicOn(me.micEnabled);
      setHostMuted(!me.micEnabled);
    }
    prevMicRef.current = me.micEnabled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, session?.id]);

  // Realtime call signaling: refresh the roster on participant/media events and
  // close the room when the backend auto-ends the meeting.
  useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      if (!alive) return;
      clearTimeout(timer);
      timer = setTimeout(connect, backoffMs(attempt));
      attempt = Math.min(attempt + 1, 10);
    };
    function connect() {
      if (!alive) return;
      let sock: WebSocket;
      try {
        sock = new WebSocket(callSocketUrl(roomId, callId, getToken()));
      } catch {
        retry();
        return;
      }
      ws = sock;
      callWsRef.current = sock;
      sock.onopen = () => { attempt = 0; if (connectedRef.current) signal("call.join"); };
      sock.onmessage = (ev) => {
        if (!alive) return;
        let msg: { type?: string; event?: string; status_code?: number } = {};
        try { msg = JSON.parse(ev.data) as typeof msg; } catch { msg = {}; }
        const type = String(msg.type ?? msg.event ?? "");
        if (type === "error" && Number(msg.status_code) === 401) {
          sock.onclose = null;
          try { sock.close(); } catch { /* ignore */ }
          void refreshAccessToken().catch(() => null).then((fresh) => { if (alive && fresh) connect(); });
          return;
        }
        if (type.includes("auto_ended") || type === "call.end") { onEndRef.current?.(); return; }
        // Recording consent, extensions and the rest of the call.* family are
        // delivered on THIS socket. They used to stop here: the handlers below
        // subscribe to the in-page bus, and the only thing feeding that bus was
        // SecureChat's room socket — which is closed whenever the chat panel is
        // not mounted (the document editor shows chat and meeting in the same
        // slot). That is why a client's recording request never reached the
        // advocate. Forwarded now, deduped against SecureChat's copy.
        if (isCallEvent(type)) emitRoomCallEvent(roomId, { ...(msg as Record<string, unknown>), event: type, call_id: callId });
        if (/^(participant|media)\./.test(type) || /^call[.](join|leave|extended|payment_extension_)/.test(type)) {
          setMetaTick((n) => n + 1);
        }
      };
      sock.onclose = () => { if (alive && ws === sock) retry(); };
      sock.onerror = () => { try { sock.close(); } catch { /* onclose retries */ } };
    }
    connect();
    return () => {
      alive = false;
      clearTimeout(timer);
      callWsRef.current = null;
      if (ws) {
        ws.onclose = null;
        try { ws.close(); } catch { /* ignore */ }
      }
    };
  }, [roomId, callId]);

  // Chat panel: scroll to the newest message, clear the unread badge.
  useEffect(() => {
    if (panel === "chat") chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [panel, messages.length]);
  const openPanel = (p: "" | "chat" | "people") => { if (p === "chat") setUnread(0); setPanel(p); };

  async function enableSound() {
    const r = roomRef.current;
    if (!r) return;
    try { await r.startAudio(); } catch { /* ignore */ }
    setAudioBlocked(!r.canPlaybackAudio);
  }
  // Keep the backend roster in sync with my real mic/cam so others see it.
  function syncSelf(patch: { mic_enabled?: boolean; camera_enabled?: boolean; screen_enabled?: boolean }) {
    if (session?.id) { prevMicRef.current = patch.mic_enabled ?? prevMicRef.current; updateCallParticipant(roomId, callId, session.id, patch).catch(() => {}); }
  }
  async function toggleMic() {
    const r = roomRef.current;
    if (!r) return;
    if (hostMuted && !micOn) return;
    void enableSound();
    const on = !micOn;
    await r.localParticipant.setMicrophoneEnabled(on);
    setMicOn(on);
    bump();
    syncSelf({ mic_enabled: on });
  }
  // Capture size for any new or restarted camera track: whichever rung of the
  // backend's ladder the adaptive controller is on, and the old phone/desktop
  // defaults on a call that carries no policy.
  function camResolution(): VideoResolution {
    const pol = qualityRef.current;
    const prof = pol?.profiles[profileRef.current] ?? pol?.profiles.low;
    if (prof) return resOf(prof);
    return PORTRAIT_HINT() ? VideoPresets43.h540.resolution : VideoPresets.h720.resolution;
  }
  async function toggleCam() {
    const r = roomRef.current;
    if (!r || camBusy) return;
    void enableSound();
    const on = !camOn;
    // The user's own choice outranks the controller's: a camera switched on
    // by hand is never "one the controller put away", and one switched off by
    // hand is never brought back by an auto-upgrade.
    camWantedRef.current = on;
    autoCamOffRef.current = false;
    setCamBusy(true);
    try {
      // First enable in an audio call publishes the camera track (front camera, 4:3 on phones).
      await r.localParticipant.setCameraEnabled(on, on ? { facingMode: facingRef.current, resolution: camResolution() } : undefined);
      setCamOn(on);
      bump();
      syncSelf({ camera_enabled: on });
      if (on) {
        try { const cams = await Room.getLocalDevices("videoinput"); setCanSwitchCam(cams.length > 1); } catch { /* ignore */ }
      }
    } catch (e) {
      toast(`${t("camError")} ${e instanceof Error && e.name === "NotAllowedError" ? t("camDenied") : ""}`.trim(), "leave");
      setCamOn(false);
    } finally {
      setCamBusy(false);
    }
  }
  // Phones: front ↔ back. The track is restarted with facingMode so the
  // browser picks the default lens of that side (cycling every "videoinput"
  // walks through tele/ultra-wide lenses — that was the "zoomed" camera and
  // the 4–5 taps to get back to the front). Falls back to a device switch.
  async function switchCam() {
    const r = roomRef.current;
    if (!r || camBusy) return;
    setCamBusy(true);
    const next: "user" | "environment" = facingRef.current === "user" ? "environment" : "user";
    const isBack = (label: string) => /back|rear|environment|orqa|задн/i.test(label);
    try {
      const pub = r.localParticipant.getTrackPublication(Track.Source.Camera);
      const track = pub?.track as LocalVideoTrack | undefined;
      // Flipping the lens must not silently climb back off the rung the
      // adaptive controller put this call on.
      const res = camResolution();
      let done = false;
      if (track) {
        try {
          await track.restartTrack({ facingMode: next, resolution: res });
          done = true;
        } catch { /* exact facing not available → device fallback */ }
      }
      if (!done) {
        const cams = await Room.getLocalDevices("videoinput");
        const wanted = cams.filter((c) => (next === "environment") === isBack(c.label));
        const target = wanted[0] ?? cams.find((c) => c.deviceId !== r.getActiveDevice("videoinput"));
        if (!target) return;
        await r.switchActiveDevice("videoinput", target.deviceId, true);
      }
      facingRef.current = next;
      setMirror(next === "user");
      bump();
    } catch { /* ignore */ } finally {
      setCamBusy(false);
    }
  }
  async function toggleShare() {
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.localParticipant.setScreenShareEnabled(!sharing, { audio: false, contentHint: "detail", resolution: ScreenSharePresets.h1080fps15.resolution });
      setSharing(!sharing);
      syncSelf({ screen_enabled: !sharing });
      bump();
    } catch { /* cancelled or unsupported */ }
  }
  function sendChat() {
    const r = roomRef.current;
    const text = draft.trim();
    if (!r || !text) return;
    const at = Date.now();
    r.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ t: "chat", text, at })), { reliable: true }).catch(() => {});
    setMessages((m) => [...m, { id: `me-${at}`, from: r.localParticipant.identity, name: t("you"), text, at }]);
    setDraft("");
  }
  // Approver answers a client's recording request; broadcast so the other
  // approvers drop their card too.
  // The backend broadcasts the outcome to the whole room (call.recording_
  // permission_updated) — the requester's own toast/local-recording-start
  // happens there, not here.
  // ── Meeting extensions ─────────────────────────────────────────
  // Both are host-only on the backend; the buttons are gated on the same
  // permission the end-call button uses, so a participant never sees a
  // control that would 403.
  async function extendFree() {
    if (extBusy) return;
    setExtBusy(true);
    setExtErr("");
    try {
      const c = await freeExtendCall(roomId, callId, limits?.freeExtensionMaxMinutes || 3);
      setLimits(callLimitsOf(c));
      if (c.remainingSeconds > 0) setRemaining(c.remainingSeconds);
      toast(t("extendedFree"), "info");
    } catch (e) {
      // Through the toast, not setExtErr: that message only ever renders
      // inside the paid dialog, which this button never opens. And only a
      // real 409 ("faqat 1 marta ishlaydi") means the free extension is
      // spent — a network blip must not take the button away.
      const used = e instanceof ApiError && e.status === 409;
      toast(used ? t("extendFreeUsed") : t("extendError"), "leave");
      if (used) setLimits((l) => (l ? { ...l, freeExtensionAvailable: false, freeExtensionUsed: true } : l));
    } finally {
      setExtBusy(false);
    }
  }
  async function extendPaid() {
    if (extBusy || extMinutes < 1) return;
    setExtBusy(true);
    setExtErr("");
    try {
      const c = await requestCallExtensionPayment(roomId, callId, extMinutes);
      setLimits(callLimitsOf(c));
      setExtOpen(false);
    } catch {
      setExtErr(t("extendError"));
    } finally {
      setExtBusy(false);
    }
  }

  // ── Holding the meeting ────────────────────────────────────────
  // "advokat yoki yuristdagi meeting vaqtidagi pause qilish tugmasi" — the
  // host steps away without the client's minutes burning down. POST …/pause
  // freezes the clock (the effect further up also mutes what both sides are
  // publishing while `paused` is true) and POST …/resume hands back a fresh
  // auto_end_at, so the remaining time is re-read from the response exactly
  // the way the 15-second poll re-reads it.
  async function togglePause() {
    if (pauseBusy) return;
    // Read once: `paused` can flip under us while the request is in the air,
    // and the error message must still name the thing that was attempted.
    const resuming = paused;
    setPauseBusy(true);
    try {
      const c = resuming ? await resumeCall(roomId, callId) : await pauseCall(roomId, callId, { minutes: PAUSE_MINUTES });
      setLimits(callLimitsOf(c));
      const left = c.paused && c.pausedRemainingSeconds > 0 ? c.pausedRemainingSeconds : c.remainingSeconds;
      if (left > 0) setRemaining(left);
      toast(t(resuming ? "resumedToast" : "pausedToast"), "info");
    } catch (e) {
      // Not deployed on this backend: take the button away instead of leaving
      // it in the bar to 404 again on the next press.
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) { setPauseGone(true); return; }
      // Everything else goes through the room's own error affordance, the
      // same toast the free extension uses — there is no dialog to put an
      // inline message in, and .mtg__ext-err only renders inside one.
      toast(t(resuming ? "resumeError" : "pauseError"), "leave");
    } finally {
      setPauseBusy(false);
    }
  }

  async function answerRecAsk(id: string, ok: boolean) {
    setRecAsks((a) => a.filter((x) => x.id !== id));
    // Data channel first: it reaches the requester in one hop and does not
    // depend on the backend re-broadcasting the decision.
    roomRef.current?.localParticipant
      .publishData(enc({ t: "recans", to: id, allowed: ok, at: stamp() }), { reliable: true })
      .catch(() => {});
    try {
      await setCallRecordingPermission(roomId, callId, ok);
    } catch {
      // The decision already reached the room over the data channel; only the
      // server-side record of it failed, which is not the approver's problem.
    }
  }
  // No cancel endpoint in the 2026-09-19 contract — giving up locally is all
  // this side can do; the approver's card clears itself once it expires.
  function cancelRecReq() {
    setRecReq(null);
  }
  // Host controls (gated by backend permissions).
  async function muteParticipant(userId: string, mute: boolean) {
    try {
      await updateCallParticipant(roomId, callId, userId, { mic_enabled: !mute });
      setMetaTick((n) => n + 1);
    } catch { /* ignore */ }
  }
  async function kickParticipant(userId: string) {
    setRoster((rs) => rs.filter((p) => p.userId !== userId));
    try {
      await updateCallParticipant(roomId, callId, userId, { status: "removed" });
      setMetaTick((n) => n + 1);
    } catch { /* ignore */ }
  }
  async function sendInvites() {
    if (inviteBusy || !invitePicks.length) return;
    setInviteBusy(true);
    try {
      for (const uid of invitePicks) await inviteCallParticipant(roomId, callId, uid).catch(() => {});
      setInvitePicks([]);
      setMetaTick((n) => n + 1);
      toast(t("invited"), "info");
    } finally {
      setInviteBusy(false);
    }
  }
  // /users/search is staff-only; a client or advocate host searches the people
  // they can actually reach: lawyers and (for sellers) their own clients —
  // lib/inviteSearch, shared with MeetingLauncher. People already in the call
  // (backend roster) and I are left out.
  function inviteSearch(q: string) {
    if (!inviteSearchRef.current) {
      inviteSearchRef.current = makeInviteSearch({
        clientLabel: t("inviteClient"),
        regionLabel: (v) => regionLabel(te, v),
        exclude: () => [...rosterRef.current.map((p) => p.userId), ...(session?.id ? [session.id] : [])],
      });
    }
    return inviteSearchRef.current(q);
  }
  // Local recording of the whole conversation (never uploaded, unrelated to
  // the server call below). Everyone in the room is told through the data
  // channel for the live badge (recBy) — that part has no backend endpoint
  // in the 2026-09-19 doc, so it stays as it was.
  const startRecording = useCallback((mode: RecordingMode) => {
    const r = roomRef.current;
    if (!r || recorderRef.current) return;
    try {
      const rec = new MeetingRecorder(mode);
      rec.start(r, stageRef.current);
      setRecMode(mode);
      recorderRef.current = rec;
      setRecSec(0);
      setRecOn(true);
      setRecFile(null);
      playRecTone(true);
      r.localParticipant.publishData(enc({ t: "rec", on: true, at: Date.now() }), { reliable: true }).catch(() => {});
      // Registers who started it server-side (recording_status, the who-
      // started-it field, and the call.recording_started broadcast to the
      // rest of the room) — best-effort, local capture doesn't wait on it.
      startCallRecordingServer(roomId, callId).catch(() => {});
      toast(t("recStarted"), "join");
    } catch (e) {
      toast(`${t("recError")} ${e instanceof Error ? `(${e.message})` : ""}`.trim(), "leave");
    }
  }, [roomId, callId, toast, t]);
  useEffect(() => { startRecRef.current = startRecording; }, [startRecording]);
  // Approver present in the LiveKit room: announced itself, is the backend
  // host, or the token metadata says staff/seller (anything but "client").
  const hostId = roster.find((p) => p.role === "host")?.userId;
  const isApprover = (p: Participant) => announced.has(p.identity) || p.identity === hostId || (roleOf(p) !== "" && roleOf(p) !== "client");
  // Staff and sellers record right away (they are the approvers); a client
  // first asks the approvers in the room (POST recording-request) and
  // records only once call.recording_permission_updated says allowed.
  async function toggleRec(mode?: RecordingMode) {
    const r = roomRef.current;
    if (!r) return;
    if (!recOn) {
      if (recReq) return; // still waiting for an answer
      if (!mode) { setRecPick(true); return; }
      setRecPick(false);
      if (iApprove) { startRecording(mode); return; }
      if (!participants.some((p) => !p.isLocal && isApprover(p))) { toast(t("recNeedApprover"), "leave"); return; }
      const asked = await requestCallRecording(roomId, callId, mode).then(() => true).catch(() => false);
      const relayed = await r.localParticipant
        .publishData(enc({ t: "recask", mode, at: stamp() }), { reliable: true })
        .then(() => true)
        .catch(() => false);
      if (!asked && !relayed) { toast(t("recError"), "leave"); return; }
      setRecReq({ mode, left: REC_ASK_SEC });
      toast(t("recAsking"), "info");
      return;
    }
    const rec = recorderRef.current;
    recorderRef.current = null;
    setRecOn(false);
    playRecTone(false);
    r.localParticipant.publishData(enc({ t: "rec", on: false, at: stamp() }), { reliable: true }).catch(() => {});
    const file = rec ? await rec.stop() : null;
    if (file) {
      setRecFile(file);
      try { setRecUrl(URL.createObjectURL(file.blob)); } catch { setRecUrl(""); }
    } else toast(t("recError"), "leave");
  }
  async function saveRec() {
    if (!recFile) return;
    try {
      const how = await saveRecording(recFile, title || t("meetingTitle"));
      toast(how === "opened" ? t("recOpened") : t("recSaved"), "join");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // share sheet closed
      toast(`${t("recSaveError")} ${e instanceof Error ? `(${e.message})` : ""}`.trim(), "leave");
    }
  }
  async function hangUp() {
    playEndTone();
    // Tell the others first over the call socket (relayed instantly), then the API.
    signal(isCaller ? "call.end" : "call.leave");
    try {
      if (isCaller) await endMeeting(roomId, callId).catch(() => endCall(callId));
      else await leaveCall(roomId, callId);
    } catch { /* ignore */ }
    roomRef.current?.disconnect();
    finish();
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const participants: Participant[] = room ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
  const count = participants.length;
  // Screen share on the stage wins over a pinned participant.
  const sharer = participants.find((p) => p.isScreenShareEnabled);
  const stageP = sharer ?? (view === "speaker" ? participants.find((p) => p.identity === pinned) ?? participants.find((p) => !p.isLocal) ?? participants[0] : null);
  const stageIsShare = !!sharer;
  const strip = stageP ? participants.filter((p) => p !== stageP || stageIsShare) : participants;
  const statusLabel = emptyLeft != null ? t("endingIn", { s: emptyLeft }) : status === "live" ? t("live") : status === "ringing" ? t("ringing") : status === "error" ? t("error") : t("connecting");
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices && !MOBILE();
  // Whether this call may carry a picture at all. The policy decides, because
  // an express request opens an audio session for a service named "video" and
  // the callType prop then lies. Until a policy arrives — and on a backend
  // that sends none — the camera stays on offer, as it always was.
  const videoAllowed = quality ? quality.videoEnabled : true;
  const activeRoster = roster.filter((p) => p.status !== "removed" && p.status !== "left" && p.status !== "declined");
  const gridN = strip.length;
  const flipKey = `${strip.map((p) => p.identity).join("|")}:${view}:${stageIsShare ? 1 : 0}:${panel}`;
  const gridRef = useFlip<HTMLDivElement>(flipKey);
  const stripRef = useFlip<HTMLDivElement>(flipKey);
  // ── Meeting confidentiality ────────────────────────────────────
  // The watermark names the person in front of THIS screen — not the speaker —
  // so a leaked frame points at whoever leaked it. The phone is masked to its
  // last four digits: enough to identify the account internally, not enough to
  // be a contact detail someone can harvest off a screenshot.
  const wmLabel = [
    session?.name || t("you"),
    session?.phone ? "••" + session.phone.replace(/\D/g, "").slice(-4) : session?.id?.slice(0, 8) || "",
    callId.slice(0, 8),
  ].filter(Boolean).join(" · ");
  const announceGuard = useCallback((why: GuardTrip) => {
    // Only the deliberate signals are reported. Tab switches and window blurs
    // still blank the picture on this side, but telling the room about every
    // alt-tab would turn a security notice into noise nobody reads.
    if (why !== "key" && why !== "capture") return;
    roomRef.current?.localParticipant
      .publishData(enc({ t: "guard", why, at: Date.now() }), { reliable: true })
      .catch(() => {});
  }, []);
  // Armed for the whole time the room can show a picture — "ringing" is the
  // one-participant state, which still renders the local camera.
  const guard = useCaptureGuard(status !== "ended" && status !== "error", announceGuard);
  // A recorder grabbing system audio must get silence for as long as the
  // picture is black, or the shield would only be half a shield.
  useEffect(() => {
    const c = audioRef.current;
    if (!c) return;
    const els = Array.from(c.querySelectorAll("audio"));
    for (const el of els) el.muted = guard.shielded;
    return () => { for (const el of els) el.muted = false; };
  }, [guard.shielded, count]);

  // Everyone recording right now, by name (others from the data channel, me from recOn).
  const recByNames = [...recBy].map((id) => { const p = participants.find((x) => x.identity === id); return p ? nameOf(p) : t("someone"); });
  const recLabel = recOn
    ? `${t("recording", { time: mmss(recSec) })}${recByNames.length ? ` · ${recByNames.join(", ")}` : ""}`
    : t("recordingBy", { name: recByNames.join(", ") || t("someone") });
  const isRecording = (p: Participant) => (p.isLocal ? recOn : recBy.has(p.identity));
  // Only the host of a time-limited meeting can extend it.
  const canExtend = !!perms?.canEnd && !!limits && limits.maxDurationMinutes > 0;
  // Who may hold the meeting. Pause/resume are host actions on the backend —
  // the same family as the extensions — so the gate is the backend's own host
  // flag, exactly what canExtend uses, and NOT `iApprove`: that predicate
  // answers "may approve a recording" and is true for any advocate, lawyer or
  // call-centre user in the room, including one who merely joined somebody
  // else's meeting and has no business stopping its clock. perms.canEnd is
  // also what keeps this off a client's bar, since the backend never gives a
  // client the end-call permission; the role check is belt-and-braces for a
  // backend that ever hands one out by accident.
  // Deliberately NOT gated on maxDurationMinutes the way canExtend is: the
  // backend extended pause to urgent meetings too (2026-09-28), and a hold is
  // useful there for the mute it causes even when there is no clock to freeze.
  const canPause = !pauseGone && !!perms?.canEnd && iApprove && !!limits;
  // A call paused by a pending extension payment is not this host's hold to
  // lift — resuming would answer the client's Telegram prompt on their behalf,
  // and the pause card already explains that wait. So the control stands down
  // for exactly that case rather than offering a resume it should not offer.
  const showPause = canPause && !(paused && !!limits?.pendingExtensionRequest);

  return (
    <div
      className={`mtg${panel ? " mtg--panel" : ""}${floating ? " mtg--float" : ""}${floating && fmin ? " mtg--fmin" : ""}`}
      data-tick={tick}
      style={floating ? { right: fbox.right, bottom: fbox.bottom, width: fbox.w, height: fmin ? undefined : fbox.h } : undefined}
    >
      <div ref={audioRef} hidden />
      {floating ? (
        <span
          className="mtg__grip"
          role="separator"
          aria-label={t("resize")}
          onPointerDown={sizeFloat}
          onPointerMove={moveFloat}
          onPointerUp={endFloat}
          onPointerCancel={endFloat}
        />
      ) : null}
      <header
        className="mtg__top"
        onPointerDown={floating ? dragFloat : undefined}
        onPointerMove={floating ? moveFloat : undefined}
        onPointerUp={floating ? endFloat : undefined}
        onPointerCancel={floating ? endFloat : undefined}
      >
        <div className="mtg__title">
          <b>{title || t("meetingTitle")}</b>
          <span className={`mtg__badge mtg__badge--${status}`}><i />{statusLabel}</span>
          {recOn || recBy.size ? (
            <span className="mtg__badge mtg__badge--rec" title={[recOn ? t("you") : "", ...recByNames].filter(Boolean).join(", ")}><i />{recLabel}</span>
          ) : null}
        </div>
        <div className="mtg__timer">
          <span className="mtg__rec"><i />{mmss(elapsed)}</span>
          {remaining != null ? (
            <span className={`mtg__left${paused ? " mtg__left--paused" : remaining <= 120 ? " mtg__left--low" : ""}`}>
              {paused ? t("paused") : `${t("remaining")}: ${mmss(remaining)}`}
            </span>
          ) : null}
        </div>
        <div className="mtg__tools">
          <button type="button" className={`mtg__tool${view === "grid" ? " on" : ""}`} onClick={() => setView("grid")} aria-label={t("layoutGrid")} title={t("layoutGrid")}><IconGrid /></button>
          <button type="button" className={`mtg__tool${view === "speaker" ? " on" : ""}`} onClick={() => setView("speaker")} aria-label={t("layoutSpeaker")} title={t("layoutSpeaker")}><IconUser /></button>
          <button type="button" className={`mtg__tool${panel === "people" ? " on" : ""}`} onClick={() => openPanel(panel === "people" ? "" : "people")} aria-label={t("rosterTitle")} title={t("rosterTitle")}>
            <IconUsers /><span className="mtg__n">{count}</span>
          </button>
          {/* Shrink the call into the corner and keep working. The panel's own
              bar carries the way back up. */}
          {canFloat ? (
            <button type="button" className="mtg__tool" onClick={() => { fitFloat(); setFloating(true); setPanel(""); }} aria-label={t("minimize")} title={t("minimize")}>
              <IconMinus />
            </button>
          ) : null}
        </div>
        {floating ? (
          <div className="mtg__ftools">
            {/* Participants count stays visible even minimised — MD lists it
                among the floating panel's own controls. */}
            <span className="mtg__fn" title={t("rosterTitle")}><IconUsers />{count}</span>
            <button type="button" className="mtg__tool" onClick={() => setFmin((m) => !m)} aria-label={fmin ? t("expand") : t("collapse")} title={fmin ? t("expand") : t("collapse")}>
              {fmin ? <IconPlus /> : <IconMinus />}
            </button>
            <button type="button" className="mtg__tool" onClick={() => { setFloating(false); setFmin(false); }} aria-label={t("fullScreen")} title={t("fullScreen")}>
              <IconMonitor />
            </button>
          </div>
        ) : null}
      </header>

      <div className="mtg__toasts" aria-live="polite">
        {toasts.map((x) => <div key={x.id} className={`mtg__toast mtg__toast--${x.kind}`}>{x.text}</div>)}
      </div>
      {audioBlocked ? (
        <button type="button" className="mtg__sound" onClick={enableSound}>{t("enableSound")}</button>
      ) : null}

      <div className="mtg__body">
        <main
          className={`mtg__stage${guard.shielded ? " mtg__stage--guard" : ""}`}
          ref={stageRef}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        >
          {stageP ? (
            <div className="mtg__speaker">
              <Tile key={`stage-${stageP.identity}-${stageIsShare ? "s" : "c"}`} p={stageP} name={nameOf(stageP)} you={t("you")} camOff={t("camOff")} share={stageIsShare} mirror={stageP.isLocal && !stageIsShare && mirror} rec={!stageIsShare && isRecording(stageP)} big />
              {stageIsShare ? <span className="mtg__sharing"><IconMonitor />{stageP.isLocal ? t("youShare") : t("sharing", { name: nameOf(stageP) })}</span> : null}
              <div className="mtg__strip" ref={stripRef}>
                {strip.map((p) => (
                  <Tile key={p.identity} p={p} name={nameOf(p)} you={t("you")} camOff={t("camOff")} mirror={p.isLocal && mirror} rec={isRecording(p)} recLabel={t("a11yRecording")} small onClick={() => { setPinned(p.identity); setView("speaker"); }} />
                ))}
              </div>
            </div>
          ) : (
            <div className={`mtg__grid mtg__grid--${Math.min(gridN, 9)}`} ref={gridRef}>
              {strip.map((p) => (
                <Tile key={p.identity} p={p} name={nameOf(p)} you={t("you")} camOff={t("camOff")} mirror={p.isLocal && mirror} rec={isRecording(p)} recLabel={t("a11yRecording")} pip={gridN === 2 && p.isLocal && MOBILE()} onClick={() => { setPinned(p.identity); setView("speaker"); }} />
              ))}
              {count <= 1 ? (
                <div className="mtg__waiting">
                  <span className="mtg__ripple" />
                  <p>{status === "error" ? t("error") : status === "connecting" ? t("connecting") : t("waitingOthers")}</p>
                </div>
              ) : null}
            </div>
          )}
          {declined.length && count <= 1 ? (
            <div className="mtg__declined" role="status">
              <b><IconPhone />{t("noAnswerTitle")}</b>
              <span>{t("noAnswerLead", { name: roster.find((p) => p.userId === declined[0])?.name || t("someone") })}</span>
            </div>
          ) : null}
          <MeetingWatermark label={wmLabel} compact={floating} />
          <CaptureShield
            reason={guard.reason}
            title={guard.captured ? t("guardCaptureTitle") : t("guardTitle")}
            lead={guard.captured ? t("guardCaptureLead") : t("guardLead")}
            note={t("guardNote")}
          />
          {recFile ? (
            <div className="mtg__recdone" role="status">
              <div>
                <b>{t("recReady")} · {t(recFile.mode === "screen" ? "recModeScreen" : "recModeAudio")}</b>
                <span>{mmss(Math.round(recFile.durationMs / 1000))} · {(recFile.blob.size / 1024 / 1024).toFixed(1)} MB · .{recFile.ext}</span>
              </div>
              <button type="button" className="btn btn--pri btn--sm" onClick={saveRec}><IconDownload />{t("recSave")}</button>
              {recUrl ? <a className="btn btn--line btn--sm" href={recUrl} target="_blank" rel="noopener noreferrer" download>{t("recOpen")}</a> : null}
              <button type="button" className="mtg__sx" onClick={() => { setRecFile(null); if (recUrl) { URL.revokeObjectURL(recUrl); setRecUrl(""); } }} aria-label={t("close")}><IconClose /></button>
            </div>
          ) : null}
          {recPick ? (
            <div className="mtg__recpick" role="dialog" aria-label={t("recStart")}>
              <b>{t("recPickTitle")}</b>
              <span>{t("recPickLead")}</span>
              <div className="mtg__recpick-btns">
                <button type="button" className="btn btn--pri btn--sm" onClick={() => void toggleRec("audio")}><IconMic />{t("recModeAudio")}</button>
                {canRecordScreen() ? <button type="button" className="btn btn--soft btn--sm" onClick={() => void toggleRec("screen")}><IconMonitor />{t("recModeScreen")}</button> : null}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRecPick(false)}>{t("close")}</button>
              </div>
            </div>
          ) : null}
          {/* Requester: waiting for an approver's answer. */}
          {recReq ? (
            <div className="mtg__recask" role="status">
              <b><i />{t("recWaiting", { s: recReq.left })}</b>
              <span>{t("recWaitingLead", { mode: t(recReq.mode === "screen" ? "recModeScreen" : "recModeAudio") })}</span>
              <div className="mtg__recask-btns">
                <button type="button" className="btn btn--ghost btn--sm" onClick={cancelRecReq}>{t("cancel")}</button>
              </div>
            </div>
          ) : null}
          {/* Approver: a client asks to record — allow or deny. */}
          {recAsks.length ? (
            <div className="mtg__recask" role="dialog" aria-label={t("recAskTitle", { name: recAsks[0].name })}>
              <b><i />{t("recAskTitle", { name: recAsks[0].name })}</b>
              <span>{t("recAskLead", { mode: t(recAsks[0].mode === "screen" ? "recModeScreen" : "recModeAudio") })}{recAsks.length > 1 ? ` · +${recAsks.length - 1}` : ""}</span>
              <div className="mtg__recask-btns">
                <button type="button" className="btn btn--pri btn--sm" onClick={() => void answerRecAsk(recAsks[0].id, true)}><IconRecord />{t("recAllow")}</button>
                <button type="button" className="btn btn--line btn--sm" onClick={() => void answerRecAsk(recAsks[0].id, false)}><IconClose />{t("recDeny")}</button>
              </div>
            </div>
          ) : null}
          {/* "To'lov javobi kutilmoqda" — the call is frozen, not ended, and
              it resumes by itself if nobody answers within five minutes. */}
          {paused ? (
            <div className={`mtg__pause${floating ? " mtg__pause--over" : ""}`} role="status">
              <b><IconClock />{t("pausedTitle")}</b>
              <span>
                {limits?.pendingExtensionRequest
                  ? t("pausedLead", { minutes: limits.pendingExtensionRequest.minutes, amount: fmtUzs(limits.pendingExtensionRequest.amount) })
                  : t("pausedLeadPlain")}
              </span>
              <small>{t("pausedExpiry")}</small>
            </div>
          ) : null}
          {/* Host only: buy more minutes for this meeting. Never while
              paused — the pause IS an extension request awaiting an answer,
              and the two cards would otherwise sit on top of each other. */}
          {extOpen && !paused ? (
            <div className={`mtg__ext${floating ? " mtg__ext--over" : ""}`} role="dialog" aria-label={t("extendPaid")}>
              <b>{t("extendPaid")}</b>
              <span>{t("extendPrice", { price: fmtUzs(limits?.paidExtensionPricePerMinute || 2000) })}</span>
              <div className="mtg__ext-mins">
                {[5, 10, 15, 30].map((m) => (
                  <button key={m} type="button" className={extMinutes === m ? "on" : ""} onClick={() => setExtMinutes(m)}>
                    {t("minutesN", { n: m })}
                  </button>
                ))}
              </div>
              <b className="mtg__ext-total">{t("extendTotal", { amount: fmtUzs(extMinutes * (limits?.paidExtensionPricePerMinute || 2000)) })}</b>
              {extErr ? <span className="mtg__ext-err" role="alert">{extErr}</span> : null}
              <div className="mtg__recask-btns">
                <button type="button" className="btn btn--pri btn--sm" onClick={() => void extendPaid()} disabled={extBusy}>
                  {extBusy ? t("extendSending") : t("extendAsk")}
                </button>
                <button type="button" className="btn btn--line btn--sm" onClick={() => setExtOpen(false)} disabled={extBusy}>
                  <IconClose />{t("close")}
                </button>
              </div>
            </div>
          ) : null}
        </main>

        {panel ? (
          <aside className="mtg__side">
            <div className="mtg__tabs">
              <button type="button" className={panel === "chat" ? "on" : ""} onClick={() => openPanel("chat")}>{t("chatTab")}</button>
              <button type="button" className={panel === "people" ? "on" : ""} onClick={() => openPanel("people")}>{t("rosterTitle")} · {count}</button>
              <button type="button" className="mtg__sx" onClick={() => setPanel("")} aria-label={t("close")}><IconClose /></button>
            </div>
            {panel === "chat" ? (
              <>
                <div className="mtg__chat">
                  {messages.length === 0 ? <p className="mtg__empty">{t("noMessages")}</p> : null}
                  {messages.map((m) => (
                    m.system ? (
                      <div key={m.id} className="mtg__sysmsg">{m.text}</div>
                    ) : (
                      <div key={m.id} className={`mtg__msg${m.from === room?.localParticipant.identity ? " mine" : ""}`}>
                        <span className="mtg__mav">{initials(m.name || "?")}</span>
                        <div className="mtg__mb">
                          <span className="mtg__mn">{m.name} <em>{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</em></span>
                          <p>{m.text}</p>
                        </div>
                      </div>
                    )
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form className="mtg__compose" onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("chatPh")} aria-label={t("chatPh")} />
                  <button type="submit" disabled={!draft.trim()} aria-label={t("send")}><IconSend /></button>
                </form>
              </>
            ) : (
              <div className="mtg__people">
                {perms?.canInvite ? (
                  <div className="mtg__invite">
                    <SearchSelect
                      value={invitePicks}
                      onChange={setInvitePicks}
                      onSearch={inviteSearch}
                      placeholder={t("invitePick")}
                      searchPlaceholder={t("invitePick")}
                      emptyText={t("inviteEmpty")}
                      ariaLabel={t("invite")}
                    />
                    <button type="button" className="btn btn--pri btn--sm" onClick={sendInvites} disabled={inviteBusy || !invitePicks.length}>
                      <IconUserPlus />{inviteBusy ? t("inviteSending") : t("inviteSend")}
                    </button>
                  </div>
                ) : null}
                {activeRoster.map((p) => {
                  const self = p.userId === session?.id;
                  const live = participants.find((x) => x.identity === p.userId);
                  const canHostAct = !self && p.role !== "host";
                  const recording = self ? recOn : recBy.has(p.userId);
                  return (
                    <div className={`mtg__prow${live?.isSpeaking ? " speaking" : ""}`} key={p.userId}>
                      <span className="mtg__pav">{initials(p.name || "?")}</span>
                      <div className="mtg__pm">
                        <b>{p.name || "—"}{self ? ` (${t("you")})` : ""}</b>
                        <span>{p.role === "host" ? t("hostLabel") : live ? t("live") : t.has(`pstatus.${p.status}`) ? t(`pstatus.${p.status}`) : p.status}</span>
                      </div>
                      {recording ? <span className="mtg__precchip"><i />{t("recChip")}</span> : null}
                      <span className={`mtg__pmic${(live ? live.isMicrophoneEnabled : p.micEnabled) ? "" : " off"}`}>{(live ? live.isMicrophoneEnabled : p.micEnabled) ? <IconMic /> : <IconMicOff />}</span>
                      {canHostAct && perms?.canMute ? (
                        <button type="button" className="mtg__pact" onClick={() => muteParticipant(p.userId, p.micEnabled)}>{p.micEnabled ? t("mute") : t("unmute")}</button>
                      ) : null}
                      {canHostAct && perms?.canKick ? (
                        <button type="button" className="mtg__pact mtg__pact--danger" onClick={() => kickParticipant(p.userId)}>{t("removeParticipant")}</button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {/* Phone "more" sheet: the secondary controls that don't fit a thumb-sized bar. */}
      {more ? (
        <div className="mtg__more" onClick={() => setMore(false)}>
          <div className="mtg__moresheet" onClick={(e) => e.stopPropagation()}>
            <span className="mtg__grip" />
            <button type="button" onClick={() => { setMore(false); openPanel("chat"); }}><IconChat />{t("chatTab")}{unread ? <i className="mtg__cb">{unread > 9 ? "9+" : unread}</i> : null}</button>
            <button type="button" onClick={() => { setMore(false); openPanel("people"); }}><IconUsers />{t("rosterTitle")} · {count}</button>
            {canExtend ? (
              <button type="button" onClick={() => { setMore(false); setExtErr(""); setExtOpen(true); }} disabled={paused}><IconClock />{t("extendPaidShort")}</button>
            ) : null}
            {canRecord() ? <button type="button" onClick={() => { setMore(false); void toggleRec(); }}><IconRecord />{recOn ? t("recStop", { mode: t(recMode === "screen" ? "recModeScreen" : "recModeAudio") }) : recReq ? t("recWaitingShort") : t("recStart")}</button> : null}
            <button type="button" onClick={() => { setMore(false); setView(view === "grid" ? "speaker" : "grid"); }}>{view === "grid" ? <IconUser /> : <IconGrid />}{view === "grid" ? t("layoutSpeaker") : t("layoutGrid")}</button>
          </div>
        </div>
      ) : null}

      <footer className="mtg__bar">
        {/* Mic: both glyphs stay mounted and CSS reveals exactly one, so the
            glyph that appears replays its pop keyframe (a box re-entering the
            layout restarts its animation). Still a plain button with
            a plain button whose NAME carries the state ("Mute microphone" /
            "Unmute microphone") — not aria-pressed as well, which together
            announced "Mute microphone, pressed" while the mic was live, i.e.
            the opposite of what was true. The host's force-mute still
            disables it and the label/title keep working. */}
        <Ctl mic on={micOn} off={!micOn} label={t("mic")} aria={micOn ? t("micMute") : t("micUnmute")} onClick={toggleMic} disabled={hostMuted && !micOn} title={hostMuted && !micOn ? t("mutedByHost") : micOn ? t("micMute") : t("micUnmute")}>
          <span className={`mtg__mic${micOn ? "" : " mtg__mic--off"}`} aria-hidden="true"><IconMic className="mtg__micOn" /><IconMicOff className="mtg__micOff" /></span>
        </Ctl>
        {/* Camera is offered on any call the policy allows video on — such a
            call becomes a video call once it is turned on. A session with
            video_enabled=false has no camera control at all, since turning it
            on would publish a track the backend never provisioned for. */}
        {videoAllowed ? <Ctl on={camOn} off={!camOn} label={camOn ? t("camOff2") : t("camOn")} onClick={toggleCam} disabled={camBusy}><IconVideo /></Ctl> : null}
        {videoAllowed && camOn && canSwitchCam ? <Ctl label={t("switchCam")} onClick={switchCam} disabled={camBusy}><IconRefresh /></Ctl> : null}
        {canShare ? <Ctl on={sharing} label={sharing ? t("screenStop") : t("screen")} onClick={toggleShare} accent={sharing} desktop><IconMonitor /></Ctl> : null}
        {canRecord() ? <Ctl on={recOn || !!recReq} label={recOn ? t("recStopShort") : recReq ? t("recWaitingShort") : t("recStart")} onClick={() => void toggleRec()} rec={recOn} disabled={!!recReq} desktop><IconRecord /></Ctl> : null}
        <Ctl on={panel === "people"} label={t("rosterTitle")} onClick={() => openPanel(panel === "people" ? "" : "people")} desktop><IconUsers /></Ctl>
        <Ctl on={panel === "chat"} label={t("chatTab")} onClick={() => openPanel(panel === "chat" ? "" : "chat")} badge={unread} desktop><IconChat /></Ctl>
        {/* Extensions are host-only server-side, and only offered at all on
            a call that actually has a time limit — a staff meeting with no
            max duration gets neither button. */}
        {canExtend && limits?.freeExtensionAvailable && !limits.freeExtensionUsed ? (
          <Ctl
            label={t("extendFree", { n: limits.freeExtensionMaxMinutes || 3 })}
            title={t("extendFreeNote", { n: limits.freeExtensionMaxMinutes || 3, price: fmtUzs(limits.paidExtensionPricePerMinute || 2000) })}
            aria={`${t("extendFree", { n: limits.freeExtensionMaxMinutes || 3 })} — ${t("extendFreeNote", { n: limits.freeExtensionMaxMinutes || 3, price: fmtUzs(limits.paidExtensionPricePerMinute || 2000) })}`}
            onClick={() => void extendFree()}
            disabled={extBusy || paused}
          ><IconPlus /></Ctl>
        ) : null}
        {/* NOT desktop-only while floating: .mtg--float hides .mtg__ctl--desktop,
            and the floating panel is exactly where the document meeting runs. */}
        {canExtend ? <Ctl on={extOpen} label={t("extendPaidShort")} onClick={() => { setExtErr(""); setExtOpen((v) => !v); }} disabled={extBusy || paused} desktop={!floating}><IconClock /></Ctl> : null}
        {/* Hold the meeting. It sits with the extension controls because they
            are the same family — everything here manipulates the clock — and
            it is offered at EVERY width, including the phone bar and the
            floating panel: stepping away is exactly what someone working in
            the minimised panel needs, so it is not marked desktop-only. */}
        {showPause ? (
          <PauseCtl
            paused={paused}
            busy={pauseBusy}
            label={pauseBusy ? t("pauseWorking") : paused ? t("resumeAction") : t("pauseAction")}
            action={paused ? t("resumeAction") : t("pauseAction")}
            title={paused ? t("resumeHint") : t("pauseHint", { n: PAUSE_MINUTES })}
            onClick={() => void togglePause()}
          />
        ) : null}
        <Ctl label={t("more")} onClick={() => setMore((m) => !m)} badge={unread} phone><IconGrid /></Ctl>
        <Ctl end label={isCaller ? t("endAll") : t("end")} onClick={hangUp}><IconClose /></Ctl>
      </footer>
    </div>
  );
}

function Ctl({ children, label, aria, onClick, on, off, end, accent, rec, mic, pressed, disabled, title, badge, desktop, phone }: { children: ReactNode; label: string; aria?: string; onClick: () => void; on?: boolean; off?: boolean; end?: boolean; accent?: boolean; rec?: boolean; mic?: boolean; pressed?: boolean; disabled?: boolean; title?: string; badge?: number; desktop?: boolean; phone?: boolean }) {
  return (
    <button type="button" className={`mtg__ctl${on ? " on" : ""}${off ? " off" : ""}${end ? " end" : ""}${accent ? " accent" : ""}${rec ? " rec" : ""}${mic ? " mtg__ctl--mic" : ""}${desktop ? " mtg__ctl--desktop" : ""}${phone ? " mtg__ctl--phone" : ""}`} onClick={onClick} disabled={disabled} title={title} aria-label={aria || label} aria-pressed={pressed}>
      <span className="mtg__ci">{children}{badge ? <i className="mtg__cb">{badge > 9 ? "9+" : badge}</i> : null}</span>
      <span className="mtg__cl">{label}</span>
    </button>
  );
}

// The hold control. Its own element rather than a `Ctl` variant, because it
// needs two children `Ctl` has no slot for — the sweeping ring, which has to
// sit inside .mtg__ci to be positioned against it, and a glyph drawn in CSS so
// the bars and the triangle are one shape morphing rather than two icons being
// swapped. It wears `Ctl`'s exact class shape (.mtg__ctl > .mtg__ci + .mtg__cl)
// so it inherits every size, hover, disabled and breakpoint rule the bar
// already has, and so it needs no layout of its own at any width.
// Stateless by design: `paused` is the room's, never a copy kept here.
// Like the mic control it carries its state in its NAME ("Pause" / "Resume")
// and deliberately not in aria-pressed as well, which together would announce
// "Resume, pressed" on a meeting that is merely held.
function PauseCtl({ paused, busy, label, action, title, onClick }: { paused: boolean; busy: boolean; label: string; action: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`mtg__ctl mtg__ctl--pause${paused ? " is-paused" : ""}${busy ? " is-busy" : ""}`}
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={action}
      aria-busy={busy}
    >
      <span className="mtg__ci">
        <span className="mtg__pring" aria-hidden="true" />
        <span className="mtg__pgl" aria-hidden="true">
          <i className="mtg__pgl-tri" />
          <i className="mtg__pgl-b mtg__pgl-b--l" />
          <i className="mtg__pgl-b mtg__pgl-b--r" />
        </span>
      </span>
      <span className="mtg__cl">{label}</span>
    </button>
  );
}

// One participant: camera (or screen share) video, or initials when the
// camera is off; name chip with mic state; green ring while speaking. The
// tile learns the stream's orientation from the video element so a phone's
// portrait camera isn't squeezed into a landscape box.
function Tile({ p, name, you, camOff, share, mirror, rec, recLabel, big, small, pip, onClick }: { p: Participant; name: string; you: string; camOff: string; share?: boolean; mirror?: boolean; rec?: boolean; recLabel?: string; big?: boolean; small?: boolean; pip?: boolean; onClick?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [portrait, setPortrait] = useState(false);
  const source = share ? Track.Source.ScreenShare : Track.Source.Camera;
  const pub: TrackPublication | undefined = p.getTrackPublication(source);
  const track = pub && !pub.isMuted ? (p.isLocal ? (p as LocalParticipant).getTrackPublication(source)?.track : pub.track) : undefined;
  const hasVideo = !!track;
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    const onMeta = () => setPortrait(el.videoHeight > el.videoWidth);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("resize", onMeta);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("resize", onMeta);
      track.detach(el);
    };
  }, [track]);
  const cls = ["mtg__tile", p.isSpeaking ? "speaking" : "", big ? "mtg__tile--big" : "", small ? "mtg__tile--small" : "", pip ? "mtg__tile--pip" : "", share ? "mtg__tile--share" : "", portrait ? "portrait" : "", hasVideo ? "" : "novideo"].filter(Boolean).join(" ");
  return (
    <div className={cls} onClick={onClick} role={onClick ? "button" : undefined} data-flip={`${p.identity}${share ? ":s" : ""}`}>
      {hasVideo ? (
        <video ref={ref} autoPlay playsInline muted={p.isLocal} style={mirror ? { transform: "scaleX(-1)" } : undefined} />
      ) : (
        <div className="mtg__avatar"><span>{initials(name || "?")}</span>{!share ? <small>{camOff}</small> : null}</div>
      )}
      {rec ? <span className="mtg__recpill" aria-label={recLabel}><i />REC</span> : null}
      <span className="mtg__name">
        {p.isMicrophoneEnabled ? null : <IconMicOff />}
        {name}{p.isLocal ? ` (${you})` : ""}
      </span>
    </div>
  );
}
