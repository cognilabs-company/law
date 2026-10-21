"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { PriceExplanation } from "@/lib/services/sellerServices";
import type { PriceModifier } from "@/lib/services/marketplacePricing";
import { IconChevronDown, IconCheck, IconHelpCircle } from "@/components/icons";
import { PriceModifiers } from "./PriceField";
import { som } from "./bits";
import "./catalogPicker.css";

export type PriceWhyFacts = {
  recommended: number;
  minimum: number;
  pct: number | null;
  maximum: number;
  base: number;
  modifiers: PriceModifier[] | null;
  negotiation?: boolean;
};

export function hasPriceWhy(explanation: PriceExplanation | null, f: PriceWhyFacts): boolean {
  return Boolean(explanation) || f.recommended > 0 || f.minimum > 0 || f.maximum > 0;
}

export default function PriceWhy({ explanation, facts, aiId }: { explanation: PriceExplanation | null; facts: PriceWhyFacts; aiId?: string }) {
  const t = useTranslations("sellerServices.why");
  const uid = useId();
  if (!hasPriceWhy(explanation, facts)) return null;
  const lines: string[] = [];
  if (facts.base > 0 && facts.base !== facts.recommended) lines.push(t("base", { price: som(facts.base) }));
  if (facts.recommended > 0) lines.push(t("rec", { price: som(facts.recommended) }));
  if (facts.minimum > 0) lines.push(facts.pct !== null ? t("floorPct", { min: som(facts.minimum), pct: String(facts.pct) }) : t("floor", { min: som(facts.minimum) }));
  if (facts.maximum > 0) lines.push(t("max", { max: som(facts.maximum) }));
  if (facts.negotiation && facts.minimum > 0) lines.push(t("negotiation"));
  const textShown = explanation && explanation.text && !(explanation.lines.length > 1 && explanation.text === explanation.lines.join(" ")) ? explanation.text : "";
  return (
    <details className="svwhy" open data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined} data-ai-label={aiId ? t("title") : undefined}>
      <summary aria-describedby={`${uid}-l`}>
        <IconHelpCircle aria-hidden="true" />
        <span className="svwhy__t">
          <b>{t("title")}</b>
          <small id={`${uid}-l`}>{t("lead")}</small>
        </span>
        <IconChevronDown aria-hidden="true" className="svwhy__chev" />
      </summary>
      <div className="svwhy__b">
        {explanation ? (
          <>
            <span className="svwhy__src">{t("srcLexgo")}</span>
            {textShown ? <p>{textShown}</p> : null}
            {explanation.lines.length ? (
              <ul>
                {explanation.lines.map((l, i) => (
                  <li key={`${i}-${l}`} className="svwhy__li">
                    <IconCheck aria-hidden="true" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {explanation.factors.length ? (
              <ul className="svwhy__fx" aria-label={t("mods")}>
                {explanation.factors.map((f, i) => (
                  <li key={`${f.key}-${i}`} className={/^[-−]/.test(f.effect) ? "is-down" : undefined}>
                    <span>{f.label}</span>
                    {f.effect ? <b>{f.effect}</b> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {lines.length ? (
          <ul>
            {lines.map((l) => (
              <li key={l} className="svwhy__li">
                <IconCheck aria-hidden="true" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {!explanation?.factors.length && facts.modifiers && facts.modifiers.length ? (
          <>
            <span className="svwhy__src">{t("mods")}</span>
            <PriceModifiers modifiers={facts.modifiers} variant="chips" />
          </>
        ) : null}
        {!explanation ? <span className="svwhy__src">{t("srcBuilt")}</span> : null}
      </div>
    </details>
  );
}
