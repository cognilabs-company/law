"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconClose, IconFileText, IconLock, IconPhone, IconShieldCheck, IconStarRate, IconUser, IconAlert, IconCheck } from "@/components/icons";

const SRC = "/img/tasdiqlovchi-badge.webp";

type Props = {
  name?: string;
  subtitle?: string;
  label?: boolean;
  size?: "sm" | "md" | "lg";
  tone?: "light" | "glass";
  interactive?: boolean;
  className?: string;
};

export default function VerifiedBadge({ name, subtitle, label = true, size = "sm", tone = "light", interactive = true, className }: Props) {
  const t = useTranslations("verifiedBadge");
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
    window.addEventListener("scroll", showTip, true);
    window.addEventListener("resize", showTip);
    return () => {
      window.removeEventListener("scroll", showTip, true);
      window.removeEventListener("resize", showTip);
    };
  }, [tipOn, showTip]);

  const cls = `vbadge vbadge--${size} vbadge--${tone}${label ? "" : " vbadge--icon"}${className ? ` ${className}` : ""}`;
  const body = (
    <>
      <span className="vbadge__img">
        <Image src={SRC} alt="" width={40} height={40} />
      </span>
      {label ? <span className="vbadge__t">{t("label")}</span> : null}
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

  useEffect(() => {
    okRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const checks = [
    { Icon: IconPhone, k: "c1" },
    { Icon: IconFileText, k: "c2" },
    { Icon: IconUser, k: "c3" },
    { Icon: IconShieldCheck, k: "c4" },
  ];
  const means = [
    { Icon: IconLock, k: "m1" },
    { Icon: IconStarRate, k: "m2" },
    { Icon: IconAlert, k: "m3" },
  ];
  const stop = (e: MouseEvent) => e.stopPropagation();

  return createPortal(
    <div className="vmodal" onClick={onClose}>
      <div className="vmodal__box" role="dialog" aria-modal="true" aria-labelledby="vmodal-title" onClick={stop}>
        <button type="button" className="vmodal__x" aria-label={t("close")} onClick={onClose}>
          <IconClose />
        </button>
        <div className="vmodal__hero">
          <span className="vmodal__ring" aria-hidden="true" />
          <span className="vmodal__seal">
            <Image src={SRC} alt="" width={96} height={96} />
          </span>
          <span className="vmodal__kicker">{t("kicker")}</span>
          <h2 id="vmodal-title">{t("title")}</h2>
          {name ? (
            <p className="vmodal__who">
              <b>{name}</b>
              {subtitle ? <span>{subtitle}</span> : null}
            </p>
          ) : null}
        </div>
        <div className="vmodal__sect">
          <b className="vmodal__h">{t("checkedTitle")}</b>
          <ul className="vmodal__list">
            {checks.map(({ Icon, k }, i) => (
              <li key={k} style={{ animationDelay: `${0.15 + i * 0.07}s` }}>
                <i>
                  <Icon />
                </i>
                <span>{t(k)}</span>
                <IconCheck className="vmodal__ok" />
              </li>
            ))}
          </ul>
        </div>
        <div className="vmodal__sect">
          <b className="vmodal__h">{t("meansTitle")}</b>
          <ul className="vmodal__means">
            {means.map(({ Icon, k }, i) => (
              <li key={k} style={{ animationDelay: `${0.45 + i * 0.07}s` }}>
                <Icon />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="vmodal__foot">
          <Link href="/warranty" className="vmodal__more" onClick={onClose}>
            {t("warranty")}
            <IconArrowRight />
          </Link>
          <button ref={okRef} type="button" className="btn btn--pri vmodal__okbtn" onClick={onClose}>
            {t("ok")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
