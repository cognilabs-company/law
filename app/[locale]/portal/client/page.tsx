"use client";

import { statusLabel } from "@/lib/labels";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { listCases } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import HeroCarousel from "@/components/portal/HeroCarousel";
import ReferralProgress from "@/components/portal/ReferralProgress";
import {
  Icon,
  IconSparkle,
  IconSend,
  IconArrowRight,
  IconShieldCheck,
  IconClock,
  IconCheck,
  IconFileText,
  IconAlert,
} from "@/components/icons";

const DONE_STATUSES = new Set(["completed", "archived"]);

// Static quick-action shortcuts (navigation, not backend data). Six of
// them, not five — .cdact is a fixed 6-column grid (3 on tablet, 2 on
// phone), so five left an empty trailing cell in every row size.
const QUICK_ACTIONS = [
  { key: "describe", icon: "IconChatDots", href: "/portal/client/ai", primary: true },
  { key: "findSpecialist", icon: "IconSearch", href: "/portal/client/lawyers" },
  { key: "consultation", icon: "IconVideo", href: "/portal/client/matches" },
  { key: "askAi", icon: "IconSparkle", href: "/portal/client/ai" },
  { key: "upload", icon: "IconDownload", href: "/portal/client/doc-analysis" },
  { key: "services", icon: "IconBriefcase", href: "/portal/client/services" },
];
const ACTION_SUB: Record<string, string> = {
  describe: "describeSub",
  findSpecialist: "findSpecialistSub",
  consultation: "consultationSub",
  askAi: "askAiSub",
  upload: "uploadSub",
  services: "servicesSub",
};

export default function ClientDashboard() {
  const t = useTranslations("portal.client.dashboard");
  const ta = useTranslations("portal.client.actions");
  const tc = useTranslations("portal.common");
  const { session } = useAuth();
  const router = useRouter();
  const [ask, setAsk] = useState("");
  const res = useResource(listCases, []);
  const kpi = useMemo(() => {
    const rows = res.data;
    const done = rows.filter((c) => DONE_STATUSES.has(c.status)).length;
    return {
      total: rows.length,
      active: rows.length - done,
      done,
      pending: rows.filter((c) => c.nextAction).length,
    };
  }, [res.data]);

  function describe() {
    const q = ask.trim();
    router.push(`/portal/client/ai${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  }

  return (
    <>
      {/* Hero — the WOW first screen */}
      <div className="cdhero">
        <div className="cdhero__glow" />
        <div className="cdhero__main">
          <span className="cdhero__hi">{t("hi", { name: session?.name ?? "" })}</span>
          <h2 className="cdhero__title">{t("heroTitle")}</h2>
          <p className="cdhero__sub">{t("heroSub")}</p>
          <div className="cdhero__ask">
            <IconSparkle />
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") describe();
              }}
              placeholder={t("askPh")}
              aria-label={t("askPh")}
            />
            <button type="button" onClick={describe} aria-label={t("askBtn")}>
              <IconSend />
            </button>
          </div>
          <div className="cdhero__trust">
            <span><IconShieldCheck />{t("trust1")}</span>
            <span><IconClock />{t("trust2")}</span>
            <span><IconCheck />{t("trust3")}</span>
          </div>
        </div>
        <HeroCarousel />
      </div>

      {/* Quick actions */}
      <div className="cdact">
        {QUICK_ACTIONS.map((a) => (
          <Link
            href={a.href}
            key={a.key}
            className={`cdact__i${a.primary ? " cdact__i--pri" : ""}`}
          >
            <span className="cdact__ico"><Icon name={a.icon} /></span>
            <span>
              {ta(a.key)}
              <span className="cdact__sub">{ta(ACTION_SUB[a.key])}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* At-a-glance analytics: real counts from the same case list rendered
          below, not separate/fake numbers — total, still-open, done, and how
          many need the client's own next step. */}
      {res.status !== "loading" ? (
        <div className="pk">
          <div className="pk__i pk__i--ic pk__i--neutral">
            <span className="pk__ico"><IconFileText /></span>
            <b>{kpi.total}</b>
            <span>{t("kpiTotal")}</span>
          </div>
          <div className="pk__i pk__i--ic pk__i--active">
            <span className="pk__ico"><IconClock /></span>
            <b>{kpi.active}</b>
            <span>{t("activeOrders")}</span>
          </div>
          <div className="pk__i pk__i--ic pk__i--ok">
            <span className="pk__ico"><IconCheck /></span>
            <b>{kpi.done}</b>
            <span>{t("kpiCompleted")}</span>
          </div>
          <div className="pk__i pk__i--ic pk__i--warn">
            <span className="pk__ico"><IconAlert /></span>
            <b>{kpi.pending}</b>
            <span>{t("kpiPending")}</span>
          </div>
        </div>
      ) : null}

      {/* Active requests (backend) + sidebar */}
      <div className="cdgrid">
        <div className="ppanel">
          <div className="ppanel__h">
            <b>{t("requests")}</b>
            <Link href="/portal/client/cases">{tc("viewAll")}</Link>
          </div>
          {res.status === "loading" ? (
            <Skeleton rows={3} />
          ) : !res.data.length ? (
            <EmptyState icon={<IconSparkle />} title={t("emptyTitle")} text={t("emptyText")} />
          ) : (
            res.data.map((c) => (
              <div className="creq" key={c.id}>
                <span className="creq__st" />
                <div className="creq__m">
                  <b>{c.caseType || c.caseNumber}</b>
                  <span>{[statusLabel(tc, c.stage), c.caseNumber].filter(Boolean).join(" · ")}</span>
                  {c.nextAction ? (
                    <em className="creq__next">
                      <IconArrowRight />
                      {c.nextAction}
                    </em>
                  ) : null}
                </div>
                <div className="creq__side">
                  <span className="creq__badge">{statusLabel(tc, c.status)}</span>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="cdgrid__side">
          <ReferralProgress side="client" href="/portal/client/referrals" />
          <div className="aicard">
            <div className="aicard__h">
              <IconSparkle />
              {t("sideAiTitle")}
            </div>
            <p>{t("sideAiSub")}</p>
            <Link href="/portal/client/ai" className="btn btn--glass btn--sm">
              {t("sideAiCta")}
              <IconArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
