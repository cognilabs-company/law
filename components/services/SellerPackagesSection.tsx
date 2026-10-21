"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { isAborted, isForbidden } from "@/lib/http";
import { toast } from "@/lib/toast";
import { fmtUzs } from "@/lib/money";
import { matchesSearch } from "@/lib/searchText";
import { PACKAGE_SELLER_ERRORS, marketErrorCode } from "@/lib/services/marketplace";
import { enableMyPackage, failedRules, listMyPackages, setMyPackageStatus, tierFailureOf, type SellerPackage, type TierFailure } from "@/lib/services/sellerPackages";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import { useMarketError } from "@/components/marketplace/useMarketError";
import TierRules from "./TierRules";
import {
  IconAlert,
  IconCheck,
  IconClipboardCheck,
  IconClock,
  IconGem,
  IconLock,
  IconPackage,
  IconPause,
  IconPlay,
  IconPower,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
  IconStar,
} from "@/components/icons";

const TIERS = ["BASIC", "STANDARD", "PREMIUM"];
const TIER_ICON = { BASIC: IconPackage, STANDARD: IconStar, PREMIUM: IconGem } as const;
const FILTERS = ["all", "active", "available", "blocked"] as const;
type Filter = (typeof FILTERS)[number];
type State = "active" | "paused" | "available" | "blocked";
type Load = { key: number; items: SellerPackage[] | null; error: unknown };

const stateOf = (p: SellerPackage): State => (p.enabled ? (p.status === "active" ? "active" : "paused") : p.eligibility.eligible ? "available" : "blocked");
const inFilter = (s: State, f: Filter) => f === "all" || (f === "active" ? s === "active" || s === "paused" : s === f);

export default function SellerPackagesSection() {
  const t = useTranslations("sellerPackages");
  const tp = useTranslations("portal.client.packages");
  const marketErr = useMarketError();
  const [tick, setTick] = useState(0);
  const [load, setLoad] = useState<Load>({ key: -1, items: null, error: null });
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [fails, setFails] = useState<Record<string, TierFailure>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const c = new AbortController();
    listMyPackages(c.signal)
      .then((items) => {
        if (!c.signal.aborted) setLoad({ key: tick, items, error: null });
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setLoad((cur) => ({ key: tick, items: cur.items, error: e }));
      });
    return () => c.abort();
  }, [tick]);

  const items = useMemo(() => load.items ?? [], [load.items]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, active: 0, available: 0, blocked: 0 };
    for (const p of items) {
      const s = stateOf(p);
      if (s === "active" || s === "paused") c.active++;
      else c[s]++;
    }
    return c;
  }, [items]);
  const groups = useMemo(() => {
    const m = new Map<string, SellerPackage[]>();
    for (const p of items) {
      if (!inFilter(stateOf(p), filter)) continue;
      if (!matchesSearch(`${p.pkg.title} ${p.pkg.categoryTitle} ${p.pkg.code}`, query)) continue;
      const k = p.pkg.groupCode || p.pkg.code || p.id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    for (const v of m.values()) v.sort((a, b) => TIERS.indexOf(a.pkg.tariff) - TIERS.indexOf(b.pkg.tariff));
    return [...m.entries()];
  }, [items, filter, query]);

  const reload = () => setTick((n) => n + 1);
  const reasonText = (r: string) => (t.has(`reasons.${r}`) ? t(`reasons.${r}`) : r.replace(/_/g, " "));
  const dropFail = (id: string) => setFails((f) => (f[id] ? Object.fromEntries(Object.entries(f).filter(([k]) => k !== id)) : f));
  const tierLabel = (tariff: string) => (tp.has(`tiers.${tariff}`) ? tp(`tiers.${tariff}`) : tariff);

  async function act(p: SellerPackage, next: "enable" | "active" | "disabled") {
    if (busy[p.id]) return;
    setBusy((b) => ({ ...b, [p.id]: true }));
    try {
      const saved = next === "enable" ? await enableMyPackage(p.id) : await setMyPackageStatus(p.id, next);
      const merged: SellerPackage = saved ?? { ...p, enabled: true, status: next === "disabled" ? "disabled" : "active" };
      setLoad((cur) => (cur.items ? { ...cur, items: cur.items.map((x) => (x.id === p.id ? { ...merged, pkg: saved?.pkg.title ? saved.pkg : p.pkg } : x)) } : cur));
      dropFail(p.id);
      toast(t(`toast.${next}`), { tone: "ok" });
      reload();
    } catch (e) {
      const tier = tierFailureOf(e);
      if (tier) {
        setFails((f) => ({ ...f, [p.id]: tier }));
        toast(t("tier.toast"), { tone: "err" });
        reload();
      } else {
        toast(marketErr(e, t("actionFailed")), { tone: "err" });
        if (PACKAGE_SELLER_ERRORS.includes(marketErrorCode(e))) reload();
      }
    } finally {
      setBusy((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== p.id)));
    }
  }

  if (!load.items) {
    if (load.key !== tick || !load.error) {
      return (
        <div className="spk" aria-busy="true">
          <div className="spk__head is-skel" />
          <div className="spk__sk">
            <span />
            <span />
            <span />
          </div>
        </div>
      );
    }
    const locked = isForbidden(load.error);
    return (
      <div className="spk">
        <div className="svm__blocked is-lock" role="alert">
          <span className="svm__bic" aria-hidden="true">
            {locked ? <IconLock /> : <IconAlert />}
          </span>
          <b>{locked ? t("lockedTitle") : t("errorTitle")}</b>
          <p>{locked ? t("lockedText") : marketErr(load.error, t("errorText"))}</p>
          {locked ? null : (
            <button type="button" className="btn btn--line btn--sm" onClick={reload}>
              <IconRefresh aria-hidden="true" />
              {t("retry")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const fields: FilterField[] = [
    {
      key: "state",
      label: t("filters.label"),
      icon: IconClipboardCheck,
      value: filter,
      empty: "all",
      onChange: (v) => {
        const f = FILTERS.find((x) => x === v);
        if (f) setFilter(f);
      },
      options: FILTERS.map((f) => ({ value: f, label: `${t(`filters.${f}`)} (${counts[f]})` })),
      aiId: "seller.packages.filters.state",
      aiLabel: t("filters.label"),
    },
  ];
  const stats = [
    { k: "active", Icon: IconPlay, v: counts.active },
    { k: "available", Icon: IconCheck, v: counts.available },
    { k: "blocked", Icon: IconLock, v: counts.blocked },
  ] as const;

  return (
    <div className="spk" data-ai-id="seller.packages" data-ai-type="section" data-ai-label={t("title")}>
      <section className="spk__head">
        <span className="spk__hic" aria-hidden="true">
          <IconPackage />
        </span>
        <div className="spk__ht">
          <h2>{t("title")}</h2>
          <p>{t("lead")}</p>
        </div>
        <ul className="spk__stats">
          {stats.map(({ k, Icon, v }) => (
            <li key={k} className={`spk__stat is-${k}`}>
              <Icon aria-hidden="true" />
              <b>{v}</b>
              <span>{t(`stats.${k}`)}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="spk__rule">
        <IconLock aria-hidden="true" />
        <span>{t("priceRule")}</span>
      </p>

      {items.length ? (
        <FilterBar
          className="svm__filters"
          fields={fields}
          search={{ value: query, onChange: setQuery, placeholder: t("search"), maxLength: 120, aiId: "seller.packages.search" }}
          count={groups.reduce((n, [, v]) => n + v.length, 0)}
          onReset={() => {
            setFilter("all");
            setQuery("");
          }}
          aiId="seller.packages.filters"
          aiLabel={t("filters.label")}
          extra={
            <button type="button" className={`svm__refresh${load.key !== tick ? " is-spin" : ""}`} onClick={reload} aria-label={t("refresh")} title={t("refresh")}>
              <IconRefresh aria-hidden="true" />
            </button>
          }
        />
      ) : null}

      {!items.length ? (
        <div className="svm__empty">
          <span className="svm__eic" aria-hidden="true">
            <IconPackage />
          </span>
          <b>{t("empty")}</b>
          <p>{t("emptyText")}</p>
        </div>
      ) : !groups.length ? (
        <div className="svm__none">
          <IconSearch aria-hidden="true" />
          <b>{t("noMatch")}</b>
        </div>
      ) : (
        groups.map(([code, list]) => (
          <div className="pkg spk__group" key={code}>
            <div className="pkg__h">
              <span className="pkg__hi" aria-hidden>
                <IconPackage />
              </span>
              <b>{list[0].pkg.groupTitle || list[0].pkg.title}</b>
              <span className="advmuted">{[list[0].pkg.categoryTitle, code].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="pkg__tiers">
              {list.map((p) => {
                const s = stateOf(p);
                const tariff = p.pkg.tariff;
                const TierIcon = TIER_ICON[tariff as keyof typeof TIER_ICON] ?? IconPackage;
                const working = Boolean(busy[p.id]);
                const fail = fails[p.id] ?? null;
                const listRules = p.eligibility.eligible ? [] : failedRules(p.eligibility.ruleResults ?? []);
                return (
                  <div key={p.id} className={`pkg__tier pkg__tier--${tariff.toLowerCase()} spk__tier is-${s}`} data-ai-id={`seller.packages.${p.id}`} data-ai-label={`${list[0].pkg.groupTitle} · ${tierLabel(tariff)}`}>
                    <div className="spk__top">
                      <span className={`pkg__ti pkg__ti--${tariff.toLowerCase()}`} aria-hidden>
                        <TierIcon />
                      </span>
                      <span className="pkg__tariff">{tierLabel(tariff)}</span>
                      <em className={`spk__st is-${s}`}>
                        <i aria-hidden="true" />
                        {t(`state.${s}`)}
                      </em>
                    </div>
                    <b className="pkg__price">
                      {fmtUzs(p.pkg.price)} <small>{tp("som")}</small>
                    </b>
                    <span className="spk__lock">
                      <IconLock aria-hidden="true" />
                      {t("fixedPrice")}
                    </span>
                    {p.pkg.duration ? (
                      <span className="pkg__dur">
                        <IconClock />
                        {p.pkg.duration}
                      </span>
                    ) : null}
                    {p.pkg.included.length ? (
                      <ul className="pkg__inc">
                        {p.pkg.included.slice(0, 3).map((x, k) => (
                          <li key={k}>
                            <IconCheck />
                            {x}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {tariff === "PREMIUM" ? (
                      <span className={`spk__ext${p.eligibility.extendedVerified ? " is-ok" : ""}`}>
                        <IconShieldCheck aria-hidden="true" />
                        {p.eligibility.extendedVerified ? t("extendedOk") : t("extendedNeeded")}
                      </span>
                    ) : null}
                    {p.eligibility.eligible || listRules.length ? null : (
                      <div className="spk__why" role="note">
                        <b>
                          <IconAlert aria-hidden="true" />
                          {t("notEligible")}
                        </b>
                        {p.eligibility.reasons.length ? (
                          <ul>
                            {p.eligibility.reasons.map((r) => (
                              <li key={r}>{reasonText(r)}</li>
                            ))}
                          </ul>
                        ) : null}
                        {p.eligibility.missingServiceIds.length ? <small>{t("missingServices", { n: p.eligibility.missingServiceIds.length })}</small> : null}
                      </div>
                    )}
                    {fail ? (
                      <TierRules rules={failedRules(fail.rules)} reasons={fail.reasons} message={fail.message} live onClose={() => dropFail(p.id)} aiId={`seller.packages.${p.id}.tier`} />
                    ) : listRules.length ? (
                      <TierRules
                        rules={listRules}
                        reasons={p.eligibility.reasons.map(reasonText)}
                        message=""
                        live={false}
                        note={p.eligibility.missingServiceIds.length ? t("missingServices", { n: p.eligibility.missingServiceIds.length }) : ""}
                      />
                    ) : null}
                    <div className="pkg__acts spk__acts">
                      {s === "active" ? (
                        <button type="button" className="btn btn--line btn--sm" disabled={working} onClick={() => void act(p, "disabled")} data-ai-id={`seller.packages.${p.id}.disable`}>
                          <IconPause aria-hidden="true" />
                          {working ? t("saving") : t("disable")}
                        </button>
                      ) : s === "paused" ? (
                        <button type="button" className="btn btn--pri btn--sm" disabled={working || !p.eligibility.eligible} onClick={() => void act(p, "active")} data-ai-id={`seller.packages.${p.id}.activate`}>
                          <IconPower aria-hidden="true" />
                          {working ? t("saving") : t("activate")}
                        </button>
                      ) : (
                        <button type="button" className="btn btn--grad btn--sm" disabled={working || s === "blocked"} onClick={() => void act(p, "enable")} data-ai-id={`seller.packages.${p.id}.enable`}>
                          <IconPlay aria-hidden="true" />
                          {working ? t("saving") : t("enable")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
