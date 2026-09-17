"use client";

import { useState } from "react";
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
} from "@/components/icons";

// Static quick-action shortcuts (navigation, not backend data).
const QUICK_ACTIONS = [
  { key: "describe", icon: "IconChatDots", href: "/portal/client/ai", primary: true },
  { key: "findSpecialist", icon: "IconSearch", href: "/portal/client/lawyers" },
  { key: "consultation", icon: "IconVideo", href: "/portal/client/matches" },
  { key: "askAi", icon: "IconSparkle", href: "/portal/client/ai" },
  { key: "upload", icon: "IconDownload", href: "/portal/client/doc-analysis" },
];

export default function ClientDashboard() {
  const t = useTranslations("portal.client.dashboard");
  const ta = useTranslations("portal.client.actions");
  const tc = useTranslations("portal.common");
  const { session } = useAuth();
  const router = useRouter();
  const [ask, setAsk] = useState("");
  const res = useResource(listCases, []);

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
            {ta(a.key)}
          </Link>
        ))}
      </div>

      <ReferralProgress side="client" href="/portal/client/referrals" />

      {/* Active requests (backend) */}
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
                <span>{[c.stage, c.caseNumber].filter(Boolean).join(" · ")}</span>
                {c.nextAction ? (
                  <em className="creq__next">
                    <IconArrowRight />
                    {c.nextAction}
                  </em>
                ) : null}
              </div>
              <div className="creq__side">
                <span className="creq__badge">{c.status}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
