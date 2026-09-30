"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { MkmOrder, MkmPage, MkmSeller, MkmStats } from "@/lib/services/adminMarketplace";
import { fmtRating } from "@/lib/date";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconBolt, IconCard, IconCheck, IconChevronRight, IconClock, IconClose, IconLayers, IconUser, IconUsers, IconChartBar, IconList } from "@/components/icons";
import type { Live } from "./useLive";
import { Avatar, LoadFailed, RefreshFailed, StatusBadge, ToneIcon, toneOf, useCount, useMoney, useStatusLabel, useTypeLabel, useWhen, type Tone } from "./bits";

const CHART_ORDER = ["completed", "paid", "pending_payment", "cancelled"];

function Kpi({ label, value, sub, tone, icon, onClick, openLabel }: { label: string; value: string; sub?: string; tone: Tone | "brand"; icon: ReactNode; onClick?: () => void; openLabel: string }) {
  const body = (
    <>
      <span className="mkm-kpi__h">
        <span className={`mkm-kpi__i mkm-kpi__i--${tone}`} aria-hidden>
          {icon}
        </span>
        <span className="mkm-kpi__l">{label}</span>
      </span>
      <b className="mkm-kpi__v">{value}</b>
      {sub ? <span className="mkm-kpi__s">{sub}</span> : null}
      {onClick ? <IconChevronRight className="mkm-kpi__go" aria-hidden /> : null}
    </>
  );
  if (!onClick) return <div className={`mkm-kpi mkm-kpi--${tone}`}>{body}</div>;
  return (
    <button type="button" className={`mkm-kpi mkm-kpi--${tone} mkm-kpi--btn`} onClick={onClick} aria-label={`${label}: ${value}. ${openLabel}`}>
      {body}
    </button>
  );
}

function StatusChart({ stats }: { stats: MkmStats }) {
  const t = useTranslations("admin.marketplace.chart");
  const locale = useLocale();
  const label = useStatusLabel();
  const count = useCount();
  const [hover, setHover] = useState("");
  const [table, setTable] = useState(false);
  const known = new Map(stats.byStatus.map((s) => [s.status, s.count]));
  const keys = [...CHART_ORDER, ...stats.byStatus.map((s) => s.status).filter((s) => !CHART_ORDER.includes(s))];
  const rows = keys.map((status) => ({ status, count: known.get(status) ?? 0 }));
  const total = rows.reduce((a, r) => a + r.count, 0);
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const pctText = (n: number) => {
    const p = Math.round(pct(n) * 10) / 10;
    return fmtRating(p, locale, Number.isInteger(p) ? 0 : 1);
  };
  const marks = rows
    .filter((r) => r.count > 0)
    .reduce<{ status: string; count: number; mid: number; end: number }[]>((acc, r) => {
      const start = acc.length ? acc[acc.length - 1].end : 0;
      const end = start + pct(r.count);
      return [...acc, { ...r, mid: (start + end) / 2, end }];
    }, []);
  const hovered = marks.find((m) => m.status === hover);
  const describe = (status: string, n: number) => `${label(status)}: ${t("share", { n: count(n), p: pctText(n) })}`;

  return (
    <div className="mkm-chart">
      <div className="mkm-card__h">
        <div>
          <b>{t("title")}</b>
          <small>{t("total", { n: stats.ordersTotal })}</small>
        </div>
        {total ? (
          <button type="button" className="mkm-toggle" aria-pressed={table} onClick={() => setTable((v) => !v)}>
            <IconList aria-hidden />
            {t("table")}
          </button>
        ) : null}
      </div>

      {!total ? (
        <EmptyState icon={<IconChartBar />} title={t("empty")} />
      ) : table ? (
        <table className="mkm-table mkm-table--mini">
          <thead>
            <tr>
              <th>{t("colStatus")}</th>
              <th className="num">{t("colCount")}</th>
              <th className="num">{t("colShare")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.status}>
                <td>
                  <span className={`mkm-legend__sw mkm-tone--${toneOf(r.status)}`} aria-hidden />
                  {label(r.status)}
                </td>
                <td className="num">{count(r.count)}</td>
                <td className="num">{pctText(r.count)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="mkm-sbar" role="group" aria-label={t("aria")}>
            {marks.map((m) => (
              <span
                key={m.status}
                className={`mkm-sbar__seg mkm-tone--${toneOf(m.status)}`}
                style={{ flexGrow: m.count }}
                tabIndex={0}
                role="img"
                aria-label={describe(m.status, m.count)}
                onMouseEnter={() => setHover(m.status)}
                onMouseLeave={() => setHover("")}
                onFocus={() => setHover(m.status)}
                onBlur={() => setHover("")}
              />
            ))}
            {hovered ? (
              <span className="mkm-tip" style={{ "--caret": `${Math.min(97, Math.max(3, hovered.mid))}%` } as CSSProperties} aria-hidden>
                <b>{label(hovered.status)}</b>
                {t("share", { n: count(hovered.count), p: pctText(hovered.count) })}
              </span>
            ) : null}
          </div>
          <ul className="mkm-legend">
            {rows.map((r) => (
              <li key={r.status} className={r.count ? undefined : "is-zero"}>
                <span className={`mkm-legend__sw mkm-tone--${toneOf(r.status)}`} aria-hidden />
                <ToneIcon tone={toneOf(r.status)} />
                <span>{label(r.status)}</span>
                <b>{count(r.count)}</b>
                <small>{pctText(r.count)}%</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TopSellers({ live, scoped, onSeller, onAll }: { live: Live<MkmPage<MkmSeller>>; scoped: boolean; onSeller: (s: MkmSeller) => void; onAll: () => void }) {
  const t = useTranslations("admin.marketplace.top");
  const typeLabel = useTypeLabel();
  const money = useMoney();
  const count = useCount();
  const rows = (live.data?.items ?? []).filter((s) => s.ordersTotal > 0 || s.activeOrders > 0).slice(0, 5);
  const max = Math.max(1, ...rows.map((s) => s.activeOrders));
  return (
    <section className={`mkm-card${live.changing ? " is-busy" : ""}`} aria-busy={live.changing || live.loading}>
      <div className="mkm-card__h">
        <div>
          <b>{t("title")}</b>
          <small>{t("lead")}</small>
        </div>
        <button type="button" className="mkm-link" onClick={onAll}>
          {t("all")}
          <IconChevronRight aria-hidden />
        </button>
      </div>
      {scoped ? <p className="mkm-cardnote">{t("scopeNote")}</p> : null}
      {live.loading ? (
        <Skeleton rows={4} />
      ) : live.failed && (live.stale || !live.data) ? (
        <LoadFailed error={live.error} onRetry={live.reload} />
      ) : !rows.length ? (
        <EmptyState icon={<IconUsers />} title={t("empty")} />
      ) : (
        <>
          {live.failed ? <RefreshFailed /> : null}
          <ol className="mkm-top">
            {rows.map((s, i) => (
              <li key={s.userId}>
                <button type="button" className="mkm-top__row" onClick={() => onSeller(s)} aria-label={t("aria", { name: s.name || s.phone, n: s.activeOrders })}>
                  <span className="mkm-top__rank">{i + 1}</span>
                  <Avatar name={s.name} />
                  <span className="mkm-top__who">
                    <b>{s.name || s.phone || "—"}</b>
                    <em>
                      {typeLabel(s.sellerType)} · {t("meta", { done: count(s.completedOrders), total: count(s.ordersTotal) })} · {money(s.revenuePaid)}
                    </em>
                  </span>
                  <span className="mkm-top__bar" aria-hidden>
                    <i style={{ width: `${(s.activeOrders / max) * 100}%` }} />
                  </span>
                  <span className="mkm-top__n">
                    <b>{count(s.activeOrders)}</b>
                    <small>{t("activeShort")}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Latest({ live, filtered, onOpen, onAll }: { live: Live<MkmPage<MkmOrder>>; filtered: boolean; onOpen: (o: MkmOrder) => void; onAll: () => void }) {
  const t = useTranslations("admin.marketplace.latest");
  const money = useMoney();
  const when = useWhen();
  const rows = live.data?.items ?? [];
  return (
    <section className={`mkm-card${live.changing ? " is-busy" : ""}`} aria-busy={live.changing || live.loading}>
      <div className="mkm-card__h">
        <b>{t("title")}</b>
        <button type="button" className="mkm-link" onClick={onAll}>
          {t("all")}
          <IconChevronRight aria-hidden />
        </button>
      </div>
      {live.loading ? (
        <Skeleton rows={4} />
      ) : live.failed && (live.stale || !live.data) ? (
        <LoadFailed error={live.error} onRetry={live.reload} />
      ) : !rows.length ? (
        <EmptyState icon={<IconLayers />} title={filtered ? t("emptyFiltered") : t("empty")} />
      ) : (
        <>
          {live.failed ? <RefreshFailed /> : null}
          <ul className="mkm-latest">
            {rows.map((o) => (
              <li key={o.id}>
                <button type="button" className="mkm-latest__row" onClick={() => onOpen(o)}>
                  <span className={`mkm-dot mkm-tone--${toneOf(o.status)}`} aria-hidden />
                  <span className="mkm-wid">{o.workId || "—"}</span>
                  <span className="mkm-latest__svc">
                    <b>{o.serviceTitle || "—"}</b>
                    <em>
                      {o.client.name || o.client.phone || "—"} → {o.seller.name || o.seller.phone || "—"}
                    </em>
                  </span>
                  <span className="mkm-latest__amt">{money(o.price, o.currency)}</span>
                  <StatusBadge status={o.status} />
                  <span className="mkm-latest__when">{when(o.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default function MkmOverview({
  overview,
  top,
  latest,
  scoped,
  filtered,
  onStatus,
  onSeller,
  onSellersTab,
  onOrdersTab,
  onOpen,
}: {
  overview: Live<MkmStats>;
  top: Live<MkmPage<MkmSeller>>;
  latest: Live<MkmPage<MkmOrder>>;
  scoped: boolean;
  filtered: boolean;
  onStatus: (status: string) => void;
  onSeller: (s: MkmSeller) => void;
  onSellersTab: () => void;
  onOrdersTab: () => void;
  onOpen: (o: MkmOrder) => void;
}) {
  const t = useTranslations("admin.marketplace.kpi");
  const count = useCount();
  const s = overview.data;

  if (overview.loading) {
    return (
      <div className="mkm-over">
        <div className="mkm-kpis">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="mkm-kpi mkm-kpi--ghost" aria-hidden />
          ))}
        </div>
        <Skeleton rows={3} />
      </div>
    );
  }
  if (overview.failed && (overview.stale || !s)) {
    return (
      <section className="mkm-card">
        <LoadFailed error={overview.error} onRetry={overview.reload} />
      </section>
    );
  }
  if (!s) return null;

  const open = t("open");
  return (
    <div className="mkm-over">
      {overview.failed ? <RefreshFailed /> : null}
      <div className={`mkm-kpis${overview.changing ? " is-busy" : ""}`}>
        <Kpi label={t("total")} value={count(s.ordersTotal)} tone="brand" icon={<IconLayers />} onClick={() => onStatus("")} openLabel={open} />
        <Kpi label={t("active")} value={count(s.activeOrders)} sub={t("activeSub")} tone="active" icon={<IconBolt />} openLabel={open} />
        <Kpi label={t("paid")} value={count(s.paidOrders)} sub={t("paidSub")} tone="brand" icon={<IconCard />} onClick={() => onStatus("paid")} openLabel={open} />
        <Kpi label={t("completed")} value={count(s.completedOrders)} tone="done" icon={<IconCheck />} onClick={() => onStatus("completed")} openLabel={open} />
        <Kpi label={t("pending")} value={count(s.pendingPaymentOrders)} tone="pending" icon={<IconClock />} onClick={() => onStatus("pending_payment")} openLabel={open} />
        <Kpi label={t("cancelled")} value={count(s.cancelledOrders)} tone="cancel" icon={<IconClose />} onClick={() => onStatus("cancelled")} openLabel={open} />
        <Kpi label={t("sellers")} value={count(s.sellersCount)} sub={t("sellersSub")} tone="brand" icon={<IconUsers />} onClick={onSellersTab} openLabel={t("openSellers")} />
        <Kpi label={t("clients")} value={count(s.clientsCount)} sub={t("clientsSub")} tone="brand" icon={<IconUser />} openLabel={open} />
      </div>

      <div className="mkm-grid">
        <section className={`mkm-card${overview.changing ? " is-busy" : ""}`}>
          <StatusChart stats={s} />
        </section>
        <TopSellers live={top} scoped={scoped} onSeller={onSeller} onAll={onSellersTab} />
      </div>

      <Latest live={latest} filtered={filtered} onOpen={onOpen} onAll={onOrdersTab} />
    </div>
  );
}
