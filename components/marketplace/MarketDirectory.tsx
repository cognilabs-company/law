"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import { IconArrowRight, IconAward, IconBriefcase, IconCard, IconClose, IconFileText, IconGavel, IconHeadset, IconLayers, IconMapPin, IconRefresh, IconScale, IconShieldCheck, IconSparkle, IconStar, IconUser, IconUsers } from "@/components/icons";
import HeroShowcase from "./HeroShowcase";
import VerifiedBadge from "@/components/VerifiedBadge";
import { aiSearchMarketplace, listMarketplace, marketAiAvailable, rememberSellers, type MarketAiMatch, type MarketMeta, type MarketPromotionSurface, type MarketSeller } from "@/lib/services/marketplace";
import { matchesSearch, normalizeSearchText, searchTerms } from "@/lib/searchText";
import { regionKeyOf, regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { Monogram, hasRating, hasSuccess, sellerTypeLabel, specLabel } from "./bits";
import { aiId } from "@/lib/ai/ids";
import { useAiField, useAiSelection } from "@/lib/ai/registry";
import PromotionSurfaces from "./PromotionSurfaces";

type Status = "loading" | "ready" | "error";

const SORT = "recommended";
const PRICE_STEPS = [300000, 500000, 1000000, 2000000];
const EXPERIENCE_STEPS = [3, 5, 10];

function aiNorm(v: string): string {
  return v.toLowerCase().replace(/[ʻʼ'‘’`]/g, "").replace(/\s+/g, " ").trim();
}

function aiOption(opts: { value: string; label: string }[], raw: string): string | null {
  const w = aiNorm(raw);
  if (!w) return "";
  const hit =
    opts.find((o) => o.value && aiNorm(o.value) === w) ??
    opts.find((o) => o.value && aiNorm(o.label) === w) ??
    opts.find((o) => o.value && (aiNorm(o.label).includes(w) || (w.length >= 4 && w.includes(aiNorm(o.label)))));
  return hit ? hit.value : null;
}

function aiNumber(raw: string): number {
  const s = aiNorm(raw);
  const digits = s.replace(/[^\d.,]/g, "");
  if (!digits) return NaN;
  const base = /^\d{1,3}([.,]\d{3})+$/.test(digits) ? Number(digits.replace(/[.,]/g, "")) : Number(digits.replace(",", "."));
  const mult = /mln|million|млн/.test(s) ? 1e6 : /ming|тыс|\d\s*k\b/.test(s) ? 1e3 : 1;
  return base * mult;
}

function aiPriceStep(raw: string): string | null {
  if (!aiNorm(raw)) return "";
  const v = aiNumber(raw);
  if (!Number.isFinite(v) || v <= 0) return null;
  const step = PRICE_STEPS.find((p) => p >= v);
  return step ? String(step) : "";
}

function aiExperienceStep(raw: string): string | null {
  if (!aiNorm(raw)) return "";
  const v = aiNumber(raw);
  if (!Number.isFinite(v) || v < 0) return null;
  const step = [...EXPERIENCE_STEPS].reverse().find((n) => n <= v);
  return step ? String(step) : "";
}

function aiRatingStep(raw: string): string | null {
  if (!aiNorm(raw)) return "";
  const v = aiNumber(raw);
  if (!Number.isFinite(v)) return null;
  return v >= 4.5 ? "4.5" : v >= 4 ? "4" : "";
}

function chipIcon(label: string) {
  const l = label.toLowerCase();
  if (/aliment|nikoh|ajrash|oila|farzand|meros/.test(l)) return IconUsers;
  if (/shartnoma|hujjat|ariza|da'vo|davo/.test(l)) return IconFileText;
  if (/jinoy|sud|himoya/.test(l)) return IconGavel;
  return IconScale;
}

export default function MarketDirectory({ variant, initialArea = "" }: { variant: "public" | "portal"; initialArea?: string }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const locale = useLocale();
  const base = variant === "portal" ? "/portal/client/lawyers" : "/lawyers";

  const [items, setItems] = useState<MarketSeller[]>([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<MarketMeta | null>(null);
  const [sponsored, setSponsored] = useState<MarketPromotionSurface[]>([]);
  const [banners, setBanners] = useState<MarketPromotionSurface[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [moreBusy, setMoreBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const seq = useRef(0);
  const metaRef = useRef<MarketMeta | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const typedRef = useRef(false);

  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [spec, setSpec] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [service, setService] = useState("");
  const [minRating, setMinRating] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [minExp, setMinExp] = useState("");
  const [sellerType, setSellerType] = useState("");
  const [ai, setAi] = useState<{ q: string; matches: MarketAiMatch[]; summary: string; disclaimer: string; sponsored: MarketPromotionSurface[]; banners: MarketPromotionSurface[] } | null>(null);
  const aiCtrl = useRef<AbortController | null>(null);
  const [aiPending, setAiPending] = useState("");
  const aiSeq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    listMarketplace({ sort: SORT, includeMeta: !metaRef.current })
      .then((r) => {
        if (my !== seq.current) return;
        rememberSellers(r.items);
        setItems(r.items);
        setTotal(r.total);
        if (r.meta) {
          metaRef.current = r.meta;
          setMeta(r.meta);
        }
        setSponsored(r.sponsored);
        setBanners(r.banners);
        setStatus("ready");
      })
      .catch(() => {
        if (my !== seq.current) return;
        setStatus((s) => (s === "ready" ? s : "error"));
      });
  }, [reload]);

  const retry = () => {
    setStatus("loading");
    setReload((n) => n + 1);
  };

  const loadMore = useCallback(async () => {
    if (moreBusy) return;
    setMoreBusy(true);
    const my = seq.current;
    const r = await listMarketplace({ sort: SORT, offset: items.length }).catch(() => null);
    setMoreBusy(false);
    if (!r || my !== seq.current) return;
    rememberSellers(r.items);
    setItems((cur) => {
      const seen = new Set(cur.map((x) => x.userId));
      return cur.concat(r.items.filter((x) => !seen.has(x.userId)));
    });
    setTotal(r.total);
  }, [moreBusy, items.length]);

  const allSpecs = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of items) for (const sp of s.specializations) if (!m.has(sp.toLowerCase())) m.set(sp.toLowerCase(), sp);
    return [...m.entries()].map(([value, raw]) => ({ value, label: specLabel(te, raw) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [items, te]);

  const areaSpec = useMemo(() => {
    const a = initialArea.trim().toLowerCase();
    if (!a) return "";
    return allSpecs.find((s) => s.value === a || s.value.includes(a))?.value ?? "";
  }, [initialArea, allSpecs]);
  const effSpec = spec ?? areaSpec;

  const regionOpts = useMemo(() => {
    const keys = new Map<string, string>();
    for (const s of items) {
      if (!s.region) continue;
      const k = regionKeyOf(te, s.region) || s.region.toLowerCase();
      if (!keys.has(k)) keys.set(k, regionLabel(te, s.region));
    }
    return [...keys.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [items, te]);

  const sellerTypes = useMemo(() => {
    const seen = new Set<string>();
    const src = meta?.sellerTypes.length ? meta.sellerTypes : items.map((s) => s.sellerType);
    for (const v of src) if (v === "advokat" || v === "yurist") seen.add(v);
    return (["advokat", "yurist"] as const).filter((v) => seen.has(v)).map((value) => ({ value, label: sellerTypeLabel(t, value) }));
  }, [meta, items, t]);

  const categories = useMemo(() => {
    const src = meta?.categories.length ? meta.categories : items.flatMap((s) => s.categories);
    const m = new Map<string, string>();
    for (const c of src) if (c.id && !m.has(c.id)) m.set(c.id, specLabel(te, c.title || c.slug));
    return [...m.entries()].map(([value, label]) => ({ value, label }));
  }, [meta, items, te]);

  const services = useMemo(() => {
    const src = meta?.services.length ? meta.services : items.flatMap((s) => s.services.map((x) => ({ id: x.id, title: x.title, categoryId: x.categoryId, basePrice: x.basePrice })));
    const m = new Map<string, { value: string; label: string; categoryId: string }>();
    for (const x of src) if (x.id && !m.has(x.id)) m.set(x.id, { value: x.id, label: x.title, categoryId: x.categoryId });
    return [...m.values()].filter((x) => !category || x.categoryId === category);
  }, [meta, items, category]);

  const query = q.trim();
  const aiHit = ai && ai.q === query && ai.matches.length ? ai : null;
  const aiEmpty = Boolean(ai && ai.q === query && !ai.matches.length);
  const aiThinking = Boolean(query) && aiPending === query;

  const list = useMemo(() => {
    const minR = Number(minRating) || 0;
    const maxP = Number(priceMax) || 0;
    const rank = new Map((aiHit?.matches ?? []).map((m, i) => [m.userId, i]));
    const known = new Set(items.map((s) => s.userId));
    const extra = (aiHit?.matches ?? []).map((m) => m.seller).filter((x): x is MarketSeller => Boolean(x && x.verified && !known.has(x.userId)));
    const hayOf = (s: MarketSeller) => [s.name, s.organizationName, regionLabel(te, s.region), s.district, ...s.specializations.map((x) => specLabel(te, x)), ...s.serviceTitles, ...s.services.map((x) => x.title), ...s.categories.map((c) => c.title)].join(" ");
    const pool = items.concat(extra).filter((s) => {
      if (region && (regionKeyOf(te, s.region) || s.region.toLowerCase()) !== region) return false;
      if (sellerType && s.sellerType !== sellerType) return false;
      if (effSpec && !s.specializations.some((x) => x.toLowerCase() === effSpec)) return false;
      if (category && !s.categories.some((c) => c.id === category) && !s.services.some((x) => x.categoryId === category)) return false;
      if (service && !s.services.some((x) => x.id === service)) return false;
      if (minR && !(hasRating(s) && s.rating >= minR)) return false;
      if (maxP && !(s.priceFrom > 0 && s.priceFrom <= maxP)) return false;
      if (Number(minExp) && s.experienceYears < Number(minExp)) return false;
      return true;
    });
    if (aiHit) return pool.filter((s) => rank.has(s.userId)).sort((a, b) => (rank.get(a.userId) ?? 0) - (rank.get(b.userId) ?? 0));
    if (!q.trim() || aiThinking) return pool;
    const strict = pool.filter((s) => matchesSearch(hayOf(s), q));
    if (strict.length) return strict;
    const words = searchTerms(q).filter((w) => w.length >= 4);
    return pool
      .map((s) => {
        const hay = normalizeSearchText(hayOf(s));
        return { s, hits: words.filter((w) => hay.includes(w)).length };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .map((x) => x.s);
  }, [items, region, sellerType, effSpec, category, service, minRating, priceMax, minExp, q, te, aiHit, aiThinking]);

  const aiMatchOf = useMemo(() => new Map((aiHit?.matches ?? []).map((m) => [m.userId, m])), [aiHit]);

  const regionRaw = useMemo(() => (region ? items.find((s) => (regionKeyOf(te, s.region) || s.region.toLowerCase()) === region)?.region ?? "" : ""), [region, items, te]);

  const runAi = useCallback(
    async (text: string) => {
      const wanted = text.trim();
      if (wanted.length < 3 || !marketAiAvailable()) return;
      aiCtrl.current?.abort();
      const c = new AbortController();
      aiCtrl.current = c;
      const my = ++aiSeq.current;
      setAiPending(wanted);
      let r: Awaited<ReturnType<typeof aiSearchMarketplace>> = null;
      try {
        r = await aiSearchMarketplace(wanted, { region: regionRaw, sellerType, signal: c.signal });
      } catch {
        return;
      }
      if (my !== aiSeq.current || c.signal.aborted) return;
      setAiPending("");
      setAi(r ? { q: wanted, matches: r.matches, summary: r.summary, disclaimer: r.disclaimer, sponsored: r.sponsored, banners: r.banners } : null);
    },
    [regionRaw, sellerType],
  );

  useEffect(() => {
    if (query.length < 3) return;
    const id = window.setTimeout(() => void runAi(query), 500);
    return () => window.clearTimeout(id);
  }, [query, runAi]);

  useEffect(() => () => aiCtrl.current?.abort(), []);

  const activeFilters = [region, sellerType, effSpec, category, service, minRating, priceMax, minExp].filter(Boolean).length;
  const resetFilters = () => {
    setRegion("");
    setSellerType("");
    setSpec("");
    setCategory("");
    setService("");
    setMinRating("");
    setPriceMax("");
    setMinExp("");
    setQ("");
  };

  const filtering = Boolean(q.trim()) || activeFilters > 0;

  const stats = useMemo(() => {
    const ids = new Set<string>();
    let min = 0;
    for (const s of list) {
      for (const x of s.services) ids.add(x.id);
      if (s.priceFrom > 0 && (!min || s.priceFrom < min)) min = s.priceFrom;
    }
    return { sellers: filtering ? list.length : total || items.length, services: ids.size, min };
  }, [list, filtering, items.length, total]);

  useEffect(() => {
    if (!typedRef.current || !q.trim()) return;
    const id = window.setTimeout(() => {
      const el = resultsRef.current;
      if (!el || el.getBoundingClientRect().top < window.innerHeight * 0.75) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 500);
    return () => window.clearTimeout(id);
  }, [q]);

  const examples = useMemo(() => {
    const groups = new Set<string>();
    const out: string[] = [];
    for (const s of services) {
      const label = s.label.trim();
      if (!label || label.length > 30 || groups.has(s.categoryId)) continue;
      groups.add(s.categoryId);
      out.push(label);
      if (out.length === 3) break;
    }
    return out;
  }, [services]);
  const [exampleAt, setExampleAt] = useState(0);
  useEffect(() => {
    if (q || examples.length < 2) return;
    const id = window.setInterval(() => setExampleAt((i) => i + 1), 3200);
    return () => window.clearInterval(id);
  }, [q, examples.length]);
  const showResults = () => {
    void runAi(q);
    const el = resultsRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const filterFields: FilterField[] = [
    { key: "region", label: t("filters.region"), icon: IconMapPin, value: region, onChange: setRegion, options: [{ value: "", label: t("filters.allRegions") }, ...regionOpts], aiId: "marketplace.filters.region" },
    { key: "seller-type", label: t("filters.sellerType"), icon: IconUser, value: sellerType, onChange: setSellerType, options: [{ value: "", label: t("filters.allSellerTypes") }, ...sellerTypes], aiId: "marketplace.filters.seller-type" },
    {
      key: "category",
      label: t("filters.category"),
      icon: IconLayers,
      value: category,
      onChange: (v) => {
        setCategory(v);
        setService("");
      },
      options: [{ value: "", label: t("filters.allCategories") }, ...categories],
      aiId: "marketplace.filters.category",
    },
    { key: "service", label: t("filters.service"), icon: IconBriefcase, value: service, onChange: setService, options: [{ value: "", label: t("filters.allServices") }, ...services.map(({ value, label }) => ({ value, label }))], aiId: "marketplace.filters.service" },
    { key: "exp", label: t("filters.experience"), icon: IconAward, value: minExp, onChange: setMinExp, options: [{ value: "", label: t("filters.any") }, ...EXPERIENCE_STEPS.map((n) => ({ value: String(n), label: t("filters.expN", { n }) }))], aiId: "marketplace.filters.experience" },
    { key: "rating", label: t("filters.rating"), icon: IconStar, value: minRating, onChange: setMinRating, options: [{ value: "", label: t("filters.any") }, { value: "4", label: "4.0+" }, { value: "4.5", label: "4.5+" }], chip: minRating ? `★ ${minRating}+` : undefined, aiId: "marketplace.filters.rating" },
    { key: "price", label: t("filters.priceMax"), icon: IconCard, value: priceMax, onChange: setPriceMax, options: [{ value: "", label: t("filters.any") }, ...PRICE_STEPS.map((p) => ({ value: String(p), label: `≤ ${fmtUzs(p)}` }))], aiId: "marketplace.filters.price" },
    { key: "spec", label: t("filters.specialization"), value: effSpec, onChange: (v) => setSpec(v), options: [{ value: "", label: "" }, ...allSpecs], hidden: true },
  ];

  const searchField = { get: () => q, set: (v: string) => setQ(v) };
  useAiField("marketplace.search.input", searchField);
  useAiField("marketplace.ai-search.input", searchField);
  useAiField("marketplace.filters.region", {
    get: () => region,
    set: (v) => {
      const next = aiOption(regionOpts, v);
      if (next !== null) setRegion(next);
    },
  });
  useAiField("marketplace.filters.seller-type", {
    get: () => sellerType,
    set: (v) => {
      const w = aiNorm(v);
      const next = !w ? "" : /advokat|адвокат|advocate/.test(w) ? "advokat" : /yurist|юрист|lawyer/.test(w) ? "yurist" : aiOption(sellerTypes, v);
      if (next !== null) setSellerType(next);
    },
  });
  useAiField("marketplace.filters.specialization", {
    get: () => effSpec,
    set: (v) => {
      const next = aiOption(allSpecs, v);
      if (next !== null) setSpec(next);
    },
  });
  useAiField("marketplace.filters.category", {
    get: () => category,
    set: (v) => {
      const next = aiOption(categories, v);
      if (next === null) return;
      setCategory(next);
      setService("");
    },
  });
  useAiField("marketplace.filters.service", {
    get: () => service,
    set: (v) => {
      const next = aiOption(services, v);
      if (next !== null) setService(next);
    },
  });
  useAiField("marketplace.filters.experience", {
    get: () => minExp,
    set: (v) => {
      const next = aiExperienceStep(v);
      if (next !== null) setMinExp(next);
    },
  });
  useAiField("marketplace.filters.rating", {
    get: () => minRating,
    set: (v) => {
      const next = aiRatingStep(v);
      if (next !== null) setMinRating(next);
    },
  });
  useAiField("marketplace.filters.price", {
    get: () => priceMax,
    set: (v) => {
      const next = aiPriceStep(v);
      if (next !== null) setPriceMax(next);
    },
  });
  useAiSelection("region", regionRaw || region);
  useAiSelection("seller_type", sellerType);
  useAiSelection("specialization", effSpec);
  useAiSelection("category_id", category);
  useAiSelection("service_id", service);
  useAiSelection("min_rating", minRating);
  useAiSelection("price_max", priceMax);
  useAiSelection("min_experience", minExp);

  return (
    <section className={`mk mk--${variant}`}>
      <div className="mk-hero">
        <div className="mk-hero__glow" aria-hidden="true" />
        <div className="mk-hero__in">
          <span className="mk-kick">
            <IconShieldCheck />
            {t("kicker")}
          </span>
          <h1 className="mk-hero__t">{t.rich("title", { hl: (chunks) => <span className="mk-hero__hl">{chunks}</span> })}</h1>
          <p className="mk-hero__l">{t("lead")}</p>
          <label
            className={`mk-search mk-search--ai${aiThinking ? " is-thinking" : ""}`}
            data-ai-target="marketplace:ai-search"
            data-ai-id="marketplace.search.input"
            data-ai-type="input"
            data-ai-label={t("searchLabel")}
          >
            <span className="mk-search__ai" aria-hidden="true">
              <IconSparkle />
            </span>
            <input
              value={q}
              onChange={(e) => {
                typedRef.current = true;
                setQ(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") showResults();
              }}
              placeholder={examples.length ? t("searchPhExample", { ex: examples[exampleAt % examples.length] }) : t("searchPh")}
              aria-label={t("searchLabel")}
              data-ai-target="marketplace:ai-search-input"
              data-ai-id="marketplace.ai-search.input"
            />
            {q ? (
              <>
                <span className="mk-search__n">{t("count", { n: list.length })}</span>
                <button type="button" className="mk-search__x" onClick={() => setQ("")} aria-label={t("searchClear")} data-ai-id="marketplace.search.clear">
                  <IconClose />
                </button>
              </>
            ) : null}
            <button type="button" className="mk-search__go" onClick={showResults} data-ai-id="marketplace.ai-search.submit">
              <span>{t("findBtn")}</span>
              <IconArrowRight />
            </button>
          </label>
          <div className="mk-aistate" aria-live="polite">
            {aiThinking ? (
              <span className="mk-aistate__busy">
                <IconSparkle />
                {t("aiThinking")}
                <i />
                <i />
                <i />
              </span>
            ) : aiHit ? (
              <span className="mk-aistate__done">
                <IconSparkle />
                {t("aiFound", { n: list.length })}
                {aiHit.summary ? <em>{aiHit.summary}</em> : null}
              </span>
            ) : aiEmpty ? (
              <span className="mk-aistate__none">
                <IconSparkle />
                {t("aiNone")}
              </span>
            ) : null}
            {(aiHit || aiEmpty) && !aiThinking ? <small className="mk-aistate__note">{ai?.disclaimer && locale === "uz" ? ai.disclaimer : t("aiDisclaimer")}</small> : null}
          </div>
          {examples.length ? (
            <div className="mk-hero__ex">
              <span>{t("examplesLabel")}</span>
              {examples.map((x) => {
                const ChipIcon = chipIcon(x);
                return (
                  <button
                    key={x}
                    type="button"
                    className={q === x ? "on" : undefined}
                    onClick={() => {
                      typedRef.current = true;
                      setQ(x);
                    }}
                  >
                    <ChipIcon />
                    {x}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="mk-hero__stats">
            <div>
              <b>
                <IconUsers />
                {status === "loading" ? "—" : stats.sellers}
              </b>
              <span>{t("heroStats.sellers")}</span>
            </div>
            <div>
              <b>
                <IconBriefcase />
                {status === "loading" ? "—" : stats.services}
              </b>
              <span>{t("heroStats.services")}</span>
            </div>
            <div>
              <b>
                <IconCard />
                {stats.min ? fmtUzs(stats.min) : "—"}
              </b>
              <span>{t("heroStats.from")}</span>
            </div>
          </div>
        </div>
        <HeroShowcase items={items} base={base} locale={locale} />
      </div>

      <FilterBar
        variant="market"
        fields={filterFields}
        count={list.length}
        onReset={resetFilters}
        title={t("filters.toggle")}
        aiId="marketplace.filters"
        aiTarget="marketplace:filters"
      />

      <PromotionSurfaces banners={aiHit?.banners.length ? aiHit.banners : banners} sponsored={aiHit?.sponsored.length ? aiHit.sponsored : sponsored} base={base} />

      <div className="mk-count" ref={resultsRef} aria-live="polite">
        {status === "ready" ? t("count", { n: list.length }) : null}
      </div>

      {status === "loading" ? (
        <div className="mk-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="mk-card mk-card--ghost" aria-hidden="true" />
          ))}
        </div>
      ) : status === "error" ? (
        <div className="mk-empty">
          <b>{t("error")}</b>
          <button type="button" className="btn btn--line btn--sm" onClick={retry}>
            <IconRefresh />
            {t("retry")}
          </button>
        </div>
      ) : !list.length ? (
        <div className="mk-empty" data-ai-target="marketplace:lawyer-list" data-ai-id="marketplace.results">
          <IconSparkle />
          <b>{t("empty")}</b>
          <span>{q ? t("emptyTextAi") : t("emptyText")}</span>
          <div className="mk-empty__acts">
            {activeFilters || q ? (
              <button type="button" className="btn btn--line btn--sm" onClick={resetFilters} data-ai-id="marketplace.results.reset">
                {t("filters.reset")}
              </button>
            ) : null}
            {q ? (
              <Link href="/portal/client/support?topic=marketplace" className="btn btn--pri btn--sm" data-ai-target="button:operator-support" data-ai-id="marketplace.results.ask-support">
                <IconHeadset />
                {t("askSupport")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={`mk-grid${aiThinking ? " is-busy" : ""}`} data-ai-target="marketplace:lawyer-list" data-ai-id="marketplace.results" data-ai-type="list">
          {list.map((s, i) => (
            <SellerCard key={s.userId} s={s} href={`${base}/${encodeURIComponent(s.userId)}`} index={i} locale={locale} match={aiMatchOf.get(s.userId)} />
          ))}
        </div>
      )}

      {status === "ready" && items.length < total ? (
        <div className="mk-more">
          <button type="button" className="btn btn--line" disabled={moreBusy} onClick={() => void loadMore()} data-ai-id="marketplace.results.load-more">
            {t("loadMore")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SellerCard({ s, href, index, locale, match }: { s: MarketSeller; href: string; index: number; locale: string; match?: MarketAiMatch }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const rated = hasRating(s);
  const titles = s.serviceTitles.length ? s.serviceTitles : s.services.map((x) => x.title);
  const shown = titles.slice(0, 2);
  const promoted = s.promotion?.active === true;
  const cardAiId = aiId("marketplace.seller", s.userId);
  const cardAiLabel = [sellerTypeLabel(t, s.sellerType), s.region ? regionLabel(te, s.region) : ""].filter(Boolean).join(" · ");
  return (
    <article
      className={`mk-card${promoted ? " mk-card--promo" : ""}`}
      style={{ ["--mk-i" as string]: String(Math.min(index, 11)) }}
      data-ai-target={`marketplace:lawyer-card:${s.userId}`}
      data-ai-id={cardAiId}
      data-ai-type="card"
      data-ai-label={cardAiLabel}
      data-ai-entity-type="seller"
      data-ai-entity-id={s.userId}
    >
      {promoted ? (
        <span className="mk-card__ad" title={s.promotion?.serviceTitle ? t("card.promotedService", { service: s.promotion.serviceTitle }) : undefined}>
          {t("card.promoted")}
        </span>
      ) : null}
      <div className="mk-card__head">
        <Monogram name={s.name} rating={s.rating} showRing={rated} />
        <div className="mk-card__who">
          <Link href={href} className="mk-card__name">
            {s.name}
          </Link>
          <div className="mk-card__meta">
            <span className={`mk-type mk-type--${s.sellerType || "yurist"}`}>{sellerTypeLabel(t, s.sellerType)}</span>
            {s.verified ? <VerifiedBadge name={s.name} subtitle={sellerTypeLabel(t, s.sellerType)} text={s.badgeLabel} /> : null}
          </div>
          {s.region ? (
            <div className="mk-card__place">
              <IconMapPin />
              {[regionLabel(te, s.region), s.district && s.district.toLowerCase() !== "demo" ? s.district : ""].filter(Boolean).join(", ")}
            </div>
          ) : null}
        </div>
      </div>

      {match ? (
        <div className="mk-card__ai">
          <span className="mk-card__aiscore">
            <IconSparkle />
            {match.score > 0 ? t("aiMatch", { pct: Math.round(match.score * 100) }) : t("aiPick")}
          </span>
          {match.score > 0 ? (
            <span className="mk-card__aibar" aria-hidden="true">
              <i style={{ width: `${Math.round(match.score * 100)}%` }} />
            </span>
          ) : null}
          {match.reasons.length ? (
            <>
              <b className="mk-card__aih">{t("aiReasons")}</b>
              <ul className="mk-card__aiwhy">
                {match.reasons.slice(0, 3).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="mk-card__kpis">
        <div className="mk-kpi">
          {rated ? (
            <b>
              <IconStar />
              {fmtRating(s.rating, locale)}
            </b>
          ) : (
            <b className="mk-kpi__new">{t("card.newSeller")}</b>
          )}
          <span>{rated ? t("card.reviews", { count: s.reviewsCount }) : t("card.newHint")}</span>
        </div>
        <div className="mk-kpi">
          <b>{s.experienceYears || "—"}</b>
          <span>{t("card.experience")}</span>
        </div>
        <div className="mk-kpi">
          <b>{hasSuccess(s) ? `${Math.round(s.successRate)}%` : "—"}</b>
          <span>{hasSuccess(s) ? t("card.success") : `${t("card.success")} · ${t("card.gathering")}`}</span>
        </div>
      </div>

      {shown.length ? (
        <ul className="mk-card__svc">
          {shown.map((x) => (
            <li key={x}>{x}</li>
          ))}
          {titles.length > shown.length ? <li className="mk-card__svcmore">{t("card.servicesMore", { n: titles.length - shown.length })}</li> : null}
        </ul>
      ) : null}

      <div className="mk-card__foot">
        <div className="mk-card__price">
          {s.priceFrom > 0 ? <b>{t("card.priceFrom", { price: fmtUzs(s.priceFrom) })}</b> : <b className="mk-card__ask">{t("card.priceAsk")}</b>}
          {!s.available ? <span className="mk-card__busy">{t("card.busy")}</span> : null}
        </div>
        <Link href={href} className="mk-card__go" aria-label={`${t("card.details")}: ${s.name}`} data-ai-id={`${cardAiId}.detail`} data-ai-label={t("card.details")} data-ai-entity-type="seller" data-ai-entity-id={s.userId}>
          {t("card.details")}
          <IconArrowRight />
        </Link>
      </div>
    </article>
  );
}
