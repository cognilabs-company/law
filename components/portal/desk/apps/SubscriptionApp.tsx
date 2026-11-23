"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { fmtUzs } from "@/lib/money";
import { dateOnly } from "@/lib/date";
import { humanizeSlug } from "@/lib/lawyers";
import { isProviderUnavailable } from "@/lib/http";
import { addPaymentMethod, BILLING_PERIODS, demoPlanPurchase, getPlanQuote, getSubscriptionPlans, isProviderUnsupported, listPaymentMethods, listPayments, planForRole, type BackendPlan, type ManualDocBillingPeriod, type PlanQuote, isGiftOnlyPlan } from "@/lib/services/backend";
import { loadAutopay, planPrice, readAutopay, saveAutopay, type AutopayState } from "@/lib/services/plans";
import { isDemoCheckout, type PaymentIntent } from "@/lib/services/checkout";
import { purchasePlanVia, renewCheckout } from "@/lib/services/planCheckout";
import { PAYMENT_PROVIDER_ERRORS, PROVIDER_LIST_ERRORS, marketErrorCode } from "@/lib/services/marketplace";
import { refreshCheckoutProviders, useCheckoutProviders } from "@/lib/useCheckoutProviders";
import { openCheckoutTab, sendCheckoutTab } from "@/lib/services/clickCheckout";
import { rememberPendingPayment } from "@/lib/services/paymentProviders";
import { IconCard, IconCheck, IconCrown, IconGift, IconHistory, IconRefresh, IconSparkle } from "@/components/icons";
import { App, Banner, Btn, Check, Dialog, Empty, Field, Input, Loading, Seg, Sidebar, Tag, Toggle, Tool, Toolbar, useOs, useToast, type NavSection } from "../kit/kit";
import type { NativeProps } from "../native";
import "./subscription.css";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import PlanPurchaseTerms from "../../PlanPurchaseTerms";

// Subscription as a desktop program: the current tariff and auto-pay up
// top; the Tezkor Himoya AI plans with their terms; the other tariffs; the gift;
// the bills. Choosing a plan follows the cabinet's payment route (ATMOS,
// a checkout, or a request to the administrators in Telegram when no
// payment provider is on), shown in this window's own sheets. Every price
// is the backend's: its quote for the period, else the plan's own price for
// it — nothing here works a discount out (answers 2026-10-31 §2.5).

type Term = 1 | 6 | 12;
type Section = "ai" | "other" | "billing";
const AI_SLUG = /^lexgo-ai-(free|lite|pro)$/;
const som = (n: number) => fmtUzs(n);
const periodOf = (term: Term, upfront: boolean) => (term === 6 ? "six_month" : term === 12 ? (upfront ? "prepaid_yearly" : "yearly") : "monthly");
const asPeriod = (v: string): ManualDocBillingPeriod => (BILLING_PERIODS.includes(v as ManualDocBillingPeriod) ? (v as ManualDocBillingPeriod) : "monthly");

export default function SubscriptionApp(_props: NativeProps) {
  void _props;
  const t = useTranslations("plans");
  const ts = useTranslations("subscription");
  const ta = useTranslations("plans.autopay");
  const d = useTranslations("portal.desk.subs");
  const tc = useTranslations("checkoutTerms");
  const tm = useTranslations("marketplace.purchase");
  const locale = useLocale();
  const os = useOs();
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const role = session?.role ?? "client";
  const [plans, setPlans] = useState<BackendPlan[] | null>(null);
  const [bills, setBills] = useState<Awaited<ReturnType<typeof listPayments>> | null>(null);
  const [cards, setCards] = useState<Awaited<ReturnType<typeof listPaymentMethods>>>([]);
  const [quotes, setQuotes] = useState<ReadonlyMap<string, PlanQuote>>(new Map());
  const [autopay, setAutopay] = useState<AutopayState | null>(null);
  const [section, setSection] = useState<Section>("ai");
  const [term, setTerm] = useState<Term>(1);
  const [upfront, setUpfront] = useState(false);
  const [busy, setBusy] = useState("");
  const once = useSameTickGuard();
  const [intent, setIntent] = useState<PayIntent | null>(null);
  // Click or ATMOS, as the backend has them on (2026-11-21 contract §1).
  const pays = useCheckoutProviders();
  const [payPick, setPayPick] = useState("");
  const payOptions = pays.options.map((o) => ({ id: o.provider, label: o.label || (o.provider === "atmos" ? "ATMOS" : "Click") }));
  const payVia = payOptions.some((o) => o.id === payPick) ? payPick : payOptions.some((o) => o.id === "click") ? "click" : (payOptions[0]?.id ?? "");
  const [bind, setBind] = useState(false);
  // "Choose" opens the terms first (amount now, renewal and its price, the
  // refund rules); only "Pay" there starts the purchase.
  const [review, setReview] = useState<{ plan: BackendPlan; total: number; listed: number; period: string } | null>(null);
  const [renew, setRenew] = useState(false);
  const [tick, setTick] = useState(0);
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    getSubscriptionPlans(locale)
      .then((l) => alive && setPlans(l))
      .catch(() => alive && setPlans([]));
    listPayments()
      .then((l) => alive && setBills(l))
      .catch(() => alive && setBills([]));
    listPaymentMethods()
      .then((l) => alive && setCards(l))
      .catch(() => undefined);
    if (uid)
      loadAutopay(uid)
        .then((s) => alive && setAutopay(s))
        .catch(() => alive && setAutopay({ subscription: null, enabled: readAutopay(uid), source: "local" }));
    return () => {
      alive = false;
    };
  }, [locale, uid, role, tick]);

  const roleKey = role === "lawyer" ? "yurist" : role === "advocate" ? "advokat" : role;
  const all = useMemo(() => (plans ?? []).filter((p) => p.isActive !== false), [plans]);
  // Only a gift-only plan stays off the self-purchase list (TSK-342697).
  const isGift = isGiftOnlyPlan;
  const mine = (p: BackendPlan) => ((p.targetRoles?.length ? p.targetRoles.includes(roleKey) : planForRole(p, role)) ? 0 : 1);
  const sellable = all.filter((p) => !isGift(p)).sort((a, b) => mine(a) - mine(b) || a.sortOrder - b.sortOrder || a.monthlyPrice - b.monthlyPrice);
  const ai = sellable.filter((p) => AI_SLUG.test(p.slug));
  const other = sellable.filter((p) => !AI_SLUG.test(p.slug));
  const gift = all.find(isGift);
  const current = autopay?.subscription?.planName || "";
  const card = cards.find((c) => c.isDefault) ?? cards[0];
  const subBills = (bills ?? []).filter((p) => !p.kind || p.kind === "subscription" || p.kind === "subscription_plan");
  // The backend's quote for each paid Tezkor Himoya AI plan in the chosen period.
  const aiPeriod = asPeriod(periodOf(term, upfront));
  const quoteIds = ai.filter((p) => p.monthlyPrice > 0).map((p) => p.id).join(",");
  useEffect(() => {
    if (!quoteIds) return;
    let alive = true;
    void Promise.all(quoteIds.split(",").map((id) => getPlanQuote(id, aiPeriod).then((q) => [`${id}|${aiPeriod}`, q] as const, () => null))).then((rows) => {
      if (!alive) return;
      setQuotes((cur) => {
        const next = new Map(cur);
        for (const r of rows) if (r) next.set(r[0], r[1]);
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [quoteIds, aiPeriod]);
  const aiPrice = (p: BackendPlan) => {
    const q = quotes.get(`${p.id}|${aiPeriod}`);
    const months = q?.months || term;
    const total = q ? q.amount : planPrice(p, aiPeriod);
    const before = q ? q.baseAmount : total;
    const base = p.monthlyPrice * months;
    return { per: months ? Math.round(total / months) : total, total, save: months > 1 && base && before && before < base ? Math.round(((base - before) / base) * 100) : 0, months, promo: q && q.discountAmount > 0 ? q.discountAmount : 0, listed: before };
  };

  function openReview(plan: BackendPlan, total: number, period: string, listed = total) {
    if (busy) return;
    setRenew(autopay?.enabled ?? false);
    setReview({ plan, total, listed, period });
  }

  async function choose(plan: BackendPlan, total: number, period: string, autoRenew: boolean) {
    if (busy || !once()) return;
    setBusy(plan.id);
    try {
      if (isDemoCheckout()) {
        const r = await demoPlanPurchase(plan.id, { billing_period: period });
        if (r.paymentUrl) window.open(r.paymentUrl, "_blank", "noopener");
        else say(t("activated", { plan: plan.name }));
        return;
      }
      // POST /subscription-plans/{id}/purchase with Click or ATMOS; the plan
      // is active when the provider confirms (§1.2), or at once when free.
      const r = await purchasePlanVia(plan.id, { billingPeriod: period, provider: payVia, autoRenew });
      if (r.approved) {
        say(t("activated", { plan: plan.name }));
        setTick((n) => n + 1);
        return;
      }
      setIntent({ id: r.paymentId, status: r.payment?.status || "pending", amount: r.amount || total, currency: "UZS", paymentUrl: r.paymentUrl || undefined, provider: r.provider || payVia });
    } catch (e) {
      const code = marketErrorCode(e);
      if (PROVIDER_LIST_ERRORS.includes(code)) refreshCheckoutProviders();
      const alt = payOptions.find((o) => o.id !== payVia);
      if (alt && (isProviderUnavailable(e) || isProviderUnsupported(e) || PAYMENT_PROVIDER_ERRORS.includes(code))) {
        setPayPick(alt.id);
        say(t("providerOff", { provider: payOptions.find((o) => o.id === payVia)?.label ?? payVia, other: alt.label }), "err");
      } else say(t("purchaseError"), "err");
    } finally {
      setBusy("");
      setReview(null);
    }
  }
  async function toggleAutopay(on: boolean) {
    if (!autopay) return;
    setAutopay({ ...autopay, enabled: on });
    try {
      const source = await saveAutopay(uid, on, autopay.subscription?.id);
      setAutopay((s) => (s ? { ...s, enabled: on, source } : s));
      say(ta("saved"));
    } catch {
      setAutopay((s) => (s ? { ...s, enabled: !on } : s));
      say(ta("saveError"), "err");
    }
  }

  const sections: NavSection[] = [
    {
      id: "s",
      title: os === "mac" ? d("sections") : undefined,
      items: [
        { id: "ai", label: t("ai.title"), icon: <IconSparkle /> },
        { id: "other", label: t("otherTitle"), icon: <IconCrown /> },
        { id: "billing", label: t("billing.title"), icon: <IconHistory />, count: subBills.length || undefined },
      ],
    },
  ];
  const planCard = (plan: BackendPlan, price: { per: number; total: number; save: number; months: number; promo?: number; listed?: number }, featured: boolean) => {
    const isCur = !!current && plan.name === current;
    const free = plan.monthlyPrice === 0;
    const limit = Number(plan.entitlements?.ai_requests ?? 0) || 0;
    return (
      <article key={plan.id} className={`dxs2-plan${featured ? " is-feat" : ""}${isCur ? " is-cur" : ""}`}>
        {isCur ? <Tag tone="ok">{t("current")}</Tag> : featured ? <Tag tone="accent">{t("recommended")}</Tag> : <span />}
        <h3>{plan.name}</h3>
        <div className="dxs2-price">
          {free ? (
            <b>{t("freeLabel")}</b>
          ) : (
            <>
              <b>{som(price.per)}</b>
              <span>{t("perMonth")}</span>
            </>
          )}
        </div>
        {!free && price.months > 1 ? <small className="dxs2-total">{t("totalNote", { term: price.months, total: som(price.total) })}</small> : null}
        {price.save > 0 && !free ? <Tag tone="ok">−{price.save}%</Tag> : null}
        {price.promo && !free ? <Tag tone="accent">{t("promo.chip", { amount: som(price.promo) })}</Tag> : null}
        {limit ? <small className="dxs2-total">{d("requests", { n: limit })}</small> : null}
        <ul>
          {(plan.features ?? []).map((f, k) => (
            <li key={k}>
              <IconCheck aria-hidden />
              {f}
            </li>
          ))}
        </ul>
        {isCur ? (
          <Btn disabled icon={<IconCheck />}>
            {t("current")}
          </Btn>
        ) : free ? (
          <Btn disabled>{t("ai.included")}</Btn>
        ) : (
          <Btn kind={featured ? "primary" : "default"} icon={featured ? <IconCrown /> : undefined} busy={busy === plan.id} onClick={() => openReview(plan, price.total, AI_SLUG.test(plan.slug) ? periodOf(term, upfront) : periodOf(term === 12 ? 12 : 6, upfront), price.listed ?? price.total)}>
            {t("choose")}
          </Btn>
        )}
      </article>
    );
  };

  return (
    <App name="subs" sidebar={<Sidebar label={t("ai.title")} sections={sections} value={section} onChange={(s) => setSection(s as Section)} />}>
      <Toolbar title={section === "ai" ? t("ai.title") : section === "other" ? t("otherTitle") : t("billing.title")} subtitle={section === "ai" ? t("ai.subtitle") : section === "other" ? t("otherSubtitle") : undefined}>
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      <div className="dxs2 dx-scroll">
        <section className="dxs2-top">
          <div>
            <small>{ta("currentTariff")}</small>
            <b>{autopay?.subscription?.planName || ta("none")}</b>
          </div>
          <div>
            <small>{ta("nextCharge")}</small>
            <b>{autopay?.subscription?.renewsAt ? dateOnly(autopay.subscription.renewsAt, locale) : "—"}</b>
          </div>
          <div>
            <small>{ta("card")}</small>
            <b>{card ? `${card.brand.toUpperCase()} •••• ${card.last4}` : ta("noCard")}</b>
          </div>
          <label className="dxs2-auto">
            <span>
              <b>{ta("toggle")}</b>
              {autopay?.source === "local" ? <small>{ta("localNote")}</small> : null}
            </span>
            <Toggle checked={!!autopay?.enabled} disabled={!autopay} onChange={(v) => void toggleAutopay(v)} label={ta("toggle")} onText={ta("on")} offText={ta("off")} />
          </label>
          <Btn small icon={<IconCard />} onClick={() => setBind(true)}>
            {ta("bindCard")}
          </Btn>
        </section>
        {plans === null ? (
          <Loading label={d("loading")} />
        ) : section === "ai" ? (
          <>
            <div className="dxs2-terms">
              <Seg label={d("term")} value={String(term) as "1"} onChange={(v) => setTerm(Number(v) as Term)} items={(["1", "6", "12"] as const).map((m) => ({ id: m, label: d("months", { n: Number(m) }) }))} />
              {term === 12 ? (
                <Check checked={upfront} onChange={setUpfront} label={t("ai.upfrontPlain")}>
                  {t("ai.upfrontPlain")}
                </Check>
              ) : null}
            </div>
            {ai.length ? (
              <div className="dxs2-plans">
                {ai.map((p, i) => {
                  const feat = ai.some((x) => x.slug === "lexgo-ai-pro") ? p.slug === "lexgo-ai-pro" : i === ai.length - 1;
                  return planCard(p, aiPrice(p), feat);
                })}
              </div>
            ) : (
              <Empty icon={<IconSparkle />} title={t("empty")} text={t("emptyText")} />
            )}
            <p className="dxs2-note">{t("ai.rules")}</p>
          </>
        ) : section === "other" ? (
          <>
            <div className="dxs2-terms">
              <Seg label={d("term")} value={String(term === 12 ? 12 : 6) as "6"} onChange={(v) => setTerm(Number(v) as Term)} items={[{ id: "6", label: d("months", { n: 6 }) }, { id: "12", label: d("months", { n: 12 }) }]} />
              {term === 12 ? (
                <Check checked={upfront} onChange={setUpfront} label={t("upfront")}>
                  {t("upfront")}
                </Check>
              ) : null}
            </div>
            <div className="dxs2-plans">
              {other.map((p, i) => {
                const months = term === 12 ? 12 : 6;
                const total = months === 12 ? (upfront ? p.prepaidYearlyPrice : p.yearlyPrice) || p.monthlyPrice * 12 : p.sixMonthPrice || p.monthlyPrice * 6;
                const base = p.monthlyPrice * months;
                return planCard(p, { per: Math.round(total / months), total, save: base && total ? Math.round(((base - total) / base) * 100) : 0, months }, i === 1);
              })}
              <article className="dxs2-plan is-gift">
                <Tag tone="accent">
                  <IconGift aria-hidden />
                </Tag>
                <h3>{gift?.name || ts("plans.gift.name")}</h3>
                <small className="dxs2-total">{ts("plans.gift.payNote")}</small>
                <ul>
                  {(gift?.features?.length ? gift.features : (ts.raw("plans.gift.features") as string[])).map((f, k) => (
                    <li key={k}>
                      <IconCheck aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
            <p className="dxs2-note">{ts("ratingInfo")}</p>
          </>
        ) : !subBills.length ? (
          <Empty icon={<IconHistory />} title={t("billing.empty")} text={t("billing.emptyText")} />
        ) : (
          <div className="dxs2-bills">
            {subBills.map((p) => (
              <div key={p.id}>
                <span>
                  <b>{p.description || humanizeSlug(p.kind) || "—"}</b>
                  <small>{dateOnly(p.createdAt, locale)}</small>
                </span>
                <Tag tone={p.status === "paid" ? "ok" : "neutral"}>
                  {som(p.amount)} {p.currency}
                </Tag>
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog
        open={!!review}
        title={tc("title")}
        width={520}
        onClose={() => (busy ? undefined : setReview(null))}
        onSubmit={() => review && void choose(review.plan, review.total, review.period, renew)}
        actions={
          <>
            <Btn onClick={() => setReview(null)} disabled={!!busy}>
              {tc("back")}
            </Btn>
            <Btn kind="primary" type="submit" busy={!!busy}>
              {review ? tc("pay", { amount: som(review.total) }) : ""}
            </Btn>
          </>
        }
      >
        {review && payOptions.length > 1 ? (
          <Field label={tm("providerTitle")}>
            <Seg label={tm("providerTitle")} value={payVia} onChange={setPayPick} items={payOptions} />
          </Field>
        ) : null}
        {review ? (
          <PlanPurchaseTerms
            purchase={{ planName: review.plan.name, period: review.period, total: review.total, listed: review.listed }}
            autoRenew={renew}
            onAutoRenew={setRenew}
            check={(checked, onChange, label) => (
              <Check checked={checked} onChange={onChange} label={label}>
                {label}
              </Check>
            )}
          />
        ) : null}
      </Dialog>
      <PaySheet intent={intent} onClose={() => setIntent(null)} />
      <BindCard open={bind} onClose={() => setBind(false)} onDone={() => (setBind(false), setTick((n) => n + 1))} />
      {toast}
    </App>
  );
}

// The plan's payment: its amount and state, and the Click or ATMOS page —
// opened from the press itself, in a new tab. With no link (the provider was
// down for a moment) a fresh one is asked for first (2026-11-21 §1.2).
type PayIntent = PaymentIntent & { provider?: string };
function PaySheet({ intent, onClose }: { intent: PayIntent | null; onClose: () => void }) {
  const t = useTranslations("portal.payment");
  const st = (intent?.status || "pending").toLowerCase();
  const [renewing, setRenewing] = useState(false);
  const [failed, setFailed] = useState(false);
  async function proceed() {
    if (!intent || renewing) return;
    const tab = openCheckoutTab();
    const go = (url: string) => sendCheckoutTab(tab, url, () => rememberPendingPayment({ id: intent.id, amount: intent.amount }));
    if (intent.paymentUrl) return void go(intent.paymentUrl);
    if (!intent.id) return void tab?.close();
    setRenewing(true);
    setFailed(false);
    try {
      const url = await renewCheckout(intent.provider || "click", intent.id);
      if (url) go(url);
      else {
        tab?.close();
        setFailed(true);
      }
    } catch {
      tab?.close();
      setFailed(true);
    } finally {
      setRenewing(false);
    }
  }
  return (
    <Dialog
      open={!!intent}
      title={t("intentTitle")}
      onClose={onClose}
      onSubmit={() => void proceed()}
      width={420}
      actions={
        <>
          <Btn onClick={onClose}>{t("cancel")}</Btn>
          <Btn kind="primary" type="submit" busy={renewing} disabled={!intent?.paymentUrl && !intent?.id}>
            {t("proceed")}
          </Btn>
        </>
      }
    >
      <dl className="dxs2-sum">
        <div>
          <dt>{t("intentAmount")}</dt>
          <dd>
            {fmtUzs(intent?.amount ?? 0)} {t("som")}
          </dd>
        </div>
        <div>
          <dt>{t("intentStatus")}</dt>
          <dd>{t.has(`intentStates.${st}`) ? t(`intentStates.${st}`) : humanizeSlug(st)}</dd>
        </div>
      </dl>
      {failed || (!intent?.paymentUrl && !intent?.id) ? <Banner tone="err" title={t("noLink")} /> : null}
    </Dialog>
  );
}

function BindCard({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const ta = useTranslations("plans.autopay");
  const d = useTranslations("portal.desk.subs");
  const tc = useTranslations("portal.client.profile");
  const [brand, setBrand] = useState("uzcard");
  const [last4, setLast4] = useState("");
  const [exp, setExp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!/^\d{4}$/.test(last4)) return setErr(tc("last4Invalid"));
    setBusy(true);
    setErr("");
    try {
      await addPaymentMethod({ brand, last4, expires: exp.trim() || undefined, is_default: true });
      onDone();
    } catch {
      setErr(tc("notify.saveFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} title={ta("bindTitle")} onClose={() => !busy && onClose()} onSubmit={() => void save()} width={420} actions={<><Btn onClick={onClose}>{d("cancel")}</Btn><Btn kind="primary" type="submit" busy={busy}>{tc("save")}</Btn></>}>
      <p className="dx-dlg__text">{ta("bindNote")}</p>
      <Field label={tc("cardBrand")}>
        <Seg label={tc("cardBrand")} value={brand} onChange={setBrand} items={["uzcard", "humo", "visa", "mastercard"].map((b) => ({ id: b, label: b.toUpperCase() }))} />
      </Field>
      <div className="dxs2-form2">
        <Field label={tc("cardLast4")}>
          <Input value={last4} onChange={(v) => setLast4(v.replace(/\D/g, "").slice(0, 4))} placeholder="1234" />
        </Field>
        <Field label={tc("cardExpires")}>
          <Input value={exp} onChange={(v) => setExp(v.replace(/[^\d/]/g, "").slice(0, 5))} placeholder="MM/YY" />
        </Field>
      </div>
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}
