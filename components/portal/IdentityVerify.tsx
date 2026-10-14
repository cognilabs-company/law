"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getIdentity,
  identityStart,
  identityVerifyDemo,
  isIdentityPending,
  type IdentityProvider,
  type IdentityStatus,
} from "@/lib/services/backend";
import { errDetail, isDemoUnavailable, isProviderUnavailable, isRateLimited, retryAfterSec } from "@/lib/http";
import { fmtClock, useOtpTimer } from "@/lib/useOtpTimer";
import { useResourceOne } from "@/lib/useResource";
import { Skeleton } from "./DataState";
import { notify } from "@/lib/toast";
import FieldError from "@/components/ui/FieldError";
import { IconShieldCheck } from "@/components/icons";

const provName = (p: IdentityProvider | null) => (p === "myid" ? "MyID" : "OneID");
const NID = "identity-verify";

// OneID / MyID identity verification through the backend provider interface.
// Start either returns a provider URL (followed in the same tab) or, on a
// staging demo provider, a state for code entry. Codes are never read from the
// response. 503 = provider not connected.
export default function IdentityVerify() {
  const t = useTranslations("portal.client.identity");
  const tcommon = useTranslations("common");
  const uid = useId();
  const [key, setKey] = useState(0);
  const res = useResourceOne(getIdentity, [key]);
  const [id, setId] = useState<IdentityStatus | null>(null);
  const cur = id ?? res.data;
  const [prov, setProv] = useState<IdentityProvider | null>(null);
  const [flow, setFlow] = useState<{ state: string; provider: IdentityProvider } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeErr, setCodeErr] = useState("");
  const redirectedRef = useRef(false);
  // 429 → count down the server's wait; the provider buttons stay disabled.
  const wait = useOtpTimer();
  const waiting = wait.resendIn > 0;

  // Back from the provider page may restore this page from the bfcache with the
  // buttons still busy (they stay busy while the browser navigates away) and the
  // redirect message still up; the status is re-read in case it changed there.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted || !redirectedRef.current) return;
      redirectedRef.current = false;
      setBusy(false);
      setProv(null);
      notify.dismiss(NID);
      setId(null);
      setKey((k) => k + 1);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const errMsg = (e: unknown) =>
    isProviderUnavailable(e) || isDemoUnavailable(e)
      ? tcommon("identityUnavailable")
      : isRateLimited(e)
        ? errDetail(e) || tcommon("rateLimited")
        : t("error");
  const fail = (e: unknown) => {
    const plain = !(isProviderUnavailable(e) || isDemoUnavailable(e) || isRateLimited(e));
    notify.error(errMsg(e), { id: NID, error: plain ? e : undefined });
  };

  function refresh() {
    setId(null);
    setKey((k) => k + 1);
  }

  async function start(p: IdentityProvider) {
    if (busy) return;
    setBusy(true);
    setProv(p);
    let leaving = false;
    try {
      const r = await identityStart(p);
      if (r.mode === "redirect") {
        // The provider page returns to the app; /identity/me shows the result.
        leaving = true;
        redirectedRef.current = true;
        notify.info(t("redirecting", { provider: provName(p) }), { id: NID });
        window.location.assign(r.authUrl);
        return;
      }
      if (!r.state) {
        notify.error(t("error"), { id: NID });
        setProv(null);
        return;
      }
      notify.dismiss(NID);
      setFlow({ state: r.state, provider: p });
      setCode("");
      setCodeErr("");
    } catch (e) {
      if (isRateLimited(e)) wait.cooldown(retryAfterSec(e, 60));
      fail(e);
      setProv(null);
    } finally {
      if (!leaving) setBusy(false);
    }
  }
  async function verify() {
    if (!flow || busy || !code.trim()) return;
    setBusy(true);
    setCodeErr("");
    try {
      const r = await identityVerifyDemo(flow.provider, flow.state, code.trim());
      setId(r);
      if (r.verified) {
        setFlow(null);
        notify.success(t("done"), { id: NID });
      } else {
        setCodeErr(t("failed"));
      }
    } catch (e) {
      if (isRateLimited(e)) wait.cooldown(retryAfterSec(e, 60));
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const providers = (
    <div className="idv__providers">
      {waiting ? <p className="advmuted" role="status">{t("retryIn", { time: fmtClock(wait.resendIn) })}</p> : null}
      <button className="idv__prov idv__prov--main" type="button" disabled={busy || waiting} onClick={() => start("myid")} data-ai-id="profile.identity.myid">
        <b>MyID <em className="idv__tag">{t("primary")}</em></b>
        <span>{t("myidSub")}</span>
      </button>
      <button className="idv__prov" type="button" disabled={busy || waiting} onClick={() => start("oneid")} data-ai-id="profile.identity.oneid">
        <b>OneID</b>
        <span>{t("oneidSub")}</span>
      </button>
      <p className="idv__privacy advmuted">{t("noBiometrics")}</p>
    </div>
  );

  return (
    <div className="ppanel" data-ai-target="profile:identity" data-ai-id="profile.identity" data-ai-type="section">
      <div className="ppanel__h"><b className="ppanel__t"><span className="pico"><IconShieldCheck /></span>{t("title")}</b></div>
      <p className="ppanel__note">{t("lead")}</p>

      {res.status === "loading" && !id ? (
        <Skeleton rows={2} />
      ) : cur?.verified ? (
        <div className="idv__ok" data-ai-private>
          <span className="idv__oki"><IconShieldCheck /></span>
          <div>
            <b>{t("verified")}</b>
            {cur.fullName ? <span>{cur.fullName}{cur.pinfl ? ` · ${cur.pinfl}` : ""}</span> : null}
          </div>
        </div>
      ) : flow ? (
        <div className="idv__flow" data-ai-private>
          <p className="advmuted">{t("codeHint", { provider: provName(prov) })}</p>
          <div>
            <label>{t("codeLabel")}</label>
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (codeErr) setCodeErr("");
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-invalid={codeErr ? true : undefined}
              aria-describedby={codeErr ? `${uid}-code` : undefined}
            />
            <FieldError id={`${uid}-code`} msg={codeErr} />
          </div>
          {waiting ? <p className="advmuted" role="status">{t("retryIn", { time: fmtClock(wait.resendIn) })}</p> : null}
          <button className="btn btn--pri btn--full" type="button" disabled={busy || waiting || !code.trim()} onClick={verify}>
            {busy ? t("verifying") : t("verify")}
          </button>
          <button className="rf__link rf__link--muted" type="button" onClick={() => { setFlow(null); setProv(null); setCodeErr(""); }}>
            {t("cancel")}
          </button>
        </div>
      ) : isIdentityPending(cur) ? (
        <div className="idv__flow">
          <p className="advmuted">{t("pending")}</p>
          <button className="btn btn--line btn--sm" type="button" disabled={busy} onClick={refresh}>
            {t("refresh")}
          </button>
          {providers}
        </div>
      ) : (
        providers
      )}
    </div>
  );
}
