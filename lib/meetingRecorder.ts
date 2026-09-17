// Local meeting recording — never uploaded, saved on the recorder's own
// device. Two modes:
//  • "audio": my microphone + every remote audio track, mixed in an
//    AudioContext → MediaRecorder (webm/opus, or mp4 on Safari/iOS);
//  • "screen": the same mixed audio plus a video of what the meeting shows —
//    every <video> tile inside the stage is composited onto a canvas at 15 fps
//    (works on phones too; no screen-picker prompt, nothing outside the
//    meeting is captured) → MediaRecorder (webm vp8/vp9 + opus, mp4 on Safari).
import { RoomEvent, Track, type Room, type RemoteTrack } from "livekit-client";

export type RecordingMode = "audio" | "screen";
export type RecordingFile = { blob: Blob; mime: string; ext: string; durationMs: number; mode: RecordingMode };

function pickMime(mode: RecordingMode): { mime: string; ext: string } {
  const cands: [string, string][] = mode === "screen"
    ? [["video/webm;codecs=vp9,opus", "webm"], ["video/webm;codecs=vp8,opus", "webm"], ["video/webm", "webm"], ["video/mp4", "mp4"]]
    : [["audio/webm;codecs=opus", "webm"], ["audio/webm", "webm"], ["audio/mp4", "m4a"], ["audio/ogg;codecs=opus", "ogg"]];
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: mode === "screen" ? "webm" : "webm" };
  for (const [mime, ext] of cands) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return { mime: "", ext: mode === "screen" ? "webm" : "webm" };
}

export const canRecord = () =>
  typeof window !== "undefined" &&
  typeof MediaRecorder !== "undefined" &&
  !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
export const canRecordScreen = () => canRecord() && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;

export class MeetingRecorder {
  readonly mode: RecordingMode;
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private sources = new Map<string, MediaStreamAudioSourceNode>();
  private startedAt = 0;
  private mime = "";
  private ext = "webm";
  private off: (() => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private raf: ReturnType<typeof setInterval> | undefined;
  private stage: HTMLElement | null = null;

  constructor(mode: RecordingMode) { this.mode = mode; }
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

  // Draw every video tile of the meeting stage into the canvas (same layout).
  private paint() {
    const c = this.canvas;
    const stage = this.stage;
    if (!c || !stage) return;
    const g = c.getContext("2d");
    if (!g) return;
    const box = stage.getBoundingClientRect();
    if (c.width !== Math.round(box.width) || c.height !== Math.round(box.height)) {
      c.width = Math.max(2, Math.round(box.width));
      c.height = Math.max(2, Math.round(box.height));
    }
    g.fillStyle = "#0B1F45";
    g.fillRect(0, 0, c.width, c.height);
    const vids = Array.from(stage.querySelectorAll<HTMLVideoElement>("video"));
    for (const v of vids) {
      if (!v.videoWidth || v.readyState < 2) continue;
      const r = v.getBoundingClientRect();
      const x = r.left - box.left, y = r.top - box.top, w = r.width, h = r.height;
      if (w < 2 || h < 2) continue;
      // object-fit: cover / contain, as the tile shows it.
      const fit = getComputedStyle(v).objectFit;
      const vr = v.videoWidth / v.videoHeight, br = w / h;
      let dw = w, dh = h;
      if (fit === "contain" ? vr > br : vr < br) { dh = fit === "contain" ? w / vr : h; dw = fit === "contain" ? w : h * vr; }
      else { dw = fit === "contain" ? h * vr : w; dh = fit === "contain" ? h : w / vr; }
      const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      const mirrored = /scaleX\(-1\)/.test(v.style.transform || "");
      if (mirrored) { g.translate(dx + dw, dy); g.scale(-1, 1); g.drawImage(v, 0, 0, dw, dh); }
      else g.drawImage(v, dx, dy, dw, dh);
      g.restore();
    }
  }

  start(room: Room, stage?: HTMLElement | null): void {
    if (this.active) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    this.dest = this.ctx.createMediaStreamDestination();
    // My microphone.
    this.addTrack("local", room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack);
    // Everyone already in the room.
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) if (pub.track) this.addTrack(pub.trackSid, pub.track.mediaStreamTrack);
    }
    // People who join / leave while recording; my mic re-published (device switch).
    const onSub = (track: RemoteTrack) => { if (track.kind === Track.Kind.Audio) this.addTrack(track.sid || String(Date.now()), track.mediaStreamTrack); };
    const onUnsub = (track: RemoteTrack) => { this.removeTrack(track.sid || ""); };
    const onLocalPub = () => { this.removeTrack("local"); this.addTrack("local", room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack); };
    room.on(RoomEvent.TrackSubscribed, onSub).on(RoomEvent.TrackUnsubscribed, onUnsub).on(RoomEvent.LocalTrackPublished, onLocalPub);
    this.off = () => { room.off(RoomEvent.TrackSubscribed, onSub).off(RoomEvent.TrackUnsubscribed, onUnsub).off(RoomEvent.LocalTrackPublished, onLocalPub); };

    const tracks: MediaStreamTrack[] = [...this.dest.stream.getAudioTracks()];
    if (this.mode === "screen") {
      this.stage = stage ?? null;
      this.canvas = document.createElement("canvas");
      this.canvas.width = 1280;
      this.canvas.height = 720;
      this.paint();
      this.raf = setInterval(() => this.paint(), 1000 / 15);
      const cs = this.canvas.captureStream(15);
      tracks.push(...cs.getVideoTracks());
    }
    const { mime, ext } = pickMime(this.mode);
    this.mime = mime;
    this.ext = ext;
    this.chunks = [];
    const stream = new MediaStream(tracks);
    const opts: MediaRecorderOptions = mime ? { mimeType: mime, audioBitsPerSecond: 96_000, ...(this.mode === "screen" ? { videoBitsPerSecond: 2_500_000 } : {}) } : {};
    this.rec = new MediaRecorder(stream, opts);
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.start(1000); // 1 s chunks — a crash still leaves most of the recording
    this.startedAt = Date.now();
  }

  // Resolves with the finished file once the recorder has flushed.
  stop(): Promise<RecordingFile | null> {
    const rec = this.rec;
    if (!rec) { this.cleanup(); return Promise.resolve(null); }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        const blob = new Blob(this.chunks, { type: this.mime || rec.mimeType || (this.mode === "screen" ? "video/webm" : "audio/webm") });
        const out: RecordingFile = { blob, mime: blob.type, ext: this.ext, durationMs: Date.now() - this.startedAt, mode: this.mode };
        this.cleanup();
        resolve(out.blob.size ? out : null);
      };
      rec.onstop = finish;
      rec.onerror = finish;
      // Safari can skip onstop after requestData; never hang the UI.
      setTimeout(finish, 2500);
      try { if (rec.state !== "inactive") rec.stop(); else finish(); } catch { finish(); }
    });
  }

  private cleanup() {
    this.off?.();
    this.off = null;
    clearInterval(this.raf);
    this.raf = undefined;
    for (const id of [...this.sources.keys()]) this.removeTrack(id);
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.dest = null;
    this.rec = null;
    this.canvas = null;
    this.stage = null;
  }
  dispose() { if (this.rec) { try { this.rec.stop(); } catch { /* ignore */ } } this.cleanup(); }
}

const fileName = (file: RecordingFile, baseName: string) =>
  `${baseName.replace(/[^\w\d-]+/g, "_").slice(0, 40) || "meeting"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${file.ext}`;

// Save on this device. iOS/Android: the share sheet (Files, Telegram…) when the
// browser can share files; otherwise a download link; as a last resort the
// file opens in a new tab where the browser's own share/save works.
export async function saveRecording(file: RecordingFile, baseName: string): Promise<"shared" | "downloaded" | "opened"> {
  const name = fileName(file, baseName);
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile) {
    try {
      const f = new File([file.blob], name, { type: file.mime || "application/octet-stream" });
      if (nav.share && nav.canShare && nav.canShare({ files: [f] })) {
        await nav.share({ files: [f], title: name });
        return "shared";
      }
    } catch (e) {
      // AbortError = the user closed the sheet; anything else → fall through to download.
      if (e instanceof DOMException && e.name === "AbortError") throw e;
    }
  }
  const url = URL.createObjectURL(file.blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return "downloaded";
  } catch {
    window.open(url, "_blank", "noopener");
    return "opened";
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }
}
