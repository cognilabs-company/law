"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Select from "@/components/Select";
import { fmtUzs } from "@/lib/money";
import { aiId } from "@/lib/ai/ids";
import type { BackendPlan } from "@/lib/services/backend";
import {
  assistPlanPeriods,
  assistPlanPrice,
  createAssistSubscriptionCheckout,
  isAssistPeriod,
  previewAssistSubscription,
  type AssistBillingPeriod,
  type AssistCheckout,
  type AssistPreview,
} from "@/lib/services/supportAssist";
import { IconRefresh } from "@/components/icons";
import { ConfirmModal, InfoList, ResultCard, StatusChip, assistErrorText, clientLine, sumText, type AssistSectionProps, type InfoRow } from "./bits";

export type AssistPlansState = { status: "loading" | "ready" | "error"; sellable: BackendPlan[]; retry: () => void };

type Quote = { planId: string; period: AssistBillingPeriod; data: AssistPreview };
type Sent = { data: AssistCheckout; planName: string; period: AssistBillingPeriod };

export default function AssistPlan({ ticketId, client, clientName, onDone, onBlock, plans }: AssistSectionProps & { plans: AssistPlansState }) {
  const t = useTranslations("support.assist");
  const tc = useTranslations("common");
  const [planId, setPlanId] = useState("");
  const [period, setPeriod] = useState<AssistBillingPeriod>("monthly");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "checkout">("");
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const inflight = useRef(false);

  const list = plans.sellable;
  const plan = list.find((p) => p.id === planId) ?? list[0] ?? null;
  const periods = plan ? assistPlanPeriods(plan) : [];
  const per: AssistBillingPeriod = periods.includes(period) ? period : (periods[0] ?? "monthly");
  const fresh = quote && plan && quote.planId === plan.id && quote.period === per ? quote.data : null;
  const stale = Boolean(quote && !fresh);
  const monthly = (p: BackendPlan) => assistPlanPrice(p, "monthly");
  const ai = (...parts: string[]) => aiId("call_center.support.ticket", ticketId, "assist", "subscription", ...parts);

  async function runPreview() {
    if (!plan || inflight.current) return;
    inflight.current = true;
    setBusy("preview");
    setErr("");
    setSent(null);
    try {
      const data = await previewAssistSubscription(ticketId, { planId: plan.id, billingPeriod: per });
      setQuote({ planId: plan.id, period: per, data });
    } catch (e) {
      if (!onBlock(e)) setErr(assistErrorText(e, t, tc));
    } finally {
      inflight.current = false;
      setBusy("");
    }
  }

  async function runCheckout() {
    if (!plan || !fresh || inflight.current) return;
    inflight.current = true;
    setBusy("checkout");
    setConfirmErr("");
    try {
      const data = await createAssistSubscriptionCheckout(ticketId, { planId: plan.id, billingPeriod: per });
      setSent({ data, planName: plan.name || plan.title, period: per });
      setQuote(null);
      setConfirming(false);
      onDone();
    } catch (e) {
      if (onBlock(e)) setConfirming(false);
      else setConfirmErr(assistErrorText(e, t, tc));
    } finally {
      inflight.current = false;
      setBusy("");
    }
  }

  const quoteRows: InfoRow[] = fresh
    ? [
        { key: "period", label: t("plan.period"), value: fresh.months > 0 ? t("months", { n: fresh.months }) : t(`period.${per}`) },
        ...(fresh.discountAmount > 0
          ? [
              { key: "base", label: t("plan.base"), value: sumText(t, fresh.subtotal || fresh.baseAmount, fresh.currency) },
              { key: "discount", label: t("plan.discount"), value: `−${sumText(t, fresh.discountAmount, fresh.currency)}${fresh.discountPercent ? ` (${fresh.discountPercent}%)` : ""}` },
            ]
          : []),
        { key: "total", label: t("plan.total"), value: <span className="sasst__total">{sumText(t, fresh.amount, fresh.currency)}</span> },
      ]
    : [];

  const confirmRows: InfoRow[] =
    plan && fresh
      ? [
          { key: "client", label: t("confirm.client"), value: clientLine(t, client, clientName) },
          { key: "plan", label: t("result.plan"), value: plan.name || plan.title },
          { key: "period", label: t("plan.period"), value: t(`period.${per}`) },
          { key: "amount", label: t("result.amount"), value: sumText(t, fresh.amount, fresh.currency) },
        ]
      : [];

  const sentRows: InfoRow[] = sent
    ? [
        { key: "work", label: t("result.workId"), value: sent.data.workId ? <span className="sasst__wid">{sent.data.workId}</span> : "—" },
        { key: "plan", label: t("result.plan"), value: [sent.planName, sent.data.planSlug ? `(${sent.data.planSlug})` : ""].filter(Boolean).join(" ") },
        { key: "period", label: t("plan.period"), value: t(`period.${sent.period}`) },
        { key: "amount", label: t("result.amount"), value: sumText(t, sent.data.amount, sent.data.currency) },
        { key: "status", label: t("result.status"), value: <StatusChip status={sent.data.status} /> },
        { key: "tg", label: t("result.telegram"), value: sent.data.telegramSent ? t("result.telegramSent") : t("result.telegramFailed") },
      ]
    : [];

  return (
    <div className="sasst__secin">
      <h4 className="sasst__h4">{t("plan.heading")}</h4>
      <p className="sasst__lead">{t("plan.lead")}</p>
      {sent ? <ResultCard title={t("plan.sentTitle")} rows={sentRows} warn={!sent.data.telegramSent} onDismiss={() => setSent(null)} /> : null}
      {plans.status === "loading" ? (
        <p className="sasst__muted">{t("plan.loading")}</p>
      ) : plans.status === "error" ? (
        <div className="sasst__errbox">
          <p className="sasst__err">{t("plan.loadError")}</p>
          <button type="button" className="btn btn--line btn--sm" onClick={plans.retry}>
            <IconRefresh />
            {tc("retry")}
          </button>
        </div>
      ) : !plan ? (
        <p className="sasst__empty">{t("plan.none")}</p>
      ) : (
        <>
          <div className="sasst__f" data-ai-id={ai("plan")} data-ai-type="select" data-ai-label={t("plan.plan")}>
            <span className="sasst__lbl">{t("plan.plan")}</span>
            <Select
              value={plan.id}
              onChange={setPlanId}
              ariaLabel={t("plan.plan")}
              options={list.map((p) => ({ value: p.id, label: monthly(p) > 0 ? `${p.name || p.title} · ${t("perMonth", { amount: fmtUzs(monthly(p)) })}` : p.name || p.title }))}
            />
          </div>
          <div className="sasst__f" data-ai-id={ai("period")} data-ai-type="select" data-ai-label={t("plan.period")}>
            <span className="sasst__lbl">{t("plan.period")}</span>
            <Select
              value={per}
              onChange={(v) => {
                if (isAssistPeriod(v)) setPeriod(v);
              }}
              ariaLabel={t("plan.period")}
              options={periods.map((p) => ({ value: p, label: t(`period.${p}`) }))}
            />
            <small className="sasst__hint">{t("plan.listPrice", { amount: sumText(t, assistPlanPrice(plan, per)) })}</small>
          </div>
          {fresh ? (
            <div className="sasst__quote" aria-live="polite">
              <span className="sasst__lbl">{t("plan.quote")}</span>
              <InfoList rows={quoteRows} />
            </div>
          ) : stale ? (
            <p className="sasst__stale">{t("plan.stale")}</p>
          ) : null}
          {err ? (
            <p className="sasst__err" role="alert">
              {err}
            </p>
          ) : null}
          <div className="sasst__acts">
            <button
              type="button"
              className="btn btn--line btn--sm"
              onClick={() => void runPreview()}
              disabled={Boolean(busy)}
              aria-busy={busy === "preview" || undefined}
              data-ai-id={ai("preview")}
            >
              {busy === "preview" ? t("plan.previewing") : t("plan.preview")}
            </button>
            <button
              type="button"
              className="btn btn--grad btn--sm"
              onClick={() => {
                setConfirmErr("");
                setConfirming(true);
              }}
              disabled={!fresh || Boolean(busy)}
              data-ai-id={ai("next")}
            >
              {t("plan.next")}
            </button>
          </div>
        </>
      )}
      <ConfirmModal
        open={confirming && Boolean(fresh)}
        title={t("plan.confirmTitle")}
        rows={confirmRows}
        note={t("plan.confirmNote")}
        busy={busy === "checkout"}
        error={confirmErr}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void runCheckout()}
        aiId={ai("confirm-modal")}
      />
    </div>
  );
}
