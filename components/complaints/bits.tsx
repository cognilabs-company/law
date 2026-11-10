"use client";

import { useMemo, type ComponentType, type CSSProperties, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import { humanize } from "@/lib/labels";
import {
  complaintStage,
  isKnownComplaintStatus,
  type ComplaintItem,
  type ComplaintKind,
  type ComplaintSource,
  type ComplaintStage,
} from "@/lib/services/complaints";
import {
  IconBriefcase,
  IconCard,
  IconChatDots,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconHourglass,
  IconInbox,
  IconRefresh,
  IconStarRate,
  IconUser,
} from "@/components/icons";

type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>;

export function IconArchive(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

export function CategoryIcon({ category }: { category: string }) {
  switch (category) {
    case "service":
      return <IconBriefcase />;
    case "lawyer":
      return <IconUser />;
    case "payment":
      return <IconCard />;
    case "quality":
      return <IconStarRate />;
    case "sla":
      return <IconClock />;
    default:
      return <IconChatDots />;
  }
}

// Each category's picture: the dashboard's navy + blue line drawings
// (public/img/doc-catalog/Shikoyat_*), shown on a light plate.
const CATEGORY_ART: Record<string, string> = {
  service: "Shikoyat_xizmat",
  lawyer: "Shikoyat_advokat",
  payment: "Shikoyat_tolov",
  quality: "Shikoyat_sifat",
  sla: "Shikoyat_muddat",
  other: "Shikoyat_boshqa",
};

/** `--art` for a category's square picture (quality complaints get the quality one). */
export function categoryArt(category: string, quality = false): CSSProperties {
  const name = quality ? CATEGORY_ART.quality : CATEGORY_ART[category] || CATEGORY_ART.other;
  return { "--art": `url(/img/doc-catalog/${name}-sq.webp)` } as CSSProperties;
}

export const STAGE_ICONS: Record<ComplaintStage, SvgIcon> = {
  new: IconInbox,
  review: IconHourglass,
  rework: IconRefresh,
  resolved: IconCircleCheck,
  rejected: IconCircleX,
  closed: IconArchive,
};

export function rowDomId(key: string): string {
  return `shk-${key}`;
}

export function useComplaintLabels() {
  const t = useTranslations("portal.client.complaints");
  return useMemo(
    () => ({
      status: (s: string) => (s && t.has(`statuses.${s}`) ? t(`statuses.${s}`) : humanize(s)),
      stage: (s: ComplaintStage) => t(`stage.${s}`),
      tag: (s: string) => {
        if (!isKnownComplaintStatus(s)) return humanize(s) || t("stage.review");
        const stage = complaintStage(s);
        return stage === "closed" ? t(`statuses.${s}`) : t(`stage.${stage}`);
      },
      kind: (k: ComplaintKind) => t(`kind.${k}`),
      category: (c: string) => (c && t.has(`categories.${c}`) ? t(`categories.${c}`) : humanize(c)),
      source: (s: ComplaintSource) => (s ? t(`source.${s}`) : ""),
      hint: (item: Pick<ComplaintItem, "kind" | "status">) => {
        const stage = complaintStage(item.status);
        if (stage === "new") return t("hint.waiting");
        if (stage === "review") return item.kind === "quality" ? t("hint.review") : t("hint.reviewing");
        if (stage === "rework") return t("hint.rework");
        if (stage === "resolved") return t("hint.resolved");
        if (stage === "rejected") return t("hint.rejected");
        return t("hint.closed");
      },
    }),
    [t],
  );
}

export function StatusPill({ status, label }: { status: string; label: string }) {
  const stage = complaintStage(status);
  const Icon = STAGE_ICONS[stage];
  return (
    <span className={`shk__st shk__st--${stage}`}>
      <Icon aria-hidden />
      {label}
    </span>
  );
}

export function QualityBadge({ label }: { label: string }) {
  return (
    <span className="shk__kind">
      <IconStarRate aria-hidden />
      {label}
    </span>
  );
}

export function CategoryTile({ item }: { item: Pick<ComplaintItem, "kind" | "category"> }) {
  const quality = item.kind === "quality";
  return <span className={`shk__tile shk__tile--art${quality ? " shk__tile--quality" : ""}`} style={categoryArt(item.category, quality)} aria-hidden />;
}

export function Stars({ n, label }: { n: number; label: string }) {
  return (
    <span className="shk__stars" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <IconStarRate key={i} aria-hidden className={i <= n ? "on" : undefined} />
      ))}
    </span>
  );
}

// "Nothing to complain about": the dashboard's picture on a light plate.
export function EmptyArt() {
  return <span className="shk__art shk__art--pic" style={{ "--art": "url(/img/doc-catalog/Shikoyat_yoq.webp)" } as CSSProperties} aria-hidden="true" />;
}
