"use client";

import { useEffect, useMemo, useState, type ComponentType, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/navigation";
import {
  getServiceCategories,
  getServices,
  searchServices,
  getServicePassport,
  listLawyers,
  createOrder,
  getPricingQuote,
  getMatchingCandidates,
  getServiceDocumentFields,
  getServiceTemplateSourceFile,
  getMySubscription,
  getSubscriptionPlans,
  type BackendService,
  type BackendLawyer,
  type MatchCandidate,
  type PriceModifier,
  type PriceQuote,
  getLawyerServices,
} from "@/lib/services/backend";
import { http, asDict, asStr } from "@/lib/http";
import { fetchAndDeliver, extFromMime } from "@/lib/download";
import { fuzzyContains } from "@/lib/searchMatch";
import OrderPayment from "@/components/portal/OrderPayment";
import ServicePassport from "@/components/portal/ServicePassport";
import ServiceDocumentRequest from "@/components/portal/ServiceDocumentRequest";
import { useResource, useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { initials, humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { evalBusinessHours, responseDeadline, deadlineLabel } from "@/lib/businessHours";
import { getBusinessHours, DEFAULT_BUSINESS_HOURS } from "@/lib/services/backend";
import {
  IconBriefcase,
  IconSearch,
  IconArrowRight,
  IconChevronLeft,
  IconSparkle,
  IconAlert,
  IconStar,
  IconShieldCheck,
  IconMapPin,
  IconScale,
  IconFileText,
  IconShield,
  IconUsers,
  IconGavel,
  IconCheck,
  IconClock,
  IconDocLines,
  IconDownload,
  IconLock,
} from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

// Cycle a small set of legal icons across the service families — only the
// fallback now, for a future category none of the illustrations below match.
const FAM_ICONS: ComponentType<{ className?: string }>[] = [
  IconScale, IconGavel, IconShield, IconFileText, IconUsers, IconBriefcase,
];

// LEXGO_DOCUMENT_SUBCATEGORIES_FRONTEND.md: every service now carries a real
// `subcategory` string from the backend (21 in production, verified live —
// "Oila va aliment" 133, "Mehnat huquqi" 261, etc., across all 4 general
// categories, not just Fuqarolik) — this replaces the previous client-side
// title-keyword guess entirely. Only 4 of the 21 have an illustration
// (public/img/, carried over from the old civil-court section); every other
// subcategory falls back to a cycled icon below.
const SUBCATEGORY_IMAGES: { match: RegExp; src: string }[] = [
  { match: /uy-?joy/i, src: "/img/uyjoy-nizolari.png" },
  { match: /mehnat huquqi/i, src: "/img/mehnat-nizolari.png" },
  { match: /oila va aliment|meros va vasiyat/i, src: "/img/oliaviy-meros.png" },
  { match: /boshqa fuqarolik/i, src: "/img/boshqa-fuqorolik.png" },
];
function subcategoryImage(name: string): string | null {
  return SUBCATEGORY_IMAGES.find((s) => s.match.test(name))?.src ?? null;
}

type Sort = "match" | "rating" | "exp" | "price";

// GM: the client's LexGo.AI tier gates the raw-template download (view is
// always free, downloading needs Lite/Pro) — mirrors PlansPanel.tsx's own
// slug rule and name/id matching convention, the only place the app already
// resolves "which of the three AI plans is this client on".
const AI_SLUG = /^lexgo-ai-(free|lite|pro)$/;

export default function ClientServices() {
  const t = useTranslations("portal.client.services");
  const te = useTranslations("enums");
  const locale = useLocale();
  const router = useRouter();
  const cats = useResource(getServiceCategories, []);

  // T0-20 §4: outside working hours the client is told right away when the
  // advocate's 30-minute response window starts (next working day 09:00).
  const bh = useResourceOne(getBusinessHours, []);
  const hours = bh.data ?? DEFAULT_BUSINESS_HOURS;
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => { const tick = () => setNowMs(Date.now()); const h = setTimeout(tick, 0); const iv = setInterval(tick, 60_000); return () => { clearTimeout(h); clearInterval(iv); }; }, []);
  const afterHours = nowMs ? !evalBusinessHours(hours, nowMs).workingTime : false;
  const respondBy = nowMs ? deadlineLabel(responseDeadline(hours, nowMs, 30), nowMs, { today: t("deadlineToday"), tomorrow: t("deadlineTomorrow") }) : "";
  // Advocate preselected from the directory (?lawyer=<userId>&name=…).
  // Read after mount: during a client-side transition window.location still
  // shows the previous URL while the new page first renders.
  const [preSeller, setPreSeller] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("lawyer") ?? "";
    const name = sp.get("name") ?? "";
    const h = setTimeout(() => setPreSeller(id ? { id, name } : null), 0);
    return () => clearTimeout(h);
  }, []);
  // With an advocate preselected the catalogue is narrowed to the services
  // they actually offer (GET /lawyers/{id}/services), so a service they do
  // not provide can never be opened. null = not loaded yet; an empty set =
  // the advocate has not listed services (the full catalogue stays).
  const [preServices, setPreServices] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!preSeller) { const h = setTimeout(() => setPreServices(null), 0); return () => clearTimeout(h); }
    let alive = true;
    getLawyerServices(preSeller.id)
      .then((rows) => alive && setPreServices(new Set(rows.map((r) => r.id).filter(Boolean))))
      .catch(() => alive && setPreServices(new Set()));
    return () => { alive = false; };
  }, [preSeller]);
  const narrowed = Boolean(preSeller && preServices && preServices.size);
  const offeredBy = useCallback((s: BackendService) => !narrowed || (preServices as Set<string>).has(s.id), [narrowed, preServices]);
  // 4 general categories (LEXGO_GENERAL_DOCUMENT_CATEGORIES_FRONTEND.md), a
  // real backend `subcategory` per service one level under each
  // (LEXGO_DOCUMENT_SUBCATEGORIES_FRONTEND.md) — every category gets the
  // same two-step drill-down: general category -> subcategory -> services.
  const [cat, setCat] = useState(""); // "" = general categories overview
  const [subcat, setSubcat] = useState(""); // "" = subcategories overview for `cat`
  // Reset during render (not an effect — this file's own established pattern,
  // see prevOrder/prevServiceId/prevQuoteKey below) so a stale subcategory
  // filter never survives a category change.
  const [prevCat, setPrevCat] = useState(cat);
  if (cat !== prevCat) {
    setPrevCat(cat);
    setSubcat("");
  }
  // Only the selected category's own services are ever fetched (MD's
  // recommended flow: categories first, then GET /services?category_id=…
  // once a category is picked) — the page used to eagerly load the WHOLE
  // catalog (987 services across all 4 categories) on first render before
  // the client had even chosen a category, which was the real cause of the
  // page feeling slow.
  //
  // LEXGO_SERVICES_CATALOG_OPTIMIZATION_FRONTEND.md: /services is itself a
  // paged endpoint now (backend default/requested limit 200, max 500) — one
  // category alone can hold more than that (Fuqarolik: 625, verified live),
  // and the MD is explicit that the frontend must not fetch everything in
  // one shot ("use infinite scroll, 'Load more', or category/subcategory
  // tabs"). So: fetch one page per request, accumulate, and only fetch the
  // next page when the client asks for it (loadMoreServices below) — not a
  // plain useResource, which has no notion of "append another page".
  const SERVICES_PAGE_LIMIT = 200;
  const [svcPages, setSvcPages] = useState<BackendService[]>([]);
  const [svcStatus, setSvcStatus] = useState<"loading" | "ready" | "error">("ready");
  const [svcHasMore, setSvcHasMore] = useState(false);
  const [svcLoadingMore, setSvcLoadingMore] = useState(false);
  const [prevPageCat, setPrevPageCat] = useState(cat);
  if (cat !== prevPageCat) {
    setPrevPageCat(cat);
    setSvcPages([]);
    setSvcStatus(cat ? "loading" : "ready");
    setSvcHasMore(false);
  }
  useEffect(() => {
    if (!cat) return;
    let alive = true;
    getServices({ category_id: cat, catalog_only: true, limit: SERVICES_PAGE_LIMIT, offset: 0 }, locale)
      .then((rows) => {
        if (!alive) return;
        setSvcPages(rows);
        setSvcHasMore(rows.length === SERVICES_PAGE_LIMIT);
        setSvcStatus("ready");
      })
      .catch(() => alive && setSvcStatus("error"));
    return () => {
      alive = false;
    };
  }, [cat, locale]);
  function loadMoreServices() {
    if (!cat || svcLoadingMore || !svcHasMore) return;
    setSvcLoadingMore(true);
    getServices({ category_id: cat, catalog_only: true, limit: SERVICES_PAGE_LIMIT, offset: svcPages.length }, locale)
      .then((rows) => {
        setSvcPages((cur) => [...cur, ...rows]);
        setSvcHasMore(rows.length === SERVICES_PAGE_LIMIT);
      })
      .catch(() => setSvcHasMore(false))
      .finally(() => setSvcLoadingMore(false));
  }
  const services = { status: svcStatus, data: svcPages };
  // Deep link from the AI intake ("order this service") pre-fills the search.
  // Rendered only client-side (inside the portal shell, after auth is ready).
  const [q, setQ] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") ?? "",
  );

  // order modal
  const [order, setOrder] = useState<BackendService | null>(null);
  const [sellers, setSellers] = useState<BackendLawyer[]>([]);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [sellerId, setSellerId] = useState("");
  // "match" = the backend matching score (GET /matching/candidates, T1-09).
  const [sort, setSort] = useState<Sort>("match");
  const [cands, setCands] = useState<Map<string, MatchCandidate>>(new Map());
  // The client's own region drives the regional price coefficient (T1-08).
  const [myRegion, setMyRegion] = useState("");
  useEffect(() => {
    let alive = true;
    http("/auth/me")
      .then((d) => alive && setMyRegion(asStr(asDict(d).region)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const [buying, setBuying] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);
  // "Advokat yo'llash" reuses the advocate-picker/buy branch below even for a
  // document-template service (normally that branch is skipped in favor of
  // the self-fill flow) — set only by that button, reset with the modal.
  const [forceAdvocate, setForceAdvocate] = useState(false);

  // Plan-gated template download: Free sees the document but must upgrade to
  // download it, Lite/Pro download freely (GM). No dedicated "my AI plan"
  // endpoint exists — resolved the same way PlansPanel.tsx does, by matching
  // the client's subscription against the three lexgo-ai-* plans.
  const sub = useResourceOne(getMySubscription, []);
  const aiPlans = useResource(() => getSubscriptionPlans(locale), [locale]);
  const myAiPlan = useMemo(() => {
    const s = sub.data;
    if (!s) return null;
    return aiPlans.data.filter((p) => AI_SLUG.test(p.slug)).find((p) => (s.planId && p.id === s.planId) || (s.planName && p.name === s.planName)) ?? null;
  }, [sub.data, aiPlans.data]);
  const isFreeTier = !myAiPlan || myAiPlan.slug === "lexgo-ai-free";
  const [dlBusy, setDlBusy] = useState("");
  const [dlErr, setDlErr] = useState<{ id: string; msg: string } | null>(null);
  async function handleDownload(s: BackendService) {
    if (isFreeTier) { router.push("/portal/client/subscription"); return; }
    if (dlBusy) return;
    setDlErr(null);
    setDlBusy(s.id);
    const fields = await getServiceDocumentFields(s.id).catch(() => null);
    const src = fields?.sourceFileUrl || fields?.sourceFileInlineUrl;
    if (!fields?.hasSourceFile || !src) {
      setDlErr({ id: s.id, msg: t("downloadError") });
      setDlBusy("");
      return;
    }
    const name = fields.sourceFileName || `${s.name}.${extFromMime(fields.sourceMimeType) || "docx"}`;
    const ok = await fetchAndDeliver(() => getServiceTemplateSourceFile(src), name, true);
    if (!ok) setDlErr({ id: s.id, msg: t("downloadError") });
    setDlBusy("");
  }

  const query = q.trim().toLowerCase();
  // Already scoped to `cat` by the fetch itself (see `services` above) — no
  // per-category counts to show at the top level any more (that would mean
  // loading every category just to display a number nobody asked for yet).
  const catalog = useMemo(() => (narrowed ? services.data.filter(offeredBy) : services.data), [services.data, narrowed, offeredBy]);
  const famList = cats.data;

  const NO_SUBCAT = "Boshqa";
  // The selected general category's own services, grouped by the backend's
  // real `subcategory` field (LEXGO_DOCUMENT_SUBCATEGORIES_FRONTEND.md) —
  // every category gets this, not just Fuqarolik. Sorted by count desc (the
  // MD's own recommended order, matching how it lists production counts).
  const catServices = catalog;
  const subcatCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of catServices) { const k = s.subcategory || NO_SUBCAT; m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [catServices]);
  const subcatList = useMemo(
    () => [...subcatCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    [subcatCounts],
  );

  // T1-06 server search (GET /services/search): Latin/Cyrillic/Russian
  // spellings, category and AI category, ranked by score. Debounced; until it
  // answers (or if it fails) the local name/code filter below is shown.
  const [remote, setRemote] = useState<{ q: string; list: BackendService[] | null } | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      searchServices(term, { limit: 50 }, locale)
        .then((hits) => alive && setRemote({ q: term, list: hits.map((h) => h.service) }))
        .catch(() => alive && setRemote({ q: term, list: null }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, locale]);

  // Cyrillic/typo-tolerant match against the catalog already loaded here —
  // computed unconditionally so it can also backfill an empty or Latin-only
  // server response (see below), not just stand in when the server call
  // fails outright.
  const localHits = useMemo(
    () => (query ? catalog.filter((s) => fuzzyContains(query, s.name) || (s.catalogCode && fuzzyContains(query, s.catalogCode))) : []),
    [catalog, query],
  );

  // Search mode → flat results across everything; else drill by family.
  const list = useMemo(() => {
    if (query) {
      const hits = remote && remote.q.toLowerCase() === query ? remote.list : null;
      const local = narrowed ? localHits.filter(offeredBy) : localHits;
      // A 200 with zero hits (the server's own search misses Cyrillic and
      // some spelling variants — T1-06) must still fall through to the local
      // match, so `hits` alone (truthy even when empty) isn't enough here.
      if (hits && hits.length) {
        // Keep the catalog view (catalog_only) when it loaded: drop non-catalog hits.
        const byId = new Map(catalog.map((s) => [s.id, s]));
        const server = byId.size ? hits.flatMap((h) => byId.get(h.id) ?? []) : narrowed ? hits.filter(offeredBy) : hits;
        const seen = new Set(server.map((s) => s.id));
        return [...server, ...local.filter((s) => !seen.has(s.id))];
      }
      return local;
    }
    if (!cat || !subcat) return [];
    // MD's recommended sort: services inside a subcategory alphabetically by title.
    return catServices.filter((s) => (s.subcategory || NO_SUBCAT) === subcat).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [catalog, cat, subcat, query, remote, narrowed, offeredBy, localHits, catServices, locale]);

  // Deep link from the AI offer cards (?service=<id>) opens that service's order
  // modal once the catalog is loaded; a service outside the catalog list is
  // fetched through its passport.
  const [deepId, setDeepId] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("service") ?? "",
  );
  const [deepFetch, setDeepFetch] = useState("");
  const [docDeepId, setDocDeepId] = useState("");
  if (deepId && services.status !== "loading") {
    const found = services.data.find((s) => s.id === deepId);
    setDeepId("");
    if (found?.documentTemplateId) setDocDeepId(found.id);
    else if (found) setOrder(found);
    else setDeepFetch(deepId);
  }
  useEffect(() => {
    if (!deepFetch) return;
    let alive = true;
    getServicePassport(deepFetch, locale)
      .then((r) => {
        if (!alive || !r.service.id) return;
        if (r.service.documentTemplateId) setDocDeepId(r.service.id);
        else setOrder(r.service);
      })
      .catch(() => {})
      .finally(() => alive && setDeepFetch(""));
    return () => {
      alive = false;
    };
  }, [deepFetch, locale]);
  // Hand off to the full-page document builder. `replace`, not `push`: with
  // push, ?service=<id> is still in the URL behind it, so pressing Back
  // re-reads it and bounces straight back into the builder — this page could
  // never be reached again without editing the address bar. Replacing also
  // drops the query so a later Back lands on a clean services page.
  useEffect(() => {
    if (docDeepId) router.replace(`/portal/client/services/document/${docDeepId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docDeepId]);

  const catName = cats.data.find((c) => c.id === cat)?.name || "";

  // Reset the order modal when a service is opened (during render, not in the effect).
  const [prevOrder, setPrevOrder] = useState(order);
  if (order !== prevOrder) {
    setPrevOrder(order);
    if (order) {
      setSellersLoading(true);
      setCands(new Map());
      setSellerId("");
      setNote(null);
      setQuote(null);
      setPayOrderId(null);
    } else {
      setForceAdvocate(false);
    }
  }

  // A document-template service normally skips the marketplace entirely
  // (self-fill only); "Advokat yo'llash" forces it open anyway.
  const orderAsAdvocate = order && (!order.documentTemplateId || forceAdvocate);

  useEffect(() => {
    if (!order || (order.documentTemplateId && !forceAdvocate)) return;
    listLawyers({ service_id: order.id })
      .then((rows) => {
        setSellers(rows);
        // The advocate chosen in the directory is picked automatically when they offer this service.
        if (preSeller && rows.some((r) => r.userId === preSeller.id)) setSellerId(preSeller.id);
      })
      .catch(() => setSellers([]))
      .finally(() => setSellersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, forceAdvocate]);
  const preSellerOffers = !order || sellersLoading ? null : sellers.some((r) => r.userId === preSeller?.id);

  // Ranked, verified candidates for this service; used to order the sellers
  // above and to explain the match. A failure just leaves the rating order.
  useEffect(() => {
    if (!order || (order.documentTemplateId && !forceAdvocate)) return;
    let alive = true;
    getMatchingCandidates({ serviceId: order.id, region: myRegion || undefined })
      .then((rows) => alive && setCands(new Map(rows.map((c) => [c.lawyerUserId, c]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [order, myRegion, forceAdvocate]);

  const sortedSellers = useMemo(() => {
    const rows = [...sellers];
    const score = (l: BackendLawyer) => cands.get(l.userId)?.score ?? -1;
    rows.sort((a, b) => {
      if (sort === "price") return (a.basePrice || Infinity) - (b.basePrice || Infinity);
      if (sort === "exp") return b.experienceYears - a.experienceYears;
      if (sort === "match" && score(a) !== score(b)) return score(b) - score(a);
      return b.rating - a.rating;
    });
    return rows;
  }, [sellers, sort, cands]);

  // Price rows are labelled by the backend modifier code.
  const modLabel = (m: PriceModifier) =>
    m.key && t.has(`modifiers.${m.key}`) ? t(`modifiers.${m.key}`) : m.label || humanizeSlug(m.key) || "—";
  const modValue = (m: PriceModifier) => {
    if (m.percent) return `${m.percent > 0 ? "+" : ""}${m.percent}%`;
    if (m.multiplier && m.multiplier !== 1) return `×${Number(m.multiplier.toFixed(2))}`;
    if (m.amount) return `${som(m.amount)} ${t("som")}`;
    // A neutral factor (e.g. the Tashkent city region, ×1) still explains the price.
    return "×1";
  };
  const reasonLabel = (r: string) => (t.has(`matchReasons.${r}`) ? t(`matchReasons.${r}`) : humanizeSlug(r));

  // Final price depends on the chosen seller + any referral discount. Loading /
  // clearing happens during render when the seller or service changes.
  const quoteKey = order && sellerId ? `${order.id}:${sellerId}` : "";
  const [prevQuoteKey, setPrevQuoteKey] = useState(quoteKey);
  if (quoteKey !== prevQuoteKey) {
    setPrevQuoteKey(quoteKey);
    if (quoteKey) setQuoteLoading(true);
    else setQuote(null);
  }

  useEffect(() => {
    if (!order || !sellerId) return;
    let alive = true;
    getPricingQuote({ service_id: order.id, lawyer_user_id: sellerId, region: myRegion || undefined })
      .then((qr) => alive && setQuote(qr))
      .catch(() => alive && setQuote(null))
      .finally(() => alive && setQuoteLoading(false));
    return () => {
      alive = false;
    };
  }, [order, sellerId, myRegion]);

  async function buy() {
    if (!order || !sellerId || buying) return;
    setBuying(true);
    setNote(null);
    try {
      const packageId = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("package") ?? "";
      const o = await createOrder({ service_id: order.id, lawyer_user_id: sellerId, ...(packageId ? { package_id: packageId } : {}) });
      setBuying(false);
      if (o.id) setPayOrderId(o.id);
      else router.push("/portal/client/cases");
    } catch {
      setBuying(false);
      setNote({ ok: false, msg: t("orderError") });
    }
  }
  function afterPay(roomId?: string) {
    setPayOrderId(null);
    setOrder(null);
    if (roomId) router.push(`/portal/chat/${roomId}`);
    else router.push("/portal/client/cases");
  }

  const showFamilies = !query && !cat;
  const showSubcats = !query && !!cat && !subcat;

  return (
    <div className="mkt">
      {/* Module 10 client entry points: AI intake + urgent advocate. */}
      <div className="mkt__actions">
        <Link href="/portal/client/intake" className="mkt__act mkt__act--ai">
          <span className="mkt__act-i"><IconSparkle /></span>
          <span className="mkt__act-t">
            <b>{t("aiHelp")}</b>
            <span>{t("aiHelpSub")}</span>
          </span>
          <IconArrowRight />
        </Link>
        <Link href="/portal/client/sos" className="mkt__act mkt__act--sos">
          <span className="mkt__act-i"><IconAlert /></span>
          <span className="mkt__act-t">
            <b>{t("urgent")}</b>
            <span>{t("urgentSub")}</span>
          </span>
          <IconArrowRight />
        </Link>
      </div>

      {preSeller ? (
        <div className="presel" role="status">
          <span className="presel__av">{(preSeller.name || "A").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div>
            <b>{t("preSellerTitle", { name: preSeller.name || t("preSellerAnon") })}</b>
            <span>
              {narrowed ? t("preSellerOnly", { n: preServices?.size ?? 0 }) : preServices && !preServices.size ? t("preSellerNoList") : t("preSellerLead")}
              {afterHours ? ` ${t("afterHours", { when: respondBy })}` : ""}
            </span>
          </div>
          <button type="button" className="btn btn--line btn--sm" onClick={() => { setPreSeller(null); if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname); }}>{t("preSellerClear")}</button>
        </div>
      ) : null}
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{showFamilies ? t("chooseFamily") : showSubcats ? catName : query ? t("title") : subcat || catName}</b>
          <span className="advmuted">{showFamilies ? famList.length : showSubcats ? subcatList.length : list.length}</span>
        </div>

        <div className="svsel__bar" style={{ marginBottom: 14 }}>
          <span className="svsel__search">
            <IconSearch />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
          </span>
        </div>

        {!showFamilies && !query ? (
          <button type="button" className="mkt__back" onClick={() => (subcat ? setSubcat("") : setCat(""))}>
            <IconChevronLeft />
            {t("back")}
          </button>
        ) : null}

        {cats.status === "loading" || (cat && services.status === "loading") ? (
          <Skeleton rows={4} />
        ) : showFamilies ? (
          <div className="svfam__grid">
            {famList.map((c, i) => {
              const Icon = FAM_ICONS[i % FAM_ICONS.length];
              return (
                <button key={c.id} type="button" className="svfam" onClick={() => setCat(c.id)}>
                  <span className="svfam__i">
                    <Icon />
                  </span>
                  <span className="svfam__t">
                    <b>{c.name}</b>
                  </span>
                </button>
              );
            })}
          </div>
        ) : showSubcats ? (
          <div className="svfam__grid">
            {subcatList.map((name, i) => {
              const img = subcategoryImage(name);
              const Icon = FAM_ICONS[i % FAM_ICONS.length];
              return (
                <button key={name} type="button" className="svfam" onClick={() => setSubcat(name)}>
                  <span className="svfam__i">
                    {img ? (
                      // The source PNGs are ~600-800KB full-resolution
                      // renders — next/image resizes/re-encodes to what's
                      // actually displayed (this card is never wider than a
                      // few hundred px) and lazy-loads off-screen ones.
                      <Image src={img} alt="" fill sizes="(max-width: 640px) 45vw, 260px" style={{ objectFit: "contain" }} />
                    ) : (
                      <Icon />
                    )}
                  </span>
                  <span className="svfam__t">
                    <b>{name}</b>
                    <small>{t("servicesN", { n: subcatCounts.get(name) ?? 0 })}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : !list.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="svsel__grid svsel__grid--svc">
            {list.map((s, i) => {
              const hasDoc = !!s.documentTemplateId;
              return (
                <div key={s.id} className="svc" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <div className="svc__top">
                    <span className="svc__i">{hasDoc ? <IconDocLines /> : <IconBriefcase />}</span>
                    <span className="svc__t">
                      <b>{s.name}</b>
                      <small>{[s.catalogCode, s.price ? `${som(s.price)} ${t("som")}` : t("byRequest")].filter(Boolean).join(" · ")}</small>
                    </span>
                  </div>
                  <div className="svc__acts">
                    {hasDoc ? (
                      <button
                        type="button"
                        className={`svc__act svc__act--dl${isFreeTier ? " svc__act--locked" : ""}`}
                        disabled={dlBusy === s.id}
                        onClick={() => handleDownload(s)}
                      >
                        {isFreeTier ? <IconLock /> : <IconDownload />}
                        {dlBusy === s.id ? t("downloading") : t("download")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="svc__act svc__act--adv"
                      onClick={() => { setOrder(s); setForceAdvocate(true); }}
                    >
                      <IconUsers />
                      {t("sendToLawyer")}
                    </button>
                    {hasDoc ? (
                      <button type="button" className="svc__act svc__act--fill" onClick={() => router.push(`/portal/client/services/document/${s.id}`)}>
                        {t("fillDoc")}
                        <span className="svc__soon">{t("comingSoon")}</span>
                      </button>
                    ) : null}
                  </div>
                  {dlErr?.id === s.id ? <p className="svc__err">{dlErr.msg}</p> : null}
                </div>
              );
            })}
          </div>
        )}

        {/* Only within a category, never during search (that reads from
            `remote`/`localHits`, not the paged svcPages) — a category can
            hold more than one page (Fuqarolik: 625 > the 200-item page
            size), and the MD explicitly says not to fetch it all at once. */}
        {!query && cat && svcHasMore ? (
          <button type="button" className="btn btn--line btn--full" style={{ marginTop: 14 }} disabled={svcLoadingMore} onClick={loadMoreServices}>
            {svcLoadingMore ? t("loadingMore") : t("loadMore")}
          </button>
        ) : null}
      </div>

      <Modal open={!!order} onClose={() => { setOrder(null); setPayOrderId(null); }} title={order?.name || t("orderTitle")} wide={!orderAsAdvocate}>
        {payOrderId ? (
          <OrderPayment orderId={payOrderId} onChat={afterPay} />
        ) : order && !orderAsAdvocate ? (
          <ServiceDocumentRequest serviceId={order.id} />
        ) : (
          <div className="cform" style={{ maxWidth: "none" }}>
            {quote ? (
              <div className="oquote">
                {quote.baseAmount && quote.baseAmount !== quote.totalAmount ? (
                  <div className="oquote__row"><span>{t("priceBase")}</span><span>{som(quote.baseAmount)} {t("som")}</span></div>
                ) : null}
                {quote.modifiers.map((m, i) => (
                  <div className="oquote__row oquote__row--mod" key={i}>
                    <span>{modLabel(m)}</span>
                    <span>{modValue(m)}</span>
                  </div>
                ))}
                {quote.subtotal && quote.subtotal !== quote.totalAmount && quote.subtotal !== quote.baseAmount ? (
                  <div className="oquote__row"><span>{t("priceSubtotal")}</span><span>{som(quote.subtotal)} {t("som")}</span></div>
                ) : null}
                {quote.referralDiscountPercent || quote.discountAmount ? (
                  <div className="oquote__row oquote__row--disc">
                    <span>
                      {t("referralDiscount")}
                      {quote.referralDiscountPercent && quote.discountAmount ? ` (−${quote.referralDiscountPercent}%)` : ""}
                    </span>
                    <span>{quote.discountAmount ? `−${som(quote.discountAmount)} ${t("som")}` : `−${quote.referralDiscountPercent}%`}</span>
                  </div>
                ) : null}
                <div className="oquote__row oquote__row--total">
                  <span>{t("priceTotal")}</span>
                  <b>{som(quote.totalAmount)} {t("som")}</b>
                </div>
              </div>
            ) : (
              <div className="oprice">
                <span>{t("price")}</span>
                <b>{quoteLoading ? t("priceCalc") : order?.price ? `${som(order.price)} ${t("som")}` : t("byRequest")}</b>
              </div>
            )}

            {order ? <ServicePassport serviceId={order.id} /> : null}

            <div>
              <label>{t("chooseAdvocate")}</label>
              {preSeller && preSellerOffers === false ? <p className="bhnote" role="status"><IconAlert />{t("preSellerNotOffering", { name: preSeller.name || t("preSellerAnon") })}</p> : null}
              {sellersLoading ? (
                <Skeleton rows={2} />
              ) : !sortedSellers.length ? (
                <p className="advmuted">{t("noSellers")}</p>
              ) : (
                <>
                  <div className="chiprow" style={{ margin: "6px 0 10px" }}>
                    {(["match", "rating", "exp", "price"] as Sort[]).map((s) => (
                      <button key={s} type="button" className="fchip" aria-pressed={sort === s} onClick={() => setSort(s)}>
                        {t(s === "match" ? "sortMatch" : s === "rating" ? "sortRating" : s === "exp" ? "sortExp" : "sortPrice")}
                      </button>
                    ))}
                  </div>
                  <div className="advpick">
                    {sortedSellers.filter((l) => l.userId).map((l) => {
                      const on = sellerId === l.userId;
                      const c = cands.get(l.userId);
                      const reasons = (c?.reasons ?? []).filter((r) => r !== "verified").slice(0, 2);
                      return (
                        <button
                          key={l.userId}
                          type="button"
                          className={`advpick__c${on ? " on" : ""}`}
                          onClick={() => setSellerId(l.userId)}
                        >
                          <span className="advpick__av">{initials(l.name || "A")}</span>
                          <span className="advpick__m">
                            <b>
                              {l.name || "—"}
                              {l.verified || c ? <IconShieldCheck className="advpick__vf" aria-label={t("verified")} /> : <em className="advpick__un">{t("unverified")}</em>}
                            </b>
                            <span className="advpick__stats">
                              <i><IconStar />{l.rating ? l.rating.toFixed(1) : "—"}</i>
                              {l.experienceYears ? <i>{t("expYears", { n: l.experienceYears })}</i> : null}
                              {l.successRate ? <i>{t("successRate", { n: l.successRate })}</i> : null}
                              {l.region ? <i><IconMapPin />{te.has(`regions.${l.region}`) ? te(`regions.${l.region}`) : l.region}</i> : null}
                            </span>
                            {c ? (
                              <span className="advpick__match">
                                <em>{t("matchScore", { n: Math.round(c.score) })}</em>
                                {reasons.map((r) => (
                                  <small key={r}>{reasonLabel(r)}</small>
                                ))}
                              </span>
                            ) : null}
                          </span>
                          <span className="advpick__price">
                            {l.basePrice ? `${som(l.basePrice)} ${t("som")}` : t("byRequest")}
                            {on ? <IconCheck className="advpick__ck" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {afterHours ? (
              <p className="bhnote" role="status"><IconClock />{t("afterHours", { when: respondBy })}</p>
            ) : sellerId ? (
              <p className="bhnote bhnote--ok" role="status"><IconClock />{t("respondBy", { when: respondBy })}</p>
            ) : null}
            {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
            <button className="btn btn--grad btn--full btn--lg" type="button" disabled={!sellerId || buying} onClick={buy}>
              {buying ? t("buying") : t("buy")}
            </button>
            <p className="rf__hint">{t("orderNote")}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
