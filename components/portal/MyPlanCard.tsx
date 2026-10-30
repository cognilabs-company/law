"use client";

import "./myPlan.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { dateOnly } from "@/lib/date";
import { errDetail, isAborted, isRouteMissing, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { getMyFeatures, getSubscriptionContract, giveRenewalConsent, type FeatureAccess, type MyFeatures, type SubscriptionContract } from "@/lib/services/subscriptionContract";
import { updateSubscriptionAutoRenew } from "@/lib/services/backend";

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
  // "Don't renew": the subscriber may stop at the period's end instead of
  // taking the new terms (auto-renew off; the current period stays).
  const [stopped, setStopped] = useState(false);

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
  const featureName = (key: string) => (ts.has(`sx.feature.${key}`) ? ts(`sx.feature.${key}`) : t("featureOther"));
  // The new version's terms (TSK-206603), shown before the renewal asks for
  // consent: every feature whose access changes, before → after.
  const term = (e: { mode: string; limit: number | null; resetPeriod: string } | undefined) =>
    !e || e.mode === "unavailable"
      ? t("term.unavailable")
      : e.mode === "unlimited"
        ? t("term.unlimited")
        : e.limit !== null
          ? t("term.limited", { n: e.limit, period: t.has(`per.${e.resetPeriod}`) ? t(`per.${e.resetPeriod}`) : t("per.other") })
          : t("term.limitedNoNumber");
  const changes = contract?.next
    ? Array.from(new Set([...contract.entitlements.map((e) => e.key), ...contract.next.entitlements.map((e) => e.key)]))
        .map((key) => ({ key, before: contract.entitlements.find((e) => e.key === key), after: contract.next!.entitlements.find((e) => e.key === key) }))
        .filter((c) => term(c.before) !== term(c.after))
    : [];
  const needsConsent = !!contract?.termsChanged && !(contract.consent?.accepted === true) && !consented && !stopped;

  async function stop() {
    if (!contract || busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    setNote(null);
    try {
      await updateSubscriptionAutoRenew(contract.subscriptionId, { auto_renew: false });
      setStopped(true);
      setNote({ ok: true, msg: t("stopDone") });
    } catch (e) {
      sending.current = false;
      logApiError("myPlan.stop", e);
      setNote({ ok: false, msg: errDetail(e) || t("stopFailed") });
    } finally {
      setBusy(false);
    }
  }

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
          {changes.length ? (
            <ul className="myplan__next" aria-label={contract?.next?.version ? t("nextVersion", { n: contract.next.version }) : t("nextTerms")}>
              {changes.map((c) => (
                <li key={c.key}>
                  <b>{featureName(c.key)}</b>
                  <del>{term(c.before)}</del>
                  <ins>{term(c.after)}</ins>
                </li>
              ))}
            </ul>
          ) : null}
          <span className="myplan__acts">
            <button type="button" className="btn btn--line btn--sm" onClick={() => void stop()} disabled={busy}>
              {t("stop")}
            </button>
            <button type="button" className="btn btn--pri btn--sm" onClick={() => void consent()} disabled={busy}>
              {busy ? t("consenting") : t("consent")}
            </button>
          </span>
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
