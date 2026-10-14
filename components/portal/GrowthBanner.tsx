"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/lib/auth";
import { IconRocket, IconArrowRight, IconClose, IconCheck } from "../icons";

// Ad-style profile-completion nudge shown across every seller (lawyer/advocate)
// portal page. The stronger their profile, the higher they rank and the more
// clients reach them — so we keep reminding until it hits 100%.
const CTA_HREF: Partial<Record<Role, string>> = {
  lawyer: "/portal/lawyer/profile",
  advocate: "/portal/advocate/profile",
};

function tier(pct: number): "0" | "1" | "2" {
  if (pct < 40) return "0";
  if (pct < 80) return "1";
  return "2";
}

export default function GrowthBanner({
  role,
  completeness,
}: {
  role: Role;
  completeness: number;
}) {
  const t = useTranslations("portal.common.growth");
  const pct = Math.max(0, Math.min(100, Math.round(completeness)));
  const href = CTA_HREF[role];
  // Dismiss for this tab session only — a fresh visit nudges again. Rendered
  // only client-side (inside the portal shell, after auth is ready).
  const [hidden, setHidden] = useState(
    () => typeof window === "undefined" || sessionStorage.getItem("lexgo_growth_dismissed") === "1",
  );

  if (!href || pct >= 100 || hidden) return null;

  // SVG progress ring geometry.
  const R = 22;
  const C = 2 * Math.PI * R;
  const off = C * (1 - pct / 100);

  return (
    <div className="grow" role="status">
      <span className="grow__spark">
        <IconRocket />
      </span>
      <div className="grow__ring" aria-hidden="true">
        <svg viewBox="0 0 52 52">
          <circle className="grow__ring-bg" cx="26" cy="26" r={R} />
          <circle
            className="grow__ring-fg"
            cx="26"
            cy="26"
            r={R}
            style={{ strokeDasharray: C, strokeDashoffset: off }}
          />
        </svg>
        <b>{pct}%</b>
      </div>
      <div className="grow__body">
        <b className="grow__title">{t("title", { pct })}</b>
        <p className="grow__sub">{t(`tier${tier(pct)}`)}</p>
        <div className="grow__perks">
          <span><IconCheck />{t("perk1")}</span>
          <span><IconCheck />{t("perk2")}</span>
          <span><IconCheck />{t("perk3")}</span>
        </div>
      </div>
      <Link href={href} className="btn btn--grad btn--sm grow__cta">
        {t("cta")}
        <IconArrowRight />
      </Link>
      <button
        type="button"
        className="grow__x"
        aria-label={t("dismiss")}
        onClick={() => {
          sessionStorage.setItem("lexgo_growth_dismissed", "1");
          setHidden(true);
        }}
      >
        <IconClose />
      </button>
    </div>
  );
}
