"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
  type LocalTrackPublication,
  type LocalVideoTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RoomOptions,
  type TrackPublication,
  type VideoCaptureOptions,
  type VideoEncoding,
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
  parseCallQualityPolicy,
  type LiveKitJoin,
  type CallSession,
  type CallConnectionHints,
  type CallParticipant,
  type CallPermissions,
  type CallQualityPolicy,
  type CallVideoProfile,
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
import { NO_BG, bgSupported, cameraProcessor, getBgEffect, preloadBgAssets, serverBgEffect, setBgEffect, releaseBackgroundEngine, retainBackgroundEngine, setBgOwner, subscribeBgEffect, syncBackground, type BgEffect, type BgHooks } from "@/lib/callBackground";
import CallBackgroundPicker from "./CallBackgroundPicker";
import { IconPhone, IconClose, IconMic, IconMicOff, IconVideo, IconUsers, IconUserPlus, IconChat, IconMonitor, IconRefresh, IconSend, IconGrid, IconUser, IconDownload, IconMinus, IconPlus, IconClock, IconRecord, IconBgPerson } from "../icons";
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
// FULL_DOCS §23 L887-891 wants a client-side confirm/cancel for a paid
// extension. Both answers are keyed by the request they belong to, so a second
// request after a first one lapsed starts with a clean card instead of
// inheriting the previous decision — `mine` is this side's press, `peer` is
// what the other side said over the data channel.
type ExtAnswer = { id: string; mine?: "yes" | "no"; peer?: "yes" | "no" };

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
// §quality_policy L54-57: every video rung carries a `max_bitrate` as well as
// a size — 160000 / 450000 / 900000 for low / medium / high, read verbatim off
// eight live calls on 2026-09-29. A capture resolution does not bound the
// encoder, so a rung that only changed the picture size still published at
// whatever ceiling the previous rung (or the SDK's 720p default, 2.5 Mbit/s)
// had left in place. The ladder therefore has to hand LiveKit an encoding too.
const encOf = (p: CallVideoProfile | undefined): VideoEncoding | undefined =>
  p && p.maxBitrate > 0 ? { maxBitrate: p.maxBitrate, maxFramerate: p.fps } : undefined;
// §quality_policy L53: `profiles.audio_only.audio_bitrate` = 24000. Opus at
// 24 kbit/s mono is the voice budget the backend sizes the call around, and
// `audio_priority` means it is the stream that must survive — so every mic
// publish carries it, not just the ones made while the ladder sits on
// audio_only.
const micPublishOf = (pol: CallQualityPolicy | null) =>
  pol && pol.audioOnlyBitrate > 0 ? { audioPreset: { maxBitrate: pol.audioOnlyBitrate } } : undefined;
// A rung change restarts the CAPTURE track inside the existing publication —
// never a second publish, because the backend flags repeated publish cycles as
// a negotiation loop (see the note at the top of this file). That leaves the
// encoder running at the old ceiling, and RTCRtpSender is the only way to move
// it without publishing again. The ceiling is the budget for the whole
// publication, so simulcast layers split it in proportion to pixel count
// (bitrate goes with area: a layer at scaleResolutionDownBy 2 gets a quarter)
// and their total lands on the ceiling instead of each layer claiming it.
async function capSender(track: LocalVideoTrack | undefined, ceiling: number, fps = 0) {
  const sender = track?.sender;
  if (!sender || ceiling <= 0) return;
  try {
    const params = sender.getParameters();
    const encs = params.encodings;
    if (!encs || !encs.length) return;
    const area = (e: RTCRtpEncodingParameters) => {
      const s = typeof e.scaleResolutionDownBy === "number" && e.scaleResolutionDownBy > 1 ? e.scaleResolutionDownBy : 1;
      return 1 / (s * s);
    };
    const total = encs.reduce((sum, e) => sum + area(e), 0) || 1;
    for (const e of encs) {
      e.maxBitrate = Math.max(1, Math.round((ceiling * area(e)) / total));
      if (fps > 0) e.maxFramerate = fps;
    }
    await sender.setParameters(params);
  } catch {
    // The browser refuses setParameters mid-negotiation; the next rung change
    // (or the next publish) applies the ceiling instead. Never fatal: a call
    // running one rung too wide is still a call.
  }
}
const capCamera = (lp: LocalParticipant, ceiling: number, fps = 0) =>
  capSender(lp.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined, ceiling, fps);
const withBackground = async (options: VideoCaptureOptions | undefined): Promise<VideoCaptureOptions | undefined> => {
  const processor = await cameraProcessor();
  return processor ? { ...options, processor } : options;
};
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
  // The rung the call opens on ("low" on a video call, "audio_only" on an
  // audio one), so the FIRST frame already respects §quality_policy L54-57
  // rather than opening at the SDK's 720p default and being pulled down.
  const start = pol.profiles[pol.startProfile] ?? low;
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
      // The ceilings, as defaults, so any publish path this room grows later
      // inherits them even if it forgets to pass publish options of its own.
      ...(encOf(start) ? { videoEncoding: encOf(start) } : {}),
      ...(micPublishOf(pol) ?? {}),
      // §quality_policy L57: `profiles.screen_share` = { fps: 5, max_bitrate:
      // 500000 }. A shared screen is mostly still text, so the backend gives
      // it a fifth of a video rung's frame rate and half a megabit — not the
      // 1080p15 budget the SDK preset carries.
      ...(pol.screenShare && pol.screenShare.maxBitrate > 0
        ? { screenShareEncoding: { maxBitrate: pol.screenShare.maxBitrate, maxFramerate: pol.screenShare.fps } }
        : {}),
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
  // The adaptive controller's verdict on the link, mirrored into state
  // because the render reads it: an audio call whose connection has already
  // collapsed to audio_only is not offered the video upgrade. profileRef
  // itself cannot be read during render.
  const [linkAudioOnly, setLinkAudioOnly] = useState(false);
  // LEXGO_PUBLIC_WORK_IDS_FRONTEND.md: CALL-83JVE. The watermark used to
  // stamp the first eight characters of the call UUID onto every frame,
  // which is the fallback that MD rules out by name. This is the id a
  // person can actually quote, and the watermark simply drops it when the
  // record has none rather than printing a UUID fragment instead.
  const [callWorkId, setCallWorkId] = useState("");
  // The call's adaptive-quality policy. In state because `video_enabled`
  // decides whether the camera control exists at all; in a ref because the
  // LiveKit handlers are registered once and would otherwise close over the
  // null it had at connect time.
  const [quality, setQuality] = useState<CallQualityPolicy | null>(null);
  const qualityRef = useRef<CallQualityPolicy | null>(null);
  // Guarded, so a poll that has not answered yet cannot wipe the policy the
  // connect path already fetched.
  useEffect(() => { if (quality) qualityRef.current = quality; }, [quality]);
  // The one thing about a policy that is NOT fixed for the life of a call.
  // LEXGO_AUDIO_CALL_CAMERA_UPGRADE_FRONTEND.md: a camera switched on inside
  // an audio call promotes the call to video server-side, and from that
  // moment `video_enabled` is true for everyone in the room. Every other
  // field stays "once per call" — hence a replace that only fires on the
  // flip, rather than dropping the freeze the poll relies on.
  // `known` is for the answers that say the call is a video call now but do
  // not restate the policy — the flag is then flipped on the policy already
  // in hand rather than leaving the room to wait for a poll that would have
  // kept the frozen audio copy anyway.
  const promoteToVideo = useCallback((pol: CallQualityPolicy | null, known = false) => {
    if (qualityRef.current?.videoEnabled) return;
    const next = pol?.videoEnabled ? pol : known && qualityRef.current ? { ...qualityRef.current, videoEnabled: true } : null;
    if (!next) return;
    qualityRef.current = next;
    setQuality(next);
  }, []);
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
  // The same question for the microphone, which §Audio-only fallback L162-166
  // wants switched ON when the link collapses. It must distinguish "the mic is
  // off because something took it away" from "the mic is off because this
  // person pressed mute", so exactly three places write it: the connect path
  // (a mic that published), toggleMic (the person's own press) and the roster
  // effect (a host force-mute). Nothing else may un-mute.
  const micWantedRef = useRef(false);
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
  // FULL_DOCS §23: "Mijozda payment confirm/cancel UI" and "5 minut o'tsa
  // dostup yopiladi". The answer this room holds and the seconds left to give
  // it — the client had neither, and the only card on screen was written in
  // the advocate's voice ("Mijoz Telegramda tasdiqlashi kerak"), i.e. it told
  // the client about the client.
  const [extAns, setExtAns] = useState<ExtAnswer>({ id: "" });
  const [extLeft, setExtLeft] = useState(0);
  // Read by the LiveKit data handler, which is registered once at connect and
  // would otherwise close over the empty request id it saw then.
  const pendExtIdRef = useRef("");
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

  const [bgOpen, setBgOpen] = useState(false);
  const bgOk = useSyncExternalStore(noopSubscribe, bgSupported, serverFalse);
  const bgEffect = useSyncExternalStore(subscribeBgEffect, getBgEffect, serverBgEffect);
  const bgHooks = useRef<BgHooks>({});
  useEffect(() => {
    bgHooks.current = {
      onError: () => toast(t("bg.failed"), "leave"),
      onSlow: () => {
        toast(t("bg.slow"), "leave");
        setBgEffect(NO_BG);
      },
    };
  });
  const syncBg = useCallback(() => {
    const track = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    void syncBackground(track, bgHooks.current);
  }, []);
  const pickBg = useCallback((next: BgEffect) => {
    setBgEffect(next);
    syncBg();
  }, [syncBg]);
  const closeBg = useCallback(() => setBgOpen(false), []);
  useEffect(() => {
    setBgOwner(session?.id ?? null);
  }, [session?.id]);
  useEffect(() => {
    retainBackgroundEngine();
    return () => releaseBackgroundEngine();
  }, []);
  useEffect(() => {
    if (!room || !bgOk) return;
    const onPublished = (pub: LocalTrackPublication) => { if (pub.source === Track.Source.Camera) syncBg(); };
    const onUnmuted = (pub: TrackPublication, p: Participant) => { if (p.isLocal && pub.source === Track.Source.Camera) syncBg(); };
    room.on(RoomEvent.LocalTrackPublished, onPublished);
    room.on(RoomEvent.TrackUnmuted, onUnmuted);
    const unsubscribe = subscribeBgEffect(syncBg);
    if (getBgEffect().kind !== "none") preloadBgAssets();
    syncBg();
    return () => {
      room.off(RoomEvent.LocalTrackPublished, onPublished);
      room.off(RoomEvent.TrackUnmuted, onUnmuted);
      unsubscribe();
    };
  }, [room, bgOk, syncBg]);
  const bgWarned = useRef(false);
  useEffect(() => {
    if (!room || bgOk || bgWarned.current || getBgEffect().kind === "none") return;
    const id = setTimeout(() => {
      bgWarned.current = true;
      toast(t("bg.unavailable"), "leave");
    }, 0);
    return () => clearTimeout(id);
  }, [room, bgOk, toast, t]);

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
        // `linkAudioOnly` means "this connection cannot carry video", and it
        // is what hides the upgrade control. Only a call whose policy already
        // allows video can say that: an AUDIO call has video_enabled false
        // and camera_allowed false on every rung by definition, so reading
        // either of those as a weak link took the camera button off every
        // audio call at the first quality event — and the camera button is
        // the only way the upgrade in
        // LEXGO_AUDIO_TO_VIDEO_CALL_FRONTEND_2026-09-30.md can ever start.
        // After an upgrade the policy carries video_enabled true, and from
        // then on a collapsing link hides it exactly as it should.
        if (alive && pol.videoEnabled) setLinkAudioOnly(true);
        // §Audio-only fallback L162-166 is TWO calls, not one:
        // setCameraEnabled(false) AND setMicrophoneEnabled(true). Only the
        // first half was ever here, so a client whose link collapsed lost the
        // picture and — when the mic had been dropped by the reconnect that
        // preceded the collapse, or had never published at all — was left in a
        // silent room with no way to tell. Guarded by micWantedRef so this
        // restores a mic the CALL lost and never un-mutes somebody who pressed
        // mute themselves or whom the host muted; and skipped while paused,
        // because a paused call publishes nothing by contract.
        if (!lp.isMicrophoneEnabled && micWantedRef.current && !pausedRef.current) {
          await lp.setMicrophoneEnabled(true, undefined, micPublishOf(pol)).catch(() => {});
          if (alive && lp.isMicrophoneEnabled) setMicOn(true);
        }
        if (!lp.isCameraEnabled) return;
        autoCamOffRef.current = true;
        await lp.setCameraEnabled(false).catch(() => {});
        if (alive) setCamOn(false);
        return;
      }
      const prof = pol.profiles[name];
      if (!prof) return;
      if (alive) setLinkAudioOnly(false);
      if (!lp.isCameraEnabled) {
        // Only a camera THIS controller put away comes back, and only into a
        // call that is not paused (a paused call publishes nothing at all).
        if (!autoCamOffRef.current || !camWantedRef.current || pausedRef.current) return;
        autoCamOffRef.current = false;
        profileRef.current = name;
        await lp.setCameraEnabled(true, { facingMode: facingRef.current, resolution: resOf(prof) }, encOf(prof) ? { videoEncoding: encOf(prof) } : undefined).catch(() => {});
        await capCamera(lp, prof.maxBitrate, prof.fps);
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
      // …and restartTrack only moves the CAMERA. The rung's `max_bitrate` is a
      // publish ceiling, so it has to be pushed at the sender separately or a
      // downgrade to `low` would keep sending 450 kbit/s of a 320x180 picture.
      await capCamera(lp, prof.maxBitrate, prof.fps);
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
      // §quality_policy L27, `mode: "adaptive"`. Production has sent exactly
      // that on every call measured (eight live sessions, 2026-09-29), and it
      // is the master switch above auto_downgrade / auto_upgrade: those say
      // which DIRECTION the ladder may move, `mode` says whether there is a
      // ladder at all. Honoured rather than dropped, because the alternative
      // reading — ignore it — means a backend that one day ships a fixed-rung
      // policy would still be overridden by this client. Anything but
      // "adaptive" leaves the call on start_profile, where the Room options
      // already put it.
      if (pol.mode && pol.mode !== "adaptive") return;
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
          // FULL_DOCS §23: the client's answer to a paid extension. It has no
          // HTTP route (see answerExtension below), so the data channel is how
          // the advocate learns of it — without this the host watches five
          // minutes of silence and cannot tell a client who is paying from one
          // who has walked away.
          if (msg.t === "extans" && p) {
            const ok = msg.allowed === true;
            setExtAns((cur) => ({ ...cur, id: pendExtIdRef.current || cur.id, peer: ok ? "yes" : "no" }));
            toast(ok ? t("extPeerYes") : t("extPeerNo"), ok ? "join" : "leave");
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
          // A renegotiated publisher starts from the SDK's defaults, so the
          // rung's §quality_policy L54-57 ceiling has to be restated here as
          // well — otherwise a reconnect silently promotes a `low` call to a
          // 2.5 Mbit/s one on the very link that just failed.
          .setCameraEnabled(true, prof ? { facingMode: facingRef.current, resolution: resOf(prof) } : undefined, encOf(prof) ? { videoEncoding: encOf(prof) } : undefined)
          .then(() => capCamera(lp, prof ? prof.maxBitrate : 0, prof ? prof.fps : 0))
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
          setCallWorkId(call.workId);
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
            // The mic carries profiles.audio_only.audio_bitrate (§quality_policy
            // L53) from its very first publish; `audio_priority` makes this the
            // stream the whole budget is built around.
            try {
              await r.localParticipant.setMicrophoneEnabled(true, undefined, micPublishOf(pol));
              // It published, so an audio-only fallback later on is allowed to
              // bring it back — see micWantedRef.
              micWantedRef.current = true;
            } catch { /* mic denied */ }
            // video_enabled is the truth, not the callType prop: an express
            // request opens an audio session for a service whose name says
            // "video", and that session must not publish a camera.
            const low = pol?.profiles.low;
            if (pol ? pol.videoEnabled : callType === "video") {
              camWantedRef.current = true;
              // start_profile is "low": the camera opens at the bottom rung
              // and the connection-quality actions climb from there — at that
              // rung's 160 kbit/s ceiling, not the SDK's 720p default.
              try {
                await r.localParticipant.setCameraEnabled(true, await withBackground(low ? { facingMode: "user", resolution: resOf(low) } : undefined), encOf(low) ? { videoEncoding: encOf(low) } : undefined);
                if (low) await capCamera(r.localParticipant, low.maxBitrate, low.fps);
              } catch { if (alive) setCamOn(false); }
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
      // Somebody else switched their camera on and the backend promoted this
      // audio call to video. The payload carries the updated call object, so
      // the policy is taken from there when it is present and otherwise
      // inferred from the event itself — either way the camera control has
      // to appear for THIS participant too, without waiting out the poll.
      if (e.event === "call.upgraded_to_video") {
        const payload = e as Record<string, unknown>;
        const call = payload.call && typeof payload.call === "object" ? (payload.call as Record<string, unknown>) : {};
        // Said out loud, because the bar changes shape underneath them: a
        // camera control appears where there was none a second ago.
        if (!qualityRef.current?.videoEnabled) toast(t("upgradedToVideo"), "join");
        promoteToVideo(parseCallQualityPolicy(call.quality_policy ?? payload.quality_policy), true);
        setMetaTick((n) => n + 1);
      }
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
  }, [roomId, callId, session?.id, toast, t, promoteToVideo]);

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
          setCallWorkId(c.workId);
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
          // …with one exception, added with the audio→video upgrade: an
          // audio call that somebody promoted comes back with video_enabled
          // true, and that single flag DOES have to overwrite the frozen
          // copy. This is the fallback for a socket that never delivered
          // `call.upgraded_to_video`.
          promoteToVideo(c.quality, c.callType === "video");
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

  // FULL_DOCS §23: "payment javobini 5 minut kutadi" / "5 minut o'tsa dostup
  // yopiladi". A sentence saying "five minutes" is not a deadline anybody can
  // act on, so the card counts it down. The request's own expires_at is the
  // authority and pause_expires_at is the fallback, because a paused call
  // always carries the second even where the first is absent — neither could
  // be observed read-only (a pause needs a POST), so the render below also
  // copes with both being empty by simply not showing a clock.
  // Its own interval rather than borrowing the elapsed clock: the deadline has
  // to tick on a call this side joined late, where startedAt is a different
  // moment entirely.
  const extDeadline = limits?.pendingExtensionRequest?.expiresAt || limits?.pauseExpiresAt || "";
  useEffect(() => {
    const at = extDeadline ? Date.parse(extDeadline) : 0;
    if (!paused || !at) return;
    // Through a timer even for the first value, never straight from the effect
    // body — the same rule the pause-expiry effect above follows.
    const read = () => setExtLeft(Math.max(0, Math.round((at - Date.now()) / 1000)));
    const first = setTimeout(read, 0);
    const iv = setInterval(read, 1000);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [paused, extDeadline]);
  useEffect(() => { pendExtIdRef.current = limits?.pendingExtensionRequest?.id ?? ""; }, [limits?.pendingExtensionRequest?.id]);

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
      // Both re-publish, so both restate the policy's ceilings
      // (§quality_policy L53 for the mic, L54-57 for the camera's rung) —
      // a resume must not hand the call back at the SDK's defaults.
      if (mic && !hostMutedRef.current) void lp.setMicrophoneEnabled(true, undefined, micPublishOf(qualityRef.current)).then(() => setMicOn(true)).catch(() => {});
      if (cam) {
        const prof = qualityRef.current?.profiles[profileRef.current] ?? qualityRef.current?.profiles.low;
        void lp
          .setCameraEnabled(true, prof ? { facingMode: facingRef.current, resolution: resOf(prof) } : undefined, encOf(prof) ? { videoEncoding: encOf(prof) } : undefined)
          .then(() => capCamera(lp, prof ? prof.maxBitrate : 0, prof ? prof.fps : 0))
          .then(() => setCamOn(true))
          .catch(() => {});
      }
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
      roomRef.current?.localParticipant.setMicrophoneEnabled(me.micEnabled, undefined, me.micEnabled ? micPublishOf(qualityRef.current) : undefined).catch(() => {});
      setMicOn(me.micEnabled);
      setHostMuted(!me.micEnabled);
      // A host force-mute is the third and last writer of micWantedRef: a mic
      // the host closed is NOT a mic the audio-only fallback may re-open
      // (§Audio-only fallback L162-166 restores the call's own loss, not a
      // moderation decision).
      micWantedRef.current = me.micEnabled;
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
  // The camera patch is the one whose ANSWER matters: on an audio call it
  // comes back carrying `call_type: "video"` and a policy with video
  // enabled, which is how this room learns the call it is in has just been
  // promoted (LEXGO_AUDIO_CALL_CAMERA_UPGRADE_FRONTEND.md — "UI holatini
  // backend response bo'yicha yangilasin"). The other patches answer with a
  // participant row and promoteToVideo ignores them.
  function syncSelf(patch: { mic_enabled?: boolean; camera_enabled?: boolean; screen_enabled?: boolean }) {
    if (session?.id) {
      prevMicRef.current = patch.mic_enabled ?? prevMicRef.current;
      updateCallParticipant(roomId, callId, session.id, patch)
        .then((r) => { if (r.callType === "video" || r.quality?.videoEnabled) promoteToVideo(r.quality, r.callType === "video"); })
        .catch(() => {});
    }
  }
  async function toggleMic() {
    const r = roomRef.current;
    if (!r) return;
    if (hostMuted && !micOn) return;
    void enableSound();
    const on = !micOn;
    // The person's own press is what micWantedRef means, so it is written
    // here and nowhere else in this function: an audio-only fallback may
    // restore a mic the call dropped, never one that was muted on purpose.
    micWantedRef.current = on;
    // §quality_policy L53 again — a mic re-published after a mute has to carry
    // the 24 kbit/s ceiling too, or the second half of the call runs on the
    // SDK's music preset.
    await r.localParticipant.setMicrophoneEnabled(on, undefined, on ? micPublishOf(qualityRef.current) : undefined);
    setMicOn(on);
    bump();
    syncSelf({ mic_enabled: on });
  }
  // Capture size for any new or restarted camera track: whichever rung of the
  // backend's ladder the adaptive controller is on, and the old phone/desktop
  // defaults on a call that carries no policy.
  function camProfile(): CallVideoProfile | undefined {
    const pol = qualityRef.current;
    return pol?.profiles[profileRef.current] ?? pol?.profiles.low;
  }
  function camResolution(): VideoResolution {
    const prof = camProfile();
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
      // A camera the USER switches on is still bound by the rung's
      // §quality_policy L54-57 ceiling — the policy governs the link, not the
      // reason the track exists.
      const prof = camProfile();
      await r.localParticipant.setCameraEnabled(on, on ? await withBackground({ facingMode: facingRef.current, resolution: camResolution() }) : undefined, on && encOf(prof) ? { videoEncoding: encOf(prof) } : undefined);
      if (on && prof) await capCamera(r.localParticipant, prof.maxBitrate, prof.fps);
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
      // Both paths above leave a fresh encoder behind (restartTrack swaps the
      // capture track, switchActiveDevice swaps the device), so the rung's
      // ceiling is restated rather than left to the SDK default.
      await capCamera(r.localParticipant, camProfile()?.maxBitrate ?? 0, camProfile()?.fps ?? 0);
      setMirror(next === "user");
      bump();
    } catch { /* ignore */ } finally {
      setCamBusy(false);
    }
  }
  async function toggleShare() {
    const r = roomRef.current;
    if (!r) return;
    // §quality_policy L57: `profiles.screen_share` = { fps: 5, max_bitrate:
    // 500000 }. A shared screen has its own, much smaller budget than a video
    // rung — a fifth of the frame rate and roughly half of `low`+`medium`
    // combined — because it is text that must stay sharp, not motion that must
    // stay smooth. The room used to publish it at the SDK's 1080p15 preset
    // (~3 Mbit/s), six times the budget, on the same link the camera is being
    // throttled to 160 kbit/s to protect.
    const ss = qualityRef.current?.screenShare;
    const base = ScreenSharePresets.h1080fps15.resolution;
    try {
      await r.localParticipant.setScreenShareEnabled(
        !sharing,
        { audio: false, contentHint: "detail", resolution: ss && ss.fps > 0 ? { ...base, frameRate: ss.fps } : base },
        ss && ss.maxBitrate > 0 ? { screenShareEncoding: { maxBitrate: ss.maxBitrate, maxFramerate: ss.fps } } : undefined,
      );
      // The publish options bound the primary layer; this bounds every
      // simulcast layer the SDK added beside it, so the whole publication
      // stays inside the 500 kbit/s the backend allotted.
      if (!sharing && ss && ss.maxBitrate > 0) {
        await capSender(r.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track as LocalVideoTrack | undefined, ss.maxBitrate, ss.fps);
      }
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
  // ── The client's answer to a paid extension ────────────────────
  // FULL_DOCS §23 L887-891 asks for "Mijozda payment confirm/cancel UI" — the
  // client, not only the advocate, has to be able to answer, and today the
  // only route is the Telegram bot.
  // There is no HTTP endpoint for that answer, and this deliberately does not
  // invent one. LEXGO_MEETING_EXTENSION_FRONTEND_UPDATE.md L79 says the
  // backend "Telegram inline approve/reject yuboradi", and a read-only sweep
  // of production on 2026-09-29 (client +998900000005) found every plausible
  // path 404: …/extension-payment-confirm, -approve, -reject, -accept,
  // -decline, -answer, -response, -cancel, -pay, …/extension/confirm,
  // …/extension-confirm, …/extensions, /call-extension-requests/{id},
  // /me/extension-requests — while …/extension-payment-request answers 405
  // with Allow: POST, i.e. exists and is the advocate's side only.
  // (/calls/extension-requests looks like a hit at first glance; it is the
  // PATCH /calls/{call_id} wildcard — /calls/zzzz-not-a-route answers
  // identically.) A guessed POST here would move money, so it is not made.
  // What this does instead is real on both sides: it tells the room over the
  // LiveKit data channel — the same channel the recording consent already
  // rides, and still open while paused because a pause only mutes tracks — so
  // the advocate learns the client's decision at once instead of watching the
  // five-minute window run out, and it moves this side's card to an
  // acknowledgement that names where the payment is actually completed.
  // When the backend exposes the answer route, this function is the one place
  // that call goes.
  function answerExtension(ok: boolean) {
    const id = limits?.pendingExtensionRequest?.id ?? "";
    if (!id) return;
    setExtAns((cur) => ({ id, mine: ok ? "yes" : "no", peer: cur.id === id ? cur.peer : undefined }));
    roomRef.current?.localParticipant
      .publishData(enc({ t: "extans", allowed: ok, at: stamp() }), { reliable: true })
      .catch(() => {});
    toast(ok ? t("extAnsYesToast") : t("extAnsNoToast"), ok ? "info" : "leave");
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
  // the callType prop then lies.
  // Express L86 — "Call ekranida video tugmani default ko'rsatmaslik mumkin,
  // chunki bu flow audio call" — makes the pre-policy answer the callType, not
  // a blanket yes: a flow that CONNECTED as audio must not flash a camera
  // button into the bar for the second or two before the policy lands, and a
  // backend that sends no policy at all must not offer one on an audio call
  // either. Measured on production 2026-09-29: the audio call in room
  // 6238b71c carries video_enabled=false and camera_allowed=false on all four
  // connection-quality actions, so the policy says exactly this once it
  // arrives — this only stops the room guessing the opposite while it waits.
  const videoAllowed = quality ? quality.videoEnabled : callType === "video";
  // …and whether it may GROW one. LEXGO_AUDIO_CALL_CAMERA_UPGRADE_FRONTEND.md
  // is the newer contract and it overrides the line above for the audio case:
  // "Audio call ichida user camera yoqsa backend callni video callga
  // o'tkazadi". That flow was unreachable while the control only existed for
  // a call the policy had already blessed — the camera button was simply not
  // in the bar, so nothing could ever send camera_enabled=true. The adaptive
  // MD's "default hidden yoki disabled" is honoured by what the button SAYS
  // rather than by its absence: on an audio call it is an upgrade ("Videoni
  // yoqish"), not a toggle, and the upgrade is the backend's to grant — the
  // PATCH answer is what flips this room over to the video policy. A call
  // that is over, or one the connection has dropped to audio_only, is not
  // offered the upgrade.
  const canUpgradeToVideo = !videoAllowed && status === "live" && !linkAudioOnly;
  const camControl = videoAllowed || canUpgradeToVideo;
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
    session?.phone ? "••" + session.phone.replace(/\D/g, "").slice(-4) : "",
    callWorkId,
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
  // FULL_DOCS §23. The extension the client is being asked to pay for, and
  // whether THIS person is the one being asked. The payer is the participant
  // who is neither the backend host (perms.canEnd) nor staff — `iApprove`
  // covers advocates, lawyers and the call centre, so a second advocate
  // invited into the meeting is never shown a bill.
  const pendExt = limits?.pendingExtensionRequest ?? null;
  const isPayer = !perms?.canEnd && !iApprove;
  // Keyed by request id so a lapsed request's answer never colours the next
  // one; an id that does not match means "not answered yet".
  const extFor: ExtAnswer = extAns.id && extAns.id === (pendExt?.id ?? "") ? extAns : { id: pendExt?.id ?? "" };
  // A call paused by a pending extension payment is not this host's hold to
  // lift — resuming would answer the client's prompt on their behalf, and the
  // pause card already explains that wait. So the control stands down for
  // exactly that case rather than offering a resume it should not offer.
  // Once the client has said no in-app, though, there is nothing left to wait
  // for and the host gets the resume back: that is the whole point of carrying
  // the answer over the data channel.
  const showPause = canPause && !(paused && !!pendExt && extFor.peer !== "no");

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
          {/* Which kind of call this is, which nothing on the screen said
              before. It matters most at the moment it changes: an audio call
              becomes a video call the instant anybody switches a camera on
              (LEXGO_AUDIO_TO_VIDEO_CALL_FRONTEND_2026-09-30.md), and the
              person who did not press anything needs to see that it happened.
              It sits with the other badges rather than in a corner of its
              own, so the header still reads as one line: what the meeting is,
              how it is going, and what it is carrying. */}
          <span className={`mtg__badge mtg__badge--mode${videoAllowed ? " mtg__badge--video" : ""}`}>
            {videoAllowed ? <IconVideo /> : <IconMic />}
            {t(videoAllowed ? "modeVideo" : "modeAudio")}
          </span>
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
          {/* Grid and speaker arrange video tiles, so they are only offered
              once there is video to arrange. On an audio call they were two
              controls that changed nothing on screen; they appear by
              themselves the moment the call is upgraded. */}
          {videoAllowed ? (
            <>
              <button type="button" className={`mtg__tool${view === "grid" ? " on" : ""}`} onClick={() => setView("grid")} aria-label={t("layoutGrid")} title={t("layoutGrid")}><IconGrid /></button>
              <button type="button" className={`mtg__tool${view === "speaker" ? " on" : ""}`} onClick={() => setView("speaker")} aria-label={t("layoutSpeaker")} title={t("layoutSpeaker")}><IconUser /></button>
            </>
          ) : null}
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
              it resumes by itself if nobody answers within five minutes.
              FULL_DOCS §23 gives the two sides different jobs: the advocate
              waits ("Payment kutilyotganda meeting paused ko'rsatilsin"), the
              client decides ("Mijozda payment confirm/cancel UI"). One card,
              two faces — plus the plain hold, which is neither. */}
          {paused ? (
            <div
              className={`mtg__pause${floating ? " mtg__pause--over" : ""}${isPayer && pendExt ? " mtg__pause--ask" : ""}`}
              role={isPayer && pendExt ? "dialog" : "status"}
              aria-label={isPayer && pendExt ? t("extAskTitle") : undefined}
            >
              <b><IconClock />{isPayer && pendExt ? t("extAskTitle") : t("pausedTitle")}</b>
              <span>
                {pendExt
                  ? isPayer
                    ? t("extAskLead", { minutes: pendExt.minutes, amount: fmtUzs(pendExt.amount) })
                    : t("pausedLead", { minutes: pendExt.minutes, amount: fmtUzs(pendExt.amount) })
                  : t("pausedLeadPlain")}
              </span>
              {/* The five-minute window, as a clock rather than a sentence.
                  Hidden when the backend gave neither deadline, which is a
                  state this side could not reach read-only. */}
              {pendExt && extDeadline && extLeft > 0 ? (
                <span className={`mtg__pause-left${extLeft > 0 && extLeft <= 60 ? " mtg__pause-left--low" : ""}`}>
                  <i aria-hidden="true" />{t("extAnswerLeft", { time: mmss(extLeft) })}
                </span>
              ) : null}
              {isPayer && pendExt ? (
                extFor.mine ? (
                  <small>{extFor.mine === "yes" ? t("extAnsYesNote") : t("extAnsNoNote")}</small>
                ) : (
                  <>
                    <div className="mtg__recask-btns">
                      <button type="button" className="btn btn--pri btn--sm" onClick={() => answerExtension(true)}><IconPlus />{t("extConfirm")}</button>
                      <button type="button" className="btn btn--line btn--sm" onClick={() => answerExtension(false)}><IconClose />{t("extDecline")}</button>
                    </div>
                    <small>{t("extAskNote")}</small>
                  </>
                )
              ) : (
                <small>{extFor.peer === "yes" ? t("extPeerYes") : extFor.peer === "no" ? t("extPeerNo") : t("pausedExpiry")}</small>
              )}
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
            {camControl && bgOk ? <button type="button" onClick={() => { setMore(false); setBgOpen(true); }}><IconBgPerson />{t("bg.button")}</button> : null}
          </div>
        </div>
      ) : null}

      {bgOpen && camControl && bgOk ? <CallBackgroundPicker camOn={camOn} onClose={closeBg} onPick={pickBg} /> : null}

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
        {camControl ? <Ctl on={camOn} off={!camOn} label={canUpgradeToVideo ? t("camUpgrade") : camOn ? t("camOff2") : t("camOn")} onClick={toggleCam} disabled={camBusy}><IconVideo /></Ctl> : null}
        {videoAllowed && camOn && canSwitchCam ? <Ctl label={t("switchCam")} onClick={switchCam} disabled={camBusy}><IconRefresh /></Ctl> : null}
        {camControl && bgOk ? <Ctl on={bgOpen || bgEffect.kind !== "none"} label={t("bg.button")} onClick={() => setBgOpen((v) => !v)} desktop><IconBgPerson /></Ctl> : null}
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

const noopSubscribe = () => () => {};
const serverFalse = () => false;

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
