"use client";

import type { ComponentType, SVGProps } from "react";
import { useTranslations } from "next-intl";
import { isZeroBand, type PriceBand } from "@/lib/services/sellerServices";
import { priceCapOf, type RuntimePricing } from "@/lib/services/marketRuntime";
import { priceVerdict } from "@/lib/services/sellerConfig";
import { isNeutralModifier, modifierEffect, modifierLabel, type PriceModifier } from "@/lib/services/marketplacePricing";
import { IconAward, IconBriefcase, IconCoins, IconInfo, IconMapPin, IconShieldCheck, IconSliders, IconStar, IconTag, IconTrendingUp } from "@/components/icons";
import { som } from "./bits";
import { RuntimeFactors } from "./RuntimeFactors";
import "./config.css";

export const digitsOf = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12);

export function priceAboveCap(price: number, runtime: RuntimePricing | null): boolean {
  return priceVerdict(price, runtime) === "aboveMax";
}

export function bandRecommended(band: PriceBand): number {
  return band.recommended >= band.min && band.recommended <= band.max ? band.recommended : band.max;
}

const MOD_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  region: IconMapPin,
  experience: IconBriefcase,
  seller_premium: IconAward,
  client_rating_premium: IconStar,
  sector_experience_premium: IconShieldCheck,
  referral: IconTag,
  discount: IconTag,
};

export function PriceModifiers({ modifiers, variant }: { modifiers: PriceModifier[]; variant: "rows" | "chips" }) {
  const t = useTranslations("marketPricing");
  const te = useTranslations("enums");
  const list = modifiers.filter((m) => {
    const delta = m.amount ?? 0;
    if (!modifierEffect(m) && !delta) return false;
    return variant === "rows" || (modifierEffect(m) ? !isNeutralModifier(m) : true);
  });
  if (!list.length) return null;
  return (
    <ul className={variant === "chips" ? "svmod" : "svlim__mods"} aria-label={t("factors")}>
      {list.map((m, i) => {
        const Icon = MOD_ICON[m.code] ?? IconTrendingUp;
        const fx = modifierEffect(m);
        const label = modifierLabel(m, t, te);
        const delta = m.amount ?? 0;
        const tone = fx ? fx.tone : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
        const amount = delta ? `${delta > 0 ? "+" : "−"}${som(Math.abs(delta))} ${t("som")}` : "";
        return (
          <li key={`${m.code}-${m.key}-${i}`} className={`${variant === "chips" ? "svmod__c" : "svlim__mod"} is-${tone}`} title={amount ? `${label}: ${amount}` : undefined}>
            <span>
              <Icon aria-hidden="true" />
              <i>{label}</i>
            </span>
            {fx ? <b>{fx.text}</b> : amount ? <b>{amount}</b> : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function PriceField({
  id,
  value,
  onChange,
  band,
  bandState,
  basePrice,
  error,
  runtime,
  runtimeState,
  explanation,
}: {
  id: string;
  value: string;
  onChange: (digits: string) => void;
  band: PriceBand | null;
  bandState: "idle" | "loading" | "ready" | "failed";
  basePrice: number;
  error: string;
  runtime: RuntimePricing | null;
  runtimeState: "idle" | "loading" | "ready" | "failed";
  explanation: { text: string; lines: string[] } | null;
}) {
  const t = useTranslations("sellerServices.form");
  const tl = useTranslations("sellerServices.limits");
  const tc = useTranslations("sellerServices.config");
  const hintId = `${id}-hint`;
  const explId = `${id}-expl`;
  const runtimeRec = runtime && runtime.recommendedPrice > 0 ? runtime.recommendedPrice : 0;
  if (isZeroBand(band) && !runtimeRec) {
    return (
      <div className="svprice2 is-none">
        <div className="svprice2__field">
          <IconCoins aria-hidden="true" />
          <input id={id} value="" disabled placeholder={t("noPricePh")} aria-describedby={hintId} />
          <span className="svprice2__cur">{t("som")}</span>
        </div>
        <p id={hintId} className="svprice2__hint svprice2__hint--none" role="note">
          {t("noCatalogPrice")}
        </p>
      </div>
    );
  }
  const n = Number(value || "0");
  const cap = runtime ? priceCapOf(runtime) : null;
  const above = priceAboveCap(n, runtime);
  const rec = runtimeRec || (band && !isZeroBand(band) ? bandRecommended(band) : 0);
  const limId = `${id}-lim`;
  const hi = cap ? cap * 1.1 : 1;
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / (hi || 1)) * 100))}%`;
  const shown = value ? som(n) : "";
  const runtimeOk = runtimeState === "ready" && Boolean(runtime);
  const base = runtimeOk ? rec : band?.base || basePrice || 0;
  const mods = runtimeState === "failed" ? (band?.modifiers ?? []) : [];
  const expl = explanation && (explanation.text || explanation.lines.length) ? explanation : null;
  const showLimits = rec > 0 || Boolean(runtime);
  const bad = above || Boolean(error);
  const described = [hintId, expl ? explId : "", showLimits ? limId : ""].filter(Boolean).join(" ");

  const hint = error
    ? error
    : above && cap
      ? tc("aboveMax", { max: som(cap) })
      : runtimeState === "loading"
        ? tc("runtimeLoading")
        : runtimeState === "failed"
          ? tc("runtimeFailed")
          : cap
            ? tc("hintCap", { max: som(cap) })
            : runtimeOk
              ? tc("hintBelow")
              : bandState === "loading"
                ? t("bandLoading")
                : basePrice
                  ? t("priceHintBase", { price: som(basePrice) })
                  : t("priceHint");

  return (
    <div className={`svprice2${bad ? " is-bad" : ""}`}>
      <div className="svprice2__field">
        <IconCoins aria-hidden="true" />
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={shown}
          onChange={(e) => onChange(digitsOf(e.target.value))}
          placeholder={rec ? som(rec) : t("pricePh")}
          aria-describedby={described}
          aria-invalid={bad ? true : undefined}
        />
        <span className="svprice2__cur">{t("som")}</span>
      </div>

      {expl ? (
        <div id={explId} className="svcfg-expl">
          <IconInfo aria-hidden="true" />
          <div className="svcfg-expl__b">
            <b>{tc("explanationTitle")}</b>
            {expl.text && !(expl.lines.length > 1 && expl.text === expl.lines.join(" ")) ? <p>{expl.text}</p> : null}
            {expl.lines.length > 1 ? (
              <ul>
                {expl.lines.map((l, i) => (
                  <li key={`${i}-${l}`}>{l}</li>
                ))}
              </ul>
            ) : null}
            <small>{tc("explanationHint")}</small>
          </div>
        </div>
      ) : null}

      {cap ? (
        <div className="svband" aria-hidden="true">
          <div className="svband__track">
            <span className="svband__range" style={{ left: "0%", right: `calc(100% - ${pos(cap)})` }} />
            {rec > 0 && rec < cap ? <span className="svband__rec" style={{ left: pos(rec) }} /> : null}
            {n > 0 ? <span className={`svband__dot${above ? " is-off" : ""}`} style={{ left: pos(n) }} /> : null}
          </div>
          <div className="svband__lbl">
            <span style={{ left: pos(cap) }}>{som(cap)}</span>
          </div>
        </div>
      ) : null}

      <div className="svprice2__chips">
        {rec > 0 ? (
          <button type="button" className={`svchip svcfg-chip${n === rec ? " is-on" : ""}`} onClick={() => onChange(String(rec))}>
            {t("useRecommended", { price: som(rec) })}
          </button>
        ) : null}
        {cap ? (
          <button type="button" className={`svchip svcfg-chip${n === cap ? " is-on" : ""}`} onClick={() => onChange(String(cap))}>
            {tc("useMax", { price: som(cap) })}
          </button>
        ) : null}
        {value ? (
          <button type="button" className="svchip svchip--ghost svcfg-chip" onClick={() => onChange("")}>
            {t("useCatalog")}
          </button>
        ) : null}
      </div>

      <p id={hintId} className={`svprice2__hint${bad ? " is-bad" : ""}`} role={bad ? "alert" : undefined}>
        {hint}
      </p>

      {showLimits ? (
        <div id={limId} className={`svlim${bad ? " is-bad" : ""}`}>
          <p className="svlim__h">
            <IconSliders aria-hidden="true" />
            {tl("title")}
          </p>
          {base > 0 && base !== rec ? (
            <div className="svlim__row">
              <span>{tl("base")}</span>
              <b>
                {som(base)} {t("som")}
              </b>
            </div>
          ) : null}
          <PriceModifiers modifiers={mods} variant="rows" />
          {rec > 0 ? (
            <div className="svlim__row svlim__row--rec">
              <span>{tl("recommended")}</span>
              <b>
                {som(rec)} {t("som")}
              </b>
            </div>
          ) : null}
          {runtime ? (
            <div className="svlim__row svcfg-max">
              <span>{tc("maxLabel")}</span>
              <b>{cap ? `${som(cap)} ${t("som")}` : tc("maxNoneShort")}</b>
            </div>
          ) : null}
          {runtime ? <RuntimeFactors factors={runtime.factors} price={n || rec} /> : null}
        </div>
      ) : null}
    </div>
  );
}
