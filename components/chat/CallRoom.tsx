"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  VideoPresets43,
  ScreenSharePresets,
  type LocalParticipant,
  type LocalVideoTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type TrackPublication,
} from "livekit-client";
import {
  getCallJoinToken,
  getCall,
  endCall,
  endMeeting,
  leaveCall,
  updateCallParticipant,
  inviteCallParticipant,
  searchUsers,
  callSocketUrl,
  type LiveKitJoin,
  type CallParticipant,
  type CallPermissions,
} from "@/lib/services/backend";
import { getToken } from "@/lib/client";
import { subscribeRoomCallEvents } from "@/lib/callEvents";
import { backoffMs, refreshAccessToken } from "@/lib/http";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/lawyers";
import SearchSelect from "@/components/SearchSelect";
import { playRingback, playEndTone, playJoinTone, playLeaveTone, playRecTone } from "@/lib/callSounds";
import { MeetingRecorder, canRecord, saveRecording, type RecordingFile } from "@/lib/meetingRecorder";
import { useFlip } from "@/lib/useFlip";
import { IconClose, IconMic, IconMicOff, IconVideo, IconUsers, IconUserPlus, IconChat, IconMonitor, IconRefresh, IconSend, IconGrid, IconUser, IconDownload } from "../icons";

type Props = {
  roomId: string;
  callId: string;
  callType: "audio" | "video";
  isCaller: boolean;
  title?: string;
  // Caller already has LiveKit creds from the create-call response; a joiner
  // fetches its own token via /join-token.
  lk?: LiveKitJoin | null;
  onEnd: () => void;
};

type ChatMsg = { id: string; from: string; name: string; text: string; at: number; system?: boolean };
type Toast = { id: number; text: string; kind: "join" | "leave" | "info" };

const MOBILE = () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
const PORTRAIT_HINT = () => typeof window !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

// In-app audio/video meeting over LiveKit (managed SFU + coturn on the
// backend). Everything stays inside LexGo: a tile per participant with name,
// mic state and speaking ring, screen share on a stage, in-call chat over the
// LiveKit data channel, and host controls from the backend roster.
export default function CallRoom({ roomId, callId, callType, isCaller, title, lk, onEnd }: Props) {
  const t = useTranslations("call");
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
  const [sharing, setSharing] = useState(false);
  const [mirror, setMirror] = useState(true); // front camera preview is mirrored
  const facingRef = useRef<"user" | "environment">("user");
  const [tick, setTick] = useState(0); // bump to re-read LiveKit participant state
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [hostMuted, setHostMuted] = useState(false); // muted by host → can't self-unmute
  const [roster, setRoster] = useState<CallParticipant[]>([]);
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
  const firstJoinRef = useRef(true);
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
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        simulcast: true,
        // Top layer = the capture resolution (720p desktop / 540p 4:3 phone);
        // weaker viewers fall back to 360p / 180p instead of a blurry single stream.
        videoSimulcastLayers: phone ? [VideoPresets43.h180, VideoPresets43.h360] : [VideoPresets.h216, VideoPresets.h360],
        screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
        screenShareSimulcastLayers: [ScreenSharePresets.h720fps15],
        videoEncoding: VideoPresets.h720.encoding,
      },
      // Phones: 4:3 capture (a 16:9 crop of a 4:3 sensor looks zoomed, especially on the back camera).
      videoCaptureDefaults: { facingMode: "user", resolution: phone ? VideoPresets43.h540.resolution : VideoPresets.h720.resolution },
    });
    roomRef.current = room;
    // Publish the Room to render after this effect settles (not synchronously).
    const publish = setTimeout(() => { if (alive) setRoom(room); }, 0);

    const attachAudio = (track: RemoteTrack) => {
      const c = audioRef.current;
      if (!c || track.kind !== Track.Kind.Audio) return;
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      c.appendChild(el);
    };
    const onJoin = (p: RemoteParticipant) => {
      if (!alive) return;
      bump();
      setStatus("live");
      playJoinTone(firstJoinRef.current);
      firstJoinRef.current = false;
      const name = nameOfRef.current(p);
      toast(t("joinedToast", { name }), "join");
      setMessages((m) => [...m, { id: `sys-${Date.now()}`, from: p.identity, name, text: t("joinedToast", { name }), at: Date.now(), system: true }]);
    };
    const onLeave = (p: RemoteParticipant) => {
      if (!alive) return;
      bump();
      playLeaveTone();
      const name = nameOfRef.current(p);
      toast(t("leftToast", { name }), "leave");
      setMessages((m) => [...m, { id: `sys-${Date.now()}`, from: p.identity, name, text: t("leftToast", { name }), at: Date.now(), system: true }]);
      setPinned((cur) => (cur === p.identity ? null : cur));
    };

    room
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
      .on(RoomEvent.AudioPlaybackStatusChanged, () => { if (alive) setAudioBlocked(!room.canPlaybackAudio); })
      // Reflect a host/server mute of my own mic instantly in the UI.
      .on(RoomEvent.TrackMuted, (pub, p) => { if (!alive) return; bump(); if (p.isLocal && pub.source === Track.Source.Microphone) setMicOn(false); })
      .on(RoomEvent.TrackUnmuted, (pub, p) => { if (!alive) return; bump(); if (p.isLocal && pub.source === Track.Source.Microphone) setMicOn(true); })
      // In-call chat rides the LiveKit data channel — nothing to store.
      .on(RoomEvent.DataReceived, (payload, p) => {
        if (!alive) return;
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as { t?: string; text?: string; at?: number };
          if (msg.t === "rec" && p) {
            const on = (msg as { on?: boolean }).on === true;
            setRecBy((cur) => { const n = new Set(cur); if (on) n.add(p.identity); else n.delete(p.identity); return n; });
            toast(on ? t("recStartedBy", { name: nameOfRef.current(p) }) : t("recStoppedBy", { name: nameOfRef.current(p) }), on ? "leave" : "join");
            return;
          }
          if (msg.t === "chat" && msg.text) {
            const name = p ? nameOfRef.current(p) : t("someone");
            setMessages((m) => [...m, { id: `${p?.identity ?? "x"}-${msg.at ?? Date.now()}`, from: p?.identity ?? "", name, text: msg.text!, at: msg.at ?? Date.now() }]);
            if (panelRef.current !== "chat") setUnread((n) => n + 1);
          }
        } catch { /* not ours */ }
      })
      .on(RoomEvent.Disconnected, () => { if (alive) { setStatus("ended"); finish(); } });

    (async () => {
      try {
        const creds = lk && lk.token ? lk : await getCallJoinToken(roomId, callId);
        if (!creds.url || !creds.token) { if (alive) setStatus("error"); return; }
        // Connect exactly once. Pass the backend livekit_url verbatim — no
        // manual /rtc suffix or query params.
        if (!connectedRef.current) {
          await room.connect(creds.url, creds.token, { autoSubscribe: true });
          connectedRef.current = true;
        }
        if (!alive) { room.disconnect(); return; }
        // Publish local tracks exactly once, after Connected. Mic and camera are
        // enabled independently so a denied camera (or no webcam) still leaves a
        // working audio call instead of erroring out.
        if (!publishedRef.current) {
          publishedRef.current = true;
          try { await room.localParticipant.setMicrophoneEnabled(true); } catch { /* mic denied */ }
          if (callType === "video") {
            try { await room.localParticipant.setCameraEnabled(true); } catch { if (alive) setCamOn(false); }
          }
        }
        // Kick off audio playback; if the browser blocks it, show a prompt.
        try { await room.startAudio(); } catch { /* needs a user gesture */ }
        if (alive) setAudioBlocked(!room.canPlaybackAudio);
        try { sessionStorage.setItem("lexgo_active_call", JSON.stringify({ roomId, callId, callType })); } catch { /* ignore */ }
        // More than one camera (phones) → offer a front/back switch.
        try {
          const cams = await Room.getLocalDevices("videoinput");
          if (alive) setCanSwitchCam(cams.length > 1);
        } catch { /* no device access */ }
        if (alive) {
          setStartedAt(Date.now());
          bump();
          setStatus(room.remoteParticipants.size ? "live" : "ringing");
        }
      } catch {
        if (alive) setStatus("error");
      }
    })();

    return () => {
      alive = false;
      clearTimeout(publish);
      publishedRef.current = false;
      connectedRef.current = false;
      room.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, callId, callType]);

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

  // Meeting meta: participants roster, host permissions, remaining time.
  // Polls every 3s and refreshes immediately when a realtime event bumps
  // metaTick.
  useEffect(() => {
    let alive = true;
    const load = () =>
      getCall(roomId, callId)
        .then((c) => {
          if (!alive) return;
          setRoster(c.participants);
          setPerms(c.permissions);
          if (c.remainingSeconds > 0) setRemaining(c.remainingSeconds);
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
  }, [roomId, callId, metaTick]);
  useEffect(() => {
    if (remaining == null) return;
    const iv = setInterval(() => setRemaining((s) => (s != null && s > 0 ? s - 1 : s)), 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining == null]);

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
      sock.onopen = () => { attempt = 0; };
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
        if (type.includes("auto_ended") || type === "call.end") { finish(); return; }
        if (/^(participant|media)\./.test(type) || type === "call.join" || type === "call.leave") {
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
      if (ws) {
        ws.onclose = null;
        try { ws.close(); } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  async function toggleCam() {
    const r = roomRef.current;
    if (!r) return;
    void enableSound();
    const on = !camOn;
    try {
      await r.localParticipant.setCameraEnabled(on);
      setCamOn(on);
      bump();
      syncSelf({ camera_enabled: on });
    } catch { /* camera unavailable/denied */ }
  }
  // Phones: front ↔ back. The track is restarted with facingMode so the
  // browser picks the default lens of that side (cycling every "videoinput"
  // walks through tele/ultra-wide lenses — that was the "zoomed" camera and
  // the 4–5 taps to get back to the front). Falls back to a device switch.
  const [camBusy, setCamBusy] = useState(false);
  async function switchCam() {
    const r = roomRef.current;
    if (!r || camBusy) return;
    setCamBusy(true);
    const next: "user" | "environment" = facingRef.current === "user" ? "environment" : "user";
    const isBack = (label: string) => /back|rear|environment|orqa|задн/i.test(label);
    try {
      const pub = r.localParticipant.getTrackPublication(Track.Source.Camera);
      const track = pub?.track as LocalVideoTrack | undefined;
      const res = PORTRAIT_HINT() ? VideoPresets43.h540.resolution : VideoPresets.h720.resolution;
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
  async function inviteSearch(q: string) {
    const users = await searchUsers(q);
    const inCall = new Set(roster.map((p) => p.userId));
    return users
      .filter((u) => u.id && !inCall.has(u.id))
      .map((u) => ({ value: u.id, label: u.name || u.phone || "—", sub: [u.phone, u.lexgoId].filter(Boolean).join(" · ") || undefined }));
  }
  // Local recording of the whole conversation (never uploaded). Everyone in
  // the room is told through the data channel and sees a badge.
  async function toggleRec() {
    const r = roomRef.current;
    if (!r) return;
    if (!recOn) {
      try {
        const rec = new MeetingRecorder();
        rec.start(r);
        recorderRef.current = rec;
        setRecSec(0);
        setRecOn(true);
        setRecFile(null);
        playRecTone(true);
        r.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ t: "rec", on: true, at: Date.now() })), { reliable: true }).catch(() => {});
        toast(t("recStarted"), "join");
      } catch {
        toast(t("recError"), "leave");
      }
      return;
    }
    const rec = recorderRef.current;
    recorderRef.current = null;
    setRecOn(false);
    playRecTone(false);
    r.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ t: "rec", on: false, at: Date.now() })), { reliable: true }).catch(() => {});
    const file = rec ? await rec.stop() : null;
    if (file) setRecFile(file); else toast(t("recError"), "leave");
  }
  async function saveRec() {
    if (!recFile) return;
    try {
      await saveRecording(recFile, title || t("meetingTitle"));
      toast(t("recSaved"), "join");
      setRecFile(null);
    } catch {
      toast(t("recError"), "leave");
    }
  }
  async function hangUp() {
    playEndTone();
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
  const statusLabel = status === "live" ? t("live") : status === "ringing" ? t("ringing") : status === "error" ? t("error") : t("connecting");
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices && !MOBILE();
  const activeRoster = roster.filter((p) => p.status !== "removed" && p.status !== "left" && p.status !== "declined");
  const gridN = strip.length;
  const flipKey = `${strip.map((p) => p.identity).join("|")}:${view}:${stageIsShare ? 1 : 0}:${panel}`;
  const gridRef = useFlip<HTMLDivElement>(flipKey);
  const stripRef = useFlip<HTMLDivElement>(flipKey);
  const recByNames = [...recBy].map((id) => { const p = participants.find((x) => x.identity === id); return p ? nameOf(p) : t("someone"); });

  return (
    <div className={`mtg${panel ? " mtg--panel" : ""}`} data-tick={tick}>
      <div ref={audioRef} hidden />
      <header className="mtg__top">
        <div className="mtg__title">
          <b>{title || t("meetingTitle")}</b>
          <span className={`mtg__badge mtg__badge--${status}`}><i />{statusLabel}</span>
          {recOn || recBy.size ? (
            <span className="mtg__badge mtg__badge--rec" title={recByNames.join(", ")}><i />{recOn ? t("recording", { time: mmss(recSec) }) : t("recordingBy", { name: recByNames[0] || t("someone") })}</span>
          ) : null}
        </div>
        <div className="mtg__timer">
          <span className="mtg__rec"><i />{mmss(elapsed)}</span>
          {remaining != null ? <span className="mtg__left">{t("remaining")}: {mmss(remaining)}</span> : null}
        </div>
        <div className="mtg__tools">
          <button type="button" className={`mtg__tool${view === "grid" ? " on" : ""}`} onClick={() => setView("grid")} aria-label={t("layoutGrid")} title={t("layoutGrid")}><IconGrid /></button>
          <button type="button" className={`mtg__tool${view === "speaker" ? " on" : ""}`} onClick={() => setView("speaker")} aria-label={t("layoutSpeaker")} title={t("layoutSpeaker")}><IconUser /></button>
          <button type="button" className={`mtg__tool${panel === "people" ? " on" : ""}`} onClick={() => openPanel(panel === "people" ? "" : "people")} aria-label={t("rosterTitle")} title={t("rosterTitle")}>
            <IconUsers /><span className="mtg__n">{count}</span>
          </button>
        </div>
      </header>

      <div className="mtg__toasts" aria-live="polite">
        {toasts.map((x) => <div key={x.id} className={`mtg__toast mtg__toast--${x.kind}`}>{x.text}</div>)}
      </div>
      {audioBlocked ? (
        <button type="button" className="mtg__sound" onClick={enableSound}>{t("enableSound")}</button>
      ) : null}

      <div className="mtg__body">
        <main className="mtg__stage">
          {stageP ? (
            <div className="mtg__speaker">
              <Tile key={`stage-${stageP.identity}-${stageIsShare ? "s" : "c"}`} p={stageP} name={nameOf(stageP)} you={t("you")} camOff={t("camOff")} share={stageIsShare} mirror={stageP.isLocal && !stageIsShare && mirror} big />
              {stageIsShare ? <span className="mtg__sharing"><IconMonitor />{stageP.isLocal ? t("youShare") : t("sharing", { name: nameOf(stageP) })}</span> : null}
              <div className="mtg__strip" ref={stripRef}>
                {strip.map((p) => (
                  <Tile key={p.identity} p={p} name={nameOf(p)} you={t("you")} camOff={t("camOff")} mirror={p.isLocal && mirror} small onClick={() => { setPinned(p.identity); setView("speaker"); }} />
                ))}
              </div>
            </div>
          ) : (
            <div className={`mtg__grid mtg__grid--${Math.min(gridN, 9)}`} ref={gridRef}>
              {strip.map((p) => (
                <Tile key={p.identity} p={p} name={nameOf(p)} you={t("you")} camOff={t("camOff")} mirror={p.isLocal && mirror} pip={gridN === 2 && p.isLocal && MOBILE()} onClick={() => { setPinned(p.identity); setView("speaker"); }} />
              ))}
              {count <= 1 ? (
                <div className="mtg__waiting">
                  <span className="mtg__ripple" />
                  <p>{status === "error" ? t("error") : status === "connecting" ? t("connecting") : t("waitingOthers")}</p>
                </div>
              ) : null}
            </div>
          )}
          {recFile ? (
            <div className="mtg__recdone" role="status">
              <div>
                <b>{t("recReady")}</b>
                <span>{mmss(Math.round(recFile.durationMs / 1000))} · {(recFile.blob.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
              <button type="button" className="btn btn--pri btn--sm" onClick={saveRec}><IconDownload />{t("recSave")}</button>
              <button type="button" className="mtg__sx" onClick={() => setRecFile(null)} aria-label={t("close")}><IconClose /></button>
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
                  return (
                    <div className={`mtg__prow${live?.isSpeaking ? " speaking" : ""}`} key={p.userId}>
                      <span className="mtg__pav">{initials(p.name || "?")}</span>
                      <div className="mtg__pm">
                        <b>{p.name || "—"}{self ? ` (${t("you")})` : ""}</b>
                        <span>{p.role === "host" ? t("hostLabel") : live ? t("live") : t.has(`pstatus.${p.status}`) ? t(`pstatus.${p.status}`) : p.status}</span>
                      </div>
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
            {canRecord() ? <button type="button" onClick={() => { setMore(false); void toggleRec(); }}><IconMic />{recOn ? t("recStop") : t("recStart")}</button> : null}
            <button type="button" onClick={() => { setMore(false); setView(view === "grid" ? "speaker" : "grid"); }}>{view === "grid" ? <IconUser /> : <IconGrid />}{view === "grid" ? t("layoutSpeaker") : t("layoutGrid")}</button>
          </div>
        </div>
      ) : null}

      <footer className="mtg__bar">
        <Ctl on={micOn} off={!micOn} label={t("mic")} onClick={toggleMic} disabled={hostMuted && !micOn} title={hostMuted && !micOn ? t("mutedByHost") : undefined}>{micOn ? <IconMic /> : <IconMicOff />}</Ctl>
        {callType === "video" ? <Ctl on={camOn} off={!camOn} label={t("cam")} onClick={toggleCam}><IconVideo /></Ctl> : null}
        {callType === "video" && canSwitchCam ? <Ctl label={t("switchCam")} onClick={switchCam} disabled={camBusy}><IconRefresh /></Ctl> : null}
        {canShare ? <Ctl on={sharing} label={sharing ? t("screenStop") : t("screen")} onClick={toggleShare} accent={sharing} desktop><IconMonitor /></Ctl> : null}
        {canRecord() ? <Ctl on={recOn} label={recOn ? t("recStop") : t("recStart")} onClick={toggleRec} rec={recOn} desktop><IconMic /></Ctl> : null}
        <Ctl on={panel === "people"} label={t("rosterTitle")} onClick={() => openPanel(panel === "people" ? "" : "people")} desktop><IconUsers /></Ctl>
        <Ctl on={panel === "chat"} label={t("chatTab")} onClick={() => openPanel(panel === "chat" ? "" : "chat")} badge={unread} desktop><IconChat /></Ctl>
        <Ctl label={t("more")} onClick={() => setMore((m) => !m)} badge={unread} phone><IconGrid /></Ctl>
        <Ctl end label={isCaller ? t("endAll") : t("end")} onClick={hangUp}><IconClose /></Ctl>
      </footer>
    </div>
  );
}

function Ctl({ children, label, onClick, on, off, end, accent, rec, disabled, title, badge, desktop, phone }: { children: ReactNode; label: string; onClick: () => void; on?: boolean; off?: boolean; end?: boolean; accent?: boolean; rec?: boolean; disabled?: boolean; title?: string; badge?: number; desktop?: boolean; phone?: boolean }) {
  return (
    <button type="button" className={`mtg__ctl${on ? " on" : ""}${off ? " off" : ""}${end ? " end" : ""}${accent ? " accent" : ""}${rec ? " rec" : ""}${desktop ? " mtg__ctl--desktop" : ""}${phone ? " mtg__ctl--phone" : ""}`} onClick={onClick} disabled={disabled} title={title} aria-label={label}>
      <span className="mtg__ci">{children}{badge ? <i className="mtg__cb">{badge > 9 ? "9+" : badge}</i> : null}</span>
      <span className="mtg__cl">{label}</span>
    </button>
  );
}

// One participant: camera (or screen share) video, or initials when the
// camera is off; name chip with mic state; green ring while speaking. The
// tile learns the stream's orientation from the video element so a phone's
// portrait camera isn't squeezed into a landscape box.
function Tile({ p, name, you, camOff, share, mirror, big, small, pip, onClick }: { p: Participant; name: string; you: string; camOff: string; share?: boolean; mirror?: boolean; big?: boolean; small?: boolean; pip?: boolean; onClick?: () => void }) {
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
      <span className="mtg__name">
        {p.isMicrophoneEnabled ? null : <IconMicOff />}
        {name}{p.isLocal ? ` (${you})` : ""}
      </span>
    </div>
  );
}
