"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as RKeyboardEvent,
  type PointerEvent as RPointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import { IconPlay, IconPause, IconEye, IconFileText, IconImage } from "@/components/icons";

// What the client just attached, playable and viewable without leaving the
// form. These are still local File/Blob objects — nothing has been uploaded
// yet — so a blob: URL is all a preview needs and it costs no request.
//
// The URL is minted inside the click that asks for it, never during render
// and never in an effect: a blob URL pins the whole file in memory until it
// is revoked, so it must be created exactly once per press (StrictMode
// renders twice) and released on unmount. Each row is keyed by name+size, so
// a replaced file remounts and the old URL goes with it.
function useLazyBlobUrl(): { url: string; open: (b: Blob) => void } {
  const [url, setUrl] = useState("");
  // Cleanup only — no setState here. `url` goes "" → value exactly once, so
  // the first run's cleanup is a no-op and the unmount revokes the real one.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return {
    url,
    open(b: Blob) {
      // Minted inside the press that asked for it: never during render, so a
      // StrictMode double render cannot leak a second one.
      setUrl((cur) => cur || URL.createObjectURL(b));
    },
  };
}

export const isImage = (f: File) => /^image\//i.test(f.type) || /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(f.name);
export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
export const canPreview = (f: File) => isImage(f) || isPdf(f);

// ═══════════════ The voice-note player ═══════════════
//
// Used in exactly two places — the "listen back to what I just recorded,
// before I send it" row of the order form (VoicePlayer below) and the voice
// bubble in components/chat/SecureChat.tsx. Both used to hand the browser a
// bare <audio controls>: a 38px slab of Chrome's own chrome that matches
// nothing else on the page, and inside a gradient "my" bubble it sat on blue
// looking like a foreign object. It is ONE component rather than two because
// the only genuinely hard part — a MediaRecorder blob whose duration is
// Infinity until it is probed — is a thing you want to get right once.
//
// The chat imports it from here rather than the other way round: this file is
// forty lines of attachment presentation, SecureChat.tsx is thirteen hundred
// lines of sockets and calls, and a player is presentation.

// How many bars the strip draws. Measured: the strip gets 150–210px in the
// order form and 118–150px in a chat bubble, so 24 bars leaves 2–3px of bar
// with a 2px gap — the thinnest bar that still reads as a bar at 1x.
const BARS = 24;
// The progress sampler's gate, in ms. `timeupdate` fires about four times a
// second in Chrome, which moves the boundary of a 200px strip in ~2.5px jerks
// on a ten-second note; 80ms is twelve samples a second, below the ~100ms at
// which the step becomes visible, and an eighth of the renders a raw
// requestAnimationFrame loop would cost.
const TICK_MS = 80;

// The bar heights. There is no real peak data to draw here: decoding every
// note in a long chat through decodeAudioData would mean an AudioContext per
// bubble and browsers cap those at six, so the strip is a stylised envelope —
// hashed (FNV-1a, then an xorshift walk) from the note's own identity so it
// is stable across re-renders and different from note to note. What it does
// NOT fake is the position: the played/unplayed boundary below is real
// currentTime/duration, and the strip is a real slider.
function envelope(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h ^= h >>> 13;
    const r = ((h >>> 0) % 1000) / 1000;
    // A half-sine over the strip: speech starts and ends quieter than its
    // middle, and a rectangle of random bars reads as a barcode instead.
    const arc = 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / n);
    out.push(0.22 + 0.78 * r * arc);
  }
  return out;
}

// "0:07". Floor rather than round, because a counter that shows 0:01 half a
// second in is ahead of the sound. Anything that is not a finite positive
// number reads 0:00 — Chrome reports duration Infinity for a MediaRecorder
// blob until it has been probed, and "NaN:aN" is exactly what a naive
// template prints for that.
function clock(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Only one note may sound at a time. A chat screen can hold a dozen of them
// and two playing at once is noise, so the element that starts pauses
// whichever was already going. Module scope on purpose: the order form and
// the chat then share the one rule even though they are different trees.
let sounding: HTMLAudioElement | null = null;

export function VoiceNotePlayer({
  // "" until the caller has a URL: the order form mints its blob URL inside
  // the first press (see useLazyBlobUrl), the chat fetches the bytes with the
  // bearer token first. Either way the press that found no src asks for one
  // and playback starts as soon as it arrives.
  src,
  onNeedSrc,
  playLabel,
  pauseLabel,
  seekLabel,
  seed = "",
  className = "",
}: {
  src: string;
  onNeedSrc?: () => void;
  playLabel: string;
  pauseLabel: string;
  seekLabel: string;
  seed?: string;
  className?: string;
}) {
  const [on, setOn] = useState(false);
  const [pos, setPos] = useState(0);
  // 0 means "not known yet", which is the honest state for a fresh
  // MediaRecorder blob and the state in which seeking is refused.
  const [dur, setDur] = useState(0);
  const ref = useRef<HTMLAudioElement>(null);
  const waveRef = useRef<HTMLSpanElement>(null);
  // 0 not tried · 1 probing · 2 settled. See meta() for what the probe is.
  const probe = useRef<0 | 1 | 2>(0);
  const bars = useMemo(() => envelope(seed, BARS), [seed]);

  // The <audio> only exists once the URL does, so a first press that had to
  // ask for one has to start playback from here rather than in the handler.
  useEffect(() => {
    if (!src || !on) return;
    const el = ref.current;
    if (el && el.paused) void el.play().catch(() => undefined);
  }, [src, on]);

  // The clock and the boundary are sampled from the element rather than
  // counted here, so they cannot drift away from the sound. setPos runs from
  // the animation-frame callback, never from the effect body.
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let last = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (now - last < TICK_MS) return;
      last = now;
      const el = ref.current;
      if (el && probe.current !== 1) setPos(el.currentTime);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  // Unmounting while playing (the row is deleted, the chat is closed) has to
  // hand the "one at a time" slot back, or the next note finds a dead element
  // in it and never starts. The element is read in the effect body, not
  // during render.
  useEffect(() => {
    const el = ref.current;
    return () => { if (sounding === el) sounding = null; };
  }, [src]);

  function toggle() {
    const el = ref.current;
    if (!src) { onNeedSrc?.(); setOn(true); return; }
    if (!el) return;
    if (el.paused) { void el.play().catch(() => undefined); setOn(true); }
    else { el.pause(); setOn(false); }
  }

  function meta() {
    const el = ref.current;
    if (!el) return;
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) { probe.current = 2; setDur(d); return; }
    if (probe.current !== 0) return;
    // Chrome hands a MediaRecorder blob a duration of Infinity: the WebM the
    // recorder writes carries no Duration element and the demuxer only learns
    // the length once it has seen the last cluster. Seeking past any
    // plausible end forces it to, and `durationchange` then arrives with the
    // real value. This is the normal case for every note recorded in-app.
    probe.current = 1;
    try { el.currentTime = 1e101; } catch { probe.current = 2; }
  }

  function durChange() {
    const el = ref.current;
    if (!el) return;
    const d = el.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    setDur(d);
    if (probe.current !== 1) return;
    probe.current = 2;
    // Undo the probe seek. If the press had already started playback it
    // carries on from the beginning — the probe takes a few milliseconds and
    // nothing is heard in between.
    try { el.currentTime = 0; } catch { /* the element refused; 0 is where it already is */ }
    setPos(0);
  }

  function ended() {
    // The probe seek lands past the end and fires `ended` on its way. That is
    // not the note finishing, and treating it as one resets a note the
    // listener has not heard a second of.
    if (probe.current === 1) return;
    const el = ref.current;
    if (el) { try { el.currentTime = 0; } catch { /* nothing left to rewind */ } }
    setOn(false);
    setPos(0);
  }

  function started() {
    const el = ref.current;
    if (sounding && sounding !== el) sounding.pause();
    sounding = el;
    setOn(true);
  }

  function paused() {
    if (sounding === ref.current) sounding = null;
    setOn(false);
  }

  // Clicking a bar seeks there. A waveform that looks like a scrubber and is
  // not one is a lie, and this is the one place a listener wants to go back
  // three seconds without starting the note again. Refused while the duration
  // is unknown: a fraction of Infinity is not a position.
  function seekAt(clientX: number) {
    const el = ref.current;
    const box = waveRef.current?.getBoundingClientRect();
    if (!el || !box || !box.width || !dur) return;
    const f = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    const next = f * dur;
    try { el.currentTime = next; } catch { return; }
    setPos(next);
  }

  function down(e: RPointerEvent<HTMLSpanElement>) {
    if (e.button !== 0 || !dur) return;
    // Capture, so a drag that wanders off the 22px strip keeps scrubbing
    // instead of stopping at the first pixel outside it.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
    seekAt(e.clientX);
  }

  function move(e: RPointerEvent<HTMLSpanElement>) {
    if (!dur || !e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    seekAt(e.clientX);
  }

  function key(e: RKeyboardEvent<HTMLSpanElement>) {
    const el = ref.current;
    if (!el || !dur) return;
    // One second a press: these notes are seconds long, so a percentage step
    // would be smaller than the thing anyone is trying to skip back over.
    let next: number;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = el.currentTime - 1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = el.currentTime + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = dur;
    else return;
    e.preventDefault();
    next = Math.max(0, Math.min(dur, next));
    try { el.currentTime = next; } catch { return; }
    setPos(next);
  }

  const frac = dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0;
  // At rest the counter is the note's length, the way every messenger shows
  // it; the moment it plays it becomes the running position, so in the order
  // form — where the row's own label keeps the total beside it — both numbers
  // are on screen at once. Before the very first press in the order form the
  // length is genuinely unknown (the blob URL is minted by that press, on
  // purpose), so it reads 0:00 there until then and the label carries the
  // length; in a chat bubble the URL already exists and preload="metadata"
  // has the real duration before anyone touches it.
  const shown = on || pos > 0 ? pos : dur;
  const style = { "--vn-p": `${(frac * 100).toFixed(2)}%` } as CSSProperties;

  return (
    <span className={`vnote${on ? " vnote--on" : ""}${className ? ` ${className}` : ""}`} style={style}>
      <button
        type="button"
        className="vnote__btn"
        onClick={toggle}
        aria-label={on ? pauseLabel : playLabel}
        aria-pressed={on}
      >
        {on ? <IconPause /> : <IconPlay />}
      </button>
      {/* A real slider, not a decorated div: aria-valuenow/aria-valuetext are
          what let a screen-reader user hear where they are and arrow
          somewhere else. aria-disabled while the duration is still unknown,
          because seeking is genuinely refused then. The bars themselves are
          aria-hidden — twenty-four of them would be twenty-four nothings. */}
      <span
        ref={waveRef}
        className="vnote__wave"
        role="slider"
        tabIndex={0}
        aria-label={seekLabel}
        aria-valuemin={0}
        // Whole seconds, floored, because that is the unit the counter beside
        // it shows. Rounding here read "1" at 0.94s while the counter still
        // said 0:00, and a 4.5s note announced a maximum of 5 against a
        // valuetext of 0:04 (measured, CDP 9920).
        aria-valuemax={Math.max(0, Math.floor(dur))}
        aria-valuenow={Math.min(Math.floor(pos), Math.max(0, Math.floor(dur)))}
        aria-valuetext={`${clock(pos)} / ${clock(dur)}`}
        aria-disabled={dur > 0 ? undefined : true}
        onPointerDown={down}
        onPointerMove={move}
        onKeyDown={key}
      >
        <span className="vnote__row vnote__row--rest" aria-hidden>
          {bars.map((h, i) => (
            <i key={i} style={{ "--vn-h": `${(h * 100).toFixed(1)}%` } as CSSProperties} />
          ))}
        </span>
        <span className="vnote__row vnote__row--done" aria-hidden>
          {bars.map((h, i) => (
            <i key={i} style={{ "--vn-h": `${(h * 100).toFixed(1)}%` } as CSSProperties} />
          ))}
        </span>
        <span className="vnote__cursor" aria-hidden />
      </span>
      {/* Deliberately not aria-live: it changes twelve times a second while
          playing, and a live region would talk over everything else on the
          screen. It is plain text a screen reader reads on the way past, and
          the slider above announces the position on every interaction. */}
      <span className="vnote__time">{clock(shown)}</span>
      {src ? (
        <audio
          ref={ref}
          src={src}
          preload="metadata"
          className="vnote__a"
          onLoadedMetadata={meta}
          onDurationChange={durChange}
          onEnded={ended}
          onPlay={started}
          onPause={paused}
        />
      ) : null}
    </span>
  );
}

// A voice note the client recorded a moment ago, on the order form. One press
// plays it — the mistake this exists to catch is a note that recorded
// silence, and now also the one that recorded the wrong ten seconds, because
// the strip is scrubbable.
export function VoicePlayer({ blob, label }: { blob: Blob; label: string }) {
  const t = useTranslations("portal.client.newDoc");
  const { url, open } = useLazyBlobUrl();

  return (
    <span className="dprev dprev--voice">
      {/* The label carries the note's total length ("Ovozli xabar · 0:07")
          and stays put, so while the counter inside the pill runs both the
          position and the total are on screen. */}
      <span className="dprev__name">{label}</span>
      <VoiceNotePlayer
        src={url}
        // Still minted inside the press, never during render and never in an
        // effect: VoiceNotePlayer calls this from its own click handler.
        onNeedSrc={() => open(blob)}
        playLabel={t("previewPlay")}
        pauseLabel={t("previewPause")}
        seekLabel={t("previewSeek")}
        // Not the blob URL: that is minted on the first press and would
        // reshuffle every bar the moment the note started playing.
        seed={`${label}:${blob.size}`}
      />
    </span>
  );
}

// A file the client attached. An image and a PDF open inline, underneath the
// row; anything else keeps its name and says plainly that it cannot be shown
// rather than offering a control that does nothing.
export function FilePreview({ file }: { file: File }) {
  const t = useTranslations("portal.client.newDoc");
  const [open, setOpen] = useState(false);
  const blobUrl = useLazyBlobUrl();
  const img = isImage(file);
  const pdf = isPdf(file);

  function toggle() {
    if (!open) blobUrl.open(file);
    setOpen((v) => !v);
  }

  return (
    <span className="dprev dprev--file">
      <span className="dprev__i" aria-hidden>{img ? <IconImage /> : <IconFileText />}</span>
      <span className="dprev__name" title={file.name}>{file.name}</span>
      {img || pdf ? (
        <button type="button" className="dprev__open" onClick={toggle} aria-expanded={open}>
          <IconEye />
          {open ? t("previewHide") : t("previewShow")}
        </button>
      ) : (
        <em className="dprev__no">{t("previewNone")}</em>
      )}
      {open && blobUrl.url ? (
        <span className="dprev__body">
          {img ? (
            // A blob: URL of a file the client just picked — next/image has
            // nothing to optimise here and cannot fetch it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={blobUrl.url} alt={file.name} className="dprev__img" />
          ) : (
            // <object> falls back to its children when the browser has no
            // PDF viewer, which is the honest outcome on most phones.
            <object data={blobUrl.url} type="application/pdf" className="dprev__pdf" aria-label={file.name}>
              <span className="dprev__no">{t("previewNone")}</span>
            </object>
          )}
        </span>
      ) : null}
    </span>
  );
}
