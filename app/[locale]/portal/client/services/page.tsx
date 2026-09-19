"use client";

import { useEffect, useMemo, useState, type ComponentType, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
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
  type BackendService,
  type BackendLawyer,
  type MatchCandidate,
  type PriceModifier,
  type PriceQuote,
  getLawyerServices,
} from "@/lib/services/backend";
import { http, asDict, asStr } from "@/lib/http";
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
} from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

// Cycle a small set of legal icons across the service families.
const FAM_ICONS: ComponentType<{ className?: string }>[] = [
  IconScale, IconGavel, IconShield, IconFileText, IconUsers, IconBriefcase,
];

type Sort = "match" | "rating" | "exp" | "price";

export default function ClientServices() {
  const t = useTranslations("portal.client.services");
  const te = useTranslations("enums");
  const locale = useLocale();
  const router = useRouter();
  const cats = useResource(getServiceCategories, []);
  // The ordinary paid catalog (catalog_only=true) plus document-generation
  // services (LEXGO_CIVIL_COURT_DOCS_FRONTEND.md: these carry no catalog
  // metadata, so catalog_only=true alone leaves their whole category empty —
  // "0 ta xizmat" even though the category and its 36 documents are real).
  // Only document_template_id services are merged in from the wider fetch,
  // not arbitrary non-catalog rows, so unrelated test/draft data stays out.
  const services = useResource<BackendService>(
    () =>
      Promise.all([getServices({ catalog_only: true }, locale), getServices({ catalog_only: false }, locale)]).then(([catalog, all]) => {
        const byId = new Map(catalog.map((s) => [s.id, s]));
        for (const s of all) if (s.documentTemplateId && !byId.has(s.id)) byId.set(s.id, s);
        return [...byId.values()];
      }),
    [locale],
  );

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
  const [cat, setCat] = useState(""); // "" = families overview
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

  const query = q.trim().toLowerCase();
  const catalog = useMemo(() => (narrowed ? services.data.filter(offeredBy) : services.data), [services.data, narrowed, offeredBy]);
  const countFor = (id: string) => catalog.filter((s) => s.categoryId === id).length;
  // Families with at least one offered service (all of them when not narrowed).
  const famList = narrowed ? cats.data.filter((c) => countFor(c.id) > 0) : cats.data;

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

  // Search mode → flat results across everything; else drill by family.
  const list = useMemo(() => {
    if (query) {
      const hits = remote && remote.q.toLowerCase() === query ? remote.list : null;
      if (hits) {
        // Keep the catalog view (catalog_only) when it loaded: drop non-catalog hits.
        const byId = new Map(catalog.map((s) => [s.id, s]));
        return byId.size ? hits.flatMap((h) => byId.get(h.id) ?? []) : narrowed ? hits.filter(offeredBy) : hits;
      }
      return catalog.filter(
        (s) => s.name.toLowerCase().includes(query) || (s.catalogCode || "").toLowerCase().includes(query),
      );
    }
    return cat ? catalog.filter((s) => s.categoryId === cat) : [];
  }, [catalog, cat, query, remote, narrowed, offeredBy]);

  // Deep link from the AI offer cards (?service=<id>) opens that service's order
  // modal once the catalog is loaded; a service outside the catalog list is
  // fetched through its passport.
  const [deepId, setDeepId] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("service") ?? "",
  );
  const [deepFetch, setDeepFetch] = useState("");
  if (deepId && services.status !== "loading") {
    const found = services.data.find((s) => s.id === deepId);
    setDeepId("");
    if (found) setOrder(found);
    else setDeepFetch(deepId);
  }
  useEffect(() => {
    if (!deepFetch) return;
    let alive = true;
    getServicePassport(deepFetch, locale)
      .then((r) => alive && r.service.id && setOrder(r.service))
      .catch(() => {})
      .finally(() => alive && setDeepFetch(""));
    return () => {
      alive = false;
    };
  }, [deepFetch, locale]);

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
    }
  }

  useEffect(() => {
    // A document-generation service has no advocate to pick — skip the
    // marketplace lookups entirely instead of firing them for nothing.
    if (!order || order.documentTemplateId) return;
    listLawyers({ service_id: order.id })
      .then((rows) => {
        setSellers(rows);
        // The advocate chosen in the directory is picked automatically when they offer this service.
        if (preSeller && rows.some((r) => r.userId === preSeller.id)) setSellerId(preSeller.id);
      })
      .catch(() => setSellers([]))
      .finally(() => setSellersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);
  const preSellerOffers = !order || sellersLoading ? null : sellers.some((r) => r.userId === preSeller?.id);

  // Ranked, verified candidates for this service; used to order the sellers
  // above and to explain the match. A failure just leaves the rating order.
  useEffect(() => {
    if (!order || order.documentTemplateId) return;
    let alive = true;
    getMatchingCandidates({ serviceId: order.id, region: myRegion || undefined })
      .then((rows) => alive && setCands(new Map(rows.map((c) => [c.lawyerUserId, c]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [order, myRegion]);

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
              {narrowed ? t("preSellerOnly", { n: catalog.length }) : preServices && !preServices.size ? t("preSellerNoList") : t("preSellerLead")}
              {afterHours ? ` ${t("afterHours", { when: respondBy })}` : ""}
            </span>
          </div>
          <button type="button" className="btn btn--line btn--sm" onClick={() => { setPreSeller(null); if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname); }}>{t("preSellerClear")}</button>
        </div>
      ) : null}
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{showFamilies ? t("chooseFamily") : query ? t("title") : catName}</b>
          <span className="advmuted">{showFamilies ? famList.length : list.length}</span>
        </div>

        <div className="svsel__bar" style={{ marginBottom: 14 }}>
          <span className="svsel__search">
            <IconSearch />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
          </span>
        </div>

        {!showFamilies && !query ? (
          <button type="button" className="mkt__back" onClick={() => setCat("")}>
            <IconChevronLeft />
            {t("back")}
          </button>
        ) : null}

        {services.status === "loading" || cats.status === "loading" ? (
          <Skeleton rows={4} />
        ) : showFamilies ? (
          <div className="svsel__grid">
            {famList.map((c, i) => {
              const Icon = FAM_ICONS[i % FAM_ICONS.length];
              return (
                <button key={c.id} type="button" className="svcard" onClick={() => setCat(c.id)}>
                  <span className="svcard__i"><Icon /></span>
                  <span className="svcard__t">
                    <b>{c.name}</b>
                    <small>{t("servicesN", { n: countFor(c.id) })}</small>
                  </span>
                  <span className="svcard__c"><IconArrowRight /></span>
                </button>
              );
            })}
          </div>
        ) : !list.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="svsel__grid">
            {list.map((s) => (
              <button key={s.id} type="button" className="svcard" onClick={() => setOrder(s)}>
                <span className="svcard__i">{s.documentTemplateId ? <IconDocLines /> : <IconBriefcase />}</span>
                <span className="svcard__t">
                  <b>{s.name}</b>
                  <small>
                    {[s.catalogCode, s.price ? `${som(s.price)} ${t("som")}` : t("byRequest")].filter(Boolean).join(" · ")}
                  </small>
                </span>
                <span className="svcard__c"><IconArrowRight /></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!order} onClose={() => { setOrder(null); setPayOrderId(null); }} title={order?.name || t("orderTitle")} wide={!!order?.documentTemplateId}>
        {payOrderId ? (
          <OrderPayment orderId={payOrderId} onChat={afterPay} />
        ) : order?.documentTemplateId ? (
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
