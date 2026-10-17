"use client";

import { useLocale, useTranslations } from "next-intl";
import type { RuntimeFactor } from "@/lib/services/marketRuntime";
import { fmtUzs } from "@/lib/money";
import { factorAmount, fmtPct, orderedFactors, type HeadingLevel } from "./facts";
import { FactHeading } from "./ChecklistPreview";
import "./runtime.css";

export function FactorList({ factors, basePrice, currency, level = 3 }: { factors: readonly RuntimeFactor[]; basePrice: number; currency: string; level?: HeadingLevel }) {
  const t = useTranslations("marketplace.runtime");
  const te = useTranslations("enums");
  const locale = useLocale();
  const list = orderedFactors(factors);
  if (!list.length) return null;
  const code = (currency || "").trim().toUpperCase();
  const cur = !code || code === "UZS" ? te("currency") : code;
  const base = basePrice > 0 ? basePrice : 0;
  return (
    <div className="mkrt-fx">
      <FactHeading level={level}>{t("factorsTitle")}</FactHeading>
      <p className="mkrt-lead">{t("factorsLead")}</p>
      {base ? <p className="mkrt-fx__base">{t("factorsBase", { amount: fmtUzs(base), cur })}</p> : null}
      <ul className="mkrt-fx__list">
        {list.map((f, i) => (
          <li key={f.id || `${f.title}-${i}`} className={`mkrt-fx__row mkrt-fx__row--${f.adjustmentType}`}>
            <span className="mkrt-fx__t">
              {f.title}
              {f.description ? <small>{f.description}</small> : null}
            </span>
            <b>
              {f.adjustmentType === "percent"
                ? base
                  ? t("factorPercent", { pct: fmtPct(f.value, locale), amount: fmtUzs(factorAmount(base, f)), cur })
                  : t("factorPercentOnly", { pct: fmtPct(f.value, locale) })
                : t("factorFixed", { amount: fmtUzs(f.value), cur })}
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}
