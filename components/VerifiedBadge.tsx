"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";

const SRC = "/img/tasdiqlovchi-badge.webp";

type Props = {
  name?: string;
  subtitle?: string;
  label?: boolean;
  text?: string;
  size?: "sm" | "md" | "lg";
  tone?: "light" | "glass";
  interactive?: boolean;
  className?: string;
};

export default function VerifiedBadge({ name, subtitle, label = true, text, size = "sm", tone = "light", interactive = true, className }: Props) {
  const t = useTranslations("verifiedBadge");
  const locale = useLocale();
  const shown = text && locale === "uz" ? text : t("label");
  const ref = useRef<HTMLElement | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const [open, setOpen] = useState(false);

  const showTip = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.top < 56;
    setTip({ x: Math.min(Math.max(r.left + r.width / 2, 120), window.innerWidth - 120), y: below ? r.bottom + 8 : r.top - 8, below });
  }, []);
  const hideTip = useCallback(() => setTip(null), []);

  const tipOn = tip !== null;
  useEffect(() => {
    if (!tipOn) return;
    window.addEventListener("scroll", hideTip, true);
    window.addEventListener("resize", hideTip);
    return () => {
      window.removeEventListener("scroll", hideTip, true);
      window.removeEventListener("resize", hideTip);
    };
  }, [tipOn, hideTip]);

  const cls = `vbadge vbadge--${size} vbadge--${tone}${label ? "" : " vbadge--icon"}${className ? ` ${className}` : ""}`;
  const body = (
    <>
      <span className="vbadge__img">
        <Image src={SRC} alt="" width={40} height={40} />
      </span>
      {label ? <span className="vbadge__t">{shown}</span> : null}
    </>
  );
  const tipNode =
    tip && typeof document !== "undefined"
      ? createPortal(
          <span role="tooltip" className={`vbadge-tip${tip.below ? " is-below" : ""}`} style={{ left: tip.x, top: tip.y }}>
            <Image src={SRC} alt="" width={16} height={16} />
            {t("tip")}
          </span>,
          document.body,
        )
      : null;

  if (!interactive) {
    return (
      <span ref={(el) => { ref.current = el; }} className={cls} aria-label={t("tip")} onMouseEnter={showTip} onMouseLeave={hideTip}>
        {body}
        {tipNode}
      </span>
    );
  }

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTip(null);
    setOpen(true);
  };

  return (
    <>
      <button
        ref={(el) => { ref.current = el; }}
        type="button"
        className={cls}
        aria-label={t("tip")}
        aria-haspopup="dialog"
        onClick={onClick}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        {body}
      </button>
      {tipNode}
      {open ? <VerifiedModal name={name} subtitle={subtitle} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function VerifiedModal({ name, subtitle, onClose }: { name?: string; subtitle?: string; onClose: () => void }) {
  const t = useTranslations("verifiedBadge");
  const okRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      size="sm"
      closeLabel={t("close")}
      initialFocus={okRef}
      footer={
        <button ref={okRef} type="button" className="btn btn--pri vmodal__okbtn" onClick={onClose}>
          {t("ok")}
        </button>
      }
    >
      <div className="vmodal__hero">
        <span className="vmodal__ring" aria-hidden="true" />
        <span className="vmodal__seal">
          <Image src={SRC} alt="" width={96} height={96} />
        </span>
        <span className="vmodal__kicker">{t("kicker")}</span>
        <p className="vmodal__name" aria-hidden="true">
          {t("title")}
        </p>
        {name ? (
          <p className="vmodal__who">
            <b>{name}</b>
            {subtitle ? <span>{subtitle}</span> : null}
          </p>
        ) : null}
      </div>
      <p className="vmodal__desc">{t("description")}</p>
    </Modal>
  );
}
