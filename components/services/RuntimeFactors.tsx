"use client";

import { useLocale, useTranslations } from "next-intl";
import type { MinimumRequirements, RuntimeFactor } from "@/lib/services/marketRuntime";
import { fmtRating } from "@/lib/date";
import { IconAlert, IconCheck, IconTrendingUp } from "@/components/icons";
import { som } from "./bits";
import "./config.css";

export function factorAmount(price: number, f: RuntimeFactor): number {
  if (!(f.value > 0)) return 0;
  if (f.adjustmentType === "percent") return Math.max(0, Math.round((Math.max(0, price) * f.value) / 100));
  return f.value;
}

export function RuntimeFactors({ factors, price, id }: { factors: RuntimeFactor[]; price: number; id?: string }) {
  const t = useTranslations("sellerServices.config");
  const list = factors.filter((f) => f.value > 0);
  if (!list.length) return null;
  const ordered = [...list.filter((f) => f.adjustmentType === "fixed"), ...list.filter((f) => f.adjustmentType === "percent")];
  return (
    <div className="svcfg-fx" id={id}>
      <p className="svcfg-fx__h">
        <IconTrendingUp aria-hidden="true" />
        {t("factorsTitle")}
      </p>
      <p className="svcfg-fx__hint">{t("factorsHint")}</p>
      <ul className="svcfg-fx__list">
        {ordered.map((f, i) => (
          <li key={f.id || `${f.title}-${i}`} className={`svcfg-fx__row svcfg-fx__row--${f.adjustmentType}`} title={f.description || undefined}>
            <span className="svcfg-fx__t">
              <i>{f.title}</i>
              {f.description ? <small>{f.description}</small> : null}
            </span>
            <b>
              {f.adjustmentType === "percent"
                ? t("factorPercent", { pct: String(f.value), amount: som(factorAmount(price, f)) })
                : t("factorFixed", { amount: som(factorAmount(price, f)) })}
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RequirementsLine({ req, verified, id }: { req: MinimumRequirements; verified: boolean; id?: string }) {
  const t = useTranslations("sellerServices.config");
  const locale = useLocale();
  if (req.empty) return null;
  const needVerified = req.verified === true;
  const years = req.minimumExperienceYears > 0 ? req.minimumExperienceYears : 0;
  const rating = req.minimumRating > 0 ? req.minimumRating : 0;
  if (!needVerified && !years && !rating) return null;
  const unmet = needVerified && !verified;
  return (
    <div className="svcfg-req" id={id}>
      <div className="svcfg-req__row">
        <span className="svcfg-req__h">{t("reqTitle")}:</span>
        <ul className="svcfg-req__chips">
          {needVerified ? (
            <li className={`svcfg-req__c ${unmet ? "is-unmet" : "is-met"}`}>
              {unmet ? <IconAlert aria-hidden="true" /> : <IconCheck aria-hidden="true" />}
              {t("reqVerified")}
            </li>
          ) : null}
          {years ? <li className="svcfg-req__c">{t("reqExperience", { n: years })}</li> : null}
          {rating ? <li className="svcfg-req__c">{t("reqRating", { r: fmtRating(rating, locale) })}</li> : null}
        </ul>
      </div>
      {unmet ? <p className="svcfg-req__warn">{t("reqUnmet")}</p> : null}
    </div>
  );
}
