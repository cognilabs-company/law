"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { CCX_BACKGROUNDS, CCX_THEMES, setCcxPrefs, type CcxPrefs } from "@/lib/ccx/prefs";
import { IcCheck, IcClose, IcKeys, IcMoon, IcSun, IcWave } from "./icons";

export default function CcxAppearance({ prefs, onClose }: { prefs: CcxPrefs; onClose: () => void }) {
  const t = useTranslations("admin.ccx.look");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="opx-look" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="opx-look__panel" role="dialog" aria-modal="true" aria-labelledby="opx-look-title" ref={panel}>
        <header className="opx-look__head">
          <div>
            <h2 id="opx-look-title">{t("title")}</h2>
            <p>{t("lead")}</p>
          </div>
          <button type="button" className="opx-ibtn" onClick={onClose} aria-label={t("close")}>
            <IcClose size={18} />
          </button>
        </header>

        <section className="opx-look__sec" aria-labelledby="opx-look-theme">
          <h3 id="opx-look-theme">{t("theme")}</h3>
          <div className="opx-look__themes" role="radiogroup" aria-labelledby="opx-look-theme">
            {CCX_THEMES.map((th) => (
              <button key={th} type="button" role="radio" aria-checked={prefs.theme === th} className={`opx-look__theme${prefs.theme === th ? " is-on" : ""}`} data-th={th} onClick={() => setCcxPrefs({ theme: th })}>
                <span className="opx-look__swatch" data-th={th} data-bg={prefs.bg} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="opx-look__name">
                  {th === "dark" ? <IcMoon size={17} /> : <IcSun size={17} />}
                  {t(`themes.${th}`)}
                </span>
                {prefs.theme === th ? <IcCheck size={16} className="opx-look__ok" /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="opx-look__sec" aria-labelledby="opx-look-bg">
          <h3 id="opx-look-bg">{t("background")}</h3>
          <div className="opx-look__bgs" role="radiogroup" aria-labelledby="opx-look-bg">
            {CCX_BACKGROUNDS.map((b) => (
              <button key={b} type="button" role="radio" aria-checked={prefs.bg === b} className={`opx-look__bg${prefs.bg === b ? " is-on" : ""}`} onClick={() => setCcxPrefs({ bg: b })}>
                <span className="opx-look__thumb" data-th={prefs.theme} data-bg={b} aria-hidden="true">
                  <i />
                </span>
                <span className="opx-look__bname">{t(`bgs.${b}`)}</span>
                {prefs.bg === b ? <IcCheck size={14} className="opx-look__ok" /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="opx-look__sec">
          <label className="opx-look__switch">
            <span className="opx-look__swic" aria-hidden="true">
              <IcWave size={18} />
            </span>
            <span className="opx-look__swtxt">
              <b>{t("motion")}</b>
              <small>{t("motionHint")}</small>
            </span>
            <input type="checkbox" role="switch" checked={prefs.motion} onChange={(e) => setCcxPrefs({ motion: e.target.checked })} />
            <i className="opx-look__toggle" aria-hidden="true" />
          </label>
          <label className="opx-look__switch">
            <span className="opx-look__swic" aria-hidden="true">
              <IcKeys size={18} />
            </span>
            <span className="opx-look__swtxt">
              <b>{t("keys")}</b>
              <small>{t("keysHint")}</small>
            </span>
            <input type="checkbox" role="switch" checked={prefs.keys} onChange={(e) => setCcxPrefs({ keys: e.target.checked })} />
            <i className="opx-look__toggle" aria-hidden="true" />
          </label>
        </section>
      </div>
    </div>,
    document.body,
  );
}
