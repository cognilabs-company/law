"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { IconClose } from "@/components/icons";
import { setDeskOs, type DeskOs } from "./deskMode";

const OSES: DeskOs[] = ["win", "mac"];

// Before the desktop opens: which computer it should look like. Each choice
// shows a small picture of that desktop — the taskbar and Start button of
// one, the menu bar and Dock of the other.
export default function OsPicker({ current, onPick, onClose }: { current: DeskOs; onPick: (os: DeskOs) => void; onClose: () => void }) {
  const t = useTranslations("portal.desk.os");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>(`[data-os="${current}"]`)?.focus();
  }, [current]);
  return (
    <div
      className="osp"
      role="dialog"
      aria-modal="true"
      aria-labelledby="osp-t"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const other = (document.activeElement as HTMLElement | null)?.dataset.os === "win" ? "mac" : "win";
          ref.current?.querySelector<HTMLButtonElement>(`[data-os="${other}"]`)?.focus();
        }
      }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="osp__card" ref={ref}>
        <button type="button" className="osp__x" onClick={onClose} aria-label={t("close")}>
          <IconClose />
        </button>
        <h2 id="osp-t">{t("title")}</h2>
        <p>{t("lead")}</p>
        <div className="osp__opts">
          {OSES.map((os) => (
            <button
              key={os}
              type="button"
              data-os={os}
              className={`osp__opt osp__opt--${os}${os === current ? " is-last" : ""}`}
              onClick={() => {
                setDeskOs(os);
                onPick(os);
              }}
            >
              <span className="osp__pic" aria-hidden>
                {os === "win" ? (
                  <>
                    <i className="osp__win" />
                    <i className="osp__winbar">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </i>
                  </>
                ) : (
                  <>
                    <i className="osp__menubar" />
                    <i className="osp__macwin">
                      <i />
                      <i />
                      <i />
                    </i>
                    <i className="osp__dock">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </i>
                  </>
                )}
              </span>
              <b>{t(`${os}.name`)}</b>
              <small>{t(`${os}.text`)}</small>
              {os === current ? <em>{t("last")}</em> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
