"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { isForbidden, isRouteMissing, isAborted } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { fmtRating } from "@/lib/date";
import { getOwnerDashboard, type OrgWorkItem, type OwnerDashboard as Dash } from "@/lib/services/orgOwner";
import { IconBolt, IconBriefcase, IconChevronLeft, IconList, IconRefresh, IconShieldCheck, IconTag, IconUsers } from "@/components/icons";
import { OrgBlocked, WorkDetail, WorkRow } from "./bits";

type WorkTab = "orders" | "cases" | "urgent";

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
  const works = data ? (tab === "orders" ? data.activeOrders : tab === "cases" ? data.activeCases : data.urgentRequests) : [];
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
        <Link href={`${base}/workload`} className="btn btn--pri btn--sm" data-ai-target="button:org-workload">
          <IconList />
          {t("workloadLink")}
        </Link>
      </div>

      <div className="osum" data-ai-target="organization:summary">
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

      <section className="opanel" data-ai-target="organization:members">
        <div className="opanel__h">
          <b>{t("membersTitle")}</b>
          <span className="advmuted">{data?.members.length ?? 0}</span>
        </div>
        {!data ? (
          <div className="supcard supcard--ghost" aria-hidden="true" />
        ) : !data.members.length ? (
          <p className="advmuted">{t("noMembers")}</p>
        ) : (
          <div className="otable" role="table">
            <div className="otable__r otable__r--h" role="row">
              {["name", "role", "sellerType", "region", "verification", "rating", "orders", "cases", "urgent"].map((c) => (
                <span key={c} role="columnheader">
                  {t(`col.${c}`)}
                </span>
              ))}
            </div>
            {data.members.map((m) => (
              <button
                key={m.userId || m.name}
                type="button"
                role="row"
                className="otable__r"
                onClick={() => router.push(`${base}/workload?member=${encodeURIComponent(m.userId)}` as Parameters<typeof router.push>[0])}
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

      <section className="opanel" data-ai-target="organization:active-orders">
        <div className="opanel__h">
          <b>{t("activeTitle")}</b>
          <div className="suptabs" role="tablist">
            {(["orders", "cases", "urgent"] as WorkTab[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className="suptab" onClick={() => setTab(k)}>
                {t(`tabs.${k}`)}
                <em>{data ? (k === "orders" ? data.activeOrders.length : k === "cases" ? data.activeCases.length : data.urgentRequests.length) : 0}</em>
              </button>
            ))}
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
