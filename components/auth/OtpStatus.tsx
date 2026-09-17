"use client";

import { useTranslations } from "next-intl";
import { fmtClock, type OtpTimer } from "@/lib/useOtpTimer";

// Shared OTP step status for registration, password reset, login 2FA and 2FA
// enable: lock countdown, expired prompt or "code expires in m:ss".
// showExpiry=false hides the running "code expires in m:ss" line (lock and
// expired messages still show).
export function OtpCountdown({ timer, showExpiry = true }: { timer: OtpTimer; showExpiry?: boolean }) {
  const t = useTranslations("register.otp");
  // No live-region role on the ticking lines, so screen readers aren't
  // interrupted every second; the expired state is announced once.
  if (timer.blockedIn > 0) {
    return <p className="rf__otpmsg rf__otpmsg--err">{t("blockedFor", { time: fmtClock(timer.blockedIn) })}</p>;
  }
  if (timer.expired) {
    return (
      <p className="rf__otpmsg rf__otpmsg--err" role="alert">
        {t("expired")}
      </p>
    );
  }
  if (showExpiry && timer.expiresIn > 0) {
    return <p className="rf__otpmsg rf__otpmsg--muted">{t("expiresIn", { time: fmtClock(timer.expiresIn) })}</p>;
  }
  return null;
}

// "Resend code" link, disabled with a countdown during the 60s cooldown.
export function OtpResendButton({ timer, busy, onResend }: { timer: OtpTimer; busy: boolean; onResend: () => void }) {
  const t = useTranslations("register.otp");
  return (
    <button type="button" className="rf__link" disabled={busy || timer.resendIn > 0} onClick={onResend}>
      {busy ? t("resending") : timer.resendIn > 0 ? t("resendIn", { time: fmtClock(timer.resendIn) }) : t("resend")}
    </button>
  );
}
