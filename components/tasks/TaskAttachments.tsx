"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, ImageOff, Images, LoaderCircle, Paperclip, RotateCcw } from "lucide-react";
import Modal from "@/components/admin/Modal";
import { saveBlob } from "@/lib/download";
import { downloadTaskAttachment, getTaskAttachmentBlob, type TaskAttachment } from "@/lib/services/taskManagement";
import { STROKE, useTaskText } from "./parts";

// The files attached to a task, under its description: images as a grid of
// thumbnails (tap one for the full-size view, with the others a swipe or an
// arrow key away), anything else as a row to download. Every byte comes
// through the signed-in user's token — preview_url is an API path, not a
// public link — so each image is fetched once as a blob and shown from an
// object URL.

// One fetch per file while the page is open: the thumbnail and the viewer
// share it, and a background refetch of the task does not refetch images.
const blobs = new Map<string, Promise<Blob>>();
function loadBlob(a: TaskAttachment): Promise<Blob> {
  const key = `${a.id}|${a.previewUrl}`;
  let p = blobs.get(key);
  if (!p) {
    p = getTaskAttachmentBlob(a.previewUrl).then((b) => {
      if (!b.size) throw new Error("empty");
      return b;
    });
    p.catch(() => blobs.delete(key));
    blobs.set(key, p);
  }
  return p;
}

type Shown = { status: "loading" | "ready" | "error"; url: string };

// An image attachment as an object URL, revoked when it is no longer shown.
function useImage(a: TaskAttachment, tick: number): Shown {
  const [shown, setShown] = useState<{ key: string; s: Shown }>({ key: "", s: { status: "loading", url: "" } });
  const key = `${a.id}|${a.previewUrl}|${tick}`;
  useEffect(() => {
    let alive = true;
    let made = "";
    loadBlob(a).then(
      (b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setShown({ key, s: { status: "ready", url: made } });
      },
      () => alive && setShown({ key, s: { status: "error", url: "" } }),
    );
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shown.key === key ? shown.s : { status: "loading", url: "" };
}

const sizeOf = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : n > 0 ? `${n} B` : "");

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

// The full-size view: one image at a time, the others by arrows, keys or a
// swipe, and the original file to save.
function Viewer({ items, start, onClose }: { items: TaskAttachment[]; start: number; onClose: () => void }) {
  const { t, when } = useTaskText();
  const [i, setI] = useState(start);
  const [tick, setTick] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const a = items[Math.min(i, items.length - 1)];
  const img = useImage(a, tick);
  const [broken, setBroken] = useState("");
  const bad = img.status === "error" || (img.url !== "" && broken === img.url);
  const many = items.length > 1;
  const count = items.length;
  const go = (d: number) => setI((n) => (n + d + count) % count);
  // Left and right arrows page through the images wherever focus is in the
  // dialog (it starts on the close button).
  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      setI((n) => (n + (e.key === "ArrowRight" ? 1 : -1) + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const r = a.downloadUrl ? await downloadTaskAttachment(a.downloadUrl) : { blob: await loadBlob(a), name: "" };
      saveBlob(r.blob, r.name || a.fileName);
    } catch {
      /* the button stays; the image itself is already on screen */
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={a.fileName || t("attachments.title")} size="xl">
      <div
        className="ttk-scope ttk-view"
        onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const end = e.changedTouches[0]?.clientX;
          if (many && touchX !== null && end !== undefined && Math.abs(end - touchX) > 50) go(end < touchX ? 1 : -1);
          setTouchX(null);
        }}
      >
        <div className="ttk-view__stage">
          {bad ? (
            <div className="ttk-att__fail ttk-att__fail--big" role="alert">
              <ImageOff aria-hidden strokeWidth={STROKE} />
              <span>{t("attachments.error")}</span>
              <button type="button" className="ttk-btn ttk-btn--line" onClick={() => (setBroken(""), setTick((n) => n + 1))}>
                <RotateCcw aria-hidden strokeWidth={STROKE} />
                {t("retry")}
              </button>
            </div>
          ) : img.status === "ready" ? (
            // eslint-disable-next-line @next/next/no-img-element -- an authenticated blob, not a static asset
            <img key={img.url} src={img.url} alt={a.note || a.fileName} onError={() => setBroken(img.url)} />
          ) : (
            <span className="ttk-view__load" role="status">
              <LoaderCircle aria-hidden strokeWidth={STROKE} className="ttk-spin" />
              {t("attachments.loading")}
            </span>
          )}
          {many ? (
            <>
              <button type="button" className="ttk-view__nav ttk-view__nav--prev" onClick={() => go(-1)} aria-label={t("attachments.prev")}>
                <ChevronLeft aria-hidden strokeWidth={STROKE} />
              </button>
              <button type="button" className="ttk-view__nav ttk-view__nav--next" onClick={() => go(1)} aria-label={t("attachments.next")}>
                <ChevronRight aria-hidden strokeWidth={STROKE} />
              </button>
            </>
          ) : null}
        </div>
        <div className="ttk-view__bar">
          <span className="ttk-view__meta">
            {many ? <strong>{t("attachments.position", { n: i + 1, total: items.length })}</strong> : null}
            {a.note ? <span>{a.note}</span> : null}
            <small>{[sizeOf(a.sizeBytes), a.uploader?.name, when(a.createdAt)].filter(Boolean).join(" · ")}</small>
          </span>
          <button type="button" className="ttk-btn ttk-btn--line" onClick={() => void save()} disabled={saving}>
            {saving ? <LoaderCircle aria-hidden strokeWidth={STROKE} className="ttk-spin" /> : <Download aria-hidden strokeWidth={STROKE} />}
            {t("attachments.download")}
          </button>
        </div>
      </div>
    </Modal>
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
      {open !== null && images.length ? <Viewer items={images} start={Math.min(open, images.length - 1)} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
