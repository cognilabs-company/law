"use client";

import type { ComponentType, SVGProps } from "react";
import { useTranslations } from "next-intl";
import type { PriceBand } from "@/lib/services/sellerServices";
import { isNeutralModifier, modifierEffect, modifierLabel, type PriceModifier } from "@/lib/services/marketplacePricing";
import { IconAward, IconBriefcase, IconCoins, IconMapPin, IconShieldCheck, IconSliders, IconStar, IconTag, IconTrendingUp } from "@/components/icons";
import { som } from "./bits";

export const digitsOf = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12);

export function priceOutOfBand(price: number, band: PriceBand | null): boolean {
  return Boolean(band && price > 0 && (price < band.min || price > band.max));
}

export function bandRecommended(band: PriceBand): number {
  return band.recommended >= band.min && band.recommended <= band.max ? band.recommended : band.max;
}

export function bandPercents(band: PriceBand | null): { lo: number; hi: number } | null {
  if (!band || band.recommended <= 0) return null;
  return { lo: Math.round((band.min / band.recommended) * 100), hi: Math.round((band.max / band.recommended) * 100) };
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
}: {
  id: string;
  value: string;
  onChange: (digits: string) => void;
  band: PriceBand | null;
  bandState: "idle" | "loading" | "ready" | "failed";
  basePrice: number;
  error: string;
}) {
  const t = useTranslations("sellerServices.form");
  const tl = useTranslations("sellerServices.limits");
  const n = Number(value || "0");
  const off = priceOutOfBand(n, band);
  const hintId = `${id}-hint`;
  const limId = `${id}-lim`;
  const lo = band ? band.min * 0.86 : 0;
  const hi = band ? band.max * 1.1 : 1;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  const shown = value ? som(n) : "";
  const rec = band ? bandRecommended(band) : 0;
  const pct = bandPercents(band);
  const base = band?.base || basePrice || 0;
  const mods = band?.modifiers ?? [];

  return (
    <div className={`svprice2${off || error ? " is-bad" : ""}`}>
      <div className="svprice2__field">
        <IconCoins aria-hidden="true" />
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={shown}
          onChange={(e) => onChange(digitsOf(e.target.value))}
          placeholder={band ? som(rec) : t("pricePh")}
          aria-describedby={band ? `${hintId} ${limId}` : hintId}
          aria-invalid={off || error ? true : undefined}
        />
        <span className="svprice2__cur">{t("som")}</span>
      </div>

      {band ? (
        <div className="svband" aria-hidden="true">
          <div className="svband__track">
            <span className="svband__range" style={{ left: pos(band.min), right: `calc(100% - ${pos(band.max)})` }} />
            {rec > band.min && rec < band.max ? <span className="svband__rec" style={{ left: pos(rec) }} /> : null}
            {n > 0 ? <span className={`svband__dot${off ? " is-off" : ""}`} style={{ left: pos(n) }} /> : null}
          </div>
          <div className="svband__lbl">
            <span style={{ left: pos(band.min) }}>{som(band.min)}</span>
            <span style={{ left: pos(band.max) }}>{som(band.max)}</span>
          </div>
        </div>
      ) : null}

      <div className="svprice2__chips">
        {band ? (
          <>
            <button type="button" className={`svchip${n === rec ? " is-on" : ""}`} onClick={() => onChange(String(rec))}>
              {t("useRecommended", { price: som(rec) })}
            </button>
            <button type="button" className={`svchip${n === band.min ? " is-on" : ""}`} onClick={() => onChange(String(band.min))}>
              {t("useMin", { price: som(band.min) })}
            </button>
          </>
        ) : null}
        {value ? (
          <button type="button" className="svchip svchip--ghost" onClick={() => onChange("")}>
            {t("useCatalog")}
          </button>
        ) : null}
      </div>

      <p id={hintId} className={`svprice2__hint${off || error ? " is-bad" : ""}`} role={off || error ? "alert" : undefined}>
        {error
          ? error
          : off && band
            ? t("priceOut", { min: som(band.min), max: som(band.max) })
            : bandState === "loading"
              ? t("bandLoading")
              : bandState === "failed"
                ? t("bandUnknown")
                : band
                  ? tl("bandHint")
                  : basePrice
                    ? t("priceHintBase", { price: som(basePrice) })
                    : t("priceHint")}
      </p>

      {band ? (
        <div id={limId} className={`svlim${off || error ? " is-bad" : ""}`}>
          <p className="svlim__h">
            <IconSliders aria-hidden="true" />
            {tl("title")}
          </p>
          {base > 0 ? (
            <div className="svlim__row">
              <span>{tl("base")}</span>
              <b>
                {som(base)} {t("som")}
              </b>
            </div>
          ) : null}
          <PriceModifiers modifiers={mods} variant="rows" />
          <div className="svlim__row svlim__row--rec">
            <span>{tl("recommended")}</span>
            <b>
              {som(rec)} {t("som")}
            </b>
          </div>
          <div className="svlim__row svlim__row--range">
            <span>{pct ? tl("rangeOf", pct) : tl("range")}</span>
            <b>{tl("rangeValue", { min: som(band.min), max: som(band.max) })}</b>
          </div>
        </div>
      ) : null}
    </div>
  );
}
