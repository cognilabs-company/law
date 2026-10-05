"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { humanize } from "@/lib/labels";
import { complaintPhase, type ComplaintItem, type ComplaintKind, type ComplaintSource } from "@/lib/services/complaints";
import { IconAlert, IconStarRate } from "@/components/icons";

export function rowDomId(key: string): string {
  return `shk-${key}`;
}

export function useComplaintLabels() {
  const t = useTranslations("portal.client.complaints");
  return useMemo(
    () => ({
      status: (s: string) => (s && t.has(`statuses.${s}`) ? t(`statuses.${s}`) : humanize(s)),
      kind: (k: ComplaintKind) => t(`kind.${k}`),
      category: (c: string) => (c && t.has(`categories.${c}`) ? t(`categories.${c}`) : humanize(c)),
      source: (s: ComplaintSource) => (s ? t(`source.${s}`) : ""),
      hint: (item: Pick<ComplaintItem, "kind" | "status">) => {
        const phase = complaintPhase(item.status);
        if (phase === "open") return item.kind === "quality" ? t("hint.review") : t("hint.waiting");
        if (phase === "rework") return t("hint.rework");
        return item.status === "rejected" ? t("hint.rejected") : "";
      },
    }),
    [t],
  );
}

export function StatusPill({ status, label }: { status: string; label: string }) {
  return <em className={`shk__st shk__st--${complaintPhase(status)}`}>{label}</em>;
}

export function KindBadge({ kind, label }: { kind: ComplaintKind; label: string }) {
  return (
    <span className={`shk__kind shk__kind--${kind}`}>
      {kind === "quality" ? <IconStarRate aria-hidden /> : <IconAlert aria-hidden />}
      {label}
    </span>
  );
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

export function EmptyArt() {
  return (
    <svg className="shk__art" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      <circle className="shk__art-bg" cx="80" cy="62" r="50" />
      <rect className="shk__art-paper" x="52" y="22" width="56" height="74" rx="10" />
      <rect className="shk__art-clip" x="67" y="15" width="26" height="13" rx="6.5" />
      <path className="shk__art-line" d="M64 46h32M64 58h24M64 70h28" />
      <circle className="shk__art-badge" cx="110" cy="88" r="16" />
      <path className="shk__art-check" d="M102.5 88.5l5.5 5.5 9.5-11" />
      <circle className="shk__art-dot" cx="33" cy="40" r="4" />
      <circle className="shk__art-dot" cx="132" cy="32" r="3" />
      <circle className="shk__art-dot" cx="38" cy="92" r="2.5" />
    </svg>
  );
}
