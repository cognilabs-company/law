"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getMarketplaceOverview,
  listAdminMarketplaceOrders,
  listAdminMarketplaceSellers,
  type MkmOrder,
  type MkmPerson,
  type MkmScope,
  type MkmSeller,
} from "@/lib/services/adminMarketplace";
import { isForbidden } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { dateOnly, timeOnly } from "@/lib/date";
import { useAiReveal } from "@/lib/guide/targets";
import { useAiSelection } from "@/lib/ai/registry";
import { EmptyState } from "@/components/portal/DataState";
import { IconLock, IconRefresh } from "@/components/icons";
import { useLive } from "./useLive";
import { useCount } from "./bits";
import MkmFilterBar, { EMPTY_FILTERS, filtersActive, presetRange, type MkmFilters, type MkmTab, type PartyPick } from "./MkmFilterBar";
import MkmOverview from "./MkmOverview";
import MkmOrders from "./MkmOrders";
import MkmSellers from "./MkmSellers";
import MkmOrderModal from "./MkmOrderModal";

const TABS: MkmTab[] = ["overview", "orders", "sellers"];
const REFRESH_MS = 60000;

const personPick = (p: MkmPerson): PartyPick => ({ id: p.id, label: p.name || p.phone || p.lexgoId || "—", sub: [p.lexgoId, p.phone].filter(Boolean).join(" · ") });
const sellerPick = (s: MkmSeller): PartyPick => ({ id: s.userId, label: s.name || s.phone || s.lexgoId || "—", sub: [s.lexgoId, s.phone].filter(Boolean).join(" · ") });

export default function MarketplaceMonitor() {
  const t = useTranslations("admin.marketplace");
  const te = useTranslations("enums");
  const locale = useLocale();
  const count = useCount();
  const [tab, setTab] = useState<MkmTab>("overview");
  const [f, setF] = useState<MkmFilters>(EMPTY_FILTERS);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [ordersAt, setOrdersAt] = useState(0);
  const [sellersAt, setSellersAt] = useState(0);
  const [open, setOpen] = useState<MkmOrder | null>(null);
  useAiReveal(/^marketplace:(kpis|status-chart|top-sellers|latest-orders|filters)$/, () => setTab("overview"));
  useAiReveal("marketplace:orders-list", () => setTab("orders"));
  useAiReveal(/^marketplace:(sellers-list|seller-search)$/, () => setTab("sellers"));
  useAiReveal(/^admin\.marketplace\.orders(\.|$)/, () => setTab("orders"));
  useAiReveal(/^admin\.marketplace\.sellers(\.|$)/, () => setTab("sellers"));
  useAiReveal(/^admin\.marketplace\.(kpis|top-sellers|latest-orders)(\.|$)/, () => setTab("overview"));
  useAiSelection("admin_marketplace_tab", tab);

  const scope: MkmScope = useMemo(
    () => ({ status: f.status, sellerUserId: f.seller?.id ?? "", clientUserId: f.client?.id ?? "", dateFrom: f.from, dateTo: f.to }),
    [f],
  );
  const scopeKey = JSON.stringify(scope);
  const rangeKey = `${f.from}|${f.to}`;

  const overview = useLive(() => getMarketplaceOverview(scope), scopeKey);
  const top = useLive(() => listAdminMarketplaceSellers({ q: "", dateFrom: f.from, dateTo: f.to, limit: 6 }), rangeKey);
  const latest = useLive(() => listAdminMarketplaceOrders(scope, 0, 6), scopeKey, tab === "overview");
  const orders = useLive(() => listAdminMarketplaceOrders(scope, ordersAt), `${scopeKey}|${ordersAt}`, tab === "orders");
  const sellers = useLive(() => listAdminMarketplaceSellers({ q, dateFrom: f.from, dateTo: f.to, offset: sellersAt }), `${q}|${rangeKey}|${sellersAt}`, tab === "sellers");

  useEffect(() => {
    const h = setTimeout(() => {
      setQ(qInput.trim());
      setSellersAt(0);
    }, 300);
    return () => clearTimeout(h);
  }, [qInput]);

  const reloadOverview = overview.reload;
  const reloadTop = top.reload;
  const reloadLatest = latest.reload;
  const reloadOrders = orders.reload;
  const reloadSellers = sellers.reload;
  const refresh = useCallback(() => {
    if (f.preset) {
      const range = presetRange(f.preset);
      if (range.from !== f.from || range.to !== f.to) {
        const stamp = f.preset;
        setF((cur) => (cur.preset === stamp ? { ...cur, ...range } : cur));
        setOrdersAt(0);
        setSellersAt(0);
        return;
      }
    }
    reloadOverview();
    reloadTop();
    if (tab === "overview") reloadLatest();
    if (tab === "orders") reloadOrders();
    if (tab === "sellers") reloadSellers();
  }, [f.preset, f.from, f.to, tab, reloadOverview, reloadTop, reloadLatest, reloadOrders, reloadSellers]);

  const forbidden = overview.failed && isForbidden(overview.error);
  useEffect(() => {
    if (forbidden) return;
    const h = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    return () => clearInterval(h);
  }, [refresh, forbidden]);

  const patch = (p: Partial<MkmFilters>) => {
    setF((cur) => ({ ...cur, ...p }));
    setOrdersAt(0);
    setSellersAt(0);
  };
  const resetAll = () => {
    setF(EMPTY_FILTERS);
    setQInput("");
    setQ("");
    setOrdersAt(0);
    setSellersAt(0);
  };
  const focusTab = useRef(false);
  const go = (next: MkmTab) => {
    if (next !== tab) focusTab.current = true;
    setTab(next);
  };
  useEffect(() => {
    if (!focusTab.current) return;
    focusTab.current = false;
    document.getElementById(`mkm-tab-${tab}`)?.focus();
  }, [tab]);
  const toOrders = (p: Partial<MkmFilters>) => {
    patch(p);
    go("orders");
  };

  const busy = overview.refreshing || top.refreshing || latest.refreshing || orders.refreshing || sellers.refreshing;
  const stats = overview.failed && overview.stale ? null : overview.data;
  const sellersTotal = top.failed && top.stale ? undefined : top.data?.total;
  const period = f.preset
    ? t(`filter.presets.${f.preset}`)
    : f.from || f.to
      ? `${f.from ? dateOnly(f.from, locale) : "…"} – ${f.to ? dateOnly(f.to, locale) : "…"}`
      : t("scopeAll");
  const scopeText = [period, f.status ? t(`filter.statusOpt.${f.status}`) : "", f.seller?.label ?? "", f.client?.label ?? ""].filter(Boolean).join(" · ");
  const badge = (k: MkmTab) => (k === "orders" ? stats?.ordersTotal : k === "sellers" ? sellersTotal : undefined);

  if (forbidden) {
    return (
      <div className="mkm">
        <section className="mkm-card">
          <EmptyState icon={<IconLock />} title={t("errors.forbidden")} text={t("errors.forbiddenText")} />
        </section>
      </div>
    );
  }

  return (
    <div className="mkm">
      <section className="mkm-hero">
        <div className="mkm-hero__glow" aria-hidden />
        <div className="mkm-hero__grid" aria-hidden />
        <div className="mkm-hero__top">
          <div className="mkm-hero__txt">
            <span className="mkm-hero__eyebrow">
              <i className={`mkm-live${overview.failed ? " is-off" : ""}`} aria-hidden />
              {t("eyebrow")}
              {overview.updatedAt ? <em>{t("updated", { time: timeOnly(new Date(overview.updatedAt).toISOString(), locale) })}</em> : null}
            </span>
            <h2 className="mkm-hero__t">{t("title")}</h2>
            <p className="mkm-hero__l">{t("lead")}</p>
          </div>
          <div className={`mkm-rev${overview.changing ? " is-busy" : ""}`} aria-live="polite" data-ai-target="marketplace:revenue">
            <span className="mkm-rev__l">{t("revenue")}</span>
            <b className="mkm-rev__v">
              {stats ? fmtUzs(stats.revenuePaid) : "—"}
              <small>{te("currency")}</small>
            </b>
            <span className="mkm-rev__s">{stats ? t("revenueSub", { n: stats.paidOrders }) : " "}</span>
            <span className="mkm-rev__scope" title={scopeText}>
              {scopeText}
            </span>
          </div>
        </div>
        <div className="mkm-hero__bar">
          <div className="mkm-tabs" role="tablist" aria-label={t("tabsAria")} data-ai-target="marketplace:tabs" data-ai-id="admin.marketplace.tabs">
            {TABS.map((k) => {
              const n = badge(k);
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  id={`mkm-tab-${k}`}
                  data-ai-id={`admin.marketplace.tab.${k}`}
                  aria-controls="mkm-panel"
                  aria-selected={tab === k}
                  tabIndex={tab === k ? 0 : -1}
                  className="mkm-tab"
                  onClick={() => setTab(k)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    e.preventDefault();
                    const next = TABS[(TABS.indexOf(k) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                    setTab(next);
                    document.getElementById(`mkm-tab-${next}`)?.focus();
                  }}
                >
                  {t(`tabs.${k}`)}
                  {typeof n === "number" ? <span>{count(n)}</span> : null}
                </button>
              );
            })}
          </div>
          <button type="button" className="mkm-refresh" onClick={refresh} aria-label={t("refresh")} title={t("refresh")} disabled={busy}>
            <IconRefresh className={busy ? "mkm-spin" : undefined} aria-hidden />
          </button>
        </div>
      </section>

      <MkmFilterBar tab={tab} value={f} onChange={patch} q={qInput} onQ={setQInput} onReset={resetAll} />

      <div role="tabpanel" id="mkm-panel" aria-labelledby={`mkm-tab-${tab}`} className="mkm-panel">
        {tab === "overview" ? (
          <MkmOverview
            overview={overview}
            top={top}
            latest={latest}
            scoped={!!(f.status || f.seller || f.client)}
            filtered={filtersActive(f)}
            onStatus={(status) => toOrders({ status })}
            onSeller={(s) => toOrders({ seller: sellerPick(s), client: null, status: "" })}
            onSellersTab={() => go("sellers")}
            onOrdersTab={() => go("orders")}
            onOpen={setOpen}
          />
        ) : tab === "orders" ? (
          <MkmOrders live={orders} offset={ordersAt} onOffset={setOrdersAt} onOpen={setOpen} filtered={filtersActive(f)} onReset={resetAll} />
        ) : (
          <MkmSellers live={sellers} offset={sellersAt} onOffset={setSellersAt} onOrders={(s) => toOrders({ seller: sellerPick(s), client: null, status: "" })} searching={!!q} />
        )}
      </div>

      <MkmOrderModal
        order={open}
        onClose={() => setOpen(null)}
        onSeller={(p) => {
          setOpen(null);
          toOrders({ ...EMPTY_FILTERS, seller: personPick(p) });
        }}
        onClient={(p) => {
          setOpen(null);
          toOrders({ ...EMPTY_FILTERS, client: personPick(p) });
        }}
      />
    </div>
  );
}
