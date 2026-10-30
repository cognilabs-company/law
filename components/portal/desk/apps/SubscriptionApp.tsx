"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { fmtUzs } from "@/lib/money";
import { dateOnly } from "@/lib/date";
import { humanizeSlug } from "@/lib/lawyers";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { addPaymentMethod, BILLING_PERIODS, demoPlanPurchase, getSellerCabinet, getSubscriptionPlans, isAtmosCheckout, isProviderUnsupported, listPaymentMethods, listPayments, planForRole, purchasePlan, refusedBillingPeriods, requestPlanTelegramPurchase, type BackendPlan, type ManualDocBillingPeriod, isGiftOnlyPlan } from "@/lib/services/backend";
import { loadAutopay, readAutopay, saveAutopay, type AutopayState } from "@/lib/services/plans";
import { createCheckout, isDemoCheckout, type PaymentIntent } from "@/lib/services/checkout";
import { IconCard, IconCheck, IconCrown, IconGift, IconHistory, IconRefresh, IconSparkle } from "@/components/icons";
import { App, Banner, Btn, Check, Dialog, Empty, Field, Input, Loading, Seg, Sidebar, Tag, Toggle, Tool, Toolbar, useOs, useToast, type NavSection } from "../kit/kit";
import type { NativeProps } from "../native";
import "./subscription.css";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

// Subscription as a desktop program: the current tariff and auto-pay up
// top; the LexGo.AI plans with their terms; the other tariffs; the gift;
// the bills. Choosing a plan follows the cabinet's payment route (ATMOS,
// a checkout, or a request to the administrators in Telegram when no
// payment provider is on), shown in this window's own sheets.

type Term = 1 | 3 | 6 | 12;
type Section = "ai" | "other" | "billing";
const AI_SLUG = /^lexgo-ai-(free|lite|pro)$/;
const AI_LIMIT: Record<string, number> = { "lexgo-ai-free": 5, "lexgo-ai-lite": 100, "lexgo-ai-pro": 1000 };
const TERM_OFF: Record<Term, number> = { 1: 0, 3: 5, 6: 10, 12: 15 };
const UPFRONT = 5;
const MAX_OFF = 20;
const SELLER_OFF = 50;
const som = (n: number) => fmtUzs(n);
const periodOf = (term: Term, upfront: boolean) => (term === 6 ? "six_month" : term === 12 ? (upfront ? "prepaid_yearly" : "yearly") : "monthly");
const asPeriod = (v: string): ManualDocBillingPeriod => (BILLING_PERIODS.includes(v as ManualDocBillingPeriod) ? (v as ManualDocBillingPeriod) : "monthly");

export default function SubscriptionApp(_props: NativeProps) {
  void _props;
  const t = useTranslations("plans");
  const ts = useTranslations("subscription");
  const ta = useTranslations("plans.autopay");
  const d = useTranslations("portal.desk.subs");
  const locale = useLocale();
  const os = useOs();
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const role = session?.role ?? "client";
  const [plans, setPlans] = useState<BackendPlan[] | null>(null);
  const [bills, setBills] = useState<Awaited<ReturnType<typeof listPayments>> | null>(null);
  const [cards, setCards] = useState<Awaited<ReturnType<typeof listPaymentMethods>>>([]);
  const [verified, setVerified] = useState(false);
  const [autopay, setAutopay] = useState<AutopayState | null>(null);
  const [section, setSection] = useState<Section>("ai");
  const [term, setTerm] = useState<Term>(1);
  const [upfront, setUpfront] = useState(false);
  const [busy, setBusy] = useState("");
  const once = useSameTickGuard();
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [tg, setTg] = useState<{ plan: BackendPlan; period: ManualDocBillingPeriod } | null>(null);
  const [bind, setBind] = useState(false);
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
    if (role === "advocate" || role === "lawyer")
      getSellerCabinet()
        .then((c) => alive && setVerified(c.verification.verified))
        .catch(() => undefined);
    if (uid)
      loadAutopay(uid)
        .then((s) => alive && setAutopay(s))
        .catch(() => alive && setAutopay({ subscription: null, enabled: readAutopay(uid), source: "local" }));
    return () => {
      alive = false;
    };
  }, [locale, uid, role, tick]);

  const seller = verified ? SELLER_OFF : 0;
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

  async function choose(plan: BackendPlan, total: number, period: string) {
    if (busy || !once()) return;
    setBusy(plan.id);
    try {
      if (isAtmosCheckout()) {
        const r = await purchasePlan(plan.id, { billing_period: period });
        if (r.paymentUrl) window.open(r.paymentUrl, "_blank", "noopener");
        else say(t("activated", { plan: plan.name }));
        return;
      }
      if (!isDemoCheckout()) {
        if (!total) return say(t("purchaseError"), "err");
        setIntent(await createCheckout({ kind: "subscription_plan", planId: plan.id, amount: total, payload: { billing_period: period, title: plan.name } }));
        return;
      }
      const r = await demoPlanPurchase(plan.id, { billing_period: period });
      if (r.paymentUrl) window.open(r.paymentUrl, "_blank", "noopener");
      else say(t("activated", { plan: plan.name }));
    } catch (e) {
      if (isProviderUnavailable(e) || isProviderUnsupported(e) || isDemoUnavailable(e)) setTg({ plan, period: asPeriod(period) });
      else say(t("purchaseError"), "err");
    } finally {
      setBusy("");
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
  const planCard = (plan: BackendPlan, price: { per: number; total: number; save: number; months: number }, featured: boolean) => {
    const isCur = !!current && plan.name === current;
    const free = plan.monthlyPrice === 0;
    const limit = Number(plan.entitlements?.ai_requests ?? 0) || AI_LIMIT[plan.slug] || 0;
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
              {seller && AI_SLUG.test(plan.slug) ? <s>{som(plan.monthlyPrice)}</s> : null}
            </>
          )}
        </div>
        {!free && price.months > 1 ? <small className="dxs2-total">{t("totalNote", { term: price.months, total: som(price.total) })}</small> : null}
        {price.save > 0 && !free ? <Tag tone="ok">−{price.save}%</Tag> : null}
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
          <Btn kind={featured ? "primary" : "default"} icon={featured ? <IconCrown /> : undefined} busy={busy === plan.id} onClick={() => void choose(plan, price.total, AI_SLUG.test(plan.slug) ? periodOf(term, upfront) : periodOf(term === 12 ? 12 : 6, upfront))}>
            {t("choose")}
          </Btn>
        )}
      </article>
    );
  };

  return (
    <App name="subs" sidebar={<Sidebar label={t("ai.title")} sections={sections} value={section} onChange={(s) => setSection(s as Section)} />}>
      <Toolbar title={section === "ai" ? t("ai.title") : section === "other" ? t("otherTitle") : t("billing.title")} subtitle={section === "ai" ? (seller ? t("ai.subtitleSeller", { pct: seller }) : t("ai.subtitle")) : section === "other" ? t("otherSubtitle") : undefined}>
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
              <Seg label={d("term")} value={String(term) as "1"} onChange={(v) => setTerm(Number(v) as Term)} items={(["1", "3", "6", "12"] as const).map((m) => ({ id: m, label: d("months", { n: Number(m) }) }))} />
              {term > 1 ? (
                <Check checked={upfront} onChange={setUpfront} label={t("ai.upfront", { pct: UPFRONT, max: MAX_OFF })}>
                  {t("ai.upfront", { pct: UPFRONT, max: MAX_OFF })}
                </Check>
              ) : null}
            </div>
            {ai.length ? (
              <div className="dxs2-plans">
                {ai.map((p, i) => {
                  const monthly = Math.round(p.monthlyPrice * (1 - seller / 100));
                  const pct = Math.min(MAX_OFF, TERM_OFF[term] + (term > 1 && upfront ? UPFRONT : 0));
                  const total = Math.round(monthly * term * (1 - pct / 100));
                  const feat = ai.some((x) => x.slug === "lexgo-ai-pro") ? p.slug === "lexgo-ai-pro" : i === ai.length - 1;
                  return planCard(p, { per: term ? Math.round(total / term) : monthly, total, save: pct, months: term }, feat);
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
      <PaySheet intent={intent} onClose={() => setIntent(null)} />
      {tg ? <TelegramRequest target={tg} onClose={() => setTg(null)} onSent={() => setTick((n) => n + 1)} /> : null}
      <BindCard open={bind} onClose={() => setBind(false)} onDone={() => (setBind(false), setTick((n) => n + 1))} />
      {toast}
    </App>
  );
}

function PaySheet({ intent, onClose }: { intent: PaymentIntent | null; onClose: () => void }) {
  const t = useTranslations("portal.payment");
  const st = (intent?.status || "pending").toLowerCase();
  return (
    <Dialog
      open={!!intent}
      title={t("intentTitle")}
      onClose={onClose}
      onSubmit={() => intent?.paymentUrl && window.open(intent.paymentUrl, "_blank", "noopener")}
      width={420}
      actions={
        <>
          <Btn onClick={onClose}>{t("cancel")}</Btn>
          <Btn kind="primary" type="submit" disabled={!intent?.paymentUrl}>
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
      {!intent?.paymentUrl ? <Banner tone="err" title={t("noLink")} /> : null}
    </Dialog>
  );
}

function TelegramRequest({ target, onClose, onSent }: { target: { plan: BackendPlan; period: ManualDocBillingPeriod }; onClose: () => void; onSent: () => void }) {
  const t = useTranslations("plans.telegram");
  const d = useTranslations("portal.desk.subs");
  const tdoc = useTranslations("portal.client.documents");
  const { plan } = target;
  const [period, setPeriod] = useState<ManualDocBillingPeriod>(target.period);
  const [only, setOnly] = useState<ManualDocBillingPeriod[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [warn, setWarn] = useState("");
  const allowed = plan.allowedBillingPeriods?.length ? BILLING_PERIODS.filter((p) => plan.allowedBillingPeriods.includes(p)) : BILLING_PERIODS;
  const periods = only ?? (allowed.length ? allowed : BILLING_PERIODS);
  const eff = periods.includes(period) ? period : periods[0];
  const price = eff === "six_month" ? plan.sixMonthPrice || plan.monthlyPrice * 6 : eff === "yearly" ? plan.yearlyPrice || plan.monthlyPrice * 12 : eff === "prepaid_yearly" ? plan.prepaidYearlyPrice || plan.yearlyPrice || plan.monthlyPrice * 12 : plan.monthlyPrice;
  async function submit() {
    if (sent) return onClose();
    setBusy(true);
    setWarn("");
    try {
      const r = await requestPlanTelegramPurchase(plan.id, eff);
      setSent(r.workId || "✓");
      onSent();
      if (r.telegramSent === false || (r.telegramDelivered === 0 && r.telegramFailed > 0)) setWarn(t("notDelivered"));
    } catch (e) {
      const refused = refusedBillingPeriods(e);
      if (refused.length) {
        setOnly(refused);
        setPeriod(refused[0]);
        setWarn(t("periodRefused"));
      } else setWarn(t("error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open title={t("title")} onClose={onClose} onSubmit={() => void submit()} width={460} actions={sent ? <Btn kind="primary" type="submit">{d("ok")}</Btn> : <><Btn onClick={onClose}>{d("cancel")}</Btn><Btn kind="primary" type="submit" busy={busy}>{t("submit")}</Btn></>}>
      {sent ? (
        <>
          <Banner tone="ok" title={t("sent")}>
            {t("sentLead")}
          </Banner>
          {sent !== "✓" ? <code>{sent}</code> : null}
        </>
      ) : (
        <>
          <p className="dx-dlg__text">{t("lead", { plan: plan.name })}</p>
          <Field label={t("period")}>
            <Seg label={t("period")} value={eff} onChange={setPeriod} items={periods.map((p) => ({ id: p, label: tdoc.has(`period_${p}`) ? tdoc(`period_${p}`) : p }))} />
          </Field>
          <dl className="dxs2-sum">
            <div>
              <dt>{t("amount")}</dt>
              <dd>{fmtUzs(price)}</dd>
            </div>
          </dl>
        </>
      )}
      {warn ? <Banner tone="warn" title={warn} /> : null}
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
