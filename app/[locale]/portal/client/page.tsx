"use client";

import { statusLabel } from "@/lib/labels";

import { useMemo, useState, type ComponentType, type CSSProperties, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { listCases } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { aiId } from "@/lib/ai/ids";
import { useAiField, useAiModal } from "@/lib/ai/registry";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import HeroCarousel from "@/components/portal/HeroCarousel";
import ReferralProgress from "@/components/portal/ReferralProgress";
import LawyerPromo from "@/components/portal/LawyerPromo";
import Modal from "@/components/admin/Modal";
import {
  IconSparkle,
  IconSend,
  IconArrowRight,
  IconShieldCheck,
  IconClock,
  IconCheck,
  IconChatDots,
  IconBolt,
  IconSearch,
  IconAlert,
  IconDownload,
} from "@/components/icons";

const DONE_STATUSES = new Set(["completed", "archived"]);

// `art` is the 3D illustration that sits in the card's bottom-right corner,
// half off the edge and behind the text — the arrangement in the mockup. The
// files are cut-outs on transparency (public/img/card-*.png) and are named
// after the action they belong to, which is the pairing used here.
const QUICK_ACTIONS: {
  key: string;
  ai: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string;
  art: string;
  primary?: boolean;
  live?: boolean;
  ask?: boolean;
}[] = [
  // `ask`: this one opens the advocate-or-AI chooser rather than navigating.
  { key: "describe", ai: "describe", Icon: IconChatDots, href: "/portal/client/ai", art: "card-muammoni-tavsiflash", primary: true, ask: true },
  // "Tezkor Advokat xizmati online" — the live-advocate module. Flagged as
  // live rather than primary so it reads as a service that is on right now,
  // beside the primary AI action instead of competing with it.
  { key: "urgent", ai: "urgent-advokat", Icon: IconBolt, href: "/portal/client/urgent", art: "card-advokatga-tezkor-boglanish", live: true },
  { key: "findSpecialist", ai: "marketplace", Icon: IconSearch, href: "/portal/client/lawyers", art: "card-mutaxassis-topish" },
  { key: "consultation", ai: "consultation", Icon: IconAlert, href: "/portal/client/urgent?service=traffic_accident_consultation", art: "card-avtoavariya-huquqiy-konsultatsiya" },
  { key: "askAi", ai: "ask-ai", Icon: IconSparkle, href: "/portal/client/ai", art: "card-lexgo-ai-sorash" },
  { key: "upload", ai: "doc-analysis", Icon: IconDownload, href: "/portal/client/doc-analysis", art: "card-hujjat-tahlili" },
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

function WhoOption({ art, title, sub, perks, cta }: { art: string; title: string; sub: string; perks: string[]; cta: string }) {
  return (
    <>
      <span className="cdwho__stage" aria-hidden>
        <span className="cdwho__art" style={{ "--art": `url(/img/${art}.png)` } as CSSProperties} />
      </span>
      <b className="cdwho__t">{title}</b>
      <span className="cdwho__sub">{sub}</span>
      <ul className="cdwho__perks">
        {perks.map((p) => (
          <li key={p}>
            <span className="cdwho__tick" aria-hidden><IconCheck /></span>
            {p}
          </li>
        ))}
      </ul>
      <span className="btn btn--pri btn--sm btn--full cdwho__cta">
        {cta}
        <IconArrowRight />
      </span>
    </>
  );
}

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
  useAiField("dashboard.ai-service-finder", { get: () => ask, set: setAsk, sensitive: true, fillable: true });
  useAiModal("dashboard.who-modal", () => setWhoOpen(true));

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
          <div
            className="cdhero__ask"
            data-ai-target="dashboard:ask"
            data-ai-id="dashboard.ai-service-finder"
            data-ai-type="input"
            data-ai-label={t("askPh")}
          >
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
            <button type="button" onClick={describe} aria-label={t("askBtn")} data-ai-id="dashboard.ai-service-finder.submit">
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

      <LawyerPromo />

      {/* Quick actions */}
      <div className="cdact" data-ai-id="dashboard.quick-actions" data-ai-type="list">
        {QUICK_ACTIONS.map((a) => {
          const cls = `cdact__i${a.primary ? " cdact__i--pri" : ""}${a.live ? " cdact__i--live" : ""}`;
          const id = aiId("dashboard.quick-actions", a.ai);
          const label = ta(a.key);
          const inner = (
            <>
              <span className="cdact__art" style={{ "--art": `url(/img/${a.art}.png)` } as CSSProperties} aria-hidden />
              <span className="cdact__ico">{a.live ? <i className="cdact__dot" aria-hidden /> : null}<a.Icon /></span>
              <span className="cdact__t">
                {label}
                {ACTION_SUB[a.key] ? <span className="cdact__sub">{ta(ACTION_SUB[a.key])}</span> : null}
              </span>
            </>
          );
          return a.ask ? (
            <button type="button" key={a.key} className={cls} onClick={() => setWhoOpen(true)} data-ai-target={`dashboard:${a.key}`} data-ai-id={id} data-ai-label={label}>{inner}</button>
          ) : (
            <Link href={a.href} key={a.key} className={cls} data-ai-target={`dashboard:${a.key}`} data-ai-id={id} data-ai-label={label}>{inner}</Link>
          );
        })}
      </div>

      {/* Who should answer this — asked once, before anything is typed.
          Sending every described problem to the AI page hid the fact that a
          real advocate is one of the two answers. */}
      <Modal open={whoOpen} onClose={() => setWhoOpen(false)} title={ta("whoTitle")}>
        <div className="cdwho" data-ai-id="dashboard.who-modal" data-ai-type="modal">
          <p className="cdwho__lead">{ta("whoLead")}</p>
          <div className="cdwho__grid">
            <Link href="/portal/client/urgent" className="cdwho__c cdwho__c--adv" onClick={() => setWhoOpen(false)} data-ai-id="dashboard.who-modal.advocate" data-ai-label={ta("whoAdvocate")}>
              <WhoOption
                art="card-advokatga-tezkor-boglanish"
                title={ta("whoAdvocate")}
                sub={ta("whoAdvocateSub")}
                perks={[ta("whoAdvocatePerk1"), ta("whoAdvocatePerk2")]}
                cta={ta("whoAdvocateCta")}
              />
            </Link>
            <Link href="/portal/client/ai" className="cdwho__c cdwho__c--ai" onClick={() => setWhoOpen(false)} data-ai-id="dashboard.who-modal.ai" data-ai-label={ta("whoAi")}>
              <WhoOption
                art="card-lexgo-ai-sorash"
                title={ta("whoAi")}
                sub={ta("whoAiSub")}
                perks={[ta("whoAiPerk1"), ta("whoAiPerk2")]}
                cta={ta("whoAiCta")}
              />
            </Link>
          </div>
        </div>
      </Modal>

      {/* Active requests (backend) + sidebar */}
      <div className="cdgrid">
        <div className="ppanel" data-ai-target="dashboard:requests" data-ai-id="dashboard.requests" data-ai-type="section">
          <div className="ppanel__h">
            <b>{t("requests")}</b>
            <Link href="/portal/client/cases" data-ai-id="dashboard.requests.view-all">{tc("viewAll")}</Link>
          </div>
          {res.status === "loading" ? (
            <Skeleton rows={3} />
          ) : !openCases.length ? (
            <EmptyState icon={<IconSparkle />} title={t("emptyTitle")} text={t("emptyText")} />
          ) : (
            openCases.map((c) => (
              <div
                className="creq"
                key={c.id}
                data-ai-id={aiId("dashboard.requests.item", c.id)}
                data-ai-type="list_item"
                data-ai-entity-type="case"
                data-ai-entity-id={c.id}
              >
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
          <div className="aicard" data-ai-target="dashboard:ai-card" data-ai-id="dashboard.ai-card" data-ai-type="card">
            <div className="aicard__h">
              <IconSparkle />
              {t("sideAiTitle")}
            </div>
            <p>{t("sideAiSub")}</p>
            <Link href="/portal/client/ai" className="btn btn--glass btn--sm" data-ai-id="dashboard.ai-card.cta">
              {t("sideAiCta")}
              <IconArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
