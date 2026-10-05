"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/lib/auth";
import { IconAlert, IconHeadset, IconPhone, IconSparkle } from "@/components/icons";

const SUPPORT_TEL = "+998787770000";
const SUPPORT_PHONE = "+998 78 777 00 00";

export default function SupportMenu({ role }: { role: Role }) {
  const t = useTranslations("portal.support");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const client = role === "client";
  const done = () => setOpen(false);

  return (
    <div className="psup" ref={box} data-ai-target="ai-help:current-page">
      <button type="button" data-ai-target="button:support" className={`psup__btn${open ? " psup__btn--on" : ""}`} aria-label={t("label")} title={t("label")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="psup__wave" aria-hidden="true" />
        <span className="psup__wave psup__wave--late" aria-hidden="true" />
        <IconHeadset />
      </button>
      {open ? (
        <div className="psup__menu" role="menu">
          <div className="psup__head">
            <strong>{t("title")}</strong>
            <span>{t("sub")}</span>
          </div>
          {client ? (
            <Link role="menuitem" href="/portal/client/ai" className="psup__it" onClick={done}>
              <span className="psup__ic psup__ic--ai">
                <IconSparkle />
              </span>
              <span className="psup__tx">
                <b>{t("ai")}</b>
                <small>{t("aiSub")}</small>
              </span>
            </Link>
          ) : null}
          {client ? (
            <Link role="menuitem" href="/portal/client/complaints" className="psup__it" onClick={done}>
              <span className="psup__ic psup__ic--case">
                <IconAlert />
              </span>
              <span className="psup__tx">
                <b>{t("complaint")}</b>
                <small>{t("complaintSub")}</small>
              </span>
            </Link>
          ) : null}
          <a role="menuitem" href={`tel:${SUPPORT_TEL}`} className="psup__it" onClick={done}>
            <span className="psup__ic psup__ic--call">
              <IconPhone />
            </span>
            <span className="psup__tx">
              <b>{t("call")}</b>
              <small>{SUPPORT_PHONE}</small>
            </span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
