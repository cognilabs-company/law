"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import type { Resource, ResStatus } from "@/lib/useResource";
import { errorText } from "@/lib/errorText";
import { IconAlert, IconInfo, IconRefresh } from "../icons";

// Skeleton shown while a backend list is loading.
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="pskel" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="pskel__row" key={i} />
      ))}
    </div>
  );
}

// Empty / error placeholder — no mock, just a clean message.
export function EmptyState({
  icon,
  title,
  text,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
}) {
  return (
    <div className="pempty">
      {icon ?? <IconInfo />}
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
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
