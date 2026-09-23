"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { getMySubscription, getSubscriptionPlans } from "@/lib/services/backend";
import { useResource, useResourceOne } from "@/lib/useResource";

const AI_SLUG = /^lexgo-ai-(free|lite|pro)$/;

// Whether the client is on the free LexGo.AI tier (Lite/Pro get raw-template
// downloads for free; Free is shown the document but must upgrade) — GM's
// rule. No dedicated "my AI plan" endpoint exists, so this matches the
// client's subscription against the three lexgo-ai-* plans by id/name, the
// same resolution PlansPanel.tsx and the services catalog both already use —
// pulled out here so every surface that needs the same check (the catalog's
// download button, DocPaper's toolbar) shares one implementation.
export function useIsFreeAiTier(): boolean {
  const locale = useLocale();
  const sub = useResourceOne(getMySubscription, []);
  const aiPlans = useResource(() => getSubscriptionPlans(locale), [locale]);
  const myAiPlan = useMemo(() => {
    const s = sub.data;
    if (!s) return null;
    return aiPlans.data.filter((p) => AI_SLUG.test(p.slug)).find((p) => (s.planId && p.id === s.planId) || (s.planName && p.name === s.planName)) ?? null;
  }, [sub.data, aiPlans.data]);
  return !myAiPlan || myAiPlan.slug === "lexgo-ai-free";
}
