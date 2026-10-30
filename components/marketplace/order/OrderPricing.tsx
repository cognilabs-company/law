"use client";

import "./pricing.css";
import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { fmtUzs } from "@/lib/money";
import { getOrderFinancials, type OrderFinancials, type OrderPricing as Pricing } from "@/lib/services/marketplace";
import { isAborted, logApiError } from "@/lib/http";
import { modifierEffect, modifierLabel, readPriceModifiers } from "@/lib/services/marketplacePricing";
import type { OrderView } from "./types";

// How the order's price was set, as the backend fixed it when the order was
// placed: the factors that set the seller's allowed ceiling, the range, the
// price the seller chose, the final amount and the payments made. The
// seller also sees LexGo's commission and their own net; the client never
// does. Every number is printed as sent — nothing is added up or derived.

const PAID = new Set(["paid", "succeeded", "success", "completed", "captured", "confirmed"]);
const WAITING = new Set(["pending", "created", "processing", "requires_action", "awaiting", "waiting"]);
const STATUS_KEYS = new Set(["failed", "cancelled", "refunded", "reversed", "expired"]);
const SETTLEMENT_KEYS = new Set(["pending", "held", "complaint_hold", "rework_hold", "refund_required", "ready_for_release", "released", "settled", "refunded"]);

// Each stage's status as the provider reported it, refetched whenever the
// order's status or payment status moves (realtime refetches the order).
function useFinancials(orderId: string, key: string): OrderFinancials | "failed" | null {
  const [state, setState] = useState<{ key: string; data: OrderFinancials | "failed" } | null>(null);
  const want = `${orderId}:${key}`;
  useEffect(() => {
    if (!orderId) return;
    const ctl = new AbortController();
    getOrderFinancials(orderId, ctl.signal).then(
      (data) => setState({ key: want, data }),
      (e: unknown) => {
        if (isAborted(e)) return;
        logApiError("marketplace.order.financials", e);
        setState({ key: want, data: "failed" });
      },
    );
    return () => ctl.abort();
  }, [orderId, want]);
  return state && state.key.startsWith(`${orderId}:`) ? state.data : null;
}

const WHY = new Set(["region", "experience", "sector_experience_premium", "client_rating_premium", "seller_premium", "referral", "discount"]);

export default function OrderPricing({ pricing, view, currency, aiBase, orderId, refreshKey }: { pricing: Pricing; view: OrderView; currency: string; aiBase: string; orderId: string; refreshKey: string }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.pricing");
  const tr = useTranslations("marketplace.orderDetail.pricing.reason");
  const tm = useTranslations("marketPricing");
  const te = useTranslations("enums");
  const locale = useLocale();
  const cur = currency === "UZS" ? te("currency") : currency;
  const money = (n: number) => `${fmtUzs(n)} ${cur}`;
  // A factor that changes nothing (×1.00, no amount) is left out.
  const mods = readPriceModifiers(pricing.modifiers, locale).filter((m) => m.amount || (modifierEffect(m)?.tone ?? "flat") !== "flat");
  const commission = view === "seller" ? pricing.commission : null;
  const got = useFinancials(orderId, refreshKey);
  const fin = got === "failed" ? null : got;
  const statusOf = (st: string): { key: string; tone: "ok" | "wait" | "bad" } | null => {
    if (!st) return null;
    if (PAID.has(st)) return { key: "paid", tone: "ok" };
    if (WAITING.has(st)) return { key: "pending", tone: "wait" };
    return STATUS_KEYS.has(st) ? { key: st, tone: "bad" } : null;
  };
  const chip = (st: string) => {
    const s = statusOf(st);
    return s ? (
      <em className="mod-price__st" data-tone={s.tone}>
        {t(`status.${s.key}`)}
      </em>
    ) : null;
  };
  // The order is paid in full first (TSK-900422, 100%; the 10% advance of
  // TSK-783253 is gone): every payment row the backend has, as it is.
  const payments = fin?.payments ?? [];
  // TSK-787056: the client sees what they pay and, when this specialist's
  // price differs from the base, the backend's diplomatic reasons — never
  // the factors, the seller's allowed range, caps or commission.
  if (view === "client") {
    if (!(pricing.final > 0)) return null;
    const changed = pricing.base > 0 && pricing.final !== pricing.base;
    // The backend's own sentence (already in the client's language), else
    // its translations, else the code worded here — never the code.
    // Only the sentences: what each reason adds is not shown, so the price
    // build-up stays private ("to'liq chiqarmaslik kerak"). Same sentence twice → once.
    const reasons = [...new Set(pricing.clientReasons.map((r) => r.text || r.i18n[locale === "uz" ? "uz_latn" : locale] || r.i18n.uz_latn || (tr.has(r.code) ? tr(r.code) : tr("other"))))];
    return (
      <SxPanel title={t("title")} className="mod-price mod-price--client" as="section" aiId={`${aiBase}.pricing`}>
        {changed ? (
          <div className="mod-price__row">
            <span>{t("base")}</span>
            <b className="sx-num">{money(pricing.base)}</b>
          </div>
        ) : null}
        {pricing.options.length ? (
          <div className="mod-price__group">
            <p className="mod-price__sub">{t("options")}</p>
            {pricing.options.map((x, i) => (
              <div key={`${x.label}-${i}`} className="mod-price__row">
                <span>{x.label}</span>
                <b className="sx-num">{`${x.amount > 0 ? "+" : "−"}${money(Math.abs(x.amount))}`}</b>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mod-price__row mod-price__row--total">
          <span>{t("final")}</span>
          <b className="sx-num">{money(pricing.final)}</b>
        </div>
        {changed ? (
          <div className="mod-price__why">
            <p className="mod-price__sub">{pricing.final > pricing.base ? t("whyUp") : t("whyDown")}</p>
            {reasons.length ? (
              <ul>
                {reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : (
              <p>{pricing.final > pricing.base ? t("whyUpDefault") : t("whyDownDefault")}</p>
            )}
          </div>
        ) : null}
        {fin?.payments.length ? (
          <div className="mod-price__group">
            <p className="mod-price__sub">{t("payments")}</p>
            {fin.payments.map((p) => (
              <div key={p.id || p.stage} className="mod-price__row">
                <span>
                  {t("payment")}
                  {chip(p.status)}
                </span>
                <b className="sx-num">{money(p.amount)}</b>
              </div>
            ))}
          </div>
        ) : null}
        <p className="mod-price__foot">{t("fixed")}</p>
      </SxPanel>
    );
  }
  const settlement = view === "seller" && fin && SETTLEMENT_KEYS.has(fin.settlement) ? fin.settlement : "";
  if (!(pricing.final > 0 || mods.length)) return null;
  const pct = (n: number | null) => (n === null ? "" : ` · ${n}%`);
  return (
    <SxPanel title={t("title")} className="mod-price" as="section" aiId={`${aiBase}.pricing`}>
      {pricing.components.length ? (
        <div className="mod-price__group">
          <p className="mod-price__sub">{t("parts")}</p>
          {pricing.components.map((c, i) => {
            const label = c.label[locale] || c.label.uz || (t.has(`part.${c.code}`) ? t(`part.${c.code}`) : t("part.other"));
            const signed = i > 0 || c.amount < 0;
            return (
              <div key={`${c.code}-${i}`} className="mod-price__row">
                <span>{`${label}${c.percent === null ? "" : ` · ${c.percent}%`}`}</span>
                <b className="sx-num">{signed ? `${c.amount < 0 ? "−" : "+"}${money(Math.abs(c.amount))}` : money(c.amount)}</b>
              </div>
            );
          })}
        </div>
      ) : null}
      {pricing.historical ? <p className="mod-price__note">{t("historical")}</p> : null}
      {pricing.base > 0 && !pricing.components.length ? (
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
      {pricing.options.length && !pricing.components.length ? (
        <div className="mod-price__group">
          <p className="mod-price__sub">{t("options")}</p>
          {pricing.options.map((x, i) => (
            <div key={`${x.label}-${i}`} className="mod-price__row">
              <span>{`${x.label}${x.percent === null ? "" : ` · ${x.percent > 0 ? "+" : ""}${x.percent}%`}`}</span>
              <b className="sx-num">{`${x.amount > 0 ? "+" : "−"}${money(Math.abs(x.amount))}`}</b>
            </div>
          ))}
        </div>
      ) : null}
      {pricing.final > 0 ? (
        <div className="mod-price__row mod-price__row--total">
          <span>{t("final")}</span>
          <b className="sx-num">{money(pricing.final)}</b>
        </div>
      ) : null}
      {payments.length ? (
        <div className="mod-price__group">
          <p className="mod-price__sub">{t("payments")}</p>
          {payments.map((p) => (
            <div key={p.id || p.stage} className="mod-price__row">
              <span>
                {t("payment")}
                {chip(p.status)}
              </span>
              <b className="sx-num">{money(p.amount)}</b>
            </div>
          ))}
          {settlement ? (
            <div className="mod-price__row">
              <span>{t("settlement")}</span>
              <b>{t(`settle.${settlement}`)}</b>
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
