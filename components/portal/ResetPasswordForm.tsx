"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { forgotPassword, resetPassword, verifyPasswordResetCode, OTP_TTL_MS } from "@/lib/services/backend";
import { ApiError, errDetail, isOtpExpired, isRateLimited, isRouteMissing, retryAfterSec } from "@/lib/http";
import { OTP_RESEND_SEC, fmtClock, useOtpTimer } from "@/lib/useOtpTimer";
import { Link, useRouter } from "@/i18n/navigation";
import { formatUzSubscriber, uzSubscriber, normUzPhone } from "@/lib/phone";
import { OtpCountdown, OtpResendButton } from "@/components/auth/OtpStatus";
import { IconLogo, IconLogoText, IconCheck } from "../icons";
import PasswordInput from "../PasswordInput";

// BACKEND_FIXES_LIVE_2026-11-23: the code is checked first (POST
// /auth/password/verify, which does not use it up) and traded for a 10-minute
// reset token; only then is the new password asked for. A wrong code is
// therefore known before anyone types a password.
type Stage = "phone" | "code" | "password" | "done";
// What proves the code: the reset token, or — on a backend without the
// verify step — the code itself, sent with the password as before.
type Proof = { token: string; expiresAt: number } | { code: string };

export default function ResetPasswordForm() {
  const t = useTranslations("portal.login");
  const tc = useTranslations("common");
  const tOtp = useTranslations("register.otp");
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("phone");
  const [phone, setPhone] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [proof, setProof] = useState<Proof | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const otp = useOtpTimer();

  // Ask for a code. Known and unknown numbers are handled identically (the
  // backend answers both the same way): never reveal whether an account exists.
  async function requestCode(): Promise<boolean> {
    try {
      const r = await forgotPassword(normUzPhone(phone));
      setVerificationId(r.verificationId);
      otp.issue(r.expiresAt);
    } catch (e) {
      if (isRateLimited(e)) {
        otp.cooldown(retryAfterSec(e, OTP_RESEND_SEC));
        setErr(errDetail(e) || tc("rateLimited"));
        return false;
      }
      if (!(e instanceof ApiError && e.status === 404)) {
        setErr(t("resetError"));
        return false;
      }
      // Legacy "unknown phone" 404 → look exactly like success.
      setVerificationId("");
      otp.issue(Date.now() + OTP_TTL_MS);
    }
    setCode("");
    return true;
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (busy || otp.resendIn > 0) return;
    if (!phone.trim()) {
      setErr(t("resetPhoneRequired"));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      if (await requestCode()) setStage("code");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (busy || resending || otp.resendIn > 0) return;
    setResending(true);
    setErr(null);
    setNote(null);
    try {
      if (await requestCode()) setNote(tOtp("resent"));
    } finally {
      setResending(false);
    }
  }

  // The same answers for a refused code, whichever step sent it.
  function codeRefused(e: unknown) {
    if (isRateLimited(e)) {
      otp.block(retryAfterSec(e, OTP_RESEND_SEC));
      setErr(errDetail(e) || tc("rateLimited"));
    } else if (isOtpExpired(e)) {
      otp.expire();
    } else if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
      setErr(tOtp("incorrect"));
    } else {
      setErr(t("resetError"));
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (busy || resending || otp.blockedIn > 0 || otp.expired || code.length !== 6) return;
    setErr(null);
    setNote(null);
    setBusy(true);
    try {
      // Sent even with an empty verification id (unknown phone) so both cases
      // take the same path and end in the same neutral error.
      const r = await verifyPasswordResetCode(verificationId, code);
      if (!r.valid || !r.resetToken) {
        setErr(tOtp("incorrect"));
        return;
      }
      const until = Date.parse(r.expiresAt);
      setProof({ token: r.resetToken, expiresAt: Number.isNaN(until) ? Date.now() + 10 * 60_000 : until });
      setPassword("");
      setStage("password");
    } catch (e) {
      if (isRouteMissing(e)) {
        // No verify step on this backend: the code goes with the password.
        setProof({ code });
        setPassword("");
        setStage("password");
        return;
      }
      codeRefused(e);
    } finally {
      setBusy(false);
    }
  }

  // Back to the code, with a reason, when the proof is no longer good.
  function backToCode(message: string) {
    setProof(null);
    setCode("");
    setPassword("");
    setErr(message);
    setStage("code");
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (busy || !proof) return;
    if (password.length < 8) {
      setErr(t("resetWeak"));
      return;
    }
    if ("token" in proof && Date.now() >= proof.expiresAt) {
      backToCode(t("resetTokenExpired"));
      return;
    }
    setErr(null);
    setNote(null);
    setBusy(true);
    try {
      await resetPassword(verificationId, "token" in proof ? { resetToken: proof.token } : { code: proof.code }, password);
      setStage("done");
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && !isOtpExpired(e) && !isRateLimited(e) && /password/i.test(JSON.stringify(e.data.detail ?? ""))) {
        // The password itself was refused (too weak for the server's rules).
        setErr(errDetail(e) || t("resetWeak"));
      } else if ("token" in proof && e instanceof ApiError && e.status >= 400 && e.status < 500 && !isRateLimited(e)) {
        // The token ran out or was already used: a fresh code is needed.
        backToCode(t("resetTokenExpired"));
      } else if (!("token" in proof) && e instanceof ApiError && e.status >= 400 && e.status < 500 && !isRateLimited(e)) {
        backToCode(isOtpExpired(e) ? t("resetTokenExpired") : tOtp("incorrect"));
      } else if (isRateLimited(e)) {
        setErr(errDetail(e) || tc("rateLimited"));
      } else {
        setErr(t("resetError"));
      }
    } finally {
      setBusy(false);
    }
  }

  const logo = (
    <span className="logo auth-formlogo" style={{ color: "var(--ink)", display: "inline-flex", gap: 9, alignItems: "center" }}>
      <span className="logo__m"><IconLogo /></span>
      <IconLogoText />
    </span>
  );

  if (stage === "done") {
    return (
      <div className="plogin">
        <div className="plogin__c" style={{ textAlign: "center" }}>
          <span className="rf__ico rf__ico--brand" style={{ margin: "0 auto" }}><IconCheck /></span>
          <h1 style={{ marginTop: 14 }}>{t("resetDone")}</h1>
          <p className="sub">{t("resetDoneText")}</p>
          <button className="btn btn--pri btn--full" type="button" style={{ marginTop: 18 }} onClick={() => router.replace("/login")}>
            {t("resetBackToLogin")}
          </button>
        </div>
      </div>
    );
  }

  if (stage === "password") {
    return (
      <div className="plogin">
        <form className="plogin__c" onSubmit={submitReset}>
          {logo}
          <h1 style={{ marginTop: 18 }}>{t("resetCodeTitle")}</h1>
          <p className="sub">{t("resetPasswordSubtitle")}</p>
          <div className="cform" style={{ maxWidth: "none", marginTop: 20 }}>
            <div>
              <label htmlFor="r-pw">{t("resetNewPassword")}</label>
              <PasswordInput
                id="r-pw"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("resetNewPasswordPh")}
                autoComplete="new-password"
              />
              <p className="rf__hint">{t("resetPasswordHint")}</p>
            </div>
            {err ? <p style={{ color: "var(--dk-txt-err, #C0392B)", fontSize: ".85rem", margin: 0 }}>{err}</p> : null}
            <button className="btn btn--pri btn--full" type="submit" disabled={busy || !password}>
              {busy ? t("resetSaving") : t("resetSubmit")}
            </button>
          </div>
          <p className="plogin__alt">
            <Link href="/login" className="plogin__link">{t("resetBackToLogin")}</Link>
          </p>
        </form>
      </div>
    );
  }

  if (stage === "code") {
    return (
      <div className="plogin">
        <form className="plogin__c" onSubmit={submitCode}>
          {logo}
          <h1 style={{ marginTop: 18 }}>{t("resetVerifyTitle")}</h1>
          <p className="sub">{t("resetVerifySubtitle", { phone: phone })}</p>
          <div className="cform" style={{ maxWidth: "none", marginTop: 20 }}>
            <div>
              <label htmlFor="r-code">{t("resetCode")}</label>
              <input
                id="r-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={t("resetCodePh")}
                autoFocus
              />
            </div>
            <OtpCountdown timer={otp} />
            {err ? <p style={{ color: "var(--dk-txt-err, #C0392B)", fontSize: ".85rem", margin: 0 }}>{err}</p> : null}
            {note ? <p className="rf__otpmsg rf__otpmsg--ok">{note}</p> : null}
            <button
              className="btn btn--pri btn--full"
              type="submit"
              disabled={busy || resending || code.length !== 6 || otp.expired || otp.blockedIn > 0}
            >
              {busy ? t("resetVerifying") : t("resetVerify")}
            </button>
            <div className="rf__otpactions" style={{ justifyContent: "center" }}>
              <OtpResendButton timer={otp} busy={resending} onResend={resendCode} />
            </div>
          </div>
          <p className="plogin__alt">
            <Link href="/login" className="plogin__link">{t("resetBackToLogin")}</Link>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="plogin">
      <form className="plogin__c" onSubmit={sendCode}>
        {logo}
        <h1 style={{ marginTop: 18 }}>{t("resetTitle")}</h1>
        <p className="sub">{t("resetSubtitle")}</p>
        <div className="cform" style={{ maxWidth: "none", marginTop: 20 }}>
          <div>
            <label htmlFor="r-phone">{t("resetPhone")}</label>
            <div className="phonf">
              <span className="phonf__cc">+998</span>
              <input
                id="r-phone"
                type="tel"
                inputMode="tel"
                value={formatUzSubscriber(phone)}
                onChange={(e) => {
                  const d = uzSubscriber(e.target.value);
                  setPhone(d ? "+998" + d : "");
                  // The resend cooldown is per phone number.
                  if (otp.resendIn) otp.clear();
                }}
                placeholder="90 123 45 67"
                autoComplete="tel"
                autoFocus
              />
            </div>
          </div>
          {err ? <p style={{ color: "var(--dk-txt-err, #C0392B)", fontSize: ".85rem", margin: 0 }}>{err}</p> : null}
          <button className="btn btn--pri btn--full" type="submit" disabled={busy || otp.resendIn > 0}>
            {busy ? t("resetSending") : otp.resendIn > 0 ? tOtp("resendIn", { time: fmtClock(otp.resendIn) }) : t("resetSendCode")}
          </button>
        </div>
        <p className="plogin__alt">
          <Link href="/login" className="plogin__link">{t("resetBackToLogin")}</Link>
        </p>
      </form>
    </div>
  );
}
