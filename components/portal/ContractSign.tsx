"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getContract, startContractSignature, verifyContractSignature } from "@/lib/services/backend";
import { ApiError, errDetail, isForbidden, isOffline, isOtpExpired, isProviderUnavailable, isRateLimited, retryAfterSec } from "@/lib/http";
import { OTP_RESEND_SEC, useOtpTimer } from "@/lib/useOtpTimer";
import { OtpCountdown, OtpResendButton } from "@/components/auth/OtpStatus";
import { Notice } from "@/components/admin/AdminBits";
import { IconCheck, IconChevronLeft, IconExternal, IconShieldCheck } from "@/components/icons";

// 3 wrong codes lock the signature for 15 minutes (backend rule).
const LOCK_SEC = 15 * 60;

type Signed = { at: string; verifyUrl: string };

function fmtDateTime(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("ru-RU");
}

// T1-13 contract signing: POST /contracts/{id}/signature/start sends a 6-digit
// code through the Telegram bot; /signature/verify signs and returns a public
// verification link. Shows the signed state when the contract already is.
export default function ContractSign({ contractId }: { contractId: string }) {
  const t = useTranslations("portal.client.documents.sign");
  const tOtp = useTranslations("register.otp");
  const tc = useTranslations("common");
  const otp = useOtpTimer();
  const [stage, setStage] = useState<"idle" | "code">("idle");
  const [vid, setVid] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [signed, setSigned] = useState<{ id: string; value: Signed | null } | null>(null);
  const current = signed?.id === contractId ? signed.value : null;

  // Already signed earlier (GET /contracts/{id}).
  useEffect(() => {
    let alive = true;
    getContract(contractId)
      .then((c) => {
        if (alive && c.signed) setSigned({ id: contractId, value: { at: c.signedAt || "", verifyUrl: c.verifyUrl || "" } });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [contractId]);

  const startError = (e: unknown) =>
    isRateLimited(e)
      ? errDetail(e) || tc("rateLimited")
      : isProviderUnavailable(e)
        ? tc("otpChannelUnavailable")
        : isForbidden(e)
          ? t("forbidden")
          : isOffline(e)
            ? tc("offline")
            : t("startError");

  async function start(resend = false) {
    if (busy || resending || otp.resendIn > 0) return;
    if (resend) setResending(true);
    else setBusy(true);
    setNote(null);
    try {
      const c = await startContractSignature(contractId);
      if (!c.verificationId) {
        setNote({ ok: false, msg: t("startError") });
        return;
      }
      setVid(c.verificationId);
      setCode("");
      otp.issue(c.expiresAt);
      setStage("code");
      if (resend) setNote({ ok: true, msg: tOtp("resent") });
    } catch (e) {
      if (isRateLimited(e)) otp.cooldown(retryAfterSec(e, OTP_RESEND_SEC));
      setNote({ ok: false, msg: startError(e) });
    } finally {
      setBusy(false);
      setResending(false);
    }
  }

  async function verify() {
    if (busy || resending || code.length !== 6 || otp.expired || otp.blockedIn > 0) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await verifyContractSignature(contractId, vid, code);
      setSigned({ id: contractId, value: { at: r.signedAt, verifyUrl: r.verifyUrl } });
      setStage("idle");
      otp.clear();
    } catch (e) {
      if (isRateLimited(e)) {
        otp.block(retryAfterSec(e, LOCK_SEC));
        setNote({ ok: false, msg: errDetail(e) || tc("rateLimited") });
      } else if (isOtpExpired(e)) {
        otp.expire();
      } else if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setNote({ ok: false, msg: isForbidden(e) ? t("forbidden") : tOtp("incorrect") });
      } else {
        setNote({ ok: false, msg: isOffline(e) ? tc("offline") : t("verifyError") });
      }
    } finally {
      setBusy(false);
    }
  }

  if (current) {
    return (
      <div className="csign csign--ok">
        <span className="csign__i"><IconShieldCheck /></span>
        <div className="csign__t">
          <b>{t("signed")}</b>
          {current.at ? <span>{t("signedAt", { time: fmtDateTime(current.at) })}</span> : null}
        </div>
        {current.verifyUrl ? (
          <a className="btn btn--line btn--sm" href={current.verifyUrl} target="_blank" rel="noopener noreferrer">
            <IconExternal />
            {t("verifyLink")}
          </a>
        ) : null}
      </div>
    );
  }

  if (stage === "code") {
    return (
      <div className="csign">
        <div className="cform" style={{ maxWidth: "none", width: "100%" }}>
          <b>{t("codeTitle")}</b>
          <p className="advmuted" style={{ margin: 0 }}>{t("codeHint")}</p>
          <div>
            <label>{t("codeLabel")}</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              autoFocus
            />
          </div>
          <OtpCountdown timer={otp} />
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn--line btn--sm" type="button" onClick={() => { setStage("idle"); setNote(null); otp.clear(); }}>
              <IconChevronLeft />
              {t("back")}
            </button>
            <button
              className="btn btn--grad btn--sm"
              type="button"
              onClick={verify}
              disabled={busy || resending || code.length !== 6 || otp.expired || otp.blockedIn > 0}
            >
              <IconCheck />
              {busy ? t("verifying") : t("confirm")}
            </button>
            <OtpResendButton timer={otp} busy={resending} onResend={() => start(true)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="csign">
      <div className="csign__t">
        <b>{t("title")}</b>
        <span>{t("lead")}</span>
      </div>
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      <button className="btn btn--pri btn--sm" type="button" onClick={() => start(false)} disabled={busy || otp.resendIn > 0}>
        <IconShieldCheck />
        {busy ? t("sending") : t("start")}
      </button>
    </div>
  );
}
