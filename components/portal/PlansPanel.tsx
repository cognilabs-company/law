"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  getSubscriptionPlans,
  demoPlanPurchase,
  listPayments,
  type BackendPlan,
} from "@/lib/services/backend";
import { useAuth } from "@/lib/auth";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { createCheckout, isDemoCheckout, type PaymentIntent } from "@/lib/services/checkout";
import { CheckoutIntent } from "./OrderMilestones";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "./DataState";
import { IconCheck, IconCard, IconGift, IconSparkle, IconShieldCheck } from "@/components/icons";

type Term = 1 | 3 | 6 | 12;
type Variant = "personal" | "all";

// GM T1-03: the client's LexGo.AI plans are exactly Free / Lite / Pro; the
// "Shaxsiy advokatim" plans are Standart / Premium (audience personal).
// Business subscriptions belong to the B2B module, and the seller-price
// duplicates the backend seeds are never shown here.
const AI_SLUG = /^lexgo-ai-(free|lite|pro)$/;
// T1-03 §5: term discounts 3 → −5 %, 6 → −10 %, 12 → −15 %; paying up front
// takes another −5 %, capped at 20 % overall.
const TERM_DISCOUNT: Record<Term, number> = { 1: 0, 3: 5, 6: 10, 12: 15 };
const UPFRONT_DISCOUNT = 5;
const MAX_DISCOUNT = 20;
// T1-03 §6: verified advocates / lawyers get 50 % off LexGo.AI automatically.
const SELLER_DISCOUNT = 50;

function som(n: number): string {
  return fmtUzs(n);
}
function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU");
}
// Backend billing_period for the chosen term (the API knows monthly / six_month /
// yearly / prepaid_yearly; a 3-month term is billed as monthly — reported).
function billingPeriod(term: Term, upfront: boolean): string {
  return term === 6 ? "six_month" : term === 12 ? (upfront ? "prepaid_yearly" : "yearly") : "monthly";
}
// LexGo.AI pricing from the monthly price and the GM discount table.
function aiPricing(plan: BackendPlan, term: Term, upfront: boolean, sellerPct: number) {
  const monthly = Math.round(plan.monthlyPrice * (1 - sellerPct / 100));
  const pct = Math.min(MAX_DISCOUNT, TERM_DISCOUNT[term] + (term > 1 && upfront ? UPFRONT_DISCOUNT : 0));
  const total = Math.round(monthly * term * (1 - pct / 100));
  return { perMonth: term ? Math.round(total / term) : monthly, total, savePct: pct, monthly };
}
// "Shaxsiy advokatim" (module 6): the backend's own 6 / 12 / prepaid-12 totals.
function personalPricing(plan: BackendPlan, term: Term, upfront: boolean) {
  const monthly = plan.monthlyPrice;
  const total = term === 12 ? (upfront ? plan.prepaidYearlyPrice : plan.yearlyPrice) || monthly * 12 : plan.sixMonthPrice || monthly * 6;
  const months = term === 12 ? 12 : 6;
  const baseline = monthly * months;
  return { perMonth: Math.round(total / months), total, savePct: baseline && total ? Math.round(((baseline - total) / baseline) * 100) : 0, months };
}
// This month's AI usage as counted by the chat (the API exposes no counter — reported).
function aiUsedThisMonth(uid: string): number {
  try {
    const d = new Date();
    return parseInt(localStorage.getItem(`lexgo_ai_used_${uid || "anon"}_${d.getFullYear()}-${d.getMonth() + 1}`) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

export default function PlansPanel({ variant = "all" }: { variant?: Variant }) {
  const t = useTranslations("plans");
  const ts = useTranslations("subscription");
  const tcommon = useTranslations("common");
  const tp = useTranslations("portal.common");
  const locale = useLocale();
  const { session } = useAuth();
  const personal = variant === "personal";
  const isSeller = session?.role === "lawyer" || session?.role === "advocate";
  const sellerPct = isSeller && session?.accountStatus !== "pending" ? SELLER_DISCOUNT : 0;
  const res = useResource<BackendPlan>(() => getSubscriptionPlans(locale), [locale]);
  const payments = useResource(listPayments, []);
  const [aiTerm, setAiTerm] = useState<Term>(1);
  const [aiUpfront, setAiUpfront] = useState(false);
  const [term, setTerm] = useState<6 | 12>(6);
  const [upfront, setUpfront] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [aiUsed, setAiUsed] = useState(0);
  useEffect(() => { const h = setTimeout(() => setAiUsed(aiUsedThisMonth(session?.id ?? "")), 0); return () => clearTimeout(h); }, [session?.id]);

  const bills = payments.data.filter((p) => !p.kind || p.kind === "subscription");
  const active = res.data.filter((p) => p.isActive !== false);
  const aiPlans = active.filter((p) => AI_SLUG.test(p.slug)).sort((a, b) => a.monthlyPrice - b.monthlyPrice);
  const personalPlans = active.filter((p) => p.audience === "personal" && p.billingType !== "gift").sort((a, b) => a.sortOrder - b.sortOrder || a.monthlyPrice - b.monthlyPrice);
  const giftPlan = active.find((p) => p.billingType === "gift");
  const planName = (plan: BackendPlan) => plan.name;

  // Back from the checkout page may restore this page from the bfcache with the
  // button still busy (it stays busy while the browser navigates away).
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setBusy(null);
      setMsg(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function choose(plan: BackendPlan, total: number, period: string) {
    if (busy) return;
    setBusy(plan.id);
    setMsg(null);
    setIntent(null);
    let leaving = false; // stay busy while the browser opens the checkout
    try {
      if (!isDemoCheckout()) {
        if (!total) {
          setMsg({ ok: false, text: t("purchaseError") });
          return;
        }
        setIntent(await createCheckout({ kind: "subscription_plan", planId: plan.id, amount: total, payload: { billing_period: period, title: planName(plan) } }));
        return;
      }
      const r = await demoPlanPurchase(plan.id, { billing_period: period });
      if (r.paymentUrl) {
        leaving = true;
        setMsg({ ok: true, text: t("payRedirect") });
        window.location.assign(r.paymentUrl);
      } else {
        setMsg({ ok: true, text: t("activated", { plan: planName(plan) }) });
      }
    } catch (e) {
      setMsg({ ok: false, text: isProviderUnavailable(e) || isDemoUnavailable(e) ? tcommon("paymentUnavailable") : t("purchaseError") });
    } finally {
      if (!leaving) setBusy(null);
    }
  }

  const loading = res.status === "loading";
  const failed = res.status === "error";

  return (
    <div className="subs">
      {msg ? <div className={`plans__toast${msg.ok ? "" : " plans__toast--err"}`}>{msg.text}</div> : null}
      {intent ? <div className="ppanel" style={{ marginBottom: 16 }}><CheckoutIntent intent={intent} onCancel={() => setIntent(null)} /></div> : null}

      {/* ── LexGo.AI: Free / Lite / Pro ─────────────────────────────── */}
      <div className="plans__head">
        <div>
          <h2 className="psec-h"><IconSparkle style={{ width: 20, height: 20, verticalAlign: "-3px", marginRight: 8 }} />{t("ai.title")}</h2>
          <p className="plans__sub">{sellerPct ? t("ai.subtitleSeller", { pct: sellerPct }) : t("ai.subtitle")}</p>
        </div>
        <div className="switch switch--sm" role="group" aria-label={t("ai.term")}>
          {([1, 3, 6, 12] as Term[]).map((m) => (
            <button key={m} type="button" aria-pressed={aiTerm === m} onClick={() => setAiTerm(m)}>{t(`ai.term${m}`)}{TERM_DISCOUNT[m] ? <small> −{TERM_DISCOUNT[m]}%</small> : null}</button>
          ))}
        </div>
      </div>
      {aiTerm > 1 ? (
        <label className="chkline">
          <input type="checkbox" checked={aiUpfront} onChange={(e) => setAiUpfront(e.target.checked)} />
          {t("ai.upfront", { pct: UPFRONT_DISCOUNT, max: MAX_DISCOUNT })}
        </label>
      ) : null}
      {loading ? (
        <Skeleton rows={3} />
      ) : failed ? (
        <EmptyState icon={<IconCard />} title={tp("loadError")} text={tp("loadErrorText")} />
      ) : !aiPlans.length ? (
        <EmptyState icon={<IconSparkle />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="plans__grid">
          {aiPlans.map((plan, i) => {
            const pr = aiPricing(plan, aiTerm, aiUpfront, sellerPct);
            const limit = Number(plan.entitlements?.ai_requests ?? 0) || (i === 0 ? 5 : i === 1 ? 100 : 1000);
            const featured = i === 2;
            return (
              <div key={plan.id} className={`splan${featured ? " splan--feat" : ""}`}>
                <div className="splan__h">
                  <b className="splan__name">{planName(plan)}</b>
                  {pr.savePct > 0 && plan.monthlyPrice > 0 ? <span className="splan__save">−{pr.savePct}%</span> : null}
                  {sellerPct && plan.monthlyPrice > 0 ? <span className="splan__save">−{sellerPct}%</span> : null}
                </div>
                <div className="splan__price">
                  {plan.monthlyPrice === 0 ? (
                    <b>{t("freeLabel")}</b>
                  ) : (
                    <>
                      <b>{som(pr.perMonth)}</b>
                      <span>{t("perMonth")}</span>
                      {sellerPct ? <s className="splan__was">{som(plan.monthlyPrice)}</s> : null}
                    </>
                  )}
                </div>
                {plan.monthlyPrice > 0 && aiTerm > 1 ? (
                  <p className="splan__total">{t("totalNote", { term: aiTerm, total: som(pr.total) })}</p>
                ) : null}
                {i === 0 ? <p className="splan__usage">{t("ai.usage", { used: Math.min(aiUsed, limit), limit })}</p> : null}
                <ul className="splan__feats">
                  {(plan.features ?? []).map((f, k) => (
                    <li key={k}><IconCheck />{f}</li>
                  ))}
                </ul>
                {plan.monthlyPrice === 0 ? (
                  <span className="btn btn--line btn--full" aria-disabled>{t("ai.included")}</span>
                ) : (
                  <button
                    type="button"
                    className={`btn ${featured ? "btn--grad" : "btn--line"} btn--full`}
                    disabled={busy === plan.id}
                    onClick={() => choose(plan, pr.total, billingPeriod(aiTerm, aiUpfront))}
                  >
                    {busy === plan.id ? t("processing") : t("choose")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="plans__sub" style={{ marginTop: 10 }}>{t("ai.rules")}</p>

      {/* ── Shaxsiy advokatim: Standart / Premium (clients only) ────── */}
      {personal ? (
        <>
          <div className="plans__head" style={{ marginTop: 34 }}>
            <div>
              <h2 className="psec-h"><IconShieldCheck style={{ width: 20, height: 20, verticalAlign: "-3px", marginRight: 8 }} />{t("personal.title")}</h2>
              <p className="plans__sub">{t("subtitlePersonal")}</p>
            </div>
            <div className="switch switch--sm" role="group">
              <button type="button" aria-pressed={term === 6} onClick={() => setTerm(6)}>{t("term6")}</button>
              <button type="button" aria-pressed={term === 12} onClick={() => setTerm(12)}>{t("term12")}</button>
            </div>
          </div>
          {term === 12 ? (
            <label className="chkline">
              <input type="checkbox" checked={upfront} onChange={(e) => setUpfront(e.target.checked)} />
              {t("upfront")}
            </label>
          ) : null}
          {loading ? (
            <Skeleton rows={3} />
          ) : failed ? null : !personalPlans.length ? (
            <EmptyState icon={<IconCard />} title={t("empty")} text={t("emptyText")} />
          ) : (
            <div className="plans__grid">
              {personalPlans.map((plan, i) => {
                const pr = personalPricing(plan, term, upfront);
                return (
                  <div key={plan.id} className={`splan${i === 1 ? " splan--feat" : ""}`}>
                    <div className="splan__h">
                      <b className="splan__name">{planName(plan)}</b>
                      {pr.savePct > 0 ? <span className="splan__save">−{pr.savePct}%</span> : null}
                    </div>
                    <div className="splan__price">
                      <b>{som(pr.perMonth)}</b>
                      <span>{t("perMonth")}</span>
                    </div>
                    <p className="splan__total">{t("totalNote", { term: pr.months, total: som(pr.total) })}</p>
                    <ul className="splan__feats">
                      {(plan.features ?? []).map((f, k) => (
                        <li key={k}><IconCheck />{f}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`btn ${i === 1 ? "btn--grad" : "btn--line"} btn--full`}
                      disabled={busy === plan.id}
                      onClick={() => choose(plan, pr.total, billingPeriod(term, upfront))}
                    >
                      {busy === plan.id ? t("processing") : t("choose")}
                    </button>
                  </div>
                );
              })}

              {/* Gift tariff (module 6): pay 3/6/12 months up front, send a QR link. */}
              <div className="splan splan--gift">
                <div className="splan__h">
                  <b className="splan__name">
                    <IconGift style={{ width: 16, height: 16, marginRight: 6, verticalAlign: "-2px" }} />
                    {giftPlan?.name || ts("plans.gift.name")}
                  </b>
                </div>
                <p className="splan__total">{ts("plans.gift.payNote")}</p>
                <ul className="splan__feats">
                  {(giftPlan?.features?.length ? giftPlan.features : (ts.raw("plans.gift.features") as string[])).map((f, k) => (
                    <li key={k}><IconCheck />{f}</li>
                  ))}
                </ul>
                <Link href="/portal/client/gifts" className="btn btn--line btn--full">
                  {ts("plans.gift.cta")}
                </Link>
              </div>
            </div>
          )}
          <p className="plans__sub" style={{ marginTop: 12 }}>{ts("ratingInfo")}</p>
        </>
      ) : null}

      <div className="ppanel" style={{ marginTop: 22 }}>
        <div className="ppanel__h">
          <b>{t("billing.title")}</b>
        </div>
        {payments.status === "loading" ? (
          <Skeleton rows={2} />
        ) : !bills.length ? (
          <EmptyState icon={<IconCard />} title={t("billing.empty")} text={t("billing.emptyText")} />
        ) : (
          <div className="alist">
            {bills.map((p) => (
              <div className="creq" key={p.id}>
                <span className="creq__st" />
                <div className="creq__m">
                  <b>{p.description || p.kind || "—"}</b>
                  <span>{fmtDate(p.createdAt)}</span>
                </div>
                <span className={`creq__badge${p.status === "paid" ? " creq__badge--ok" : ""}`}>
                  {som(p.amount)} {p.currency}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
