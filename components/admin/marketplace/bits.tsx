"use client";

import type { ComponentType, SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtUzs } from "@/lib/money";
import { dateTimeFull, fmtInt } from "@/lib/date";
import { humanize } from "@/lib/labels";
import { initials } from "@/lib/lawyers";
import { EmptyState } from "@/components/portal/DataState";
import { isForbidden } from "@/lib/http";
import { IconAlert, IconBolt, IconCheck, IconChevronLeft, IconChevronRight, IconClock, IconClose, IconInfo, IconLock, IconRefresh } from "@/components/icons";

export type Tone = "pending" | "active" | "done" | "cancel" | "other";

export function toneOf(status: string): Tone {
  if (status === "pending_payment" || status === "pending") return "pending";
  if (status === "paid" || status === "in_progress") return "active";
  if (status === "completed" || status === "approved") return "done";
  if (status === "cancelled" || status === "rejected" || status === "failed" || status === "refunded") return "cancel";
  return "other";
}

const TONE_ICON: Record<Tone, ComponentType<SVGProps<SVGSVGElement>>> = {
  pending: IconClock,
  active: IconBolt,
  done: IconCheck,
  cancel: IconClose,
  other: IconInfo,
};

export function ToneIcon({ tone }: { tone: Tone }) {
  const Icon = TONE_ICON[tone];
  return <Icon aria-hidden />;
}

export function useStatusLabel() {
  const t = useTranslations("admin.marketplace");
  return (status: string) => (status && t.has(`status.${status}`) ? t(`status.${status}`) : humanize(status) || "—");
}

export function useTypeLabel() {
  const t = useTranslations("marketplace.roles");
  return (type: string) => (type && t.has(type) ? t(type) : humanize(type));
}

export function StatusBadge({ status }: { status: string }) {
  const label = useStatusLabel();
  const tone = toneOf(status);
  return (
    <span className={`mkm-st mkm-st--${tone}`}>
      <ToneIcon tone={tone} />
      {label(status)}
    </span>
  );
}

export function payWorthShowing(o: { status: string; paymentStatus: string }): boolean {
  if (!o.paymentStatus) return false;
  if (o.status === "cancelled" && o.paymentStatus === "cancelled") return false;
  if (o.status === "pending_payment" && o.paymentStatus === "pending") return false;
  return true;
}

export function PayBadge({ status }: { status: string }) {
  const t = useTranslations("admin.marketplace");
  if (!status) return null;
  const tone = status === "paid" ? "done" : toneOf(status);
  return <span className={`mkm-pay mkm-pay--${tone}`}>{t.has(`pay.${status}`) ? t(`pay.${status}`) : humanize(status)}</span>;
}

export function useMoney() {
  const te = useTranslations("enums");
  return (n: number, currency = "UZS") => `${fmtUzs(n)} ${!currency || currency.toUpperCase() === "UZS" ? te("currency") : currency}`;
}

export function useWhen() {
  const locale = useLocale();
  return (iso: string) => (iso ? dateTimeFull(iso, locale) : "");
}

export function useCount() {
  const locale = useLocale();
  return (n: number) => fmtInt(n, locale);
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="mkm-av" aria-hidden>
      {initials(name.trim()) || "?"}
    </span>
  );
}

export function Pager({ total, offset, limit, busy, onOffset }: { total: number; offset: number; limit: number; busy: boolean; onOffset: (next: number) => void }) {
  const t = useTranslations("admin.marketplace.pager");
  const count = useCount();
  if (total <= limit && offset === 0) return null;
  const from = total ? Math.min(offset + 1, total) : 0;
  const to = Math.min(offset + limit, total);
  return (
    <div className="mkm-pager">
      <span>{t("range", { from: count(from), to: count(to), total: count(total) })}</span>
      <div>
        <button type="button" className="btn btn--line btn--sm" disabled={busy || offset === 0} onClick={() => onOffset(Math.max(0, offset - limit))}>
          <IconChevronLeft aria-hidden />
          {t("prev")}
        </button>
        <button type="button" className="btn btn--line btn--sm" disabled={busy || offset + limit >= total} onClick={() => onOffset(offset + limit)}>
          {t("next")}
          <IconChevronRight aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function LoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations("admin.marketplace.errors");
  if (isForbidden(error)) return <EmptyState icon={<IconLock />} title={t("forbidden")} text={t("forbiddenText")} />;
  return (
    <div className="mkm-fail">
      <EmptyState icon={<IconAlert />} title={t("load")} text={t("loadText")} />
      <button type="button" className="btn btn--line btn--sm" onClick={onRetry}>
        <IconRefresh aria-hidden />
        {t("retry")}
      </button>
    </div>
  );
}

export function RefreshFailed() {
  const t = useTranslations("admin.marketplace.errors");
  return (
    <p className="mkm-warn" role="status">
      <IconAlert aria-hidden />
      {t("refreshFailed")}
    </p>
  );
}
