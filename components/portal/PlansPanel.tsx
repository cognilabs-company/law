"use client";

import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  getSubscriptionPlans,
  demoPlanPurchase,
  purchasePlan,
  isAtmosCheckout,
  listPayments,
  listPaymentMethods,
  addPaymentMethod,
  isProviderUnsupported,
  planForRole,
  requestPlanTelegramPurchase,
  refusedBillingPeriods,
  BILLING_PERIODS,
  type BackendPlan,
  type ManualDocBillingPeriod,
} from "@/lib/services/backend";
import { loadAutopay, readAutopay, saveAutopay, type AutopayState } from "@/lib/services/plans";
import { useAuth } from "@/lib/auth";
import { useSellerCabinet } from "./SellerCabinet";
import { errDetail, isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { createCheckout, isDemoCheckout, type PaymentIntent } from "@/lib/services/checkout";
import { CheckoutIntent } from "./OrderMilestones";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "./DataState";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { Notice } from "@/components/admin/AdminBits";
import {
  IconCheck,
  IconCard,
  IconGift,
  IconSparkle,
  IconShieldCheck,
  IconRefresh,
  IconInfo,
  IconCrown,
  IconGem,
  IconLeaf,
  IconHeadset,
  IconChartBar,
  IconChatDots,
  IconChevronRight,
  IconCalendar,
  IconStar,
} from "@/components/icons";
import { dateOnly } from "@/lib/date";

// Tier icon shown above the plan name (purely presentational — matches
// whichever of the three fixed LexGo.AI slugs the plan is).
function tierIcon(slug: string) {
  if (slug === "lexgo-ai-pro") return { Icon: IconCrown, cls: "pro" };
  if (slug === "lexgo-ai-lite") return { Icon: IconGem, cls: "lite" };
  if (slug === "lexgo-ai-free") return { Icon: IconLeaf, cls: "free" };
  return null;
}

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
function fmtDate(s: string, locale: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateOnly(s, locale);
}
// Backend billing_period for the chosen term (the API knows monthly / six_month /
// yearly / prepaid_yearly; a 3-month term is billed as monthly — reported).
function billingPeriod(term: Term, upfront: boolean): string {
  return term === 6 ? "six_month" : term === 12 ? (upfront ? "prepaid_yearly" : "yearly") : "monthly";
}
// The same four strings, narrowed for the Telegram approval request (which is
// the one caller that has to name the period back to the backend).
function asBillingPeriod(v: string): ManualDocBillingPeriod {
  return BILLING_PERIODS.includes(v as ManualDocBillingPeriod) ? (v as ManualDocBillingPeriod) : "monthly";
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
  // Set when a purchase falls through to the Telegram approval flow.
  const [tgPlan, setTgPlan] = useState<{ plan: BackendPlan; period: ManualDocBillingPeriod } | null>(null);
  const [aiUsed, setAiUsed] = useState(0);
  useEffect(() => { const h = setTimeout(() => setAiUsed(aiUsedThisMonth(session?.id ?? "")), 0); return () => clearTimeout(h); }, [session?.id]);

  // Lifted out of AutopayCard so the plan grid can mark the user's own active
  // plan (not just the autopay summary row) — AutopayCard receives it as a prop.
  const [autopay, setAutopay] = useState<AutopayState | null>(null);
  const uid = session?.id ?? "";
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    loadAutopay(uid)
      .then((s) => alive && setAutopay(s))
      .catch(() => alive && setAutopay({ subscription: null, enabled: readAutopay(uid), source: "local" }));
    return () => {
      alive = false;
    };
  }, [uid]);
  const currentPlanName = autopay?.subscription?.planName || "";

  // /payments reports kind = Payment.target_type, i.e. "subscription_plan";
  // "subscription" is kept for older rows.
  const bills = payments.data.filter((p) => !p.kind || p.kind === "subscription" || p.kind === "subscription_plan");
  const active = res.data.filter((p) => p.isActive !== false);
  const role = session?.role ?? "client";
  const roleKey = role === "lawyer" ? "yurist" : role === "advocate" ? "advokat" : role;
  // target_roles (2026-09-19 backend field) no longer decides whether a plan
  // is VISIBLE — everything non-gift is — but it still decides the order: a
  // tariff the backend says is meant for this role is listed first.
  const mine = (p: BackendPlan) => (p.targetRoles?.length ? p.targetRoles.includes(roleKey) : planForRole(p, role)) ? 0 : 1;
  // A gift tariff is bought FOR someone else on the Gifts page — it can never
  // be a self-subscription, so it is the one thing this page leaves out. The
  // backend marks those with is_giftable; billing_type "gift" is the older
  // signal and today no plan carries it, which is why "shaxsiy-advokat-gift"
  // used to render here as an ordinary buyable tariff.
  const isGift = (p: BackendPlan) => p.isGiftable || p.billingType === "gift";
  const byOrder = (a: BackendPlan, b: BackendPlan) => mine(a) - mine(b) || a.sortOrder - b.sortOrder || a.monthlyPrice - b.monthlyPrice;
  const sellable = active.filter((p) => !isGift(p)).sort(byOrder);
  // Everything else is shown. The old rule kept a plan out of the page unless
  // its slug matched /lexgo-ai-(free|lite|pro)/ or its audience string covered
  // the viewer's role — and the backend canonicalizes audience by slug, so
  // "lexgo-ai-jismoniy-shaxs" (an individual's tariff) and the three
  // "biznes-abonent-*" tariffs came back as audience "seller" and were visible
  // to nobody at all.
  const aiPlans = sellable.filter((p) => AI_SLUG.test(p.slug));
  const otherPlans = sellable.filter((p) => !AI_SLUG.test(p.slug));
  const giftPlan = active.find(isGift);
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
      if (isAtmosCheckout()) {
        const r = await purchasePlan(plan.id, { billing_period: period });
        if (r.paymentUrl) {
          leaving = true;
          setMsg({ ok: true, text: t("payRedirect") });
          window.location.assign(r.paymentUrl);
        } else {
          setMsg({ ok: true, text: t("activated", { plan: planName(plan) }) });
        }
        return;
      }
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
      // No provider to pay through — Payme and Click both answer 503
      // "integratsiyasi sozlanmagan" until they are configured, and ATMOS is
      // not shipped. LEXGO_FRONTEND_SECOND_OPINION_PLAN_UPDATE.md says what to
      // do instead: telegram-purchase-request, which now works for every
      // active plan. The plan is approved in the admin Telegram chat and
      // activates itself, so this is a real way to buy rather than a dead end.
      if (isProviderUnavailable(e) || isProviderUnsupported(e) || isDemoUnavailable(e)) {
        setTgPlan({ plan, period: asBillingPeriod(period) });
        return;
      }
      setMsg({ ok: false, text: t("purchaseError") });
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

      <TelegramPlanRequest
        target={tgPlan}
        onClose={() => setTgPlan(null)}
        // LEXGO_FRONTEND_SECOND_OPINION_PLAN_UPDATE.md step 6 — re-read the
        // account state after the request. Nothing activates until somebody
        // approves it in Telegram, but the pending Payment row is real and
        // belongs in the billing list straight away.
        onSent={() => {
          void payments.refresh();
          void res.refresh();
          if (uid) loadAutopay(uid).then(setAutopay).catch(() => { /* keep what is on screen */ });
        }}
      />


      {/* ── ATMOS monthly auto-pay (clients and sellers alike) ─────────── */}
      {session ? <AutopayCard uid={session.id} state={autopay} onStateChange={setAutopay} /> : null}

      {/* ── LexGo.AI: Free / Lite / Pro ─────────────────────────────── */}
      <div className="subs__layout">
      <div>
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
            const tier = tierIcon(plan.slug);
            const isCurrent = !!currentPlanName && planName(plan) === currentPlanName;
            return (
              <div key={plan.id} className={`splan${isCurrent ? " splan--current" : featured ? " splan--feat" : ""}`}>
                {isCurrent ? (
                  <span className="splan__ribbon splan__ribbon--current"><IconCheck />{t("current")}</span>
                ) : featured ? (
                  <span className="splan__ribbon"><IconStar />{t("recommended")}</span>
                ) : null}
                {tier ? (
                  <span className={`splan__icon splan__icon--${tier.cls}`}>
                    <tier.Icon />
                  </span>
                ) : null}
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
                {isCurrent ? (
                  <span className="btn btn--soft btn--full" aria-disabled><IconCheck />{t("current")}</span>
                ) : plan.monthlyPrice === 0 ? (
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
      </div>

      <div className="subs__side">
        <div className="benefit">
          <span className="benefit__ico"><IconShieldCheck /></span>
          <div>
            <b>{t("sidebar.secureTitle")}</b>
            <p>{t("sidebar.secureText")}</p>
          </div>
        </div>
        <div className="benefit">
          <span className="benefit__ico"><IconRefresh /></span>
          <div>
            <b>{t("sidebar.cancelTitle")}</b>
            <p>{t("sidebar.cancelText")}</p>
          </div>
        </div>
        <div className="benefit">
          <span className="benefit__ico"><IconHeadset /></span>
          <div>
            <b>{t("sidebar.supportTitle")}</b>
            <p>{t("sidebar.supportText")}</p>
          </div>
        </div>
        <Link
          href={role === "client" ? "/portal/client/ai" : role === "lawyer" ? "/portal/lawyer/ai" : "/portal/advocate/assistant"}
          className="btn btn--line btn--full"
        >
          <IconChatDots />
          {t("sidebar.ask")}
        </Link>
      </div>
      </div>

      {aiPlans.length ? (
        <div className="subs__bottom">
          <div className="ppanel">
            <div className="ppanel__h">
              <b className="ppanel__t"><span className="pico"><IconChartBar /></span>{t("compare.title")}</b>
            </div>
            <div className="ptable__wrap">
              <table className="ptable">
                <thead>
                  <tr>
                    <th>{t("compare.rowLabel")}</th>
                    {aiPlans.map((p) => <th key={p.id}>{planName(p)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{t("compare.rowPrice")}</td>
                    {aiPlans.map((p) => <td key={p.id}>{p.monthlyPrice ? `${som(p.monthlyPrice)} ${t("perMonth")}` : t("freeLabel")}</td>)}
                  </tr>
                  <tr>
                    <td>{t("compare.rowRequests")}</td>
                    {aiPlans.map((p) => <td key={p.id}>{Number(p.entitlements?.ai_requests ?? 0) || AI_LIMIT_BY_SLUG[p.slug] || "—"}</td>)}
                  </tr>
                  <tr>
                    <td>{t("compare.rowFeatures")}</td>
                    {aiPlans.map((p) => <td key={p.id}>{p.features?.length || "—"}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="ppanel">
            <div className="ppanel__h">
              <b className="ppanel__t"><span className="pico"><IconGift /></span>{t("faq.title")}</b>
            </div>
            {(t.raw("faq.items") as { q: string }[]).map((item, i) => (
              <div className="faqrow" key={i}>
                {item.q}
                <IconChevronRight />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Every tariff that is not LexGo.AI, for every role ───────── */}
      {personal || otherPlans.length ? (
        <>
          <div className="plans__head" style={{ marginTop: 34 }}>
            <div>
              <h2 className="psec-h"><IconShieldCheck style={{ width: 20, height: 20, verticalAlign: "-3px", marginRight: 8 }} />{t("otherTitle")}</h2>
              <p className="plans__sub">{personal ? t("subtitlePersonal") : t("otherSubtitle")}</p>
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
          ) : failed ? null : !otherPlans.length && !personal ? (
            <EmptyState icon={<IconCard />} title={t("empty")} text={t("emptyText")} />
          ) : (
            <div className="plans__grid">
              {otherPlans.map((plan, i) => {
                const pr = personalPricing(plan, term, upfront);
                const isCurrent = !!currentPlanName && planName(plan) === currentPlanName;
                return (
                  <div key={plan.id} className={`splan${isCurrent ? " splan--current" : i === 1 ? " splan--feat" : ""}`}>
                    {isCurrent ? <span className="splan__ribbon splan__ribbon--current"><IconCheck />{t("current")}</span> : null}
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
                    {isCurrent ? (
                      <span className="btn btn--soft btn--full" aria-disabled><IconCheck />{t("current")}</span>
                    ) : (
                    <button
                      type="button"
                      className={`btn ${i === 1 ? "btn--grad" : "btn--line"} btn--full`}
                      disabled={busy === plan.id}
                      onClick={() => choose(plan, pr.total, billingPeriod(term, upfront))}
                    >
                      {busy === plan.id ? t("processing") : t("choose")}
                    </button>
                    )}
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
                  <span>{fmtDate(p.createdAt, locale)}</span>
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
function AutopayCard({
  uid,
  state,
  onStateChange,
}: {
  uid: string;
  state: AutopayState | null;
  onStateChange: Dispatch<SetStateAction<AutopayState | null>>;
}) {
  const t = useTranslations("plans.autopay");
  const locale = useLocale();
  const tc = useTranslations("portal.client.profile");
  const cards = useResource(listPaymentMethods, [uid]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [bind, setBind] = useState(false);
  const setState = onStateChange;

  async function toggle() {
    if (!state || busy) return;
    const next = !state.enabled;
    setBusy(true);
    setNote(null);
    setState({ ...state, enabled: next });
    try {
      const source = await saveAutopay(uid, next, state.subscription?.id);
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
    <>
      <div className="subs__top">
        <div className="subs__topcard">
          <span className="subs__topico subs__topico--crown"><IconCrown /></span>
          <div>
            <span className="subs__topl">{t("currentTariff")}</span>
            <b>{sub?.planName || t("none")}</b>
            {!sub ? <span className="subs__tops">{t("noneHint")}</span> : null}
          </div>
        </div>
        <div className="subs__topcard">
          <span className="subs__topico"><IconCalendar /></span>
          <div>
            <span className="subs__topl">{t("nextCharge")}</span>
            <b>{sub?.renewsAt ? fmtDate(sub.renewsAt, locale) : "—"}</b>
            {!sub?.renewsAt ? <span className="subs__tops">{t("nextChargeHintEmpty")}</span> : null}
          </div>
        </div>
        <div className="subs__topcard">
          <span className="subs__topico"><IconCard /></span>
          <div>
            <span className="subs__topl">{t("card")}</span>
            <b>{card ? `${card.brand.toUpperCase()} •••• ${card.last4}` : t("noCard")}</b>
            {!card ? <span className="subs__tops">{t("cardHintEmpty")}</span> : null}
          </div>
        </div>
      </div>

      <div className="ppanel apay" style={{ marginBottom: 22 }}>
      {!state ? (
        <Skeleton rows={2} />
      ) : (
        <>
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
      </div>
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
    </>
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

// ── Telegram approval purchase ─────────────────────────────────────
// LEXGO_FRONTEND_SECOND_OPINION_PLAN_UPDATE.md: POST
// /subscription-plans/{id}/telegram-purchase-request now works for every
// active plan, and it is what a purchase falls through to when there is no
// payment provider to redirect to. The response is a `pending` request — a
// Payment exists and the admin chats have been told — so this is a receipt,
// not a checkout: there is nothing here to pay.
function TelegramPlanRequest({
  target,
  onClose,
  onSent,
}: {
  target: { plan: BackendPlan; period: ManualDocBillingPeriod } | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const ttg = useTranslations("plans.telegram");
  const tdoc = useTranslations("portal.client.documents");
  const [period, setPeriod] = useState<ManualDocBillingPeriod>("monthly");
  const [only, setOnly] = useState<ManualDocBillingPeriod[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  // The plan the caller was on when the provider failed, and the period they
  // had already chosen there. Reset during render so a second attempt never
  // opens showing the previous plan's outcome.
  const key = target ? `${target.plan.id}|${target.period}` : "";
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setPeriod(target?.period ?? "monthly");
    setOnly(null);
    setSent(false);
    setErr("");
  }

  if (!target) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const { plan } = target;

  // Only the periods this plan sells, narrowed further by a 422 that named
  // them explicitly.
  const allowed = plan.allowedBillingPeriods?.length
    ? BILLING_PERIODS.filter((p) => plan.allowedBillingPeriods.includes(p))
    : BILLING_PERIODS;
  const periods = only ?? (allowed.length ? allowed : BILLING_PERIODS);
  const eff = periods.includes(period) ? period : periods[0];

  const priceFor = (p: ManualDocBillingPeriod): number => {
    if (p === "six_month") return plan.sixMonthPrice || plan.monthlyPrice * 6;
    if (p === "yearly") return plan.yearlyPrice || plan.monthlyPrice * 12;
    if (p === "prepaid_yearly") return plan.prepaidYearlyPrice || plan.yearlyPrice || plan.monthlyPrice * 12;
    return plan.monthlyPrice;
  };

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await requestPlanTelegramPurchase(plan.id, eff);
      // status "pending" is the documented success; anything else still means
      // the request exists, so the receipt is shown either way.
      setSent(true);
      onSent();
      if (r.telegramSent === false || (r.telegramDelivered === 0 && r.telegramFailed > 0)) {
        setErr(ttg("notDelivered"));
      }
    } catch (e) {
      const refused = refusedBillingPeriods(e);
      if (refused.length) {
        setOnly(refused);
        setPeriod(refused[0]);
        setErr(ttg("periodRefused"));
      } else {
        setErr(errDetail(e) || ttg("error"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={ttg("title")}>
      <div className="cform" style={{ maxWidth: "none" }}>
        {sent ? (
          <>
            <p className="cform__ok"><IconCheck style={{ width: 16, height: 16 }} /> {ttg("sent")}</p>
            <p className="advmuted">{ttg("sentLead")}</p>
            {err ? <Notice ok={false} msg={err} /> : null}
            <button type="button" className="btn btn--line btn--full" onClick={onClose}>{ttg("close")}</button>
          </>
        ) : (
          <>
            <p className="advmuted" style={{ margin: 0 }}>{ttg("lead", { plan: plan.name })}</p>
            <div>
              <label>{ttg("period")}</label>
              <div className="chiprow" style={{ margin: "4px 0 0" }}>
                {periods.map((p) => (
                  <button key={p} type="button" className="fchip" aria-pressed={eff === p} onClick={() => setPeriod(p)}>
                    {tdoc.has(`period_${p}`) ? tdoc(`period_${p}`) : p}
                  </button>
                ))}
              </div>
            </div>
            <div className="tgbuy__sum">
              <span>{ttg("amount")}</span>
              <b>{fmtUzs(priceFor(eff))}</b>
            </div>
            {err ? <Notice ok={false} msg={err} /> : null}
            <button type="button" className="btn btn--grad btn--full btn--lg" disabled={busy} onClick={() => void submit()}>
              {busy ? ttg("sending") : ttg("submit")}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
