"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth, requiresTwoFactor } from "@/lib/auth";
import { start2fa, verify2fa, disable2fa, setupTotp, enableTotp, type TotpSetup } from "@/lib/services/backend";
import { ApiError, errDetail, isOtpExpired, isRateLimited, retryAfterSec } from "@/lib/http";
import { OTP_RESEND_SEC, fmtClock, useOtpTimer } from "@/lib/useOtpTimer";
import { Notice } from "@/components/admin/AdminBits";
import { OtpCountdown, OtpResendButton } from "@/components/auth/OtpStatus";
import { IconShield, IconShieldCheck, IconChevronLeft } from "@/components/icons";

// Two-factor management: SMS OTP or an authenticator app (TOTP). Status comes
// from the session's two_factor_enabled/method (backend now returns it), with a
// local flag as an offline fallback. For staff/seller roles 2FA is mandatory:
// no Disable, and they may switch from SMS to the authenticator app.
export default function TwoFactorCard() {
  const t = useTranslations("portal.common.twofa");
  const tc = useTranslations("common");
  const tOtp = useTranslations("register.otp");
  const { session, update } = useAuth();
  const storeKey = `lexgo_2fa_${session?.id || "anon"}`;
  // Prefer the real backend flag; fall back to the local one offline.
  const on =
    session?.twoFactorEnabled !== undefined
      ? !!session.twoFactorEnabled
      : typeof window !== "undefined" && localStorage.getItem(storeKey) === "1";
  const mandatory = requiresTwoFactor(session);
  const [stage, setStage] = useState<"idle" | "sms" | "totp">("idle");
  const [vid, setVid] = useState("");
  const [totp, setTotp] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const otp = useOtpTimer();
  const rateMsg = (e: unknown) => errDetail(e) || tc("rateLimited");

  function reset() {
    setStage("idle");
    setCode("");
    setVid("");
    setTotp(null);
    setNote(null);
    otp.clear();
  }

  async function enableSms() {
    if (busy || otp.resendIn > 0) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await start2fa();
      if (!r.verificationId) {
        setNote({ ok: false, msg: t("errStart") });
        return;
      }
      setVid(r.verificationId);
      setCode("");
      otp.issue(r.expiresAt);
      setStage("sms");
    } catch (e) {
      if (isRateLimited(e)) otp.cooldown(retryAfterSec(e, OTP_RESEND_SEC));
      setNote({ ok: false, msg: isRateLimited(e) ? rateMsg(e) : t("errStart") });
    } finally {
      setBusy(false);
    }
  }
  // A new code supersedes the previous one → switch to the newest id.
  async function resendSms() {
    if (busy || resending || otp.resendIn > 0) return;
    setResending(true);
    setNote(null);
    try {
      const r = await start2fa();
      if (!r.verificationId) {
        setNote({ ok: false, msg: tOtp("resendError") });
        return;
      }
      setVid(r.verificationId);
      setCode("");
      otp.issue(r.expiresAt);
      setNote({ ok: true, msg: tOtp("resent") });
    } catch (e) {
      if (isRateLimited(e)) otp.cooldown(retryAfterSec(e, OTP_RESEND_SEC));
      setNote({ ok: false, msg: isRateLimited(e) ? rateMsg(e) : tOtp("resendError") });
    } finally {
      setResending(false);
    }
  }
  async function startTotp() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const s = await setupTotp();
      // Nothing to scan or type → the setup can't be completed.
      if (!s.setupId || (!s.qrCode && !s.secret && !s.otpauthUrl)) {
        setNote({ ok: false, msg: t("errStart") });
        return;
      }
      setTotp(s);
      setCode("");
      setStage("totp");
    } catch (e) {
      setNote({ ok: false, msg: isRateLimited(e) ? rateMsg(e) : t("errStart") });
    } finally {
      setBusy(false);
    }
  }
  async function finishEnable(method: "sms" | "totp") {
    localStorage.setItem(storeKey, "1");
    update({ twoFactorEnabled: true, twoFactorMethod: method });
    reset();
    setNote({ ok: true, msg: t("enabled") });
  }
  async function verifySms() {
    if (busy || resending || code.length !== 6 || otp.expired || otp.blockedIn > 0) return;
    setBusy(true);
    setNote(null);
    try {
      await verify2fa(vid, code);
      await finishEnable("sms");
    } catch (e) {
      if (isRateLimited(e)) {
        otp.block(retryAfterSec(e, OTP_RESEND_SEC));
        setNote({ ok: false, msg: rateMsg(e) });
      } else if (isOtpExpired(e)) {
        otp.expire();
      } else {
        setNote({ ok: false, msg: t("errVerify") });
      }
    } finally {
      setBusy(false);
    }
  }
  async function verifyTotp() {
    if (busy || !totp || code.length !== 6) return;
    setBusy(true);
    setNote(null);
    try {
      await enableTotp(totp.setupId, code);
      await finishEnable("totp");
    } catch (e) {
      setNote({ ok: false, msg: isRateLimited(e) ? rateMsg(e) : t("errVerify") });
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await disable2fa();
      localStorage.removeItem(storeKey);
      update({ twoFactorEnabled: false, twoFactorMethod: "" });
      reset();
      setNote({ ok: true, msg: t("disabledMsg") });
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 403 ? t("mandatory") : isRateLimited(e) ? rateMsg(e) : t("errStart");
      setNote({ ok: false, msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        {on ? <span className="tfa__on"><IconShieldCheck />{t("enabledBadge")}</span> : null}
      </div>
      <p className="advmuted" style={{ marginBottom: 12 }}>{t("desc")}</p>

      {stage === "sms" ? (
        <div className="cform" style={{ maxWidth: "none" }}>
          <div>
            <label>{t("codeLabel")}</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("codePh")}
              autoFocus
            />
          </div>
          <OtpCountdown timer={otp} />
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn--line btn--sm" type="button" onClick={reset}><IconChevronLeft />{t("back")}</button>
            <button
              className="btn btn--grad"
              type="button"
              onClick={verifySms}
              disabled={busy || resending || code.length !== 6 || otp.expired || otp.blockedIn > 0}
            >
              {busy ? t("verifying") : t("verify")}
            </button>
            <OtpResendButton timer={otp} busy={resending} onResend={resendSms} />
          </div>
        </div>
      ) : stage === "totp" && totp ? (
        <div className="cform" style={{ maxWidth: "none" }}>
          <b>{t("totpSetupTitle")}</b>
          <p className="advmuted" style={{ margin: 0 }}>{t("scanHint")}</p>
          {totp.qrCode ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={totp.qrCode} alt="2FA QR" className="tfa__qr" />
          ) : (
            <p className="advmuted" style={{ margin: 0 }}>{t("qrUnavailable")}</p>
          )}
          {totp.otpauthUrl ? (
            <a className="btn btn--line btn--sm" href={totp.otpauthUrl} style={{ justifySelf: "start" }}>
              {t("openInApp")}
            </a>
          ) : null}
          {totp.secret ? (
            <div>
              <label>{t("secretLabel")}</label>
              <input value={totp.secret} readOnly onFocus={(e) => e.currentTarget.select()} className="tfa__secret" />
            </div>
          ) : null}
          <div>
            <label>{t("totpCodeLabel")}</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("codePh")}
              autoFocus
            />
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn--line btn--sm" type="button" onClick={reset}><IconChevronLeft />{t("back")}</button>
            <button className="btn btn--grad" type="button" onClick={verifyTotp} disabled={busy || code.length !== 6}>
              {busy ? t("verifying") : t("verify")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          {on ? (
            <p className="advmuted" style={{ margin: "0 0 10px" }}>
              {t("currentMethod", { method: session?.twoFactorMethod === "totp" ? t("methodTotp") : t("methodSms") })}
            </p>
          ) : null}
          {mandatory ? <p className="advmuted" style={{ margin: "0 0 12px" }}>{t("mandatory")}</p> : null}
          {on ? (
            !mandatory ? (
              <button className="btn btn--line btn--sm" type="button" onClick={disable} disabled={busy}>
                {busy ? t("disabling") : t("disable")}
              </button>
            ) : session?.twoFactorMethod !== "totp" ? (
              <button className="btn btn--pri btn--sm" type="button" onClick={startTotp} disabled={busy}>
                <IconShield />
                {t("switchToTotp")}
              </button>
            ) : null
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn--pri btn--sm" type="button" onClick={startTotp} disabled={busy}>
                <IconShield />
                {t("chooseTotp")}
              </button>
              <button className="btn btn--line btn--sm" type="button" onClick={enableSms} disabled={busy || otp.resendIn > 0}>
                {busy
                  ? t("enableSending")
                  : otp.resendIn > 0
                    ? tOtp("resendIn", { time: fmtClock(otp.resendIn) })
                    : t("chooseSms")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
