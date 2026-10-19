"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { getSecureMessageFile } from "@/lib/services/backend";
import { fetchAndDeliver } from "@/lib/download";
import { isMachineFileName } from "@/lib/chatFilter";
import ChatFilePreview, { canPreviewFile } from "@/components/chat/ChatFilePreview";
import { IconDownload, IconFileText, IconPause, IconPlay } from "@/components/icons";
import { Btn, Dialog, Spinner } from "../../kit/kit";
import type { ChatMsg } from "./useChat";

// What a message carries, drawn for the desktop: a voice note as a small
// player, a photo as a thumbnail that opens in a sheet, any other file as a
// document chip to preview or save. The attachment endpoint is for the
// room's members only, so the bytes are fetched with the session and held as
// an object URL — a voice note at once, a photo once it scrolls near, a file
// only when asked for.

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i;
const KB = 1024;
export const fmtSize = (b: number) => (!b ? "" : b < KB ? `${b} B` : b < KB * KB ? `${Math.round(b / KB)} KB` : `${(b / (KB * KB)).toFixed(1)} MB`);
const isImage = (f: ChatMsg["file"]) => {
  if (!f) return false;
  const mime = (f.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (mime && !mime.startsWith("application/octet-stream")) return false;
  return IMAGE_EXT.test(f.fileName || "");
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function useBlobUrl(roomId: string, msg: ChatMsg, want: boolean) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!want || !msg.id || msg.pending || msg.id.startsWith("tmp-")) return;
    let alive = true;
    let made = "";
    getSecureMessageFile(roomId, msg.id)
      .then((b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [roomId, msg.id, msg.pending, want]);
  return { url, err };
}

function Voice({ roomId, msg }: { roomId: string; msg: ChatMsg }) {
  const t = useTranslations("secureChat");
  const { url, err } = useBlobUrl(roomId, msg, true);
  const audio = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(0);
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };
  return (
    <span className="dxm-voice">
      <button type="button" className="dxm-voice__b" onClick={toggle} disabled={!url} aria-label={on ? t("voicePause") : t("voicePlay")}>
        {!url && !err ? <Spinner small /> : on ? <IconPause /> : <IconPlay />}
      </button>
      <input
        type="range"
        min={0}
        max={len || 1}
        step={0.1}
        value={pos}
        disabled={!len}
        aria-label={t("voiceSeek")}
        style={{ "--p": `${len ? (pos / len) * 100 : 0}%` } as React.CSSProperties}
        onChange={(e) => {
          const a = audio.current;
          if (a) a.currentTime = Number(e.target.value);
        }}
      />
      <time>{err ? t("attachFailed") : clock(on || pos ? pos : len)}</time>
      {url ? (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setOn(true)}
          onPause={() => setOn(false)}
          onEnded={() => (setOn(false), setPos(0))}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLen(e.currentTarget.duration)}
          onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setLen(e.currentTarget.duration)}
        />
      ) : null}
    </span>
  );
}

function Photo({ roomId, msg, name }: { roomId: string; msg: ChatMsg; name: string }) {
  const t = useTranslations("secureChat");
  const host = useRef<HTMLSpanElement>(null);
  const [want, setWant] = useState(false);
  const [open, setOpen] = useState<Element | null>(null);
  useEffect(() => {
    if (want) return;
    const el = host.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      const h = setTimeout(() => setWant(true), 0);
      return () => clearTimeout(h);
    }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setWant(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [want]);
  const { url, err } = useBlobUrl(roomId, msg, want);
  const save = () => void fetchAndDeliver(() => getSecureMessageFile(roomId, msg.id), name, true);
  return (
    <span className="dxm-photo" ref={host}>
      {url ? (
        <button type="button" onClick={() => setOpen(host.current?.closest(".dx") ?? null)} title={t("imageOpen")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={name} />
        </button>
      ) : (
        <span className="dxm-photo__ph">{err ? t("attachFailed") : msg.pending ? t("attachSending") : <Spinner small />}</span>
      )}
      {open && url ? createPortal(<Dialog
        open
        title={isMachineFileName(name) ? t("imageGeneric") : name}
        width={760}
        onClose={() => setOpen(null)}
        actions={
          <>
            <Btn icon={<IconDownload />} onClick={save}>
              {t("attachDownload")}
            </Btn>
            <Btn kind="primary" onClick={() => setOpen(null)}>
              {t("close")}
            </Btn>
          </>
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="dxm-photo__big" src={url} alt={name} />
      </Dialog>, open) : null}
    </span>
  );
}

function Doc({ roomId, msg, name }: { roomId: string; msg: ChatMsg; name: string }) {
  const t = useTranslations("secureChat");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [prev, setPrev] = useState(false);
  const can = !msg.pending && canPreviewFile(msg.file);
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? "").toUpperCase();
  async function save() {
    if (busy || !msg.id) return;
    setBusy(true);
    const ok = await fetchAndDeliver(() => getSecureMessageFile(roomId, msg.id), name, true);
    setErr(!ok);
    setBusy(false);
  }
  return (
    <span className="dxm-doc">
      <button type="button" className="dxm-doc__open" onClick={() => (can ? setPrev(true) : void save())} disabled={busy || msg.pending} title={can ? t("previewOpen") : t("attachDownload")}>
        <span className="dxm-doc__ic" data-ext={ext || undefined}>
          <IconFileText />
        </span>
        <span className="dxm-doc__t">
          <b>{name}</b>
          <small>{err ? t("attachFailed") : msg.pending ? t("attachSending") : [ext, fmtSize(msg.file?.size || 0)].filter(Boolean).join(" · ")}</small>
        </span>
      </button>
      <button type="button" className="dxm-doc__dl" onClick={() => void save()} disabled={busy || msg.pending} aria-label={t("attachDownload")} title={t("attachDownload")}>
        {busy ? <Spinner small /> : <IconDownload />}
      </button>
      {prev && msg.file ? <ChatFilePreview file={msg.file} size={fmtSize(msg.file.size || 0)} onClose={() => setPrev(false)} /> : null}
    </span>
  );
}

export default function Attachment({ roomId, msg }: { roomId: string; msg: ChatMsg }) {
  const t = useTranslations("secureChat");
  const voice = msg.messageType === "voice";
  const name = msg.file?.fileName || (voice ? t("voiceNote") : t("fileGeneric"));
  if (voice) return <Voice roomId={roomId} msg={msg} />;
  if (isImage(msg.file)) return <Photo roomId={roomId} msg={msg} name={name} />;
  return <Doc roomId={roomId} msg={msg} name={name} />;
}
