"use client";

import { statusLabel } from "@/lib/labels";

import { useMemo, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { listCases } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import HeroCarousel from "@/components/portal/HeroCarousel";
import ReferralProgress from "@/components/portal/ReferralProgress";
import Modal from "@/components/admin/Modal";
import {
  Icon,
  IconSparkle,
  IconSend,
  IconArrowRight,
  IconShieldCheck,
  IconClock,
  IconCheck,
  IconAdvocatePerson,
  IconAiAnswer,
} from "@/components/icons";

const DONE_STATUSES = new Set(["completed", "archived"]);

// Static quick-action shortcuts (navigation, not backend data). Six of
// them, not five — .cdact is a fixed 6-column grid (3 on tablet, 2 on
// phone), so five left an empty trailing cell in every row size.
// `art` is the 3D illustration that sits in the card's bottom-right corner,
// half off the edge and behind the text — the arrangement in the mockup. The
// files are cut-outs on transparency (public/img/card-*.png) and are named
// after the action they belong to, which is the pairing used here.
const QUICK_ACTIONS: { key: string; icon: string; href: string; art: string; primary?: boolean; live?: boolean; ask?: boolean }[] = [
  // `ask`: this one opens the advocate-or-AI chooser rather than navigating.
  { key: "describe", icon: "IconChatDots", href: "/portal/client/ai", art: "card-muammoni-tavsiflash", primary: true, ask: true },
  // "Tezkor Advokat xizmati online" — the live-advocate module. Flagged as
  // live rather than primary so it reads as a service that is on right now,
  // beside the primary AI action instead of competing with it.
  { key: "urgent", icon: "IconBolt", href: "/portal/client/urgent", art: "card-advokatga-tezkor-boglanish", live: true },
  { key: "findSpecialist", icon: "IconSearch", href: "/portal/client/lawyers", art: "card-mutaxassis-topish" },
  { key: "consultation", icon: "IconAlert", href: "/portal/client/urgent?service=traffic_accident_consultation", art: "card-avtoavariya-huquqiy-konsultatsiya" },
  { key: "askAi", icon: "IconSparkle", href: "/portal/client/ai", art: "card-lexgo-ai-sorash" },
  { key: "upload", icon: "IconDownload", href: "/portal/client/doc-analysis", art: "card-hujjat-tahlili" },
];
// The road-accident card carries no subtitle. Its title is already a whole
// sentence — "Avtoavariya bo‘yicha huquqiy konsultatsiya olish" — and the
// line under it promised the same thing again in different words.
const ACTION_SUB: Record<string, string> = {
  describe: "describeSub",
  urgent: "urgentSub",
  findSpecialist: "findSpecialistSub",
  askAi: "askAiSub",
  upload: "uploadSub",
};

export default function ClientDashboard() {
  const t = useTranslations("portal.client.dashboard");
  const ta = useTranslations("portal.client.actions");
  const tc = useTranslations("portal.common");
  const { session } = useAuth();
  const router = useRouter();
  const [ask, setAsk] = useState("");
  const [whoOpen, setWhoOpen] = useState(false);
  const res = useResource(listCases, []);
  // The four-tile KPI row that used to sit between the actions and the list
  // is gone at the product owner's request. It counted the same cases the
  // panel below already shows, one row lower, and on a new account it was
  // four zeros taking a full band of the screen.
  //
  // The panel below is headed "Faol so'rovlaringiz" and its empty state reads
  // "Faol so'rov yo'q", but it was rendering res.data — every case, closed and
  // archived ones included. Both labels were already telling the truth about
  // what belongs there; the list is what disagreed. "Hammasini ko'rish" still
  // goes to /cases, which is where the full history lives.
  const openCases = useMemo(() => res.data.filter((c) => !DONE_STATUSES.has(c.status)), [res.data]);

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

      <Link href="/portal/client/lawyers" className="cdlawyer-ad">
        <span className="cdlawyer-ad__glow" aria-hidden="true" />
        <span className="cdlawyer-ad__copy">
          <span className="cdlawyer-ad__eyebrow"><IconSparkle />{t("lawyerAdEyebrow")}</span>
          <strong>{t("lawyerAdTitle")}</strong>
          <span className="cdlawyer-ad__text">{t("lawyerAdText")}</span>
          <span className="cdlawyer-ad__cta">{t("lawyerAdCta")}<IconArrowRight /></span>
        </span>
        <span className="cdlawyer-ad__visual" aria-hidden="true">
          <span className="cdlawyer-ad__halo cdlawyer-ad__halo--outer" />
          <span className="cdlawyer-ad__halo cdlawyer-ad__halo--inner" />
          <span className="cdlawyer-ad__orbit cdlawyer-ad__orbit--one">A</span>
          <span className="cdlawyer-ad__orbit cdlawyer-ad__orbit--two">Y</span>
          <span className="cdlawyer-ad__orbit cdlawyer-ad__orbit--three">L</span>
          <span className="cdlawyer-ad__seal"><IconShieldCheck /></span>
          <span className="cdlawyer-ad__spark cdlawyer-ad__spark--one"><IconSparkle /></span>
          <span className="cdlawyer-ad__spark cdlawyer-ad__spark--two"><IconCheck /></span>
        </span>
      </Link>

      {/* Quick actions */}
      <div className="cdact">
        {QUICK_ACTIONS.map((a) => {
          const cls = `cdact__i${a.primary ? " cdact__i--pri" : ""}${a.live ? " cdact__i--live" : ""}`;
          const inner = (
            <>
              {/* Decorative, so it is a background rather than an <img>: it
                  carries no information the title does not already give, and
                  a screen reader reading six illustration names before six
                  identical link labels would be noise. It stays FIRST so the
                  primary card's chevron, which hangs off `span:last-child`,
                  still lands on the text. */}
              <span className="cdact__art" style={{ "--art": `url(/img/${a.art}.png)` } as CSSProperties} aria-hidden />
              <span className="cdact__ico">{a.live ? <i className="cdact__dot" aria-hidden /> : null}<Icon name={a.icon} /></span>
              <span className="cdact__t">
                {ta(a.key)}
                {ACTION_SUB[a.key] ? <span className="cdact__sub">{ta(ACTION_SUB[a.key])}</span> : null}
              </span>
            </>
          );
          return a.ask ? (
            <button type="button" key={a.key} className={cls} onClick={() => setWhoOpen(true)}>{inner}</button>
          ) : (
            <Link href={a.href} key={a.key} className={cls}>{inner}</Link>
          );
        })}
      </div>

      {/* Who should answer this — asked once, before anything is typed.
          Sending every described problem to the AI page hid the fact that a
          real advocate is one of the two answers. */}
      {/* The title and the sub sit in their own column (.cdwho__t) because the
          two options are laid out as full-width rows rather than as a pair of
          stretched cells: at the 516px modal width each title then fits on one
          line, so the longer advocate title no longer wraps while the AI one
          stays short, and neither row is padded out to match the other. */}
      <Modal open={whoOpen} onClose={() => setWhoOpen(false)} title={ta("whoTitle")}>
        <div className="cdwho">
          <p className="cdwho__lead">{ta("whoLead")}</p>
          <div className="cdwho__grid">
            <Link href="/portal/client/urgent" className="cdwho__c cdwho__c--adv" onClick={() => setWhoOpen(false)}>
              <span className="cdwho__i"><IconAdvocatePerson /></span>
              <span className="cdwho__t">
                <b>{ta("whoAdvocate")}</b>
                <span>{ta("whoAdvocateSub")}</span>
              </span>
              <em className="cdwho__go"><IconArrowRight /></em>
            </Link>
            <Link href="/portal/client/ai" className="cdwho__c cdwho__c--ai" onClick={() => setWhoOpen(false)}>
              <span className="cdwho__i"><IconAiAnswer /></span>
              <span className="cdwho__t">
                <b>{ta("whoAi")}</b>
                <span>{ta("whoAiSub")}</span>
              </span>
              <em className="cdwho__go"><IconArrowRight /></em>
            </Link>
          </div>
        </div>
      </Modal>

      {/* Active requests (backend) + sidebar */}
      <div className="cdgrid">
        <div className="ppanel">
          <div className="ppanel__h">
            <b>{t("requests")}</b>
            <Link href="/portal/client/cases">{tc("viewAll")}</Link>
          </div>
          {res.status === "loading" ? (
            <Skeleton rows={3} />
          ) : !openCases.length ? (
            <EmptyState icon={<IconSparkle />} title={t("emptyTitle")} text={t("emptyText")} />
          ) : (
            openCases.map((c) => (
              <div className="creq" key={c.id}>
                <span className="creq__st" />
                <div className="creq__m">
                  {/* CASE-XXXXX went in both lines whenever the case had no
                      type to lead with, so the row printed the same id twice.
                      The meta line carries it only when the title did not. */}
                  <b>{c.caseType || c.caseNumber}</b>
                  <span>{[statusLabel(tc, c.stage), c.caseType ? c.caseNumber : ""].filter(Boolean).join(" · ")}</span>
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
