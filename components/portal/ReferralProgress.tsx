"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getMyReferral } from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { IconUsers, IconArrowRight } from "@/components/icons";

// Seller commission tiers (T2-08 / S-28): active referred sellers → commission %.
// Base 18%; floor 12%.
const SELLER_TIERS: [number, number][] = [[5, 16], [10, 15], [20, 13]];
const SELLER_BASE = 18;

// T5-05 / T2-08: compact referral progress for the dashboards — "3 invited,
// 2 more → 16%". Clients get the backend's own thresholds (eligible_after /
// discount_percent); sellers get the S-28 commission ladder computed here.
export default function ReferralProgress({ side, href }: { side: "client" | "seller"; href: string }) {
  const t = useTranslations("portal.referralProgress");
  const res = useResourceOne(getMyReferral, []);
  if (res.status !== "ready" || !res.data) return null;
  const r = res.data;
  let goal: number;
  let reward: string;
  let current: string | null = null;
  if (side === "seller") {
    const reached = SELLER_TIERS.filter(([n]) => r.joined >= n);
    const nextTier = SELLER_TIERS.find(([n]) => r.joined < n);
    current = t("commissionNow", { pct: reached.length ? reached[reached.length - 1][1] : SELLER_BASE });
    goal = nextTier ? nextTier[0] : SELLER_TIERS[SELLER_TIERS.length - 1][0];
    reward = nextTier ? t("commission", { pct: nextTier[1] }) : t("maxTier");
  } else {
    goal = r.eligibleAfter || 5;
    reward = r.discountUnlocked ? t("unlocked", { pct: r.discountPercent }) : t("discount", { pct: r.discountPercent || 25 });
  }
  const pct = Math.min(100, Math.round((r.joined / Math.max(1, goal)) * 100));
  const remaining = Math.max(0, goal - r.joined);
  return (
    <Link href={href} className="refprog">
      <span className="refprog__ico"><IconUsers /></span>
      <div className="refprog__m">
        <b>{t("title")}</b>
        <span>{remaining > 0 ? t("progress", { joined: r.joined, invited: r.invited, remaining, reward }) : t("done", { reward })}{current ? ` · ${current}` : ""}</span>
        <i className="refprog__bar"><em style={{ width: `${pct}%` }} /></i>
      </div>
      <IconArrowRight />
    </Link>
  );
}
