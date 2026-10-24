"use client";

import "./myPlan.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { dateOnly } from "@/lib/date";
import { errDetail, isAborted, isRouteMissing, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { getMyFeatures, getSubscriptionContract, giveRenewalConsent, type FeatureAccess, type MyFeatures, type SubscriptionContract } from "@/lib/services/subscriptionContract";

// The subscriber's own plan: the terms fixed for this period (a later
// tariff edit does not touch them), each feature's limit as the backend
// counts it, and — when the tariff changed — consent to the new terms at
// renewal. Nothing is counted here.

type State = { status: "loading" } | { status: "none" } | { status: "ready"; features: MyFeatures; contract: SubscriptionContract | null };

export default function MyPlanCard(): ReactElement | null {
  const t = useTranslations("portal.myPlan");
  const ts = useTranslations("studio");
  const locale = useLocale();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        const features = await getMyFeatures(ctl.signal);
        if (!features.subscriptionId) return setState({ status: "none" });
        const contract = await getSubscriptionContract(features.subscriptionId, ctl.signal).catch(() => null);
        setState({ status: "ready", features, contract });
      } catch (e) {
        if (isAborted(e)) return;
        if (!isRouteMissing(e)) logApiError("myPlan.load", e);
        setState({ status: "none" });
      }
    })();
    return () => ctl.abort();
  }, []);

  if (state.status !== "ready") return null;
  const { features, contract } = state;
  const name = contract ? contract.names[locale] || contract.names.uz || contract.title : "";
  const featureName = (key: string) => (ts.has(`sx.feature.${key}`) ? ts(`sx.feature.${key}`) : key.replace(/[_.]+/g, " "));
  const needsConsent = !!contract?.termsChanged && !(contract.consent?.accepted === true) && !consented;

  async function consent() {
    if (!contract || busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    setNote(null);
    try {
      await giveRenewalConsent(contract.subscriptionId);
      setConsented(true);
      setNote({ ok: true, msg: t("consentDone") });
    } catch (e) {
      sending.current = false;
      logApiError("myPlan.consent", e);
      setNote({ ok: false, msg: errDetail(e) || t("consentFailed") });
    } finally {
      setBusy(false);
    }
  }

  const usage = (f: FeatureAccess): string => {
    if (!f.allowed || f.mode === "unavailable") return t("unavailable");
    if (f.mode === "unlimited") return t("unlimited");
    if (f.limit !== null) return t("used", { used: f.used ?? 0, limit: f.limit });
    return f.remaining !== null ? t("remaining", { n: f.remaining }) : t("limited");
  };

  return (
    <section className="myplan" aria-label={t("title")} data-ai-target="subscription:my-plan">
      <header className="myplan__h">
        <div>
          <small>{t("title")}</small>
          <b>{name || t("unnamed")}</b>
        </div>
        {features.planVersion !== null ? <span className="myplan__v">{t("version", { n: features.planVersion })}</span> : null}
      </header>
      <p className="myplan__lead">{t("fixed")}</p>
      {needsConsent ? (
        <div className="myplan__consent" role="alert">
          <b>{t("changedTitle")}</b>
          <span>{t("changedText")}</span>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => void consent()} disabled={busy}>
            {busy ? t("consenting") : t("consent")}
          </button>
        </div>
      ) : null}
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {features.items.length ? (
        <ul className="myplan__list">
          {features.items.map((f) => {
            const pct = f.mode === "limited" && f.limit ? Math.max(0, Math.min(100, ((f.used ?? 0) / f.limit) * 100)) : null;
            return (
              <li key={f.key} data-mode={f.allowed ? f.mode : "unavailable"}>
                <span className="myplan__f">{featureName(f.key)}</span>
                <span className="myplan__u">{usage(f)}</span>
                {pct !== null ? (
                  <span className="myplan__bar" role="progressbar" aria-label={featureName(f.key)} aria-valuemin={0} aria-valuemax={f.limit ?? 0} aria-valuenow={f.used ?? 0}>
                    <i style={{ width: `${pct}%` }} />
                  </span>
                ) : null}
                {f.mode === "limited" && f.resetsAt ? <small>{t("resets", { date: dateOnly(f.resetsAt, locale) })}</small> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {contract && Object.keys(contract.prices).length ? (
        <p className="myplan__prices">
          {Object.entries(contract.prices)
            .map(([k, v]) => `${t.has(`period.${k}`) ? t(`period.${k}`) : k}: ${fmtUzs(v)}`)
            .join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
