"use client";

import "@/components/marketplace/profile1920.css";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getServicePackages, getAllServices, getPackageEligibleSellers, type BackendPackage, type PackageSeller, type PackageSellers } from "@/lib/services/backend";
import type { MarketService } from "@/lib/services/marketplace";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import FilterBar from "@/components/filters/FilterBar";
import { IconCheck, IconClose, IconClock, IconLayers, IconArrowRight, IconShieldCheck } from "@/components/icons";
import PackageSellersDialog from "@/components/marketplace/PackageSellersDialog";
import PurchaseDialog from "@/components/marketplace/PurchaseDialog";
import { categoryTitleName } from "@/lib/categoryNames";

// A package group's picture: its category's drawing from the dashboard's
// set (image-catalog.md, family D, on a light plate), the package picture
// when the category has none. Matched on the Latin name and on the
// backend's own (Cyrillic) title.
const PLATES: [RegExp, string][] = [
  [/mehnat|меҳнат|труд/, "category/Mehnat_huquqi"],
  [/oila|оила|семь/, "category/Oila_huquqi"],
  [/ko.?chmas|uy-joy|кўчмас|уй-жой|недвиж|жиль/, "category/Kochmas_mulk"],
  [/avto|yth|avariya|дтп|авари/, "category/Avtoavariya_YTH"],
  [/meros|мерос|наслед/, "category/Meros"],
  [/jinoy|jinoiy|жиноят|уголов/, "category/Jinoyat_ishlari"],
  [/iste.?mol|zarar|истеъмол|потреб|ущерб/, "category/Istemolchi_huquqlari"],
  [/biznes|tadbirkor|iqtisod|soliq|бизнес|тадбиркор|солиқ|налог/, "category/Biznes_va_soliq"],
  [/shartnoma|шартнома|договор/, "doc-catalog/Shartnomalar"],
  [/qarz|undirish|қарз|долг|взыск/, "doc-catalog/Qarzdorlik"],
  [/davlat|давлат|госорган/, "doc-catalog/Davlat_organlari"],
  [/ma.?muriy|маъмурий|администр/, "doc-catalog/Mamuriy"],
  [/\bsud\b|суд/, "doc-catalog/Sud_arizalari"],
  [/brend|intellektual|бренд|интеллект/, "doc-catalog/Investitsiya_IP"],
  [/xorij|viza|migrats|хориж|виза|мигра/, "doc-catalog/Xorijiy_huquq"],
  [/fuqarolik|фуқаролик|граждан/, "doc-catalog/Fuqarolik"],
  [/hujjat|ariza|ҳужжат|документ/, "doc-catalog/Boshqa_hujjatlar"],
];
const plateOf = (title: string) => {
  const hay = `${title} ${categoryTitleName(title, "uz")}`.toLowerCase();
  const hit = PLATES.find(([re]) => re.test(hay));
  return { "--img": `url(/img/${hit ? hit[1] : "doc-catalog/Paketlar"}.webp)` } as CSSProperties;
};

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
  const tx = useTranslations("lxProf");
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
    ...cats.map((c) => ({ value: c, label: `${categoryTitleName(c, locale)} (${codeCount(found.filter((p) => p.categoryTitle === c))})` })),
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
    <div className="ppanel lxp-pk">
      <div className="ppanel__h lxp-pk__h">
        <h2 className="cx-h3">
          {tx("packagesTitle")}
          {pk.status === "ready" ? (
            <span className="cx-count" aria-label={t("count", { n: groups.length })}>
              {groups.length}
            </span>
          ) : null}
        </h2>
      </div>
      <p className="ppanel__note lx-sub lxp-pk__lead">{t("lead")}</p>
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
        <div className="cx-empty lxp-state lxp-pk__empty">
          <span className="lxp-plate" style={{ "--img": "url(/img/doc-catalog/Paketlar-sq.webp)" } as CSSProperties} aria-hidden />
          <b>{t("empty")}</b>
          <p>{t("emptyText")}</p>
          {q || cat ? (
            <button
              type="button"
              className="btn btn--line btn--sm"
              onClick={() => {
                setQ("");
                setCat("");
              }}
            >
              {tx("clearSearch")}
            </button>
          ) : null}
        </div>
      ) : (
        groups.map(([code, items], gi) => (
          <div className="pkg" key={code}>
            <div className="pkg__h">
              <span className="pkg__hi lxp-plate lxp-plate--wide" style={plateOf(items[0].categoryTitle || "")} aria-hidden />
              <span className="lxp-pk__gt">
                <b>{items[0].groupTitle || items[0].title}</b>
                {items[0].categoryTitle ? <span className="advmuted">{categoryTitleName(items[0].categoryTitle, locale)}</span> : null}
              </span>
            </div>
            <div className="pkg__tiers" data-ai-target={gi === 0 ? "packages:tiers" : undefined}>
              {items.map((p, i) => {
                const sep = separately(p);
                const saves = sep > p.price ? sep - p.price : 0;
                // The middle of three, or the top of two — the tier most
                // people take, marked so the row has a default answer.
                const best = items.length > 1 && i === Math.min(1, items.length - 1);
                return (
                  <div className={`pkg__tier pkg__tier--${p.tariff.toLowerCase()}${best ? " pkg__tier--best" : ""}`} key={p.id}>
                    {best ? <span className="pkg__best">{t("bestValue")}</span> : null}
                    <span className={`pkg__tariff lxp-tier lxp-tier--${p.tariff.toLowerCase()}`}>{t.has(`tiers.${p.tariff}`) ? t(`tiers.${p.tariff}`) : p.tariff}</span>
                    <b className="pkg__price">{fmtUzs(p.price)} <small>{t("som")}</small></b>
                    {saves ? <span className="pkg__save cx-pill cx-pill--ok"><IconCheck />{t("saves", { n: fmtUzs(saves) })}</span> : null}
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

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? tierTitle(open) : ""}
        footer={
          open ? (
            <>
              <button type="button" className="btn btn--line" onClick={() => setOpen(null)}>
                {tx("close")}
              </button>
              <button type="button" className="btn btn--pri" onClick={() => order(open)}>
                {t("order")}
                <IconArrowRight />
              </button>
            </>
          ) : undefined
        }
      >
        {open ? (
          <div className="pkgd lxp-pkgd">
            <div className="pkv">
              <div className="pkv__i"><label>{t("price")}</label><b>{fmtUzs(open.price)} {t("som")}</b></div>
              <div className="pkv__i"><label>{t("duration")}</label><b>{open.duration || "—"}</b></div>
              <div className="pkv__i"><label>{t("category")}</label><b>{categoryTitleName(open.categoryTitle, locale) || "—"}</b></div>
              <div className="pkv__i"><label>{t("services")}</label><b>{need.get(open.groupCode)?.requiredServiceCodes.join(", ") || open.relatedServiceCodes || "—"}</b></div>
            </div>
            {open.result ? <p className="rf__benefit lxp-pkgd__res"><b>{t("result")}</b><br />{open.result}</p> : null}
            <b className="pkgd__h">{t("included")}</b>
            <ul className="pkg__inc">{open.included.map((x, i) => <li key={i}><IconCheck />{x}</li>)}</ul>
            {open.excluded.length ? (
              <>
                <b className="pkgd__h">{t("excluded")}</b>
                <ul className="pkg__inc">{open.excluded.map((x, i) => <li key={i} className="no"><IconClose />{x}</li>)}</ul>
              </>
            ) : null}
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
