"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { ApiError, errDetail, isOffline, isOtpExpired, isRateLimited, retryAfterSec } from "@/lib/http";
import type { TwoFactorChallenge } from "@/lib/services/backend";
import { OTP_RESEND_SEC, useOtpTimer } from "@/lib/useOtpTimer";
import { Link, useRouter } from "@/i18n/navigation";
import { formatUzSubscriber, uzSubscriber } from "@/lib/phone";
import { Notice } from "@/components/admin/AdminBits";
import { OtpCountdown, OtpResendButton } from "@/components/auth/OtpStatus";
import { IconLogo } from "../icons";
import PasswordInput from "../PasswordInput";

// Backend unreachable (network / proxy 502) or a server-side failure.
const unreachable = (e: unknown) => isOffline(e) || (e instanceof ApiError && e.status >= 500);

export default function LoginForm() {
  const t = useTranslations("portal.login");
  const tc = useTranslations("common");
  const tOtp = useTranslations("register.otp");
  const tr = useTranslations("register");
  const { login, completeLogin2fa, session, ready, authNotice, clearAuthNotice } = useAuth();
  const router = useRouter();

  // Already signed in → the login page is off-limits until logout.
  useEffect(() => {
    if (ready && session) router.replace(`/portal/${session.role}`);
  }, [ready, session, router]);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 2FA challenge (2FA enabled, or mandatory for the account's role).
  const [twoFa, setTwoFa] = useState<TwoFactorChallenge | null>(null);
  const [code, setCode] = useState("");
  const [resending, setResending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const otp = useOtpTimer();

  // Switch to the (newest) challenge. Without a verification id the code step
  // could never verify, so stay on the credentials form with the server's words.
  function applyChallenge(c: TwoFactorChallenge): boolean {
    if (!c.verificationId) {
      setTwoFa(null);
      otp.clear();
      setErr(c.message || t("twoFaStartError"));
      return false;
    }
    setTwoFa(c);
    setCode("");
    setErr(null);
    // TOTP has no sent code: no invented timer, no resend.
    if (c.method === "totp" && !c.expiresAt) otp.clear();
    else otp.issue(c.expiresAt);
    return true;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const p = phone.trim();
    if (!p || !password) {
      setErr(t("required"));
      return;
    }
    clearAuthNotice();
    setErr(null);
    setBusy(true);
    try {
      const s = await login(p, password);
      if ("twoFactor" in s) {
        applyChallenge(s.twoFactor);
        setBusy(false);
        return;
      }
      router.replace(`/portal/${s.role}`);
    } catch (e) {
      setErr(isRateLimited(e) ? errDetail(e) || tc("rateLimited") : unreachable(e) ? tc("offline") : t("failed"));
      setBusy(false);
    }
  }

  async function submit2fa(e: FormEvent) {
    e.preventDefault();
    if (busy || resending || !twoFa) return;
    if (otp.blockedIn > 0 || otp.expired || !/^\d{6}$/.test(code)) return;
    setErr(null);
    setNote(null);
    setBusy(true);
    try {
      const s = await completeLogin2fa(twoFa.verificationId, code, phone);
      router.replace(`/portal/${s.role}`);
    } catch (e) {
      if (isRateLimited(e)) {
        // Too many wrong codes → locked; count down the server's wait.
        otp.block(retryAfterSec(e, OTP_RESEND_SEC));
        setErr(errDetail(e) || tc("rateLimited"));
      } else if (isOtpExpired(e)) {
        otp.expire();
      } else {
        setErr(unreachable(e) ? tc("offline") : tOtp("incorrect"));
      }
      setBusy(false);
    }
  }

  // Resend = sign in again: the backend issues a new code (the old one is
  // superseded) and answers 429 during its 60s cooldown.
  async function resend2fa() {
    if (busy || resending || !twoFa || otp.resendIn > 0) return;
    setResending(true);
    setErr(null);
    setNote(null);
    try {
      const s = await login(phone.trim(), password);
      if ("twoFactor" in s) {
        if (applyChallenge(s.twoFactor)) setNote(tOtp("resent"));
      } else {
        router.replace(`/portal/${s.role}`);
      }
    } catch (e) {
      if (isRateLimited(e)) {
        otp.cooldown(retryAfterSec(e, OTP_RESEND_SEC));
        setErr(errDetail(e) || tc("rateLimited"));
      } else {
        setErr(unreachable(e) ? tc("offline") : tOtp("resendError"));
      }
    } finally {
      setResending(false);
    }
  }

  if (twoFa) {
    const subtitle =
      twoFa.method === "totp"
        ? t("twoFaTotpSubtitle")
        : twoFa.method === "sms"
          ? t("twoFaSubtitle", { phone: twoFa.phone || phone })
          : twoFa.message || t("twoFaSubtitle", { phone: twoFa.phone || phone });
    return (
      <div className="plogin">
        <form className="plogin__c" onSubmit={submit2fa}>
          <span className="logo" style={{ color: "var(--ink)", display: "inline-flex", gap: 9, alignItems: "center" }}>
            <span className="logo__m"><IconLogo /></span>
            LexGo
          </span>
          <h1 style={{ marginTop: 18 }}>{t("twoFaTitle")}</h1>
          <p className="sub">{subtitle}</p>
          <div className="cform" style={{ maxWidth: "none", marginTop: 20 }}>
            <div>
              <label htmlFor="l-2fa">{t("twoFaCode")}</label>
              <input
                id="l-2fa"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={t("twoFaCodePh")}
                autoFocus
              />
            </div>
            <OtpCountdown timer={otp} />
            {err ? <p style={{ color: "#C0392B", fontSize: ".85rem", margin: 0 }}>{err}</p> : null}
            {note ? <p className="rf__otpmsg rf__otpmsg--ok">{note}</p> : null}
            <button
              className="btn btn--pri btn--full"
              type="submit"
              disabled={busy || resending || code.length !== 6 || otp.expired || otp.blockedIn > 0}
            >
              {busy ? t("busy") : t("twoFaVerify")}
            </button>
            {twoFa.method !== "totp" ? (
              <div className="rf__otpactions" style={{ justifyContent: "center" }}>
                <OtpResendButton timer={otp} busy={resending} onResend={resend2fa} />
              </div>
            ) : null}
            <button
              className="btn btn--ghost btn--full"
              type="button"
              onClick={() => {
                setTwoFa(null);
                setCode("");
                setErr(null);
                setNote(null);
                otp.clear();
              }}
            >
              {t("twoFaBack")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="plogin">
      <form className="plogin__c" onSubmit={submit}>
        <span
          className="logo"
          style={{ color: "var(--ink)", display: "inline-flex", gap: 9, alignItems: "center" }}
        >
          <span className="logo__m">
            <IconLogo />
          </span>
          LexGo
        </span>
        <h1 style={{ marginTop: 18 }}>{t("title")}</h1>
        <p className="sub">{t("subtitle")}</p>

        <div className="cform" style={{ maxWidth: "none", marginTop: 20 }}>
          {authNotice === "sessionExpired" ? (
            <Notice ok={false} msg={t("sessionExpired")} />
          ) : authNotice === "loginRequired" ? (
            <Notice ok msg={tr("verify.loginRequired")} />
          ) : null}
          <div>
            <label htmlFor="l-phone">{t("phone")}</label>
            <div className="phonf">
              <span className="phonf__cc">+998</span>
              <input
                id="l-phone"
                type="tel"
                inputMode="tel"
                value={formatUzSubscriber(phone)}
                onChange={(e) => {
                  const d = uzSubscriber(e.target.value);
                  setPhone(d ? "+998" + d : "");
                }}
                placeholder="90 123 45 67"
                autoComplete="tel"
              />
            </div>
          </div>
          <div>
            <label htmlFor="l-pw">{t("password")}</label>
            <PasswordInput
              id="l-pw"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPh")}
              autoComplete="current-password"
            />
          </div>
          <div style={{ textAlign: "right", marginTop: -6 }}>
            <Link href="/reset-password" className="plogin__link">
              {t("forgot")}
            </Link>
          </div>
          {err ? (
            <p style={{ color: "#C0392B", fontSize: ".85rem", margin: 0 }}>{err}</p>
          ) : null}
          <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
            {busy ? t("busy") : t("submit")}
          </button>
        </div>
        <p className="plogin__alt">
          {t("noAccount")}{" "}
          <Link href="/register" className="plogin__link">
            {t("createAccount")}
          </Link>
        </p>
        <p className="plogin__note">{t("note")}</p>
      </form>
    </div>
  );
}
