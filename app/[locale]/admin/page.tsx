"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/date";
import {
  getCeoDashboard,
  getRetentionOverview,
  getQualityOverview,
  seedDemoData,
} from "@/lib/services/backend";
import { isDemoUnavailable } from "@/lib/http";
import { useResourceOne } from "@/lib/useResource";
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
  { href: "/admin/leads", key: "leads", Icon: IconUsers },
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
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [seedAsk, setSeedAsk] = useState(false);

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

  return (
    <>
      <div className="advhero">
        <div className="advhero__t">
          <span className="advhero__k">{tc("kicker")}</span>
          <h2 className="psec-h" style={{ color: "#fff" }}>{t("hi", { name: session?.name ?? "" })}</h2>
          <p>{tc("sub")}</p>
        </div>
        <div className="advhero__done" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <button className="btn btn--glass btn--sm" type="button" onClick={() => setSeedAsk(true)} disabled={seedBusy}>
            <IconBolt />
            {seedBusy ? t("seeding") : t("seed")}
          </button>
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
                  <span className="kfunnel__lbl">{fn.label}</span>
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
