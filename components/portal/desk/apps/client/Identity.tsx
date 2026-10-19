"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getIdentity, identityStart, identityVerifyDemo, isIdentityPending, type IdentityProvider, type IdentityStatus } from "@/lib/services/backend";
import { errDetail, isDemoUnavailable, isProviderUnavailable, isRateLimited, retryAfterSec } from "@/lib/http";
import { fmtClock, useOtpTimer } from "@/lib/useOtpTimer";
import { IconExternal, IconRefresh, IconShieldCheck } from "@/components/icons";
import { Banner, Btn, Field, Group, Input, SettingRow, Spinner, Tag } from "../../kit/kit";

// Proving who the client is with MyID or OneID, as a settings group: the
// two providers to choose from, the code step when the provider answers
// with one, and the verified name once done. A provider that sends the
// client to its own page opens it in a new tab, so the desktop stays; back
// here, "Check again" reads the result. The rules are IdentityVerify's.

const provName = (p: IdentityProvider | null) => (p === "myid" ? "MyID" : "OneID");

export default function Identity({ say }: { say: (m: string, tone?: "err") => void }) {
  const t = useTranslations("portal.client.identity");
  const tc = useTranslations("common");
  const [cur, setCur] = useState<IdentityStatus | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [prov, setProv] = useState<IdentityProvider | null>(null);
  const [flow, setFlow] = useState<{ state: string; provider: IdentityProvider } | null>(null);
  const [away, setAway] = useState(false);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [busy, setBusy] = useState(false);
  const wait = useOtpTimer();
  const waiting = wait.resendIn > 0;
  useEffect(() => {
    let alive = true;
    getIdentity()
      .then((x) => alive && setCur(x))
      .catch(() => alive && setCur(null));
    return () => {
      alive = false;
    };
  }, [tick]);
  const errMsg = (e: unknown) => (isProviderUnavailable(e) || isDemoUnavailable(e) ? tc("identityUnavailable") : isRateLimited(e) ? errDetail(e) || tc("rateLimited") : t("error"));

  async function start(p: IdentityProvider) {
    if (busy) return;
    setBusy(true);
    setProv(p);
    try {
      const r = await identityStart(p);
      if (r.mode === "redirect") {
        window.open(r.authUrl, "_blank", "noopener");
        setAway(true);
        return;
      }
      if (!r.state) return say(t("error"), "err");
      setFlow({ state: r.state, provider: p });
      setCode("");
      setCodeErr("");
    } catch (e) {
      if (isRateLimited(e)) wait.cooldown(retryAfterSec(e, 60));
      say(errMsg(e), "err");
      setProv(null);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!flow || busy || !code.trim()) return;
    setBusy(true);
    setCodeErr("");
    try {
      const r = await identityVerifyDemo(flow.provider, flow.state, code.trim());
      setCur(r);
      if (r.verified) {
        setFlow(null);
        say(t("done"));
      } else setCodeErr(t("failed"));
    } catch (e) {
      if (isRateLimited(e)) wait.cooldown(retryAfterSec(e, 60));
      say(errMsg(e), "err");
    } finally {
      setBusy(false);
    }
  }
  const recheck = () => (setAway(false), setProv(null), setCur(undefined), setTick((n) => n + 1));

  return (
    <Group title={t("title")} footer={cur?.verified ? undefined : t("noBiometrics")}>
      {cur === undefined ? (
        <Spinner small />
      ) : cur?.verified ? (
        <SettingRow icon={<IconShieldCheck />} title={t("verified")} desc={cur.fullName ? `${cur.fullName}${cur.pinfl ? ` · ${cur.pinfl}` : ""}` : undefined}>
          <Tag tone="ok">{provName((cur.provider as IdentityProvider) || null)}</Tag>
        </SettingRow>
      ) : flow ? (
        <div className="dxcz-id">
          <p className="dxcs-lead">{t("codeHint", { provider: provName(prov) })}</p>
          <Field label={t("codeLabel")} error={codeErr || undefined}>
            <Input value={code} onChange={(v) => (setCode(v), setCodeErr(""))} ariaLabel={t("codeLabel")} />
          </Field>
          {waiting ? <small className="dx-field__h">{t("retryIn", { time: fmtClock(wait.resendIn) })}</small> : null}
          <span className="dxcw-tags">
            <Btn kind="primary" busy={busy} disabled={waiting || !code.trim()} onClick={() => void verify()}>
              {t("verify")}
            </Btn>
            <Btn onClick={() => (setFlow(null), setProv(null), setCodeErr(""))}>{t("cancel")}</Btn>
          </span>
        </div>
      ) : (
        <>
          <p className="dxcz-idlead">{t("lead")}</p>
          {away || isIdentityPending(cur) ? (
            <Banner tone="info" action={<Btn small icon={<IconRefresh />} onClick={recheck}>{t("refresh")}</Btn>}>
              {away ? t("redirecting", { provider: provName(prov) }) : t("pending")}
            </Banner>
          ) : null}
          {waiting ? <small className="dx-field__h">{t("retryIn", { time: fmtClock(wait.resendIn) })}</small> : null}
          <SettingRow icon={<IconShieldCheck />} title={`MyID · ${t("primary")}`} desc={t("myidSub")}>
            <Btn kind="primary" small icon={<IconExternal />} busy={busy && prov === "myid"} disabled={busy || waiting} onClick={() => void start("myid")}>
              {t("verify")}
            </Btn>
          </SettingRow>
          <SettingRow icon={<IconShieldCheck />} title="OneID" desc={t("oneidSub")}>
            <Btn small icon={<IconExternal />} busy={busy && prov === "oneid"} disabled={busy || waiting} onClick={() => void start("oneid")}>
              {t("verify")}
            </Btn>
          </SettingRow>
        </>
      )}
    </Group>
  );
}
