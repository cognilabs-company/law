"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { getServicePackages, getAllServices, type BackendPackage } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import { IconBriefcase, IconCheck, IconClose, IconClock, IconSearch, IconPackage, IconStar, IconGem, IconArrowRight } from "@/components/icons";

// One mark per tariff, so the three boxes are told apart before they are read.
const TIER_ICON = { BASIC: IconPackage, STANDARD: IconStar, PREMIUM: IconGem } as const;

const TIERS = ["BASIC", "STANDARD", "PREMIUM"] as const;
// Seed/test packages the backend team left in the catalogue (reported).
const isTest = (p: BackendPackage) => /test|t1b/i.test(p.code) || /test/i.test(p.title);

// T1B-01: packages = services + one price + what's included. Grouped by
// package code, one card per tariff; "Alohida: X · Paketda: Y · Tejaysiz: Z"
// is shown when the catalogue services in the package have their own prices.
export default function ClientPackages() {
  const t = useTranslations("portal.client.packages");
  const locale = useLocale();
  const router = useRouter();
  const pk = useResource(() => getServicePackages(), []);
  // getAllServices, not getServices: /services is paged now (LEXGO_SERVICES_
  // CATALOG_OPTIMIZATION_FRONTEND.md) — the catalogCode lookup below needs
  // every service, not just the first page, or a package referencing a
  // service outside it would silently show no "separately" price.
  const services = useResource(() => getAllServices(undefined, locale), [locale]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<BackendPackage | null>(null);

  // Catalogue code → service (for the "separately" price and the order deep link).
  const byCode = useMemo(() => {
    const m = new Map<string, { id: string; price: number }>();
    for (const s of services.data) if (s.catalogCode) m.set(s.catalogCode.toUpperCase(), { id: s.id, price: s.price ?? 0 });
    return m;
  }, [services.data]);
  // "G01-G03" → ["G01","G02","G03"]; "G01, G04" → both.
  const codesOf = (p: BackendPackage): string[] => {
    const out: string[] = [];
    for (const part of (p.relatedServiceCodes || "").split(/[,;]/)) {
      const m = /^\s*([A-Z]+)(\d+)\s*-\s*(?:[A-Z]+)?(\d+)\s*$/i.exec(part);
      if (m) { for (let i = Number(m[2]); i <= Number(m[3]); i++) out.push(`${m[1].toUpperCase()}${String(i).padStart(m[2].length, "0")}`); }
      else if (part.trim()) out.push(part.trim().toUpperCase());
    }
    return out;
  };
  const separately = (p: BackendPackage) => {
    const prices = codesOf(p).map((c) => byCode.get(c)?.price ?? 0);
    return prices.length && prices.every((x) => x > 0) ? prices.reduce((a, b) => a + b, 0) : 0;
  };
  const groups = useMemo(() => {
    const m = new Map<string, BackendPackage[]>();
    const needle = q.trim().toLowerCase();
    for (const p of pk.data) {
      if (isTest(p)) continue;
      if (needle && !`${p.title} ${p.categoryTitle} ${p.code}`.toLowerCase().includes(needle)) continue;
      if (!m.has(p.code)) m.set(p.code, []);
      m.get(p.code)!.push(p);
    }
    for (const v of m.values()) v.sort((a, b) => TIERS.indexOf(a.tariff as (typeof TIERS)[number]) - TIERS.indexOf(b.tariff as (typeof TIERS)[number]));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pk.data, q]);

  function order(p: BackendPackage) {
    const first = codesOf(p).map((c) => byCode.get(c)).find(Boolean);
    router.push(first ? `/portal/client/services?service=${encodeURIComponent(first.id)}&package=${encodeURIComponent(p.id)}` : `/portal/client/services?q=${encodeURIComponent(p.categoryTitle || p.title)}`);
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{pk.status === "ready" ? t("count", { n: groups.length }) : ""}</span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      <div className="lfilters" data-ai-target="packages:search" data-ai-label={t("searchPh")}>
        <div className="lsearch"><IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("searchPh")} /></div>
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
              <b>{items[0].title}</b>
              <span className="advmuted">{items[0].categoryTitle} · {code}</span>
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
                    <ul className="pkg__inc">
                      {p.included.slice(0, 3).map((x, k) => <li key={k}><IconCheck />{x}</li>)}
                      {p.excluded.slice(0, 2).map((x, k) => <li key={`x${k}`} className="no"><IconClose />{x}</li>)}
                    </ul>
                    <div className="pkg__acts">
                      <button type="button" className="btn btn--line btn--sm" onClick={() => setOpen(p)}>{t("details")}</button>
                      <button type="button" className={`btn btn--sm ${best ? "btn--grad" : "btn--pri"}`} onClick={() => order(p)}>{t("order")}<IconArrowRight /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.title} · ${open.tariff}` : ""}>
        {open ? (
          <div className="pkgd">
            <div className="pkv">
              <div className="pkv__i"><label>{t("price")}</label><b>{fmtUzs(open.price)} {t("som")}</b></div>
              <div className="pkv__i"><label>{t("duration")}</label><b>{open.duration || "—"}</b></div>
              <div className="pkv__i"><label>{t("category")}</label><b>{open.categoryTitle || "—"}</b></div>
              <div className="pkv__i"><label>{t("services")}</label><b>{open.relatedServiceCodes || "—"}</b></div>
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
    </div>
  );
}
