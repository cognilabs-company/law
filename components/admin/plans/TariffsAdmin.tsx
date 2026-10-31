"use client";

import "./tariffs.css";
import { useMemo, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Select from "@/components/Select";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { IconClock, IconPlus, IconSliders, IconStar, IconTag } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";
import { fmtUzs } from "@/lib/money";
import { useResourceOne } from "@/lib/useResource";
import { listSubscriptionPlansAdmin, planAudience, type BackendPlan } from "@/lib/services/backend";
import { useStudioCatalog } from "@/lib/studio/catalogLink";
import FeatureRegistry from "./FeatureRegistry";
import PlanVersions from "./PlanVersions";

// Package tariffs as the backend runs them (answers 2026-10-31 §2.1, owner
// decision §6.1): what a tariff grants comes from the feature registry,
// each tariff changes only through versions (draft → backend check →
// publish), and Studio K17 holds the client-facing benefit lines. This
// replaced the old plan editor and its policy overlay.

type Tab = "plans" | "features";
const K17 = "K17";

export default function TariffsAdmin(): ReactElement {
  const t = useTranslations("admin.tariffs.page");
  const tp = useTranslations("admin.plans");
  const locale = useLocale();
  const studio = useStudioCatalog();
  const [tab, setTab] = useState<Tab>("plans");
  const [round, setRound] = useState(0);
  const res = useResourceOne(() => listSubscriptionPlansAdmin(locale), [locale, round]);
  const plans = useMemo(() => [...(res.data?.plans ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.monthlyPrice - b.monthlyPrice), [res.data]);
  const [picked, setPicked] = useState("");
  const current: BackendPlan | null = plans.find((p) => p.id === picked) ?? plans[0] ?? null;
  const k17 = studio.listHref(K17);
  const k17New = studio.newHref(K17);
  const audiences = (p: BackendPlan) => planAudience(p).map((a) => (tp.has(`audiences.${a}`) ? tp(`audiences.${a}`) : t("audienceOther")));
  const price = (p: BackendPlan) => (p.monthlyPrice > 0 ? t("perMonth", { amount: fmtUzs(p.monthlyPrice) }) : t("free"));

  return (
    <div className="ppanel trf-page" data-ai-id="admin.tariffs" data-ai-type="section" data-ai-label={t("title")}>
      <header className="trf-hero">
        <span className="trf-hero__ico" aria-hidden="true">
          <IconStar />
        </span>
        <div className="trf-hero__txt">
          <h2>{t("title")}</h2>
          <p>{t("lead")}</p>
        </div>
        <div className="trf-hero__acts">
          <Link href="/admin/promotions" className="btn btn--line btn--sm" data-ai-id="admin.plans.promotions">
            <IconTag aria-hidden="true" />
            {tp("promotions")}
          </Link>
          {k17New ? (
            <Link href={k17New} className="btn btn--pri btn--sm" data-ai-target="button:new-plan" data-ai-id="admin.plans.create">
              <IconPlus aria-hidden="true" />
              {t("newTariff")}
            </Link>
          ) : null}
        </div>
        <ol className="trf-how" aria-label={t("howTitle")}>
          {(["how1", "how2", "how3"] as const).map((k, i) => (
            <li key={k}>
              <span aria-hidden="true">{i + 1}</span>
              <span>
                <b>{t(`${k}Title`)}</b>
                {t(k)}
              </span>
            </li>
          ))}
        </ol>
      </header>

      <div className="trf-seg" role="tablist" aria-label={t("title")}>
        <button type="button" role="tab" id="trf-tab-plans" aria-controls="trf-pane-plans" aria-selected={tab === "plans"} onClick={() => setTab("plans")} data-ai-id="admin.tariffs.tab.plans">
          <IconClock aria-hidden="true" />
          {t("tabPlans")}
        </button>
        <button type="button" role="tab" id="trf-tab-features" aria-controls="trf-pane-features" aria-selected={tab === "features"} onClick={() => setTab("features")} data-ai-id="admin.plans.features">
          <IconSliders aria-hidden="true" />
          {t("tabFeatures")}
        </button>
      </div>

      {tab === "features" ? (
        <section id="trf-pane-features" role="tabpanel" aria-labelledby="trf-tab-features" className="trf-pane">
          <FeatureRegistry />
        </section>
      ) : (
        <section id="trf-pane-plans" role="tabpanel" aria-labelledby="trf-tab-plans" className="trf-pane">
          {res.status === "loading" ? (
            <Skeleton rows={4} />
          ) : res.status === "error" ? (
            <ErrorState onRetry={() => setRound((n) => n + 1)} compact />
          ) : !plans.length ? (
            <EmptyState
              icon={<IconStar />}
              title={tp("empty")}
              text={k17New ? t("emptyText") : undefined}
              action={
                k17New ? (
                  <Link href={k17New} className="btn btn--pri btn--sm">
                    <IconPlus aria-hidden="true" />
                    {t("newTariff")}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="trf-split">
              <div className="trf-pick">
                <Select
                  ariaLabel={t("pickPlan")}
                  value={current?.id ?? ""}
                  onChange={setPicked}
                  search
                  options={plans.map((p) => ({ value: p.id, label: p.name || p.title || t("unnamed"), hint: price(p) }))}
                />
              </div>
              <ul className="trf-plans" aria-label={t("listTitle")} data-ai-target="plans:list" data-ai-id="admin.plans.list" data-ai-type="list" data-ai-label={t("listTitle")}>
                {plans.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="trf-plan"
                      aria-pressed={current?.id === p.id}
                      onClick={() => setPicked(p.id)}
                      data-ai-id={p.slug || p.id ? aiId("admin.plans.item", p.slug || p.id) : undefined}
                      data-ai-type="list_item"
                      data-ai-entity-type="subscription_plan"
                    >
                      <b>{p.name || p.title || t("unnamed")}</b>
                      <span className="trf-plan__price">{price(p)}</span>
                      <span className="trf-plan__tags">
                        {audiences(p).map((a) => (
                          <em key={a}>{a}</em>
                        ))}
                        <em data-tone={p.isActive ? "ok" : "muted"}>{p.isActive ? t("onSale") : t("offSale")}</em>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {current ? (
                <section className="trf-detail" aria-label={t("versionsOf", { name: current.name || current.title || t("unnamed") })} data-ai-target="plans:item-actions">
                  <header className="trf-detail__h">
                    <div>
                      <small>{t("versionsTitle")}</small>
                      <h3>{current.name || current.title || t("unnamed")}</h3>
                    </div>
                    {k17 ? (
                      <Link href={k17} className="btn btn--line btn--sm">
                        {t("benefitsInStudio")}
                      </Link>
                    ) : null}
                  </header>
                  <p className="trf-muted">{t("versionsLead")}</p>
                  <PlanVersions key={current.id} planId={current.id} />
                </section>
              ) : null}
            </div>
          )}
          {res.data?.activeOnly ? <p className="trf-muted trf-only">{tp("activeOnly")}</p> : null}
        </section>
      )}
    </div>
  );
}
