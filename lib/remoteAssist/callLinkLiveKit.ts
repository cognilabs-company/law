import { RoomEvent, ScreenSharePresets, Track, type LocalTrackPublication, type RemoteParticipant, type Room } from "livekit-client";
import { RA_MARK_TOPIC, encodeRaWire, parseRaWire } from "./marks";
import { clearRaLink, setRaLink, type RaLink } from "./callLink";

// The LiveKit side of the remote-assistance link (see callLink.ts), imported
// only by CallRoom.

type SharePolicy = { fps: number; maxBitrate: number } | null;

export function liveKitLink(room: Room, policy: SharePolicy): RaLink {
  const screenPub = (): LocalTrackPublication | undefined => room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  const surfaceOf = (pub: LocalTrackPublication | undefined): string => {
    const settings = pub?.track?.mediaStreamTrack?.getSettings() as (MediaTrackSettings & { displaySurface?: string }) | undefined;
    return settings?.displaySurface ?? "";
  };
  const peer = (identity: string): RemoteParticipant | undefined => room.remoteParticipants.get(identity) ?? Array.from(room.remoteParticipants.values()).find((p) => p.identity === identity);
  return {
    self: () => room.localParticipant.identity,
    send: (msg) => {
      room.localParticipant.publishData(encodeRaWire(msg), { reliable: true, topic: RA_MARK_TOPIC }).catch(() => {});
    },
    onWire: (fn) => {
      const on = (payload: Uint8Array, p?: RemoteParticipant, _k?: unknown, topic?: string) => {
        if (topic !== RA_MARK_TOPIC) return;
        const msg = parseRaWire(payload);
        if (msg) fn(msg, p?.identity ?? "");
      };
      room.on(RoomEvent.DataReceived, on);
      return () => {
        room.off(RoomEvent.DataReceived, on);
      };
    },
    onChange: (fn) => {
      const events = [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ParticipantDisconnected, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished] as const;
      for (const e of events) room.on(e, fn);
      return () => {
        for (const e of events) room.off(e, fn);
      };
    },
    // The same budget CallRoom's own share button uses (quality policy).
    startShare: async () => {
      const base = ScreenSharePresets.h1080fps15.resolution;
      const pub = await room.localParticipant.setScreenShareEnabled(
        true,
        {
          audio: false,
          contentHint: "detail",
          resolution: policy && policy.fps > 0 ? { ...base, frameRate: policy.fps } : base,
          video: { displaySurface: "browser" },
          preferCurrentTab: true,
          selfBrowserSurface: "include",
          surfaceSwitching: "exclude",
        },
        policy && policy.maxBitrate > 0 ? { screenShareEncoding: { maxBitrate: policy.maxBitrate, maxFramerate: policy.fps } } : undefined,
      );
      return surfaceOf(pub ?? screenPub());
    },
    stopShare: async () => {
      await room.localParticipant.setScreenShareEnabled(false);
    },
    setShareHidden: async (hidden) => {
      const pub = screenPub();
      if (!pub) return;
      if (hidden && !pub.isMuted) await pub.mute();
      else if (!hidden && pub.isMuted) await pub.unmute();
    },
    localShare: () => {
      const pub = screenPub();
      return { on: !!pub?.track, hidden: !!pub?.isMuted, surface: surfaceOf(pub) };
    },
    remoteShare: (identity) => {
      const pub = peer(identity)?.getTrackPublication(Track.Source.ScreenShare);
      const track = pub?.track;
      return {
        video: track ? { attach: (el) => void track.attach(el), detach: (el) => void track.detach(el) } : null,
        muted: !!pub?.isMuted,
      };
    },
  };
}


export function setRaCallRoom(room: Room, policy: SharePolicy): void {
  setRaLink(room, liveKitLink(room, policy));
}

export function clearRaCallRoom(room: Room): void {
  clearRaLink(room);
}
