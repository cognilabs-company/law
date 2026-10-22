"use client";

import { useEffect, useId, useState, type ComponentType, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { MinimumRequirements, PriceRequirement } from "@/lib/services/marketRuntime";
import type { PriceModifier } from "@/lib/services/marketplacePricing";
import { getSellerStanding, type PriceExplanation, type SellerStanding } from "@/lib/services/sellerServices";
import { IconAlert, IconAward, IconBriefcase, IconCheck, IconInfo, IconShieldCheck, IconSliders, IconStar, IconTrendingUp } from "@/components/icons";
import { PriceModifiers } from "./PriceField";
import { som } from "./bits";
import "./priceLimits.css";

// The price limits a lawyer works within when switching a service on: the
// floor, their own ceiling, the service's overall ceiling and how far a
// lawyer may go once they meet the criteria, the backend's reasons for the
// current ceiling, and each unmet criterion as a progress bar. Every amount
// and every met/unmet verdict comes from the backend; this card only draws.

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const REQ_ICON: Readonly<Record<string, Icon>> = {
  verified: IconShieldCheck,
  verification: IconShieldCheck,
  experience: IconBriefcase,
  experience_years: IconBriefcase,
  minimum_experience_years: IconBriefcase,
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
  fallback: { req: MinimumRequirements | null; verified: boolean };
  // GET /lawyers/me: the seller's current experience, rating and
  // verification, for the criteria the backend lists without them.
  standing?: SellerStanding | null;
  // How far below the recommended price a listing may go, and whether it may
  // at all — both straight from the backend's pricing.
  discountPct?: number | null;
  belowAllowed?: boolean | null;
  aiId?: string;
};

// The backend's criteria with its own verdicts, or — when it lists none —
// the service's minimum requirements beside the seller's own values from
// GET /lawyers/me. Only in that second case is met/unmet read here, by
// setting one backend number against the other; `derived` says so on screen.
function criteriaOf(list: PriceRequirement[], fb: PriceLimitsProps["fallback"], st: SellerStanding | null): { rows: PriceRequirement[]; derived: boolean } {
  if (list.length) return { rows: list, derived: false };
  const r = fb.req;
  if (!r || r.empty) return { rows: [], derived: false };
  const out: PriceRequirement[] = [];
  const atLeast = (cur: number | null, need: number) => (cur === null ? null : cur >= need);
  if (r.verified === true) {
    const v = st?.verified ?? fb.verified;
    out.push({ key: "verified", label: "", current: v, required: true, unit: "", met: v, progress: null, note: "" });
  }
  if (r.minimumExperienceYears > 0) {
    const cur = st?.experienceYears ?? null;
    out.push({ key: "experience_years", label: "", current: cur, required: r.minimumExperienceYears, unit: "year", met: atLeast(cur, r.minimumExperienceYears), progress: null, note: "" });
  }
  if (r.minimumRating > 0) {
    const cur = st?.rating ?? null;
    out.push({ key: "rating", label: "", current: cur, required: r.minimumRating, unit: "", met: atLeast(cur, r.minimumRating), progress: null, note: "" });
  }
  return { rows: out, derived: true };
}

// How full a bar is: the backend's own percent, else the plain ratio of the
// two numbers it sent (a display ratio only, never a price).
function fillOf(r: PriceRequirement): number | null {
  if (r.progress !== null) return r.progress;
  if (r.met === true) return 100;
  if (typeof r.current === "number" && typeof r.required === "number" && r.required > 0) return Math.max(0, Math.min(100, (r.current / r.required) * 100));
  if (typeof r.current === "boolean") return r.current ? 100 : 0;
  return null;
}

// The seller's standing, read once per form; null until it arrives or when
// the profile cannot be read (the criteria then show without current values).
export function useSellerStanding(): SellerStanding | null {
  const [st, setSt] = useState<SellerStanding | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    getSellerStanding(ctl.signal).then(
      (v) => !ctl.signal.aborted && setSt(v),
      () => {},
    );
    return () => ctl.abort();
  }, []);
  return st;
}

export default function PriceLimits({ minimum, recommended, sellerMax, serviceMax, increasePct, price, explanation, modifiers, requirements, fallback, standing = null, discountPct = null, belowAllowed = null, aiId }: PriceLimitsProps) {
  const t = useTranslations("sellerServices.caps");
  const locale = useLocale();
  const uid = useId();
  if (!(minimum > 0 || sellerMax > 0 || serviceMax > 0)) return null;
  const over = serviceMax > sellerMax && sellerMax > 0 ? serviceMax : 0;
  const top = Math.max(over || sellerMax, price, recommended) * 1.08 || 1;
  const at = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;
  const inRange = price > 0 && (minimum <= 0 || price >= minimum) && (sellerMax <= 0 || price <= sellerMax);
  const { rows: crit, derived } = criteriaOf(requirements, fallback, standing);
  const metN = crit.filter((r) => r.met === true).length;
  const known = crit.some((r) => r.met !== null);
  const reasons = explanation;
  const num = (v: number) => new Intl.NumberFormat(locale === "en" ? "en-US" : locale === "ru" ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 1 }).format(v);
  const valueText = (v: number | boolean | null, unit: string) => {
    if (v === null) return "";
    if (typeof v === "boolean") return v ? t("yes") : t("no");
    return unit === "year" || unit === "years" ? t("years", { n: v }) : unit ? `${num(v)} ${unit}` : num(v);
  };
  const reqLabel = (r: PriceRequirement) => r.label || (t.has(`req.${r.key}`) ? t(`req.${r.key}`) : r.key);
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
            {increasePct !== null ? (
              <span className="svcap__up">
                <IconTrendingUp aria-hidden="true" />
                {t("upTo", { pct: num(increasePct) })}
              </span>
            ) : null}
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

      {over ? (
        <p className="svcap__unlock">
          <IconTrendingUp aria-hidden="true" />
          <span>{increasePct !== null ? t("unlockPct", { pct: num(increasePct), max: som(over) }) : t("unlock", { max: som(over) })}</span>
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
                  <span>{f.label}</span>
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
              const fill = fillOf(r);
              const state = r.met === true ? "met" : r.met === false ? "unmet" : "unknown";
              const cur = valueText(r.current, r.unit);
              const need = valueText(r.required, r.unit);
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
                    {fill !== null ? (
                      <span className="svcap__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill)} aria-label={reqLabel(r)}>
                        <i style={{ width: `${fill}%` }} />
                      </span>
                    ) : null}
                    <small>
                      {cur && need ? t("curNeed", { cur, need }) : need ? t("needOnly", { need }) : ""}
                      {r.current === null && r.met === null ? ` · ${t("noCurrent")}` : ""}
                      {r.note ? ` · ${r.note}` : ""}
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
          {derived && crit.some((r) => r.met !== null) ? <small className="svcap__src">{t("derivedNote")}</small> : null}
        </div>
      ) : null}
    </section>
  );
}
