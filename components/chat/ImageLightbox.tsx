"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconClose, IconDownload } from "@/components/icons";

// Full-size viewer for a photo sent into a secure chat.
//
// Portaled to <body> rather than rendered in place: the bubble lives inside a
// scrolling message list which is itself inside a 360px panel (the advocate's
// document workspace) or a modal, and every one of those clips its children.
// The blob URL is owned by the caller — the thumbnail already holds it, so the
// viewer must not revoke it on close.
export default function ImageLightbox({
  url,
  name,
  onClose,
  onDownload,
  closeLabel,
  downloadLabel,
}: {
  url: string;
  name: string;
  onClose: () => void;
  onDownload?: () => void;
  closeLabel: string;
  downloadLabel: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase: a CallRoom or a Modal further up also listens for Escape,
    // and the viewer is the topmost thing on screen, so it answers first.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="slight" role="dialog" aria-modal="true" aria-label={name} onClick={onClose}>
      <div className="slight__bar" onClick={(e) => e.stopPropagation()}>
        <b className="slight__name">{name}</b>
        {onDownload ? (
          <button type="button" className="slight__btn" onClick={onDownload} aria-label={downloadLabel} title={downloadLabel}>
            <IconDownload />
          </button>
        ) : null}
        <button type="button" className="slight__btn" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <IconClose />
        </button>
      </div>
      {/* The click that opens the viewer must not also close it, so the image
          swallows its own clicks; the backdrop keeps closing on click. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="slight__img" src={url} alt={name} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}
