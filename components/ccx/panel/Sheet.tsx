"use client";

import "./panel.css";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { IcClose } from "../icons";

type Props = {
  label: string;
  head: ReactNode;
  onClose: () => void;
  dirty?: boolean;
  wide?: boolean;
  children: ReactNode;
};

export default function Sheet({ label, head, onClose, dirty = false, wide = false, children }: Props) {
  const t = useTranslations("admin.ccx.panel");
  const box = useRef<HTMLDivElement>(null);
  const [warn, setWarn] = useState(false);

  const tryClose = useCallback(() => {
    if (dirty && !warn) {
      setWarn(true);
      return;
    }
    onClose();
  }, [dirty, warn, onClose]);

  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.focus({ preventScroll: true });
    const keep = (e: FocusEvent) => {
      const panel = box.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target) && !(e.target instanceof Element && e.target.closest("[data-layer-soft], .opx-sheet__keep"))) panel.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", keep);
    const root = document.documentElement;
    root.classList.add("opx-sheet-open");
    return () => {
      document.removeEventListener("focusin", keep);
      root.classList.remove("opx-sheet-open");
      back?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      tryClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryClose]);

  return createPortal(
    <div className="opx-sheet">
      <div className="opx-sheet__scrim" onClick={tryClose} aria-hidden="true" />
      <div className={`opx-sheet__panel${wide ? " opx-sheet__panel--wide" : ""}`} role="dialog" aria-modal="true" aria-label={label} ref={box} tabIndex={-1}>
        <header className="opx-sheet__head">
          {head}
          <button type="button" className="opx-sheet__x" onClick={tryClose} aria-label={t("close")} title={t("close")}>
            <IcClose size={18} />
          </button>
        </header>
        {warn ? (
          <p className="opx-sheet__warn" role="alert">
            <span>{t("unsaved")}</span>
            <button type="button" onClick={onClose}>
              {t("discard")}
            </button>
            <button type="button" onClick={() => setWarn(false)}>
              {t("keep")}
            </button>
          </p>
        ) : null}
        <div className="opx-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
