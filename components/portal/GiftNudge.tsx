"use client";

import { useState, type ComponentType } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getMySubscription, getSubscriptionPlans } from "@/lib/services/backend";
import { useResourceOne, useResource } from "@/lib/useResource";
import { IconGift, IconCrown, IconGem, IconUsers, IconArrowRight, IconClose } from "../icons";

const AI_SLUG = /^lexgo-ai-(free|lite|pro)$/;

type Variant = {
  key: string;
  Icon: ComponentType<{ className?: string }>;
  iconClass: string;
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
  { key: "gift", Icon: IconGift, iconClass: "giftn__ic--gift", href: "/portal/client/gifts" },
  { key: "pro", Icon: IconCrown, iconClass: "giftn__ic--pro", href: "/portal/client/subscription", hideForPlan: ["lexgo-ai-pro"] },
  { key: "lite", Icon: IconGem, iconClass: "giftn__ic--lite", href: "/portal/client/subscription", hideForPlan: ["lexgo-ai-lite", "lexgo-ai-pro"] },
  { key: "lawyers", Icon: IconUsers, iconClass: "giftn__ic--lawyers", href: "/portal/client/lawyers" },
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

  // Picked once per fresh session (not on every render) — stable while the
  // banner is on screen, different again next time sessionStorage is clear.
  const [pickedKey] = useState(() => {
    const pool = VARIANTS.filter((v) => !v.hideForPlan?.includes(myAiSlug));
    return pool[Math.floor(Math.random() * pool.length)]?.key ?? "gift";
  });

  // Wait for the plan check before showing anything — otherwise a client
  // already on Pro would see the "gift" default flash into a "buy Pro" (or
  // vice versa) a beat later, once myAiSlug resolves.
  if (hidden || !planReady) return null;
  const variant = VARIANTS.find((v) => v.key === pickedKey) ?? VARIANTS[0];
  const { Icon, iconClass, href } = variant;

  return (
    <div className="giftn" role="note">
      <span className={`giftn__ic ${iconClass}`}><Icon /></span>
      <div className="giftn__b">
        <b>{t(`${variant.key}Title`)}</b>
        <p>{t(`${variant.key}Text`)}</p>
      </div>
      <Link href={href} className="btn btn--grad btn--sm giftn__cta">
        {t(`${variant.key}Cta`)}
        <IconArrowRight />
      </Link>
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
