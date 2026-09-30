"use client";

import { useTranslations } from "next-intl";
import { humanizeSlug, initials } from "@/lib/lawyers";
import type { MarketSeller } from "@/lib/services/marketplace";

type TFn = ReturnType<typeof useTranslations>;

export const SELLER_TYPES = ["advokat", "yurist", "advokat_tashkiloti"] as const;

export function sellerTypeLabel(t: TFn, type: string): string {
  return t.has(`roles.${type}`) ? t(`roles.${type}`) : humanizeSlug(type);
}

export function specLabel(te: TFn, value: string): string {
  const k = value.trim().toLowerCase();
  if (te.has(`areas.${k}`)) return te(`areas.${k}`);
  return humanizeSlug(value);
}

export function langLabel(t: TFn, value: string): string {
  const k = value.trim().toLowerCase();
  return t.has(`langs.${k}`) ? t(`langs.${k}`) : value;
}

export function deliveryLabel(t: TFn, minutes: number): string {
  if (!minutes || minutes <= 0) return "";
  if (minutes >= 1440) return t("detail.deliveryDays", { n: Math.max(1, Math.round(minutes / 1440)) });
  return t("detail.deliveryHours", { n: Math.max(1, Math.round(minutes / 60)) });
}

export function hasRating(s: Pick<MarketSeller, "reviewsCount">): boolean {
  return s.reviewsCount >= 5;
}

export function hasSuccess(s: Pick<MarketSeller, "totalCases">): boolean {
  return s.totalCases >= 5;
}

export function Monogram({ name, rating, size = "md", showRing }: { name: string; rating: number; size?: "md" | "lg"; showRing: boolean }) {
  const sweep = showRing ? Math.max(0, Math.min(5, rating)) / 5 : 0;
  return (
    <span className={`mk-mono mk-mono--${size}`} style={{ ["--mk-sweep" as string]: `${Math.round(sweep * 360)}deg` }} aria-hidden="true">
      <span className="mk-mono__in">{initials(name) || "LG"}</span>
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  const full = Math.round(Math.max(0, Math.min(5, value)));
  return (
    <span className="mk-stars" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={i < full ? "on" : ""}>
          <path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.13l-5.62 2.97 1.07-6.27L2.9 9.4l6.3-.9z" />
        </svg>
      ))}
    </span>
  );
}
