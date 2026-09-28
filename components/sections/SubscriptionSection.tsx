"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { fmtNumber } from "@/lib/lexai";
import { useAuth } from "@/lib/auth";
import { getSubscriptionPlans, type BackendPlan } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { IconInfo } from "../icons";

// Personal-lawyer subscription tariffs (TZ: "Шахсий адвокат ёллаш обуна модули").
// Prices come from the backend (admin-managed, TZ-aligned); these are only the
// offline fallback so the marketing page still renders without the API.
const FALLBACK: Record<"standard" | "premium", number> = { standard: 149000, premium: 349000 };
const SLUG: Record<"standard" | "premium", string> = {
  standard: "shaxsiy-advokat-standard",
  premium: "shaxsiy-advokat-premium",
};

type Term = 1 | 6 | 12;

// Build a TZ pricing table from a plan (or a synthesised fallback).
function pricing(plan: BackendPlan | undefined, fallbackMonthly: number, term: Term, upfront: boolean) {
  const monthly = plan?.monthlyPrice || fallbackMonthly;
  const six = plan?.sixMonthPrice || Math.round((monthly * 6 * 0.95) / 1000) * 1000;
  const year = plan?.yearlyPrice || Math.round((monthly * 12 * 0.9) / 1000) * 1000;
  const prepaid = plan?.prepaidYearlyPrice || Math.round((year * 0.9) / 1000) * 1000;
  const total = term === 1 ? monthly : term === 6 ? six : upfront ? prepaid : year;
  const perMonth = Math.round(total / term);
  const baseline = monthly * term;
  const save = Math.max(0, baseline - total);
  return { monthly, total, perMonth, save, savePct: baseline ? Math.round((save / baseline) * 100) : 0 };
}

export default function SubscriptionSection() {
  const t = useTranslations("subscription");
  const { session } = useAuth();
  const plansRes = useResource<BackendPlan>(getSubscriptionPlans, []);
  const [term, setTerm] = useState<Term>(6);
  const [upfront, setUpfront] = useState(false);

  const bySlug = new Map(plansRes.data.map((p) => [p.slug, p]));
  const buyHref = session ? `/portal/${session.role}/subscription` : "/register";

  // Render helper (not a component), so the cards aren't remounted on every render.
  function renderPlan(id: "standard" | "premium", hot?: boolean) {
    const plan = bySlug.get(SLUG[id]);
    const pr = pricing(plan, FALLBACK[id], term, upfront);
    const features = t.raw(`plans.${id}.features`) as string[];
    return (
      <article className={`plan${hot ? " plan--hot" : ""}`} data-badge={hot ? t("mostChosen") : undefined}>
        <h3 className="plan__h">{t(`plans.${id}.name`)}</h3>
        <p className="plan__for">{t(`plans.${id}.for`)}</p>
        <div className="plan__p">
          <b>{fmtNumber(pr.perMonth)}</b>
          <em>{t("perMonth")}</em>
          {pr.save > 0 ? <span className="old">{fmtNumber(pr.monthly)}</span> : null}
          {pr.savePct > 0 ? <span className="save">−{pr.savePct}%</span> : null}
        </div>
        <p className="plan__t">
          {t("totalFor", { term, total: fmtNumber(pr.total) })}
          {pr.save > 0 ? t("youSave", { amount: fmtNumber(pr.save) }) : ""}
        </p>
        <ul>
          {features.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
        <Link href={buyHref} className={`btn ${id === "premium" ? "btn--grad" : "btn--line"} btn--full`}>
          {t(`plans.${id}.cta`)}
        </Link>
      </article>
    );
  }

  const gift = t.raw("plans.gift.features") as string[];

  return (
    <section className="sec" id="obuna" style={{ background: "var(--b50)" }}>
      <div className="wrap">
        <div className="head">
          <span className="kick">{t("kicker")}</span>
          <h2 className="h2">{t("title")}</h2>
          <p className="lead">{t("lead")}</p>
        </div>

        {/* Module 6: personal-advocate subscription is 6 or 12 months only. */}
        <div className="switch" role="group">
          <button type="button" aria-pressed={term === 6} onClick={() => setTerm(6)}>{t("term6")}</button>
          <button type="button" aria-pressed={term === 12} onClick={() => setTerm(12)}>{t("term12")}</button>
        </div>
        {term === 12 ? (
          <label className="chkline">
            <input type="checkbox" checked={upfront} onChange={(e) => setUpfront(e.target.checked)} />
            {t("upfront")}
          </label>
        ) : null}

        {/* rvseq: the three plans reveal in child order, and the gift card gets
            its own transform transition back afterwards, so the hover lift
            stays at .45s — see the wp-landingb block in globals.css. */}
        <div className="plans rvseq">
          {renderPlan("standard")}
          {renderPlan("premium", true)}

          <article className="plan plan--card">
            <div className="mcard">
              <span className="mcard__chip" />
              <span>
                <b>{t("plans.gift.badge")}</b>
                <span>{t("plans.gift.badgeSub")}</span>
              </span>
            </div>
            <h3 className="plan__h" style={{ color: "#fff" }}>{t("plans.gift.name")}</h3>
            <p className="plan__for">{t("plans.gift.for")}</p>
            <div className="plan__p">
              <b style={{ color: "#fff" }}>{t("plans.gift.price")}</b>
              <em style={{ color: "#A8C3E8" }}>{t("plans.gift.priceUnit")}</em>
            </div>
            <p className="plan__t">{t("plans.gift.payNote")}</p>
            <ul style={{ color: "#DCE8FA" }}>
              {gift.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <Link href={buyHref} className="btn btn--grad btn--full">
              {t("plans.gift.cta")}
            </Link>
            <p className="quote">{t("plans.gift.quote")}</p>
          </article>
        </div>

        <div className="info">
          <IconInfo />
          <span>{t("ratingInfo")}</span>
        </div>
      </div>
    </section>
  );
}
