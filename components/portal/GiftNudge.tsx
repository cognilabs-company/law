"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { Role } from "@/lib/auth";
import { getMySubscription, getPromotionStatus, getSubscriptionPlans } from "@/lib/services/backend";
import { SELLER_DISCOUNT } from "@/lib/services/plans";
import { useResourceOne, useResource } from "@/lib/useResource";
import { hiddenRecently as lawyerPromoHidden } from "./LawyerPromo";
import { IconArrowRight, IconClose } from "../icons";

const AI_SLUG = /^lexgo-ai-(free|lite|pro)$/;
const DISMISS_KEY = "lexgo_giftnudge_dismissed";
const SHOWN_KEY = "lexgo_giftnudge_shown";

type Facts = { aiSlug: string; promoting: boolean; verified: boolean; pct: number };

type Variant = {
  key: string;
  href: string;
  show?: (f: Facts) => boolean;
};

type Shown = { step: number; key: string };

const CLIENT_VARIANTS: Variant[] = [
  { key: "gift", href: "/portal/client/gifts" },
  { key: "pro", href: "/portal/client/subscription", show: (f) => f.aiSlug !== "lexgo-ai-pro" },
  { key: "lite", href: "/portal/client/subscription", show: (f) => f.aiSlug === "lexgo-ai-free" },
  { key: "lawyers", href: "/portal/client/lawyers" },
];

function sellerVariants(base: string): Variant[] {
  return [
    { key: "profile", href: `${base}/profile`, show: (f) => f.pct < 100 },
    { key: "promote", href: `${base}/promotion`, show: (f) => !f.promoting },
    { key: "ai", href: `${base}/subscription`, show: (f) => f.verified && f.aiSlug !== "lexgo-ai-pro" },
    { key: "services", href: `${base}/services` },
    { key: "referrals", href: `${base}/referrals` },
  ];
}

function tier(pct: number): "0" | "1" | "2" {
  if (pct < 40) return "0";
  if (pct < 80) return "1";
  return "2";
}

function readShown(): Shown | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(SHOWN_KEY) || "null");
    return v && typeof v.step === "number" && typeof v.key === "string" ? v : null;
  } catch {
    return null;
  }
}

function pickVariant(all: Variant[], fits: (v: Variant) => boolean, prev: Shown | null, step: number, start: number): Variant | undefined {
  if (prev && prev.step === step) {
    const same = all.find((v) => v.key === prev.key && fits(v));
    if (same) return same;
  }
  const from = prev ? all.findIndex((v) => v.key === prev.key) + 1 : start;
  for (let i = 0; i < all.length; i++) {
    const v = all[(from + i) % all.length];
    if (fits(v)) return v;
  }
  return undefined;
}

export default function GiftNudge({
  role,
  completeness,
  verified,
}: {
  role: Role;
  completeness: number;
  verified: boolean | null;
}) {
  const t = useTranslations("portal.common.giftNudge");
  const tg = useTranslations("portal.common.growth");
  const locale = useLocale();
  const pathname = usePathname();
  const seller = role !== "client";

  // Rendered only client-side (inside the portal shell, after auth is ready).
  const [hidden, setHidden] = useState(
    () => typeof window === "undefined" || sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  const [start] = useState(() => (seller ? 0 : Math.floor(Math.random() * CLIENT_VARIANTS.length)));
  const [step, setStep] = useState(() => (readShown()?.step ?? -1) + 1);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setStep(step + 1);
  }

  const sub = useResourceOne(getMySubscription, []);
  const aiPlans = useResource(() => getSubscriptionPlans(locale), [locale]);
  const promo = useResourceOne(() => (seller ? getPromotionStatus() : Promise.resolve(null)), [seller]);
  const planReady =
    sub.status !== "loading" &&
    aiPlans.status !== "loading" &&
    promo.status !== "loading" &&
    (!seller || verified !== null);
  const myAiSlug = (() => {
    const s = sub.data;
    if (!s) return "lexgo-ai-free";
    const plan = aiPlans.data.filter((p) => AI_SLUG.test(p.slug)).find((p) => (s.planId && p.id === s.planId) || (s.planName && p.name === s.planName));
    return plan?.slug ?? "lexgo-ai-free";
  })();
  const pct = Math.max(0, Math.min(100, Math.round(completeness)));
  const st = promo.data;
  const facts: Facts = {
    aiSlug: myAiSlug,
    promoting: Boolean(st && (st.active || Object.values(st.byPlacement).some((p) => p.pending > 0))),
    verified: verified === true,
    pct,
  };
  const fits = (v: Variant) => v.href !== pathname && (!v.show || v.show(facts));

  // Wait for the plan check before showing anything — otherwise a client
  // already on Pro would see the "gift" default flash into a "buy Pro" (or
  // vice versa) a beat later, once myAiSlug resolves.
  const blocked = hidden || !planReady || (!seller && pathname === "/portal/client" && !lawyerPromoHidden());
  const variant = blocked
    ? undefined
    : pickVariant(seller ? sellerVariants(`/portal/${role}`) : CLIENT_VARIANTS, fits, readShown(), step, start);
  const shownKey = variant?.key;

  useEffect(() => {
    if (!shownKey) return;
    try {
      sessionStorage.setItem(SHOWN_KEY, JSON.stringify({ step, key: shownKey }));
    } catch {}
  }, [step, shownKey]);

  if (!variant) return null;
  const { key, href } = variant;
  const title = key === "profile" ? tg("title", { pct }) : t(`${key}Title`, { pct: SELLER_DISCOUNT });
  const text = key === "profile" ? tg(`tier${tier(pct)}`) : t(`${key}Text`);
  const cta = key === "profile" ? tg("cta") : t(`${key}Cta`);

  return (
    <div key={key} className={`giftn giftn--${key}`} role="note">
      <Link href={href} className="giftn__hit" tabIndex={-1} aria-hidden="true" />
      <div className="giftn__b">
        <b>{title}</b>
        <p>{text}</p>
        <Link href={href} className="btn btn--sm giftn__cta">
          {cta}
          <IconArrowRight />
        </Link>
      </div>
      <span className="giftn__art" aria-hidden="true">
        <Image src={`/img/promo/${key}.webp`} alt="" width={480} height={480} unoptimized loading="eager" />
      </span>
      <button
        type="button"
        className="giftn__x"
        aria-label={t("dismiss")}
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setHidden(true);
        }}
      >
        <IconClose />
      </button>
    </div>
  );
}
