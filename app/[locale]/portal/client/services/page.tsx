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
import { cleanDocTitle } from "@/lib/docTitle";
import OrderPayment from "@/components/portal/OrderPayment";
import ServicePassport from "@/components/portal/ServicePassport";
import ServiceDocumentRequest from "@/components/portal/ServiceDocumentRequest";
import NewDocumentOrder from "@/components/portal/NewDocumentOrder";
import ManualDocPlanGate from "@/components/portal/ManualDocPlanGate";
import AiPlanUpgradeGate from "@/components/portal/AiPlanUpgradeGate";
import { useResource, useResourceOne } from "@/lib/useResource";
import { normalizeSearchText } from "@/lib/searchText";
import { useIsFreeAiTier } from "@/lib/useAiTier";
import { fmtUzs } from "@/lib/money";
import { initials, humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import Select from "@/components/Select";
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
  IconClose,
} from "@/components/icons";
import { fmtRating } from "@/lib/date";

const som = (n?: number) => (n ? fmtUzs(n) : "");

// Cycle a small set of legal icons across the service families — only the
// fallback now, for a future category none of the illustrations below match.
const FAM_ICONS: ComponentType<{ className?: string }>[] = [
  IconScale, IconGavel, IconShield, IconFileText, IconUsers, IconBriefcase,
];

// Illustrations are chosen from the NORMALIZED name — transliterated out of
// Cyrillic, apostrophes dropped (lib/searchText) — not from the raw string.
// Production sends both scripts: of the 127 distinct subcategories live today,
// about a hundred are Cyrillic ("Шартномалар", "Меҳнат низолари", "Ижро"),
// and the old Latin-only regexes matched 20 of them. Everything else fell back
// to a cycled icon, which is why most service cards had no picture.
type ImageRule = {
  // Substrings of the normalized name; the first rule with any of them wins,
  // so ORDER IS THE SPECIFICITY. "Меҳнат шартномаси" must reach the labour
  // rule before the contracts one.
  any?: string[];
  // Whole normalized name, for a name too short to match on safely ("M&A").
  eq?: string[];
  src: string;
};
function pickImage(name: string, rules: ImageRule[]): string | null {
  const n = normalizeSearchText(name);
  if (!n) return null;
  for (const r of rules) {
    if (r.eq?.includes(n)) return r.src;
    if (r.any?.some((k) => n.includes(k))) return r.src;
  }
  return null;
}

// The 4 top-level general categories (LEXGO_GENERAL_DOCUMENT_CATEGORIES_FRONTEND.md).
const GENERAL_CATEGORY_IMAGES: ImageRule[] = [
  { any: ["fuqarolik"], src: "/img/fuqaro.png" },
  { any: ["iqtisodiy"], src: "/img/Iqtisodiy.png" },
  { any: ["jinoiy"], src: "/img/jinoiy.png" },
  { any: ["mamuriy"], src: "/img/mamuriy.png" },
];
function generalCategoryImage(name: string): string | null {
  return pickImage(name, GENERAL_CATEGORY_IMAGES);
}

// LEXGO_DOCUMENT_SUBCATEGORIES_FRONTEND.md: every service now carries a real
// `subcategory` string from the backend (21 in production, verified live —
// "Oila va aliment" 133, "Mehnat huquqi" 261, etc., across all 4 general
// categories, not just Fuqarolik, so this matches by name only — the same
// subcategory gets the same icon no matter which general category it's
// under) — this replaces the previous client-side title-keyword guess
// entirely. 20 of the 21 now have an illustration (public/img/); only
// "Ijara va lizing" (1 service in production) falls back to a cycled icon.
const SUBCATEGORY_IMAGES: ImageRule[] = [
  // Labour before contracts and before permits: "Меҳнат шартномаси" and
  // "Меҳнат рухсатномаси" are labour matters.
  { any: ["mehnat", "ishdan boshatish", "ish beruvchi"], src: "/img/mehnat-nizolari.png" },
  // Family and inheritance. Before contracts, so a marriage contract stays here.
  { any: ["oila", "aliment", "nikoh", "otalik", "ota ona", "meros", "vasiyat"], src: "/img/oliaviy-meros.png" },
  // Before the credit rule, whose "bank" would otherwise swallow "Банкротлик".
  { any: ["bankrotlik"], src: "/img/Bankrotlik.png" },
  { any: ["tergov", "ehtiyot chora"], src: "/img/tergov-chorasi.png" },
  { any: ["prokuror", "jinoyat", "jabrlanuvchi"], src: "/img/prokuror-jinoyat.png" },
  { any: ["transport", "logistika", "yol harakati"], src: "/img/Transport-logistika.png" },
  { any: ["notarial", "ishonchnoma"], src: "/img/ishonchnoma.png" },
  // "undirish" (recovery) and "ijro" (enforcement) are the same picture, and
  // both come before the debt rule so "Судгача ундириш" lands here.
  { any: ["undirish", "ijro"], src: "/img/ijro.png" },
  { any: ["qarzdorlik", "talabnoma", "sudgacha tartib"], src: "/img/Qarzdorlik.png" },
  // Administrative before the court rule: "Маъмурий судлов" is administrative.
  { any: ["mamuriy jarima", "mamuriy javobgarlik", "mamuriy huquqbuzarlik", "mamuriy sudlov"], src: "/img/mamuriy-jarima.png" },
  { any: ["davlat organlari", "davlat xaridlari"], src: "/img/davlat-orgnalari.png" },
  { any: ["kredit", "garov", "bank", "tolov tizim"], src: "/img/kredit.png" },
  { any: ["royxatga olish", "ruxsatnoma", "litsenziya", "lisenziya", "migrasiya", "kompaniya royxati", "qurilish nazorati"], src: "/img/royhatga-olish.png" },
  { any: ["korporativ", "tasis hujjat", "kompaniyada ozgarish", "ishtirokchilar", "tugatish", "qayta tashkil", "ulush",
          "investisiya", "due diligence", "patent", "tovar belgisi", "mualliflik", "ip nizolari"],
    eq: ["m a"], src: "/img/Korporativ.png" },
  // Personal NON-property rights, before the property rule — "номулкий
  // ҳуқуқлар" contains "mulkiy huquq" and would otherwise read as property.
  { any: ["shaxsiy nomulkiy"], src: "/img/boshqa-fuqorolik.png" },
  { any: ["uy joy", "kochmas mulk", "mulk nizolari", "mulkiy huquq", "er huquqi", "chegara nizolari", "ijara"], src: "/img/uyjoy-nizolari.png" },
  { any: ["oldi sotdi", "yetkazib berish", "istemolchi", "marketpleys"], src: "/img/yetkazib-berish.png" },
  // Contracts before tax/audit, so "Шартнома аудити" stays a contract matter.
  { any: ["shartnoma", "oferta"], src: "/img/shartnomlar.png" },
  { any: ["soliq", "audit", "muvofiqlik", "compliance", "malumotlar himoyasi"], src: "/img/Iqtisodiy.png" },
  { any: ["sud arizalari", "iltimosnoma", "sud bosqichi", "sudlov", "arbitraj", "yuqori instansiya", "advokat bilan ariza"], src: "/img/sudarizalari.png" },
  // Catch-all for the document-shaped subcategories, last of the specific ones.
  { any: ["hujjat"], src: "/img/boshqa-fuqorolik.png" },
  { any: ["fuqarolik"], src: "/img/fuqaro.png" },
];
function subcategoryImage(name: string): string | null {
  return pickImage(name, SUBCATEGORY_IMAGES);
}

const FILE_EXT = /\.([A-Za-z0-9]{1,8})$/;

// What the browser writes to disk when a client downloads a template. The
// catalogue was imported from a file system and its file names carry the
// same leftovers the titles do — over the 988 templates live today, 165 end
// in "..docx", 21 have a space before the extension and 12 start with "_",
// so a client saving one got "_Далилларни номақбул деб топиш тўғрисида
// илтимоснома..docx". cleanDocTitle is the cleaner those titles already go
// through in the normalizer, so the base name goes through it too and the
// extension is put back exactly as it arrived — a file the client cannot
// open is worse than one with an ugly name. It also blanks a name that is
// nothing but a UUID, which is how the two templates named after their own
// GUID fall through to the service and then to a plain "Hujjat namunasi".
function templateFileName(rawName: string, serviceName: string, mimeType: string, fallback: string): string {
  const ext = rawName.match(FILE_EXT)?.[1] || extFromMime(mimeType) || "docx";
  return `${cleanDocTitle(rawName.replace(FILE_EXT, "")) || cleanDocTitle(serviceName) || fallback}.${ext}`;
}

type Sort = "match" | "rating" | "exp" | "price";

// ── Catalogue filters, each one measured before it was offered ──────────
// A filter whose rows all share one value is noise, so every option below was
// counted against the live catalogue (GET /services?catalog_only=true, 497
// rows, 2026-09-29) first:
//   · documentTemplateId   348 with a ready document / 149 without
//   · executor bucket      349 AI / 123 yurist / 25 advokat
//   · price band           348 free / 44 up to 300k / 54 300k-1M / 51 over 1M
// Two options that used to sit here are gone on the same evidence. "So'rov
// bo'yicha" (no price and not the free tier) matched exactly 1 row of 497.
// And the free/paid pair was not a second filter at all: has_document_template
// and base_price == 0 agree on 497 of 497 rows, so "Narx: bepul" and "Hujjat:
// tayyor hujjat bor" selected the identical 348 cards. The price control only
// earns its place by splitting the 149 paid rows into bands (median 500 000,
// p75 3 500 000 so'm) that the free/paid pair could not see.
type DocFilter = "all" | "template" | "lawyer";
type PriceFilter = "all" | "free" | "low" | "mid" | "high";
type ExecFilter = "all" | "ai" | "yurist" | "advokat";
type SvcSort = "rel" | "az" | "cheap" | "doc";
// The directions and subcategory screens deliberately hold no service rows
// (see the /services fetch below — loading the whole catalogue up front was
// the page's real slowness), so the only thing they can honestly filter on is
// what GET /service-categories returns. services_count is the field that
// varies: of the 23 live directions, 4 hold 50+ services, 3 hold 20-49,
// 8 hold 5-19 and 8 hold 1-4.
type DirSize = "all" | "big" | "mid" | "small";
type SubSort = "count" | "countAsc" | "name";

const DOC_VALUES = ["all", "template", "lawyer"] as const;
const PRICE_VALUES = ["all", "free", "low", "mid", "high"] as const;
const EXEC_VALUES = ["all", "ai", "yurist", "advokat"] as const;
const SVCSORT_VALUES = ["rel", "az", "cheap", "doc"] as const;
const DIRSIZE_VALUES = ["all", "big", "mid", "small"] as const;
const SUBSORT_VALUES = ["count", "countAsc", "name"] as const;
// The i18n key each option's label comes from, kept beside the values so the
// row below is a list of controls rather than a wall of ternaries.
const DOC_LABEL: Record<DocFilter, string> = { all: "filterAll", template: "filterHasDoc", lawyer: "filterNoDoc" };
const PRICE_LABEL: Record<PriceFilter, string> = { all: "filterAll", free: "filterFree", low: "priceBandLow", mid: "priceBandMid", high: "priceBandHigh" };
const EXEC_LABEL: Record<ExecFilter, string> = { all: "filterAll", ai: "execAi", yurist: "execYurist", advokat: "execAdvokat" };
const SVCSORT_LABEL: Record<SvcSort, string> = { rel: "sortRelevance", az: "sortByName", cheap: "sortCheapFirst", doc: "sortDocFirst" };
const DIRSIZE_LABEL: Record<DirSize, string> = { all: "filterAll", big: "sizeBig", mid: "sizeMid", small: "sizeSmall" };
const SUBSORT_LABEL: Record<SubSort, string> = { count: "sortByCount", countAsc: "sortByCountAsc", name: "sortByName" };

// Select hands back a plain string; this is the one place it is narrowed back
// to the union, so a stale URL or a future option can never set a value the
// predicates below do not understand.
function pick<T extends string>(vals: readonly T[], v: string, dflt: T): T {
  return (vals as readonly string[]).includes(v) ? (v as T) : dflt;
}

const PRICE_LOW = 300_000;
const PRICE_MID = 1_000_000;
const inDoc = (s: BackendService, v: DocFilter) =>
  v === "all" ? true : v === "template" ? !!s.documentTemplateId : !s.documentTemplateId;
const inPrice = (s: BackendService, v: PriceFilter) => {
  if (v === "all") return true;
  const p = s.price ?? 0;
  if (v === "free") return !p;
  if (v === "low") return p > 0 && p <= PRICE_LOW;
  if (v === "mid") return p > PRICE_LOW && p <= PRICE_MID;
  return p > PRICE_MID;
};
// executor_type arrives in two scripts and two conventions at once — counted
// live: "ai_lawyer" 346, "Юрист" 55, "Юрист/Адвокат" 52, "yurist_advokat" 16,
// "Адвокат" 20, "advokat" 4, "Йўқ (фақат AI)" 2, "call_center_lawyer" 1,
// "document_constructor" 1. Nine raw values are not a filter; these three
// buckets are, and they divide what the document filter cannot: a search for
// "sud" returns 81 AI / 12 yurist / 4 advokat where the document filter only
// sees 81 and 16. Normalized through the same transliterator the search uses,
// so the Cyrillic spellings land in the same bucket as the Latin ones.
// advokat_required wins outright where it is set — it is the flag the card's
// own "Advokat bilan" ribbon is drawn from, and it moves the one
// "call_center_lawyer" row the string alone would have called a yurist.
function execBucket(s: BackendService): Exclude<ExecFilter, "all"> {
  if (s.advokatRequired) return "advokat";
  const n = normalizeSearchText(s.executorType || "");
  if (/(?:^| )ai(?: |$)/.test(n)) return "ai";
  if (n.includes("advokat") && !n.includes("yurist")) return "advokat";
  if (n.includes("yurist") || n.includes("lawyer")) return "yurist";
  return "ai";
}
const inExec = (s: BackendService, v: ExecFilter) => v === "all" || execBucket(s) === v;
// A direction's size bucket, from the backend's own services_count.
const sizeOf = (n: number): Exclude<DirSize, "all"> => (n >= 20 ? "big" : n >= 5 ? "mid" : "small");
const inSize = (n: number, v: DirSize) => v === "all" || sizeOf(n) === v;

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
  function openSubcat(catId: string, name: string) {
    setPrevCat(catId);
    setCat(catId);
    setSubcat(name);
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
  // Which required field stopped the last press of "Buyurtma berish" ("" when
  // nothing did). Same shape as the shipped pattern in
  // components/portal/DocumentLawyerAssist.tsx, deliberately: the order button
  // used to carry disabled={!sellerId}, and a disabled button cannot be
  // pressed, so a client who had not picked an advocate pressed a dead control
  // and was told nothing at all. The press is allowed now and the gate lives
  // in buy() below, which marks the list and moves focus into it.
  const [missing, setMissing] = useState<"" | "seller">("");
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);
  // "Advokat yo'llash" reuses the advocate-picker/buy branch below even for a
  // document-template service (normally that branch is skipped in favor of
  // the self-fill flow) — set only by that button, reset with the modal.
  const [forceAdvocate, setForceAdvocate] = useState(false);
  // The three service filters and the service sort — see the measured
  // distributions beside the type declarations above.
  const [docFilter, setDocFilter] = useState<DocFilter>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [execFilter, setExecFilter] = useState<ExecFilter>("all");
  // "rel" keeps whatever order `list` produced: the backend's relevance
  // ranking while searching, alphabetical inside a direction. Any other value
  // re-sorts in `shown` below.
  const [svcSort, setSvcSort] = useState<SvcSort>("rel");
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
    const name = templateFileName(fields.sourceFileName || "", s.name, fields.sourceMimeType, t("docViewTitle"));
    const ok = await fetchAndDeliver(() => getServiceTemplateSourceFile(src), name, true);
    if (!ok) setDlErr({ id: s.id, msg: t("downloadError") });
    setDlBusy("");
  }

  // ONE search threshold, for both the "are we searching" predicate here and
  // the debounced fetch below. While they were separate the page had a real
  // bug: a single typed character made `query` truthy, which switched every
  // branch to the search view, but the fetch stayed below its own 2-char
  // minimum and never ran — so the whole catalogue was replaced by the
  // "Xizmat topilmadi" empty state on the first keystroke.
  const SEARCH_MIN = 2;
  const term = q.trim();
  const searching = term.length >= SEARCH_MIN;
  // Empty below the minimum, so everything keyed off `query` keeps rendering
  // the catalogue while the client is still typing the first character.
  const query = searching ? term.toLowerCase() : "";
  // Already scoped to `cat` by the fetch itself (see `services` above) — no
  // per-category counts to show at the top level any more (that would mean
  // loading every category just to display a number nobody asked for yet).
  const catalog = useMemo(() => (narrowed ? services.data.filter(offeredBy) : services.data), [services.data, narrowed, offeredBy]);
  const famList = cats.data;
  // Every category's subcategories in one list, largest first, each carrying
  // the category it belongs to so a click can open it directly. Present only
  // on a backend that sends `subcategories` (2026-09-28); an older one falls
  // back to the category-first screen below.
  // `samples` is the backend's own sample_services (up to 3 titles it already
  // ships with every subcategory) — free data that turns a tile from a bare
  // name plus a count into something a client can recognise their case in.
  const allSubcats = useMemo(() => {
    const out: { cat: string; catName: string; name: string; n: number; samples: string[] }[] = [];
    for (const c of cats.data)
      for (const sc of c.subcategories)
        out.push({
          cat: c.id,
          catName: c.name,
          name: sc.title,
          n: sc.servicesCount,
          samples: sc.sampleServices.map((s) => s.title).filter(Boolean).slice(0, 3),
        });
    return out.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [cats.data]);
  // Counts for the category strip. subcategoriesCount is the backend's own
  // number; a deployment that omits it still gets a right count from the
  // subcategories it did send.
  const subsPerCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of allSubcats) m.set(x.cat, (m.get(x.cat) ?? 0) + 1);
    return m;
  }, [allSubcats]);
  const totalServices = useMemo(() => cats.data.reduce((n, c) => n + c.servicesCount, 0), [cats.data]);
  const [famFilter, setFamFilter] = useState("");
  const [subSort, setSubSort] = useState<SubSort>("count");
  const [dirSize, setDirSize] = useState<DirSize>("all");
  // Split out of flatSubcats so the size control can count what each of its
  // options would leave against the soha strip's current choice, the same way
  // the service filters count against each other.
  const famSubcats = useMemo(
    () => (famFilter ? allSubcats.filter((x) => x.cat === famFilter) : allSubcats),
    [allSubcats, famFilter],
  );
  const flatSubcats = useMemo(() => {
    const rows = famSubcats.filter((x) => inSize(x.n, dirSize));
    // allSubcats already arrives count-desc, so "count" needs no sort at all.
    if (subSort === "name") return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (subSort === "countAsc") return [...rows].sort((a, b) => a.n - b.n || a.name.localeCompare(b.name));
    return rows;
  }, [famSubcats, dirSize, subSort]);

  const NO_SUBCAT = "Boshqa";
  // The selected general category's own services, grouped by the backend's
  // real `subcategory` field (LEXGO_DOCUMENT_SUBCATEGORIES_FRONTEND.md) —
  // every category gets this, not just Fuqarolik. Sorted by count desc (the
  // MD's own recommended order, matching how it lists production counts).
  const catServices = catalog;
  // What the backend says this category contains. Present since 2026-09-28;
  // an older deployment sends nothing and the derived counts below take over.
  const catRow = useMemo(() => cats.data.find((c) => c.id === cat), [cats.data, cat]);
  // Its own memo so the two below do not see a fresh array each render.
  const backendSubcats = useMemo(() => catRow?.subcategories ?? [], [catRow]);
  const derivedCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of catServices) { const k = s.subcategory || NO_SUBCAT; m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [catServices]);
  // The backend's counts win while the category's own services are still
  // loading — that is the whole point of having them — but once every row is
  // in memory the derived count is the one that matches what a click shows.
  const subcatCounts = useMemo(() => {
    if (!backendSubcats.length) return derivedCounts;
    const m = new Map<string, number>();
    for (const s of backendSubcats) m.set(s.title, s.servicesCount);
    for (const [k, v] of derivedCounts) if (v) m.set(k, v);
    return m;
  }, [backendSubcats, derivedCounts]);
  // The per-category subcategory screen answers to the same two controls as
  // the flat directions screen, so the row above stays the row the client
  // just used instead of silently losing its settings one level down.
  const subRows = useMemo(() => [...subcatCounts.entries()].map(([name, n]) => ({ name, n })), [subcatCounts]);
  const subcatList = useMemo(() => {
    const rows = subRows.filter((x) => inSize(x.n, dirSize));
    rows.sort((a, b) =>
      subSort === "name"
        ? a.name.localeCompare(b.name)
        : subSort === "countAsc"
          ? a.n - b.n || a.name.localeCompare(b.name)
          : b.n - a.n || a.name.localeCompare(b.name),
    );
    return rows.map((r) => r.name);
  }, [subRows, dirSize, subSort]);
  // The same sample_services titles as the flat grid, for the per-category
  // subcategory screen (reached by a ?cat= deep link, or by backing out of a
  // subcategory). Empty on a subcategory the backend only knows through the
  // loaded services, which carry no samples.
  const subcatSamples = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of backendSubcats) m.set(s.title, s.sampleServices.map((x) => x.title).filter(Boolean).slice(0, 3));
    return m;
  }, [backendSubcats]);

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
    // Stale `remote` is harmless left as-is: `list` only reads it while
    // `query` is non-empty, and a short/cleared query takes the other
    // branch entirely.
    if (!searching) return;
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
  }, [term, searching, locale]);

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
  // has to re-run the catalog fetch. They used to be skipped outright unless
  // the client was searching (`if (!query) return list`), which is why a
  // drilled-in direction had no filters at all; the row is on every screen
  // now, so the predicates have to be too.
  const shown = useMemo(() => {
    const rows = list.filter((s) => inDoc(s, docFilter) && inPrice(s, priceFilter) && inExec(s, execFilter));
    // "rel" leaves `list` alone: relevance while searching, A-Z inside a
    // direction. localeCompare with the active locale, like `list` itself.
    if (svcSort === "az") rows.sort((a, b) => a.name.localeCompare(b.name, locale));
    else if (svcSort === "cheap") rows.sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || a.name.localeCompare(b.name, locale));
    else if (svcSort === "doc") rows.sort((a, b) => Number(!!b.documentTemplateId) - Number(!!a.documentTemplateId) || a.name.localeCompare(b.name, locale));
    return rows;
  }, [list, docFilter, priceFilter, execFilter, svcSort, locale]);
  // How many services each option would leave, counted against the other
  // groups' current choices — the number a person actually wants to see before
  // clicking, rather than a total that ignores the filters already applied.
  // Inside one direction these counts are also the honest answer to "why does
  // this filter do nothing": measured live, not one of the 11 directions
  // holding 5+ services is divided by the document or price filter, so the
  // zeroes beside the other options say so instead of pretending otherwise.
  const fCounts = useMemo(() => {
    const doc = {} as Record<DocFilter, number>;
    for (const v of DOC_VALUES) doc[v] = list.filter((s) => inDoc(s, v) && inPrice(s, priceFilter) && inExec(s, execFilter)).length;
    const price = {} as Record<PriceFilter, number>;
    for (const v of PRICE_VALUES) price[v] = list.filter((s) => inDoc(s, docFilter) && inPrice(s, v) && inExec(s, execFilter)).length;
    const exec = {} as Record<ExecFilter, number>;
    for (const v of EXEC_VALUES) exec[v] = list.filter((s) => inDoc(s, docFilter) && inPrice(s, priceFilter) && inExec(s, v)).length;
    return { doc, price, exec };
  }, [list, docFilter, priceFilter, execFilter]);
  const svcFiltersOn = docFilter !== "all" || priceFilter !== "all" || execFilter !== "all" || svcSort !== "rel";
  const dirFiltersOn = dirSize !== "all" || subSort !== "count";

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
      setMissing("");
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
    if (!order || buying) return;
    // The one required field on this form. Marked, named in words and focused
    // rather than silently refused — see `missing` above.
    if (!sellerId) {
      setMissing("seller");
      (document.querySelector("#advpick button") as HTMLElement | null)?.focus();
      return;
    }
    setMissing("");
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
  // Service cards are on screen: search results, or a direction drilled into.
  const svcScreen = !showFamilies && !showSubcats;
  // The two direction screens share one filter row, so the size control counts
  // against whichever of the two lists is actually rendered.
  const dirRows = showSubcats ? subRows : famSubcats;
  const dirCounts = useMemo(() => {
    const c: Record<DirSize, number> = { all: dirRows.length, big: 0, mid: 0, small: 0 };
    for (const r of dirRows) c[sizeOf(r.n)] += 1;
    return c;
  }, [dirRows]);

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
      {/* svhub marks this panel as the catalogue's own, so the shared blocks
          stacked above the grid (the search bar most of all) can be given a
          tighter rhythm here without touching the other places they appear. */}
      <div className="ppanel svhub">
        <div className="ppanel__h">
          <b>{showFamilies ? (allSubcats.length ? t("chooseSubcat") : t("chooseFamily")) : showSubcats ? catName : query ? t("title") : subcat || catName}</b>
          <span className="ppanel__hact">
            {showFamilies && allSubcats.length ? <span className="advmuted">{t("subcatsN", { n: flatSubcats.length })}</span> : null}
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

        {/* What this category actually covers, in the backend's own words
            (GET /service-categories sends a description for all four). On the
            category screen the heading is just its name, so this is the only
            place the client is told what is inside before drilling further. */}
        {showSubcats && catRow?.description ? <p className="svcat__lead">{catRow.description}</p> : null}

        <div className="svsel__bar">
          <span className="svsel__search">
            <IconSearch />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
          </span>
        </div>

        {/* ── One filter row for every screen of the catalogue ──────────
            The GM asked for two things that only work together: more filters
            beside "Tartib", and the "Barcha hujjatlarni ko'rish bepul!" line
            moved out of its own banner to the END of that row. There was no
            single row to move it to before this — the sort select lived inside
            the directions branch, a second and richer filter bar appeared only
            while searching, and the free line was a full-width banner above the
            search box (measured 41.8px tall on every screen, two lines at
            400px). One row on every screen is what makes "at the end of the
            filters" mean the same thing everywhere.
            Which controls the row carries depends on what the screen can
            honestly answer: the two direction screens hold no service rows on
            purpose, so they filter on the one field GET /service-categories
            returns that varies. */}
        <div className="svfilt">
          {svcScreen ? (
            <>
              <label className="svfilt__f">
                <span>{t("filterDoc")}</span>
                <Select
                  value={docFilter}
                  onChange={(v) => setDocFilter(pick(DOC_VALUES, v, "all"))}
                  ariaLabel={t("filterDoc")}
                  options={DOC_VALUES.map((v) => ({ value: v, label: `${t(DOC_LABEL[v])} · ${fCounts.doc[v]}` }))}
                />
              </label>
              <label className="svfilt__f">
                <span>{t("filterExec")}</span>
                <Select
                  value={execFilter}
                  onChange={(v) => setExecFilter(pick(EXEC_VALUES, v, "all"))}
                  ariaLabel={t("filterExec")}
                  options={EXEC_VALUES.map((v) => ({ value: v, label: `${t(EXEC_LABEL[v])} · ${fCounts.exec[v]}` }))}
                />
              </label>
              <label className="svfilt__f">
                <span>{t("filterPrice")}</span>
                <Select
                  value={priceFilter}
                  onChange={(v) => setPriceFilter(pick(PRICE_VALUES, v, "all"))}
                  ariaLabel={t("filterPrice")}
                  options={PRICE_VALUES.map((v) => ({ value: v, label: `${t(PRICE_LABEL[v])} · ${fCounts.price[v]}` }))}
                />
              </label>
              <label className="svfilt__f">
                <span>{t("sortLabel")}</span>
                <Select
                  value={svcSort}
                  onChange={(v) => setSvcSort(pick(SVCSORT_VALUES, v, "rel"))}
                  ariaLabel={t("sortLabel")}
                  options={SVCSORT_VALUES.map((v) => ({ value: v, label: t(SVCSORT_LABEL[v]) }))}
                />
              </label>
            </>
          ) : (
            <>
              <label className="svfilt__f">
                <span>{t("sortLabel")}</span>
                <Select
                  value={subSort}
                  onChange={(v) => setSubSort(pick(SUBSORT_VALUES, v, "count"))}
                  ariaLabel={t("sortLabel")}
                  options={SUBSORT_VALUES.map((v) => ({ value: v, label: t(SUBSORT_LABEL[v]) }))}
                />
              </label>
              <label className="svfilt__f">
                <span>{t("filterSize")}</span>
                <Select
                  value={dirSize}
                  onChange={(v) => setDirSize(pick(DIRSIZE_VALUES, v, "all"))}
                  ariaLabel={t("filterSize")}
                  options={DIRSIZE_VALUES.map((v) => ({ value: v, label: `${t(DIRSIZE_LABEL[v])} · ${dirCounts[v]}` }))}
                />
              </label>
            </>
          )}
          {(svcScreen ? svcFiltersOn : dirFiltersOn) ? (
            <button
              type="button"
              className="svfilt__clear"
              onClick={() => {
                if (svcScreen) {
                  setDocFilter("all");
                  setPriceFilter("all");
                  setExecFilter("all");
                  setSvcSort("rel");
                } else {
                  setDirSize("all");
                  setSubSort("count");
                }
              }}
            >
              <IconClose />
              {t("filterClear")}
            </button>
          ) : null}
          {/* Reading any document in the catalogue costs nothing — the charge
              is for filling one in, and saying so up front is what gets people
              to open one at all. Same string and the same role="status" as the
              banner it replaces; only the place and the paint changed. */}
          <span className="svfilt__free" role="status">
            <IconEye />
            {t("freeToView")}
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
        ) : showFamilies && allSubcats.length ? (
          // One list of every direction, with the four categories as a filter
          // above it instead of a screen before it.
          <>
            {/* The four categories as cards rather than the <Select> that
                used to sit here. Both drive the same famFilter, so this
                replaces it instead of doubling it: a Select option can only
                carry a name and a count, and /service-categories sends a
                real description for every one of the four that nothing on
                this page had ever rendered. "Barcha sohalar" is the way back
                to the full list, which is what the Select's first option and
                the clear button used to be. */}
            <div className="svcats" role="radiogroup" aria-label={t("filterCategory")}>
              <button
                type="button"
                role="radio"
                aria-checked={!famFilter}
                className={`svcat${!famFilter ? " on" : ""}`}
                onClick={() => setFamFilter("")}
              >
                <b>{t("allFamilies")}</b>
                <span className="svcat__d">{t("allFamiliesHint")}</span>
                <small className="svcat__n">
                  {[t("subcatsN", { n: allSubcats.length }), totalServices ? t("servicesN", { n: totalServices }) : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </button>
              {famList.map((c) => {
                const on = famFilter === c.id;
                const nSub = c.subcategoriesCount || subsPerCat.get(c.id) || 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`svcat${on ? " on" : ""}`}
                    onClick={() => setFamFilter(c.id)}
                  >
                    <b>{c.name}</b>
                    {c.description ? <span className="svcat__d">{c.description}</span> : null}
                    <small className="svcat__n">
                      {[nSub ? t("subcatsN", { n: nSub }) : "", c.servicesCount ? t("servicesN", { n: c.servicesCount }) : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </button>
                );
              })}
            </div>
            {/* The sort select that used to sit here is part of the one
                filter row above now — it was the only control on the page
                that a client could not find again after drilling in. */}
            {!flatSubcats.length ? (
              <EmptyState icon={<IconBriefcase />} title={t("empty")} text={t("emptyText")} />
            ) : (
              <div className="svfam__grid">
                {flatSubcats.map((sc, i) => {
                  const img = subcategoryImage(sc.name);
                  const Icon = FAM_ICONS[i % FAM_ICONS.length];
                  return (
                    <button key={`${sc.cat}-${sc.name}`} type="button" className="svfam" onClick={() => openSubcat(sc.cat, sc.name)}>
                      <span className="svfam__i">
                        {img ? (
                          <Image src={img} alt="" fill sizes="(max-width: 640px) 45vw, 260px" style={{ objectFit: "contain" }} />
                        ) : (
                          <Icon />
                        )}
                      </span>
                      <span className="svfam__t">
                        <b>{sc.name}</b>
                        {/* Which of the four it came from — the list is flat
                            now, so the card has to say it. */}
                        <small className="svfam__cat">{sc.catName}</small>
                        <small className="svfam__n">{t("servicesN", { n: sc.n })}</small>
                        {/* sample_services, straight off the category call —
                            a count alone never said what a "yo'nalish" holds.
                            Title too, because the line is clipped to one. */}
                        {sc.samples.length ? (
                          <small className="svfam__ex" title={sc.samples.join(" · ")}>{t("samples", { list: sc.samples.join(" · ") })}</small>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
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
                      {/* Same description the strip above the flat grid
                          shows — this branch is the older-backend fallback,
                          but the field comes from the same call. */}
                      {c.description ? <small className="svfam__d">{c.description}</small> : null}
                      {/* Counted by the backend (subcategories_count /
                          services_count). Before it sent them the card was a
                          picture and a word, with no hint of what was inside. */}
                      {c.servicesCount || c.subcategoriesCount ? (
                        <small className="svfam__n">
                          {[
                            c.subcategoriesCount ? t("subcatsN", { n: c.subcategoriesCount }) : "",
                            c.servicesCount ? t("servicesN", { n: c.servicesCount }) : "",
                          ].filter(Boolean).join(" · ")}
                        </small>
                      ) : null}
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
                      {subcatSamples.get(name)?.length ? (
                        <small className="svfam__ex" title={subcatSamples.get(name)!.join(" · ")}>
                          {t("samples", { list: subcatSamples.get(name)!.join(" · ") })}
                        </small>
                      ) : null}
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
              // advokat_required, normalized in lib/services/backend.ts. The
              // corner ribbon (wp-ribbon in globals.css) marks these and only
              // these: verified against the live API on 2026-09-29, 24 of the
              // 1138 catalogue rows carry it, and they are the ones a licensed
              // advocate handles in person instead of the client filling in a
              // template. Reachable here mostly through search — of the 24,
              // exactly one sits under a general category the drill-down can
              // walk into (Jinoiy > "Advokat bilan ariza"); the other 23 hang
              // off leaf categories that GET /service-categories does not
              // return, so only the category-agnostic search surfaces them.
              const advokatOnly = s.advokatRequired;
              return (
                <div key={s.id} className={`svc${advokatOnly ? " svc--adv" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <div className="svc__top">
                    <span className="svc__i">{hasDoc ? <IconDocLines /> : <IconBriefcase />}</span>
                    <span className="svc__t">
                      {/* Clamped to six lines in CSS — 18 of the 280 names in
                          a single direction run longer than that — so the
                          whole name stays reachable on the card itself. */}
                      <b title={s.name}>{s.name}</b>
                    </span>
                    {/* Real text, not aria-hidden decoration: nothing else on
                        the card says an advocate is required — "Advokatga
                        yo'llash" below is on every card, advokat_required or
                        not — so a screen reader would otherwise never hear the
                        one fact the ribbon exists to carry. Placed after the
                        title so it is read as a qualifier of the name; it is
                        absolutely positioned, so DOM order costs no layout. */}
                    {advokatOnly ? (
                      <span className="svcrib">
                        <b className="svcrib__t" title={t("advokatOnlyHint")}>{t("advokatOnly")}</b>
                      </span>
                    ) : null}
                  </div>
                  {/* The two that only show the blank template lead and share
                      a line; the two that commit the client to something take
                      a line each, ending on the primary action. DOM order is
                      the visual order so the keyboard follows the eye. */}
                  <div className="svc__acts">
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
                        className={`svc__act svc__act--dl${isFreeTier ? " svc__act--locked svc__act--pro" : ""}`}
                        disabled={dlBusy === s.id}
                        // Only on the gated branch: a Lite/Pro client's
                        // download just downloads, and a tooltip promising a
                        // paywall that isn't there would be a lie.
                        title={isFreeTier ? t("badgeProHint") : undefined}
                        onClick={() => handleDownload(s)}
                      >
                        {isFreeTier ? <IconLock /> : <IconDownload />}
                        {dlBusy === s.id ? t("downloading") : t("download")}
                        {/* The corner flag (wp-grid5 in globals.css), on the
                            same condition as the padlock and the upgrade
                            modal above — never on a card whose download
                            already works. Real text rather than a CSS
                            content: string, for the same two reasons
                            .svcrib gives: a CSS string cannot be translated,
                            and a screen reader would otherwise never hear
                            the one fact the corner exists to carry. It is
                            last in the DOM so the button reads "Yuklab olish
                            PRO"; it is absolutely positioned and
                            pointer-events:none, so it costs no layout and
                            cannot swallow the click. */}
                        {isFreeTier ? <span className="svc__flag svc__flag--pro">{t("badgePro")}</span> : null}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`svc__act svc__act--adv${advokatOnly ? " svc__act--top" : ""}`}
                      title={advokatOnly ? t("badgeTopHint") : undefined}
                      onClick={() => {
                        setOrder(s);
                        setDocLawyer(hasDoc);
                        setForceAdvocate(!hasDoc);
                      }}
                    >
                      <IconUsers />
                      {t("sendToLawyer")}
                      {/* TOP marks the 24 advokat_required rows out of 1141,
                          not every card — this button is on all of them, so
                          a flag on all of them would be wallpaper. Verified
                          against the live API on 2026-09-29: none of those
                          24 carries a document template, so on exactly those
                          cards this is the only button there is, while on
                          the other 1117 it is the third of four and is
                          painted deliberately calm so it does not compete
                          with the gradient "Hujjatni to'ldirish" (see
                          .svc__act--adv in globals.css). The same quiet
                          violet button means two different things in those
                          two places, and only here does it mean "this is the
                          whole service". */}
                      {advokatOnly ? <span className="svc__flag svc__flag--top">{t("badgeTop")}</span> : null}
                    </button>
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
                  <div className="chiprow chiprow--tabs">
                    {(["match", "rating", "exp", "price"] as Sort[]).map((s) => (
                      <button key={s} type="button" className="fchip" aria-pressed={sort === s} onClick={() => setSort(s)}>
                        {t(s === "match" ? "sortMatch" : s === "rating" ? "sortRating" : s === "exp" ? "sortExp" : "sortPrice")}
                      </button>
                    ))}
                  </div>
                  <div id="advpick" className={`advpick${missing === "seller" ? " is-bad" : ""}`}>
                    {sortedSellers.filter((l) => l.userId).map((l) => {
                      const on = sellerId === l.userId;
                      const c = cands.get(l.userId);
                      const reasons = (c?.reasons ?? []).filter((r) => r !== "verified").slice(0, 2);
                      return (
                        <button
                          key={l.userId}
                          type="button"
                          className={`advpick__c${on ? " on" : ""}`}
                          onClick={() => { setSellerId(l.userId); setMissing(""); }}
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
              {/* The red box alone would leave the press mute — it marks the
                  list and moves focus into it, and the client is never told in
                  words what was wrong. Same sentence-beside-the-control shape
                  as DocumentLawyerAssist. */}
              {missing === "seller" ? <p className="cform__bad" role="alert">{t("sellerRequired")}</p> : null}
            </div>

            {afterHours ? (
              <p className="bhnote" role="status"><IconClock />{t("afterHours", { when: respondBy })}</p>
            ) : sellerId ? (
              <p className="bhnote bhnote--ok" role="status"><IconClock />{t("respondBy", { when: respondBy })}</p>
            ) : null}
            {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
            {/* Not disabled while the advocate is unpicked: buy() answers the
                press instead — see `missing`. Only the in-flight request
                disables it, which is the one state a second press would
                actually break. */}
            <button className="btn btn--grad btn--full btn--lg" type="button" disabled={buying} onClick={buy}>
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
