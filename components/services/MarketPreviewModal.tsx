"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconClose, IconEye, IconMonitor, IconSmartphone, IconTablet } from "@/components/icons";
import { PREVIEW_DRAFT, PREVIEW_META, PREVIEW_PATH, PREVIEW_READY, type PreviewDraft, type PreviewView } from "@/lib/marketPreview";
import { useLayer } from "@/lib/layers";
import { InBody } from "./bits";

type Device = "desktop" | "tablet" | "mobile";

const DEVICES: { value: Device; width: number; Icon: typeof IconMonitor }[] = [
  { value: "desktop", width: 1280, Icon: IconMonitor },
  { value: "tablet", width: 820, Icon: IconTablet },
  { value: "mobile", width: 390, Icon: IconSmartphone },
];
const GUTTER = 40;
const FOCUSABLE = 'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

function startDevice(): Device {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 700 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop";
}

export default function MarketPreviewModal({
  open,
  draft,
  views,
  subtitle,
  onClose,
}: {
  open: boolean;
  draft: PreviewDraft;
  views: PreviewView[];
  subtitle?: string;
  onClose: () => void;
}) {
  const t = useTranslations("sellerServices.preview");
  const locale = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const sent = useRef("");
  const [view, setView] = useState<PreviewView>(views[0] ?? "market");
  const [device, setDevice] = useState<Device>(startDevice);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const payload = JSON.stringify({ draft, view });

  useEffect(() => {
    closeRef.current = onClose;
  });
  const z = useLayer(open, { kind: "overlay", el: panel, backdrop: root, onEscape: () => closeRef.current() });

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>(".mpv__x")?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (before?.isConnected) before.focus?.();
    };
  }, [open]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const data = e.data as { type?: string } | null;
      if (data?.type === PREVIEW_READY) setReady(true);
      if (data?.type === PREVIEW_META) setLoaded(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready || sent.current === payload || (!open && sent.current)) return;
    sent.current = payload;
    frame.current?.contentWindow?.postMessage({ type: PREVIEW_DRAFT, ...JSON.parse(payload) }, window.location.origin);
  }, [ready, payload, open]);

  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const dev = DEVICES.find((d) => d.value === device) ?? DEVICES[0];
  const k = box.w ? Math.min(1, (box.w - GUTTER) / dev.width) : 1;
  const height = box.h ? Math.max(320, (box.h - GUTTER) / k) : 720;

  return (
    <InBody>
      <div className={`mpv${open ? "" : " is-off"}`} ref={root} role="presentation" style={{ zIndex: z }} aria-hidden={open ? undefined : true}>
        <div className="mpv__panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="mpv-title" onKeyDown={trap}>
          <header className="mpv__head">
            <div className="mpv__t">
              <span className="mpv__ic" aria-hidden="true">
                <IconEye />
              </span>
              <div>
                <b id="mpv-title">{t("title")}</b>
                {subtitle ? <small>{subtitle}</small> : null}
              </div>
            </div>
            {views.length > 1 ? (
              <div className="mpv__seg" role="radiogroup" aria-label={t("views")}>
                {views.map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "is-on" : undefined} onClick={() => setView(v)}>
                    {t(v === "market" ? "viewMarket" : "viewProfile")}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mpv__seg mpv__seg--dev" role="radiogroup" aria-label={t("device")}>
              {DEVICES.map(({ value, Icon }) => (
                <button key={value} type="button" role="radio" aria-checked={device === value} className={device === value ? "is-on" : undefined} onClick={() => setDevice(value)} title={t(value)}>
                  <Icon aria-hidden="true" />
                  <span>{t(value)}</span>
                </button>
              ))}
            </div>
            <button type="button" className="mpv__x" onClick={() => closeRef.current()} aria-label={t("close")} title={t("close")}>
              <IconClose aria-hidden="true" />
            </button>
          </header>

          <div className="mpv__stage" ref={stage}>
            <div className={`mpv__device mpv__device--${device}`} style={{ width: dev.width * k, height: height * k }}>
              <iframe
                ref={frame}
                src={`/${locale}${PREVIEW_PATH}`}
                title={t("frameTitle")}
                tabIndex={open ? undefined : -1}
                style={{ width: dev.width, height, transform: k < 1 ? `scale(${k})` : undefined }}
              />
            </div>
            {loaded ? null : (
              <div className="mpv__load" role="status">
                <span className="mpv__spin" aria-hidden="true" />
                {t("loading")}
              </div>
            )}
          </div>
        </div>
      </div>
    </InBody>
  );
}
