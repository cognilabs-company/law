"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CC_STATUSES, setCcStatus, shiftClock, useCcNow, useCcShift, type CcStatus } from "@/lib/callcenter/ccOperator";

const TONE: Record<CcStatus, string> = { available: "ok", busy: "hot", break: "warn", wrap: "calm" };
const HOTKEY: Partial<Record<string, CcStatus>> = { A: "available", B: "busy", P: "break", W: "wrap" };

export default function CcStatusMenu({ open: openCount }: { open: number | null }) {
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
    <div className="ccst" ref={box}>
      <button
        type="button"
        className="ccst__btn"
        data-tone={TONE[shift.status]}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        data-ai-id="call_center.operator.status"
      >
        <i className="ccst__dot" aria-hidden="true" />
        <span className="ccst__now">{t(`status.${shift.status}`)}</span>
        <span className="ccst__sr">{t("statusLabel")}</span>
      </button>

      <span className="ccst__meta">
        <b className="cc-num">{shiftClock(shift.shiftStart, now)}</b>
        <small>{t("shift")}</small>
      </span>
      {typeof openCount === "number" ? (
        <span className="ccst__meta" data-tone={openCount > 0 ? "hot" : "ok"}>
          <b className="cc-num">{openCount}</b>
          <small>{t("openWork")}</small>
        </span>
      ) : null}

      {open ? (
        <div className="ccst__menu" role="menu">
          {CC_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={shift.status === s}
              className={`ccst__opt${shift.status === s ? " on" : ""}`}
              data-tone={TONE[s]}
              onClick={() => {
                setCcStatus(s);
                setOpen(false);
              }}
            >
              <i aria-hidden="true" />
              <span>{t(`status.${s}`)}</span>
              <kbd aria-hidden="true">{t(`key.${s}`)}</kbd>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
