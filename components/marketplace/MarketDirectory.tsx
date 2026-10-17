"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { categoryPathLabel, descendantIds, flattenCategoryTree, getCategoryTree, type CategoryRow } from "@/lib/services/categoryTree";
import { Link } from "@/i18n/navigation";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import { IconArrowRight, IconAward, IconBriefcase, IconCard, IconClose, IconFileText, IconGavel, IconHeadset, IconLayers, IconMapPin, IconRefresh, IconScale, IconShieldCheck, IconSparkle, IconStar, IconUser, IconUsers } from "@/components/icons";
import HeroShowcase from "./HeroShowcase";
import { aiSearchMarketplace, listMarketplace, marketAiAvailable, peekSeller, rememberSellers, type MarketAiMatch, type MarketMeta, type MarketPromotionSurface, type MarketSeller } from "@/lib/services/marketplace";
import { matchesSearch, normalizeSearchText, searchTerms } from "@/lib/searchText";
import { regionKeyOf, regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { hasRating, sellerTypeLabel, specLabel } from "./bits";
import { useAiField, useAiSelection } from "@/lib/ai/registry";
import PromotionSurfaces from "./PromotionSurfaces";
import SellerCard from "./SellerCard";
import { listActivePromotions } from "@/lib/services/promotions";
import type { DirectoryPreview } from "@/lib/marketPreview";
import { DEFAULT_NEARBY_RADIUS, modeOf, radiusOf, writeNearbyParams, type NearbyMode } from "@/lib/services/marketDiscovery";
import type { NearbyRadius } from "@/lib/services/marketRuntime";
import NearbySellers, { MarketModeSwitch, type NearbyServiceOption } from "./NearbySellers";

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

export default function MarketDirectory({
  variant,
  initialArea = "",
  initialQuery = "",
  initialSellerType = "",
  initialMode,
  initialRadius,
  initialNearbyService,
  preview,
}: {
  variant: "public" | "portal";
  initialArea?: string;
  initialQuery?: string;
  initialSellerType?: string;
  initialMode?: string;
  initialRadius?: string;
  initialNearbyService?: string;
  preview?: DirectoryPreview;
}) {
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

  const [q, setQ] = useState(initialQuery);
  const [region, setRegion] = useState("");
  const [spec, setSpec] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [service, setService] = useState("");
  const [minRating, setMinRating] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [minExp, setMinExp] = useState("");
  const [sellerType, setSellerType] = useState(initialSellerType === "advokat" || initialSellerType === "yurist" ? initialSellerType : "");
  const [ai, setAi] = useState<{ q: string; matches: MarketAiMatch[]; summary: string; disclaimer: string; sponsored: MarketPromotionSurface[]; banners: MarketPromotionSurface[]; suggested: { id: string; title: string }[] } | null>(null);
  // GET /promotions/active (10-09 §5): the page-top banners, and — once a
  // service is picked — the promotions bought for exactly that service.
  const [activeBanners, setActiveBanners] = useState<MarketPromotionSurface[]>([]);
  const [serviceBoost, setServiceBoost] = useState<{ serviceId: string; items: MarketPromotionSurface[] } | null>(null);
  const aiCtrl = useRef<AbortController | null>(null);
  const [aiPending, setAiPending] = useState("");
  const aiSeq = useRef(0);
  const [mode, setMode] = useState<NearbyMode>(() => (preview ? "all" : modeOf(initialMode)));
  const [nearbyPick, setNearbyPick] = useState<{ radius: NearbyRadius; serviceId: string }>(() => ({ radius: radiusOf(initialRadius) ?? DEFAULT_NEARBY_RADIUS, serviceId: typeof initialNearbyService === "string" ? initialNearbyService.trim().slice(0, 80) : "" }));
  const syncUrl = (m: NearbyMode, pick: { radius: NearbyRadius; serviceId: string } = nearbyPick) => {
    const next = writeNearbyParams(window.location.href, { mode: m, ...pick });
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", next);
  };
  const switchMode = (m: NearbyMode) => {
    setMode(m);
    syncUrl(m);
  };

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

  useEffect(() => {
    const c = new AbortController();
    listActivePromotions({ placement: "banner", limit: 5 }, c.signal).then((rows) => { if (!c.signal.aborted) setActiveBanners(rows); }).catch(() => {});
    return () => c.abort();
  }, [reload]);

  useEffect(() => {
    if (!service) return;
    const c = new AbortController();
    listActivePromotions({ placement: "service_boost", serviceId: service, limit: 5 }, c.signal)
      .then((rows) => { if (!c.signal.aborted) setServiceBoost({ serviceId: service, items: rows }); })
      .catch(() => { if (!c.signal.aborted) setServiceBoost({ serviceId: service, items: [] }); });
    return () => c.abort();
  }, [service]);

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

  const isPreview = Boolean(preview);
  const [tree, setTree] = useState<CategoryRow[] | null>(null);
  useEffect(() => {
    if (isPreview) return;
    const c = new AbortController();
    getCategoryTree({}, c.signal)
      .then((nodes) => {
        if (c.signal.aborted) return;
        const rows = flattenCategoryTree(nodes);
        const off = new Set(rows.filter((r) => !r.node.isActive).map((r) => r.node.id));
        setTree(rows.filter((r) => !off.has(r.node.id) && !r.ancestors.some((id) => off.has(id))));
      })
      .catch(() => undefined);
    return () => c.abort();
  }, [reload, isPreview]);
  const treeRows = useMemo(() => (tree?.length ? tree : null), [tree]);
  const treeById = useMemo(() => new Map((treeRows ?? []).map((r) => [r.node.id, r])), [treeRows]);

  const categories = useMemo(() => {
    if (treeRows) return treeRows.map((r) => ({ value: r.node.id, label: categoryPathLabel(r, (title) => specLabel(te, title)) }));
    const src = meta?.categories.length ? meta.categories : items.flatMap((s) => s.categories);
    const m = new Map<string, string>();
    for (const c of src) if (c.id && !m.has(c.id)) m.set(c.id, specLabel(te, c.title || c.slug));
    return [...m.entries()].map(([value, label]) => ({ value, label }));
  }, [treeRows, meta, items, te]);

  const categorySet = useMemo(() => (category ? new Set([category, ...(treeRows ? descendantIds(category, treeRows) : [])]) : null), [category, treeRows]);

  const services = useMemo(() => {
    const src = meta?.services.length ? meta.services : items.flatMap((s) => s.services.map((x) => ({ id: x.id, title: x.title, categoryId: x.categoryId, basePrice: x.basePrice })));
    const m = new Map<string, { value: string; label: string; categoryId: string }>();
    const pro = treeRows ? treeById : null;
    for (const x of src) if (x.id && !m.has(x.id) && (!pro || pro.has(x.categoryId))) m.set(x.id, { value: x.id, label: x.title, categoryId: x.categoryId });
    return [...m.values()].filter((x) => !categorySet || categorySet.has(x.categoryId));
  }, [meta, items, treeRows, treeById, categorySet]);

  const nearbyServices = useMemo<NearbyServiceOption[]>(() => {
    const src = meta?.services.length ? meta.services : items.flatMap((s) => s.services.map((x) => ({ id: x.id, title: x.title, categoryId: x.categoryId })));
    const m = new Map<string, NearbyServiceOption>();
    const pro = treeRows ? treeById : null;
    for (const x of src) if (x.id && x.title && !m.has(x.id) && (!pro || pro.has(x.categoryId))) m.set(x.id, { value: x.id, label: x.title });
    return [...m.values()];
  }, [meta, items, treeRows, treeById]);

  const itemsById = useMemo(() => new Map(items.map((s) => [s.userId, s])), [items]);
  const known = useCallback((id: string) => itemsById.get(id) ?? peekSeller(id), [itemsById]);

  const query = q.trim();
  const aiHit = ai && ai.q === query && ai.matches.length ? ai : null;
  const aiEmpty = Boolean(ai && ai.q === query && !ai.matches.length);
  const aiThinking = Boolean(query) && aiPending === query;

  const shownItems = useMemo(() => {
    if (!preview) return items;
    const id = preview.seller.userId;
    const at = items.findIndex((x) => x.userId === id);
    const rest = items.filter((x) => x.userId !== id);
    return preview.first || at < 0 ? [preview.seller, ...rest] : [...rest.slice(0, at), preview.seller, ...rest.slice(at)];
  }, [items, preview]);

  const list = useMemo(() => {
    const minR = Number(minRating) || 0;
    const maxP = Number(priceMax) || 0;
    const rank = new Map((aiHit?.matches ?? []).map((m, i) => [m.userId, i]));
    const known = new Set(shownItems.map((s) => s.userId));
    const extra = (aiHit?.matches ?? []).map((m) => m.seller).filter((x): x is MarketSeller => Boolean(x && x.verified && !known.has(x.userId)));
    const termsOf = (id: string) => {
      const row = treeById.get(id);
      return row ? [row.node.title, ...row.node.discoveryTerms] : [];
    };
    const hayOf = (s: MarketSeller) =>
      [s.name, s.organizationName, regionLabel(te, s.region), s.district, ...s.specializations.map((x) => specLabel(te, x)), ...s.serviceTitles, ...s.services.map((x) => x.title), ...s.categories.map((c) => c.title), ...new Set([...s.categories.map((c) => c.id), ...s.services.map((x) => x.categoryId)].flatMap(termsOf))].join(" ");
    const pool = shownItems.concat(extra).filter((s) => {
      if (region && (regionKeyOf(te, s.region) || s.region.toLowerCase()) !== region) return false;
      if (sellerType && s.sellerType !== sellerType) return false;
      if (effSpec && !s.specializations.some((x) => x.toLowerCase() === effSpec)) return false;
      if (categorySet && !s.categories.some((c) => categorySet.has(c.id)) && !s.services.some((x) => categorySet.has(x.categoryId))) return false;
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
  }, [shownItems, region, sellerType, effSpec, categorySet, treeById, service, minRating, priceMax, minExp, q, te, aiHit, aiThinking]);

  // Banners: the AI answer's, else the list's, else the active ones asked for
  // directly — whichever the backend filled. Sponsored: a picked service shows
  // only what was bought for that service, never an unrelated promotion.
  // The AI answer's meta counts even when it matched nobody: the request still
  // names a service, and its promotions are still the relevant ones.
  const aiMeta = ai && ai.q === query && !aiThinking ? ai : null;
  const shownBanners = preview?.banner ? [preview.banner] : aiMeta?.banners.length ? aiMeta.banners : banners.length ? banners : activeBanners;
  // A picked category without a service shows only what was bought for one of
  // that category's services.
  const categoryServiceIds = useMemo(() => new Set(services.map((x) => x.value)), [services]);
  const liveSponsored = aiMeta?.sponsored.length
    ? aiMeta.sponsored
    : service
      ? serviceBoost?.serviceId === service ? serviceBoost.items : []
      : category
        ? sponsored.filter((p) => p.serviceId && categoryServiceIds.has(p.serviceId))
        : sponsored;
  const shownSponsored = preview?.tile ? [preview.tile, ...liveSponsored.filter((p) => p.sellerUserId !== preview.seller.userId)].slice(0, 4) : liveSponsored;

  const promoSearchKey = [aiHit ? `ai:${aiHit.q}` : query, category, service].filter(Boolean).join("|");

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
      setAi(r ? { q: wanted, matches: r.matches, summary: r.summary, disclaimer: r.disclaimer, sponsored: r.sponsored, banners: r.banners, suggested: r.suggestedServices.map((x) => ({ id: x.id, title: x.title })).filter((x) => x.id && x.title) } : null);
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
    const scroll = () => {
      const el = resultsRef.current;
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    };
    if (mode === "nearby") {
      switchMode("all");
      window.requestAnimationFrame(scroll);
      return;
    }
    scroll();
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
      const next = aiOption(categories, v) ?? (searchTerms(v).length ? treeRows?.find((r) => matchesSearch([...r.path, r.node.slug, ...r.node.discoveryTerms].join(" "), v))?.node.id : null) ?? null;
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
      <div className="mk-adslot">
        <PromotionSurfaces part="banner" banners={shownBanners} sponsored={[]} base={base} />
      </div>

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
                if (mode === "nearby" && e.target.value.trim()) switchMode("all");
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
            {/* meta.suggested_services (10-09 §6): the services the AI read
                the request as — one tap narrows the list to that service. */}
            {aiMeta?.suggested.length ? (
              <div className="mk-aisuggest">
                <span>{t("aiSuggested")}</span>
                {aiMeta.suggested.slice(0, 5).map((x) => (
                  <button key={x.id} type="button" className={service === x.id ? "on" : undefined} onClick={() => setService(service === x.id ? "" : x.id)}>
                    <IconBriefcase />
                    {x.title}
                  </button>
                ))}
              </div>
            ) : null}
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
                      if (mode === "nearby") switchMode("all");
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
        <HeroShowcase items={shownItems} promos={shownBanners} base={base} locale={locale} />
      </div>

      {!isPreview ? <MarketModeSwitch mode={mode} onChange={switchMode} /> : null}

      {mode === "nearby" ? (
        <NearbySellers
          base={base}
          services={nearbyServices}
          initialRadius={nearbyPick.radius}
          initialServiceId={nearbyPick.serviceId}
          known={known}
          onShowAll={() => switchMode("all")}
          onChange={(s) => {
            setNearbyPick(s);
            syncUrl("nearby", s);
          }}
        />
      ) : (
        <>
          <FilterBar
            variant="market"
            fields={filterFields}
            count={list.length}
            onReset={resetFilters}
            title={t("filters.toggle")}
            aiId="marketplace.filters"
            aiTarget="marketplace:filters"
          />

          <PromotionSurfaces part="sponsored" sponsored={shownSponsored} base={base} searchKey={promoSearchKey} />

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
                <SellerCard key={s.userId} s={s} href={`${base}/${encodeURIComponent(s.userId)}`} index={i} locale={locale} match={aiMatchOf.get(s.userId)} phService={preview && s.userId === preview.seller.userId && preview.phService ? preview.phService : undefined} />
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
        </>
      )}
    </section>
  );
}
