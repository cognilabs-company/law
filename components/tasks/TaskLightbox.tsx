"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Download, HardDrive, ImageOff, Info, LoaderCircle, Maximize2, MessageSquareText, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { saveBlob } from "@/lib/download";
import { useLayer } from "@/lib/layers";
import { downloadTaskAttachment, type TaskAttachment } from "@/lib/services/taskManagement";
import { loadBlob, sizeOf, useImage } from "./attachmentImages";
import { Face, STROKE, useTaskText } from "./parts";

// A task's images full screen: the picture as large as the screen allows
// over a soft glow of its own colours, a filmstrip of the others, and who
// added it and when beside it. Zoom by wheel, buttons, keys or a double
// click, drag to look around, swipe or arrows to move on. Escape closes the
// viewer only — the task stays open underneath.

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.4;
// A small picture is drawn larger to fill the screen, but not past this
// many times its own size, where it would turn to mush.
const UPSCALE_MAX = 2.5;
const FOCUSABLE = 'button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])';

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
const typeOf = (a: TaskAttachment) => (a.mimeType.split("/")[1] || a.fileName.split(".").pop() || "").toUpperCase();

function FilmThumb({ a, active, onPick, label }: { a: TaskAttachment; active: boolean; onPick: () => void; label: string }) {
  const img = useImage(a, 0);
  return (
    <button type="button" className={`ttk-lb__film-it${active ? " is-on" : ""}`} onClick={onPick} aria-label={label} aria-current={active ? "true" : undefined}>
      {img.status === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element -- an authenticated blob, not a static asset
        <img src={img.url} alt="" draggable={false} />
      ) : img.status === "error" ? (
        <ImageOff aria-hidden strokeWidth={STROKE} />
      ) : (
        <span className="ttk-att__sk" />
      )}
    </button>
  );
}

export default function TaskLightbox({ items, start, onClose }: { items: TaskAttachment[]; start: number; onClose: () => void }) {
  const { t, when } = useTaskText();
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const [i, setI] = useState(start);
  const [dir, setDir] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [tick, setTick] = useState(0);
  const [broken, setBroken] = useState("");
  // The details panel starts open where there is room for it beside the picture.
  const [info, setInfo] = useState(() => window.matchMedia("(min-width: 900px)").matches);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<{ url: string; w: number; h: number } | null>(null);
  const count = items.length;
  const a = items[Math.min(i, count - 1)];
  const img = useImage(a, tick);
  const bad = img.status === "error" || (img.url !== "" && broken === img.url);
  const many = count > 1;
  const z = useLayer(true, { kind: "overlay", el: root, onEscape: onClose });

  function go(d: number) {
    if (count < 2) return;
    setDir(d);
    setI((n) => (n + d + count) % count);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBroken("");
    setSaveFailed(false);
  }
  function pick(k: number) {
    if (k === i) return;
    go(k - i);
  }
  function zoomTo(next: number) {
    const v = clampZoom(next);
    setZoom(v);
    if (v === 1) setPan({ x: 0, y: 0 });
  }

  // The page underneath stays put; focus goes into the viewer and back to
  // the thumbnail that opened it.
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      back?.focus();
    };
  }, []);

  // Arrows page, + and - zoom, 0 fits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === "ArrowRight" || k === "ArrowLeft") {
        if (count < 2) return;
        e.preventDefault();
        const d = k === "ArrowRight" ? 1 : -1;
        setDir(d);
        setI((n) => (n + d + count) % count);
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } else if (k === "+" || k === "=") {
        e.preventDefault();
        setZoom((v) => clampZoom(v * ZOOM_STEP));
      } else if (k === "-") {
        e.preventDefault();
        setZoom((v) => clampZoom(v / ZOOM_STEP));
      } else if (k === "0") {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  // The room the picture has, so it can fill it.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setRoom({ w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The filmstrip keeps the current picture in view.
  useEffect(() => {
    root.current?.querySelector(".ttk-lb__film-it.is-on")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [i]);

  // Tab stays inside the viewer.
  function trap(e: ReactKeyboardEvent) {
    if (e.key !== "Tab" || !root.current) return;
    const all = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length);
    if (!all.length) return;
    const first = all[0];
    const last = all[all.length - 1];
    const to = e.shiftKey ? (document.activeElement === first ? last : null) : document.activeElement === last ? first : null;
    if (!to) return;
    e.preventDefault();
    to.focus();
  }

  function down(e: ReactPointerEvent) {
    if (e.button !== 0 || img.status !== "ready" || bad) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: zoom > 1 ? pan.x : 0, py: zoom > 1 ? pan.y : 0, moved: false };
    if (zoom > 1) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
  }
  function move(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (zoom > 1) setPan({ x: d.px + dx, y: d.py + dy });
  }
  function up(e: ReactPointerEvent) {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || d.id !== e.pointerId || zoom > 1) return;
    // At fit size a sideways swipe moves to the next picture.
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - d.y)) go(dx < 0 ? 1 : -1);
  }

  async function save() {
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
  }

  const known = natural && natural.url === img.url ? natural : null;
  const fit = known && room.w > 0 && room.h > 0 ? Math.min(room.w / known.w, room.h / known.h, UPSCALE_MAX) : 0;
  const size = fit ? { width: Math.round(known!.w * fit), height: Math.round(known!.h * fit) } : null;

  const facts = [
    a.uploader?.name ? { icon: null, face: a.uploader, label: t("attachments.addedBy"), value: a.uploader.name } : null,
    a.createdAt ? { icon: CalendarDays, label: t("attachments.addedAt"), value: when(a.createdAt) } : null,
    a.sizeBytes ? { icon: HardDrive, label: t("attachments.size"), value: [sizeOf(a.sizeBytes), typeOf(a)].filter(Boolean).join(" · ") } : null,
  ].filter((f) => f !== null);

  const view = (
    <div
      ref={root}
      className="ttk-scope ttk-lb"
      style={{ zIndex: z }}
      role="dialog"
      aria-modal="true"
      aria-label={a.fileName || t("attachments.title")}
      onKeyDown={trap}
      data-info={info ? "" : undefined}
    >
      <div className="ttk-lb__glow" aria-hidden style={img.status === "ready" && !bad ? { backgroundImage: `url("${img.url}")` } : undefined} />

      <header className="ttk-lb__bar">
        <div className="ttk-lb__title">
          <strong title={a.fileName}>{a.fileName}</strong>
          {many ? <span className="ttk-lb__count">{t("attachments.position", { n: i + 1, total: count })}</span> : null}
        </div>
        <div className="ttk-lb__tools">
          <div className="ttk-lb__zoom" role="group" aria-label={t("attachments.zoom")}>
            <button type="button" className="ttk-lb__btn" onClick={() => zoomTo(zoom / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN || img.status !== "ready"} aria-label={t("attachments.zoomOut")} title={t("attachments.zoomOut")}>
              <ZoomOut aria-hidden strokeWidth={STROKE} />
            </button>
            <button type="button" className="ttk-lb__pct" onClick={() => zoomTo(1)} disabled={zoom === 1} aria-label={t("attachments.fit")} title={t("attachments.fit")}>
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="ttk-lb__btn" onClick={() => zoomTo(zoom * ZOOM_STEP)} disabled={zoom >= ZOOM_MAX || img.status !== "ready"} aria-label={t("attachments.zoomIn")} title={t("attachments.zoomIn")}>
              <ZoomIn aria-hidden strokeWidth={STROKE} />
            </button>
          </div>
          <button type="button" className={`ttk-lb__btn ttk-lb__btn--info${info ? " is-on" : ""}`} onClick={() => setInfo((v) => !v)} aria-pressed={info} aria-label={t("attachments.info")} title={t("attachments.info")}>
            <Info aria-hidden strokeWidth={STROKE} />
          </button>
          <button type="button" className="ttk-lb__btn ttk-lb__btn--save" onClick={() => void save()} disabled={saving} aria-label={t("attachments.download")} title={saveFailed ? t("attachments.downloadError") : t("attachments.download")}>
            {saving ? <LoaderCircle aria-hidden strokeWidth={STROKE} className="ttk-spin" /> : <Download aria-hidden strokeWidth={STROKE} />}
            <span>{t("attachments.download")}</span>
          </button>
          <button ref={closeBtn} type="button" className="ttk-lb__btn ttk-lb__btn--close" onClick={onClose} aria-label={t("attachments.close")} title={t("attachments.close")}>
            <X aria-hidden strokeWidth={STROKE} />
          </button>
        </div>
      </header>

      <div className="ttk-lb__main">
        <div
          ref={stage}
          className={`ttk-lb__stage${zoom > 1 ? " is-zoomed" : ""}${dragging ? " is-dragging" : ""}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => ((drag.current = null), setDragging(false))}
          onWheel={(e) => img.status === "ready" && !bad && zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
          onDoubleClick={() => img.status === "ready" && !bad && zoomTo(zoom > 1 ? 1 : 2.5)}
        >
          {bad ? (
            <div className="ttk-lb__state ttk-lb__state--err" role="alert">
              <span className="ttk-lb__state-ic">
                <ImageOff aria-hidden strokeWidth={STROKE} />
              </span>
              <strong>{t("attachments.error")}</strong>
              <button type="button" className="ttk-lb__pill" onClick={() => (setBroken(""), setTick((n) => n + 1))}>
                <RotateCcw aria-hidden strokeWidth={STROKE} />
                {t("retry")}
              </button>
            </div>
          ) : img.status === "ready" ? (
            // eslint-disable-next-line @next/next/no-img-element -- an authenticated blob, not a static asset
            <img
              key={img.url}
              className="ttk-lb__img"
              data-dir={dir > 0 ? "next" : dir < 0 ? "prev" : undefined}
              src={img.url}
              alt={a.note || a.fileName}
              draggable={false}
              onError={() => setBroken(img.url)}
              onLoad={(e) => setNatural({ url: img.url, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{ ...size, visibility: size ? undefined : "hidden", transform: zoom > 1 ? `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` : undefined }}
            />
          ) : (
            <div className="ttk-lb__state" role="status">
              <span className="ttk-lb__ring" aria-hidden />
              <span>{t("attachments.loading")}</span>
            </div>
          )}
          {many ? (
            <>
              <button type="button" className="ttk-lb__nav ttk-lb__nav--prev" onClick={() => go(-1)} aria-label={t("attachments.prev")}>
                <ChevronLeft aria-hidden strokeWidth={STROKE} />
              </button>
              <button type="button" className="ttk-lb__nav ttk-lb__nav--next" onClick={() => go(1)} aria-label={t("attachments.next")}>
                <ChevronRight aria-hidden strokeWidth={STROKE} />
              </button>
            </>
          ) : null}
          {zoom > 1 ? (
            <button type="button" className="ttk-lb__fit" onClick={() => zoomTo(1)}>
              <Maximize2 aria-hidden strokeWidth={STROKE} />
              {t("attachments.fit")}
            </button>
          ) : null}
        </div>

        {info ? (
          <aside className="ttk-lb__info" aria-label={t("attachments.info")}>
            <p className="ttk-lb__info-k">{t("attachments.info")}</p>
            {a.note ? (
              <blockquote className="ttk-lb__note">
                <MessageSquareText aria-hidden strokeWidth={STROKE} />
                <span>{a.note}</span>
              </blockquote>
            ) : null}
            <dl className="ttk-lb__facts">
              {facts.map((f) => (
                <div key={f.label} className="ttk-lb__fact">
                  <dt>{f.label}</dt>
                  <dd>
                    {"face" in f && f.face ? <Face id={f.face.id} name={f.face.name} size={24} /> : f.icon ? <f.icon aria-hidden strokeWidth={STROKE} /> : null}
                    <span>{f.value}</span>
                  </dd>
                </div>
              ))}
            </dl>
            {saveFailed ? <p className="ttk-lb__err">{t("attachments.downloadError")}</p> : null}
            <p className="ttk-lb__keys">{t("attachments.keys")}</p>
          </aside>
        ) : null}
      </div>

      {many ? (
        <nav className="ttk-lb__film" aria-label={t("attachments.title")}>
          {items.map((it, k) => (
            <FilmThumb key={it.id} a={it} active={k === i} onPick={() => pick(k)} label={t("attachments.open", { name: it.fileName })} />
          ))}
        </nav>
      ) : null}
    </div>
  );
  return createPortal(view, document.body);
}
