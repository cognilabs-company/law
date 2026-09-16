"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Room, RoomEvent, Track, VideoPresets, type RemoteTrack } from "livekit-client";
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
import { backoffMs, refreshAccessToken } from "@/lib/http";
import { useAuth } from "@/lib/auth";
import SearchSelect from "@/components/SearchSelect";
import { playRingback, playEndTone } from "@/lib/callSounds";
import { IconClose, IconMic, IconMicOff, IconVideo, IconUser, IconUsers, IconUserPlus } from "../icons";

type Props = {
  roomId: string;
  callId: string;
  callType: "audio" | "video";
  isCaller: boolean;
  // Caller already has LiveKit creds from the create-call response; a joiner
  // fetches its own token via /join-token.
  lk?: LiveKitJoin | null;
  onEnd: () => void;
};

// In-app audio/video call over LiveKit (managed SFU + coturn on the backend).
// No external Zoom/Meet — everything stays inside LexGo.
export default function CallRoom({ roomId, callId, callType, isCaller, lk, onEnd }: Props) {
  const t = useTranslations("call");
  const { session } = useAuth();
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  // Connect/publish guards — the backend flags repeated connect/publish/
  // unpublish as a negotiation loop, so each must happen exactly once.
  const connectedRef = useRef(false);
  const publishedRef = useRef(false);
  const [status, setStatus] = useState<"connecting" | "ringing" | "live" | "ended" | "error">("connecting");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(callType === "video");
  const [remoteOn, setRemoteOn] = useState(false);
  const [count, setCount] = useState(1); // participants incl. self
  const [remaining, setRemaining] = useState<number | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [hostMuted, setHostMuted] = useState(false); // muted by host → can't self-unmute
  const [roster, setRoster] = useState<CallParticipant[]>([]);
  const [perms, setPerms] = useState<CallPermissions | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [metaTick, setMetaTick] = useState(0); // bump to force a roster refresh
  const [invitePicks, setInvitePicks] = useState<string[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const prevMicRef = useRef<boolean | null>(null); // last roster mic value (detect host action)
  const leftRef = useRef(false); // guard against double-leave

  // Remember the active meeting so a page reload can rejoin it instead of
  // dropping the user out.
  const clearActive = () => { try { sessionStorage.removeItem("lexgo_active_call"); } catch { /* ignore */ } };
  const finish = () => { clearActive(); onEnd(); };

  useEffect(() => {
    let alive = true;
    // adaptiveStream (subscriber only pulls the resolution its tile needs) +
    // dynacast + simulcast keep bandwidth down so audio doesn't lag on weak
    // connections. The video tiles are sized by the grid, so adaptiveStream can
    // measure them and won't pause ("freeze") the picture.
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        simulcast: true,
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      },
      videoCaptureDefaults: { resolution: VideoPresets.h540.resolution },
    });
    roomRef.current = room;

    const attach = (track: RemoteTrack) => {
      const c = remoteRef.current;
      if (!c) return;
      const el = track.attach();
      if (track.kind === Track.Kind.Video) {
        el.classList.add("callroom__rvid");
        (el as HTMLVideoElement).autoplay = true;
        (el as HTMLVideoElement).playsInline = true;
        el.setAttribute("playsinline", "");
      } else {
        el.style.display = "none";
        (el as HTMLAudioElement).autoplay = true;
      }
      c.appendChild(el);
      setRemoteOn(true);
      setStatus("live");
    };

    const attachLocalCam = () => {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const vt = pub?.videoTrack;
      if (vt && localRef.current) vt.attach(localRef.current);
    };

    const syncCount = () => { if (alive) setCount(1 + room.remoteParticipants.size); };
    room
      .on(RoomEvent.TrackSubscribed, (track) => attach(track))
      .on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((e) => e.remove()))
      .on(RoomEvent.ParticipantConnected, syncCount)
      .on(RoomEvent.ParticipantDisconnected, syncCount)
      // Browser autoplay policy can block remote audio until a user gesture.
      .on(RoomEvent.AudioPlaybackStatusChanged, () => { if (alive) setAudioBlocked(!room.canPlaybackAudio); })
      // Reflect a host/server mute of my own mic instantly in the UI.
      .on(RoomEvent.TrackMuted, (pub, p) => { if (alive && p.isLocal && pub.source === Track.Source.Microphone) setMicOn(false); })
      .on(RoomEvent.TrackUnmuted, (pub, p) => { if (alive && p.isLocal && pub.source === Track.Source.Microphone) setMicOn(true); })
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.source === Track.Source.Camera && pub.videoTrack && localRef.current) {
          pub.videoTrack.attach(localRef.current);
        }
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
            try {
              const camPub = await room.localParticipant.setCameraEnabled(true);
              const vt = camPub?.videoTrack;
              if (vt && localRef.current) vt.attach(localRef.current);
              else setTimeout(() => { if (alive) attachLocalCam(); }, 400);
            } catch {
              if (alive) setCamOn(false);
            }
          }
        }
        // Kick off audio playback; if the browser blocks it, show a prompt.
        try { await room.startAudio(); } catch { /* needs a user gesture */ }
        if (alive) setAudioBlocked(!room.canPlaybackAudio);
        try { sessionStorage.setItem("lexgo_active_call", JSON.stringify({ roomId, callId, callType })); } catch { /* ignore */ }
        syncCount();
        setStatus(room.remoteParticipants.size ? "live" : "ringing");
      } catch {
        if (alive) setStatus("error");
      }
    })();

    return () => {
      alive = false;
      publishedRef.current = false;
      connectedRef.current = false;
      room.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, callId, callType]);

  // Caller hears a ringback until the other side connects.
  useEffect(() => {
    if (!isCaller || status === "live" || remoteOn) return;
    return playRingback();
  }, [isCaller, status, remoteOn]);

  // Meeting meta: participants roster, host permissions, remaining time.
  // Polls every 6s and refreshes immediately when a realtime event bumps
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
    // Poll fairly often so a kicked/muted participant reacts quickly even
    // without a realtime event.
    const iv = setInterval(load, 3000);
    return () => { alive = false; clearInterval(iv); };
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
    // Kicked → leave the meeting.
    if ((me.status === "removed" || me.status === "left") && !leftRef.current) {
      leftRef.current = true;
      playEndTone();
      roomRef.current?.disconnect();
      finish();
      return;
    }
    // Host muted/unmuted me → mirror it to my real mic (only on change, so a
    // self-toggle isn't overridden by a stale poll).
    if (prevMicRef.current !== null && me.micEnabled !== prevMicRef.current && me.micEnabled !== micOn) {
      roomRef.current?.localParticipant.setMicrophoneEnabled(me.micEnabled).catch(() => {});
      setMicOn(me.micEnabled);
      // Host silenced me → lock self-unmute until the host unmutes.
      setHostMuted(!me.micEnabled);
    }
    prevMicRef.current = me.micEnabled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, session?.id]);

  // Realtime call signaling: refresh the roster on participant/media events and
  // close the room when the backend auto-ends the meeting.
  useEffect(() => {
    // Reconnects with exponential backoff + jitter until the call ends or the
    // view unmounts (the roster poll covers the gaps); the token goes only in
    // the WS URL query.
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
        retry(); // WS unavailable → polling still refreshes meanwhile
        return;
      }
      ws = sock;
      sock.onopen = () => { attempt = 0; };
      sock.onmessage = (ev) => {
        if (!alive) return;
        let msg: { type?: string; event?: string; status_code?: number } = {};
        try { msg = JSON.parse(ev.data) as typeof msg; } catch { msg = {}; }
        const type = String(msg.type ?? msg.event ?? "");
        // Expired token: refresh, then reopen the socket with the new one.
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

  // Unblock remote audio (needs a user gesture on most browsers).
  async function enableSound() {
    const r = roomRef.current;
    if (!r) return;
    try { await r.startAudio(); } catch { /* ignore */ }
    setAudioBlocked(!r.canPlaybackAudio);
  }
  // Keep the backend roster in sync with my real mic/cam so others see it.
  function syncSelf(patch: { mic_enabled?: boolean; camera_enabled?: boolean }) {
    if (session?.id) { prevMicRef.current = patch.mic_enabled ?? prevMicRef.current; updateCallParticipant(roomId, callId, session.id, patch).catch(() => {}); }
  }
  async function toggleMic() {
    const r = roomRef.current;
    if (!r) return;
    // Host-muted participants can't turn their own mic back on.
    if (hostMuted && !micOn) return;
    void enableSound();
    const on = !micOn;
    await r.localParticipant.setMicrophoneEnabled(on);
    setMicOn(on);
    syncSelf({ mic_enabled: on });
  }
  async function toggleCam() {
    const r = roomRef.current;
    if (!r) return;
    void enableSound();
    const on = !camOn;
    try {
      const pub = await r.localParticipant.setCameraEnabled(on);
      setCamOn(on);
      if (on) {
        const vt = pub?.videoTrack ?? r.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
        if (vt && localRef.current) vt.attach(localRef.current);
      }
      syncSelf({ camera_enabled: on });
    } catch {
      /* camera unavailable/denied */
    }
  }
  // Host controls (gated by backend permissions).
  async function muteParticipant(userId: string, mute: boolean) {
    try {
      await updateCallParticipant(roomId, callId, userId, { mic_enabled: !mute });
      setMetaTick((n) => n + 1);
    } catch { /* ignore */ }
  }
  async function kickParticipant(userId: string) {
    // Optimistic: drop them from the roster immediately so the host doesn't
    // wait for the next poll.
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
  async function hangUp() {
    playEndTone();
    try {
      // Host ends the whole meeting; a participant just leaves it.
      if (isCaller) await endMeeting(roomId, callId).catch(() => endCall(callId));
      else await leaveCall(roomId, callId);
    } catch {
      /* ignore */
    }
    roomRef.current?.disconnect();
    finish();
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const statusLabel =
    status === "live" ? t("live") : status === "ringing" ? t("ringing") : status === "error" ? t("error") : t("connecting");

  return (
    <div className="callroom">
      <div className="callroom__meta">
        <span className="callroom__pcount"><IconUser />{t("participants", { count })}</span>
        {remaining != null ? <span className="callroom__timer">{t("remaining")}: {mmss(remaining)}</span> : null}
      </div>
      {audioBlocked ? (
        <button type="button" className="callroom__sound" onClick={enableSound}>
          {t("enableSound")}
        </button>
      ) : null}
      <div className="callroom__stage">
        {callType === "video" ? (
          <div ref={remoteRef} className="callroom__remote" />
        ) : (
          <div className="callroom__audio">
            <span className="callroom__avatar"><IconUser /></span>
            <div ref={remoteRef} style={{ display: "none" }} />
          </div>
        )}
        {!remoteOn ? (
          <div className="callroom__waiting">
            <span className="callroom__pulse" />
            <p>{statusLabel}</p>
          </div>
        ) : null}
        {callType === "video" ? (
          <video ref={localRef} className={`callroom__local${camOn ? "" : " off"}`} autoPlay playsInline muted />
        ) : null}
      </div>

      <div className="callroom__bar">
        <button
          className={`callroom__btn${micOn ? "" : " off"}`}
          type="button"
          onClick={toggleMic}
          aria-label={t("mic")}
          disabled={hostMuted && !micOn}
          title={hostMuted && !micOn ? t("mutedByHost") : t("mic")}
        >
          {micOn ? <IconMic /> : <IconMicOff />}
        </button>
        {callType === "video" ? (
          <button className={`callroom__btn${camOn ? "" : " off"}`} type="button" onClick={toggleCam} aria-label={t("cam")}>
            <IconVideo />
          </button>
        ) : null}
        <button className={`callroom__btn${rosterOpen ? " on" : ""}`} type="button" onClick={() => setRosterOpen((o) => !o)} aria-label={t("rosterTitle")}>
          <IconUsers />
        </button>
        <button className="callroom__btn callroom__btn--end" type="button" onClick={hangUp} aria-label={t("end")}>
          <IconClose />
        </button>
      </div>

      {rosterOpen ? (
        <div className="callroom__roster">
          <div className="callroom__rhead">
            <b>{t("rosterTitle")}</b>
            <button type="button" className="callroom__ix" onClick={() => setRosterOpen(false)} aria-label={t("close")}><IconClose /></button>
          </div>
          {perms?.canInvite ? (
            <div className="callroom__invrow">
              <SearchSelect
                value={invitePicks}
                onChange={setInvitePicks}
                onSearch={inviteSearch}
                placeholder={t("invitePick")}
                searchPlaceholder={t("invitePick")}
                emptyText={t("inviteEmpty")}
                ariaLabel={t("invite")}
              />
              <button type="button" className="callroom__invbtn" onClick={sendInvites} disabled={inviteBusy || !invitePicks.length}>
                <IconUserPlus />
                {inviteBusy ? t("inviteSending") : t("inviteSend")}
              </button>
            </div>
          ) : null}
          <div className="callroom__rlist">
            {roster.filter((p) => p.status !== "removed" && p.status !== "left" && p.status !== "declined").map((p) => {
              const self = p.userId === session?.id;
              const canHostAct = !self && p.role !== "host";
              return (
                <div className="callroom__row" key={p.userId}>
                  <span className="callroom__ravatar">{p.micEnabled ? <IconMic /> : <IconMicOff />}</span>
                  <div className="callroom__rm">
                    <b>{p.name || "—"}{self ? ` (${t("you")})` : ""}</b>
                    <span>{p.role === "host" ? t("hostLabel") : t.has(`pstatus.${p.status}`) ? t(`pstatus.${p.status}`) : p.status}</span>
                  </div>
                  {canHostAct && perms?.canMute ? (
                    p.micEnabled ? (
                      <button type="button" className="callroom__ract" onClick={() => muteParticipant(p.userId, true)}>{t("mute")}</button>
                    ) : (
                      <button type="button" className="callroom__ract" onClick={() => muteParticipant(p.userId, false)}>{t("unmute")}</button>
                    )
                  ) : null}
                  {canHostAct && perms?.canKick ? (
                    <button type="button" className="callroom__ract callroom__ract--danger" onClick={() => kickParticipant(p.userId)}>{t("removeParticipant")}</button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
