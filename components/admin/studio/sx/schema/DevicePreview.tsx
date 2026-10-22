"use client";

import "./sx-device.css";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { SxSegmented } from "../shared/Segmented";

// A page drawn at a real screen width. The content is rendered into a
// same-origin iframe (through a portal, so it keeps the app's providers),
// with the app's own styles copied in — so the site's media queries answer
// to the frame's width exactly as they would on that device. Desktop comes
// first; tablet and phone are a click away, and the right edge can be
// dragged to any width in between. A frame wider than the room is scaled
// down to fit, never cut.

type Device = "desktop" | "tablet" | "phone";

const PRESET: Readonly<Record<Device, { w: number; h: number }>> = {
  desktop: { w: 1280, h: 760 },
  tablet: { w: 820, h: 980 },
  phone: { w: 390, h: 780 },
};
const MIN_W = 320;
const MAX_W = 1600;

const deviceOf = (w: number): Device => (w >= 1024 ? "desktop" : w >= 600 ? "tablet" : "phone");

// Copies the host page's stylesheets into the frame and keeps them in step
// (Next adds styles as components first render).
function mirrorStyles(doc: Document): () => void {
  const copy = (n: Node) => {
    if (!(n instanceof HTMLStyleElement || (n instanceof HTMLLinkElement && n.rel === "stylesheet"))) return;
    doc.head.appendChild(n.cloneNode(true));
  };
  document.head.querySelectorAll("style, link[rel='stylesheet']").forEach(copy);
  const mo = new MutationObserver((list) => {
    for (const m of list) m.addedNodes.forEach(copy);
  });
  mo.observe(document.head, { childList: true });
  return () => mo.disconnect();
}

// The frame's <html> and <body> follow the host's theme, fonts and language.
function mirrorRoot(doc: Document): () => void {
  const sync = () => {
    const src = document.documentElement;
    const dst = doc.documentElement;
    dst.className = src.className;
    dst.lang = src.lang;
    for (const a of ["data-theme", "dir", "style"]) {
      const v = src.getAttribute(a);
      if (v === null) dst.removeAttribute(a);
      else dst.setAttribute(a, v);
    }
    doc.body.className = `${document.body.className} sx-dev-body`;
  };
  sync();
  const mo = new MutationObserver(sync);
  mo.observe(document.documentElement, { attributes: true });
  return () => mo.disconnect();
}

export function DevicePreview({ children, address, label }: { children: ReactNode; address: string; label: string }): ReactElement {
  const t = useTranslations("studio");
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const drag = useRef<{ x: number; w: number; id: number } | null>(null);
  const [width, setWidth] = useState(PRESET.desktop.w);
  const [room, setRoom] = useState(0);
  const [doc, setDoc] = useState<Document | null>(null);
  const device = deviceOf(width);
  const height = PRESET[device].h;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom(el.clientWidth));
    ro.observe(el);
    setRoom(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!doc) return;
    const a = mirrorStyles(doc);
    const b = mirrorRoot(doc);
    return () => {
      a();
      b();
    };
  }, [doc]);

  const bezel = device === "desktop" ? 0 : 28;
  const outer = width + bezel;
  const scale = room > 0 ? Math.min(1, (room - 24) / outer) : 1;

  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width, id: e.pointerId };
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Dragging moves the edge on screen; the frame is scaled, so undo that.
    setWidth(Math.round(Math.min(MAX_W, Math.max(MIN_W, d.w + (e.clientX - d.x) / scale))));
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <div className="sx-dev" data-device={device}>
      <div className="sx-dev__bar">
        <SxSegmented<Device>
          items={[
            { value: "desktop", label: t("sx.dev.desktop"), icon: Monitor, aiId: "admin.studio.editor.device.desktop" },
            { value: "tablet", label: t("sx.dev.tablet"), icon: Tablet, aiId: "admin.studio.editor.device.tablet" },
            { value: "phone", label: t("sx.dev.phone"), icon: Smartphone, aiId: "admin.studio.editor.device.phone" },
          ]}
          value={device}
          onChange={(d) => setWidth(PRESET[d].w)}
          label={t("sx.dev.device")}
          size="sm"
          aiId="admin.studio.editor.device"
        />
        <span className="sx-dev__size" aria-live="polite">
          {t("sx.dev.size", { w: width, h: height, pct: Math.round(scale * 100) })}
        </span>
        <span className="sx-dev__tip">{t("sx.dev.tip")}</span>
      </div>
      <div className="sx-dev__room" ref={box} style={{ height: (height + (device === "desktop" ? 38 : bezel)) * scale + 8 }}>
        <div className="sx-dev__scaled" style={{ width: outer, left: Math.max(12, (room - outer * scale) / 2), transform: `scale(${scale})` }}>
          <div className="sx-dev__device">
            {device === "desktop" ? (
              <div className="sx-dev__chrome" aria-hidden="true">
                <i />
                <i />
                <i />
                <span>{address}</span>
              </div>
            ) : (
              <span className="sx-dev__notch" aria-hidden="true" />
            )}
            <iframe
              ref={frame}
              className="sx-dev__screen"
              title={label}
              style={{ width, height }}
              srcDoc="<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head><body></body></html>"
              onLoad={(e) => setDoc(e.currentTarget.contentDocument)}
            />
            <button
              type="button"
              className="sx-dev__grip"
              aria-label={t("sx.dev.resize")}
              title={t("sx.dev.resize")}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  setWidth((w) => Math.min(MAX_W, Math.max(MIN_W, w + (e.key === "ArrowRight" ? 20 : -20))));
                }
              }}
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {doc ? createPortal(children, doc.body) : null}
    </div>
  );
}
