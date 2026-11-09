"use client";

import "./dash1920.css";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  Gift,
  Loader,
  MapPin,
  MessageSquareText,
  Search,
  Sparkles,
  UserRoundSearch,
  Users,
  X,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/useResource";
import { getMyReferral } from "@/lib/services/backend";
import { listMarketplace, listMarketplaceOrders, type MarketOrder, type MarketSeller } from "@/lib/services/marketplace";
import { clientStageOf, useOrderStatusLabel } from "@/lib/orderStatus";
import { LEGAL_AREAS } from "@/lib/legalAreas";
import { initials } from "@/lib/lawyers";
import { regionLabel } from "@/lib/labels";
import { personName } from "@/lib/labels";
import { shortDateTime } from "@/lib/date";
import { useLocale } from "next-intl";
import Select from "@/components/Select";
import Modal from "@/components/admin/Modal";
import { useLxHeader } from "../shell/lxHeader";
import { sellerTypeLabel, specLabel } from "@/components/marketplace/bits";
import { IconArrowRight, IconCheck } from "@/components/icons";

// The client's dashboard (reference/design-lexgo-1920/1a_mijoz_boshqaruv.png):
// legal areas with search, cases in progress, a quick AI question, priced
// services, specialists and the gift card. Every number is the backend's.

const FINAL = new Set(["completed", "rated", "lost", "cancelled", "canceled", "declined", "refunded"]);
const STEP: Record<string, number> = { request: 1, matching: 1, payment: 2, work: 3, done: 4 };
const REGIONS = ["tashkent", "samarkand", "fergana", "bukhara", "namangan", "andijan", "kashkadarya", "khorezm", "jizzakh", "navoi"];
const GIFT_KEY = "lexgo_dash_gift_closed";

// The card pictures live in public/img/xizmatlar (512px, the drawing centred
// in the same frame on each). "Tezkor Advokat" and the road-accident card
// open the Tezkor Advokat page as it is: no ?service=, so no order dialog
// pops open on arrival — choosing a service there is the client's own step.
// Every other card goes to its own place.
type Svc = { key: "urgent" | "ai" | "docs" | "catalog" | "traffic"; img: string; href: string };
const SERVICES: Svc[] = [
  { key: "urgent", img: "/img/xizmatlar/Tezkor_Advokat.png", href: "/portal/client/urgent" },
  { key: "ai", img: "/img/xizmatlar/suniy-intelekt.png", href: "/portal/client/ai" },
  { key: "docs", img: "/img/xizmatlar/Huquqiy_hujjatlar.png", href: "/portal/client/services" },
  // "Advokat va yuristlar" opened on its "Xizmatlar bo'yicha" view, scrolled
  // to those tabs rather than the hero above them
  { key: "catalog", img: "/img/xizmatlar/xizmatlar.png", href: "/portal/client/lawyers?mode=services#market-modes" },
  // a road accident needs an advocate now: the Tezkor Advokat page, as is
  // (no ?service=, so no order dialog opens on arrival)
  { key: "traffic", img: "/img/xizmatlar/Avtoavariya.png", href: "/portal/client/urgent" },
];

// The questions clients actually open with, in the order they do.
const AI_PROMPTS = ["labor", "rent", "aliment", "traffic"] as const;

function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] ?? "";
}

export default function ClientHome() {
  const t = useTranslations("lxClient");
  const ta = useTranslations("portal.client.actions");
  const te = useTranslations("enums");
  const tm = useTranslations("marketplace");
  const locale = useLocale();
  const router = useRouter();
  const { session } = useAuth();
  const statusLabel = useOrderStatusLabel();

  const orders = useResource(() => listMarketplaceOrders("client"), []);
  const experts = useResource<MarketSeller>(async () => (await listMarketplace({ sort: "recommended" })).items.slice(0, 4), []);
  const referral = useResource(async () => [await getMyReferral()], []);

  const active = useMemo(
    () => orders.data.filter((o) => !FINAL.has((o.status || "").toLowerCase())).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [orders.data],
  );
  useLxHeader(t("hello", { name: firstName(session?.name ?? "") }), active.length ? t("inProgress", { n: active.length }) : undefined);

  const [q, setQ] = useState("");
  const [region, setRegion] = useState("tashkent");
  const [ask, setAsk] = useState("");
  const [whoOpen, setWhoOpen] = useState(false);
  const [giftClosed, setGiftClosed] = useState(false);
  useEffect(() => {
    const h = setTimeout(() => {
      try { setGiftClosed(localStorage.getItem(GIFT_KEY) === "1"); } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(h);
  }, []);

  const find = (e: FormEvent) => {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (region) qs.set("region", region);
    router.push(`/portal/client/lawyers${qs.size ? `?${qs}` : ""}`);
  };
  const openAi = (text: string) => {
    const v = text.trim();
    router.push(`/portal/client/ai${v ? `?q=${encodeURIComponent(v)}` : ""}`);
  };
  const sendAsk = (e: FormEvent) => {
    e.preventDefault();
    openAi(ask);
  };
  return (
    <div className="cx">
      {/* AI — a light card like the rest of the dashboard: name, one line of
          pitch, the prompt field and the questions people actually open with. */}
      <section className="lx-card cx-ai" aria-labelledby="cx-ai-h">
        <div className="cx-ai__h">
          <h2 id="cx-ai-h" className="cx-ai__badge">{t("aiHero.badge")}</h2>
          <span className="cx-ai__free">{t("aiHero.free")}</span>
          <button type="button" className="cx-ai__link" onClick={() => setWhoOpen(true)}>
            <UserRoundSearch aria-hidden="true" />
            {t("ask.who")}
          </button>
          <Link href="/portal/client/ai" className="cx-ai__link">
            {t("aiHero.open")}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <p className="cx-ai__lead">{t("aiHero.lead")}</p>
        <form className="cx-ai__f" onSubmit={sendAsk} data-tour="ai-ask">
          <input
            className="cx-ai__q"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder={t("aiHero.ph")}
            aria-label={t("aiHero.ph")}
          />
          <button type="submit" className="cx-ai__go">
            {t("aiHero.send")}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
        <div className="cx-ai__chips">
          <span className="cx-ai__chipsL">{t("aiHero.tryLabel")}</span>
          {AI_PROMPTS.map((k) => (
            <button key={k} type="button" className="cx-ai__chip" onClick={() => openAi(t(`aiHero.p.${k}`))}>
              {t(`aiHero.p.${k}`)}
            </button>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="cx-svcs" aria-labelledby="cx-svcs-h">
        <div className="cx-head cx-head--bare">
          <div>
            <h2 id="cx-svcs-h" className="lx-h1">{t("services.title")}</h2>
            <p className="lx-sub">{t("services.sub")}</p>
          </div>
          <Link href="/portal/client/marketplace-orders" className="btn btn--line btn--pill cx-head__btn">
            {t("services.mine")}
            <ArrowRight />
          </Link>
        </div>
        <ul className="cx-svcs__grid" data-tour="services">
          {SERVICES.map((s) => (
            <li key={s.key}>
              {/* The whole arch is the link — no button, as in the design. */}
              <Link href={s.href} className="cx-svc">
                <span className="cx-svc__ic" style={{ "--img": `url(${s.img})` } as CSSProperties} />
                <b className="cx-svc__t">{t(`services.${s.key}.t`)}</b>
                <span className="cx-svc__s">{t(`services.${s.key}.s`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="cx-row cx-row--top">
        {/* Legal areas + search */}
        <section className="lx-card cx-areas" aria-labelledby="cx-areas-h" data-tour="areas">
          <div className="cx-head">
            <div>
              <h2 id="cx-areas-h" className="lx-h1">{t("areas.title")}</h2>
              <p className="lx-sub cx-areas__sub">{t("areas.sub")}</p>
            </div>
            <Link href="/portal/client/lawyers" className="btn btn--soft btn--pill cx-head__btn">
              {t("areas.all")}
              <ArrowRight />
            </Link>
          </div>
          <form className="cx-find" onSubmit={find} role="search">
            <label className="cx-find__q">
              <Search aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("areas.searchPh")} aria-label={t("areas.searchPh")} />
            </label>
            <div className="cx-find__region">
              <MapPin aria-hidden="true" />
              <Select value={region} onChange={setRegion} ariaLabel={t("areas.region")} options={REGIONS.map((r) => ({ value: r, label: te(`regions.${r}`) }))} />
            </div>
            <button type="submit" className="btn btn--pri cx-find__go">
              <Search />
              {t("areas.search")}
            </button>
          </form>
          <ul className="cx-areas__grid">
            {LEGAL_AREAS.map((a) => (
              <li key={a.key}>
                <Link href={`/portal/client/lawyers?area=${a.key}`} className="cx-area" aria-label={t("areas.open", { area: t(`area.${a.key}.t`) })}>
                  <span className="cx-area__img" style={{ "--img": `url(${a.image})` } as CSSProperties} />
                  <span className="cx-area__body">
                    <span className="cx-area__txt">
                      <b>{t(`area.${a.key}.t`)}</b>
                      <small>{t(`area.${a.key}.s`)}</small>
                    </span>
                    <span className="cx-area__go" aria-hidden="true"><ArrowUpRight /></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="cx-side">
          {/* Cases in progress */}
          <section className="lx-card cx-works" aria-labelledby="cx-works-h">
            <div className="cx-works__h">
              <h2 id="cx-works-h" className="cx-h3">
                {t("works.title")}
                {active.length ? <span className="cx-count">{active.length}</span> : null}
              </h2>
              <Link href="/portal/client/marketplace-orders" className="cx-link">
                {t("works.all")}
                <ArrowRight />
              </Link>
            </div>
            {orders.status === "loading" ? (
              <div className="cx-works__list">
                <div className="cx-skel" />
                <div className="cx-skel" />
              </div>
            ) : orders.status === "error" ? (
              <div className="cx-empty">
                <b>{t("works.error")}</b>
                <button type="button" className="btn btn--line btn--sm" onClick={() => void orders.refresh()}>{t("works.retry")}</button>
              </div>
            ) : !active.length ? (
              <div className="cx-empty">
                <span className="cx-empty__ic"><Sparkles /></span>
                <b>{t("works.empty")}</b>
                <p>{t("works.emptyText")}</p>
                <Link href="/portal/client/lawyers" className="btn btn--pri btn--sm">{t("works.emptyCta")}<ArrowRight /></Link>
              </div>
            ) : (
              <div className="cx-works__list">
                {active.slice(0, 2).map((o) => (
                  <WorkCard key={o.id} o={o} label={statusLabel(o.status)} locale={locale} />
                ))}
              </div>
            )}
          </section>

          {/* Gift */}
          {giftClosed ? (
            <section className="cx-gift cx-gift--slim" aria-label={t("gift.title")}>
              <span className="cx-gift__ic"><Gift /></span>
              <b>{t("gift.title")}</b>
              <Link href="/portal/client/subscription?tab=gifts" className="btn btn--sm cx-gift__cta">{t("gift.cta")}</Link>
            </section>
          ) : (
            <section className="cx-gift" aria-labelledby="cx-gift-h">
              <div className="cx-gift__top">
                <span className="cx-gift__ic"><Gift /></span>
                <button
                  type="button"
                  className="cx-gift__x"
                  aria-label={t("gift.close")}
                  onClick={() => {
                    setGiftClosed(true);
                    try { localStorage.setItem(GIFT_KEY, "1"); } catch { /* ignore */ }
                  }}
                >
                  <X />
                </button>
              </div>
              <h2 id="cx-gift-h">{t("gift.title")}</h2>
              <p>{t("gift.text")}</p>
              <div className="cx-gift__foot">
                <Link href="/portal/client/subscription?tab=gifts" className="btn cx-gift__cta">{t("gift.cta")}</Link>
                {referral.data[0] ? (
                  <Link href="/portal/client/referrals" className="cx-gift__ref">
                    <Users />
                    {t("gift.ref", { n: referral.data[0].joined })}
                  </Link>
                ) : null}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Specialists */}
      <section className="lx-card cx-experts" aria-labelledby="cx-exp-h">
        <div className="cx-works__h">
          <h2 id="cx-exp-h" className="cx-h3">{t("experts.title")}</h2>
          <Link href="/portal/client/lawyers" className="cx-link">
            {t("experts.all")}
            <ArrowRight />
          </Link>
        </div>
        {experts.status === "loading" ? (
          <div className="cx-experts__grid">
            {[0, 1, 2, 3].map((n) => <div key={n} className="cx-skel cx-skel--tall" />)}
          </div>
        ) : experts.status === "error" || !experts.data.length ? (
          <div className="cx-empty">
            <span className="cx-empty__ic"><Users /></span>
            <b>{experts.status === "error" ? t("experts.error") : t("experts.empty")}</b>
            {experts.status === "error" ? null : <p>{t("experts.emptyText")}</p>}
          </div>
        ) : (
          <div className="cx-experts__grid">
            {experts.data.map((s) => (
              <article key={s.userId} className="cx-exp">
                <div className="cx-exp__ph" role="img" aria-label={t("experts.photo", { name: personName(s.name) })}>
                  <span>{initials(personName(s.name) || "L")}</span>
                </div>
                <div className="cx-exp__b">
                  <Link href={`/portal/client/lawyers/${s.userId}`} className="cx-exp__name">{personName(s.name)}</Link>
                  <span className="cx-exp__role">
                    {sellerTypeLabel(tm, s.sellerType)}
                    {s.verified ? (
                      <span className="cx-ok"><CircleCheck />{t("experts.verified")}</span>
                    ) : null}
                  </span>
                  <span className="cx-tags">
                    {(s.categories.length ? s.categories.map((c) => c.title) : s.specializations.map((x) => specLabel(te, x))).slice(0, 2).map((x) => (
                      <span key={x} className="cx-tag">{x}</span>
                    ))}
                  </span>
                  {s.region ? (
                    <span className="cx-exp__geo"><MapPin />{regionLabel(te, s.region)}</span>
                  ) : null}
                  <div className="cx-exp__act">
                    <Link href={`/portal/client/lawyers/${s.userId}`} className="btn btn--dark btn--sm">{t("experts.consult")}</Link>
                    <Link href={`/portal/client/lawyers/${s.userId}#services`} className="cx-iconbtn" aria-label={t("experts.message")}><MessageSquareText /></Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Modal open={whoOpen} onClose={() => setWhoOpen(false)} title={t("who.title")}>
        <div className="cdwho">
          <p className="cdwho__lead">{ta("whoLead")}</p>
          <div className="cdwho__grid">
            <Link href="/portal/client/urgent" className="cdwho__c cdwho__c--adv" onClick={() => setWhoOpen(false)}>
              <WhoOption art="card-advokatga-tezkor-boglanish" title={ta("whoAdvocate")} sub={ta("whoAdvocateSub")} perks={[ta("whoAdvocatePerk1"), ta("whoAdvocatePerk2")]} cta={ta("whoAdvocateCta")} />
            </Link>
            <Link href="/portal/client/ai" className="cdwho__c cdwho__c--ai" onClick={() => setWhoOpen(false)}>
              <WhoOption art="card-lexgo-ai-sorash" title={ta("whoAi")} sub={ta("whoAiSub")} perks={[ta("whoAiPerk1"), ta("whoAiPerk2")]} cta={ta("whoAiCta")} />
            </Link>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function WorkCard({ o, label, locale: loc }: { o: MarketOrder; label: string; locale: string }) {
  const t = useTranslations("lxClient");
  const stage = clientStageOf(o.status) ?? "request";
  const step = STEP[stage] ?? 1;
  const tone = stage === "payment" ? "warn" : stage === "done" ? "ok" : "blue";
  const who = o.lawyerName ? personName(o.lawyerName) : "";
  return (
    <article className="cx-work">
      <div className="cx-work__h">
        <Link href={`/portal/client/marketplace-orders/${o.id}`} className="cx-work__t">{o.serviceTitle || o.packageTitle || o.workId}</Link>
        <span className={`cx-pill cx-pill--${tone}`}>
          {tone === "warn" ? <Loader /> : <Sparkles />}
          {label}
        </span>
      </div>
      <span className="cx-work__meta">{[o.workId, o.createdAt ? shortDateTime(o.createdAt, loc) : ""].filter(Boolean).join(" · ")}</span>
      <span className={`cx-steps cx-steps--${tone}`} aria-hidden="true">
        {[1, 2, 3, 4].map((n) => <i key={n} className={n <= step ? "on" : ""} />)}
      </span>
      <span className="cx-work__stage">{t("works.step", { n: step })} · {o.clientMessage || t(`works.stageText.${stage === "closed" ? "request" : stage}`)}</span>
      <div className="cx-work__foot">
        <span className="cx-work__who">
          {who ? <span className="cx-av">{initials(who)}</span> : null}
          {who ? t("works.seller", { name: who }) : t("works.waiting")}
        </span>
        {o.roomId && o.canStartChat ? (
          <Link href={`/portal/client/messages?room=${encodeURIComponent(o.roomId)}`} className="cx-iconbtn" aria-label={t("works.chat")}><MessageSquareText /></Link>
        ) : (
          <Link href={`/portal/client/marketplace-orders/${o.id}`} className="cx-iconbtn" aria-label={t("works.open")}><ArrowUpRight /></Link>
        )}
      </div>
    </article>
  );
}

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
