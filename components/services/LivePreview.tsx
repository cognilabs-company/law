"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconChevronDown, IconLock, IconMonitor, IconSmartphone } from "@/components/icons";

export type PreviewDevice = "desktop" | "mobile";

export type PreviewScene = { key: string; label: string; width: number; render: (device: PreviewDevice) => ReactNode };

const PHONE = 375;
const DEVICES: { value: PreviewDevice; Icon: typeof IconMonitor }[] = [
  { value: "desktop", Icon: IconMonitor },
  { value: "mobile", Icon: IconSmartphone },
];

function Fit({ width, children }: { width: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ k: 1, h: 0 });
  useEffect(() => {
    const b = box.current;
    const p = page.current;
    if (!b || !p || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const k = Math.min(1, b.clientWidth / width);
      const h = Math.ceil(p.offsetHeight * k);
      setFit((cur) => (Math.abs(cur.k - k) < 0.001 && cur.h === h ? cur : { k, h }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(p);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={box} className="lpv__fit" style={fit.h ? { height: fit.h } : undefined}>
      <div ref={page} className="lpv__vp" style={{ width, transform: fit.k < 1 ? `scale(${fit.k})` : undefined }}>
        {children}
      </div>
    </div>
  );
}

export default function LivePreview({ scenes, notice, foot, className }: { scenes: PreviewScene[]; notice?: ReactNode; foot?: string; className?: string }) {
  const t = useTranslations("sellerServices.preview");
  const [device, setDevice] = useState<PreviewDevice>(() => (typeof window !== "undefined" && window.matchMedia("(max-width: 560px)").matches ? "mobile" : "desktop"));
  const [open, setOpen] = useState(true);
  return (
    <section className={`lpv${open ? "" : " is-closed"}${className ? ` ${className}` : ""}`} aria-label={t("title")}>
      <div className="lpv__bar">
        <button type="button" className="lpv__t" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="lpv__live" aria-hidden="true" />
          <span>{t("title")}</span>
          <IconChevronDown className="lpv__chev" aria-hidden="true" />
        </button>
        {open ? (
          <div className="lpv__dev" role="radiogroup" aria-label={t("device")}>
            {DEVICES.map(({ value, Icon }) => (
              <button key={value} type="button" role="radio" aria-checked={device === value} className={device === value ? "is-on" : undefined} onClick={() => setDevice(value)}>
                <Icon aria-hidden="true" />
                <span>{t(value)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {open ? (
        <>
          {notice}
          <div className="lpv__scenes">
            {scenes.map((s) => (
              <figure key={s.key} className="lpv__scene">
                <figcaption>{s.label}</figcaption>
                <div className={`lpv__frame lpv__frame--${device}`} inert data-ai-ignore="">
                  <Fit width={device === "mobile" ? PHONE : s.width}>
                    <div className={`mk lpv__page lpv--${device === "mobile" ? "m" : "d"}`}>{s.render(device)}</div>
                  </Fit>
                </div>
              </figure>
            ))}
          </div>
          <p className="lpv__foot">
            <IconLock aria-hidden="true" />
            <span>{foot ?? t("foot")}</span>
          </p>
        </>
      ) : null}
    </section>
  );
}
