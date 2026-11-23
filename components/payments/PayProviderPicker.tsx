"use client";

import "@/components/marketplace/runtime/checkout.css";
import { useTranslations } from "next-intl";
import { IconCard, IconCheck } from "@/components/icons";
import { ClickMark } from "./ClickPay";

// Click or ATMOS — the only two ways to pay since the 2026-11-21 contract
// (§1.1). Shows only what GET /payments/providers has switched on, under the
// backend's own labels, in the purchase dialog's cards. One provider on: it
// is simply named; none (the list failed): nothing is drawn and the backend
// picks.
export type PickOption = { provider: string; label: string };

export default function PayProviderPicker({
  options,
  value,
  onChange,
  disabled,
  aiId,
}: {
  options: PickOption[];
  value: string;
  onChange: (provider: string) => void;
  disabled?: boolean;
  aiId: string;
}) {
  const t = useTranslations("marketplace.purchase");
  if (!options.length) return null;
  const name = (o: PickOption) => o.label || (t.has(`providers.${o.provider}.name`) ? t(`providers.${o.provider}.name`) : o.provider);
  return (
    <fieldset className="mk-pay mk-pay--pick" data-ai-id={aiId} data-ai-type="select" data-ai-label={t("providerTitle")}>
      <legend>{t("providerTitle")}</legend>
      <div className="mk-pay__opts">
        {options.map((o) => (
          <button
            key={o.provider}
            type="button"
            className="mk-pay__opt"
            data-p={o.provider}
            aria-pressed={value === o.provider}
            disabled={disabled}
            onClick={() => onChange(o.provider)}
            data-ai-id={`${aiId}.${o.provider}`}
          >
            <span className="mk-pay__ic" aria-hidden="true">
              {o.provider === "click" ? <ClickMark className="ckp-opt-mark" /> : <IconCard />}
            </span>
            <span className="mk-pay__m">
              <b>{name(o)}</b>
              <small>{t.has(`providers.${o.provider}.hint`) ? t(`providers.${o.provider}.hint`) : ""}</small>
            </span>
            <span className="mk-pay__tick" aria-hidden="true">
              <IconCheck />
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
