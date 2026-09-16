"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/date";
import {
  getAdminDashboard,
  getCeoDashboard,
  getRetentionOverview,
  getQualityOverview,
  seedDemoData,
} from "@/lib/services/backend";
import { humanizeSlug } from "@/lib/lawyers";
import { isDemoUnavailable } from "@/lib/http";
import { useResourceOne } from "@/lib/useResource";
import { useDemoTools } from "@/lib/demoTools";
import { fmtUzs } from "@/lib/money";
import { Skeleton } from "@/components/portal/DataState";
import LineChart from "@/components/admin/LineChart";
import Modal from "@/components/admin/Modal";
import {
  IconBolt,
  IconUsers,
  IconTrendingUp,
  IconAward,
  IconCard,
  IconShieldCheck,
  IconBuilding,
  IconPhone,
  IconArrowRight,
} from "@/components/icons";

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("ru-RU").replace(/,/g, " ") : String(n));
const DASH = "—";

const MODULES = [
  { href: "/admin/pipeline", key: "pipeline", Icon: IconTrendingUp },
  { href: "/admin/verifications", key: "verifications", Icon: IconAward },
  { href: "/admin/payouts", key: "payouts", Icon: IconCard },
  { href: "/admin/quality", key: "quality", Icon: IconShieldCheck },
  { href: "/admin/b2b", key: "b2b", Icon: IconBuilding },
  { href: "/admin/retention", key: "retention", Icon: IconUsers },
  { href: "/admin/call-center", key: "callCenter", Icon: IconPhone },
];

function Tile({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div className="ktile">
      <span className="ktile__l">{label}</span>
      <b className="ktile__v">{value}</b>
      {typeof delta === "number" && delta !== 0 ? (
        <span className={`ktile__d ktile__d--${delta > 0 ? "up" : "down"}`}>
          {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}%
        </span>
      ) : null}
    </div>
  );
}

export default function AdminOverview() {
  const t = useTranslations("admin.overview");
  const tc = useTranslations("admin.overview.crm");
  const tn = useTranslations("admin");
  const locale = useLocale();
  const { session } = useAuth();
  const ceo = useResourceOne(getCeoDashboard, []);
  const ret = useResourceOne(getRetentionOverview, []);
  const qual = useResourceOne(getQualityOverview, []);
  // GET /admin/dashboard: payment sums/counts and orders/leads grouped by status.
  const dash = useResourceOne(getAdminDashboard, []);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [seedAsk, setSeedAsk] = useState(false);
  // The showcase seed is a staging tool: hidden where the demo routes are off (T0-01).
  const demoTools = useDemoTools();

  // Idempotent showcase seed. Production closes the endpoint (404 "Demo
  // endpoint yopiq"). The backend's message isn't localized and its counts
  // understate the seed, so show our own copy (never amounts).
  async function seed() {
    if (seedBusy) return;
    setSeedBusy(true);
    setSeedMsg(null);
    try {
      const r = await seedDemoData();
      setSeedMsg([t("seedReady"), r.removed > 0 ? t("seedRemoved", { n: r.removed }) : ""].filter(Boolean).join(" "));
    } catch (e) {
      setSeedMsg(isDemoUnavailable(e) ? t("seedUnavailable") : t("seedError"));
    } finally {
      setSeedBusy(false);
    }
  }

  const c = ceo.data;
  const r = ret.data;
  const q = qual.data;
  const money = (n?: number) => (n ? `${fmtUzs(n)} ${tc("som")}` : DASH);
  const pct = (n?: number) => (n || n === 0 ? `${Math.round(n)}%` : DASH);
  const funnel = c?.funnel ?? [];
  const fMax = Math.max(...funnel.map((f2) => f2.value), 1);
  const trend = c?.revenueTrend ?? [];
  const lastPoint = trend[trend.length - 1];
  const lastDate = lastPoint ? fmtDate(lastPoint.label, locale) : "";
  const loading = ceo.status === "loading" && ret.status === "loading" && qual.status === "loading";
  const stat = (k: string) => dash.data?.totals.find((x) => x.label === k)?.value;
  const chart = (k: string) => (dash.data?.charts.find((x) => x.key === k)?.points ?? []).filter((x) => x.label);
  const byStatus = chart("orders_by_status").sort((a, b) => b.value - a.value);
  const byScore = chart("leads_by_score").sort((a, b) => b.value - a.value);
  const sMax = Math.max(...byStatus.map((x) => x.value), 1);
  const label = (group: string, k: string) => (tc.has(`${group}.${k}`) ? tc(`${group}.${k}`) : humanizeSlug(k));

  return (
    <>
      <div className="advhero">
        <div className="advhero__t">
          <span className="advhero__k">{tc("kicker")}</span>
          <h2 className="psec-h" style={{ color: "#fff" }}>{t("hi", { name: session?.name ?? "" })}</h2>
          <p>{tc("sub")}</p>
        </div>
        <div className="advhero__done" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          {demoTools ? (
            <button className="btn btn--glass btn--sm" type="button" onClick={() => setSeedAsk(true)} disabled={seedBusy}>
              <IconBolt />
              {seedBusy ? t("seeding") : t("seed")}
            </button>
          ) : null}
          {seedMsg ? <span style={{ fontSize: ".8rem", color: "#B7CDEC" }}>{seedMsg}</span> : null}
        </div>
      </div>

      <Modal open={seedAsk} onClose={() => setSeedAsk(false)} title={t("seedConfirmTitle")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p className="advmuted" style={{ margin: 0 }}>{t("seedConfirmText")}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn--ghost" type="button" onClick={() => setSeedAsk(false)}>
              {tn("form.cancel")}
            </button>
            <button
              className="btn btn--pri"
              type="button"
              disabled={seedBusy}
              onClick={() => {
                setSeedAsk(false);
                seed();
              }}
            >
              {t("seedConfirm")}
            </button>
          </div>
        </div>
      </Modal>

      {loading ? <Skeleton rows={3} /> : null}

      {/* Headline KPIs — one clean panel */}
      <div className="ppanel">
        <div className="kpanel">
          <Tile label={tc("revenue")} value={money(c?.revenue)} delta={c?.revenueDeltaPct} />
          <Tile label={tc("mrr")} value={money(c?.mrr)} />
          <Tile label={tc("users")} value={c ? fmt(c.users) : DASH} />
          <Tile label={tc("conversion")} value={pct(c?.conversionPct)} />
          <Tile label={tc("retained")} value={pct(r?.retainedPct)} />
          <Tile label={tc("rating")} value={q?.avgRating ? q.avgRating.toFixed(1) : DASH} />
          <Tile label={tc("sla")} value={pct(q?.responseSlaPct)} />
          <Tile label={tc("atRisk")} value={r ? fmt(r.atRisk) : DASH} />
        </div>
      </div>

      <div className="pgrid2">
        {/* Revenue trend — line chart */}
        <div className="ppanel">
          <div className="ppanel__h">
            <b>{tc("revenueTrend")}</b>
            {lastPoint ? <span className="advmuted">{lastDate} · {money(lastPoint.value)}</span> : null}
          </div>
          {trend.length ? <LineChart points={trend} format={(v) => `${fmtUzs(v)} ${tc("som")}`} /> : <p className="advmuted">{t("empty")}</p>}
        </div>

        {/* Sales funnel — bar chart */}
        <div className="ppanel">
          <div className="ppanel__h"><b>{tc("funnel")}</b></div>
          {funnel.length ? (
            <div className="kfunnel">
              {funnel.map((fn, i) => (
                <div className="kfunnel__row" key={i}>
                  <span className="kfunnel__lbl">{label("stage", fn.label)}</span>
                  <span className="kfunnel__bar"><span style={{ width: `${Math.max(4, (fn.value / fMax) * 100)}%` }} /></span>
                  <b className="kfunnel__v">{fmt(fn.value)}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="advmuted">{t("empty")}</p>
          )}
        </div>
      </div>

      {/* Payments and order/lead status (GET /admin/dashboard) */}
      {dash.data ? (
        <div className="pgrid2">
          <div className="ppanel">
            <div className="ppanel__h"><b>{tc("payments")}</b></div>
            <div className="kpanel kpanel--2">
              <Tile label={tc("paidAmount")} value={money(stat("paid_amount"))} />
              <Tile label={tc("pendingAmount")} value={money(stat("pending_amount"))} />
              <Tile label={tc("paidCount")} value={fmt(stat("paid_count") ?? 0)} />
              <Tile label={tc("pendingCount")} value={fmt(stat("pending_count") ?? 0)} />
            </div>
            {byScore.length ? (
              <>
                <div className="ppanel__h" style={{ marginTop: 16 }}><b>{tc("leadsByScore")}</b></div>
                <div className="aitem__tags">
                  {byScore.map((x) => (
                    <span className="creq__badge" key={x.label}>{label("score", x.label)} · {fmt(x.value)}</span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <div className="ppanel">
            <div className="ppanel__h"><b>{tc("ordersByStatus")}</b></div>
            {byStatus.length ? (
              <div className="kfunnel">
                {byStatus.map((x) => (
                  <div className="kfunnel__row" key={x.label}>
                    <span className="kfunnel__lbl">{label("status", x.label)}</span>
                    <span className="kfunnel__bar"><span style={{ width: `${Math.max(4, (x.value / sMax) * 100)}%` }} /></span>
                    <b className="kfunnel__v">{fmt(x.value)}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="advmuted">{t("empty")}</p>
            )}
          </div>
        </div>
      ) : null}

      {/* CRM module shortcuts */}
      <div className="ppanel">
        <div className="ppanel__h"><b>{tc("modules")}</b></div>
        <div className="kmods">
          {MODULES.map(({ href, key, Icon }) => (
            <Link href={href} key={key} className="kmod">
              <span className="kmod__i"><Icon /></span>
              <span className="kmod__t">{tn(`nav.${key}`)}</span>
              <IconArrowRight className="kmod__a" />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
