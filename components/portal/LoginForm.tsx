"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useAuth, hasAdminAccess, type Session } from "@/lib/auth";
import { ApiError, errDetail, isOffline, isOtpExpired, isRateLimited, retryAfterSec } from "@/lib/http";
import type { TwoFactorChallenge } from "@/lib/services/backend";
import { OTP_RESEND_SEC, useOtpTimer } from "@/lib/useOtpTimer";
import { Link, useRouter } from "@/i18n/navigation";
import { formatUzSubscriber, isValidUzPhone, uzSubscriber } from "@/lib/phone";
import { Notice } from "@/components/admin/AdminBits";
import { OtpCountdown, OtpResendButton } from "@/components/auth/OtpStatus";
import { IconLogo } from "../icons";
import PasswordInput from "../PasswordInput";

// Backend unreachable (network / proxy 502) or a server-side failure.
const unreachable = (e: unknown) => isOffline(e) || (e instanceof ApiError && (e.status === 502 || e.status === 503 || e.status === 504));
// Any other 5xx: the backend answered but failed (e.g. the code could not be issued).
const serverFailed = (e: unknown) => e instanceof ApiError && e.status >= 500 && !unreachable(e);
// 503 from login/resend = the Telegram (or SMS) code channel is not connected.
const channelDown = (e: unknown) => e instanceof ApiError && e.status === 503;
// Staff (admin, sales, call-center…) land in the admin panel, everyone else in their portal.
const homeFor = (s: Session) => (hasAdminAccess(s) ? "/admin" : `/portal/${s.role}`);

export default function LoginForm() {
  const t = useTranslations("portal.login");
  const tc = useTranslations("common");
  const tOtp = useTranslations("register.otp");
  const tv = useTranslations("register.verify");
  const tr = useTranslations("register");
  const { login, completeLogin2fa, session, ready, authNotice, clearAuthNotice } = useAuth();
  const router = useRouter();

  // Already signed in → the login page is off-limits until logout.
  useEffect(() => {
    if (ready && session) router.replace(homeFor(session));
  }, [ready, session, router]);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  // Bumped with every error so the message node remounts and nudges again,
  // even when a second failed attempt repeats the same text.
  const [errN, setErrN] = useState(0);
  const fail = (msg: string) => {
    setErr(msg);
    setErrN((n) => n + 1);
  };
  const [busy, setBusy] = useState(false);
  // Set once the form has switched views (2FA and back): later views replay the
  // entrance quickly instead of the full first-visit sequence.
  const [swapped, setSwapped] = useState(false);

  // 2FA challenge (2FA enabled, or mandatory for the account's role).
  const [twoFa, setTwoFa] = useState<TwoFactorChallenge | null>(null);
  const [code, setCode] = useState("");
  const [resending, setResending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const otp = useOtpTimer();
  // The server said an authenticator (TOTP) challenge expired. Its app codes
  // can never succeed again, so the only way on is a new sign-in.
  const [totpExpired, setTotpExpired] = useState(false);
  // SMS challenge left via Back while still valid, with its resend/lock
  // deadlines (epoch ms). Signing in again with the same phone reopens it: a
  // new login would hit the 60s resend cooldown or supersede the code the
  // user already has.
  const [parked, setParked] = useState<{
    c: TwoFactorChallenge;
    phone: string;
    resendAt: number;
    blockedUntil: number;
  } | null>(null);

  // Switch to the (newest) challenge. Without a verification id the code step
  // could never verify, so stay on the credentials form with the server's words.
  function applyChallenge(c: TwoFactorChallenge): boolean {
    setParked(null);
    setTotpExpired(false);
    if (!c.verificationId) {
      setTwoFa(null);
      otp.clear();
      fail(c.message || t("twoFaStartError"));
      return false;
    }
    setSwapped(true);
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
      fail(t("required"));
      return;
    }
    // A short number can never sign in; say so instead of asking the server.
    if (!isValidUzPhone(p)) {
      fail(tr("phone.invalid"));
      return;
    }
    clearAuthNotice();
    setErr(null);
    if (parked) {
      const now = Date.now();
      if (parked.phone === phone && parked.c.expiresAt > now) {
        // Same verification id, remaining expiry, cooldown and lock.
        setSwapped(true);
        setTwoFa(parked.c);
        setTotpExpired(false);
        setCode("");
        setNote(null);
        otp.issue(parked.c.expiresAt);
        otp.cooldown((parked.resendAt - now) / 1000);
        if (parked.blockedUntil > now) otp.block((parked.blockedUntil - now) / 1000);
        setParked(null);
        return;
      }
      setParked(null);
    }
    setBusy(true);
    try {
      const s = await login(p, password);
      if ("twoFactor" in s) {
        applyChallenge(s.twoFactor);
        setBusy(false);
        return;
      }
      router.replace(homeFor(s));
    } catch (e) {
      fail(
        isRateLimited(e)
          ? errDetail(e) || tc("rateLimited")
          : channelDown(e)
            ? tc("otpChannelUnavailable")
            : unreachable(e)
              ? tc("offline")
              : serverFailed(e)
                ? tv("serverError")
                : t("failed"),
      );
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
      router.replace(homeFor(s));
    } catch (e) {
      if (isRateLimited(e)) {
        // Too many wrong codes → locked; count down the server's wait.
        otp.block(retryAfterSec(e, OTP_RESEND_SEC));
        fail(errDetail(e) || tc("rateLimited"));
      } else if (isOtpExpired(e) && twoFa.method === "totp") {
        // The challenge itself is dead (410 / expiry-only wording) and there is
        // no code to resend: offer "Sign in again" instead of a retry.
        setCode("");
        setTotpExpired(true);
      } else if (isOtpExpired(e)) {
        otp.expire();
      } else {
        fail(unreachable(e) ? tc("offline") : tOtp("incorrect"));
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
        router.replace(homeFor(s));
      }
    } catch (e) {
      if (isRateLimited(e)) {
        otp.cooldown(retryAfterSec(e, OTP_RESEND_SEC));
        fail(errDetail(e) || tc("rateLimited"));
      } else {
        fail(channelDown(e) ? tc("otpChannelUnavailable") : unreachable(e) ? tc("offline") : tOtp("resendError"));
      }
    } finally {
      setResending(false);
    }
  }

  if (twoFa) {
    const subtitle =
      twoFa.method === "totp"
        ? t("twoFaTotpSubtitle")
        : twoFa.method === "telegram"
          ? t("twoFaTelegramSubtitle")
          : twoFa.method === "sms"
            ? t("twoFaSubtitle", { phone: twoFa.phone || phone })
            : twoFa.message || t("twoFaSubtitle", { phone: twoFa.phone || phone });
    // An authenticator challenge the server expired, or whose own countdown
    // ran out: no code can pass any more.
    const totpTimedOut = twoFa.method === "totp" && (totpExpired || otp.expired);
    // Back to the credentials form with phone and password kept, so one press
    // of Continue starts a new challenge. `park` keeps a still-valid SMS
    // challenge to reopen — never one the server already expired/superseded.
    const leave2fa = (park: boolean) => {
      const now = Date.now();
      setParked(
        park && twoFa.method !== "totp" && !otp.expired && twoFa.expiresAt > now
          ? { c: twoFa, phone, resendAt: now + otp.resendIn * 1000, blockedUntil: now + otp.blockedIn * 1000 }
          : null,
      );
      setSwapped(true);
      setTwoFa(null);
      setTotpExpired(false);
      setCode("");
      setErr(null);
      setNote(null);
      otp.clear();
    };
    return (
      <div className="plogin">
        <form key="2fa" className="plogin__c plogin__c--anim plogin__c--swap" onSubmit={submit2fa}>
          <span className="logo" style={{ color: "var(--ink)", display: "inline-flex", gap: 9, alignItems: "center" }}>
            <span className="logo__m"><IconLogo /></span>
            LexGo
          </span>
          <h1 style={{ marginTop: 18 }}>{t("twoFaTitle")}</h1>
          <p className="sub">{subtitle}</p>
          <div className="cform" style={{ maxWidth: "none", marginTop: 20 }}>
            {totpTimedOut ? (
              <>
                <p className="rf__otpmsg rf__otpmsg--err" role="alert">
                  {t("twoFaTimedOut")}
                </p>
                <button className="btn btn--pri btn--full" type="button" onClick={() => leave2fa(false)} autoFocus>
                  {t("twoFaSignInAgain")}
                </button>
              </>
            ) : (
              <>
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
                {err ? (
                  <p key={errN} className="plogin__err" role="alert">
                    {err}
                  </p>
                ) : null}
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
                <button className="btn btn--ghost btn--full" type="button" onClick={() => leave2fa(true)}>
                  {t("twoFaBack")}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="plogin">
      <form
        key="cred"
        className={`plogin__c plogin__c--anim${swapped ? " plogin__c--swap" : ""}`}
        onSubmit={submit}
      >
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
                  const next = d ? "+998" + d : "";
                  if (next !== phone) setParked(null);
                  setPhone(next);
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
              onChange={(e) => {
                setParked(null);
                setPassword(e.target.value);
              }}
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
            <p key={errN} className="plogin__err" role="alert">
              {err}
            </p>
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
