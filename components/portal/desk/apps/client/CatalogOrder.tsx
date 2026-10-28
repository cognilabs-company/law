"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getBusinessHours,
  getMatchingCandidates,
  getPackageEligibleSellers,
  getPricingQuote,
  listLawyers,
  DEFAULT_BUSINESS_HOURS,
  type BackendLawyer,
  type BackendService,
  type MatchCandidate,
  type PackageSellers,
  type PriceModifier,
  type PriceQuote,
} from "@/lib/services/backend";
import { deadlineLabel, evalBusinessHours, responseDeadline } from "@/lib/businessHours";
import { humanizeSlug } from "@/lib/lawyers";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { IconArrowRight, IconCheck, IconClock, IconShieldCheck } from "@/components/icons";
import { Avatar, Banner, Btn, Dialog, Loading, Select, Tag } from "../../kit/kit";
import type { NativeProps } from "../../native";
import PurchaseSheet from "./Purchase";
import Passport from "./Passport";

// Ordering a catalog service from an advocate, as a desktop sheet: the
// price with how it was reached, the service's passport, the advocates who
// offer it (best match first, or by rating, experience, price), and the
// order. Placed, the same sheet takes the advance — the share that opens
// the chat — and then the payment stages. The rules are the web catalog's.

const SORTS = ["match", "rating", "exp", "price"] as const;
type Sort = (typeof SORTS)[number];
const SORT_LABEL: Record<Sort, string> = { match: "sortMatch", rating: "sortRating", exp: "sortExp", price: "sortPrice" };
const som = (n?: number) => (n ? fmtUzs(n) : "0");

export default function CatalogOrder({
  service,
  packageId,
  preSeller,
  region,
  openLink,
  onClose,
}: {
  service: BackendService;
  packageId: string;
  preSeller: { id: string; name: string } | null;
  region: string;
  openLink: NativeProps["openLink"];
  onClose: () => void;
}) {
  const t = useTranslations("portal.client.services");
  const te = useTranslations("enums");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const [sellers, setSellers] = useState<BackendLawyer[] | null>(null);
  const [pkg, setPkg] = useState<PackageSellers | null>(null);
  const [pkgTry, setPkgTry] = useState(0);
  const [cands, setCands] = useState<Map<string, MatchCandidate>>(new Map());
  const [sort, setSort] = useState<Sort>("match");
  const [sellerId, setSellerId] = useState("");
  const [missing, setMissing] = useState(false);
  const [quote, setQuote] = useState<{ key: string; q: PriceQuote | null } | null>(null);
  const [err, setErr] = useState("");
  const [buyNow, setBuyNow] = useState(false);
  const [hours, setHours] = useState<{ after: boolean; by: string } | null>(null);

  useEffect(() => {
    let alive = true;
    if (packageId)
      getPackageEligibleSellers(packageId)
        .then((r) => alive && (setPkg(r), setSellers(r.items)))
        .catch(() => alive && (setPkg(null), setSellers([])));
    else
      listLawyers({ service_id: service.id })
        .then((rows) => {
          if (!alive) return;
          setSellers(rows);
          if (preSeller && rows.some((r) => r.userId === preSeller.id)) setSellerId(preSeller.id);
        })
        .catch(() => alive && setSellers([]));
    return () => {
      alive = false;
    };
  }, [service.id, packageId, preSeller, pkgTry]);
  useEffect(() => {
    if (packageId) return;
    let alive = true;
    getMatchingCandidates({ serviceId: service.id, region: region || undefined })
      .then((rows) => alive && setCands(new Map(rows.map((c) => [c.lawyerUserId, c]))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [service.id, region, packageId]);
  // The quote for the chosen advocate.
  const qKey = sellerId ? `${service.id}:${sellerId}` : "";
  useEffect(() => {
    if (!sellerId) return;
    let alive = true;
    getPricingQuote({ service_id: service.id, lawyer_user_id: sellerId, region: region || undefined })
      .then((q) => alive && setQuote({ key: qKey, q }))
      .catch(() => alive && setQuote({ key: qKey, q: null }));
    return () => {
      alive = false;
    };
  }, [service.id, sellerId, region, qKey]);
  // Out of working hours the advocate answers the next working morning.
  useEffect(() => {
    let alive = true;
    const run = (h: typeof DEFAULT_BUSINESS_HOURS) => {
      const now = Date.now();
      if (alive) setHours({ after: !evalBusinessHours(h, now).workingTime, by: deadlineLabel(responseDeadline(h, now, 30), now, { today: t("deadlineToday"), tomorrow: t("deadlineTomorrow") }) });
    };
    getBusinessHours()
      .then(run)
      .catch(() => run(DEFAULT_BUSINESS_HOURS));
    return () => {
      alive = false;
    };
  }, [t]);

  const sorted = useMemo(() => {
    const rows = (sellers ?? []).filter((l) => l.userId);
    if (packageId) return rows;
    const score = (l: BackendLawyer) => cands.get(l.userId)?.score ?? -1;
    return [...rows].sort((a, b) => {
      if (sort === "price") return (a.basePrice || Infinity) - (b.basePrice || Infinity);
      if (sort === "exp") return b.experienceYears - a.experienceYears;
      if (sort === "match" && score(a) !== score(b)) return score(b) - score(a);
      return Number(b.rated) - Number(a.rated) || b.rating - a.rating;
    });
  }, [sellers, sort, cands, packageId]);
  const q = quote && quote.key === qKey ? quote.q : null;
  const quoting = !!sellerId && (!quote || quote.key !== qKey);
  const modLabel = (m: PriceModifier) => (m.key && t.has(`modifiers.${m.key}`) ? t(`modifiers.${m.key}`) : m.label || humanizeSlug(m.key) || "—");
  const modValue = (m: PriceModifier) => (m.percent ? `${m.percent > 0 ? "+" : ""}${m.percent}%` : m.multiplier && m.multiplier !== 1 ? `×${Number(m.multiplier.toFixed(2))}` : m.amount ? `${som(m.amount)} ${t("som")}` : "×1");
  const reason = (r: string) => (t.has(`matchReasons.${r}`) ? t(`matchReasons.${r}`) : humanizeSlug(r));
  const broken = !!pkg?.unresolvedServiceCodes.length;

  function buy() {
    if (broken) return;
    if (!sellerId) return setMissing(true);
    setErr("");
    setBuyNow(true);
  }

  if (buyNow) {
    const price = q?.totalAmount || service.price || 0;
    return (
      <PurchaseSheet
        sellerUserId={sellerId}
        sellerName={(sellers ?? []).find((l) => l.userId === sellerId)?.name ?? ""}
        service={{ id: service.id, title: service.name, categoryId: service.categoryId ?? "", categoryTitle: service.categoryTitle ?? "", basePrice: q?.baseAmount || service.price || 0, selectedPrice: price, price, currency: "UZS", deliveryMinutes: 0, experienceNote: "", advokatRequired: false, isSponsored: false }}
        pkg={packageId ? { id: packageId, purchaseUrl: pkg?.items.find((l) => l.userId === sellerId)?.packagePurchaseUrl ?? "", duration: "" } : undefined}
        region={region || undefined}
        openLink={openLink}
        onClose={onClose}
        onBack={() => setBuyNow(false)}
        onStale={() => {
          setBuyNow(false);
          if (packageId) {
            setSellerId("");
            setSellers(null);
            setPkgTry((n) => n + 1);
          }
        }}
      />
    );
  }

  return (
    <Dialog
      open
      title={service.name || t("orderTitle")}
      width={640}
      onClose={onClose}
      onSubmit={() => void buy()}
      actions={
        <>
          <span className="dxcu-total">
            <small>{t("priceTotal")}</small>
            <b>{q ? `${som(q.totalAmount)} ${t("som")}` : quoting ? t("priceCalc") : service.price ? `${som(service.price)} ${t("som")}` : t("byRequest")}</b>
          </span>
          <Btn onClick={onClose}>{d("cancel")}</Btn>
          <Btn kind="primary" type="submit" disabled={broken} icon={<IconArrowRight />}>
            {t("buy")}
          </Btn>
        </>
      }
    >
      {q && (q.modifiers.length || q.discountAmount || q.referralDiscountPercent) ? (
        <dl className="dxcp-bill">
          {q.baseAmount && q.baseAmount !== q.totalAmount ? (
            <div>
              <dt>{t("priceBase")}</dt>
              <dd>{`${som(q.baseAmount)} ${t("som")}`}</dd>
            </div>
          ) : null}
          {q.modifiers.map((m, i) => (
            <div key={i}>
              <dt>{modLabel(m)}</dt>
              <dd>{modValue(m)}</dd>
            </div>
          ))}
          {q.referralDiscountPercent || q.discountAmount ? (
            <div>
              <dt>{t("referralDiscount")}</dt>
              <dd>{q.discountAmount ? `−${som(q.discountAmount)} ${t("som")}` : `−${q.referralDiscountPercent}%`}</dd>
            </div>
          ) : null}
          <div className="is-total">
            <dt>{t("priceTotal")}</dt>
            <dd>{`${som(q.totalAmount)} ${t("som")}`}</dd>
          </div>
        </dl>
      ) : null}
      <Passport serviceId={service.id} />
      {packageId && pkg ? (
        broken ? (
          <Banner tone="err">{t("package.misconfigured", { codes: pkg.unresolvedServiceCodes.join(", ") })}</Banner>
        ) : (
          <Banner tone="info" title={pkg.packageTitle || t("package.title")}>
            {pkg.tariff && t.has(`package.policy.${pkg.tariff}`) ? t(`package.policy.${pkg.tariff}`) : t("package.policyAny")}
          </Banner>
        )
      ) : null}
      <div className="dx-field">
        <span className="dxco-pickh">
          <span className="dx-field__l">{t("chooseAdvocate")}</span>
          {!packageId && sorted.length > 1 ? <Select value={sort} onChange={setSort} ariaLabel={t("sortLabel")} options={SORTS.map((s) => ({ value: s, label: t(SORT_LABEL[s]) }))} /> : null}
        </span>
        {preSeller && sellers && !sellers.some((r) => r.userId === preSeller.id) ? <Banner tone="warn">{t("preSellerNotOffering", { name: preSeller.name || t("preSellerAnon") })}</Banner> : null}
        {sellers === null ? (
          <Loading label={t("chooseAdvocate")} />
        ) : !sorted.length ? (
          <p className="dx-dlg__text">{packageId ? t("package.noSellers") : t("noSellers")}</p>
        ) : (
          <ul className={`dxco-pick${missing ? " is-bad" : ""}`} role="radiogroup" aria-label={t("chooseAdvocate")}>
            {sorted.map((l) => {
              const on = sellerId === l.userId;
              const c = cands.get(l.userId);
              return (
                <li key={l.userId}>
                  <button type="button" role="radio" aria-checked={on} className={on ? "is-on" : ""} onClick={() => (setSellerId(l.userId), setMissing(false))}>
                    <Avatar name={l.name || "A"} size={36} />
                    <span className="dxco-pick__m">
                      <b>
                        {l.name || "—"}
                        {l.verified || c?.reasons.includes("verified") ? <IconShieldCheck className="dxcl-ok" aria-label={d("verified")} /> : <Tag>{t("unverified")}</Tag>}
                      </b>
                      <small>
                        {[l.rated ? `★ ${fmtRating(l.rating, locale)}` : t("unrated"), l.experienceYears ? t("expYears", { n: l.experienceYears }) : "", l.successRate ? t("successRate", { n: l.successRate }) : "", l.region ? (te.has(`regions.${l.region}`) ? te(`regions.${l.region}`) : l.region) : ""].filter(Boolean).join(" · ")}
                      </small>
                      {c ? (
                        <span className="dxcw-tags">
                          <Tag tone="accent">{t("matchScore", { n: Math.round(c.score) })}</Tag>
                          {c.reasons
                            .filter((r) => r !== "verified")
                            .slice(0, 2)
                            .map((r) => (
                              <Tag key={r}>{reason(r)}</Tag>
                            ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="dxco-pick__p">
                      {l.effectivePrice || l.basePrice ? `${som(l.effectivePrice || l.basePrice)} ${t("som")}` : t("byRequest")}
                      {l.priceCapped ? <small>{t("priceCapped")}</small> : null}
                    </span>
                    <i aria-hidden>{on ? <IconCheck /> : null}</i>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {missing ? <small className="dx-field__e">{t("sellerRequired")}</small> : null}
      </div>
      {hours ? (
        <p className="dxcw-next dxco-hours">
          <IconClock aria-hidden /> {hours.after ? t("afterHours", { when: hours.by }) : sellerId ? t("respondBy", { when: hours.by }) : t("orderNote")}
        </p>
      ) : null}
      {err ? <Banner tone="err">{err}</Banner> : null}
    </Dialog>
  );
}
