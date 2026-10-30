"use client";

import { useId, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PriceReqValue, PriceRequirement } from "@/lib/services/marketRuntime";
import type { PriceModifier } from "@/lib/services/marketplacePricing";
import type { PriceExplanation } from "@/lib/services/sellerServices";
import { IconAlert, IconAward, IconBriefcase, IconCheck, IconInfo, IconShieldCheck, IconSliders, IconStar, IconTrendingUp } from "@/components/icons";
import { PriceModifiers } from "./PriceField";
import { som } from "./bits";
import "./priceLimits.css";

// The price limits a lawyer works within when switching a service on: the
// floor, their own ceiling, the service's overall ceiling and how far a
// lawyer may go once they meet the criteria, the backend's reasons for the
// current ceiling, and each criterion with the backend's own verdict and
// progress. Every amount, percentage and met/unmet verdict comes from the
// backend (GET/PATCH /marketplace/me/services/{id}/configuration); this
// card only draws them — no pricing or eligibility formula lives here.

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const REQ_ICON: Readonly<Record<string, Icon>> = {
  verified: IconShieldCheck,
  verification: IconShieldCheck,
  experience: IconBriefcase,
  experience_years: IconBriefcase,
  minimum_experience_years: IconBriefcase,
  lawyer_experience: IconBriefcase,
  sector_experience: IconBriefcase,
  seller_performance: IconTrendingUp,
  client_rating: IconStar,
  rating: IconStar,
  minimum_rating: IconStar,
  completed_orders: IconAward,
  orders: IconAward,
};

export type PriceLimitsProps = {
  minimum: number;
  recommended: number;
  sellerMax: number;
  serviceMax: number;
  increasePct: number | null;
  price: number;
  explanation: PriceExplanation | null;
  modifiers: PriceModifier[] | null;
  requirements: PriceRequirement[];
  // How far below the recommended price a listing may go, and whether it may
  // at all — both straight from the backend's pricing.
  discountPct?: number | null;
  belowAllowed?: boolean | null;
  aiId?: string;
};

// The bar only: the backend's percent, held inside 0–100 so a stray value
// cannot draw outside the track. The number shown beside it is the backend's.
const barOf = (r: PriceRequirement): number | null => (r.progress === null ? null : Math.max(0, Math.min(100, r.progress)));

export default function PriceLimits({ minimum, recommended, sellerMax, serviceMax, increasePct, price, explanation, modifiers, requirements, discountPct = null, belowAllowed = null, aiId }: PriceLimitsProps) {
  const t = useTranslations("sellerServices.caps");
  const tm = useTranslations("marketPricing");
  const locale = useLocale();
  const uid = useId();
  if (!(minimum > 0 || sellerMax > 0 || serviceMax > 0)) return null;
  const over = serviceMax > sellerMax && sellerMax > 0 ? serviceMax : 0;
  const top = Math.max(over || sellerMax, price, recommended) * 1.08 || 1;
  const at = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;
  const inRange = price > 0 && (minimum <= 0 || price >= minimum) && (sellerMax <= 0 || price <= sellerMax);
  const crit = requirements;
  const metN = crit.filter((r) => r.met === true).length;
  const known = crit.some((r) => r.met !== null);
  const reasons = explanation;
  const num = (v: number) => new Intl.NumberFormat(locale === "en" ? "en-US" : locale === "ru" ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 1 }).format(v);
  const fieldLabel = (k: string) => (t.has(`f.${k}`) ? t(`f.${k}`) : t("f.other"));
  const scalar = (v: unknown, unit: string): string => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "boolean") return v ? t("yes") : t("no");
    if (typeof v === "number") return unit === "year" || unit === "years" ? t("years", { n: num(v) }) : num(v);
    return String(v);
  };
  // A scalar as a word; an object as its named values, each as sent.
  const valueOf = (v: PriceReqValue, unit: string): ReactNode => {
    if (v && typeof v === "object") {
      const pairs = Object.entries(v).filter(([k, x]) => k !== "any_of" && x !== null && typeof x !== "object");
      if (!pairs.length) return null;
      return (
        <ul className="svcap__pairs">
          {pairs.map(([k, x]) => (
            <li key={k}>
              <span>{fieldLabel(k)}</span>
              <b>{scalar(x, k === "years" ? "year" : "")}</b>
            </li>
          ))}
        </ul>
      );
    }
    const s = scalar(v, unit);
    return s ? <b className="svcap__val">{s}</b> : null;
  };
  // A criterion the backend sent no label for, and the frontend doesn't
  // know, reads as "another criterion" — never its key.
  const reqLabel = (r: PriceRequirement) => r.label || (t.has(`req.${r.key}`) ? t(`req.${r.key}`) : t("req.other"));
  // The limits in words, each sentence carrying only numbers the backend sent.
  const unmet = crit.filter((r) => r.met === false);
  const facts: string[] = [];
  if (recommended > 0) facts.push(t("fact.rec", { price: som(recommended) }));
  if (minimum > 0)
    facts.push(
      belowAllowed === false
        ? t("fact.minNoBelow", { min: som(minimum) })
        : discountPct !== null && discountPct > 0 && recommended > 0
          ? t("fact.minDiscount", { min: som(minimum), pct: num(discountPct) })
          : t("fact.min", { min: som(minimum) }),
    );
  if (sellerMax > 0)
    facts.push(over ? t("fact.capLocked", { mine: som(sellerMax), service: som(over) }) : serviceMax > 0 && sellerMax >= serviceMax ? t("fact.capFull", { max: som(sellerMax) }) : t("fact.cap", { max: som(sellerMax) }));
  if (unmet.length) facts.push(t("fact.unmet", { n: unmet.length, list: unmet.map(reqLabel).join(", ") }));
  else if (crit.length && crit.every((r) => r.met === true)) facts.push(t("fact.allMet"));
  return (
    <section className="svcap" aria-labelledby={`${uid}-h`} data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined}>
      <header className="svcap__head">
        <span className="svcap__ic" aria-hidden="true">
          <IconSliders />
        </span>
        <span className="svcap__ht">
          <b id={`${uid}-h`}>{t("title")}</b>
          <small>{t("lead")}</small>
        </span>
      </header>

      <dl className="svcap__tiles">
        <div className="svcap__tile" data-k="min">
          <dt>{t("min")}</dt>
          <dd>{minimum > 0 ? <>{som(minimum)} <small>{t("som")}</small></> : <span className="svcap__none">{t("noMin")}</span>}</dd>
        </div>
        <div className="svcap__tile" data-k="mine">
          <dt>{t("mine")}</dt>
          <dd>{sellerMax > 0 ? <>{som(sellerMax)} <small>{t("som")}</small></> : <span className="svcap__none">{t("noMax")}</span>}</dd>
        </div>
        {serviceMax > 0 ? (
          <div className="svcap__tile" data-k="service">
            <dt>{t("service")}</dt>
            <dd>
              {som(serviceMax)} <small>{t("som")}</small>
            </dd>
          </div>
        ) : null}
      </dl>

      {sellerMax > 0 ? (
        <div className="svcap__band" role="img" aria-label={t("bandAria", { min: som(minimum), max: som(sellerMax), price: price > 0 ? som(price) : "—" })}>
          <div className="svcap__track">
            <span className="svcap__ok" style={{ left: at(minimum), width: `calc(${at(sellerMax)} - ${at(minimum)})` }} />
            {over ? <span className="svcap__lock" style={{ left: at(sellerMax), width: `calc(${at(over)} - ${at(sellerMax)})` }} /> : null}
            {recommended > 0 ? <span className="svcap__rec" style={{ left: at(recommended) }} title={t("rec", { price: som(recommended) })} /> : null}
            {price > 0 ? <span className="svcap__dot" data-ok={inRange ? "" : undefined} style={{ left: at(price) }} /> : null}
          </div>
          <div className="svcap__marks" aria-hidden="true">
            {minimum > 0 && (sellerMax - minimum) / top > 0.28 ? <span style={{ left: at(minimum) }}>{som(minimum)}</span> : null}
            <span style={{ left: at(sellerMax) }} data-strong="">
              {som(sellerMax)}
            </span>
            {over && (over - sellerMax) / top > 0.28 ? <span style={{ left: at(over) }}>{som(over)}</span> : null}
          </div>
          <p className="svcap__legend">
            <span data-k="ok">{t("legendOk")}</span>
            {over ? <span data-k="lock">{t("legendLock")}</span> : null}
            {recommended > 0 ? <span data-k="rec">{t("rec", { price: som(recommended) })}</span> : null}
          </p>
        </div>
      ) : null}

      {/* The backend's own figure (maximum_increase_percent): how much
          further the allowed ceiling can grow once the unmet criteria are
          met. Not computed, capped or rounded here; nothing at 0. */}
      {increasePct !== null && increasePct > 0 ? (
        <p className="svcap__unlock">
          <IconTrendingUp aria-hidden="true" />
          <span>{t("growth", { pct: num(increasePct) })}</span>
        </p>
      ) : null}

      {reasons || facts.length || (modifiers && modifiers.length) ? (
        <div className="svcap__why">
          <p className="svcap__sub">
            <IconInfo aria-hidden="true" />
            {sellerMax > 0 ? t("whyMax", { max: som(sellerMax) }) : t("why")}
          </p>
          {reasons?.text && !(reasons.lines.length > 1 && reasons.text === reasons.lines.join(" ")) ? <p className="svcap__txt">{reasons.text}</p> : null}
          {facts.length ? (
            <ul className="svcap__facts svcap__facts--num">
              {facts.map((f) => (
                <li key={f}>
                  <IconInfo aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {reasons?.lines.length ? (
            <ul className="svcap__facts">
              {reasons.lines.map((l, i) => (
                <li key={`${i}-${l}`}>
                  <IconCheck aria-hidden="true" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {reasons?.factors.length ? (
            <ul className="svcap__fx">
              {reasons.factors.map((f, i) => (
                <li key={`${f.key}-${i}`} data-down={/^[-−]/.test(f.effect) ? "" : undefined}>
                  {/* The backend names its factors in Uzbek; known ones read in the viewer's language. */}
                  <span>{f.key && tm.has(`mod.${f.key}`) ? tm(`mod.${f.key}`) : f.label}</span>
                  {f.effect ? <b>{f.effect}</b> : null}
                </li>
              ))}
            </ul>
          ) : modifiers && modifiers.length ? (
            <PriceModifiers modifiers={modifiers} variant="chips" />
          ) : null}
          <small className="svcap__src">{t("source")}</small>
        </div>
      ) : null}

      {crit.length ? (
        <div className="svcap__reqs">
          <p className="svcap__sub">
            <IconAward aria-hidden="true" />
            {t("reqTitle")}
            {known ? <span className="svcap__count">{t("reqCount", { met: metN, total: crit.length })}</span> : null}
          </p>
          <ul className="svcap__list">
            {crit.map((r, i) => {
              const Ic = REQ_ICON[r.key] ?? IconAward;
              const bar = barOf(r);
              const state = r.met === true ? "met" : r.met === false ? "unmet" : "unknown";
              const cur = valueOf(r.current, r.unit);
              const need = r.anyOf ? null : valueOf(r.required, r.unit);
              return (
                <li key={`${r.key}-${i}`} className="svcap__req" data-state={state}>
                  <span className="svcap__ric" aria-hidden="true">
                    <Ic />
                  </span>
                  <span className="svcap__rb">
                    <span className="svcap__rt">
                      <b>{reqLabel(r)}</b>
                      <span className="svcap__rs">
                        {state === "met" ? <IconCheck aria-hidden="true" /> : state === "unmet" ? <IconAlert aria-hidden="true" /> : null}
                        {t(`state.${state}`)}
                      </span>
                    </span>
                    {bar !== null ? (
                      <span className="svcap__prog">
                        <span className="svcap__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar)} aria-label={reqLabel(r)}>
                          <i style={{ width: `${bar}%` }} />
                        </span>
                        <span className="svcap__pct">{t("progress", { n: num(r.progress ?? 0) })}</span>
                      </span>
                    ) : null}
                    <span className="svcap__kv">
                      {cur ? (
                        <span className="svcap__kvr">
                          <small>{t("now")}</small>
                          {cur}
                        </span>
                      ) : (
                        <span className="svcap__kvr">
                          <small>{t("now")}</small>
                          <span className="svcap__none">{t("noCurrent")}</span>
                        </span>
                      )}
                      {need ? (
                        <span className="svcap__kvr">
                          <small>{t("need")}</small>
                          {need}
                        </span>
                      ) : null}
                    </span>
                    {r.anyOf && r.anyOf.length ? (
                      <span className="svcap__any">
                        <small>{t("anyOf")}</small>
                        <ol className="svcap__alts">
                          {r.anyOf.map((alt, k) => (
                            <li key={k}>
                              <span className="svcap__altn">{t("alt", { n: k + 1 })}</span>
                              {valueOf(alt, "")}
                            </li>
                          ))}
                        </ol>
                      </span>
                    ) : null}
                    {r.note ? <small className="svcap__note">{r.note}</small> : null}
                  </span>
                </li>
              );
            })}
          </ul>

        </div>
      ) : null}
    </section>
  );
}
