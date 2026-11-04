"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Columns3, Search, UserCog, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtNum } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { initials } from "@/lib/lawyers";
import { matchesSearch } from "@/lib/searchText";
import { crmCan, listCrmOperators, type CrmMeta, type CrmOperator } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import CrmFrame from "../CrmFrame";
import { useCrmError } from "../bits";

// Operators (ROP contract §4, §11): every operator with `active_leads`,
// sorted by load, and a way into the lead list filtered by that operator.
// The operator filter exists only for an "all" scope (§5).

type Sort = "load" | "name";

export default function RopOperators(): ReactElement {
  const t = useTranslations("rop");
  return (
    <CrmFrame section="operators" title={t("nav.operators")} noTray>
      {(api) => <Operators meta={api.meta} />}
    </CrmFrame>
  );
}

function Operators({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("rop.ops");
  const locale = useLocale();
  const crmErr = useCrmError();
  const [ops, setOps] = useState<CrmOperator[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("load");
  const [tick, setTick] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const scopeAll = meta.scope === "all";

  useEffect(() => {
    const ctl = new AbortController();
    listCrmOperators("", ctl.signal).then(
      (r) => {
        setOps(r);
        setErr("");
      },
      (e) => {
        if (isAborted(e)) return;
        logApiError("rop.operators", e);
        setErr(crmErr(e));
      },
    );
    return () => ctl.abort();
  }, [tick, crmErr]);
  useCrmEvents((ev) => {
    if (!ev.invalidate.some((x) => ["all", "lists", "lead", "counts", "queue"].includes(x))) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTick((n) => n + 1), 1000);
  });

  const rows = useMemo(() => {
    const list = (ops ?? []).filter((o) => !q.trim() || matchesSearch(`${o.name} ${o.lexgoId}`, q));
    return list.sort((a, b) => (sort === "load" ? b.activeLeads - a.activeLeads || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));
  }, [ops, q, sort]);
  const total = (ops ?? []).reduce((s, o) => s + o.activeLeads, 0);
  const max = Math.max(1, ...rows.map((o) => o.activeLeads));
  const avg = ops?.length ? total / ops.length : 0;

  return (
    <div className="rop-page" data-rop-operators="">
      <div className="rop-grid rop-grid--kpi">
        <Stat Icon={Users} label={t("count")} value={ops ? fmtNum(ops.length, locale) : "…"} />
        <Stat Icon={UserCog} label={t("active")} value={ops ? fmtNum(total, locale) : "…"} />
        <Stat Icon={Columns3} label={t("average")} value={ops ? fmtNum(avg, locale, 1) : "…"} />
        <Stat Icon={ArrowUpRight} label={t("busiest")} value={rows[0] && sort === "load" ? rows[0].name : ops ? "—" : "…"} small />
      </div>
      <section className="rop-card" aria-labelledby="rop-ops-h">
        <div className="rop-card__h">
          <h2 id="rop-ops-h" className="rop-h2"><Users aria-hidden="true" />{t("title")}</h2>
          <div className="rop-toolbar__sp">
            <label className="lx-search" style={{ width: "min(320px, 100%)" }}>
              <Search aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
            </label>
            <span className="rop-seg" role="group" aria-label={t("sort")}>
              <button type="button" aria-pressed={sort === "load"} onClick={() => setSort("load")}>{t("byLoad")}</button>
              <button type="button" aria-pressed={sort === "name"} onClick={() => setSort("name")}>{t("byName")}</button>
            </span>
          </div>
        </div>
        {err ? (
          <div className="rop-empty">
            <b>{err}</b>
            <button type="button" className="crm-btn" onClick={() => setTick((n) => n + 1)}>{t("retry")}</button>
          </div>
        ) : !ops ? (
          <div className="rop-list" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} className="rop-sk" />)}</div>
        ) : !rows.length ? (
          <div className="rop-empty">
            <span className="rop-empty__ic"><Users /></span>
            <b>{q ? t("noMatch") : t("empty")}</b>
          </div>
        ) : (
          <ul className="rop-list rop-ops">
            {rows.map((o) => (
              <li key={o.id} className="rop-op">
                <span className="rop-av">{initials(o.name || "O")}</span>
                <span className="rop-row__b">
                  <b>{o.name}</b>
                  <small>{[o.lexgoId, o.role ? t.has(`role.${o.role}`) ? t(`role.${o.role}`) : "" : ""].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="rop-op__load" aria-label={t("activeLeads", { n: o.activeLeads })}>
                  <i><em style={{ width: `${(o.activeLeads / max) * 100}%` }} /></i>
                  <b>{fmtNum(o.activeLeads, locale)}</b>
                </span>
                {scopeAll && crmCan(meta, "crm.leads.view") ? (
                  <span className="rop-op__go">
                    <Link className="crm-btn" href={`/admin/crm/leads?tab=all&operator=${encodeURIComponent(o.id)}`} aria-label={`${t("leads")}: ${o.name}`}>{t("leads")}<ArrowUpRight aria-hidden="true" /></Link>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ Icon, label, value, small }: { Icon: typeof Users; label: string; value: string; small?: boolean }): ReactElement {
  return (
    <div className="rop-kpi" style={{ minHeight: 140 }}>
      <span className="rop-kpi__top"><span className="rop-kpi__ic"><Icon /></span></span>
      <span className="rop-kpi__l">{label}</span>
      <b className="rop-kpi__v" style={small ? { fontSize: "1.2rem", overflowWrap: "anywhere" } : undefined}>{value}</b>
    </div>
  );
}
