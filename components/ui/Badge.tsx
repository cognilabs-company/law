"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconFlame } from "@/components/icons";
import { leadScoreLabel, leadScoreTone } from "@/lib/leadLabels";
import { statusSpecOf, type StatusMap, type StatusSpec, type StatusTone } from "@/lib/labels";
import { notify } from "@/lib/toast";

export type BadgeTone = StatusTone;
export type BadgeSize = "sm" | "md";
export type { StatusMap, StatusSpec };

export type BadgeProps = {
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: ReactNode;
  dot?: boolean | "live";
  children?: ReactNode;
  className?: string;
  title?: string;
  id?: string;
  status?: string;
  aiId?: string;
};

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const filled = (v: ReactNode) => v !== undefined && v !== null && v !== false && v !== "";

export function Badge({ tone = "neutral", size = "md", icon, dot, children, className, title, id, status, aiId }: BadgeProps) {
  return (
    <span id={id} className={cx("bdg", `bdg--${tone}`, size === "sm" && "bdg--sm", className)} title={title} data-status={status || undefined} data-ai-id={aiId}>
      {dot ? <i className={cx("bdg__dot", dot === "live" && "bdg__dot--live")} aria-hidden="true" /> : null}
      {icon ? (
        <span className="bdg__ic" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {filled(children) ? <span className="bdg__t">{children}</span> : null}
    </span>
  );
}

export type StatusBadgeProps = {
  status?: string | null;
  map: StatusMap;
  fallback?: string | null;
  size?: BadgeSize;
  icon?: ReactNode;
  className?: string;
  aiId?: string;
};

export function StatusBadge({ status, map, fallback, size = "md", icon, className, aiId }: StatusBadgeProps) {
  const spec = statusSpecOf(map, status, fallback);
  if (!spec) return null;
  return (
    <Badge tone={spec.tone} dot={spec.dot} size={size} icon={icon} className={cx("bdg--status", className)} status={(status || "").trim()} aiId={aiId}>
      {spec.label}
    </Badge>
  );
}

export type ScoreChipProps = {
  score?: string | null;
  label?: string;
  size?: BadgeSize;
  icon?: boolean;
  className?: string;
};

export function ScoreChip({ score, label, size = "sm", icon = false, className }: ScoreChipProps) {
  const t = useTranslations("admin.pipeline");
  const key = (score || "").trim().toLowerCase();
  if (!key) return null;
  return (
    <Badge tone={leadScoreTone(key)} size={size} icon={icon && key === "hot" ? <IconFlame /> : undefined} className={cx("scorechip", `scorechip--${key.replace(/[^a-z0-9_-]/g, "")}`, className)} status={key}>
      {label ?? leadScoreLabel(t, key)}
    </Badge>
  );
}

export type CountBadgeProps = {
  n: number;
  label?: string;
  tone?: BadgeTone;
  size?: BadgeSize;
  className?: string;
};

export function CountBadge({ n, label, tone = "neutral", size = "sm", className }: CountBadgeProps) {
  const t = useTranslations("common.ui");
  const value = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  return (
    <Badge tone={tone} size={size} className={cx("bdg--count", className)}>
      {label ?? t("count", { n: value })}
    </Badge>
  );
}

export type WorkIdProps = {
  id?: string | null;
  label?: string;
  showLabel?: boolean;
  copy?: boolean;
  className?: string;
  aiId?: string;
  tipSide?: "top" | "bottom";
};

export function WorkId({ id, label, showLabel = false, copy = false, className, aiId, tipSide }: WorkIdProps) {
  const t = useTranslations("common.ui");
  const value = (id || "").trim();
  if (!value) return null;
  const name = label ?? t("workId");

  if (!copy) {
    return (
      <span className={cx("wid", "wkid", className)} data-ai-id={aiId}>
        {showLabel ? <span className="wkid__l">{name}</span> : <span className="sr-only">{`${name}: `}</span>}
        <span className="wkid__v">{value}</span>
      </span>
    );
  }

  const onCopy = () => {
    const done = () => notify.success(t("copied"), { id: `workid-copy:${value}`, body: value });
    const fail = () => notify.error(t("copyFailed"), { id: `workid-copy:${value}` });
    try {
      if (!navigator.clipboard?.writeText) {
        fail();
        return;
      }
      navigator.clipboard.writeText(value).then(done, fail);
    } catch {
      fail();
    }
  };

  return (
    <button type="button" className={cx("wid", "wkid", "wkid--copy", className)} onClick={onCopy} aria-label={t("copyId", { id: value })} data-tip={t("copy")} data-tip-side={tipSide === "bottom" ? "bottom" : undefined} data-ai-id={aiId}>
      {showLabel ? (
        <span className="wkid__l" aria-hidden="true">
          {name}
        </span>
      ) : null}
      <span className="wkid__v">{value}</span>
    </button>
  );
}

export default Badge;
