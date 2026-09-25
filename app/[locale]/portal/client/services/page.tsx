"use client";

import { useEffect, useMemo, useState, type ComponentType, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
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
  type BackendService,
  type BackendLawyer,
  type MatchCandidate,
  type PriceModifier,
  type PriceQuote,
  type ServiceDocumentFields,
  getLawyerServices,
} from "@/lib/services/backend";
import { http, asDict, asStr, ApiError, errDetail } from "@/lib/http";
import { fetchAndDeliver, extFromMime } from "@/lib/download";
import OrderPayment from "@/components/portal/OrderPayment";
import ServicePassport from "@/components/portal/ServicePassport";
import ServiceDocumentRequest from "@/components/portal/ServiceDocumentRequest";
import NewDocumentOrder from "@/components/portal/NewDocumentOrder";
import ManualDocPlanGate from "@/components/portal/ManualDocPlanGate";
import AiPlanUpgradeGate from "@/components/portal/AiPlanUpgradeGate";
import { useResource, useResourceOne } from "@/lib/useResource";
import { useIsFreeAiTier } from "@/lib/useAiTier";
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
  IconEye,
  IconEdit,
  IconPlus,
  IconList,
  IconGrid,
  IconGift,
  IconCard,
  IconChatDots,
  IconClose,
} from "@/components/icons";
import { fmtRating } from "@/lib/date";

const som = (n?: number) => (n ? fmtUzs(n) : "");

// Cycle a small set of legal icons across the service families — only the
// fallback now, for a future category none of the illustrations below match.
const FAM_ICONS: ComponentType<{ className?: string }>[] = [
  IconScale, IconGavel, IconShield, IconFileText, IconUsers, IconBriefcase,
];

// The 4 top-level general categories (LEXGO_GENERAL_DOCUMENT_CATEGORIES_FRONTEND.md)
// each got their own illustration too — matched by name, same convention as
// SUBCATEGORY_IMAGES below.
const GENERAL_CATEGORY_IMAGES: { match: RegExp; src: string }[] = [
  { match: /fuqarolik/i, src: "/img/fuqaro.png" },
  { match: /iqtisodiy/i, src: "/img/Iqtisodiy.png" },
  { match: /jinoiy/i, src: "/img/jinoiy.png" },
  { match: /ma.?muriy/i, src: "/img/mamuriy.png" },
];
function generalCategoryImage(name: string): string | null {
  return GENERAL_CATEGORY_IMAGES.find((c) => c.match.test(name))?.src ?? null;
}

// LEXGO_DOCUMENT_SUBCATEGORIES_FRONTEND.md: every service now carries a real
// `subcategory` string from the backend (21 in production, verified live —
// "Oila va aliment" 133, "Mehnat huquqi" 261, etc., across all 4 general
// categories, not just Fuqarolik, so this matches by name only — the same
// subcategory gets the same icon no matter which general category it's
// under) — this replaces the previous client-side title-keyword guess
// entirely. 20 of the 21 now have an illustration (public/img/); only
// "Ijara va lizing" (1 service in production) falls back to a cycled icon.
const SUBCATEGORY_IMAGES: { match: RegExp; src: string }[] = [
  { match: /uy-?joy/i, src: "/img/uyjoy-nizolari.png" },
  { match: /mehnat huquqi/i, src: "/img/mehnat-nizolari.png" },
  { match: /oila va aliment|meros va vasiyat/i, src: "/img/oliaviy-meros.png" },
  { match: /boshqa fuqarolik/i, src: "/img/boshqa-fuqorolik.png" },
  { match: /notarial|ishonchnoma/i, src: "/img/ishonchnoma.png" },
  { match: /sud arizalari|iltimosnoma/i, src: "/img/sudarizalari.png" },
  { match: /ijro va undirish/i, src: "/img/ijro.png" },
  { match: /bankrotlik/i, src: "/img/Bankrotlik.png" },
  { match: /ro.?yxatga olish|ruxsatnoma/i, src: "/img/royhatga-olish.png" },
  { match: /qarzdorlik/i, src: "/img/Qarzdorlik.png" },
  { match: /ma.?muriy jarima/i, src: "/img/mamuriy-jarima.png" },
  { match: /yetkazib berish|oldi-?sotdi/i, src: "/img/yetkazib-berish.png" },
  { match: /davlat organlari/i, src: "/img/davlat-orgnalari.png" },
  { match: /kredit/i, src: "/img/kredit.png" },
  { match: /korporativ/i, src: "/img/Korporativ.png" },
  { match: /prokuror/i, src: "/img/prokuror-jinoyat.png" },
  { match: /transport/i, src: "/img/Transport-logistika.png" },
  { match: /tergov/i, src: "/img/tergov-chorasi.png" },
  { match: /shartnoma/i, src: "/img/shartnomlar.png" },
];
function subcategoryImage(name: string): string | null {
  return SUBCATEGORY_IMAGES.find((s) => s.match.test(name))?.src ?? null;
}

type Sort = "match" | "rating" | "exp" | "price";
// Catalog filters — see the `shown` memo for what each one selects on.
type DocFilter = "all" | "template" | "lawyer";
type PriceFilter = "all" | "free" | "quote" | "paid";

export default function ClientServices() {
  const t = useTranslations("portal.client.services");
  const te = useTranslations("enums");
  const locale = useLocale();
  const router = useRouter();
  const tc = useTranslations("portal.common");
  // Next.js's own query-param hook, not a hand-rolled `window.location.search`
  // read: this page only ever mounts client-side (PortalShell withholds
  // `children` until auth is ready — see its own `!ready || !session` guard),
  // so a manual read was never actually unsafe here. It's still the more
  // correct source: `searchParams` stays in sync with the router itself
  // (including a change made by another effect in the same tick), where a
  // one-off `window.location.search` snapshot can drift.
  const searchParams = useSearchParams();
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
  // Seeded from the URL (same pattern as q/service/package below) and kept
  // mirrored into it (see the effect further down) — otherwise opening a
  // service's full-page document builder and coming back always dropped the
  // client back to the top-level "choose a category" screen, no matter how
  // deep they'd drilled in, since a real route change unmounts this whole
  // component and a plain useState has nothing left to restore from.
  const [cat, setCat] = useState(() => searchParams.get("cat") ?? "");
  const [subcat, setSubcat] = useState(() => searchParams.get("subcat") ?? "");
  // Reset during render (not an effect — this file's own established pattern,
  // see prevOrder/prevServiceId/prevQuoteKey below) so a stale subcategory
  // filter never survives a category change.
  const [prevCat, setPrevCat] = useState(cat);
  if (cat !== prevCat) {
    setPrevCat(cat);
    setSubcat("");
  }
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (cat) sp.set("cat", cat); else sp.delete("cat");
    if (subcat) sp.set("subcat", subcat); else sp.delete("subcat");
    const qs = sp.toString();
    router.replace(`/portal/client/services${qs ? `?${qs}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, subcat]);
  // Only the selected category's own services are ever fetched (MD's
  // recommended flow: categories first, then GET /services?category_id=…
  // once a category is picked) — the page used to eagerly load the WHOLE
  // catalog (987 services across all 4 categories) on first render before
  // the client had even chosen a category, which was the real cause of the
  // page feeling slow.
  //
  // LEXGO_SERVICES_CATALOG_OPTIMIZATION_FRONTEND.md: /services is itself a
  // paged endpoint now (max limit 500) — one category alone can hold more
  // than that (Fuqarolik: 625, verified live), so this loops pages (500 at a
  // time — the largest allowed, fewest round trips) until it has all of the
  // SELECTED category, not the whole catalog. Everything downstream
  // (catalog/subcatCounts/subcatList/list) is plain useMemo over that one
  // array once it's loaded — no separate "load more" fetch/state to keep in
  // sync with it.
  const SERVICES_PAGE_LIMIT = 500;
  const [svcPages, setSvcPages] = useState<BackendService[]>([]);
  const [svcStatus, setSvcStatus] = useState<"loading" | "ready" | "error">("ready");
  const [prevPageCat, setPrevPageCat] = useState(cat);
  if (cat !== prevPageCat) {
    setPrevPageCat(cat);
    setSvcPages([]);
    setSvcStatus(cat ? "loading" : "ready");
  }
  useEffect(() => {
    if (!cat) return;
    let alive = true;
    (async () => {
      const all: BackendService[] = [];
      let offset = 0;
      for (;;) {
        const page = await getServices({ category_id: cat, catalog_only: true, limit: SERVICES_PAGE_LIMIT, offset }, locale);
        if (!alive) return;
        all.push(...page);
        if (page.length < SERVICES_PAGE_LIMIT) break;
        offset += page.length;
      }
      if (alive) {
        setSvcPages(all);
        setSvcStatus("ready");
      }
    })().catch(() => alive && setSvcStatus("error"));
    return () => {
      alive = false;
    };
  }, [cat, locale]);
  const services = { status: svcStatus, data: svcPages };
  // Deep link from the AI intake ("order this service") pre-fills the search.
  // Rendered only client-side (inside the portal shell, after auth is ready).
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");

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
  // Two filters the catalog can actually answer from what it returns: does
  // this service come with a ready document, and what does it cost. Anything
  // richer (region, executor type) is backend metadata the client has no way
  // to reason about.
  const [docFilter, setDocFilter] = useState<DocFilter>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [newDocOpen, setNewDocOpen] = useState(false);
  // "Advokatga yo'llash" on a card that HAS a document template is the same
  // journey as choosing "Advokat bilan tayyorlash" inside the fill screen —
  // one request into the call-center pool, no advocate picked by the client.
  // For a service with no template there is nothing to prepare, so that
  // button keeps meaning "order this service from an advocate".
  const [docLawyer, setDocLawyer] = useState(false);

  // Plan-gated template download: Free sees the document but must upgrade to
  // download it, Lite/Pro download freely (GM).
  const isFreeTier = useIsFreeAiTier();
  const [dlBusy, setDlBusy] = useState("");
  const [dlErr, setDlErr] = useState<{ id: string; msg: string } | null>(null);
  // LEXGO_MANUAL_DOCUMENT_PLAN_FRONTEND.md: a real, separate entitlement
  // (manual_documents.template_download) from `isFreeTier` above — a client
  // can clear the AI-tier gate and still lack this one. Reacted to as it
  // happens (the 402 the backend actually sends), not pre-checked on every
  // card render.
  const [planGateOpen, setPlanGateOpen] = useState(false);
  const [planGateMsg, setPlanGateMsg] = useState("");
  // Buying the Lite/Pro upgrade this gates on used to send the client away
  // to /portal/client/subscription to find their way back after — now opens
  // right here instead (same real purchase PlansPanel.tsx's own "choose"
  // uses, see AiPlanUpgradeGate.tsx).
  const [aiPlanGateOpen, setAiPlanGateOpen] = useState(false);
  async function handleDownload(s: BackendService) {
    if (isFreeTier) { setAiPlanGateOpen(true); return; }
    if (dlBusy) return;
    setDlErr(null);
    setDlBusy(s.id);
    let fields: ServiceDocumentFields | null = null;
    try {
      fields = await getServiceDocumentFields(s.id);
    } catch (e) {
      setDlBusy("");
      if (e instanceof ApiError && e.status === 402 && e.code === "manual_document_plan_required") {
        setPlanGateMsg(errDetail(e) || t("planRequired"));
        setPlanGateOpen(true);
        return;
      }
      setDlErr({ id: s.id, msg: t("downloadError") });
      return;
    }
    // LEXGO_CLEAN_TEMPLATE_DOWNLOAD_FRONTEND.md: never the marked-up
    // source-file here — clean-source-file has {{field}}/{field} replaced
    // with ________, which is what a plain "download the template" button
    // must show. Falls back to the marked-up file only for a service the
    // backend hasn't wired the clean file for yet.
    const src = fields.cleanSourceFileUrl || fields.cleanSourceFileInlineUrl || fields.sourceFileUrl || fields.sourceFileInlineUrl;
    if (!fields.hasSourceFile || !src) {
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

  // Global search (GET /services/search) — category-agnostic on purpose (it
  // searches the whole catalog, not just whatever category happens to be
  // loaded locally right now) and normalizes Latin/Cyrillic/Russian
  // spellings server-side (LEXGO_DOCUMENT_SUBCATEGORIES_FRONTEND.md: "still
  // the recommended global search endpoint"). This used to have a
  // local-catalog fuzzy-match fallback for whatever the remote call missed,
  // but that fallback silently broke once the page stopped eagerly loading
  // the full catalog (`catalog` is now empty until a category is picked) —
  // real bug, not a hypothetical: at the top level, search returned nothing
  // no matter what was typed. Trusting the remote endpoint outright, rather
  // than re-introducing an eager full-catalog fetch just to feed a local
  // fallback, is what that same MD's "recommended" framing is for.
  const [remote, setRemote] = useState<{ q: string; list: BackendService[] } | null>(null);
  useEffect(() => {
    const term = q.trim();
    // Stale `remote` is harmless left as-is: `list` only reads it while
    // `query` is non-empty, and a short/cleared query takes the other
    // branch entirely.
    if (term.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      // Two endpoints, merged. /services/search ranks by relevance but returns
      // at most 50 rows, so a service that matches the term only weakly drops
      // off the end — "Ma'muriy huquqbuzarlik haqida ariza" did exactly that
      // for the term "mamuriy". /services?q= is the plain filter (the backend
      // fixed it to filter BEFORE the limit, LEXGO_URGENT_ADVOCATE_FRONTEND_
      // UPDATE.md), so it catches what the ranking misses. Ranked hits keep
      // their order and come first; the filter only ever adds.
      Promise.allSettled([
        searchServices(term, { limit: 50 }, locale),
        getServices({ q: term, catalog_only: false, limit: 50 }, locale),
      ])
        .then(([ranked, filtered]) => {
          if (!alive) return;
          const list = ranked.status === "fulfilled" ? ranked.value.map((h) => h.service) : [];
          const seen = new Set(list.map((s) => s.id));
          if (filtered.status === "fulfilled") {
            for (const s of filtered.value) if (s.id && !seen.has(s.id)) { seen.add(s.id); list.push(s); }
          }
          setRemote({ q: term, list });
        })
        .catch(() => alive && setRemote({ q: term, list: [] }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, locale]);

  // Search mode → flat results across everything; else drill by family.
  const list = useMemo(() => {
    if (query) {
      if (!remote || remote.q.toLowerCase() !== query) return [];
      return narrowed ? remote.list.filter(offeredBy) : remote.list;
    }
    if (!cat || !subcat) return [];
    // MD's recommended sort: services inside a subcategory alphabetically by title.
    return catServices.filter((s) => (s.subcategory || NO_SUBCAT) === subcat).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [cat, subcat, query, remote, narrowed, offeredBy, catServices, locale]);

  // Applied after `list` rather than inside it so the filters work the same
  // in search results and inside a subcategory, and so clearing them never
  // has to re-run the catalog fetch.
  const shown = useMemo(() => {
    // Only in search mode — see the filter bar below.
    if (!query) return list;
    const byDoc = (s: BackendService) =>
      docFilter === "all" ? true : docFilter === "template" ? !!s.documentTemplateId : !s.documentTemplateId;
    const byPrice = (s: BackendService) =>
      priceFilter === "all"
        ? true
        : priceFilter === "paid"
          ? !!s.price
          : priceFilter === "free"
            ? // An explicit 0, or the backend's own free tier — NOT merely a
              // price the catalog has not set, which is the quote case below.
              s.price === 0 || s.pricingTier === "free"
            : !s.price && s.pricingTier !== "free";
    return list.filter((s) => byDoc(s) && byPrice(s));
  }, [list, docFilter, priceFilter, query]);
  const filtersOn = !!query && (docFilter !== "all" || priceFilter !== "all");
  // How many services each option would leave, counted against the other
  // group's current choice — the number a person actually wants to see before
  // clicking, rather than a total that ignores the filter already applied.
  const fCounts = useMemo(() => {
    const byDoc = (s: BackendService, v: DocFilter) =>
      v === "all" ? true : v === "template" ? !!s.documentTemplateId : !s.documentTemplateId;
    const byPrice = (s: BackendService, v: PriceFilter) =>
      v === "all"
        ? true
        : v === "paid"
          ? !!s.price
          : v === "free"
            ? s.price === 0 || s.pricingTier === "free"
            : !s.price && s.pricingTier !== "free";
    const doc = {} as Record<DocFilter, number>;
    for (const v of ["all", "template", "lawyer"] as DocFilter[]) doc[v] = list.filter((s) => byDoc(s, v) && byPrice(s, priceFilter)).length;
    const price = {} as Record<PriceFilter, number>;
    for (const v of ["all", "free", "quote", "paid"] as PriceFilter[]) price[v] = list.filter((s) => byDoc(s, docFilter) && byPrice(s, v)).length;
    return { doc, price };
  }, [list, docFilter, priceFilter]);
  const activeFilters = (docFilter !== "all" ? 1 : 0) + (priceFilter !== "all" ? 1 : 0);

  // Deep link from the AI offer cards (?service=<id>) opens that service's order
  // modal once the catalog is loaded; a service outside the catalog list is
  // fetched through its passport.
  const [deepId, setDeepId] = useState(() => searchParams.get("service") ?? "");
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
  // Carried explicitly on the link to the full-page document builder/viewer,
  // not left to the browser's back-stack: router.replace above updates this
  // same history entry's URL, but a plain `router.back()` on the far side
  // still depends on that replace having actually committed before the user
  // tapped through — usually true, but not guaranteed. Reading cat/subcat
  // straight back off the URL on arrival removes that race entirely, so
  // "orqaga" from the document page always lands on the exact subcategory
  // the client drilled into, never resets to the top-level catalog.
  const catalogBackQS = useMemo(() => {
    const sp = new URLSearchParams();
    if (cat) sp.set("cat", cat);
    if (subcat) sp.set("subcat", subcat);
    return sp.toString();
  }, [cat, subcat]);

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
          <span className="ppanel__hact">
            {!showFamilies && !showSubcats ? <span className="advmuted">{t("servicesN", { n: shown.length })}</span> : null}
            {/* Nothing in the catalog fits every case — this is the way out
                of it: an advocate writes the document from scratch, or
                checks one the client already has. */}
            <button type="button" className="btn btn--grad btn--sm" onClick={() => setNewDocOpen(true)}>
              <IconPlus />
              {t("newDocOrder")}
            </button>
          </span>
        </div>

        {/* Reading any document in the catalog costs nothing — the charge is
            for filling one in, and saying so up front is what gets people to
            open one at all. */}
        <p className="svfree" role="status">
          <IconEye />
          {t("freeToView")}
        </p>

        <div className="svsel__bar" style={{ marginBottom: 14 }}>
          <span className="svsel__search">
            <IconSearch />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
          </span>
        </div>

        {query ? (
          <div className={`svfb${filtersOn ? " svfb--on" : ""}`}>
            <div className="svfb__head">
              <span className="svfb__title">
                <IconList />
                {t("filtersTitle")}
                {activeFilters ? <em className="svfb__n">{activeFilters}</em> : null}
              </span>
              {filtersOn ? (
                <button type="button" className="svfb__clear" onClick={() => { setDocFilter("all"); setPriceFilter("all"); }}>
                  <IconClose />
                  {t("filterClear")}
                </button>
              ) : null}
            </div>
            <div className="svfb__groups">
              {/* One choice out of several is a radio group, not a row of
                  independent toggles — aria-pressed announced four unrelated
                  switches where there is exactly one answer. */}
              <div className="svfb__g">
                <span className="svfb__l" id="svfb-doc">{t("filterDoc")}</span>
                <div className="svfb__opts" role="radiogroup" aria-labelledby="svfb-doc">
                  {(["all", "template", "lawyer"] as DocFilter[]).map((v) => {
                    const on = docFilter === v;
                    const n = fCounts.doc[v];
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={`svfopt${on ? " on" : ""}${!n && !on ? " svfopt--empty" : ""}`}
                        onClick={() => setDocFilter(v)}
                      >
                        <span className="svfopt__i">{v === "all" ? <IconGrid /> : v === "template" ? <IconFileText /> : <IconScale />}</span>
                        <span className="svfopt__t">{t(v === "all" ? "filterAll" : v === "template" ? "filterHasDoc" : "filterNoDoc")}</span>
                        <em className="svfopt__n">{n}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="svfb__g">
                <span className="svfb__l" id="svfb-price">{t("filterPrice")}</span>
                <div className="svfb__opts" role="radiogroup" aria-labelledby="svfb-price">
                  {(["all", "free", "quote", "paid"] as PriceFilter[]).map((v) => {
                    const on = priceFilter === v;
                    const n = fCounts.price[v];
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={`svfopt${on ? " on" : ""}${!n && !on ? " svfopt--empty" : ""}`}
                        onClick={() => setPriceFilter(v)}
                      >
                        <span className="svfopt__i">{v === "all" ? <IconGrid /> : v === "free" ? <IconGift /> : v === "quote" ? <IconChatDots /> : <IconCard />}</span>
                        <span className="svfopt__t">{t(v === "all" ? "filterAll" : v === "free" ? "filterFree" : v === "quote" ? "filterQuote" : "filterPaid")}</span>
                        <em className="svfopt__n">{n}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!showFamilies && !query ? (
          <button type="button" className="mkt__back" onClick={() => (subcat ? setSubcat("") : setCat(""))}>
            <IconChevronLeft />
            {t("back")}
          </button>
        ) : null}

        {cats.status === "loading" || (cat && services.status === "loading") ? (
          <Skeleton rows={4} />
        ) : cats.status === "error" || (cat && services.status === "error") ? (
          // Previously silent: a failed categories/services fetch fell
          // through to showFamilies/showSubcats below anyway, mapping over
          // an empty famList/subcatList — an empty grid with zero wording,
          // which is what "nothing shows at all" on this page actually was
          // (a transient network/auth hiccup on a cold load, not a permanent
          // break — reported specifically after a hard refresh, e.g.
          // /services?cat=<id>). Now it says so, same as every other
          // resource load failure in the portal (portal.common.loadError).
          <EmptyState icon={<IconAlert />} title={tc("loadError")} text={tc("loadErrorText")} />
        ) : showFamilies ? (
          !famList.length ? (
            <EmptyState icon={<IconBriefcase />} title={t("empty")} text={t("emptyText")} />
          ) : (
            <div className="svfam__grid">
              {famList.map((c, i) => {
                const img = generalCategoryImage(c.name);
                const Icon = FAM_ICONS[i % FAM_ICONS.length];
                return (
                  <button key={c.id} type="button" className="svfam" onClick={() => setCat(c.id)}>
                    <span className="svfam__i">
                      {img ? (
                        <Image src={img} alt="" fill sizes="(max-width: 640px) 45vw, 260px" style={{ objectFit: "contain" }} />
                      ) : (
                        <Icon />
                      )}
                    </span>
                    <span className="svfam__t">
                      <b>{c.name}</b>
                    </span>
                  </button>
                );
              })}
            </div>
          )
        ) : showSubcats ? (
          !subcatList.length ? (
            <EmptyState icon={<IconBriefcase />} title={t("empty")} text={t("emptyText")} />
          ) : (
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
          )
        ) : !shown.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="svsel__grid svsel__grid--svc">
            {shown.map((s, i) => {
              const hasDoc = !!s.documentTemplateId;
              return (
                <div key={s.id} className="svc" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <div className="svc__top">
                    <span className="svc__i">{hasDoc ? <IconDocLines /> : <IconBriefcase />}</span>
                    <span className="svc__t">
                      <b>{s.name}</b>
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
                      onClick={() => {
                        setOrder(s);
                        setDocLawyer(hasDoc);
                        setForceAdvocate(!hasDoc);
                      }}
                    >
                      <IconUsers />
                      {t("sendToLawyer")}
                    </button>
                    {hasDoc ? (
                      <button
                        type="button"
                        className="svc__act svc__act--view"
                        onClick={() => router.push(`/portal/client/services/document/${s.id}/view${catalogBackQS ? `?${catalogBackQS}` : ""}`)}
                      >
                        <IconEye />
                        {t("viewDoc")}
                      </button>
                    ) : null}
                    {hasDoc ? (
                      <button
                        type="button"
                        className="svc__act svc__act--fill"
                        onClick={() => router.push(`/portal/client/services/document/${s.id}${catalogBackQS ? `?${catalogBackQS}` : ""}`)}
                      >
                        <IconEdit />
                        {t("fillDoc")}
                      </button>
                    ) : null}
                  </div>
                  {dlErr?.id === s.id ? <p className="svc__err">{dlErr.msg}</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={newDocOpen} onClose={() => setNewDocOpen(false)} title={t("newDocOrder")} wide>
        <NewDocumentOrder onClose={() => setNewDocOpen(false)} />
      </Modal>

      <Modal open={!!order} onClose={() => { setOrder(null); setPayOrderId(null); setDocLawyer(false); }} title={order?.name || t("orderTitle")} wide={!orderAsAdvocate}>
        {payOrderId ? (
          <OrderPayment orderId={payOrderId} onChat={afterPay} />
        ) : order && docLawyer ? (
          <ServiceDocumentRequest serviceId={order.id} initialMode="lawyer" />
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
                              <i><IconStar />{l.rating ? fmtRating(l.rating, locale) : "—"}</i>
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

      <ManualDocPlanGate open={planGateOpen} onClose={() => setPlanGateOpen(false)} message={planGateMsg} />
      <AiPlanUpgradeGate open={aiPlanGateOpen} onClose={() => setAiPlanGateOpen(false)} />
    </div>
  );
}
