"use client";

import { useEffect, useMemo, useState, type SVGProps, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import {
  getServicePassport,
  listLawyers,
  getPackageEligibleSellers,
  type PackageSellers,
  getPricingQuote,
  getMatchingCandidates,
  type BackendService,
  type BackendLawyer,
  type MatchCandidate,
  type PriceModifier,
  type PriceQuote,
  getLawyerServices,
} from "@/lib/services/backend";
import { http, asDict, asStr } from "@/lib/http";
import PurchaseDialog from "@/components/marketplace/PurchaseDialog";
import type { MarketService } from "@/lib/services/marketplace";
import ServicePassport from "@/components/portal/ServicePassport";
import ServiceDocumentRequest from "@/components/portal/ServiceDocumentRequest";
import NewDocumentOrder from "@/components/portal/NewDocumentOrder";
import CopilotLauncher from "@/components/copilot/CopilotLauncher";
import TemplateCatalog from "@/components/portal/docCatalog/TemplateCatalog";
import { useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { initials, humanizeSlug } from "@/lib/lawyers";
import { Skeleton } from "@/components/portal/DataState";
import Select from "@/components/Select";
import Modal from "@/components/admin/Modal";
import FieldError from "@/components/ui/FieldError";
import { evalBusinessHours, responseDeadline, deadlineLabel } from "@/lib/businessHours";
import { getBusinessHours, DEFAULT_BUSINESS_HOURS } from "@/lib/services/backend";
import {
  IconArrowRight,
  IconSparkle,
  IconAlert,
  IconStar,
  IconMapPin,
  IconCheck,
  IconClock,
  IconPlus,
} from "@/components/icons";
import VerifiedBadge from "@/components/VerifiedBadge";
import { fmtRating } from "@/lib/date";
import { useAiField, useAiModal } from "@/lib/ai/registry";

const som = (n?: number) => (n ? fmtUzs(n) : "");

const SORT_VALUES = ["match", "rating", "exp", "price"] as const;
type Sort = (typeof SORT_VALUES)[number];
const SORT_LABEL: Record<Sort, string> = { match: "sortMatch", rating: "sortRating", exp: "sortExp", price: "sortPrice" };

const IconSortArrows = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M7 20V4M3 8l4-4 4 4" />
    <path d="M17 4v16M13 16l4 4 4-4" />
  </svg>
);

// Select hands back a plain string; this is the one place it is narrowed back
// to the union, so a stale URL or a future option can never set a value the
// predicates below do not understand.
function pick<T extends string>(vals: readonly T[], v: string, dflt: T): T {
  return (vals as readonly string[]).includes(v) ? (v as T) : dflt;
}

export default function ClientServices() {
  const t = useTranslations("portal.client.services");
  const te = useTranslations("enums");
  const locale = useLocale();
  const router = useRouter();
  // Next.js's own query-param hook, not a hand-rolled `window.location.search`
  // read: this page only ever mounts client-side (PortalShell withholds
  // `children` until auth is ready — see its own `!ready || !session` guard),
  // so a manual read was never actually unsafe here. It's still the more
  // correct source: `searchParams` stays in sync with the router itself
  // (including a change made by another effect in the same tick), where a
  // one-off `window.location.search` snapshot can drift.
  const searchParams = useSearchParams();
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
  // Which required field stopped the last press of "Buyurtma berish" ("" when
  // nothing did). Same shape as the shipped pattern in
  // components/portal/DocumentLawyerAssist.tsx, deliberately: the order button
  // used to carry disabled={!sellerId}, and a disabled button cannot be
  // pressed, so a client who had not picked an advocate pressed a dead control
  // and was told nothing at all. The press is allowed now and the gate lives
  // in buy() below, which marks the list and moves focus into it.
  const [missing, setMissing] = useState<"" | "seller">("");
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [purchase, setPurchase] = useState<{ order: BackendService; service: MarketService; sellerUserId: string; sellerName: string; packageId: string } | null>(null);
  // "Advokat yo'llash" reuses the advocate-picker/buy branch below even for a
  // document-template service (normally that branch is skipped in favor of
  // the self-fill flow) — set only by that button, reset with the modal.
  const [forceAdvocate, setForceAdvocate] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  // "Advokatga yo'llash" on a card that HAS a document template is the same
  // journey as choosing "Advokat bilan tayyorlash" inside the fill screen —
  // one request into the call-center pool, no advocate picked by the client.
  // For a service with no template there is nothing to prepare, so that
  // button keeps meaning "order this service from an advocate".
  const [docLawyer, setDocLawyer] = useState(false);

  // Deep link from the AI offer cards (?service=<id>): a service with a
  // document opens its own builder, any other its order modal.
  const [deepId] = useState(() => searchParams.get("service") ?? "");
  const [docDeepId, setDocDeepId] = useState("");
  useEffect(() => {
    if (!deepId) return;
    let alive = true;
    getServicePassport(deepId, locale)
      .then((r) => {
        if (!alive || !r.service.id) return;
        if (r.service.documentTemplateId) setDocDeepId(r.service.id);
        else setOrder(r.service);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [deepId, locale]);
  // Hand off to the full-page document builder. `replace`, not `push`: with
  // push, ?service=<id> is still in the URL behind it, so pressing Back
  // re-reads it and bounces straight back into the builder — this page could
  // never be reached again without editing the address bar. Replacing also
  // drops the query so a later Back lands on a clean services page.
  useEffect(() => {
    if (docDeepId) router.replace(`/portal/client/services/document/${docDeepId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docDeepId]);

  // Reset the order modal when a service is opened (during render, not in the effect).
  const [prevOrder, setPrevOrder] = useState(order);
  if (order !== prevOrder) {
    setPrevOrder(order);
    if (order) {
      setSellersLoading(true);
      setCands(new Map());
      setSellerId("");
      setQuote(null);
      setMissing("");
    } else {
      setForceAdvocate(false);
    }
  }

  // A document-template service normally skips the marketplace entirely
  // (self-fill only); "Advokat yo'llash" forces it open anyway.
  const orderAsAdvocate = order && (!order.documentTemplateId || forceAdvocate);

  // An order that comes from a package picks its provider from the package's
  // own eligible list and from nowhere else (contract §17): the tiers are
  // never mixed, and an empty list is a real answer.
  const [packageId] = useState(() => searchParams.get("package") ?? "");
  const [pkg, setPkg] = useState<PackageSellers | null>(null);
  const loadPackageSellers = useCallback(() => {
    if (!packageId) return;
    getPackageEligibleSellers(packageId)
      .then((res) => {
        setPkg(res);
        setSellers(res.items);
      })
      .catch(() => {
        setPkg(null);
        setSellers([]);
      })
      .finally(() => setSellersLoading(false));
  }, [packageId]);

  useEffect(() => {
    if (!order || (order.documentTemplateId && !forceAdvocate)) return;
    if (packageId) {
      loadPackageSellers();
      return;
    }
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
    if (!order || packageId || (order.documentTemplateId && !forceAdvocate)) return;
    let alive = true;
    getMatchingCandidates({ serviceId: order.id, region: myRegion || undefined })
      .then((rows) => alive && setCands(new Map(rows.map((c) => [c.lawyerUserId, c]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [order, myRegion, forceAdvocate, packageId]);

  // A package's list comes ranked by the backend and stays in that order.
  const sortable = !packageId && !sellersLoading && sellers.filter((l) => l.userId).length > 1;
  const sortedSellers = useMemo(() => {
    if (packageId) return sellers;
    const rows = [...sellers];
    const score = (l: BackendLawyer) => cands.get(l.userId)?.score ?? -1;
    rows.sort((a, b) => {
      if (sort === "price") return (a.basePrice || Infinity) - (b.basePrice || Infinity);
      if (sort === "exp") return b.experienceYears - a.experienceYears;
      if (sort === "match" && score(a) !== score(b)) return score(b) - score(a);
      return Number(b.rated) - Number(a.rated) || b.rating - a.rating;
    });
    return rows;
  }, [sellers, sort, cands, packageId]);

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

  function buy() {
    if (!order) return;
    // A package the backend could not resolve is not ordered (contract §15).
    if (pkg?.unresolvedServiceCodes.length) return;
    // The one required field on this form. Marked, named in words and focused
    // rather than silently refused — see `missing` above.
    if (!sellerId) {
      setMissing("seller");
      (document.querySelector("#advpick button") as HTMLElement | null)?.focus();
      return;
    }
    setMissing("");
    const price = quote?.totalAmount || order.price || 0;
    setPurchase({
      order,
      service: {
        id: order.id,
        title: order.name,
        categoryId: order.categoryId ?? "",
        categoryTitle: order.categoryTitle ?? "",
        basePrice: quote?.baseAmount || order.price || 0,
        selectedPrice: price,
        price,
        currency: "UZS",
        deliveryMinutes: 0,
        experienceNote: "",
        advokatRequired: false,
        isSponsored: false,
      },
      sellerUserId: sellerId,
      sellerName: sellers.find((s) => s.userId === sellerId)?.name ?? "",
      packageId,
    });
    setOrder(null);
  }

  useAiModal("documents.create.modal", () => setNewDocOpen(true));
  const pickerOpen = Boolean(order && orderAsAdvocate && !docLawyer);
  useAiField(pickerOpen && sortable ? "services.order.sellers.sort" : "", {
    get: () => sort,
    set: (v) => {
      const w = v.trim().toLowerCase();
      const hit = SORT_VALUES.find((s) => s === w || t(SORT_LABEL[s]).toLowerCase() === w);
      if (hit) setSort(hit);
    },
  });

  const orderModalId = order && docLawyer
      ? "documents.lawyer.modal"
      : order && !orderAsAdvocate
        ? "documents.constructor.modal"
        : "services.order.modal";

  return (
    <div className="mkt">
      {/* Module 10 client entry points: AI intake + urgent advocate. */}
      <div className="mkt__actions">
        <Link href="/portal/client/intake" className="mkt__act mkt__act--ai" data-ai-id="documents.actions.ai-help">
          <span className="mkt__act-i"><IconSparkle /></span>
          <span className="mkt__act-t">
            <b>{t("aiHelp")}</b>
            <span>{t("aiHelpSub")}</span>
          </span>
          <IconArrowRight />
        </Link>
        <Link href="/portal/client/sos" className="mkt__act mkt__act--sos" data-ai-id="documents.actions.urgent">
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
      {/* The ready-document catalog reads the templates themselves
          (FRONTEND_MOBILE_LEGAL_DOCUMENT_TEMPLATES_FULL_FLOW_2026_10_22.md
          §1): GET /document-templates held 989 of them on 2026-10-22 while
          /services held 3, so the old service-built grid showed nothing. */}
      <TemplateCatalog
        initialCategory={searchParams.get("cat") ?? ""}
        initialQuery={searchParams.get("q") ?? ""}
        actions={
          <>
            <CopilotLauncher surface="service_catalog" context={{}} />
            <button type="button" className="btn btn--grad btn--sm" onClick={() => setNewDocOpen(true)} data-ai-target="button:create-document" data-ai-id="documents.create.open">
              <IconPlus />
              {t("newDocOrder")}
            </button>
          </>
        }
      />

      <Modal open={newDocOpen} onClose={() => setNewDocOpen(false)} title={t("newDocOrder")} wide>
        <div data-ai-id="documents.create.modal" data-ai-type="modal" data-ai-label={t("newDocOrder")}>
          <NewDocumentOrder onClose={() => setNewDocOpen(false)} />
        </div>
      </Modal>

      <Modal open={!!order} onClose={() => { setOrder(null); setDocLawyer(false); }} title={order?.name || t("orderTitle")} wide={!orderAsAdvocate}>
        <div
          data-ai-id={orderModalId}
          data-ai-type="modal"
          data-ai-label={order?.name || t("orderTitle")}
          data-ai-entity-type={order ? "service" : undefined}
          data-ai-entity-id={order?.id || undefined}
        >
          {order && docLawyer ? (
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
                <div className="svfilt__pick">
                  <label>{t("chooseAdvocate")}</label>
                  {sortable ? (
                    <div className="svfilt__sort" data-ai-id="services.order.sellers.sort" data-ai-type="select" data-ai-label={t("sortLabel")}>
                      <span className="svfilt__sortl">
                        <IconSortArrows aria-hidden="true" />
                        {t("sortLabel")}
                      </span>
                      <Select
                        value={sort}
                        onChange={(v) => setSort(pick(SORT_VALUES, v, "match"))}
                        ariaLabel={t("sortLabel")}
                        options={SORT_VALUES.map((s) => ({ value: s, label: t(SORT_LABEL[s]) }))}
                      />
                    </div>
                  ) : null}
                </div>
                {preSeller && preSellerOffers === false ? <p className="bhnote" role="status"><IconAlert />{t("preSellerNotOffering", { name: preSeller.name || t("preSellerAnon") })}</p> : null}
                {packageId && pkg?.unresolvedServiceCodes.length ? (
                  <p className="bhnote" role="alert">
                    <IconAlert />
                    {t("package.misconfigured", { codes: pkg.unresolvedServiceCodes.join(", ") })}
                  </p>
                ) : packageId && pkg ? (
                  <p className="pkgnote" role="note">
                    <b>{pkg.packageTitle || t("package.title")}</b>
                    {pkg.tariff && t.has(`package.tier.${pkg.tariff}`) ? <em className={`pkgnote__tier pkgnote__tier--${pkg.tariff.toLowerCase()}`}>{t(`package.tier.${pkg.tariff}`)}</em> : null}
                    <span>{pkg.tariff && t.has(`package.policy.${pkg.tariff}`) ? t(`package.policy.${pkg.tariff}`) : t("package.policyAny")}</span>
                  </p>
                ) : null}
                {sellersLoading ? (
                  <Skeleton rows={2} />
                ) : !sortedSellers.length ? (
                  <p className="advmuted">{packageId ? t("package.noSellers") : t("noSellers")}</p>
                ) : (
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
                              {l.verified || c?.reasons.includes("verified") ? <VerifiedBadge interactive={false} label={false} className="advpick__vf" /> : <em className="advpick__un">{t("unverified")}</em>}
                            </b>
                            <span className="advpick__stats">
                              <i><IconStar />{l.rated ? fmtRating(l.rating, locale) : t("unrated")}</i>
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
                            {l.effectivePrice || l.basePrice ? `${som(l.effectivePrice || l.basePrice)} ${t("som")}` : t("byRequest")}
                            {l.priceCapped ? <small className="advpick__cap">{t("priceCapped")}</small> : null}
                            {on ? <IconCheck className="advpick__ck" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* The red box alone would leave the press mute — it marks the
                    list and moves focus into it, and the client is never told in
                    words what was wrong. Same sentence-beside-the-control shape
                    as DocumentLawyerAssist. */}
                <FieldError id="advpick-err" msg={missing === "seller" ? t("sellerRequired") : null} />
              </div>

              {afterHours ? (
                <p className="bhnote" role="status"><IconClock />{t("afterHours", { when: respondBy })}</p>
              ) : sellerId ? (
                <p className="bhnote bhnote--ok" role="status"><IconClock />{t("respondBy", { when: respondBy })}</p>
              ) : null}
              {/* Not disabled while the advocate is unpicked: buy() answers the
                  press instead — see `missing`. */}
              <button className="btn btn--grad btn--full btn--lg" type="button" disabled={Boolean(pkg?.unresolvedServiceCodes.length)} onClick={buy}>
                {t("buy")}
              </button>
              <p className="rf__hint">{t("orderNote")}</p>
            </div>
          )}
        </div>
      </Modal>

      {purchase ? (
        <PurchaseDialog
          sellerUserId={purchase.sellerUserId}
          sellerName={purchase.sellerName}
          service={purchase.service}
          pkg={purchase.packageId ? { id: purchase.packageId, purchaseUrl: pkg?.items.find((l) => l.userId === purchase.sellerUserId)?.packagePurchaseUrl ?? "", duration: "" } : undefined}
          region={myRegion || undefined}
          returnPath="/portal/client/services"
          onBack={() => {
            setOrder(purchase.order);
            setPurchase(null);
          }}
          onClose={() => setPurchase(null)}
          onStale={() => {
            if (purchase.packageId) loadPackageSellers();
          }}
        />
      ) : null}

    </div>
  );
}
