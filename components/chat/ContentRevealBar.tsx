"use client";

import { useId, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getContentRevealStatus, requestContentReveal, approveContentReveal, type RevealStatus } from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { notify } from "@/lib/toast";
import FieldError from "@/components/ui/FieldError";
import { IconLock, IconShieldCheck } from "@/components/icons";
import { dateTimeFull } from "@/lib/date";

// Staff view of a secure chat: message bodies are "[metadata_only]" until a
// content reveal is requested (dispute) and approved by another staff member.
export default function ContentRevealBar({ roomId, onChanged }: { roomId: string; onChanged?: () => void }) {
  const t = useTranslations("secureChat.reveal");
  const locale = useLocale();
  const uid = useId();
  const errId = `${uid}-reason-err`;
  const [key, setKey] = useState(0);
  const res = useResourceOne(() => getContentRevealStatus(roomId), [roomId, key]);
  const [reason, setReason] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState<"request" | "approve" | null>(null);
  const s: RevealStatus | null = res.data;
  const nid = `reveal-${roomId}`;

  async function run(kind: "request" | "approve") {
    if (busy) return;
    if (kind === "request" && reason.trim().length < 5) {
      setBad(true);
      document.getElementById(`${uid}-reason`)?.focus();
      return;
    }
    setBusy(kind);
    try {
      if (kind === "request") await requestContentReveal(roomId, reason.trim());
      else await approveContentReveal(roomId);
      notify.success(t(kind === "request" ? "requested" : "approved"), { id: nid });
      setKey((k) => k + 1);
      onChanged?.();
    } catch (e) {
      notify.error(t("error"), { id: nid, error: e, map: { 403: t("forbidden"), 409: t("conflict") } });
    } finally {
      setBusy(null);
    }
  }

  if (res.status === "loading") return null;
  const active = !!s?.active;
  const pending = !!s && !active && ["requested", "pending"].includes(s.status);
  return (
    <div className={`reveal${active ? " reveal--on" : ""}`}>
      <div className="reveal__h">
        {active ? <IconShieldCheck /> : <IconLock />}
        <b>{active ? t("activeTitle") : pending ? t("pendingTitle") : t("lockedTitle")}</b>
        {s?.expiresAt && active ? <span className="advmuted">{t("until", { time: dateTimeFull(s.expiresAt, locale) })}</span> : null}
      </div>
      <p className="advmuted">{active ? t("activeText") : pending ? t("pendingText") : t("lockedText")}</p>
      {!active ? (
        <div className="reveal__acts">
          {!pending ? (
            <>
              <input
                id={`${uid}-reason`}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (e.target.value.trim().length >= 5) setBad(false);
                }}
                placeholder={t("reasonPh")}
                aria-label={t("reasonPh")}
                maxLength={300}
                aria-invalid={bad || undefined}
                aria-describedby={bad ? errId : undefined}
              />
              <button type="button" className="btn btn--pri btn--sm" disabled={!!busy} onClick={() => run("request")}>{busy === "request" ? t("working") : t("request")}</button>
            </>
          ) : null}
          <button type="button" className="btn btn--soft btn--sm" disabled={!!busy} onClick={() => run("approve")}>{busy === "approve" ? t("working") : t("approve")}</button>
        </div>
      ) : null}
      {bad && !active && !pending ? <FieldError id={errId} msg={t("reasonRequired")} /> : null}
    </div>
  );
}
