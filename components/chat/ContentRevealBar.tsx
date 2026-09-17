"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getContentRevealStatus, requestContentReveal, approveContentReveal, type RevealStatus } from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { ApiError } from "@/lib/http";
import { Notice } from "@/components/admin/AdminBits";
import { IconLock, IconShieldCheck } from "@/components/icons";

// Staff view of a secure chat: message bodies are "[metadata_only]" until a
// content reveal is requested (dispute) and approved by another staff member.
export default function ContentRevealBar({ roomId, onChanged }: { roomId: string; onChanged?: () => void }) {
  const t = useTranslations("secureChat.reveal");
  const [key, setKey] = useState(0);
  const res = useResourceOne(() => getContentRevealStatus(roomId), [roomId, key]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"request" | "approve" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const s: RevealStatus | null = res.data;

  async function run(kind: "request" | "approve") {
    if (busy) return;
    if (kind === "request" && reason.trim().length < 5) { setNote({ ok: false, msg: t("reasonRequired") }); return; }
    setBusy(kind);
    setNote(null);
    try {
      if (kind === "request") await requestContentReveal(roomId, reason.trim());
      else await approveContentReveal(roomId);
      setNote({ ok: true, msg: t(kind === "request" ? "requested" : "approved") });
      setKey((k) => k + 1);
      onChanged?.();
    } catch (e) {
      setNote({ ok: false, msg: e instanceof ApiError && e.status === 403 ? t("forbidden") : e instanceof ApiError && e.status === 409 ? t("conflict") : e instanceof ApiError && e.detail ? e.detail : t("error") });
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
        {s?.expiresAt && active ? <span className="advmuted">{t("until", { time: new Date(s.expiresAt).toLocaleString("ru-RU") })}</span> : null}
      </div>
      <p className="advmuted">{active ? t("activeText") : pending ? t("pendingText") : t("lockedText")}</p>
      {!active ? (
        <div className="reveal__acts">
          {!pending ? (
            <>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPh")} maxLength={300} />
              <button type="button" className="btn btn--pri btn--sm" disabled={!!busy} onClick={() => run("request")}>{busy === "request" ? t("working") : t("request")}</button>
            </>
          ) : null}
          <button type="button" className="btn btn--soft btn--sm" disabled={!!busy} onClick={() => run("approve")}>{busy === "approve" ? t("working") : t("approve")}</button>
        </div>
      ) : null}
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
    </div>
  );
}
