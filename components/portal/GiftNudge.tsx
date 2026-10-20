"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getMySubscription, getSubscriptionPlans } from "@/lib/services/backend";
import { useResourceOne, useResource } from "@/lib/useResource";
import { IconArrowRight, IconClose } from "../icons";

const AI_SLUG = /^lexgo-ai-(free|lite|pro)$/;

type Variant = {
  key: string;
  href: string;
  // Skip this variant for a client already on this plan or better — showing
  // "buy Pro" to someone already on Pro is the kind of thing that makes a
  // "personalized" banner look like it isn't.
  hideForPlan?: string[];
};

// A different one each fresh visit (module 10's original gift-a-package
// nudge was the only message ever shown here) — rotated, not just the one
// static slot forever, and narrowed by the client's own current LexGo.AI
// plan so an upsell for a plan they already have never appears.
const VARIANTS: Variant[] = [
  { key: "gift", href: "/portal/client/gifts" },
  { key: "pro", href: "/portal/client/subscription", hideForPlan: ["lexgo-ai-pro"] },
  { key: "lite", href: "/portal/client/subscription", hideForPlan: ["lexgo-ai-lite", "lexgo-ai-pro"] },
  { key: "lawyers", href: "/portal/client/lawyers" },
];

export default function GiftNudge() {
  const t = useTranslations("portal.common.giftNudge");
  const locale = useLocale();

  // Rendered only client-side (inside the portal shell, after auth is ready).
  const [hidden, setHidden] = useState(
    () => typeof window === "undefined" || sessionStorage.getItem("lexgo_giftnudge_dismissed") === "1",
  );

  const sub = useResourceOne(getMySubscription, []);
  const aiPlans = useResource(() => getSubscriptionPlans(locale), [locale]);
  const planReady = sub.status !== "loading" && aiPlans.status !== "loading";
  const myAiSlug = (() => {
    const s = sub.data;
    if (!s) return "lexgo-ai-free";
    const plan = aiPlans.data.filter((p) => AI_SLUG.test(p.slug)).find((p) => (s.planId && p.id === s.planId) || (s.planName && p.name === s.planName));
    return plan?.slug ?? "lexgo-ai-free";
  })();

  const [roll] = useState(() => Math.random());

  // Wait for the plan check before showing anything — otherwise a client
  // already on Pro would see the "gift" default flash into a "buy Pro" (or
  // vice versa) a beat later, once myAiSlug resolves.
  if (hidden || !planReady) return null;
  const pool = VARIANTS.filter((v) => !v.hideForPlan?.includes(myAiSlug));
  const variant = pool[Math.floor(roll * pool.length)] ?? VARIANTS[0];
  const { key, href } = variant;

  return (
    <div className={`giftn giftn--${key}`} role="note">
      <Link href={href} className="giftn__hit" tabIndex={-1} aria-hidden="true" />
      <div className="giftn__b">
        <b>{t(`${key}Title`)}</b>
        <p>{t(`${key}Text`)}</p>
        <Link href={href} className="btn btn--sm giftn__cta">
          {t(`${key}Cta`)}
          <IconArrowRight />
        </Link>
      </div>
      <span className="giftn__art" aria-hidden="true">
        <Image src={`/img/promo/${key}.webp`} alt="" width={480} height={480} unoptimized priority />
      </span>
      <button
        type="button"
        className="giftn__x"
        aria-label={t("dismiss")}
        onClick={() => {
          sessionStorage.setItem("lexgo_giftnudge_dismissed", "1");
          setHidden(true);
        }}
      >
        <IconClose />
      </button>
    </div>
  );
}
