"use client";

import "./otpMethod.css";
import { useTranslations } from "next-intl";
import { Bot, MessageSquareText, Send, type LucideIcon } from "lucide-react";
import type { OtpDeliveryMethod } from "@/lib/otpDelivery";

// The three verification-code channels as radio cards
// (LEXGO_FRONTEND_OTP_DELIVERY_CHANNELS_2026_11_09.md §6): an icon, the
// channel's name, one line on how the code arrives, and badges for the
// backend's default and the user's current channel. Used at sign-up and in
// the profile's "Tasdiqlash kodlari" card.

const ICONS: Record<OtpDeliveryMethod, LucideIcon> = {
  telegram_bot: Bot,
  sms: MessageSquareText,
  telegram_gateway: Send,
};

/** The channel's name in the UI language. */
export function useOtpMethodName(): (m: OtpDeliveryMethod) => string {
  const t = useTranslations("otpDelivery.methods");
  return (m) => t(`${m}.title`);
}

export default function OtpMethodPicker({
  methods,
  value,
  onChange,
  name,
  legend,
  hint,
  defaultMethod,
  currentMethod,
  disabled,
  compact,
}: {
  methods: readonly OtpDeliveryMethod[];
  value: OtpDeliveryMethod | "";
  onChange: (m: OtpDeliveryMethod) => void;
  /** Radio group name — unique per page. */
  name: string;
  legend?: string;
  hint?: string;
  /** Marked "Standart" (the backend's default channel). */
  defaultMethod?: OtpDeliveryMethod;
  /** Marked "Joriy" (the channel the account uses now). */
  currentMethod?: OtpDeliveryMethod;
  disabled?: boolean;
  /** Tighter rows for the narrow sign-up card. */
  compact?: boolean;
}) {
  const t = useTranslations("otpDelivery");
  return (
    <fieldset className={`otpm${compact ? " otpm--compact" : ""}`} disabled={disabled}>
      {legend ? <legend className="otpm__lg">{legend}</legend> : null}
      <div className="otpm__list" role="radiogroup" aria-label={legend}>
        {methods.map((m) => {
          const Icon = ICONS[m];
          const on = value === m;
          return (
            <label key={m} className={`otpm__o${on ? " is-on" : ""}`}>
              <input
                type="radio"
                className="otpm__in"
                name={name}
                value={m}
                checked={on}
                onChange={() => onChange(m)}
              />
              <span className="otpm__ic" aria-hidden="true"><Icon /></span>
              <span className="otpm__tx">
                <span className="otpm__t">
                  <b>{t(`methods.${m}.title`)}</b>
                  {currentMethod === m ? <em className="otpm__badge otpm__badge--cur">{t("currentBadge")}</em> : null}
                  {defaultMethod === m ? <em className="otpm__badge">{t("defaultBadge")}</em> : null}
                </span>
                <small>{t(`methods.${m}.desc`)}</small>
              </span>
              <span className="otpm__dot" aria-hidden="true" />
            </label>
          );
        })}
      </div>
      {hint ? <p className="otpm__hint">{hint}</p> : null}
    </fieldset>
  );
}
