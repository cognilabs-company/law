"use client";

import { useTranslations } from "next-intl";
import { isValidElement, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { Resource, ResStatus } from "@/lib/useResource";
import { errorText } from "@/lib/errorText";
import { IconAlert, IconInfo, IconRefresh } from "../icons";

export type SkeletonVariant = "rows" | "block" | "columns";

// Skeleton shown while a backend list is loading.
export function Skeleton({
  rows = 3,
  variant = "rows",
  height,
  columns = 4,
  label,
  className,
}: {
  rows?: number;
  variant?: SkeletonVariant;
  height?: number | string;
  columns?: number;
  label?: string;
  className?: string;
}) {
  const h = typeof height === "number" ? `${height}px` : height;
  const count = Math.max(1, Math.floor(rows) || 1);
  const cls = ["pskel", variant === "block" ? "pskel--block" : variant === "columns" ? "pskel--cols" : "", className ?? ""].filter(Boolean).join(" ");
  const style = h ? ({ "--pskel-h": h } as CSSProperties) : undefined;
  let body: ReactNode;
  if (variant === "block") body = <div className="pskel__row" aria-hidden="true" />;
  else if (variant === "columns")
    body = Array.from({ length: Math.max(1, Math.floor(columns) || 1) }).map((_, c) => (
      <div className="pskel__col" key={c} aria-hidden="true">
        <div className="pskel__row pskel__head" />
        {Array.from({ length: count }).map((__, i) => (
          <div className="pskel__row" key={i} />
        ))}
      </div>
    ));
  else body = Array.from({ length: count }).map((_, i) => <div className="pskel__row" key={i} aria-hidden="true" />);
  if (label) {
    return (
      <div className={cls} style={style} role="status" aria-busy="true">
        <span className="sr-only">{label}</span>
        {body}
      </div>
    );
  }
  return (
    <div className={cls} style={style} aria-hidden>
      {body}
    </div>
  );
}

export type EmptyAction = { label: string; onClick?: () => unknown; href?: string; aiId?: string };

function isEmptyAction(v: unknown): v is EmptyAction {
  return typeof v === "object" && v !== null && !isValidElement(v) && !Array.isArray(v) && typeof (v as { label?: unknown }).label === "string";
}

// Empty / error placeholder — no mock, just a clean message.
export function EmptyState({
  icon,
  title,
  text,
  action,
  size = "md",
  className,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode | EmptyAction;
  size?: "sm" | "md";
  className?: string;
}) {
  let act: ReactNode = null;
  if (isEmptyAction(action)) {
    act = action.href ? (
      <Link href={action.href} className="btn btn--line btn--sm" data-ai-id={action.aiId}>
        {action.label}
      </Link>
    ) : (
      <button type="button" className="btn btn--line btn--sm" onClick={() => void action.onClick?.()} data-ai-id={action.aiId}>
        {action.label}
      </button>
    );
  } else if (action) {
    act = <div className="pempty__a">{action}</div>;
  }
  return (
    <div className={["pempty", size === "sm" ? "pempty--compact" : "", className ?? ""].filter(Boolean).join(" ")}>
      {icon ?? <IconInfo />}
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
      {act}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title,
  compact,
}: {
  error?: unknown;
  onRetry?: () => unknown;
  title?: string;
  compact?: boolean;
}) {
  const t = useTranslations("portal.common");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const reason = (error === undefined ? "" : errorText(error, tc)) || t("loadErrorText");

  function retry() {
    if (!onRetry || busy) return;
    setBusy(true);
    Promise.resolve()
      .then(onRetry)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }

  return (
    <div className={`pempty pempty--err${compact ? " pempty--compact" : ""}`} role="alert">
      <IconAlert aria-hidden="true" />
      <b>{title || t("loadError")}</b>
      <p>{reason}</p>
      {onRetry ? (
        <button type="button" className="btn btn--line btn--sm" onClick={retry} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
          <IconRefresh aria-hidden="true" />
          {tc("retry")}
        </button>
      ) : null}
    </div>
  );
}

// Convenience: render loading / error / empty around a ready list.
export function ResourceView<T>({
  res,
  icon,
  emptyTitle,
  emptyText,
  children,
  skeletonRows,
}: {
  res: Resource<T>;
  icon?: ReactNode;
  emptyTitle: string;
  emptyText?: string;
  children: (data: T[]) => ReactNode;
  skeletonRows?: number;
}) {
  if (res.status === "loading") return <Skeleton rows={skeletonRows} />;
  if (res.status === "error")
    return <ErrorState error={res.error} onRetry={typeof res.refresh === "function" ? res.refresh : undefined} />;
  if (!res.data.length)
    return <EmptyState icon={icon} title={emptyTitle} text={emptyText} />;
  return <>{children(res.data)}</>;
}

export type { ResStatus };
