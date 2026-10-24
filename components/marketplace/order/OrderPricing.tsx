"use client";

import "./pricing.css";
import type { ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { fmtUzs } from "@/lib/money";
import type { OrderPricing as Pricing } from "@/lib/services/marketplace";
import { modifierEffect, modifierLabel, readPriceModifiers } from "@/lib/services/marketplacePricing";
import type { OrderView } from "./types";

// How the order's price was set, as the backend fixed it when the order was
// placed: the factors that set the seller's allowed ceiling, the range, the
// price the seller chose, the final amount and its advance/final split. The
// seller also sees LexGo's commission and their own net; the client never
// does. Every number is printed as sent — nothing is added up or derived.

const WHY = new Set(["region", "experience", "sector_experience_premium", "client_rating_premium", "seller_premium", "referral", "discount"]);

export default function OrderPricing({ pricing, view, currency, aiBase }: { pricing: Pricing; view: OrderView; currency: string; aiBase: string }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.pricing");
  const tm = useTranslations("marketPricing");
  const te = useTranslations("enums");
  const locale = useLocale();
  const cur = currency === "UZS" ? te("currency") : currency;
  const money = (n: number) => `${fmtUzs(n)} ${cur}`;
  const mods = readPriceModifiers(pricing.modifiers, locale).filter((m) => modifierEffect(m) || m.amount);
  const commission = view === "seller" ? pricing.commission : null;
  if (!(pricing.final > 0 || mods.length)) return null;
  const pct = (n: number | null) => (n === null ? "" : ` · ${n}%`);
  return (
    <SxPanel title={t("title")} className="mod-price" as="section" aiId={`${aiBase}.pricing`}>
      {pricing.base > 0 ? (
        <div className="mod-price__row">
          <span>{t("base")}</span>
          <b className="sx-num">{money(pricing.base)}</b>
        </div>
      ) : null}
      {mods.length ? (
        <div className="mod-price__group">
          <p className="mod-price__sub">{t("factors")}</p>
          <ul className="mod-price__mods">
            {mods.map((m, i) => {
              const fx = modifierEffect(m);
              const amount = m.amount ?? 0;
              const tone = fx ? fx.tone : amount > 0 ? "up" : amount < 0 ? "down" : "flat";
              const code = WHY.has(m.code) ? m.code : "other";
              return (
                <li key={`${m.code}-${m.key}-${i}`} className="mod-price__mod" data-tone={tone}>
                  <span className="mod-price__mt">
                    <b>{modifierLabel(m, tm, te)}</b>
                    <small>{t(`why.${code}`)}</small>
                  </span>
                  <span className="mod-price__mv">
                    {fx ? <i>{fx.text}</i> : null}
                    {amount ? <b className="sx-num">{`${amount > 0 ? "+" : "−"}${money(Math.abs(amount))}`}</b> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {pricing.min > 0 && pricing.max > 0 ? (
        <div className="mod-price__row">
          <span>{t("range")}</span>
          <b className="sx-num">{`${fmtUzs(pricing.min)} – ${money(pricing.max)}`}</b>
        </div>
      ) : null}
      {pricing.selected > 0 ? (
        <div className="mod-price__row">
          <span>{view === "seller" ? t("selectedMine") : t("selected")}</span>
          <b className="sx-num">{money(pricing.selected)}</b>
        </div>
      ) : null}
      {pricing.capped ? <p className="mod-price__note">{t("capped")}</p> : null}
      {pricing.final > 0 ? (
        <div className="mod-price__row mod-price__row--total">
          <span>{t("final")}</span>
          <b className="sx-num">{money(pricing.final)}</b>
        </div>
      ) : null}
      {pricing.advance || pricing.rest ? (
        <div className="mod-price__group">
          <p className="mod-price__sub">{t("payments")}</p>
          {pricing.advance ? (
            <div className="mod-price__row">
              <span>{`${t("advance")}${pct(pricing.advance.percent)}`}</span>
              <b className="sx-num">{money(pricing.advance.amount)}</b>
            </div>
          ) : null}
          {pricing.rest ? (
            <div className="mod-price__row">
              <span>{`${t("rest")}${pct(pricing.rest.percent)}`}</span>
              <b className="sx-num">{money(pricing.rest.amount)}</b>
            </div>
          ) : null}
        </div>
      ) : null}
      {commission ? (
        <div className="mod-price__group mod-price__group--mine">
          <p className="mod-price__sub">{t("yours")}</p>
          <div className="mod-price__row">
            <span>{`${t("commission")}${pct(commission.percent)}`}</span>
            <b className="sx-num">{commission.platform > 0 ? `−${money(commission.platform)}` : money(0)}</b>
          </div>
          {commission.net > 0 ? (
            <div className="mod-price__row mod-price__row--total">
              <span>{t("net")}</span>
              <b className="sx-num">{money(commission.net)}</b>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="mod-price__foot">{t("fixed")}</p>
    </SxPanel>
  );
}
