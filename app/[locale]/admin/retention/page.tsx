"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { addRetentionQueue } from "@/lib/services/backend";
import { getRetentionData, isRetentionEmpty, isFiltered, todayIso, type RetentionData, type AtRiskClient } from "@/lib/services/dash";
import { demoRetention } from "@/lib/demoStats";
import { useResourceOne } from "@/lib/useResource";
import { fmtDate } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import StatTile from "@/components/admin/StatTile";
import StatDrillModal, { type Drill } from "@/components/admin/StatDrillModal";
import DashFilterBar, { useDashFilter } from "@/components/admin/DashFilterBar";
import { IconAlert, IconUsers, IconTrendingUp, IconCheck, IconInfo } from "@/components/icons";

const EMPTY: RetentionData = { fetchedAt: "", atRisk: 0, atRiskLeads: 0, churnedThisMonth: 0, retainedPct: 0, periodDays: 30, previousPeriodActive: 0, currentPeriodActive: 0, retainedClients: 0, atRiskClients: [], upsell: [] };

export default function AdminRetention() {
  const t = useTranslations("admin.retention");
  const td = useTranslations("admin.dash");
  const locale = useLocale();
  const { filter, setFilter, demoForced, setDemoForced } = useDashFilter();
  const fkey = `${filter.region}|${filter.from}|${filter.to}`;
  const res = useResourceOne(() => getRetentionData(filter), [fkey]);
  const loaded = res.status !== "loading";
  const demo = demoForced || (loaded && (!res.data || isRetentionEmpty(res.data)));
  const d = useMemo(() => (demo ? demoRetention(todayIso()) : res.data ?? EMPTY), [demo, res.data]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const reason = (k: string) => (t.has(`reason.${k}`) ? t(`reason.${k}`) : humanizeSlug(k));
  const lastPaid = (c: AtRiskClient) => (c.lastPaidAt ? t("lastPaid", { date: fmtDate(c.lastPaidAt, locale) }) : t("neverPaid"));
  const regionHint = filter.region ? td("hint.regionNa") : undefined;

  async function winBack(c: AtRiskClient) {
    if (demo) { setNote({ ok: false, msg: t("demoAction") }); return; }
    if (!c.id && !c.phone) { setNote({ ok: false, msg: t("noClientId") }); return; }
    setBusy(c.id || c.phone);
    setNote(null);
    try {
      await addRetentionQueue({ client_user_id: c.id || undefined, phone: c.phone || undefined, note: c.reasons.join(", "), offer: "win_back" });
      setNote({ ok: true, msg: t("winBackDone", { name: c.name || c.phone }) });
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(null);
    }
  }

  const periodKv = (): Drill["sections"][number] => ({ kind: "kv", title: td("drill.retention"), rows: [
    { label: td("drill.prevActive"), value: String(d.previousPeriodActive) }, { label: td("drill.curActive"), value: String(d.currentPeriodActive) },
    { label: td("drill.retainedClients"), value: String(d.retainedClients), tone: "ok" }, { label: t("churned"), value: String(d.churnedThisMonth), tone: "bad" },
    { label: td("drill.atRiskLeads"), value: String(d.atRiskLeads) },
  ] });
  const riskList = (): Drill["sections"][number] => ({ kind: "list", title: t("atRiskTitle"), rows: d.atRiskClients.map((c) => ({ label: c.name || c.phone, value: lastPaid(c), sub: c.reasons.map(reason).join(", "), tone: "bad" })), empty: t("noRisk") });
  const upsellList = (): Drill["sections"][number] => ({ kind: "list", title: t("upsellTitle"), rows: d.upsell.map((u) => ({ label: u.name, value: u.price ? fmtUzs(u.price) : "", sub: u.suggestion })), empty: t("noUpsell") });
  const open = (title: string, value: string, sections: Drill["sections"]) => setDrill({ title, value, demo, sections });

  return (
    <>
      <div className="ppanel">
        <div className="ppanel__h"><b>{t("title")}</b></div>
        <DashFilterBar value={filter} onChange={setFilter} demoForced={demoForced} onDemoForced={setDemoForced} note={isFiltered(filter) ? td("filter.regionNote") : undefined} compact />
        {demo && loaded ? <p className="bhnote" role="status"><IconInfo />{demoForced ? td("demo.forced") : td("demo.banner")}</p> : null}
        {!loaded ? (
          <Skeleton rows={3} />
        ) : (
          <div className="castat">
            <StatTile icon={<IconAlert />} tone="bad" value={String(d.atRisk)} label={t("atRisk")} sub={`${td("drill.atRiskLeads")}: ${d.atRiskLeads}`} demo={demo} hint={regionHint} onClick={() => open(t("atRisk"), String(d.atRisk), [riskList(), periodKv()])} />
            <StatTile icon={<IconUsers />} value={String(d.churnedThisMonth)} label={t("churned")} demo={demo} hint={regionHint} onClick={() => open(t("churned"), String(d.churnedThisMonth), [periodKv(), riskList()])} />
            <StatTile icon={<IconTrendingUp />} tone="ok" value={`${d.retainedPct}%`} label={t("retained")} demo={demo} hint={regionHint} onClick={() => open(t("retained"), `${d.retainedPct}%`, [periodKv(), upsellList()])} />
          </div>
        )}
      </div>

      <div className="pgrid2">
        <div className="ppanel">
          <div className="ppanel__h"><b>{t("atRiskTitle")}</b></div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          {!loaded ? <Skeleton rows={2} /> : !d.atRiskClients.length ? (
            <p className="advmuted">{t("noRisk")}</p>
          ) : (
            <div className="alist">
              {d.atRiskClients.map((c, i) => (
                <div className="creq" key={c.id || i}>
                  <span className="creq__st" />
                  <div className="creq__m"><b>{c.name || c.phone}</b><span>{[c.reasons.map(reason).join(", "), lastPaid(c)].filter(Boolean).join(" · ")}</span></div>
                  <button className="btn btn--soft btn--sm" type="button" disabled={busy === (c.id || c.phone)} onClick={() => winBack(c)}>{busy === (c.id || c.phone) ? t("adding") : t("winBack")}</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ppanel">
          <div className="ppanel__h"><b>{t("upsellTitle")}</b></div>
          {!loaded ? <Skeleton rows={2} /> : !d.upsell.length ? (
            <p className="advmuted">{t("noUpsell")}</p>
          ) : (
            <div className="alist">
              {d.upsell.map((u, i) => (
                <div className="creq" key={u.id || i}>
                  <span className="creq__st" />
                  <div className="creq__m"><b>{u.name}</b><span>{[u.suggestion, u.price ? `${t("price")}: ${fmtUzs(u.price)}` : ""].filter(Boolean).join(" · ")}</span></div>
                  <span className="creq__badge"><IconCheck /></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <StatDrillModal drill={drill} onClose={() => setDrill(null)} />
    </>
  );
}
