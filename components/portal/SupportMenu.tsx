"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/lib/auth";
import BusinessHoursBadge from "@/components/portal/BusinessHoursBadge";
import { SUPPORT_PHONE, SUPPORT_TEL } from "@/components/support/contact";
import { IconAlert, IconArrowRight, IconHeadset, IconPhone } from "@/components/icons";

export default function SupportMenu({ role }: { role: Role }) {
  const t = useTranslations("portal.support");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const client = role === "client";
  const hub = `/portal/${role}/support`;
  const done = () => setOpen(false);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="psup" ref={box} data-ai-target="header:support">
      <button
        ref={btn}
        type="button"
        data-ai-target="button:support"
        data-ai-id="support.menu.open"
        className={`psup__btn${open ? " psup__btn--on" : ""}`}
        aria-label={t("label")}
        title={t("label")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="psup__wave" aria-hidden="true" />
        <span className="psup__wave psup__wave--late" aria-hidden="true" />
        <IconHeadset />
      </button>
      {open ? (
        <div className="psup__menu" role="menu" aria-label={t("title")} ref={menu} onKeyDown={onMenuKey}>
          <div className="psup__head">
            <strong>{t("title")}</strong>
            <span>{t("sub")}</span>
          </div>
          <Link role="menuitem" href={`${hub}?new=1`} className="psup__it" onClick={done} data-ai-id="support.menu.operator">
            <span className="psup__ic psup__ic--op" aria-hidden="true">
              <IconHeadset />
            </span>
            <span className="psup__tx">
              <b>{t("operator")}</b>
              <small>{t("operatorSub")}</small>
            </span>
          </Link>
          {client ? (
            <Link role="menuitem" href="/portal/client/complaints?new=1" className="psup__it" onClick={done} data-ai-id="support.menu.complaint">
              <span className="psup__ic psup__ic--case" aria-hidden="true">
                <IconAlert />
              </span>
              <span className="psup__tx">
                <b>{t("complaint")}</b>
                <small>{t("complaintSub")}</small>
              </span>
            </Link>
          ) : null}
          <a role="menuitem" href={`tel:${SUPPORT_TEL}`} className="psup__it" onClick={done} data-ai-id="support.menu.call" data-ai-type="call_button">
            <span className="psup__ic psup__ic--call" aria-hidden="true">
              <IconPhone />
            </span>
            <span className="psup__tx">
              <b>{t("call")}</b>
              <small className="psup__tel">{SUPPORT_PHONE}</small>
              <BusinessHoursBadge />
            </span>
          </a>
          <Link role="menuitem" href={hub} className="psup__all" onClick={done} data-ai-id="support.menu.hub">
            {t("hub")}
            <IconArrowRight aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
