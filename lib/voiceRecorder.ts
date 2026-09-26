// Microphone-only recorder for chat voice notes.
//
// lexgo_frontend_doc_chat_update.md §"Voice message formati" asks for
// audio/webm;codecs=opus with an audio/mp4 family fallback for iOS/Safari —
// which is exactly what MediaRecorder negotiates below. This is deliberately
// NOT lib/meetingRecorder.ts: that one mixes a whole LiveKit room's tracks
// and saves the result to the recorder's own disk, while a voice note is one
// microphone, held for a few seconds, and uploaded.

export type VoiceNote = { blob: Blob; mime: string; durationMs: number };

// Ordered best-first. The backend accepts .webm/.ogg/.mp3/.m4a/.wav/.mp4, so
// every candidate here has a home on the other side.
const CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/aac",
];

export function canRecordVoice(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* Safari throws on some strings rather than answering false */
    }
  }
  return "";
}

export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  // cancel() can land while start() is still inside getUserMedia — the
  // permission prompt is modal and the component behind it can unmount. The
  // stream that arrives afterwards must then be thrown away immediately,
  // or the browser keeps showing "this tab is using your microphone".
  private dead = false;
  // components/VoicePill.tsx draws a live waveform while recording. It must
  // NOT open a second getUserMedia stream for that: two streams mean two
  // recording indicators, and some Android builds simply fail the second
  // acquisition. So the analyser hangs off the one stream this recorder
  // already holds — created on demand, torn down with it in release().
  private ac: AudioContext | null = null;
  private meter: AnalyserNode | null = null;

  // Must be called from a user gesture — iOS refuses the microphone
  // otherwise, and the permission prompt is the first thing the user sees.
  async start(): Promise<void> {
    if (this.rec || this.dead) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (this.dead) {
      for (const t of stream.getTracks()) t.stop();
      return;
    }
    this.stream = stream;
    const mime = pickMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    this.chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.rec = rec;
    this.startedAt = Date.now();
    // 1s timeslices: without them Safari can deliver nothing at all until
    // stop(), and a tab killed mid-recording would leave an empty note.
    rec.start(1000);
  }

  get active(): boolean {
    return !!this.rec;
  }

  // How long the current recording has been running. stop() measures the
  // note's durationMs from the same instant, so a timer fed from here cannot
  // disagree with the duration that ends up on the attachment.
  get elapsedMs(): number {
    return this.rec ? Date.now() - this.startedAt : 0;
  }

  // The live level of the microphone this recorder is already holding, for a
  // meter or a waveform. null when there is no stream yet (start() has not
  // resolved, or it was refused) or the browser has no Web Audio — a caller
  // then draws a flat line rather than failing.
  analyser(fftSize = 1024): AnalyserNode | null {
    if (this.meter) return this.meter;
    const stream = this.stream;
    if (!stream) return null;
    const win = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = win.AudioContext || win.webkitAudioContext;
    if (!Ctx) return null;
    try {
      const ac = new Ctx();
      // Safari hands back a suspended context even inside a gesture.
      if (ac.state === "suspended") void ac.resume().catch(() => {});
      const meter = ac.createAnalyser();
      meter.fftSize = fftSize;
      meter.smoothingTimeConstant = 0.55;
      // Deliberately never connected to ac.destination: that would play the
      // microphone straight back out of the speakers.
      ac.createMediaStreamSource(stream).connect(meter);
      this.ac = ac;
      this.meter = meter;
      return meter;
    } catch {
      return null;
    }
  }

  private release() {
    this.meter = null;
    const ac = this.ac;
    this.ac = null;
    void ac?.close().catch(() => {});
    for (const t of this.stream?.getTracks() || []) t.stop();
    this.stream = null;
    this.rec = null;
  }

  // Resolves with the note, or null if nothing was captured. Never rejects —
  // a failed recording must not take the chat down with it.
  async stop(): Promise<VoiceNote | null> {
    const rec = this.rec;
    if (!rec) return null;
    const durationMs = Date.now() - this.startedAt;
    const mime = rec.mimeType || pickMime() || "audio/webm";
    const done = new Promise<VoiceNote | null>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        const blob = this.chunks.length ? new Blob(this.chunks, { type: mime }) : null;
        this.chunks = [];
        this.release();
        resolve(blob && blob.size ? { blob, mime, durationMs } : null);
      };
      rec.onstop = finish;
      rec.onerror = finish;
      // Safari can skip onstop after a requestData(); same guard
      // lib/meetingRecorder.ts carries for the meeting case.
      setTimeout(finish, 2500);
    });
    try {
      rec.stop();
    } catch {
      /* already stopped — the timeout above still settles it */
    }
    return done;
  }

  // Throw the recording away (user tapped the bin, or left the screen).
  cancel(): void {
    this.dead = true;
    const rec = this.rec;
    this.chunks = [];
    try {
      rec?.stop();
    } catch {
      /* ignore */
    }
    this.release();
  }
}

// "0:07" — voice notes are seconds long, so minutes:seconds is enough.
export function voiceDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
