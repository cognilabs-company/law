"use client";

import { useEffect, useRef, useState } from "react";
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

// A voice note the client recorded a moment ago. One press plays it — the
// mistake this exists to catch is a note that recorded silence.
export function VoicePlayer({ blob, label }: { blob: Blob; label: string }) {
  const t = useTranslations("portal.client.newDoc");
  const [on, setOn] = useState(false);
  const { url, open } = useLazyBlobUrl();
  const ref = useRef<HTMLAudioElement>(null);

  // The <audio> only exists once the URL does, so the first press has to
  // start it here rather than in the handler.
  useEffect(() => {
    if (!url || !on) return;
    const el = ref.current;
    if (el && el.paused) void el.play().catch(() => undefined);
  }, [url, on]);

  function toggle() {
    const el = ref.current;
    if (!url) { open(blob); setOn(true); return; }
    if (!el) return;
    if (el.paused) { void el.play().catch(() => undefined); setOn(true); }
    else { el.pause(); setOn(false); }
  }

  return (
    <span className="dprev dprev--voice">
      <button type="button" className="dprev__play" onClick={toggle} aria-label={on ? t("previewPause") : t("previewPlay")}>
        {on ? <IconPause /> : <IconPlay />}
      </button>
      <span className="dprev__name">{label}</span>
      {url ? (
        <audio
          ref={ref}
          src={url}
          className="dprev__audio"
          controls
          onPlay={() => setOn(true)}
          onPause={() => setOn(false)}
          onEnded={() => setOn(false)}
        />
      ) : null}
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
