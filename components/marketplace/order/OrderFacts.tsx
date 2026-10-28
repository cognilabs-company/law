"use client";

import type { ReactElement, ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { marketPhaseOf, type MarketOrder } from "@/lib/services/marketplace";
import type { RuntimeConfig, RuntimeDuration } from "@/lib/services/marketRuntime";
import { OptionLines } from "../OrderExtras";
import { durationParts } from "./deadline";
import { useContactSpeedText } from "./contactSpeed";
import { clientPhoneShow, lawyerPhoneShow, telHref } from "./phone";
import type { OrderView } from "./types";

export function useDurationText(): (d: RuntimeDuration | null) => string {
  const t = useTranslations("marketplace.orderDetail.duration");
  return (d) => {
    const parts = durationParts(d);
    if (!parts || !d) return "";
    return `${t(parts.unit, { n: parts.n })} · ${t(d.calendar === "business" ? "business" : "calendar")}`;
  };
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2)).toUpperCase();
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="mod-facts__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function OrderFacts({ o, view, aiBase, runtime }: { o: MarketOrder; view: OrderView; aiBase: string; runtime: RuntimeConfig | null }): ReactElement {
  const t = useTranslations("marketplace.orderDetail");
  const to = useTranslations("marketplace.orders");
  const tch = useTranslations("marketplace.purchase.channels");
  const tpk = useTranslations("portal.client.packages");
  const te = useTranslations("enums");
  const locale = useLocale();
  const durationText = useDurationText();
  const speed = useContactSpeedText()(o);
  const counterpart = view === "client" ? o.lawyerName : o.clientName;
  const phoneShow = clientPhoneShow(o);
  const sellerPhone = lawyerPhoneShow(o);
  const duration = o.duration ?? (runtime && runtime.duration.value > 0 ? runtime.duration : null);
  const durationLine = durationText(duration);
  const pkgLine = [o.packageTitle, o.packageTier && tpk.has(`tiers.${o.packageTier}`) ? tpk(`tiers.${o.packageTier}`) : o.packageTier].filter(Boolean).join(" · ");
  const when = (v: string) => shortDateTime(v, locale);
  const phase = marketPhaseOf(o);
  const startsHint = !o.startedAt && (phase === "pending" || phase === "paid");

  return (
    <SxPanel title={t("facts.title")} className="mod-facts" as="section" aiId={`${aiBase}.facts`}>
      {counterpart ? (
        <div className="mod-facts__who">
          <span className="mod-facts__ava" aria-hidden="true">
            {initialsOf(counterpart)}
          </span>
          <dl className="mod-facts__who-text">
            <dt>{view === "client" ? t("facts.seller") : t("facts.client")}</dt>
            <dd>{counterpart}</dd>
          </dl>
        </div>
      ) : null}
      <dl className="mod-facts__list">
        {view === "seller" ? (
          <Row label={to("phone")}>{phoneShow === "show" ? <a className="sx-link" href={telHref(o.clientPhone)}>{o.clientPhone}</a> : <span className="mod-muted">{phoneShow === "none" ? "—" : phoneShow === "hidden" ? to("phoneConcealed") : to("phoneHidden")}</span>}</Row>
        ) : o.lawyerName ? (
          // Point 8: the advocate's phone, once the client has paid.
          <Row label={t("facts.sellerPhone")}>{sellerPhone === "show" ? <a className="sx-link" href={telHref(o.lawyerPhone)}>{o.lawyerPhone}</a> : <span className="mod-muted">{sellerPhone === "none" ? "—" : sellerPhone === "hidden" ? to("phoneConcealed") : to("phoneHidden")}</span>}</Row>
        ) : null}
        <Row label={t("facts.price")}>
          <span>
            <span className="sx-num">{o.price ? fmtUzs(o.price) : "—"}</span> {o.currency === "UZS" ? te("currency") : o.currency}
          </span>
        </Row>
        {pkgLine ? <Row label={t("facts.package")}>{pkgLine}</Row> : null}
        {o.preferredChannel ? <Row label={to("channel")}>{tch.has(o.preferredChannel) ? tch(o.preferredChannel) : o.preferredChannel}</Row> : null}
        {speed ? <Row label={to("contactSpeed")}>{speed}</Row> : null}
        {o.preferredTime && !speed ? <Row label={to("time")}>{o.preferredTime}</Row> : null}
        {o.createdAt ? <Row label={t("facts.created")}>{when(o.createdAt)}</Row> : null}
        {o.startedAt ? <Row label={t("facts.started")}>{when(o.startedAt)}</Row> : null}
        {o.expectedCompletedAt ? <Row label={t("facts.due")}>{when(o.expectedCompletedAt)}</Row> : null}
        {o.completedAt ? <Row label={t("facts.completed")}>{when(o.completedAt)}</Row> : null}
        {durationLine ? (
          <Row label={t("facts.duration")}>
            {durationLine}
            {startsHint ? <small className="mod-facts__hint">{t("duration.starts")}</small> : null}
          </Row>
        ) : null}
      </dl>
      {o.selectedOptions.length ? (
        <div className="mod-facts__opts">
          <OptionLines options={o.selectedOptions} title={to("optionsTitle")} />
        </div>
      ) : null}
      {o.note ? (
        <blockquote className="mod-facts__note">
          <small>{to("note")}</small>
          {o.note}
        </blockquote>
      ) : null}
    </SxPanel>
  );
}
