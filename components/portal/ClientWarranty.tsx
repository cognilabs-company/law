"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { listWarrantyClaims, createWarrantyClaim, type WarrantyClaim } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { Skeleton } from "@/components/portal/DataState";
import FieldError from "@/components/ui/FieldError";
import { notify } from "@/lib/toast";
import { IconShieldCheck, IconCheck } from "@/components/icons";
import { dateOnly } from "@/lib/date";

function fmt(s: string, locale: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateOnly(s, locale);
}

export default function ClientWarranty() {
  const t = useTranslations("portal.client.warranty");
  const tc = useTranslations("common");
  const uid = useId();
  const locale = useLocale();
  const [key, reload] = useReload();
  const claims = useResource(() => listWarrantyClaims(), [key]);
  const [caseTitle, setCaseTitle] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [reasonErr, setReasonErr] = useState("");
  // A centered result alert on submit (with the claim's real status) — an
  // inline note at the bottom of a long form went unnoticed.
  const [result, setResult] = useState<WarrantyClaim | null>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.location.hash === "#warranty") root.current?.scrollIntoView({ block: "start" });
  }, []);

  const points = ["p1", "p2", "p3"] as const;
  const statusLabel = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!reason.trim()) {
      setReasonErr(tc("required"));
      return;
    }
    setBusy(true);
    setReasonErr("");
    try {
      const claim = await createWarrantyClaim({ reason: `${caseTitle ? caseTitle + ": " : ""}${reason.trim()}` });
      notify.dismiss("warranty-claim");
      setResult(claim);
      setReason("");
      setCaseTitle("");
      reload();
    } catch (e) {
      notify.error(t("sendFailed"), { id: "warranty-claim", error: e });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="war" id="warranty" ref={root} aria-labelledby={`${uid}-title`}>
      <div className="war__hero">
        <span className="war__ico"><IconShieldCheck /></span>
        <div>
          <h2 className="war__title" id={`${uid}-title`}>{t("title")}</h2>
          <p className="war__sub">{t("subtitle")}</p>
        </div>
      </div>

      <div className="war__points" data-ai-target="warranty:points">
        {points.map((p) => (
          <div className="war__point" key={p}>
            <span className="war__check"><IconCheck /></span>
            <span>{t(p)}</span>
          </div>
        ))}
      </div>

      <div className="pgrid2">
        <div className="ppanel" data-ai-target="warranty:form">
          <div className="ppanel__h"><b>{t("requestTitle")}</b></div>
          <p className="ppanel__note">{t("requestLead")}</p>
          <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
            <div>
              <label>{t("caseLabel")}</label>
              <input value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} placeholder={t("casePh")} />
            </div>
            <div>
              <label>{t("reasonLabel")}</label>
              <textarea
                rows={4}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonErr) setReasonErr("");
                }}
                placeholder={t("reasonPh")}
                aria-invalid={reasonErr ? true : undefined}
                aria-describedby={reasonErr ? `${uid}-reason` : undefined}
              />
              <FieldError id={`${uid}-reason`} msg={reasonErr} />
            </div>
            <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
              {busy ? t("sending") : t("submit")}
            </button>
          </form>
        </div>

        <div className="ppanel" data-ai-target="warranty:claims">
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
                    <span>{[c.reason, fmt(c.createdAt, locale)].filter(Boolean).join(" · ")}</span>
                  </div>
                  <span className="creq__badge">{t.has(`status.${c.status}`) ? t(`status.${c.status}`) : c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={result !== null} onClose={() => setResult(null)} title={t("resultTitle")}>
        {result ? (
          <div className="wres">
            <span className="wres__ic"><IconCheck /></span>
            <b>{t("resultSentTitle")}</b>
            <span className="wres__status">{t("resultStatus", { status: statusLabel(result.status) })}</span>
            <p className="advmuted" style={{ margin: 0 }}>{t("resultNote")}</p>
            <button className="btn btn--pri" type="button" onClick={() => setResult(null)}>{t("resultClose")}</button>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
