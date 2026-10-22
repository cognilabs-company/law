"use client";

import { useState } from "react";
import { Download, FileText, ImageOff, Images, LoaderCircle, Paperclip, RotateCcw } from "lucide-react";
import { saveBlob } from "@/lib/download";
import { downloadTaskAttachment, type TaskAttachment } from "@/lib/services/taskManagement";
import { sizeOf, useImage } from "./attachmentImages";
import { STROKE, useTaskText } from "./parts";
import TaskLightbox from "./TaskLightbox";

// The files attached to a task, under its description: images as a grid of
// thumbnails (tap one for the full-screen viewer), anything else as a row to
// download.

function Thumb({ a, onOpen }: { a: TaskAttachment; onOpen: () => void }) {
  const { t } = useTaskText();
  const [tick, setTick] = useState(0);
  const img = useImage(a, tick);
  // An image the browser cannot decode is an error too, not a blank tile.
  const [broken, setBroken] = useState("");
  const bad = img.status === "error" || (img.url !== "" && broken === img.url);
  return (
    <li className={`ttk-att__th${bad ? " is-bad" : img.status === "loading" ? " is-loading" : ""}`}>
      {bad ? (
        <div className="ttk-att__fail" role="group" aria-label={a.fileName}>
          <ImageOff aria-hidden strokeWidth={STROKE} />
          <span>{t("attachments.error")}</span>
          <button type="button" className="ttk-att__retry" onClick={() => (setBroken(""), setTick((n) => n + 1))}>
            <RotateCcw aria-hidden strokeWidth={STROKE} />
            {t("retry")}
          </button>
        </div>
      ) : (
        <button type="button" className="ttk-att__open" onClick={onOpen} aria-label={t("attachments.open", { name: a.fileName })} title={a.note || a.fileName} disabled={img.status !== "ready"}>
          {img.status === "ready" ? (
            // eslint-disable-next-line @next/next/no-img-element -- an authenticated blob, not a static asset
            <img src={img.url} alt={a.note || a.fileName} loading="lazy" decoding="async" onError={() => setBroken(img.url)} />
          ) : (
            <span className="ttk-att__sk" aria-label={t("attachments.loading")} role="status" />
          )}
        </button>
      )}
      <span className="ttk-att__cap" title={a.fileName}>
        {a.fileName}
      </span>
    </li>
  );
}

function FileRow({ a }: { a: TaskAttachment }) {
  const { t } = useTaskText();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function get() {
    if (busy || !a.downloadUrl) return;
    setBusy(true);
    setFailed(false);
    try {
      const r = await downloadTaskAttachment(a.downloadUrl);
      saveBlob(r.blob, r.name || a.fileName);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="ttk-att__file">
      <FileText aria-hidden strokeWidth={STROKE} />
      <span className="ttk-att__fname">
        <strong title={a.fileName}>{a.fileName}</strong>
        <small>{failed ? t("attachments.downloadError") : [sizeOf(a.sizeBytes), a.note].filter(Boolean).join(" · ")}</small>
      </span>
      <button type="button" className="ttk-btn ttk-btn--line ttk-btn--sm" onClick={() => void get()} disabled={busy || !a.downloadUrl} aria-label={t("attachments.downloadName", { name: a.fileName })}>
        {busy ? <LoaderCircle aria-hidden strokeWidth={STROKE} className="ttk-spin" /> : <Download aria-hidden strokeWidth={STROKE} />}
        {t("attachments.download")}
      </button>
    </li>
  );
}

export default function TaskAttachments({ attachments, count, loading }: { attachments: TaskAttachment[] | null; count: number; loading: boolean }) {
  const { t } = useTaskText();
  const [open, setOpen] = useState<number | null>(null);
  const images = (attachments ?? []).filter((a) => a.isImage);
  const files = (attachments ?? []).filter((a) => !a.isImage);
  const total = attachments ? attachments.length : count;
  return (
    <section className="ttk-att" aria-label={t("attachments.title")}>
      <p className="ttk-desc__l">
        <Paperclip aria-hidden strokeWidth={STROKE} />
        {t("attachments.title")}
        {total ? <span className="ttk-att__n">{total}</span> : null}
      </p>
      {attachments === null ? (
        loading || count > 0 ? (
          <ul className="ttk-att__grid" aria-busy>
            {Array.from({ length: Math.min(Math.max(count, 2), 6) }, (_, k) => (
              <li key={k} className="ttk-att__th is-loading">
                <span className="ttk-att__sk" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="ttk-muted">{t("attachments.empty")}</p>
        )
      ) : !attachments.length ? (
        <p className="ttk-att__empty">
          <Images aria-hidden strokeWidth={STROKE} />
          {t("attachments.empty")}
        </p>
      ) : (
        <>
          {images.length ? (
            <ul className="ttk-att__grid">
              {images.map((a, k) => (
                <Thumb key={a.id} a={a} onOpen={() => setOpen(k)} />
              ))}
            </ul>
          ) : null}
          {files.length ? (
            <ul className="ttk-att__files">
              {files.map((a) => (
                <FileRow key={a.id} a={a} />
              ))}
            </ul>
          ) : null}
        </>
      )}
      {open !== null && images.length ? <TaskLightbox items={images} start={Math.min(open, images.length - 1)} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
