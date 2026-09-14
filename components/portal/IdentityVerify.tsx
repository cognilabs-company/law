"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  getIdentity,
  identityStart,
  identityVerifyDemo,
  isIdentityPending,
  type IdentityProvider,
  type IdentityStatus,
} from "@/lib/services/backend";
import { errDetail, isDemoUnavailable, isProviderUnavailable, isRateLimited } from "@/lib/http";
import { useResourceOne } from "@/lib/useResource";
import { Skeleton } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import { IconShieldCheck } from "@/components/icons";

const provName = (p: IdentityProvider | null) => (p === "myid" ? "MyID" : "OneID");

// OneID / MyID identity verification through the backend provider interface.
// Start either returns a provider URL (followed in the same tab) or, on a
// staging demo provider, a state for code entry. Codes are never read from the
// response. 503 = provider not connected.
export default function IdentityVerify() {
  const t = useTranslations("portal.client.identity");
  const tcommon = useTranslations("common");
  const [key, setKey] = useState(0);
  const res = useResourceOne(getIdentity, [key]);
  const [id, setId] = useState<IdentityStatus | null>(null);
  const cur = id ?? res.data;
  const [prov, setProv] = useState<IdentityProvider | null>(null);
  const [flow, setFlow] = useState<{ state: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  const errMsg = (e: unknown) =>
    isProviderUnavailable(e) || isDemoUnavailable(e)
      ? tcommon("identityUnavailable")
      : isRateLimited(e)
        ? errDetail(e) || tcommon("rateLimited")
        : t("error");

  function refresh() {
    setId(null);
    setNote(null);
    setKey((k) => k + 1);
  }

  async function start(p: IdentityProvider) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setProv(p);
    let leaving = false;
    try {
      const r = await identityStart(p);
      if (r.mode === "redirect") {
        // The provider page returns to the app; /identity/me shows the result.
        leaving = true;
        setNote({ ok: true, msg: t("redirecting", { provider: provName(p) }) });
        window.location.assign(r.authUrl);
        return;
      }
      if (!r.state) {
        setNote({ ok: false, msg: t("error") });
        setProv(null);
        return;
      }
      setFlow({ state: r.state });
      setCode("");
    } catch (e) {
      setNote({ ok: false, msg: errMsg(e) });
      setProv(null);
    } finally {
      if (!leaving) setBusy(false);
    }
  }
  async function verify() {
    if (!flow || busy || !code.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await identityVerifyDemo(flow.state, code.trim());
      setId(r);
      if (r.verified) {
        setFlow(null);
        setNote({ ok: true, msg: t("done") });
      } else {
        setNote({ ok: false, msg: t("failed") });
      }
    } catch (e) {
      setNote({ ok: false, msg: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  const providers = (
    <div className="idv__providers">
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      <button className="idv__prov" type="button" disabled={busy} onClick={() => start("oneid")}>
        <b>OneID</b>
        <span>{t("oneidSub")}</span>
      </button>
      <button className="idv__prov" type="button" disabled={busy} onClick={() => start("myid")}>
        <b>MyID</b>
        <span>{t("myidSub")}</span>
      </button>
    </div>
  );

  return (
    <div className="ppanel">
      <div className="ppanel__h"><b>{t("title")}</b></div>
      <p className="ppanel__note">{t("lead")}</p>

      {res.status === "loading" && !id ? (
        <Skeleton rows={2} />
      ) : cur?.verified ? (
        <div className="idv__ok">
          <span className="idv__oki"><IconShieldCheck /></span>
          <div>
            <b>{t("verified")}</b>
            {cur.fullName ? <span>{cur.fullName}{cur.pinfl ? ` · ${cur.pinfl}` : ""}</span> : null}
          </div>
        </div>
      ) : flow ? (
        <div className="idv__flow">
          <p className="advmuted">{t("codeHint", { provider: provName(prov) })}</p>
          <div>
            <label>{t("codeLabel")}</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--pri btn--full" type="button" disabled={busy || !code.trim()} onClick={verify}>
            {busy ? t("verifying") : t("verify")}
          </button>
          <button className="rf__link rf__link--muted" type="button" onClick={() => { setFlow(null); setProv(null); setNote(null); }}>
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
