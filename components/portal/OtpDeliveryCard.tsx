"use client";

import "@/components/auth/otpMethod.css";
import "./profile1920.css";
import { useCallback, useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheck, KeyRound } from "lucide-react";
import {
  getOtpDelivery,
  isMissingRoute,
  otpLanguageOf,
  startOtpDeliveryChange,
  verifyOtpDeliveryChange,
  type OtpDeliveryMethod,
  type OtpDeliverySettings,
} from "@/lib/services/backend";
import { ApiError, errDetail, isOffline, isOtpExpired, isRateLimited, retryAfterSec } from "@/lib/http";
import { OTP_RESEND_SEC, fmtClock, useOtpTimer } from "@/lib/useOtpTimer";
import { maskUzPhone } from "@/lib/phone";
import { notify } from "@/lib/toast";
import Modal from "@/components/admin/Modal";
import CodeSlots, { type CodeSlotsStatus } from "@/components/CodeSlots";
import FieldError from "@/components/ui/FieldError";
import InlineAlert from "@/components/ui/InlineAlert";
import { OtpCountdown, OtpResendButton } from "@/components/auth/OtpStatus";
import OtpMethodPicker, { useOtpMethodName } from "@/components/auth/OtpMethodPicker";

// "Tasdiqlash kodlari" — which channel the user's verification codes arrive
// through (LEXGO_FRONTEND_OTP_DELIVERY_CHANNELS_2026_11_09.md §3-4, §6-8).
//
// The selection never changes locally: picking a card only chooses what to
// confirm. "Send confirmation code" sends a code THROUGH the new channel, the
// dialog takes it, and only after /change/verify succeeds are the settings
// read again — that fresh read is what moves the "Joriy" badge. The code and
// its verification id live in this component's state only (never storage,
// never logs) and are dropped on success, cancel, expiry or unmount.

type Load = { status: "loading" } | { status: "error" } | { status: "missing" } | { status: "ready"; data: OtpDeliverySettings };
type Pending = { method: OtpDeliveryMethod; verificationId: string; phone: string; telegramLink: string };

export default function OtpDeliveryCard() {
  const t = useTranslations("otpDelivery");
  const ts = useTranslations("otpDelivery.settings");
  const tOtp = useTranslations("register.otp");
  const tc = useTranslations("common");
  const locale = useLocale();
  const nameOf = useOtpMethodName();
  const uid = useId();

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [pick, setPick] = useState<OtpDeliveryMethod | "">("");
  const [sending, setSending] = useState(false);
  const [cardErr, setCardErr] = useState("");

  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [codeErr, setCodeErr] = useState("");
  const [badN, setBadN] = useState(0);
  // The verification id is spent (404): only a new code can go on.
  const [dead, setDead] = useState(false);
  const [doneMethod, setDoneMethod] = useState<OtpDeliveryMethod | "">("");
  const otp = useOtpTimer();

  useEffect(() => {
    let alive = true;
    getOtpDelivery()
      .then((data) => {
        if (!alive) return;
        setLoad({ status: "ready", data });
        // The picked card follows the saved selection whenever it is re-read.
        setPick(data.selectedMethod);
      })
      .catch((e) => {
        if (!alive) return;
        // An older backend without the endpoint: no card rather than an error.
        setLoad({ status: isMissingRoute(e) ? "missing" : "error" });
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const settings = load.status === "ready" ? load.data : null;
  const available = settings ? settings.options.filter((o) => o.available).map((o) => o.method) : [];
  const selected = settings?.selectedMethod ?? "";
  const changing = !!pick && pick !== selected;

  // The message for a refused send, by status (§7). A provider that is down
  // is named, and the picker stays open so another channel can be chosen —
  // never a silent switch to a different one.
  const sendErrorText = useCallback(
    (e: unknown, method: OtpDeliveryMethod) => {
      if (isRateLimited(e)) return errDetail(e) || tc("rateLimited");
      if (e instanceof ApiError && e.status === 503) return t("unavailable", { method: nameOf(method) });
      if (e instanceof ApiError && e.status === 422) return ts("invalid");
      if (e instanceof ApiError && e.status === 401) return ts("sessionExpired");
      if (isOffline(e)) return tc("offline");
      return errDetail(e) || ts("error");
    },
    [t, ts, tc, nameOf],
  );

  function clearPending() {
    setPending(null);
    setCode("");
    setCodeErr("");
    setBadN(0);
    setDead(false);
    otp.clear();
  }

  // Step 1 — a code through the NEW channel.
  async function send(method: OtpDeliveryMethod, again: boolean) {
    if (sending || resending || busy) return;
    if (otp.resendIn > 0 && (again || pending)) return;
    if (again) setResending(true);
    else setSending(true);
    setCardErr("");
    setCodeErr("");
    try {
      const r = await startOtpDeliveryChange(method, otpLanguageOf(locale));
      if (!r.verificationId) {
        if (again) setCodeErr(tOtp("resendError"));
        else setCardErr(ts("error"));
        return;
      }
      // A new code supersedes the previous one: newest id, empty field.
      setPending({ method, verificationId: r.verificationId, phone: r.phone || settings?.phone || "", telegramLink: r.telegramBotLink });
      setCode("");
      setBadN(0);
      setDead(false);
      setDoneMethod("");
      otp.issue(r.expiresAt);
      if (r.resendInSec > 0) otp.cooldown(r.resendInSec);
      if (again) notify.success(tOtp("resent"), { id: "otp-delivery" });
    } catch (e) {
      if (isRateLimited(e)) otp.cooldown(retryAfterSec(e, OTP_RESEND_SEC));
      const msg = sendErrorText(e, method);
      if (again) setCodeErr(msg);
      else setCardErr(msg);
      // The new channel is down: close the dialog so another can be picked.
      if (again && e instanceof ApiError && e.status === 503) {
        clearPending();
        setCardErr(msg);
      }
    } finally {
      setSending(false);
      setResending(false);
    }
  }

  // Step 2 — confirm, then read the settings again.
  async function verify() {
    if (!pending || busy || resending || dead) return;
    if (otp.blockedIn > 0 || otp.expired || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setCodeErr("");
    try {
      await verifyOtpDeliveryChange(pending.verificationId, code);
      const method = pending.method;
      // Single-use: the id and the code are gone the moment it is accepted.
      setPending((p) => (p ? { ...p, verificationId: "" } : p));
      setCode("");
      otp.clear();
      setDoneMethod(method);
      setReloadKey((k) => k + 1);
    } catch (e) {
      if (isRateLimited(e)) {
        otp.block(retryAfterSec(e, OTP_RESEND_SEC));
        setCodeErr(errDetail(e) || tc("rateLimited"));
      } else if (e instanceof ApiError && e.status === 404) {
        setDead(true);
        setCode("");
        setCodeErr(ts("notFound"));
      } else if (isOtpExpired(e)) {
        otp.expire();
        setCode("");
      } else if (e instanceof ApiError && e.status === 401) {
        setCodeErr(ts("sessionExpired"));
      } else if (e instanceof ApiError && e.status === 503) {
        setCodeErr(t("unavailable", { method: nameOf(pending.method) }));
      } else if (isOffline(e)) {
        setCodeErr(tc("offline"));
      } else if (e instanceof ApiError && e.status === 400) {
        setBadN((n) => n + 1);
        setCodeErr(ts("incorrect"));
      } else {
        setCodeErr(errDetail(e) || ts("error"));
      }
    } finally {
      setBusy(false);
    }
  }

  function closeDialog() {
    if (busy) return;
    clearPending();
    setDoneMethod("");
  }

  if (load.status === "missing") return null;

  const codeStatus: CodeSlotsStatus = doneMethod ? "success" : badN > 0 && codeErr ? "error" : "idle";
  const needNew = dead || otp.expired;

  return (
    <div className="ppanel" data-ai-target="profile:otp-delivery" data-ai-id="profile.otp-delivery" data-ai-type="section">
      <div className="ppanel__h">
        <b className="ppanel__t">
          <span className="pico"><KeyRound /></span>
          {ts("title")}
        </b>
        {selected ? (
          <span className="otpd__cur">
            <CircleCheck aria-hidden="true" />
            {nameOf(selected)}
          </span>
        ) : null}
      </div>
      <p className="advmuted" style={{ marginBottom: 12 }}>{ts("desc")}</p>

      {load.status === "loading" ? (
        <div className="otpm__list" aria-busy="true" aria-label={ts("loading")}>
          <div className="otpd__skel" />
          <div className="otpd__skel" />
          <div className="otpd__skel" />
        </div>
      ) : load.status === "error" ? (
        <InlineAlert
          tone="error"
          compact
          action={{ label: ts("retry"), onClick: () => { setLoad({ status: "loading" }); setReloadKey((k) => k + 1); } }}
        >
          {ts("loadError")}
        </InlineAlert>
      ) : settings ? (
        <>
          <div className="otpd__phone">
            <span>
              <small>{ts("phone")}</small>
              <br />
              <b>{maskUzPhone(settings.phone) || "—"}</b>
            </span>
            <span>
              <small>{ts("current")}</small>
              <br />
              <b>{nameOf(settings.selectedMethod)}</b>
            </span>
          </div>
          {available.length ? (
            <OtpMethodPicker
              name={`${uid}-otp-method`}
              legend={ts("choose")}
              methods={available}
              value={pick}
              onChange={(m) => {
                setPick(m);
                setCardErr("");
              }}
              currentMethod={settings.selectedMethod}
              defaultMethod={settings.defaultMethod}
              disabled={sending}
            />
          ) : (
            <p className="otpd__note">{ts("noOther")}</p>
          )}
          {cardErr ? (
            <InlineAlert tone="error" compact role="alert" className="otpd__err">
              {cardErr}
            </InlineAlert>
          ) : null}
          <div className="otpd__act">
            <button
              type="button"
              className="btn btn--pri btn--sm"
              disabled={!changing || sending || otp.resendIn > 0}
              onClick={() => pick && void send(pick, false)}
              data-ai-id="profile.otp-delivery.send"
            >
              {sending ? ts("sending") : otp.resendIn > 0 && !pending ? tOtp("resendIn", { time: fmtClock(otp.resendIn) }) : ts("send")}
            </button>
            {!changing ? <p className="otpd__note">{ts("pickOther")}</p> : null}
          </div>
        </>
      ) : null}

      <Modal
        open={!!pending}
        onClose={closeDialog}
        title={doneMethod ? ts("successTitle") : ts("modalTitle")}
        size="sm"
        busy={busy}
        aiId="profile.otp-delivery.dialog"
        footer={
          doneMethod ? (
            <button type="button" className="btn btn--pri" onClick={closeDialog} autoFocus>
              {ts("done")}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn--line" onClick={closeDialog} disabled={busy}>
                {ts("cancel")}
              </button>
              {needNew ? (
                <button
                  type="button"
                  className="btn btn--pri"
                  onClick={() => pending && void send(pending.method, true)}
                  disabled={resending || otp.resendIn > 0}
                >
                  {resending ? tOtp("resending") : ts("newCode")}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--pri"
                  onClick={() => void verify()}
                  disabled={busy || resending || code.length !== 6 || otp.blockedIn > 0}
                  aria-busy={busy || undefined}
                >
                  {busy ? ts("confirming") : ts("confirm")}
                </button>
              )}
            </>
          )
        }
      >
        {pending && doneMethod ? (
          <div className="otpd__ok" role="status">
            <span className="otpd__ok-ic"><CircleCheck /></span>
            <b>{nameOf(doneMethod)}</b>
            <p>{ts("success", { method: nameOf(doneMethod) })}</p>
          </div>
        ) : pending ? (
          <form
            className="otpd__dlg"
            data-ai-private
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <p className="otpd__sent">{t(`sentTo.${pending.method}`, { phone: maskUzPhone(pending.phone) })}</p>
            {pending.method === "telegram_bot" && pending.telegramLink && !needNew ? (
              <a className="btn btn--line btn--full" href={pending.telegramLink} target="_blank" rel="noopener noreferrer">
                {t("openBot")}
              </a>
            ) : null}
            {!dead ? (
              <div>
                <label htmlFor={`${uid}-code`} className="otpd__lbl">{ts("codeLabel")}</label>
                <CodeSlots
                  id={`${uid}-code`}
                  // an expired code is gone from the field too
                  value={otp.expired ? "" : code}
                  onChange={(v) => {
                    setCode(v);
                    if (v && codeErr) {
                      setCodeErr("");
                      setBadN(0);
                    }
                  }}
                  status={codeStatus}
                  statusKey={badN}
                  disabled={busy || resending || otp.expired || otp.blockedIn > 0}
                  autoFocus
                  describedBy={codeErr ? `${uid}-err` : undefined}
                />
              </div>
            ) : null}
            <FieldError id={`${uid}-err`} msg={codeErr} />
            {!dead ? <OtpCountdown timer={otp} /> : null}
            {!needNew ? (
              <div className="otpd__row">
                <OtpResendButton timer={otp} busy={resending} onResend={() => void send(pending.method, true)} />
              </div>
            ) : null}
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
