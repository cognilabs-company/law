"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CC_STATUSES, setCcStatus, shiftClock, useCcNow, useCcShift, type CcStatus } from "@/lib/callcenter/ccOperator";
import { IcCheck, IcChevron, IcClock } from "./icons";

const HOTKEY: Partial<Record<string, CcStatus>> = { A: "available", B: "busy", P: "break", W: "wrap" };

export default function CcxStatus() {
  const t = useTranslations("admin.cc");
  const shift = useCcShift();
  const now = useCcNow();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))) return;
      const next = HOTKEY[e.key.toUpperCase()];
      if (!next) return;
      e.preventDefault();
      setCcStatus(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="opx-status">
      <div className="opx-st" ref={box}>
        <button
          type="button"
          className="opx-st__btn"
          data-st={shift.status}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`${t("statusLabel")}: ${t(`status.${shift.status}`)}`}
          onClick={() => setOpen((v) => !v)}
          data-ai-id="call_center.operator.status"
        >
          <span className="opx-st__dot" aria-hidden="true" />
          <b>{t(`status.${shift.status}`)}</b>
          <IcChevron size={15} className="opx-st__chev" />
        </button>
        {open ? (
          <div className="opx-st__menu" role="menu" aria-label={t("statusLabel")}>
            {CC_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={shift.status === s}
                className={`opx-st__opt${shift.status === s ? " is-on" : ""}`}
                data-st={s}
                onClick={() => {
                  setCcStatus(s);
                  setOpen(false);
                }}
              >
                <span className="opx-st__dot" aria-hidden="true" />
                <span className="opx-st__name">{t(`status.${s}`)}</span>
                <kbd>{t(`key.${s}`)}</kbd>
                {shift.status === s ? <IcCheck size={16} className="opx-st__ok" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <span className="opx-clock" title={t("shift")} aria-label={`${t("shift")}: ${shiftClock(shift.shiftStart, now)}`}>
        <IcClock size={17} />
        <b className="opx-num">{shiftClock(shift.shiftStart, now)}</b>
      </span>
    </div>
  );
}
