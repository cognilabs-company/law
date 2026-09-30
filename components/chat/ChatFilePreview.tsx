"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { getSecureMessageFileAt, type SecureMessageFile } from "@/lib/services/backend";
import { saveBlob } from "@/lib/download";
import { docxToTree } from "@/lib/docxParse";
import { renderDocTree } from "@/lib/docTreeRender";
import type { DocTree } from "@/lib/docTemplate";
import { VoiceNotePlayer } from "@/components/portal/AttachmentPreview";
import { IconClose, IconDownload, IconFileText } from "@/components/icons";

const TEXT_LIMIT = 200_000;
const BLOB_KINDS = new Set(["image", "pdf", "audio", "video"]);

export function canPreviewFile(file: SecureMessageFile | null | undefined): boolean {
  const p = file?.preview;
  return !!p && p.supported && !!p.inlineUrl;
}

export default function ChatFilePreview({
  file,
  size,
  onClose,
}: {
  file: SecureMessageFile;
  size: string;
  onClose: () => void;
}) {
  const t = useTranslations("secureChat");
  const kind = file.preview?.kind || "download_only";
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [clipped, setClipped] = useState(false);
  const [tree, setTree] = useState<DocTree[] | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const src = file.preview?.inlineUrl || file.inlineUrl || file.downloadUrl;
  const status = src ? loadState : "error";
  useEffect(() => {
    if (!src) return;
    let alive = true;
    let made = "";
    (async () => {
      try {
        const b = await getSecureMessageFileAt(src);
        if (!alive) return;
        setBlob(b);
        if (kind === "text") {
          const whole = await b.text();
          if (!alive) return;
          setClipped(whole.length > TEXT_LIMIT);
          setText(whole.slice(0, TEXT_LIMIT));
        } else if (kind === "office_document" && /\.docx$/i.test(file.fileName)) {
          const parsed = await docxToTree(await b.arrayBuffer());
          if (!alive) return;
          setTree(parsed.length ? parsed : null);
        } else if (BLOB_KINDS.has(kind)) {
          made = URL.createObjectURL(b);
          setUrl(made);
        }
        if (alive) setLoadState("ready");
      } catch {
        if (alive) setLoadState("error");
      }
    })();
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src, kind, file.fileName]);

  function download() {
    if (blob) saveBlob(blob, file.fileName);
  }

  if (typeof document === "undefined") return null;

  const fallback = (message: string) => (
    <div className="sprev__fb">
      <span className="sprev__fbi">
        <IconFileText />
      </span>
      <b>{file.fileName}</b>
      <p>{message}</p>
      <button type="button" className="btn btn--grad btn--sm" onClick={download} disabled={!blob}>
        <IconDownload />
        {t("attachDownload")}
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (status === "loading") body = <p className="sprev__wait">{t("attachLoading")}</p>;
  else if (status === "error") body = fallback(t("previewFailed"));
  else if (kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    body = <img className="sprev__img" src={url} alt={file.fileName} />;
  else if (kind === "pdf")
    body = (
      <object className="sprev__pdf" data={url} type="application/pdf" aria-label={file.fileName}>
        {fallback(t("previewUnsupported"))}
      </object>
    );
  else if (kind === "audio")
    body = (
      <div className="sprev__audio">
        <VoiceNotePlayer
          src={url}
          playLabel={t("voicePlay")}
          pauseLabel={t("voicePause")}
          seekLabel={t("voiceSeek")}
          seed={file.fileName}
        />
      </div>
    );
  else if (kind === "video") body = <video className="sprev__video" src={url} controls autoPlay={false} />;
  else if (kind === "text")
    body = (
      <div className="sprev__sheet">
        {clipped ? <p className="sprev__note">{t("previewClipped")}</p> : null}
        <pre className="sprev__text">{text}</pre>
      </div>
    );
  else if (kind === "office_document" && tree)
    body = (
      <div className="sprev__sheet">
        <article className="docpaper__sheet docpaper__sheet--doc">{renderDocTree(tree)}</article>
      </div>
    );
  else body = fallback(t("previewUnsupported"));

  return createPortal(
    <div className="sprev" role="dialog" aria-modal="true" aria-label={file.fileName}>
      <div className="sprev__bar">
        <span className="sprev__name">
          <b>{file.fileName}</b>
          <small>{size}</small>
        </span>
        <button
          type="button"
          className="sprev__btn"
          onClick={download}
          disabled={!blob}
          aria-label={t("attachDownload")}
          title={t("attachDownload")}
        >
          <IconDownload />
        </button>
        <button type="button" className="sprev__btn" onClick={onClose} aria-label={t("close")} title={t("close")}>
          <IconClose />
        </button>
      </div>
      <div className="sprev__body">{body}</div>
    </div>,
    document.body,
  );
}
