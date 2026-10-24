"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Camera, FileText, Film, Image as ImageIcon, Paperclip, Pause, Play, SendHorizontal, Smile, Square, Trash2, X } from "lucide-react";
import { levelOf } from "@/components/VoicePill";
import { VoiceNotePlayer } from "@/components/portal/AttachmentPreview";
import { voiceDuration, type VoiceNote, type VoiceRecorder } from "@/lib/voiceRecorder";
import { SECURE_UPLOAD_ACCEPT } from "@/lib/secureUpload";

// The secure chat composer's own controls, kept out of SecureChat.tsx:
//   VoiceBar     record with a live waveform, pause and carry on, then
//                listen back before sending (or bin it)
//   AttachMenu   file / photo or video / camera
//   AttachTray   what was picked, to look over (and caption) before sending
//   EmojiPicker  the common emoji, inserted where the caret is

// ── voice ────────────────────────────────────────────────────────────────

// A recording nobody stopped cannot run until the tab dies.
const CAP_MS = 10 * 60 * 1000;
const FRAME_MS = 60;
const BAR_W = 3;
const BAR_GAP = 2;

export function VoiceBar({ rec, onSend, onClose }: { rec: VoiceRecorder; onSend: (note: VoiceNote) => void; onClose: () => void }): ReactElement {
  const t = useTranslations("secureChat");
  const [phase, setPhase] = useState<"rec" | "paused" | "stopping" | "review">("rec");
  const [ms, setMs] = useState(0);
  const [note, setNote] = useState<VoiceNote | null>(null);
  const [url, setUrl] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // The clock and the waveform, from the one microphone stream the recorder
  // already holds (no second getUserMedia).
  useEffect(() => {
    if (phase !== "rec" && phase !== "paused") return;
    const an = rec.analyser(1024);
    const buf = an ? new Uint8Array(new ArrayBuffer(an.fftSize)) : null;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      last = now;
      setMs(rec.elapsedMs);
      if (rec.elapsedMs >= CAP_MS) void stop();
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
      if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (phaseRef.current === "rec") {
        levels.current.push(levelOf(an, buf));
        const keep = Math.ceil(w / (BAR_W + BAR_GAP)) + 2;
        if (levels.current.length > keep) levels.current.splice(0, levels.current.length - keep);
      }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = getComputedStyle(c).color;
      const list = levels.current;
      for (let i = 0; i < list.length; i++) {
        const x = w - (list.length - i) * (BAR_W + BAR_GAP);
        if (x < -BAR_W) continue;
        const bh = Math.max(3, list[i] * h);
        ctx.globalAlpha = 0.35 + 0.65 * (i / list.length);
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(x, (h - bh) / 2, BAR_W, bh, BAR_W / 2);
        else ctx.rect(x, (h - bh) / 2, BAR_W, bh);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // stop is stable for this recorder
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, rec]);

  // Leaving with the microphone open would keep the tab's recording light on.
  // The release waits a tick, so a remount of the same bar (React's dev
  // double-mount, a parent re-keying) takes it back instead of losing the
  // recording.
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (release.current) clearTimeout(release.current);
    release.current = null;
    return () => {
      release.current = setTimeout(() => {
        if (rec.active) rec.cancel();
      }, 0);
    };
  }, [rec]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  async function stop() {
    if (phaseRef.current === "stopping" || phaseRef.current === "review") return;
    setPhase("stopping");
    const n = await rec.stop();
    if (!n) {
      onClose();
      return;
    }
    setNote(n);
    setUrl(URL.createObjectURL(n.blob));
    setPhase("review");
  }

  function pauseOrResume() {
    if (phase === "rec" && rec.pause()) setPhase("paused");
    else if (phase === "paused" && rec.resume()) setPhase("rec");
  }

  function discard() {
    if (rec.active) rec.cancel();
    onClose();
  }

  return (
    <div className="mxv" data-phase={phase} role="group" aria-label={t("voiceRecord")}>
      <button type="button" className="mxr__ib mxr__ib--danger" onClick={discard} aria-label={t("voiceCancel")} title={t("voiceCancel")}>
        <Trash2 aria-hidden />
      </button>
      {phase === "review" && note && url ? (
        <span className="mxv__review">
          <VoiceNotePlayer src={url} className="vnote--bub mxv__player" playLabel={t("voicePlay")} pauseLabel={t("voicePause")} seekLabel={t("voiceSeek")} seed={`preview-${note.durationMs}`} speedLabel={t("voiceSpeed")} />
          <small className="mxv__hint">{t("voiceReview")}</small>
        </span>
      ) : (
        <span className="mxv__live" role="status" aria-live="off">
          <i className="mxv__dot" aria-hidden />
          <b className="mxv__clock">{voiceDuration(ms)}</b>
          <canvas ref={canvas} className="mxv__wave" aria-hidden />
          <small className="mxv__state">{phase === "paused" ? t("voicePaused") : t("voiceHint")}</small>
        </span>
      )}
      {phase === "rec" || phase === "paused" ? (
        <>
          {rec.canPause ? (
            <button type="button" className="mxr__ib" onClick={pauseOrResume} aria-label={phase === "paused" ? t("voiceResume") : t("voicePauseRec")} title={phase === "paused" ? t("voiceResume") : t("voicePauseRec")}>
              {phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
            </button>
          ) : null}
          <button type="button" className="mxr__ib mxv__stop" onClick={() => void stop()} aria-label={t("voiceStop")} title={t("voiceStop")}>
            <Square aria-hidden />
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="mxr__send"
        disabled={phase === "stopping"}
        onClick={async () => {
          if (phase === "review" && note) {
            onSend(note);
            return;
          }
          // Send straight from recording, as before: stop, then send.
          if (phaseRef.current === "stopping") return;
          setPhase("stopping");
          const n = await rec.stop();
          if (n) onSend(n);
          else onClose();
        }}
        aria-label={t("voiceSend")}
        title={t("voiceSend")}
      >
        <SendHorizontal aria-hidden />
      </button>
    </div>
  );
}

// ── attachments ──────────────────────────────────────────────────────────

export type PendingFile = { id: string; file: File; url: string };

type Pick = "file" | "media" | "camera";

export function AttachMenu({ disabled, onPick, busy }: { disabled: boolean; busy: boolean; onPick: (files: FileList | null) => void }): ReactElement {
  const t = useTranslations("secureChat");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const mediaIn = useRef<HTMLInputElement>(null);
  const cameraIn = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const choose = (k: Pick) => {
    setOpen(false);
    (k === "file" ? fileIn : k === "media" ? mediaIn : cameraIn).current?.click();
  };
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPick(e.target.files);
    e.target.value = "";
  };
  const items: [Pick, typeof FileText, string][] = [
    ["media", ImageIcon, t("attachMedia")],
    ["file", FileText, t("attachDoc")],
    ["camera", Camera, t("attachCamera")],
  ];
  return (
    <span className="mxa" ref={box}>
      <input ref={fileIn} type="file" accept={SECURE_UPLOAD_ACCEPT} multiple hidden onChange={take} />
      <input ref={mediaIn} type="file" accept="image/*,video/*" multiple hidden onChange={take} />
      <input ref={cameraIn} type="file" accept="image/*" capture="environment" hidden onChange={take} />
      <button type="button" className="mxr__ib" onClick={() => setOpen((v) => !v)} disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-label={t("attachFile")} title={t("attachFile")} data-busy={busy ? "" : undefined}>
        <Paperclip aria-hidden />
      </button>
      {open ? (
        <span className="mxa__menu" role="menu">
          {items.map(([k, I, label]) => (
            <button key={k} type="button" role="menuitem" className="mxa__item" data-k={k} onClick={() => choose(k)}>
              <span className="mxa__ic" aria-hidden>
                <I />
              </span>
              {label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

const KB = 1024;
const sizeOf = (b: number) => (b < KB * KB ? `${Math.max(1, Math.round(b / KB))} KB` : `${(b / (KB * KB)).toFixed(1)} MB`);

export function AttachTray({ items, onRemove, onClear }: { items: readonly PendingFile[]; onRemove: (id: string) => void; onClear: () => void }): ReactElement | null {
  const t = useTranslations("secureChat");
  // Pictures the browser cannot draw (HEIC from an iPhone) show as files.
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  if (!items.length) return null;
  return (
    <div className="mxt" role="group" aria-label={t("trayTitle", { n: items.length })}>
      <div className="mxt__head">
        <b>{t("trayTitle", { n: items.length })}</b>
        <span>{t("trayHint")}</span>
        <button type="button" className="mxt__clear" onClick={onClear}>
          {t("trayClear")}
        </button>
      </div>
      <ul className="mxt__list">
        {items.map((p) => {
          const img = p.file.type.startsWith("image/") && p.url && !broken.has(p.id);
          const vid = p.file.type.startsWith("video/");
          return (
            <li key={p.id} className="mxt__item" data-kind={img ? "image" : vid ? "video" : "file"}>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" onError={() => setBroken((b) => new Set(b).add(p.id))} />
              ) : (
                <span className="mxt__ic" aria-hidden>
                  {vid ? <Film /> : <FileText />}
                </span>
              )}
              <span className="mxt__meta">
                <b title={p.file.name}>{p.file.name || t("fileGeneric")}</b>
                <small>{sizeOf(p.file.size)}</small>
              </span>
              <button type="button" className="mxt__x" onClick={() => onRemove(p.id)} aria-label={t("trayRemove", { name: p.file.name })} title={t("trayRemove", { name: p.file.name })}>
                <X aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── emoji ────────────────────────────────────────────────────────────────

const EMOJI = ["😀", "😂", "🙂", "😉", "😊", "😍", "🤝", "👍", "👏", "🙏", "💪", "✅", "❌", "⚖️", "📄", "📎", "📅", "⏰", "💬", "📞", "❤️", "🔥", "🎉", "🤔", "😢", "😮", "😅", "🙌", "👌", "✍️", "📌", "💡"];

export function EmojiPicker({ onPick, disabled }: { onPick: (emoji: string) => void; disabled: boolean }): ReactElement {
  const t = useTranslations("secureChat");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="mxe" ref={box}>
      <button type="button" className="mxr__ib" onClick={() => setOpen((v) => !v)} disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-label={t("emoji")} title={t("emoji")}>
        <Smile aria-hidden />
      </button>
      {open ? (
        <span className="mxe__pop" role="menu" aria-label={t("emoji")}>
          {EMOJI.map((e) => (
            <button key={e} type="button" role="menuitem" onClick={() => onPick(e)}>
              {e}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
