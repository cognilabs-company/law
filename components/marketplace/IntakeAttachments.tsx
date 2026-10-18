"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { uploadWorkspaceFile } from "@/lib/services/backend";
import { MAX_PURCHASE_FILES, MAX_PURCHASE_VOICES, type PurchaseAttachment, type PurchaseVoice } from "@/lib/services/marketplace";
import { IconClose, IconMic, IconPaperclip, IconRecord } from "@/components/icons";

const MAX_FILE_MB = 25;
const MAX_VOICE_SECONDS = 300;

// What a client sends with a purchase request (2026-10-18): files and voice
// messages, each uploaded to their workspace first and then sent by id, so
// they reach the order with it. Up to 20 files and 10 voice messages; a
// voice message is recorded here, in the browser, and can be listened to
// before it is sent.
export default function IntakeAttachments({
  files,
  voices,
  onFiles,
  onVoices,
  onBusy,
}: {
  files: PurchaseAttachment[];
  voices: (PurchaseVoice & { url: string })[];
  onFiles: (f: PurchaseAttachment[]) => void;
  onVoices: (v: (PurchaseVoice & { url: string })[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations("marketplace.purchase.intake");
  const pick = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [err, setErr] = useState("");
  const [rec, setRec] = useState<{ started: number; secs: number } | null>(null);
  const recorder = useRef<{ mr: MediaRecorder; chunks: Blob[]; stream: MediaStream; started: number } | null>(null);

  useEffect(() => onBusy(uploading > 0 || !!rec), [uploading, rec, onBusy]);
  // The recording's running time, and its limit.
  useEffect(() => {
    if (!rec) return;
    const h = setInterval(() => {
      const secs = Math.round((Date.now() - rec.started) / 1000);
      setRec((r) => (r ? { ...r, secs } : r));
      if (secs >= MAX_VOICE_SECONDS) recorder.current?.mr.stop();
    }, 500);
    return () => clearInterval(h);
  }, [rec]);
  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setErr("");
    const room = MAX_PURCHASE_FILES - files.length;
    const chosen = [...list].slice(0, room);
    if (list.length > room) setErr(t("tooManyFiles", { n: MAX_PURCHASE_FILES }));
    const added: PurchaseAttachment[] = [];
    for (const f of chosen) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setErr(t("tooBig", { name: f.name, mb: MAX_FILE_MB }));
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const up = await uploadWorkspaceFile(f);
        if (up.id) added.push({ fileId: up.id, title: f.name.replace(/\.[^.]+$/, "") || f.name });
      } catch {
        setErr(t("uploadError", { name: f.name }));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length) onFiles([...files, ...added]);
  }

  async function startVoice() {
    setErr("");
    if (voices.length >= MAX_PURCHASE_VOICES) return setErr(t("tooManyVoices", { n: MAX_PURCHASE_VOICES }));
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return setErr(t("noMic"));
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setErr(t("micDenied"));
    }
    const mr = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const started = Date.now();
    recorder.current = { mr, chunks, stream, started };
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      setRec(null);
      recorder.current = null;
      const type = mr.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
      setUploading((n) => n + 1);
      try {
        const up = await uploadWorkspaceFile(new File([blob], `voice-${new Date(started).toISOString().replace(/[:.]/g, "-")}.${ext}`, { type }));
        if (up.id) onVoices([...voices, { fileId: up.id, seconds, url: URL.createObjectURL(blob) }]);
      } catch {
        setErr(t("voiceError"));
      } finally {
        setUploading((n) => n - 1);
      }
    };
    mr.start();
    setRec({ started, secs: 0 });
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <fieldset className="mk-att">
      <legend>{t("title")}</legend>
      <p className="mk-att__hint">{t("hint")}</p>
      <div className="mk-att__bar">
        <button type="button" className="mk-chip mk-chip--sm" onClick={() => pick.current?.click()} disabled={files.length >= MAX_PURCHASE_FILES || !!rec}>
          <IconPaperclip aria-hidden />
          {t("addFile")}
          <small>
            {files.length}/{MAX_PURCHASE_FILES}
          </small>
        </button>
        {rec ? (
          <button type="button" className="mk-chip mk-chip--sm mk-att__rec" onClick={() => recorder.current?.mr.stop()}>
            <IconRecord aria-hidden />
            {t("stop", { t: mmss(rec.secs) })}
          </button>
        ) : (
          <button type="button" className="mk-chip mk-chip--sm" onClick={() => void startVoice()} disabled={voices.length >= MAX_PURCHASE_VOICES || uploading > 0}>
            <IconMic aria-hidden />
            {t("record")}
            <small>
              {voices.length}/{MAX_PURCHASE_VOICES}
            </small>
          </button>
        )}
        <input ref={pick} type="file" multiple hidden onChange={(e) => (void addFiles(e.target.files), (e.target.value = ""))} />
      </div>
      {uploading ? <p className="mk-att__up">{t("uploading", { n: uploading })}</p> : null}
      {err ? <p className="mk-att__err" role="alert">{err}</p> : null}
      {files.length || voices.length ? (
        <ul className="mk-att__list">
          {files.map((f, i) => (
            <li key={f.fileId}>
              <IconPaperclip aria-hidden />
              <span>{f.title}</span>
              <button type="button" onClick={() => onFiles(files.filter((_, k) => k !== i))} aria-label={t("remove", { name: f.title })}>
                <IconClose />
              </button>
            </li>
          ))}
          {voices.map((v, i) => (
            <li key={v.fileId} className="mk-att__voice">
              <IconMic aria-hidden />
              <audio src={v.url} controls preload="metadata" aria-label={t("voiceN", { n: i + 1, t: mmss(v.seconds) })} />
              <small>{mmss(v.seconds)}</small>
              <button type="button" onClick={() => onVoices(voices.filter((_, k) => k !== i))} aria-label={t("removeVoice", { n: i + 1 })}>
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
