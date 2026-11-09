"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatUzSubscriber, uzSubscriber, isValidUzPhone } from "@/lib/phone";
import { DEFAULT_OTP_DELIVERY, OTP_DELIVERY_METHODS, type OtpDeliveryMethod } from "@/lib/otpDelivery";
import OtpMethodPicker from "@/components/auth/OtpMethodPicker";
import { IconPhone, IconArrowRight } from "../icons";

export default function PhoneStep({
  phone,
  onChange,
  method,
  onMethod,
  onSent,
}: {
  phone: string;
  onChange: (v: string) => void;
  /** Where the sign-up code (and every later one) will be delivered. */
  method: OtpDeliveryMethod;
  onMethod: (m: OtpDeliveryMethod) => void;
  onSent: () => void;
}) {
  const t = useTranslations("register.phone");
  const tm = useTranslations("otpDelivery");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (!isValidUzPhone(phone)) {
      setErr(t("invalid"));
      return;
    }
    setErr(null);
    onSent();
  }

  return (
    <div className="rf__step">
      <span className="rf__ico rf__ico--brand">
        <IconPhone />
      </span>
      <h1 className="rf__title">{t("title")}</h1>
      <p className="rf__sub">{t("subtitle")}</p>

      <div className="cform" style={{ maxWidth: "none", marginTop: 22 }}>
        <div>
          <label htmlFor="rf-phone">{t("label")}</label>
          <div className="phonf">
            <span className="phonf__cc">+998</span>
            <input
              id="rf-phone"
              type="tel"
              inputMode="tel"
              value={formatUzSubscriber(phone)}
              onChange={(e) => {
                const d = uzSubscriber(e.target.value);
                onChange(d ? "+998" + d : "");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="90 123 45 67"
              autoComplete="tel"
            />
          </div>
        </div>
        {err ? <p className="rf__err">{err}</p> : null}
        <OtpMethodPicker
          name="rf-otp-method"
          legend={tm("pickerLabel")}
          hint={tm("pickerHint")}
          methods={OTP_DELIVERY_METHODS}
          value={method}
          onChange={onMethod}
          defaultMethod={DEFAULT_OTP_DELIVERY}
          compact
        />
        <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit}>
          {t("continue")}
          <IconArrowRight />
        </button>
      </div>

      <p className="rf__terms">{t("terms")}</p>
      <p className="rf__alt">
        {t("haveAccount")}{" "}
        <Link href="/login" className="rf__link">
          {t("login")}
        </Link>
      </p>
    </div>
  );
}
