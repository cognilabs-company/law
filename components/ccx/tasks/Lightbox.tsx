"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { saveBlob } from "@/lib/download";
import { downloadTaskAttachment, type TaskAttachment } from "@/lib/services/taskManagement";
import { loadBlob, sizeOf, useImage } from "@/components/tasks/attachmentImages";
import { IcClose, IcRefresh } from "../icons";
import { IcChevL, IcChevR, IcDownload, IcFit, IcImageOff, IcInfo, IcNote, IcSpin, IcZoomIn, IcZoomOut } from "./icons";
import { Face } from "./kit";
import { useTx } from "./text";

const ZMIN = 1;
const ZMAX = 4;
const ZSTEP = 1.4;
const FOCUSABLE = 'button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])';
const clampZoom = (z: number) => Math.min(ZMAX, Math.max(ZMIN, Math.round(z * 100) / 100));
const typeOf = (a: TaskAttachment) => (a.mimeType.split("/")[1] || a.fileName.split(".").pop() || "").toUpperCase();

function Film({ a, on, label, onPick }: { a: TaskAttachment; on: boolean; label: string; onPick: () => void }) {
  const img = useImage(a, 0);
  return (
    <button type="button" className="opx-tk-lb__fi" data-on={on || undefined} onClick={onPick} aria-label={label} aria-current={on ? "true" : undefined}>
      {img.status === "ready" ? <Image src={img.url} alt="" fill sizes="64px" unoptimized draggable={false} /> : img.status === "error" ? <IcImageOff size={18} /> : <span className="opx-shim opx-tk-lb__fsk" />}
    </button>
  );
}

export default function Lightbox({ items, start, onClose }: { items: TaskAttachment[]; start: number; onClose: () => void }) {
  const { t, when } = useTx();
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);
  const [i, setI] = useState(start);
  const [dir, setDir] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [tick, setTick] = useState(0);
  const [broken, setBroken] = useState("");
  const [info, setInfo] = useState(() => window.matchMedia("(min-width: 900px)").matches);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const count = items.length;
  const a = items[Math.min(i, count - 1)];
  const img = useImage(a, tick);
  const bad = img.status === "error" || (img.url !== "" && broken === img.url);
  const ready = img.status === "ready" && !bad;
  const many = count > 1;

  const go = (d: number) => {
    if (count < 2 || !d) return;
    setDir(d);
    setI((n) => (n + d + count) % count);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBroken("");
    setSaveFailed(false);
  };
  const zoomTo = (next: number) => {
    const v = clampZoom(next);
    setZoom(v);
    if (v === 1) setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      back?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (k === "ArrowRight" || k === "ArrowLeft") {
        if (count < 2) return;
        e.preventDefault();
        const d = k === "ArrowRight" ? 1 : -1;
        setDir(d);
        setI((n) => (n + d + count) % count);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setBroken("");
      } else if (k === "+" || k === "=") {
        e.preventDefault();
        setZoom((v) => clampZoom(v * ZSTEP));
      } else if (k === "-") {
        e.preventDefault();
        setZoom((v) => clampZoom(v / ZSTEP));
      } else if (k === "0") {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [count, onClose]);

  useEffect(() => {
    root.current?.querySelector(".opx-tk-lb__fi[data-on]")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [i]);

  const trap = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab" || !root.current) return;
    const all = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length);
    if (!all.length) return;
    const first = all[0];
    const last = all[all.length - 1];
    const to = e.shiftKey ? (document.activeElement === first ? last : null) : document.activeElement === last ? first : null;
    if (!to) return;
    e.preventDefault();
    to.focus();
  };

  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !ready) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: zoom > 1 ? pan.x : 0, py: zoom > 1 ? pan.y : 0 };
    if (zoom > 1) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || zoom <= 1) return;
    setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
  };
  const up = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || d.id !== e.pointerId || zoom > 1) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - d.y)) go(dx < 0 ? 1 : -1);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const r = a.downloadUrl ? await downloadTaskAttachment(a.downloadUrl) : { blob: await loadBlob(a), name: "" };
      saveBlob(r.blob, r.name || a.fileName);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const view = (
    <div ref={root} className="opx-tk-lb" role="dialog" aria-modal="true" aria-label={a.fileName || t("attachments.title")} onKeyDown={trap} data-info={info || undefined}>
      <div className="opx-tk-lb__glow" aria-hidden="true" style={ready ? { backgroundImage: `url("${img.url}")` } : undefined} />

      <header className="opx-tk-lb__bar">
        <div className="opx-tk-lb__title">
          <b title={a.fileName}>{a.fileName}</b>
          {many ? <span className="opx-num">{t("attachments.position", { n: i + 1, total: count })}</span> : null}
        </div>
        <div className="opx-tk-lb__tools">
          <div className="opx-tk-lb__zoom" role="group" aria-label={t("attachments.zoom")}>
            <button type="button" className="opx-tk-lb__btn" onClick={() => zoomTo(zoom / ZSTEP)} disabled={zoom <= ZMIN || !ready} aria-label={t("attachments.zoomOut")} title={t("attachments.zoomOut")}>
              <IcZoomOut size={18} />
            </button>
            <button type="button" className="opx-tk-lb__pct opx-num" onClick={() => zoomTo(1)} disabled={zoom === 1} aria-label={t("attachments.fit")} title={t("attachments.fit")}>
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="opx-tk-lb__btn" onClick={() => zoomTo(zoom * ZSTEP)} disabled={zoom >= ZMAX || !ready} aria-label={t("attachments.zoomIn")} title={t("attachments.zoomIn")}>
              <IcZoomIn size={18} />
            </button>
          </div>
          <button type="button" className="opx-tk-lb__btn" data-on={info || undefined} onClick={() => setInfo((v) => !v)} aria-pressed={info} aria-label={t("attachments.info")} title={t("attachments.info")}>
            <IcInfo size={18} />
          </button>
          <button type="button" className="opx-tk-lb__btn opx-tk-lb__btn--save" onClick={() => void save()} disabled={saving} aria-label={t("attachments.download")} title={saveFailed ? t("attachments.downloadError") : t("attachments.download")}>
            {saving ? <IcSpin size={18} /> : <IcDownload size={18} />}
            <span>{t("attachments.download")}</span>
          </button>
          <button ref={closeBtn} type="button" className="opx-tk-lb__btn" onClick={onClose} aria-label={t("attachments.close")} title={t("attachments.close")}>
            <IcClose size={18} />
          </button>
        </div>
      </header>

      <div className="opx-tk-lb__main">
        <div
          className="opx-tk-lb__stage"
          data-zoomed={zoom > 1 || undefined}
          data-dragging={dragging || undefined}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onWheel={(e) => {
            if (ready) zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
          }}
          onDoubleClick={() => {
            if (ready) zoomTo(zoom > 1 ? 1 : 2.5);
          }}
        >
          {bad ? (
            <div className="opx-tk-lb__state" role="alert">
              <IcImageOff size={30} />
              <b>{t("attachments.error")}</b>
              <button
                type="button"
                className="opx-pbtn"
                onClick={() => {
                  setBroken("");
                  setTick((n) => n + 1);
                }}
              >
                <IcRefresh size={16} />
                {t("retry")}
              </button>
            </div>
          ) : img.status === "ready" ? (
            <div key={img.url} className="opx-tk-lb__pic" data-dir={dir > 0 ? "next" : dir < 0 ? "prev" : undefined} style={{ transform: zoom > 1 ? `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` : undefined }}>
              <Image src={img.url} alt={a.note || a.fileName} fill sizes="100vw" unoptimized draggable={false} onError={() => setBroken(img.url)} />
            </div>
          ) : (
            <div className="opx-tk-lb__state" role="status">
              <IcSpin size={30} />
              <span>{t("attachments.loading")}</span>
            </div>
          )}
          {many ? (
            <>
              <button type="button" className="opx-tk-lb__nav" data-side="prev" onClick={() => go(-1)} aria-label={t("attachments.prev")}>
                <IcChevL size={22} />
              </button>
              <button type="button" className="opx-tk-lb__nav" data-side="next" onClick={() => go(1)} aria-label={t("attachments.next")}>
                <IcChevR size={22} />
              </button>
            </>
          ) : null}
          {zoom > 1 ? (
            <button type="button" className="opx-tk-lb__fit" onClick={() => zoomTo(1)}>
              <IcFit size={16} />
              {t("attachments.fit")}
            </button>
          ) : null}
        </div>

        {info ? (
          <aside className="opx-tk-lb__info" aria-label={t("attachments.info")}>
            <h3>{t("attachments.info")}</h3>
            {a.note ? (
              <blockquote className="opx-tk-lb__note">
                <IcNote size={16} />
                <span>{a.note}</span>
              </blockquote>
            ) : null}
            <dl className="opx-tk-lb__facts">
              {a.uploader?.name ? (
                <div>
                  <dt>{t("attachments.addedBy")}</dt>
                  <dd>
                    <Face id={a.uploader.id} name={a.uploader.name} size={24} />
                    <span>{a.uploader.name}</span>
                  </dd>
                </div>
              ) : null}
              {a.createdAt ? (
                <div>
                  <dt>{t("attachments.addedAt")}</dt>
                  <dd className="opx-num">{when(a.createdAt)}</dd>
                </div>
              ) : null}
              {a.sizeBytes ? (
                <div>
                  <dt>{t("attachments.size")}</dt>
                  <dd className="opx-num">{[sizeOf(a.sizeBytes), typeOf(a)].filter(Boolean).join(" · ")}</dd>
                </div>
              ) : null}
            </dl>
            {saveFailed ? <p className="opx-ferr">{t("attachments.downloadError")}</p> : null}
            <p className="opx-tk-lb__keys">{t("attachments.keys")}</p>
          </aside>
        ) : null}
      </div>

      {many ? (
        <nav className="opx-tk-lb__film" aria-label={t("attachments.title")}>
          {items.map((it, k) => (
            <Film key={it.id} a={it} on={k === i} label={t("attachments.open", { name: it.fileName })} onPick={() => go(k - i)} />
          ))}
        </nav>
      ) : null}
    </div>
  );
  return createPortal(view, document.body);
}
