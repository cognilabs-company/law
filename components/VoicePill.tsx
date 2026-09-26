"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as RKeyboardEvent,
  type PointerEvent as RPointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import { VoiceRecorder, voiceDuration, type VoiceNote } from "@/lib/voiceRecorder";
import { IconChevronLeft, IconMic, IconSquare } from "@/components/icons";

// The voice-message control: a round mic that opens leftward into a pill
// while it records, showing the running clock and a live waveform of the real
// microphone. Press-and-hold and release to keep the note, slide left past
// the threshold to throw it away, or tap once to start and tap again to stop.
// Space/Enter toggle it and Escape cancels, for the keyboard.
//
// It drives lib/voiceRecorder.ts and hands the finished VoiceNote straight to
// onRecorded — the same contract AttachmentPicker's old button had. A
// cancelled recording reports nothing at all, and its microphone is released.

// A press shorter than this was a tap: the recording stays on and the next
// tap stops it. Anything longer is a hold, and letting go stops and keeps.
const TAP_MS = 320;
// Slide the pill this far left and the note is discarded.
const CANCEL_PX = 72;
// Where the pill stops following the pointer, so the gesture has an end.
const DRAG_MAX = 104;
const BAR_W = 3;
const BAR_STEP = 5;
// One bar every ~55ms, so the waveform scrolls at the same speed on a 60Hz
// and on a 120Hz display.
const FRAME_MS = 55;
// A voice note is seconds long. This exists only so a recording nobody
// stopped cannot run until the tab dies.
const CAP_MS = 5 * 60 * 1000;
// A little more history than the widest pill can show.
const BAR_KEEP = 96;

// One bar = the envelope of the microphone over one frame. RMS alone reads
// almost flat for speech, so the peak is mixed back in.
// Uint8Array<ArrayBuffer>, not a bare Uint8Array: getByteTimeDomainData
// refuses a view that might sit on a SharedArrayBuffer.
function levelOf(an: AnalyserNode | null, buf: Uint8Array<ArrayBuffer> | null): number {
  if (!an || !buf) return 0;
  try {
    an.getByteTimeDomainData(buf);
  } catch {
    // The audio context can already be closed if stop() won the race with
    // this frame.
    return 0;
  }
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / buf.length);
  return Math.min(1, rms * 2.6 + peak * 0.7);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, w / 2);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

// Newest bar at the right edge, older ones marching left and fading out, so
// the tail dissolves instead of being chopped off by the pill edge.
function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number,
  bars: number[],
  color: string,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (color) ctx.fillStyle = color;
  const mid = h / 2;
  const tall = h - 2;
  const fadeOver = Math.max(1, w * 0.42);
  for (let i = bars.length - 1, x = w - BAR_W; i >= 0 && x > -BAR_W; i--, x -= BAR_STEP) {
    const lv = bars[i];
    const bh = Math.max(BAR_W, lv * tall);
    ctx.globalAlpha = Math.min(1, (x + BAR_W) / fadeOver) * (0.5 + 0.5 * lv);
    bar(ctx, x, mid - bh / 2, BAR_W, bh);
  }
  ctx.globalAlpha = 1;
}

export default function VoicePill({
  onRecorded,
  onError,
  disabled = false,
  maxMs = CAP_MS,
  className = "",
}: {
  // Called once per kept recording — never for a cancelled one.
  onRecorded: (note: VoiceNote) => void;
  // "" clears a previous message, as the attachment row expects.
  onError?: (msg: string) => void;
  disabled?: boolean;
  maxMs?: number;
  className?: string;
}) {
  const t = useTranslations("voicePill");
  // The elapsed-time wording the control this replaced already had.
  const tn = useTranslations("portal.client.newDoc");
  const [on, setOn] = useState(false);
  const [ms, setMs] = useState(0);
  const [drag, setDrag] = useState(0);

  const recRef = useRef<VoiceRecorder | null>(null);
  // start() and stop() both await; a second gesture landing inside either of
  // them must do nothing rather than open a second microphone.
  const busyRef = useRef(false);
  const pressRef = useRef<{ at: number; x: number; own: boolean } | null>(null);
  // Assistive tech activates a button with a bare click, so onClick has to
  // work too — but it must not fire again right after a pointer or key
  // gesture already handled the same activation.
  const actedRef = useRef(0);
  const dragRef = useRef(0);
  const barsRef = useRef<number[]>([]);
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const colRef = useRef("");
  // The parents pass inline arrows, so keeping the callbacks in a ref is what
  // lets finish() stay stable — and a stable finish() is what stops the
  // auto-stop timer below from being restarted by every parent render.
  const cbRef = useRef({ onRecorded, onError });
  useEffect(() => {
    cbRef.current = { onRecorded, onError };
  }, [onRecorded, onError]);

  const reset = useCallback(() => {
    setOn(false);
    setDrag(0);
    dragRef.current = 0;
    pressRef.current = null;
    barsRef.current = [];
  }, []);

  // Stop and keep: the note goes to the parent, the microphone is released.
  const finish = useCallback(async () => {
    const rec = recRef.current;
    if (!rec || busyRef.current) return;
    busyRef.current = true;
    reset();
    let note: VoiceNote | null = null;
    try {
      note = await rec.stop();
    } finally {
      recRef.current = null;
      busyRef.current = false;
    }
    if (note) cbRef.current.onRecorded(note);
  }, [reset]);

  // Throw it away: cancel() drops the chunks and stops the stream tracks, so
  // nothing is attached and the browser recording indicator goes out.
  const abort = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    reset();
    rec?.cancel();
  }, [reset]);

  const begin = useCallback(async () => {
    if (recRef.current || busyRef.current) return;
    busyRef.current = true;
    cbRef.current.onError?.("");
    const next = new VoiceRecorder();
    // Stored before the await: the permission prompt is modal, and an unmount
    // behind it must be able to cancel a recorder that has not started yet.
    recRef.current = next;
    try {
      // Inside the gesture: iOS only grants the microphone from one.
      await next.start();
    } catch {
      recRef.current = null;
      busyRef.current = false;
      cbRef.current.onError?.(t("denied"));
      return;
    }
    busyRef.current = false;
    if (!next.active) {
      recRef.current = null;
      return;
    }
    barsRef.current = [];
    setMs(0);
    setOn(true);
  }, [t]);

  // Leaving with the mic open would keep the browser recording indicator on.
  useEffect(() => () => recRef.current?.cancel(), []);

  // The clock reads the recorder itself, so it always matches the duration
  // that will be stamped on the note.
  useEffect(() => {
    if (!on) return;
    const iv = setInterval(() => setMs(recRef.current?.elapsedMs ?? 0), 200);
    return () => clearInterval(iv);
  }, [on]);

  useEffect(() => {
    if (!on) return;
    const to = setTimeout(() => void finish(), maxMs);
    return () => clearTimeout(to);
  }, [on, maxMs, finish]);

  const cancelling = drag >= CANCEL_PX;

  // The bar colour lives in CSS with the rest of the palette. This reads it
  // back after the commit that changed the class, so the canvas never paints
  // a frame in the previous state colour.
  useEffect(() => {
    const cv = cvRef.current;
    if (cv) colRef.current = getComputedStyle(cv).color;
  }, [on, cancelling]);

  useEffect(() => {
    if (!on) return;
    const cv = cvRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const an = recRef.current?.analyser() ?? null;
    const buf = an ? new Uint8Array(an.fftSize) : null;
    const bars = barsRef.current;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last >= FRAME_MS) {
        last = now;
        bars.push(levelOf(an, buf));
        if (bars.length > BAR_KEEP) bars.splice(0, bars.length - BAR_KEEP);
      }
      // The pill is still widening over the first frames, so the box is
      // re-measured every frame rather than once.
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (cv.width !== pw) cv.width = pw;
      if (cv.height !== ph) cv.height = ph;
      paint(ctx, w, h, dpr, bars, colRef.current);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  function down(e: RPointerEvent<HTMLButtonElement>) {
    // pointerdown fires for every button. Without this a right-click starts
    // getUserMedia behind the context menu and the release never stops it —
    // the microphone light stays on with no pill on screen.
    if (e.button !== 0) return;
    if (disabled || busyRef.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured; the drag then ends on leave.
    }
    const own = !recRef.current;
    pressRef.current = { at: Date.now(), x: e.clientX, own };
    dragRef.current = 0;
    setDrag(0);
    if (own) void begin();
  }

  function move(e: RPointerEvent<HTMLButtonElement>) {
    const press = pressRef.current;
    if (!press) return;
    const dx = Math.max(0, Math.min(DRAG_MAX, press.x - e.clientX));
    dragRef.current = dx;
    setDrag(dx);
  }

  function up(e: RPointerEvent<HTMLButtonElement>) {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Nothing was captured.
    }
    actedRef.current = Date.now();
    const dx = dragRef.current;
    dragRef.current = 0;
    setDrag(0);
    if (dx >= CANCEL_PX) {
      abort();
      return;
    }
    // The microphone can still be behind the permission prompt; leave the
    // recording to the next tap rather than trying to stop something that
    // has not started yet.
    if (busyRef.current) return;
    // A short press is a tap: the one that started the recording leaves it
    // running, and the next tap stops it.
    if (press.own && Date.now() - press.at < TAP_MS) return;
    void finish();
  }

  function key(e: RKeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape") {
      if (!recRef.current) return;
      e.preventDefault();
      abort();
      return;
    }
    if (e.key !== " " && e.key !== "Enter") return;
    // Also stops the synthetic click the browser fires afterwards.
    e.preventDefault();
    if (e.repeat || busyRef.current) return;
    actedRef.current = Date.now();
    if (recRef.current) void finish();
    else void begin();
  }

  function click() {
    if (Date.now() - actedRef.current < 600) return;
    if (disabled || busyRef.current) return;
    if (recRef.current) void finish();
    else void begin();
  }

  const fade = Math.min(1, drag / CANCEL_PX);
  const clock = voiceDuration(ms);
  const cls = `vpill${on ? " vpill--on" : ""}${cancelling ? " vpill--cancel" : ""}${className ? ` ${className}` : ""}`;

  return (
    <div className={cls} style={{ "--vp-drag": `${-drag}px`, "--vp-fade": fade.toFixed(3) } as CSSProperties}>
      {/* The pill itself. Hidden from assistive tech: the button carries the
          label, and the live region below announces the state change. */}
      <span className="vpill__track" aria-hidden="true">
        <span className="vpill__body">
          <span className="vpill__dot" />
          <span className="vpill__time">{clock}</span>
          <canvas className="vpill__wave" ref={cvRef} />
        </span>
        <span className="vpill__hint">
          <IconChevronLeft />
          {t("cancel")}
        </span>
      </span>
      <button
        type="button"
        className="vpill__btn"
        aria-label={on ? t("stop") : t("start")}
        aria-pressed={on}
        title={on ? t("slide") : t("start")}
        disabled={disabled}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      onLostPointerCapture={up}
        onKeyDown={key}
        onClick={click}
      >
        <span className="vpill__g vpill__g--mic">
          <IconMic />
        </span>
        <span className="vpill__g vpill__g--stop">
          <IconSquare />
        </span>
      </button>
      {/* The clock on the pill is aria-hidden decoration; without this a
          screen-reader user would have no idea how long they had been
          recording. The control this replaced carried the time in its own
          label ("To’xtatish · 0:07"), so that string is reused here.
          aria-live is polite, and the text only changes once a second. */}
      <span className="vpill__sr" role="status" aria-live="polite">
        {on ? tn("voiceStop", { time: clock }) : ""}
      </span>
    </div>
  );
}
