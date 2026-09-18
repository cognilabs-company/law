"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  getSubscriptionPlans,
  demoPlanPurchase,
  listPayments,
  listPaymentMethods,
  addPaymentMethod,
  isProviderUnsupported,
  planForRole,
  type BackendPlan,
} from "@/lib/services/backend";
import { loadAutopay, readAutopay, saveAutopay, type AutopayState } from "@/lib/services/plans";
import { useAuth } from "@/lib/auth";
import { useSellerCabinet } from "./SellerCabinet";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { createCheckout, isDemoCheckout, type PaymentIntent } from "@/lib/services/checkout";
import { CheckoutIntent } from "./OrderMilestones";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "./DataState";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { Notice } from "@/components/admin/AdminBits";
import { IconCheck, IconCard, IconGift, IconSparkle, IconShieldCheck, IconRefresh, IconInfo } from "@/components/icons";

type Term = 1 | 3 | 6 | 12;
type Variant = "personal" | "all";

// GM T1-03: the client's LexGo.AI plans are exactly Free / Lite / Pro; the
// "Shaxsiy advokatim" plans are Standart / Premium (audience personal).
// Business subscriptions belong to the B2B module. Sellers additionally see
// every active tariff whose audience covers their role (planForRole), so an
// admin-created yurist/advokat tariff shows up without a slug rule.
const AI_SLUG = /^lexgo-ai-(free|lite|pro)$/;
const FEATURED_SLUG = "lexgo-ai-pro";
// Fallback monthly AI limits when a plan carries no entitlements (T1-03).
const AI_LIMIT_BY_SLUG: Record<string, number> = { "lexgo-ai-free": 5, "lexgo-ai-lite": 100, "lexgo-ai-pro": 1000 };
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
  // T1-03 §6: only a truly VERIFIED seller gets the discount — session.accountStatus
  // only says the registration was approved (still "active" while profile
  // verification is pending or was rejected), so the seller cabinet's own
  // verification.verified is what actually decides it (mirrors backend
  // limited_access: account_status=="active" AND verification_status in
  // {approved,verified} AND is_verified).
  const cabinet = useSellerCabinet();
  const verified = isSeller && cabinet.data?.verification.verified === true;
  const sellerPct = verified ? SELLER_DISCOUNT : 0;
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

  // /payments reports kind = Payment.target_type, i.e. "subscription_plan";
  // "subscription" is kept for older rows.
  const bills = payments.data.filter((p) => !p.kind || p.kind === "subscription" || p.kind === "subscription_plan");
  const active = res.data.filter((p) => p.isActive !== false);
  const role = session?.role ?? "client";
  const aiPlans = active
    .filter((p) => p.billingType !== "gift" && (AI_SLUG.test(p.slug) || (isSeller && planForRole(p, role))))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.monthlyPrice - b.monthlyPrice);
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
      setMsg({ ok: false, text: isProviderUnavailable(e) || isProviderUnsupported(e) || isDemoUnavailable(e) ? tcommon("paymentUnavailable") : t("purchaseError") });
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

      {/* ── ATMOS monthly auto-pay (clients and sellers alike) ─────────── */}
      {session ? <AutopayCard uid={session.id} /> : null}

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
            const limit = Number(plan.entitlements?.ai_requests ?? 0) || AI_LIMIT_BY_SLUG[plan.slug] || 0;
            const hasPro = aiPlans.some((p) => p.slug === FEATURED_SLUG);
            const featured = hasPro ? plan.slug === FEATURED_SLUG : aiPlans.length > 1 && i === aiPlans.length - 1;
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
                {plan.monthlyPrice === 0 && limit ? <p className="splan__usage">{t("ai.usage", { used: Math.min(aiUsed, limit), limit })}</p> : null}
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

// ── ATMOS monthly auto-pay ────────────────────────────────────────
// GM requirement: the tariff renews every month from a bound card via ATMOS.
// Backend HEAD f6c94f8 has no ATMOS provider and UserSubscription has no
// auto_renew, so the toggle is stored per user on this device
// (lexgo_autopay_<uid>) and the card row shows the profile's saved payment
// methods (/clients/me/payment-methods). loadAutopay / saveAutopay probe the
// future /clients/me/subscription and switch over the day it ships.
function AutopayCard({ uid }: { uid: string }) {
  const t = useTranslations("plans.autopay");
  const tc = useTranslations("portal.client.profile");
  const cards = useResource(listPaymentMethods, [uid]);
  const [state, setState] = useState<AutopayState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [bind, setBind] = useState(false);

  useEffect(() => {
    let alive = true;
    loadAutopay(uid)
      .then((s) => alive && setState(s))
      // Profile unreachable → still show the device setting, honestly labelled.
      .catch(() => alive && setState({ subscription: null, enabled: readAutopay(uid), source: "local" }));
    return () => {
      alive = false;
    };
  }, [uid]);

  async function toggle() {
    if (!state || busy) return;
    const next = !state.enabled;
    setBusy(true);
    setNote(null);
    setState({ ...state, enabled: next });
    try {
      const source = await saveAutopay(uid, next);
      setState((s) => (s ? { ...s, enabled: next, source } : s));
      setNote({ ok: true, text: t("saved") });
    } catch {
      setState((s) => (s ? { ...s, enabled: !next } : s));
      setNote({ ok: false, text: t("saveError") });
    } finally {
      setBusy(false);
    }
  }

  const sub = state?.subscription ?? null;
  const card = cards.data.find((c) => c.isDefault) ?? cards.data[0];
  const enabled = state?.enabled ?? false;

  return (
    <div className="ppanel apay">
      <div className="ppanel__h">
        <div className="ppanel__t">
          <span className="pico"><IconRefresh /></span>
          <div>
            <b>{t("title")}</b>
            <p className="plans__sub" style={{ margin: 0 }}>{t("sub")}</p>
          </div>
        </div>
      </div>
      {!state ? (
        <Skeleton rows={2} />
      ) : (
        <>
          <div className="apay__grid">
            <div className="apay__cell">
              <span>{t("currentTariff")}</span>
              <b>{sub?.planName || t("none")}</b>
            </div>
            <div className="apay__cell">
              <span>{t("nextCharge")}</span>
              <b>{sub?.renewsAt ? fmtDate(sub.renewsAt) : "—"}</b>
            </div>
            <div className="apay__cell">
              <span>{t("card")}</span>
              <b>{card ? `${card.brand.toUpperCase()} •••• ${card.last4}` : t("noCard")}</b>
            </div>
          </div>
          <div className="apay__row">
            <button type="button" className="apay__tg" role="switch" aria-checked={enabled} onClick={toggle} disabled={busy}>
              <span className="apay__sw" aria-hidden />
              <span>
                {t("toggle")} · <span className="apay__state">{enabled ? t("on") : t("off")}</span>
                {state.source === "local" ? <><br /><span className="apay__local">{t("localNote")}</span></> : null}
              </span>
            </button>
            <button type="button" className="btn btn--soft btn--sm" onClick={() => setBind(true)}>
              <IconCard />
              {t("bindCard")}
            </button>
          </div>
          {note ? <div className={`plans__toast${note.ok ? "" : " plans__toast--err"}`} style={{ marginTop: 12, marginBottom: 0 }}>{note.text}</div> : null}
          {state.source === "local" ? (
            <p className="apay__note"><IconInfo />{t("pendingNote")}</p>
          ) : null}
        </>
      )}
      <Modal open={bind} onClose={() => setBind(false)} title={t("bindTitle")}>
        <BindCardForm
          note={t("bindNote")}
          labels={{ brand: tc("cardBrand"), last4: tc("cardLast4"), expires: tc("cardExpires"), save: tc("save"), saving: tc("saving"), saved: tc("saved"), error: tc("error") }}
          onSaved={() => {
            void cards.refresh();
            setTimeout(() => setBind(false), 800);
          }}
        />
      </Modal>
    </div>
  );
}

// Registers the card in the profile's payment methods (the only card store the
// backend has); the real ATMOS tokenised binding replaces this later.
function BindCardForm({
  note,
  labels,
  onSaved,
}: {
  note: string;
  labels: { brand: string; last4: string; expires: string; save: string; saving: string; saved: string; error: string };
  onSaved: () => void;
}) {
  const [brand, setBrand] = useState("uzcard");
  const [last4, setLast4] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const brandOpts = ["uzcard", "humo", "visa", "mastercard"].map((v) => ({ value: v, label: v.toUpperCase() }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const l4 = last4.replace(/\D/g, "").slice(-4);
    if (busy) return;
    if (l4.length !== 4) {
      setMsg({ ok: false, text: labels.error });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await addPaymentMethod({ brand, last4: l4, expires: expires.trim() || undefined, is_default: true });
      setMsg({ ok: true, text: labels.saved });
      setLast4("");
      setExpires("");
      onSaved();
    } catch {
      setMsg({ ok: false, text: labels.error });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
      <p className="apay__note" style={{ margin: 0 }}><IconInfo />{note}</p>
      <div>
        <label>{labels.brand}</label>
        <Select value={brand} onChange={setBrand} options={brandOpts} ariaLabel={labels.brand} />
      </div>
      <div className="cform__row2">
        <div>
          <label>{labels.last4}</label>
          <input value={last4} onChange={(e) => setLast4(e.target.value)} placeholder="1234" inputMode="numeric" maxLength={4} />
        </div>
        <div>
          <label>{labels.expires}</label>
          <input value={expires} onChange={(e) => setExpires(e.target.value)} placeholder="MM/YY" maxLength={5} />
        </div>
      </div>
      {msg ? <Notice ok={msg.ok} msg={msg.text} /> : null}
      <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
        {busy ? labels.saving : labels.save}
      </button>
    </form>
  );
}
