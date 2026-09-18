"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { listWarrantyClaims, createWarrantyClaim, type WarrantyClaim } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useReload, Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { Skeleton } from "@/components/portal/DataState";
import { IconShieldCheck, IconCheck, IconAlert } from "@/components/icons";

function fmt(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU");
}

export default function ClientWarranty() {
  const t = useTranslations("portal.client.warranty");
  const [key, reload] = useReload();
  const claims = useResource(() => listWarrantyClaims(), [key]);
  const [caseTitle, setCaseTitle] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  // A centered result alert on submit (with the claim's real status) — an
  // inline note at the bottom of a long form went unnoticed.
  const [result, setResult] = useState<WarrantyClaim | "error" | null>(null);

  const points = ["p1", "p2", "p3"] as const;
  const statusLabel = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !reason.trim()) {
      setNote({ ok: false, msg: t("error") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const claim = await createWarrantyClaim({ reason: `${caseTitle ? caseTitle + ": " : ""}${reason.trim()}` });
      setResult(claim);
      setReason("");
      setCaseTitle("");
      reload();
    } catch {
      setResult("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="war">
      <div className="war__hero">
        <span className="war__ico"><IconShieldCheck /></span>
        <div>
          <h1 className="war__title">{t("title")}</h1>
          <p className="war__sub">{t("subtitle")}</p>
        </div>
      </div>

      <div className="war__points">
        {points.map((p) => (
          <div className="war__point" key={p}>
            <span className="war__check"><IconCheck /></span>
            <span>{t(p)}</span>
          </div>
        ))}
      </div>

      <div className="pgrid2">
        <div className="ppanel">
          <div className="ppanel__h"><b>{t("requestTitle")}</b></div>
          <p className="ppanel__note">{t("requestLead")}</p>
          <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
            <div>
              <label>{t("caseLabel")}</label>
              <input value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} placeholder={t("casePh")} />
            </div>
            <div>
              <label>{t("reasonLabel")}</label>
              <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPh")} />
            </div>
            {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
            <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
              {busy ? t("sending") : t("submit")}
            </button>
          </form>
        </div>

        <div className="ppanel">
          <div className="ppanel__h"><b>{t("claimsTitle")}</b></div>
          {claims.status === "loading" ? (
            <Skeleton rows={2} />
          ) : !claims.data.length ? (
            <p className="ppanel__note">{t("noClaims")}</p>
          ) : (
            <div className="alist">
              {claims.data.map((c) => (
                <div className="creq" key={c.id}>
                  <span className="creq__st" />
                  <div className="creq__m">
                    <b>{c.caseTitle || t("claim")}</b>
                    <span>{[c.reason, fmt(c.createdAt)].filter(Boolean).join(" · ")}</span>
                  </div>
                  <span className="creq__badge">{t.has(`status.${c.status}`) ? t(`status.${c.status}`) : c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={result !== null} onClose={() => setResult(null)} title={result === "error" ? t("error") : t("resultTitle")}>
        {result === "error" ? (
          <div className="wres wres--err">
            <span className="wres__ic"><IconAlert /></span>
            <p style={{ margin: 0 }}>{t("error")}</p>
            <button className="btn btn--pri" type="button" onClick={() => setResult(null)}>{t("resultClose")}</button>
          </div>
        ) : result ? (
          <div className="wres">
            <span className="wres__ic"><IconCheck /></span>
            <b>{t("resultSentTitle")}</b>
            <span className="wres__status">{t("resultStatus", { status: statusLabel(result.status) })}</span>
            <p className="advmuted" style={{ margin: 0 }}>{t("resultNote")}</p>
            <button className="btn btn--pri" type="button" onClick={() => setResult(null)}>{t("resultClose")}</button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
