"use client";

import { useTranslations } from "next-intl";
import type { PriceBand } from "@/lib/services/sellerServices";
import { IconCoins } from "@/components/icons";
import { som } from "./bits";

export const digitsOf = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12);

export function priceOutOfBand(price: number, band: PriceBand | null): boolean {
  return Boolean(band && price > 0 && (price < band.min || price > band.max));
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
  const n = Number(value || "0");
  const off = priceOutOfBand(n, band);
  const hintId = `${id}-hint`;
  const lo = band ? band.min * 0.86 : 0;
  const hi = band ? band.max * 1.1 : 1;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  const shown = value ? som(n) : "";

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
          placeholder={band ? som(band.recommended) : t("pricePh")}
          aria-describedby={hintId}
          aria-invalid={off || error ? true : undefined}
        />
        <span className="svprice2__cur">{t("som")}</span>
      </div>

      {band ? (
        <div className="svband" aria-hidden="true">
          <div className="svband__track">
            <span className="svband__range" style={{ left: pos(band.min), right: `calc(100% - ${pos(band.max)})` }} />
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
            <button type="button" className={`svchip${n === band.max ? " is-on" : ""}`} onClick={() => onChange(String(band.max))}>
              {t("useRecommended", { price: som(band.max) })}
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
                  ? t("bandHint", { min: som(band.min), max: som(band.max) })
                  : basePrice
                    ? t("priceHintBase", { price: som(basePrice) })
                    : t("priceHint")}
      </p>
    </div>
  );
}
