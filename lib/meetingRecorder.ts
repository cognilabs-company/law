// Local meeting recording (audio of everyone in the room). The mix is built in
// the browser: my microphone + every remote audio track → AudioContext →
// MediaRecorder. Nothing is uploaded; the file is offered for download / share
// on the recorder's own device (desktop, Android, iOS via the share sheet).
import { RoomEvent, Track, type Room, type RemoteTrack } from "livekit-client";

export type RecordingFile = { blob: Blob; mime: string; ext: string; durationMs: number };

function pickMime(): { mime: string; ext: string } {
  const cands: [string, string][] = [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/webm", "webm"],
    ["audio/mp4", "m4a"], // Safari / iOS
    ["audio/ogg;codecs=opus", "ogg"],
  ];
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
  for (const [mime, ext] of cands) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return { mime: "", ext: "webm" };
}

export const canRecord = () => typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);

export class MeetingRecorder {
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private sources = new Map<string, MediaStreamAudioSourceNode>();
  private startedAt = 0;
  private mime = "";
  private ext = "webm";
  private off: (() => void) | null = null;

  get active() { return !!this.rec && this.rec.state === "recording"; }

  private addTrack(id: string, mst: MediaStreamTrack | undefined) {
    if (!this.ctx || !this.dest || !mst || this.sources.has(id) || mst.kind !== "audio") return;
    try {
      const src = this.ctx.createMediaStreamSource(new MediaStream([mst]));
      src.connect(this.dest);
      this.sources.set(id, src);
    } catch { /* a track that cannot be mixed is skipped */ }
  }
  private removeTrack(id: string) {
    const s = this.sources.get(id);
    if (!s) return;
    try { s.disconnect(); } catch { /* ignore */ }
    this.sources.delete(id);
  }

  start(room: Room): void {
    if (this.active) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    this.dest = this.ctx.createMediaStreamDestination();
    // My microphone.
    const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
    this.addTrack("local", mic);
    // Everyone already in the room.
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) if (pub.track) this.addTrack(pub.trackSid, pub.track.mediaStreamTrack);
    }
    // People who join / leave while recording.
    const onSub = (track: RemoteTrack) => { if (track.kind === Track.Kind.Audio) this.addTrack(track.sid || String(Date.now()), track.mediaStreamTrack); };
    const onUnsub = (track: RemoteTrack) => { this.removeTrack(track.sid || ""); };
    const onLocalPub = () => { const m = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack; this.removeTrack("local"); this.addTrack("local", m); };
    room.on(RoomEvent.TrackSubscribed, onSub).on(RoomEvent.TrackUnsubscribed, onUnsub).on(RoomEvent.LocalTrackPublished, onLocalPub);
    this.off = () => { room.off(RoomEvent.TrackSubscribed, onSub).off(RoomEvent.TrackUnsubscribed, onUnsub).off(RoomEvent.LocalTrackPublished, onLocalPub); };

    const { mime, ext } = pickMime();
    this.mime = mime;
    this.ext = ext;
    this.chunks = [];
    this.rec = mime ? new MediaRecorder(this.dest.stream, { mimeType: mime, audioBitsPerSecond: 96_000 }) : new MediaRecorder(this.dest.stream);
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.start(1000); // 1 s chunks — a crash still leaves most of the recording
    this.startedAt = Date.now();
  }

  // Resolves with the finished file once the recorder has flushed.
  stop(): Promise<RecordingFile | null> {
    const rec = this.rec;
    if (!rec) return Promise.resolve(null);
    return new Promise((resolve) => {
      const finish = () => {
        const blob = new Blob(this.chunks, { type: this.mime || rec.mimeType || "audio/webm" });
        const out = { blob, mime: blob.type, ext: this.ext, durationMs: Date.now() - this.startedAt };
        this.cleanup();
        resolve(out.blob.size ? out : null);
      };
      rec.onstop = finish;
      try { if (rec.state !== "inactive") rec.stop(); else finish(); } catch { finish(); }
    });
  }

  private cleanup() {
    this.off?.();
    this.off = null;
    for (const id of [...this.sources.keys()]) this.removeTrack(id);
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.dest = null;
    this.rec = null;
  }
  dispose() { if (this.rec) { try { this.rec.stop(); } catch { /* ignore */ } } this.cleanup(); }
}

// Save on this device: iOS/Android share sheet when files can be shared, else a
// download link; as a last resort the file opens in a new tab.
export async function saveRecording(file: RecordingFile, baseName: string): Promise<"shared" | "downloaded" | "opened"> {
  const name = `${baseName.replace(/[^\w\d-]+/g, "_").slice(0, 40) || "meeting"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${file.ext}`;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    const f = new File([file.blob], name, { type: file.mime || "application/octet-stream" });
    if (nav.share && nav.canShare && nav.canShare({ files: [f] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      await nav.share({ files: [f], title: name });
      return "shared";
    }
  } catch { /* user cancelled or unsupported → download */ }
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
