"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { aiSearchMarketplace, getMarketplaceSeller, listMarketplace, marketAiAvailable, type MarketAiResult, type MarketMeta, type MarketSeller, type MarketSellerDetail } from "@/lib/services/marketplace";
import { regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { matchesSearch } from "@/lib/searchText";
import { IconAlert, IconArrowRight, IconBriefcase, IconCheck, IconRefresh, IconScale, IconSearch, IconShieldCheck, IconSparkle, IconUsers } from "@/components/icons";
import { App, Avatar, Btn, Empty, Loading, Select, Sidebar, Spinner, Tag, Tool, Toolbar, useOs, type NavSection } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { StarsView } from "./bits";
import SellerPage from "./SellerPage";
import "./client.css";
import { categoryName } from "@/lib/categoryNames";

// Advocates and lawyers as a desktop program — a directory like the Mac's
// Contacts in a gallery, or a Windows "People" view: who on the side (all,
// advocates, lawyers), the region, category and rating in the toolbar, the
// verified specialists as cards; typing what happened asks the AI to rank
// them, with its reasons on each card. The chosen one opens on the right
// with their numbers, about, services and prices, and reviews; "Order"
// opens their page (SellerPage) in this window.

type Who = "all" | "advokat" | "yurist";

export default function LawyersApp(props: NativeProps) {
  const id = /\/lawyers\/([^/?#]+)/.exec(props.route)?.[1];
  if (id) return <SellerPage {...props} userId={decodeURIComponent(id)} />;
  return <Directory {...props} />;
}

function Directory({ base, openApp }: NativeProps) {
  const locale = useLocale();
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const d = useTranslations("portal.desk.client");
  const os = useOs();
  const [items, setItems] = useState<MarketSeller[] | null>(null);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<MarketMeta | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [tick, setTick] = useState(0);
  const [who, setWho] = useState<Who>("all");
  const [region, setRegion] = useState("");
  const [cat, setCat] = useState("");
  const [rating, setRating] = useState("");
  const [q, setQ] = useState("");
  const [ai, setAi] = useState<MarketAiResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [sel, setSel] = useState("");
  const metaOnce = useRef(false);

  useEffect(() => {
    let alive = true;
    listMarketplace({ sort: "recommended", includeMeta: !metaOnce.current, offset: 0 })
      .then((l) => {
        if (!alive) return;
        setItems(l.items);
        setTotal(l.total);
        if (l.meta) {
          metaOnce.current = true;
          setMeta(l.meta);
        }
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [tick]);
  // The AI ranks the specialists for what the client wrote: after a pause
  // in typing, three letters or more.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3 || !marketAiAvailable()) {
      const h = setTimeout(() => setAi(null), 0);
      return () => clearTimeout(h);
    }
    const c = new AbortController();
    const h = setTimeout(() => {
      setAsking(true);
      aiSearchMarketplace(term, { region: region || undefined, sellerType: who === "all" ? undefined : who, signal: c.signal })
        .then((r) => !c.signal.aborted && setAi(r && r.matches.length ? r : null))
        .catch(() => !c.signal.aborted && setAi(null))
        .finally(() => !c.signal.aborted && setAsking(false));
    }, 600);
    return () => {
      clearTimeout(h);
      c.abort();
    };
  }, [q, region, who]);
  const loadMore = async () => {
    if (!items || more) return;
    setMore(true);
    try {
      const l = await listMarketplace({ sort: "recommended", offset: items.length });
      setItems((cur) => {
        const have = new Set((cur ?? []).map((s) => s.userId));
        return [...(cur ?? []), ...l.items.filter((s) => !have.has(s.userId))];
      });
      setTotal(l.total);
    } finally {
      setMore(false);
    }
  };

  const all = useMemo(() => items ?? [], [items]);
  const pass = (s: MarketSeller) => (who === "all" || s.sellerType === who) && (!region || s.region === region) && (!cat || s.categories.some((c) => c.id === cat) || s.services.some((x) => x.categoryId === cat)) && (!rating || s.rating >= Number(rating));
  const score = useMemo(() => new Map((ai?.matches ?? []).map((m) => [m.userId, m])), [ai]);
  const shown = useMemo(() => {
    if (ai) {
      const byId = new Map(all.map((s) => [s.userId, s]));
      return ai.matches.map((m) => byId.get(m.userId) ?? m.seller).filter((s): s is MarketSeller => !!s && pass(s));
    }
    return all.filter((s) => pass(s) && (!q.trim() || matchesSearch(`${s.name} ${s.organizationName} ${s.specializations.join(" ")} ${s.serviceTitles.join(" ")}`, q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, ai, who, region, cat, rating, q]);
  const cur = shown.find((s) => s.userId === sel) ?? null;
  const ts = useTranslations("portal.client.dashboard.search.filters");
  const typeName = (k: string) => (t.has(`roles.${k}`) ? t(`roles.${k}`) : k);
  const sections: NavSection[] = [
    {
      id: "w",
      title: os === "mac" ? t("kicker") : undefined,
      items: [
        { id: "all", label: t("filters.allSellerTypes"), icon: <IconUsers />, count: all.length || undefined },
        { id: "advokat", label: ts("advokat"), icon: <IconScale />, count: all.filter((s) => s.sellerType === "advokat").length || undefined },
        { id: "yurist", label: ts("yurist"), icon: <IconBriefcase />, count: all.filter((s) => s.sellerType === "yurist").length || undefined },
      ],
    },
  ];
  const open = (s: MarketSeller) => openApp("lawyers", `${base}/lawyers/${encodeURIComponent(s.userId)}`);

  return (
    <App name="clawyers" sidebar={<Sidebar label={t("kicker")} sections={sections} value={who} onChange={(w) => (setWho(w as Who), setSel(""))} />} inspector={cur ? <Profile key={cur.userId} s={cur} onOrder={() => open(cur)} reasons={score.get(cur.userId)?.reasons ?? []} /> : undefined}>
      <Toolbar title={who === "all" ? t("filters.allSellerTypes") : ts(who)} subtitle={items ? t("count", { n: ai ? shown.length : total }) : undefined}>
        <Select value={region} onChange={setRegion} ariaLabel={t("filters.region")} options={[{ value: "", label: t("filters.allRegions") }, ...(meta?.regions ?? [...new Set(all.map((s) => s.region).filter(Boolean))]).map((r) => ({ value: r, label: regionLabel(te, r) }))]} />
        <Select value={cat} onChange={setCat} ariaLabel={t("filters.category")} options={[{ value: "", label: t("filters.allCategories") }, ...(meta?.categories ?? []).map((c) => ({ value: c.id, label: categoryName(c, locale) }))]} />
        <Select value={rating} onChange={setRating} ariaLabel={t("filters.rating")} options={[{ value: "", label: `${t("filters.rating")}: ${t("filters.any")}` }, { value: "4", label: "★ 4+" }, { value: "4.5", label: "★ 4.5+" }]} />
        <Tool icon={<IconRefresh />} label={t("retry")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      <div className="dxcl-ask">
        <label className="dxcl-ask__f">
          {asking ? <Spinner small /> : <IconSparkle aria-hidden />}
          <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 200))} placeholder={t("searchPh")} aria-label={t("searchLabel")} />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label={t("searchClear")}>
              ✕
            </button>
          ) : null}
        </label>
        {ai ? (
          <p className="dxcl-ask__ai">
            <IconSparkle aria-hidden /> {ai.summary || t("aiFound", { n: shown.length })} <small>{t("aiDisclaimer")}</small>
          </p>
        ) : null}
      </div>
      <div className="dxcl-body">
        {items === null ? (
          failed ? (
            <Empty icon={<IconAlert />} title={t("error")} action={<Btn onClick={() => setTick((n) => n + 1)}>{t("retry")}</Btn>} />
          ) : (
            <Loading label={t("kicker")} />
          )
        ) : !shown.length ? (
          <Empty icon={<IconSearch />} title={t("empty")} text={q ? t("emptyTextAi") : t("emptyText")} action={<Btn onClick={() => (setRegion(""), setCat(""), setRating(""), setQ(""))}>{t("filters.reset")}</Btn>} />
        ) : (
          <>
            <div className="dxcl-grid" role="listbox" aria-label={t("kicker")}>
              {shown.map((s) => {
                const m = score.get(s.userId);
                return (
                  <div key={s.userId} role="option" tabIndex={0} aria-selected={sel === s.userId} className={`dxcl-card${sel === s.userId ? " is-on" : ""}`} onClick={() => setSel(s.userId)} onDoubleClick={() => open(s)} onKeyDown={(e) => e.key === "Enter" && open(s)}>
                    <Avatar name={s.name || "?"} size={52} />
                    <b>
                      {s.name}
                      {s.verified ? <IconShieldCheck className="dxcl-ok" aria-label={d("verified")} /> : null}
                    </b>
                    <small>{[typeName(s.sellerType), s.region ? regionLabel(te, s.region) : ""].filter(Boolean).join(" · ")}</small>
                    <span className="dxcl-card__rate">
                      {s.reviewsCount > 0 ? (
                        <>
                          <StarsView value={s.rating} small /> {fmtRating(s.rating, "uz")} <em>({s.reviewsCount})</em>
                        </>
                      ) : (
                        <em>{d("new")}</em>
                      )}
                    </span>
                    {s.priceFrom ? <span className="dxcl-card__price">{d("from", { price: fmtUzs(s.priceFrom) })}</span> : null}
                    {m ? <Tag tone="accent">{t("aiMatch", { pct: Math.round(m.score * 100) })}</Tag> : s.isSponsored ? <Tag tone="info">{d("sponsored")}</Tag> : null}
                  </div>
                );
              })}
            </div>
            {!ai && all.length < total ? (
              <div className="dxcw-more">
                <Btn small busy={more} onClick={() => void loadMore()}>
                  {t("loadMore")}
                </Btn>
              </div>
            ) : null}
          </>
        )}
      </div>
    </App>
  );
}

// The chosen specialist: numbers, about, services, reviews.
function Profile({ s, onOrder, reasons }: { s: MarketSeller; onOrder: () => void; reasons: string[] }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const [det, setDet] = useState<MarketSellerDetail | null>(null);
  useEffect(() => {
    let alive = true;
    getMarketplaceSeller(s.userId)
      .then((x) => alive && setDet(x))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [s.userId]);
  const x = det ?? s;
  const stats: [string, string][] = [
    [d("rating"), x.reviewsCount > 0 ? `${fmtRating(x.rating, locale)} · ${x.reviewsCount}` : d("new")],
    ...(x.experienceYears ? ([[d("experience"), d("years", { n: x.experienceYears })]] as [string, string][]) : []),
    ...(x.completedOrders ? ([[d("completed"), String(x.completedOrders)]] as [string, string][]) : []),
    ...(x.successRate ? ([[d("success"), `${Math.round(x.successRate)}%`]] as [string, string][]) : []),
  ];
  return (
    <aside className="dxcw-insp dxcl-insp" aria-label={x.name}>
      <header className="dxcl-hero">
        <Avatar name={x.name || "?"} size={72} />
        <h2>{x.name}</h2>
        <small>{[t.has(`roles.${x.sellerType}`) ? t(`roles.${x.sellerType}`) : x.sellerType, x.organizationName, x.region ? regionLabel(te, x.region) : ""].filter(Boolean).join(" · ")}</small>
        <span className="dxcw-tags">
          {x.verified ? (
            <Tag tone="ok">
              <IconShieldCheck aria-hidden /> {d("verified")}
            </Tag>
          ) : null}
          {x.onlineNow ? <Tag tone="info">{d("online")}</Tag> : null}
        </span>
      </header>
      <div className="dxcl-stats">
        {stats.map(([k, v]) => (
          <span key={k}>
            <b>{v}</b>
            <small>{k}</small>
          </span>
        ))}
      </div>
      <Btn kind="primary" icon={<IconArrowRight />} onClick={onOrder}>
        {d("order")}
      </Btn>
      {reasons.length ? (
        <section>
          <h3>{t("aiReasons")}</h3>
          <ul className="dxcl-why">
            {reasons.map((r) => (
              <li key={r}>
                <IconCheck aria-hidden /> {r}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {x.bio ? (
        <section>
          <h3>{d("about")}</h3>
          <p>{x.bio}</p>
        </section>
      ) : null}
      {x.specializations.length ? (
        <section>
          <h3>{t("filters.specialization")}</h3>
          <span className="dxcw-tags">
            {x.specializations.slice(0, 8).map((sp) => (
              <Tag key={sp}>{sp}</Tag>
            ))}
          </span>
        </section>
      ) : null}
      {x.services.length ? (
        <section>
          <h3>{t("filters.service")}</h3>
          <ul className="dxco-opts">
            {x.services.slice(0, 12).map((sv) => (
              <li key={sv.id}>
                <span>{sv.title}</span>
                {sv.price ? <b>{fmtUzs(sv.price)}</b> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {det?.reviews.length ? (
        <section>
          <h3>{d("reviews")}</h3>
          <ul className="dxcl-reviews">
            {det.reviews.slice(0, 4).map((r) => (
              <li key={r.id}>
                <span>
                  <b>{r.author || "—"}</b>
                  <StarsView value={r.rating} small />
                </span>
                {r.comment ? <p>{r.comment}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
