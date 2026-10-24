"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getAllServices, getPackageEligibleSellers, getServicePackages, type BackendPackage, type PackageSeller, type PackageSellers } from "@/lib/services/backend";
import type { MarketService } from "@/lib/services/marketplace";
import { isAborted } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { useMarketError } from "@/components/marketplace/useMarketError";
import { IconAlert, IconArrowRight, IconBriefcase, IconCheck, IconClock, IconClose, IconGem, IconPackage, IconRefresh, IconShieldCheck, IconStar } from "@/components/icons";
import { App, Avatar, Banner, Btn, Dialog, Empty, Loading, Search, Select, Spinner, Tag, Toolbar } from "../../kit/kit";
import type { NativeProps } from "../../native";
import PurchaseSheet from "./Purchase";
import "./client.css";
import { categoryTitleName } from "@/lib/categoryNames";

// Service packages as a desktop program — like the App Store's in-app
// purchase tiers: each package a row of Basic, Standard and Premium cards
// with the price, what it saves against buying the services one by one,
// the term and what is (and is not) included. Ordering picks the advocate
// from those eligible for the tier, then the purchase sheet takes the
// order. The rules are the web page's.

const TIER_ICON = { BASIC: IconPackage, STANDARD: IconStar, PREMIUM: IconGem } as const;
const TIERS = ["BASIC", "STANDARD", "PREMIUM"] as const;
const isTest = (p: BackendPackage) => /test|t1b/i.test(p.code) || /test/i.test(p.title);
const asService = (p: BackendPackage, title: string): MarketService => ({ id: p.id, title, categoryId: "", categoryTitle: p.categoryTitle, basePrice: p.price, selectedPrice: p.price, price: p.price, currency: "UZS", deliveryMinutes: 0, experienceNote: "", advokatRequired: false, isSponsored: false });

export default function PackagesApp({ openLink }: NativeProps) {
  const t = useTranslations("portal.client.packages");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const [pkgs, setPkgs] = useState<BackendPackage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [need, setNeed] = useState<Map<string, PackageSellers>>(() => new Map());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<BackendPackage | null>(null);
  const [picking, setPicking] = useState<BackendPackage | null>(null);
  const [buying, setBuying] = useState<{ pkg: BackendPackage; seller: PackageSeller } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    getServicePackages()
      .then((l) => alive && (setPkgs(l), setFailed(false)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [tick]);
  useEffect(() => {
    let alive = true;
    getAllServices(undefined, locale)
      .then((l) => alive && setPrices(new Map(l.map((s) => [s.id, s.price ?? 0]))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [locale]);
  // Which services each package stands for, to say what it saves; four at
  // a time, one package of each group.
  useEffect(() => {
    const firsts = [...new Map((pkgs ?? []).filter((p) => !isTest(p)).map((p) => [p.groupCode, p])).values()];
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
  }, [pkgs]);

  const separately = (p: BackendPackage) => {
    const r = need.get(p.groupCode);
    if (!r || r.unresolvedServiceCodes.length) return 0;
    const ps = r.requiredServiceIds.map((id) => prices.get(id) ?? 0);
    return ps.length && ps.every((x) => x > 0) ? ps.reduce((a, b) => a + b, 0) : 0;
  };
  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (pkgs ?? []).filter((p) => !isTest(p) && p.active && (!needle || `${p.title} ${p.categoryTitle} ${p.code}`.toLowerCase().includes(needle)));
  }, [pkgs, q]);
  const cats = useMemo(() => [...new Set((pkgs ?? []).filter((p) => !isTest(p)).map((p) => p.categoryTitle).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [pkgs]);
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
  const tierName = (x: string) => (t.has(`tiers.${x}`) ? t(`tiers.${x}`) : x);
  const tierTitle = (p: BackendPackage) => `${p.groupTitle || p.title} · ${tierName(p.tariff)}`;
  const order = (p: BackendPackage) => (setOpen(null), setBuying(null), setPicking(p));

  return (
    <App name="cpackages">
      <Toolbar title={t("title")} subtitle={pkgs ? t("count", { n: groups.length }) : undefined} end={<Search value={q} onChange={setQ} placeholder={t("searchPh")} />}>
        {cats.length > 1 ? <Select value={cat} onChange={setCat} ariaLabel={t("category")} options={[{ value: "", label: t("allCategories") }, ...cats.map((c) => ({ value: c, label: categoryTitleName(c, locale) }))]} /> : null}
      </Toolbar>
      <div className="dxck dx-scroll">
        <p className="dxcs-lead">{t("lead")}</p>
        {failed ? (
          <Empty icon={<IconAlert />} title={t("empty")} action={<Btn icon={<IconRefresh />} onClick={() => (setFailed(false), setTick((n) => n + 1))}>{d("refresh")}</Btn>} />
        ) : !pkgs ? (
          <Loading label={t("title")} />
        ) : !groups.length ? (
          <Empty icon={<IconBriefcase />} title={t("empty")} text={t("emptyText")} />
        ) : (
          groups.map(([code, items]) => (
            <section key={code} className="dxck-group">
              <header>
                <span className="dxck-group__ic" aria-hidden>
                  <IconPackage />
                </span>
                <span>
                  <h2>{items[0].groupTitle || items[0].title}</h2>
                  <small>{[categoryTitleName(items[0].categoryTitle, locale), code].filter(Boolean).join(" · ")}</small>
                </span>
              </header>
              <div className="dxck-tiers">
                {items.map((p, i) => {
                  const sep = separately(p);
                  const saves = sep > p.price ? sep - p.price : 0;
                  const Icon = TIER_ICON[p.tariff as keyof typeof TIER_ICON] ?? IconPackage;
                  const best = items.length > 1 && i === Math.min(1, items.length - 1);
                  return (
                    <article key={p.id} className={`dxck-tier is-${p.tariff.toLowerCase()}${best ? " is-best" : ""}`}>
                      <span className="dxck-tier__h">
                        <span className="dxck-tier__ic" aria-hidden>
                          <Icon />
                        </span>
                        <b>{tierName(p.tariff)}</b>
                        {best ? <Tag tone="accent">{t("bestValue")}</Tag> : null}
                      </span>
                      <span className="dxck-tier__price">
                        {fmtUzs(p.price)} <small>{t("som")}</small>
                      </span>
                      {saves ? <span className="dxck-tier__save">{t("saves", { n: fmtUzs(saves) })}</span> : null}
                      {sep ? <small className="dxcs-lead">{t("compare", { sep: fmtUzs(sep), pkg: fmtUzs(p.price) })}</small> : null}
                      {p.duration ? (
                        <span className="dxcp-eta">
                          <IconClock aria-hidden /> {p.duration}
                        </span>
                      ) : null}
                      {p.tariff === "PREMIUM" ? (
                        <span className="dxcp-eta">
                          <IconShieldCheck aria-hidden /> {t("premiumReq")}
                        </span>
                      ) : null}
                      <ul className="dxck-inc">
                        {p.included.slice(0, 3).map((x, k) => (
                          <li key={k}>
                            <IconCheck aria-hidden /> {x}
                          </li>
                        ))}
                        {p.excluded.slice(0, 2).map((x, k) => (
                          <li key={`x${k}`} className="is-no">
                            <IconClose aria-hidden /> {x}
                          </li>
                        ))}
                      </ul>
                      <span className="dxck-tier__acts">
                        <Btn small onClick={() => setOpen(p)}>
                          {t("details")}
                        </Btn>
                        <Btn small kind="primary" icon={<IconArrowRight />} onClick={() => order(p)}>
                          {t("order")}
                        </Btn>
                      </span>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {open ? (
        <Dialog
          open
          title={tierTitle(open)}
          width={520}
          onClose={() => setOpen(null)}
          actions={
            <>
              <Btn onClick={() => setOpen(null)}>{d("close")}</Btn>
              <Btn kind="primary" icon={<IconArrowRight />} onClick={() => order(open)}>
                {t("order")}
              </Btn>
            </>
          }
        >
          <dl className="dxcp-bill">
            <div>
              <dt>{t("price")}</dt>
              <dd>{`${fmtUzs(open.price)} ${t("som")}`}</dd>
            </div>
            <div>
              <dt>{t("duration")}</dt>
              <dd>{open.duration || "—"}</dd>
            </div>
            <div>
              <dt>{t("category")}</dt>
              <dd>{categoryTitleName(open.categoryTitle, locale) || "—"}</dd>
            </div>
            <div>
              <dt>{t("services")}</dt>
              <dd>{need.get(open.groupCode)?.requiredServiceCodes.join(", ") || open.relatedServiceCodes || "—"}</dd>
            </div>
          </dl>
          {open.result ? (
            <Banner tone="info" title={t("result")}>
              {open.result}
            </Banner>
          ) : null}
          <b>{t("included")}</b>
          <ul className="dxck-inc">
            {open.included.map((x, i) => (
              <li key={i}>
                <IconCheck aria-hidden /> {x}
              </li>
            ))}
          </ul>
          {open.excluded.length ? (
            <>
              <b>{t("excluded")}</b>
              <ul className="dxck-inc">
                {open.excluded.map((x, i) => (
                  <li key={i} className="is-no">
                    <IconClose aria-hidden /> {x}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Dialog>
      ) : null}
      {picking ? <Sellers key={`${picking.id}:${reload}`} pkg={picking} title={picking.groupTitle || picking.title} onClose={() => setPicking(null)} onPick={(seller) => (setBuying({ pkg: picking, seller }), setPicking(null))} /> : null}
      {buying ? (
        <PurchaseSheet
          sellerUserId={buying.seller.userId}
          sellerName={buying.seller.name}
          service={asService(buying.pkg, tierTitle(buying.pkg))}
          pkg={{ id: buying.pkg.id, purchaseUrl: buying.seller.packagePurchaseUrl, duration: buying.pkg.duration }}
          openLink={openLink}
          onBack={() => (setPicking(buying.pkg), setBuying(null))}
          onClose={() => setBuying(null)}
          onStale={() => setReload((n) => n + 1)}
        />
      ) : null}
    </App>
  );
}

// The advocates eligible for a package's tier, page by page.
function Sellers({ pkg, title, onClose, onPick }: { pkg: BackendPackage; title: string; onClose: () => void; onPick: (s: PackageSeller) => void }) {
  const t = useTranslations("marketplace.packageSellers");
  const tp = useTranslations("portal.client.packages");
  const tr = useTranslations("portal.client.services.packageErrors");
  const d = useTranslations("portal.desk.client");
  const marketErr = useMarketError();
  const [items, setItems] = useState<PackageSeller[] | null>(null);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [err, setErr] = useState<unknown>(null);
  const [offset, setOffset] = useState(0);
  const [paging, setPaging] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    getPackageEligibleSellers(pkg.id, { limit: 30, offset })
      .then((r) => {
        if (c.signal.aborted) return;
        setItems((cur) => {
          const prev = offset > 0 ? (cur ?? []) : [];
          const seen = new Set(prev.map((s) => s.userId));
          return [...prev, ...r.items.filter((s) => !seen.has(s.userId))];
        });
        setTotal(r.total);
        setMore(r.hasMore);
        setUnresolved(r.unresolvedServiceCodes);
        setErr(null);
      })
      .catch((e: unknown) => !isAborted(e) && !c.signal.aborted && setErr(e))
      .finally(() => !c.signal.aborted && setPaging(false));
    return () => c.abort();
  }, [pkg.id, offset, retry]);
  const tier = tp.has(`tiers.${pkg.tariff}`) ? tp(`tiers.${pkg.tariff}`) : pkg.tariff;
  const premium = pkg.tariff === "PREMIUM";
  const Icon = TIER_ICON[pkg.tariff as keyof typeof TIER_ICON] ?? IconPackage;
  return (
    <Dialog open title={t("title")} width={620} onClose={onClose} actions={<Btn onClick={onClose}>{d("close")}</Btn>}>
      <div className="dxcp-ticket">
        <span>
          <small>{tier}</small>
          <b>{title}</b>
          {pkg.duration ? (
            <span className="dxcp-eta">
              <Icon aria-hidden /> {pkg.duration}
            </span>
          ) : null}
        </span>
        <span className="dxcp-sum">
          <b>{fmtUzs(pkg.price)}</b>
          <em>{tp("som")}</em>
        </span>
      </div>
      <ol className="dxco-steps dxcp-steps" aria-label={t("stepsLabel")}>
        <li className="is-done">
          <i>
            <IconCheck />
          </i>
          <span>{t("stepTier")}</span>
        </li>
        <li className="is-now">
          <i>2</i>
          <span>{t("stepSeller")}</span>
        </li>
        <li>
          <i>3</i>
          <span>{t("stepOptions")}</span>
        </li>
      </ol>
      <Banner tone={premium ? "warn" : "info"}>{t(`policy.${premium ? "PREMIUM" : pkg.tariff === "STANDARD" ? "STANDARD" : "BASIC"}`, { tier })}</Banner>
      {items === null && !err ? (
        <Spinner />
      ) : err && !items?.length ? (
        <Banner tone="err" title={t("errorTitle")} action={<Btn small icon={<IconRefresh />} onClick={() => (setErr(null), setRetry((n) => n + 1))}>{t("retry")}</Btn>}>
          {marketErr(err, t("errorText"))}
        </Banner>
      ) : unresolved.length ? (
        <Banner tone="err">{tp("misconfigured", { codes: unresolved.join(", ") })}</Banner>
      ) : !items?.length ? (
        <Banner tone="neutral" title={t("emptyTitle")}>
          {premium ? t("emptyPremium", { tier, alt: tp.has("tiers.STANDARD") ? tp("tiers.STANDARD") : "STANDARD" }) : t("emptyText")}
        </Banner>
      ) : (
        <>
          <p className="dx-dlg__text">
            {t("count", { n: total || items.length })} · {t("orderNote")}
          </p>
          <ul className="dxco-pick">
            {items.map((s) => {
              const blocked = !s.packagePurchaseUrl || !s.eligibility.eligible;
              return (
                <li key={s.userId}>
                  <button type="button" disabled={blocked} onClick={() => onPick(s)}>
                    <Avatar name={s.name || "•"} size={36} />
                    <span className="dxco-pick__m">
                      <b>
                        {s.name || t("noName")}
                        {s.verified ? <IconShieldCheck className="dxcl-ok" aria-label={t("verified")} /> : null}
                      </b>
                      <small>{[s.rated ? t("rating", { r: s.ratingLabel || s.rating.toFixed(1), n: s.reviews }) : t("newSeller"), s.completedOrders ? t("completed", { n: s.completedOrders }) : "", s.experienceYears ? t("experience", { n: s.experienceYears }) : "", [s.district, s.region].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</small>
                      <span className="dxcw-tags">
                        {s.eligibility.extendedVerified ? <Tag tone="accent">{t("extended")}</Tag> : null}
                        {s.sellerType ? <Tag>{t.has(`types.${s.sellerType}`) ? t(`types.${s.sellerType}`) : s.sellerType}</Tag> : null}
                        {s.onlineNow ? <Tag tone="ok">{t("online")}</Tag> : null}
                      </span>
                      {blocked && s.eligibility.reasons.length ? <small className="dx-field__e">{s.eligibility.reasons.map((r) => (tr.has(r) ? tr(r) : r.replace(/_/g, " "))).join(" · ")}</small> : null}
                    </span>
                    <span className="dxco-pick__p">
                      {t("pick")} <IconArrowRight aria-hidden />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {more ? (
            <Btn busy={paging} onClick={() => (setPaging(true), setOffset(items.length))}>
              {t("more")}
            </Btn>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
