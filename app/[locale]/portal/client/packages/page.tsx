"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getServicePackages, getAllServices, getPackageEligibleSellers, type BackendPackage, type PackageSeller, type PackageSellers } from "@/lib/services/backend";
import type { MarketService } from "@/lib/services/marketplace";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import FilterBar from "@/components/filters/FilterBar";
import { IconBriefcase, IconCheck, IconClose, IconClock, IconLayers, IconPackage, IconStar, IconGem, IconArrowRight, IconShieldCheck } from "@/components/icons";
import PackageSellersDialog from "@/components/marketplace/PackageSellersDialog";
import PurchaseDialog from "@/components/marketplace/PurchaseDialog";

// One mark per tariff, so the three boxes are told apart before they are read.
const TIER_ICON = { BASIC: IconPackage, STANDARD: IconStar, PREMIUM: IconGem } as const;

const TIERS = ["BASIC", "STANDARD", "PREMIUM"] as const;
// Seed/test packages the backend team left in the catalogue (reported).
const isTest = (p: BackendPackage) => /test|t1b/i.test(p.code) || /test/i.test(p.title);
const codeCount = (list: BackendPackage[]) => new Set(list.map((p) => p.groupCode)).size;
const RETURN_PATH = "/portal/client/packages";

const asMarketService = (p: BackendPackage, title: string): MarketService => ({
  id: p.id,
  title,
  categoryId: "",
  categoryTitle: p.categoryTitle,
  basePrice: p.price,
  selectedPrice: p.price,
  price: p.price,
  currency: "UZS",
  deliveryMinutes: 0,
  experienceNote: "",
  advokatRequired: false,
  isSponsored: false,
});

// T1B-01: packages = services + one price + what's included. Grouped by
// package code, one card per tariff; "Alohida: X · Paketda: Y · Tejaysiz: Z"
// is shown when the catalogue services in the package have their own prices.
export default function ClientPackages() {
  const t = useTranslations("portal.client.packages");
  const locale = useLocale();
  const pk = useResource(() => getServicePackages(), []);
  // getAllServices, not getServices: /services is paged now (LEXGO_SERVICES_
  // CATALOG_OPTIMIZATION_FRONTEND.md) — the catalogCode lookup below needs
  // every service, not just the first page, or a package referencing a
  // service outside it would silently show no "separately" price.
  const services = useResource(() => getAllServices(undefined, locale), [locale]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<BackendPackage | null>(null);

  // Service id → its own price, for the "separately" comparison.
  const priceOf = useMemo(() => new Map(services.data.map((s) => [s.id, s.price ?? 0])), [services.data]);
  // Which services a package needs is the backend's answer, never read out
  // of the "G01-G03" text (contract §15). The tiers of one package code
  // share their services, so one tier is asked per code, a few at a time;
  // the order itself asks again for the exact tier.
  const [need, setNeed] = useState<Map<string, PackageSellers>>(() => new Map());
  useEffect(() => {
    const firsts = [...new Map(pk.data.filter((p) => !isTest(p)).map((p) => [p.groupCode, p])).values()];
    if (!firsts.length) return;
    let live = true;
    let next = 0;
    const run = async () => {
      while (live && next < firsts.length) {
        const p = firsts[next++];
        const r = await getPackageEligibleSellers(p.id, { limit: 1 }).catch(() => null);
        if (live && r) setNeed((m) => new Map(m).set(p.groupCode, r));
      }
    };
    for (let i = 0; i < 4; i++) void run();
    return () => {
      live = false;
    };
  }, [pk.data]);
  const separately = (p: BackendPackage) => {
    const r = need.get(p.groupCode);
    if (!r || r.unresolvedServiceCodes.length) return 0;
    const prices = r.requiredServiceIds.map((id) => priceOf.get(id) ?? 0);
    return prices.length && prices.every((x) => x > 0) ? prices.reduce((a, b) => a + b, 0) : 0;
  };
  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pk.data.filter((p) => !isTest(p) && p.active && (!needle || `${p.title} ${p.categoryTitle} ${p.code}`.toLowerCase().includes(needle)));
  }, [pk.data, q]);
  const cats = useMemo(
    () => [...new Set(pk.data.filter((p) => !isTest(p)).map((p) => p.categoryTitle).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [pk.data],
  );
  const groups = useMemo(() => {
    const m = new Map<string, BackendPackage[]>();
    for (const p of found) {
      if (cat && p.categoryTitle !== cat) continue;
      if (!m.has(p.groupCode)) m.set(p.groupCode, []);
      m.get(p.groupCode)!.push(p);
    }
    for (const v of m.values()) v.sort((a, b) => TIERS.indexOf(a.tariff as (typeof TIERS)[number]) - TIERS.indexOf(b.tariff as (typeof TIERS)[number]));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [found, cat]);
  const catOpts = [
    { value: "", label: `${t("allCategories")} (${codeCount(found)})` },
    ...cats.map((c) => ({ value: c, label: `${c} (${codeCount(found.filter((p) => p.categoryTitle === c))})` })),
  ];

  const [picking, setPicking] = useState<BackendPackage | null>(null);
  const [buying, setBuying] = useState<{ pkg: BackendPackage; seller: PackageSeller } | null>(null);
  const [sellerReload, setSellerReload] = useState(0);
  const tierTitle = (p: BackendPackage) => `${p.groupTitle || p.title} · ${t.has(`tiers.${p.tariff}`) ? t(`tiers.${p.tariff}`) : p.tariff}`;
  function order(p: BackendPackage) {
    setOpen(null);
    setBuying(null);
    setPicking(p);
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{pk.status === "ready" ? t("count", { n: groups.length }) : ""}</span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      <div data-ai-target="packages:search" data-ai-label={t("searchPh")}>
        <FilterBar
          className="ppfilters"
          fields={[{ key: "cat", label: t("category"), icon: IconLayers, value: cat, onChange: setCat, options: catOpts, hidden: cats.length < 2 }]}
          search={{ value: q, onChange: setQ, placeholder: t("searchPh") }}
          count={pk.status === "loading" ? undefined : groups.length}
        />
      </div>
      {pk.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !groups.length ? (
        <EmptyState icon={<IconBriefcase />} title={t("empty")} text={t("emptyText")} />
      ) : (
        groups.map(([code, items], gi) => (
          <div className="pkg" key={code}>
            <div className="pkg__h">
              <span className="pkg__hi" aria-hidden><IconPackage /></span>
              <b>{items[0].groupTitle || items[0].title}</b>
              <span className="advmuted">{[items[0].categoryTitle, code].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="pkg__tiers" data-ai-target={gi === 0 ? "packages:tiers" : undefined}>
              {items.map((p, i) => {
                const sep = separately(p);
                const saves = sep > p.price ? sep - p.price : 0;
                const TierIcon = TIER_ICON[p.tariff as keyof typeof TIER_ICON] ?? IconPackage;
                // The middle of three, or the top of two — the tier most
                // people take, marked so the row has a default answer.
                const best = items.length > 1 && i === Math.min(1, items.length - 1);
                return (
                  <div className={`pkg__tier pkg__tier--${p.tariff.toLowerCase()}${best ? " pkg__tier--best" : ""}`} key={p.id}>
                    {best ? <span className="pkg__best">{t("bestValue")}</span> : null}
                    <span className={`pkg__ti pkg__ti--${p.tariff.toLowerCase()}`} aria-hidden><TierIcon /></span>
                    <span className="pkg__tariff">{t.has(`tiers.${p.tariff}`) ? t(`tiers.${p.tariff}`) : p.tariff}</span>
                    <b className="pkg__price">{fmtUzs(p.price)} <small>{t("som")}</small></b>
                    {saves ? <span className="pkg__save"><IconCheck />{t("saves", { n: fmtUzs(saves) })}</span> : null}
                    {sep ? <small className="pkg__cmp">{t("compare", { sep: fmtUzs(sep), pkg: fmtUzs(p.price) })}</small> : null}
                    {p.duration ? <span className="pkg__dur"><IconClock />{p.duration}</span> : null}
                    {p.tariff === "PREMIUM" ? <span className="pkg__req"><IconShieldCheck />{t("premiumReq")}</span> : null}
                    <ul className="pkg__inc">
                      {p.included.slice(0, 3).map((x, k) => <li key={k}><IconCheck />{x}</li>)}
                      {p.excluded.slice(0, 2).map((x, k) => <li key={`x${k}`} className="no"><IconClose />{x}</li>)}
                    </ul>
                    <div className="pkg__acts">
                      <button type="button" className="btn btn--line btn--sm" onClick={() => setOpen(p)}>{t("details")}</button>
                      <button type="button" className={`btn btn--sm ${best ? "btn--grad" : "btn--pri"}`} onClick={() => order(p)} data-ai-id={`packages.order.${p.id}`} data-ai-label={tierTitle(p)}>{t("order")}<IconArrowRight /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? tierTitle(open) : ""}>
        {open ? (
          <div className="pkgd">
            <div className="pkv">
              <div className="pkv__i"><label>{t("price")}</label><b>{fmtUzs(open.price)} {t("som")}</b></div>
              <div className="pkv__i"><label>{t("duration")}</label><b>{open.duration || "—"}</b></div>
              <div className="pkv__i"><label>{t("category")}</label><b>{open.categoryTitle || "—"}</b></div>
              <div className="pkv__i"><label>{t("services")}</label><b>{need.get(open.groupCode)?.requiredServiceCodes.join(", ") || open.relatedServiceCodes || "—"}</b></div>
            </div>
            {open.result ? <p className="rf__benefit" style={{ marginTop: 12 }}><b>{t("result")}</b><br />{open.result}</p> : null}
            <b className="pkgd__h">{t("included")}</b>
            <ul className="pkg__inc">{open.included.map((x, i) => <li key={i}><IconCheck />{x}</li>)}</ul>
            {open.excluded.length ? (
              <>
                <b className="pkgd__h">{t("excluded")}</b>
                <ul className="pkg__inc">{open.excluded.map((x, i) => <li key={i} className="no"><IconClose />{x}</li>)}</ul>
              </>
            ) : null}
            <button type="button" className="btn btn--pri btn--full" style={{ marginTop: 14 }} onClick={() => order(open)}>{t("order")}</button>
          </div>
        ) : null}
      </Modal>

      <PackageSellersDialog
        pkg={picking}
        title={picking ? picking.groupTitle || picking.title : ""}
        reload={sellerReload}
        onClose={() => setPicking(null)}
        onPick={(seller) => {
          if (!picking) return;
          setBuying({ pkg: picking, seller });
          setPicking(null);
        }}
      />

      <PurchaseDialog
        sellerUserId={buying?.seller.userId ?? ""}
        sellerName={buying?.seller.name ?? ""}
        service={buying ? asMarketService(buying.pkg, tierTitle(buying.pkg)) : null}
        pkg={buying ? { id: buying.pkg.id, purchaseUrl: buying.seller.packagePurchaseUrl, duration: buying.pkg.duration } : undefined}
        returnPath={RETURN_PATH}
        onBack={() => {
          if (!buying) return;
          setPicking(buying.pkg);
          setBuying(null);
        }}
        onClose={() => setBuying(null)}
        onStale={() => setSellerReload((n) => n + 1)}
      />
    </div>
  );
}
