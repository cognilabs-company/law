"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getContract, getDocumentRequestChat, startContractSignature, startDocumentRequestAudioCall, verifyContractSignature, type CallUsage } from "@/lib/services/backend";
import { ApiError, errDetail, isForbidden, isOffline, isOtpExpired, isProviderUnavailable, isRateLimited, logApiError, retryAfterSec } from "@/lib/http";
import { OTP_RESEND_SEC, fmtClock, useOtpTimer } from "@/lib/useOtpTimer";
import { subscribeUserEvents } from "@/lib/userSocket";
import { dateTimeFull } from "@/lib/date";
import { IconChat, IconCheck, IconClock, IconExternal, IconPhone, IconShieldCheck } from "@/components/icons";
import { Banner, Btn, Field, Group, Input, SettingRow } from "../../kit/kit";

// Signing the finished contract inside LexGo, as a settings group: the code
// to Telegram, the six digits, and the signature with its public check
// link. The rules are ContractSign's.
export function DeskSign({ contractId }: { contractId: string }) {
  const t = useTranslations("portal.client.documents.sign");
  const to = useTranslations("register.otp");
  const tc = useTranslations("common");
  const locale = useLocale();
  const otp = useOtpTimer();
  const [stage, setStage] = useState<"idle" | "code">("idle");
  const [vid, setVid] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [signed, setSigned] = useState<{ at: string; url: string } | null>(null);
  useEffect(() => {
    let alive = true;
    getContract(contractId)
      .then((c) => alive && c.signed && setSigned({ at: c.signedAt || "", url: c.verifyUrl || "" }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [contractId]);
  const startErr = (e: unknown) => (isRateLimited(e) ? errDetail(e) || tc("rateLimited") : isProviderUnavailable(e) ? tc("otpChannelUnavailable") : isForbidden(e) ? t("forbidden") : isOffline(e) ? tc("offline") : t("startError"));
  async function start() {
    if (busy || otp.resendIn > 0) return;
    setBusy(true);
    setErr("");
    try {
      const c = await startContractSignature(contractId);
      if (!c.verificationId) return setErr(t("startError"));
      setVid(c.verificationId);
      setCode("");
      otp.issue(c.expiresAt);
      setStage("code");
    } catch (e) {
      if (isRateLimited(e)) otp.cooldown(retryAfterSec(e, OTP_RESEND_SEC));
      setErr(startErr(e));
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (busy || code.length !== 6 || otp.expired || otp.blockedIn > 0) return;
    setBusy(true);
    setErr("");
    try {
      const r = await verifyContractSignature(contractId, vid, code);
      setSigned({ at: r.signedAt, url: r.verifyUrl });
      setStage("idle");
      otp.clear();
    } catch (e) {
      if (isRateLimited(e)) {
        otp.block(retryAfterSec(e, 15 * 60));
        setErr(errDetail(e) || tc("rateLimited"));
      } else if (isOtpExpired(e)) otp.expire();
      else if (e instanceof ApiError && e.status >= 400 && e.status < 500) setErr(isForbidden(e) ? t("forbidden") : to("incorrect"));
      else setErr(isOffline(e) ? tc("offline") : t("verifyError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Group title={t("title")}>
      {signed ? (
        <SettingRow icon={<IconShieldCheck />} title={t("signed")} desc={signed.at ? t("signedAt", { time: dateTimeFull(signed.at, locale) }) : undefined}>
          {signed.url ? (
            <Btn small icon={<IconExternal />} onClick={() => window.open(signed.url, "_blank", "noopener")}>
              {t("verifyLink")}
            </Btn>
          ) : null}
        </SettingRow>
      ) : stage === "code" ? (
        <div className="dxcz-id">
          <p className="dxcs-lead">{t("codeHint")}</p>
          <Field label={t("codeLabel")} error={err || undefined} hint={otp.blockedIn > 0 ? to("blockedFor", { time: fmtClock(otp.blockedIn) }) : otp.expired ? to("expired") : otp.expiresIn > 0 ? to("expiresIn", { time: fmtClock(otp.expiresIn) }) : undefined}>
            <Input value={code} onChange={(v) => (setCode(v.replace(/\D/g, "").slice(0, 6)), setErr(""))} placeholder="••••••" maxLength={6} ariaLabel={t("codeLabel")} />
          </Field>
          <span className="dxcw-tags">
            <Btn kind="primary" icon={<IconCheck />} busy={busy} disabled={code.length !== 6 || otp.expired || otp.blockedIn > 0} onClick={() => void verify()}>
              {t("confirm")}
            </Btn>
            <Btn disabled={otp.resendIn > 0 || busy} onClick={() => void start()}>
              {otp.resendIn > 0 ? to("resendIn", { time: fmtClock(otp.resendIn) }) : to("resend")}
            </Btn>
            <Btn kind="plain" onClick={() => (setStage("idle"), setErr(""), otp.clear())}>
              {t("back")}
            </Btn>
          </span>
        </div>
      ) : (
        <SettingRow icon={<IconShieldCheck />} title={t("title")} desc={t("lead")}>
          <Btn small kind="primary" busy={busy} disabled={otp.resendIn > 0} onClick={() => void start()}>
            {otp.resendIn > 0 ? to("resendIn", { time: fmtClock(otp.resendIn) }) : t("start")}
          </Btn>
        </SettingRow>
      )}
      {err && stage === "idle" ? <Banner tone="err">{err}</Banner> : null}
    </Group>
  );
}

// The chat with the advocate on this document, and a call to them; both
// open in Messages, the call joined there.
export function DeskDocChat({ requestId, openRoute }: { requestId: string; openRoute?: (route: string) => void }) {
  const t = useTranslations("portal.client.documents");
  const [chat, setChat] = useState<{ available: boolean; roomId: string } | null | "error">(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<CallUsage | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    getDocumentRequestChat(requestId)
      .then((c) => alive && setChat({ available: c.available, roomId: c.roomId }))
      .catch((e) => {
        if (!alive) return;
        // 404: no advocate chat on this document yet — a wait, not a fault.
        if (e instanceof ApiError && e.status === 404) return setChat({ available: false, roomId: "" });
        logApiError("document-request chat", e);
        setChat("error");
      });
    return () => {
      alive = false;
    };
  }, [requestId, tick]);
  useEffect(() => subscribeUserEvents((e) => (e.event === "document_request.claimed" || e.event === "document_request.completed") && setTick((k) => k + 1)), []);
  async function ring(roomId: string) {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const c = await startDocumentRequestAudioCall(requestId);
      setUsage(c.clientCallUsage);
      openRoute?.(`/portal/chat/${encodeURIComponent(c.roomId || roomId)}?join=${encodeURIComponent(c.id)}`);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 429 ? t("callLimitReached") : t("callFailed"));
    } finally {
      setBusy(false);
    }
  }
  if (chat === null) return null;
  const ready = chat !== "error" && chat.available && chat.roomId;
  return (
    <Group title={t("chatOpen")}>
      {!ready ? (
        <SettingRow icon={<IconClock />} title={chat === "error" ? t("chatLoadError") : t("chatNotYet")} />
      ) : (
        <SettingRow icon={<IconChat />} title={t("chatOpen")} desc={usage ? t("callsLeft", { n: usage.remaining }) : undefined}>
          <Btn small kind="primary" icon={<IconChat />} onClick={() => openRoute?.(`/portal/chat/${encodeURIComponent(chat.roomId)}`)}>
            {t("chatOpen")}
          </Btn>
          <Btn small icon={<IconPhone />} busy={busy} onClick={() => void ring(chat.roomId)}>
            {t("callLawyer")}
          </Btn>
        </SettingRow>
      )}
      {err ? <Banner tone="err">{err}</Banner> : null}
    </Group>
  );
}
