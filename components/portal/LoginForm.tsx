"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { readReferral } from "@/lib/referral";
import { useAuth, hasAdminAccess, type Session } from "@/lib/auth";
import { ApiError, errDetail, isOffline, isOtpExpired, isRateLimited, retryAfterSec } from "@/lib/http";
import type { TwoFactorChallenge } from "@/lib/services/backend";
import { OTP_RESEND_SEC, useOtpTimer } from "@/lib/useOtpTimer";
import { Link, useRouter } from "@/i18n/navigation";
import { formatUzSubscriber, isValidUzPhone, uzSubscriber } from "@/lib/phone";
import { Notice } from "@/components/admin/AdminBits";
import { OtpCountdown, OtpResendButton } from "@/components/auth/OtpStatus";
import CodeSlots, { type CodeSlotsStatus } from "../CodeSlots";
import { IconCheck, IconLogo } from "../icons";
import PasswordInput from "../PasswordInput";

// Success exit: the form fades and lifts (.plogin__c--leave in globals.css)
// for this long before the router moves on.
const EXIT_MS = 420;
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
  const locale = useLocale();
  const { login, completeLogin2fa, session, ready, authNotice, clearAuthNotice } = useAuth();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  // Where a successful sign-in goes. Set instead of navigating at once so the
  // form can play its exit first; the effect below does the actual replace.
  const [exitTo, setExitTo] = useState<string | null>(null);
  // The one-time-code field's own "accepted" animation. Separate from exitTo
  // so the tick is on screen BEFORE the card starts fading out.
  const [codeOk, setCodeOk] = useState(false);
  const leave = (s: Session) => setExitTo(homeFor(s));
  // How long the accepted-code animation needs before the exit may start.
  const CODE_OK_MS = 620;
  useEffect(() => {
    if (!exitTo) return;
    const ms = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : EXIT_MS;
    const h = setTimeout(() => router.replace(exitTo), ms);
    return () => clearTimeout(h);
  }, [exitTo, router]);

  // Already signed in → the login page is off-limits until logout. Not while
  // a sign-in from this form is in flight: the session lands in the auth
  // context before `login` resolves, and the exit above owns that redirect.
  useEffect(() => {
    if (ready && session && !busy && !resending && !exitTo) router.replace(homeFor(session));
  }, [ready, session, busy, resending, exitTo, router]);
  // Referral code from the URL / storage stays on the sign-up link (T1A-08);
  // read after mount (storage is not available during SSR).
  const [refCode, setRefCode] = useState("");
  useEffect(() => { const h = setTimeout(() => setRefCode(readReferral()), 0); return () => clearTimeout(h); }, []);
  const withRef = (path: string) => (refCode ? `${path}?ref=${encodeURIComponent(refCode)}` : path);
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
  // Sign-in lock: the server answered 429 (OTP resend cooldown `retry_after`,
  // or the per-IP attempt limit via Retry-After) — count down from that value
  // and keep the button disabled, so the form stops hitting the server. A run
  // of wrong passwords also earns a short local pause (5 → 60 s).
  const [lockUntil, setLockUntil] = useState(0);
  const [lockLeft, setLockLeft] = useState(0);
  const [wrongRun, setWrongRun] = useState(0);
  useEffect(() => {
    if (!lockUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockLeft(left);
      if (left <= 0) { setLockUntil(0); setErr(null); }
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [lockUntil]);
  const lock = (sec: number) => { if (sec > 0) setLockUntil(Date.now() + sec * 1000); };
  // Set once the form has switched views (2FA and back): later views replay the
  // entrance quickly instead of the full first-visit sequence.
  const [swapped, setSwapped] = useState(false);

  // 2FA challenge (2FA enabled, or mandatory for the account's role).
  const [twoFa, setTwoFa] = useState<TwoFactorChallenge | null>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // Bumped for every code the server refused (wrong, expired, or one attempt
  // too many): <CodeSlots> drains the slots and hands back an empty code, so
  // the step starts over instead of leaving the rejected digits sitting there.
  // Not for a network failure — the code is still good, only the trip failed.
  const [badCode, setBadCode] = useState(0);
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
      fail((locale === "uz" && c.message) || t("twoFaStartError"));
      return false;
    }
    setSwapped(true);
    setTwoFa(c);
    setCode("");
    setBadCode(0);
    setErr(null);
    // TOTP has no sent code: no invented timer, no resend.
    if (c.method === "totp" && !c.expiresAt) otp.clear();
    else otp.issue(c.expiresAt);
    return true;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || lockUntil) return;
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
        setBadCode(0);
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
      setWrongRun(0);
      if ("twoFactor" in s) {
        applyChallenge(s.twoFactor);
        setBusy(false);
        return;
      }
      leave(s);
    } catch (e) {
      if (isRateLimited(e)) {
        // "Qayta yuborish uchun kuting" + retry_after, or the attempt limit.
        lock(retryAfterSec(e, 60));
        fail(errDetail(e) || tc("rateLimited"));
      } else if (channelDown(e)) {
        fail(tc("otpChannelUnavailable"));
      } else if (unreachable(e)) {
        fail(tc("offline"));
      } else if (serverFailed(e)) {
        fail(tv("serverError"));
      } else {
        // Wrong phone / password: from the 3rd miss in a row pause locally
        // (5, 10, 20, 40, 60 s) instead of letting the server's limit trip.
        const run = e instanceof ApiError && (e.status === 401 || e.status === 400 || e.status === 404) ? wrongRun + 1 : wrongRun;
        setWrongRun(run);
        if (run >= 3) lock(Math.min(60, 5 * 2 ** (run - 3)));
        fail(t("failed"));
      }
      setBusy(false);
    }
  }

  async function submit2fa(e: FormEvent) {
    e.preventDefault();
    if (busy || resending || !twoFa) return;
    if (otp.blockedIn > 0 || otp.expired || !/^\d{6}$/.test(code)) return;
    setErr(null);
    setNote(null);
    setBadCode(0);
    setBusy(true);
    try {
      const s = await completeLogin2fa(twoFa.verificationId, code, phone);
      // Show the code being accepted, then leave. Reduced motion skips the
      // pause — there is no animation to wait for.
      setCodeOk(true);
      if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) leave(s);
      else setTimeout(() => leave(s), CODE_OK_MS);
    } catch (e) {
      if (isRateLimited(e)) {
        // Too many wrong codes → locked; count down the server's wait.
        otp.block(retryAfterSec(e, OTP_RESEND_SEC));
        setBadCode((n) => n + 1);
        fail(errDetail(e) || tc("rateLimited"));
      } else if (isOtpExpired(e) && twoFa.method === "totp") {
        // The challenge itself is dead (410 / expiry-only wording) and there is
        // no code to resend: offer "Sign in again" instead of a retry.
        setCode("");
        setTotpExpired(true);
      } else if (isOtpExpired(e)) {
        otp.expire();
        setBadCode((n) => n + 1);
      } else if (unreachable(e)) {
        fail(tc("offline"));
      } else {
        setBadCode((n) => n + 1);
        fail(tOtp("incorrect"));
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
    setBadCode(0);
    try {
      const s = await login(phone.trim(), password);
      if ("twoFactor" in s) {
        if (applyChallenge(s.twoFactor)) setNote(tOtp("resent"));
      } else {
        // 2FA was switched off meanwhile: signed in outright.
        leave(s);
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

  // Success exit: the form lifts away and a slim status line takes its place
  // for however long the next route needs (fast on a warm cache, longer on a
  // cold one — never a blank pane).
  const leaving = exitTo ? " plogin__c--leave" : "";
  const exitNote = exitTo ? (
    <div className="plogin__exit" role="status">
      <span className="spin" aria-hidden />
      {t("success")}
    </div>
  ) : null;
  // Submit button face: a check once signed in, a spinner while the server works.
  const face = (label: string) =>
    exitTo ? (
      <>
        <IconCheck />
        {t("success")}
      </>
    ) : busy ? (
      <>
        <span className="spin" aria-hidden />
        {t("busy")}
      </>
    ) : (
      label
    );

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
      setBadCode(0);
      setErr(null);
      setNote(null);
      otp.clear();
    };
    // The slot row's own feedback: it drains a refused code away, and washes
    // over once the sign-in has actually gone through.
    const codeStatus: CodeSlotsStatus = codeOk ? "success" : badCode > 0 ? "error" : "idle";
    return (
      <div className="plogin">
        <form key="2fa" className={`plogin__c plogin__c--anim plogin__c--swap${leaving}`} onSubmit={submit2fa}>
          <span className="logo auth-formlogo" style={{ color: "var(--ink)", display: "inline-flex", gap: 9, alignItems: "center" }}>
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
                  <CodeSlots
                    id="l-2fa"
                    value={code}
                    onChange={(v) => {
                      setCode(v);
                      // Typing after a refusal takes the row (and the message
                      // under it) out of the error state; the drain's own
                      // hand-back of "" must not.
                      if (v) {
                        setBadCode(0);
                        setErr(null);
                        setNote(null);
                      }
                    }}
                    status={codeStatus}
                    statusKey={badCode}
                    disabled={busy || resending}
                    autoFocus
                  />
                </div>
                <OtpCountdown timer={otp} showExpiry={false} />
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
                  aria-busy={busy || undefined}
                >
                  {face(t("twoFaVerify"))}
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
        {exitNote}
      </div>
    );
  }

  return (
    <div className="plogin">
      <form
        key="cred"
        className={`plogin__c plogin__c--anim${swapped ? " plogin__c--swap" : ""}${leaving}`}
        onSubmit={submit}
      >
        <span
          className="logo auth-formlogo"
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
              {lockLeft > 0 ? <b className="plogin__wait">{t("waitLeft", { s: lockLeft })}</b> : null}
            </p>
          ) : null}
          <button className="btn btn--pri btn--full" type="submit" disabled={busy || lockLeft > 0} aria-busy={busy || undefined}>
            {face(lockLeft > 0 ? t("retryIn", { s: lockLeft }) : t("submit"))}
          </button>
        </div>
        <p className="plogin__alt">
          {t("noAccount")}{" "}
          <Link href={withRef("/register")} className="plogin__link">
            {t("createAccount")}
          </Link>
        </p>
        <p className="plogin__note">{t("note")}</p>
      </form>
      {exitNote}
    </div>
  );
}
