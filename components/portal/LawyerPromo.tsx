"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconClose, IconShieldCheck, IconSparkle } from "@/components/icons";

const HIDDEN_KEY = "lexgo_lawyer_promo_hidden";
const HIDE_MS = 3 * 24 * 60 * 60 * 1000;
const DELAY_MS = 2200;

function hiddenRecently() {
  try {
    const at = Number(localStorage.getItem(HIDDEN_KEY) || 0);
    return at > 0 && Date.now() - at < HIDE_MS;
  } catch {
    return false;
  }
}

function rememberHidden() {
  try {
    localStorage.setItem(HIDDEN_KEY, String(Date.now()));
  } catch {}
}

export default function LawyerPromo() {
  const t = useTranslations("portal.client.dashboard");
  const [phase, setPhase] = useState<"off" | "in" | "out">("off");

  useEffect(() => {
    if (hiddenRecently()) return;
    const id = window.setTimeout(() => setPhase("in"), DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  if (phase === "off") return null;

  const close = () => {
    rememberHidden();
    setPhase("out");
  };

  return (
    <aside
      className={`lpromo lpromo--${phase}`}
      aria-label={t("lawyerAdTitle")}
      onAnimationEnd={(e) => {
        if (phase === "out" && e.target === e.currentTarget) setPhase("off");
      }}
    >
      <span className="lpromo__shine" aria-hidden="true" />
      <button type="button" className="lpromo__x" onClick={close} aria-label={t("lawyerAdClose")}>
        <IconClose />
      </button>
      <Link href="/portal/client/lawyers" className="lpromo__link" onClick={rememberHidden}>
        <span className="lpromo__art" aria-hidden="true">
          <span className="lpromo__halo" />
          <Image src="/img/advokat-yuristlar-promo.webp" alt="" width={112} height={112} />
          <span className="lpromo__badge">
            <IconShieldCheck />
          </span>
        </span>
        <span className="lpromo__copy">
          <span className="lpromo__tag">
            <IconSparkle />
            {t("lawyerAdEyebrow")}
          </span>
          <strong>{t("lawyerAdTitle")}</strong>
          <span className="lpromo__text">{t("lawyerAdText")}</span>
          <span className="lpromo__cta">
            {t("lawyerAdCta")}
            <IconArrowRight />
          </span>
        </span>
      </Link>
    </aside>
  );
}
