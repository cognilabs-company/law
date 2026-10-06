"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { isForbidden, isRouteMissing, isAborted } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { fmtRating } from "@/lib/date";
import { getOwnerDashboard, type OrgWorkItem, type OwnerDashboard as Dash } from "@/lib/services/orgOwner";
import { IconBolt, IconBriefcase, IconChevronLeft, IconList, IconRefresh, IconShieldCheck, IconTag, IconUsers } from "@/components/icons";
import Select from "@/components/Select";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { useAiField, useAiSelection } from "@/lib/ai/registry";
import { useAiReveal } from "@/lib/guide/targets";
import { OrgBlocked, WorkDetail, WorkRow } from "./bits";

type WorkTab = "orders" | "cases" | "urgent";
const WORK_TABS: WorkTab[] = ["orders", "cases", "urgent"];
const isWorkTab = (v: string): v is WorkTab => (WORK_TABS as string[]).includes(v);

export default function OwnerDashboard({ orgId }: { orgId: string }) {
  const t = useTranslations("orgOwner");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<WorkTab>("orders");
  const [detail, setDetail] = useState<OrgWorkItem | null>(null);
  useAiSelection("organization_works_tab", tab);
  useAiField("organization.dashboard.works.filters.kind", {
    get: () => tab,
    set: (v) => {
      if (isWorkTab(v)) setTab(v);
    },
  });
  useAiReveal(/^works\.item\./, (id) => {
    if (!data) return;
    const seg = id.split(".")[2] ?? "";
    const has = (list: OrgWorkItem[]) => list.some((w) => aiSeg(w.workId || w.id) === seg);
    if (has(data.activeOrders)) setTab("orders");
    else if (has(data.activeCases)) setTab("cases");
    else if (has(data.urgentRequests)) setTab("urgent");
  });

  useEffect(() => {
    const c = new AbortController();
    getOwnerDashboard(orgId, c.signal)
      .then((d) => {
        if (c.signal.aborted) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!isAborted(e) && !c.signal.aborted) setError(e);
      });
    return () => c.abort();
  }, [orgId, tick]);

  if (error && isForbidden(error)) return <OrgBlocked kind="forbidden" />;
  if (error && isRouteMissing(error)) return <OrgBlocked kind="soon" />;
  if (error && !data) {
    return (
      <div className="sup__empty">
        <p>{errorText(error, tc)}</p>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setTick((n) => n + 1)}>
          <IconRefresh />
          {tc("retry")}
        </button>
      </div>
    );
  }

  const s = data?.summary;
  const cards = [
    { k: "members", Icon: IconUsers, v: s?.members, tone: "blue" },
    { k: "verified", Icon: IconShieldCheck, v: s?.verifiedMembers, tone: "ok" },
    { k: "orders", Icon: IconTag, v: s?.activeOrders, tone: "violet" },
    { k: "cases", Icon: IconBriefcase, v: s?.activeCases, tone: "blue" },
    { k: "urgent", Icon: IconBolt, v: s?.urgentRequests, tone: "warn" },
  ];
  const worksOf = (k: WorkTab) => (data ? (k === "orders" ? data.activeOrders : k === "cases" ? data.activeCases : data.urgentRequests) : []);
  const works = worksOf(tab);
  const base = `/portal/advocate/organization/${encodeURIComponent(orgId)}`;
  const region = (r: string) => (te.has(`regions.${r}`) ? te(`regions.${r}`) : r);

  return (
    <div className="oown">
      <div className="oown__head">
        <Link href="/portal/advocate/organization" className="sup__back oown__back">
          <IconChevronLeft />
          {t("allOrgs")}
        </Link>
        <div className="oown__title">
          <span>{t("title")}</span>
          <h2>{data?.organization.name || "…"}</h2>
        </div>
        <Link href={`${base}/workload`} className="btn btn--pri btn--sm" data-ai-target="button:org-workload" data-ai-id="organization.dashboard.workload-link">
          <IconList />
          {t("workloadLink")}
        </Link>
      </div>

      <div className="osum" data-ai-target="organization:summary" data-ai-id="organization.dashboard.summary" data-ai-type="section" data-ai-label={t("title")}>
        {cards.map(({ k, Icon, v, tone }) => (
          <div key={k} className={`osum__c osum__c--${tone}`}>
            <i>
              <Icon />
            </i>
            <b>{data ? v ?? 0 : "—"}</b>
            <span>{t(`summary.${k}`)}</span>
          </div>
        ))}
      </div>

      <section className="opanel" data-ai-target="organization:members" data-ai-id="organization.dashboard.members" data-ai-label={t("membersTitle")}>
        <div className="opanel__h">
          <b>{t("membersTitle")}</b>
          <span className="advmuted">{data?.members.length ?? 0}</span>
        </div>
        {data?.members.length ? <p className="omem__hint">{t("member.openHint")}</p> : null}
        {!data ? (
          <div className="supcard supcard--ghost" aria-hidden="true" />
        ) : !data.members.length ? (
          <p className="advmuted">{t("noMembers")}</p>
        ) : (
          <div className="otable" role="table" data-ai-id="organization.dashboard.members.table" data-ai-type="table" data-ai-label={t("membersTitle")}>
            <div className="otable__r otable__r--h" role="row">
              {["name", "role", "sellerType", "region", "verification", "rating", "orders", "cases", "urgent"].map((c) => (
                <span key={c} role="columnheader">
                  {t(`col.${c}`)}
                </span>
              ))}
            </div>
            {data.members.map((m, i) => (
              <button
                key={m.userId || m.name}
                type="button"
                role="row"
                className="otable__r"
                data-ai-target={i === 0 ? "organization:member-row" : undefined}
                data-ai-id={m.userId ? aiId("organization.member", m.userId) : undefined}
                data-ai-type="list_item"
                data-ai-entity-type="seller"
                data-ai-entity-id={m.userId || undefined}
                data-ai-label={[m.title || m.role, t.has(`sellerTypes.${m.sellerType}`) ? t(`sellerTypes.${m.sellerType}`) : m.sellerType].filter(Boolean).join(" · ") || t("col.name")}
                data-ai-private
                onClick={() => router.push((m.userId ? `${base}/members/${encodeURIComponent(m.userId)}` : `${base}/workload`) as Parameters<typeof router.push>[0])}
              >
                <span role="cell" data-l={t("col.name")}>
                  <b>{m.name || "—"}</b>
                  {m.phone ? <small>{m.phone}</small> : null}
                </span>
                <span role="cell" data-l={t("col.role")}>{m.title || m.role || "—"}</span>
                <span role="cell" data-l={t("col.sellerType")}>{t.has(`sellerTypes.${m.sellerType}`) ? t(`sellerTypes.${m.sellerType}`) : m.sellerType || "—"}</span>
                <span role="cell" data-l={t("col.region")}>{m.region ? region(m.region) : "—"}</span>
                <span role="cell" data-l={t("col.verification")}>
                  <span className={`ostatus ostatus--${m.verificationStatus}`}>{t.has(`verification.${m.verificationStatus}`) ? t(`verification.${m.verificationStatus}`) : m.verificationStatus || "—"}</span>
                </span>
                <span role="cell" data-l={t("col.rating")}>{m.reviewsCount > 0 && m.rating > 0 ? `★ ${fmtRating(m.rating, locale)} · ${m.reviewsCount}` : t("unrated")}</span>
                <span role="cell" data-l={t("col.orders")} className="otable__n">{m.workload.activeOrders}</span>
                <span role="cell" data-l={t("col.cases")} className="otable__n">{m.workload.activeCases}</span>
                <span role="cell" data-l={t("col.urgent")} className="otable__n">{m.workload.urgentRequests}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="opanel" data-ai-target="organization:active-orders" data-ai-id="organization.dashboard.works" data-ai-label={t("activeTitle")}>
        <div className="opanel__h">
          <b>{t("activeTitle")}</b>
          <div className="wsel wsel--wide" data-ai-id="organization.dashboard.works.filters.kind" data-ai-type="select" data-ai-label={t("col.kind")}>
            <Select
              value={tab}
              onChange={(v) => {
                if (isWorkTab(v)) setTab(v);
              }}
              ariaLabel={t("col.kind")}
              options={WORK_TABS.map((k) => ({ value: k, label: `${t(`tabs.${k}`)} (${worksOf(k).length})` }))}
            />
          </div>
        </div>
        {!data ? (
          <div className="supcard supcard--ghost" aria-hidden="true" />
        ) : !works.length ? (
          <p className="advmuted">{t("noWorks")}</p>
        ) : (
          <div className="oworks">
            {works.map((w) => (
              <WorkRow key={`${w.kind}-${w.id}`} item={w} onOpen={() => setDetail(w)} />
            ))}
          </div>
        )}
      </section>

      <WorkDetail item={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
