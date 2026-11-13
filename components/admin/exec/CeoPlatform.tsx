"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import DatePicker from "@/components/DatePicker";
import { EmptyState, ErrorState } from "@/components/portal/DataState";
import { IconChartBar, IconLock, IconRefresh } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { ApiError, isForbidden, isValidation } from "@/lib/http";
import { fmtDate, fmtDateTime, fmtDuration, fmtNum, fmtPct } from "@/lib/date";
import { fmtUzsShort } from "@/lib/money";
import { humanizeSlug } from "@/lib/lawyers";
import { useLoad } from "@/lib/useLoad";
import { CEO_KPI_KEYS, getCeoPlatform, isNotConnected, type CeoKpiKey, type CeoPlatform as Data, type Metric } from "@/lib/services/executive";
import CeoTabs, { canSeeCeoPlatform } from "./CeoTabs";
import "./exec.css";

const TZ = "Asia/Tashkent";

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="ceo-sec" aria-labelledby={`exc-${id}`}>
      <header className="ceo-sec__h">
        <div className="ceo-sec__tt">
          <h2 id={`exc-${id}`}>{title}</h2>
          {lead ? <p>{lead}</p> : null}
        </div>
      </header>
      <div className="ceo-sec__b">{children}</div>
    </section>
  );
}

// "Nothing yet" stays a gap, never a zero; "not connected" says so.
function useFmt() {
  const t = useTranslations("exec.ceo");
  const locale = useLocale();
  const num = (n: number | null) => (n === null ? "—" : fmtNum(n, locale));
  const pct = (n: number | null) => (n === null ? "—" : fmtPct(n, locale, 1));
  const money = (n: number | null) => (n === null ? "—" : `${fmtUzsShort(n, { mln: t("mln"), mlrd: t("mlrd") }, locale)} ${t("sum")}`);
  const dur = (ms: number | null) => (ms === null ? "—" : ms <= 0 ? fmtNum(0, locale) : fmtDuration(ms / 1000, locale) || fmtNum(0, locale));
  return { num, pct, money, dur, locale, t };
}

function Delta({ m }: { m: Metric }) {
  const t = useTranslations("exec.ceo");
  const locale = useLocale();
  if (m.changePct === null) return null;
  const up = m.changePct > 0.05;
  const down = m.changePct < -0.05;
  return (
    <span className={`ex-delta${up ? " is-up" : down ? " is-down" : ""}`} title={t("vsPrevious")}>
      <span aria-hidden="true">{up ? "▲" : down ? "▼" : "•"}</span>
      {fmtPct(Math.abs(m.changePct), locale, 1)}
      <span className="sr-only">{up ? t("up") : down ? t("down") : t("flat")}</span>
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const t = useTranslations("exec.ceo.status");
  if (!status) return null;
  const off = isNotConnected(status);
  const ok = /^(ok|connected|active|healthy)$/i.test(status);
  return <span className={`ceo-chip ${off ? "ceo-chip--na" : ok ? "ceo-chip--good" : "ceo-chip--watch"}`}>{t.has(status) ? t(status) : humanizeSlug(status)}</span>;
}

export default function CeoPlatform() {
  const { session, ready } = useAuth();
  const allowed = canSeeCeoPlatform(session);
  const f = useFmt();
  const { t, locale } = f;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ranged = !!from && !!to;
  const res = useLoad((signal) => getCeoPlatform(ranged ? { from, to, timezone: TZ } : { timezone: TZ }, signal), [ranged ? from : "", ranged ? to : "", allowed]);

  if (ready && !allowed) {
    return (
      <div className="ceo">
        <EmptyState icon={<IconLock />} title={t("denied.title")} text={t("denied.text")} />
      </div>
    );
  }

  const d = res.data;
  const err = res.status === "error" ? res.error : null;
  const header = (
    <header className="ceo-head ex-head">
      <div className="ex-head__row">
        <div>
          <h1 className="ex-title">{t("title")}</h1>
          <p className="ceo-head__meta">
            {d?.period.from && d.period.to
              ? t("period", { from: fmtDate(d.period.from, locale), to: fmtDate(d.period.to, locale) })
              : t("periodDefault")}
            {d?.previous.from && d.previous.to ? `  ·  ${t("previous", { from: fmtDate(d.previous.from, locale), to: fmtDate(d.previous.to, locale) })}` : ""}
            {`  ·  ${t("timezone", { tz: TZ })}`}
          </p>
        </div>
        <button type="button" className="btn btn--line btn--sm" onClick={res.reload} aria-busy={res.refreshing || undefined}>
          <IconRefresh className={res.refreshing ? "mk-spin" : undefined} aria-hidden="true" />
          {t("refresh")}
        </button>
      </div>
      <div className="ceo-range" role="group" aria-label={t("periodLabel")}>
        <DatePicker value={from} onChange={setFrom} max={to || undefined} placeholder={t("from")} ariaLabel={t("from")} />
        <DatePicker value={to} onChange={setTo} min={from || undefined} placeholder={t("to")} ariaLabel={t("to")} />
        {from || to ? (
          <button type="button" className="btn btn--line btn--sm" onClick={() => (setFrom(""), setTo(""))}>
            {t("last30")}
          </button>
        ) : null}
      </div>
      {d?.generatedAt ? <p className="ceo-head__meta">{t("generated", { at: fmtDateTime(d.generatedAt, locale) })}</p> : null}
    </header>
  );

  let body: ReactNode;
  if (res.status === "loading" || !ready) {
    body = (
      <div className="ceo-sk" aria-hidden="true">
        <div className="ceo-sk__figs"><span /><span /><span /><span /><span /></div>
        <div className="ceo-sk__sec"><span className="ceo-sk__h" /><span className="ceo-sk__row" /><span className="ceo-sk__row" /></div>
        <div className="ceo-sk__sec"><span className="ceo-sk__h" /><span className="ceo-sk__row" /><span className="ceo-sk__row" /></div>
        <p className="sr-only" role="status">{t("loading")}</p>
      </div>
    );
  } else if (err && !d && isForbidden(err)) {
    body = <EmptyState icon={<IconLock />} title={t("denied.title")} text={t("denied.text")} />;
  } else if (err && !d && isValidation(err)) {
    const e = err as ApiError;
    body = <EmptyState title={t("badRange.title")} text={e.fieldErrors.date_from || e.fieldErrors.date_to || t("badRange.text")} action={{ label: t("last30"), onClick: () => (setFrom(""), setTo("")) }} />;
  } else if (err && !d) {
    body = <ErrorState error={err} onRetry={res.reload} title={t("failed")} />;
  } else if (d) {
    body = <Report d={d} />;
  }

  return (
    <div className="ceo ex-ceo">
      <CeoTabs current="platform" />
      <article className="ceo-sheet is-ready" aria-busy={res.status === "loading"}>
        {header}
        {err && d ? <p className="ceo-hint" role="status">{t("stale")}</p> : null}
        {body}
      </article>
    </div>
  );
}

function isEmpty(d: Data): boolean {
  return CEO_KPI_KEYS.every((k) => !d.kpis[k].value) && !d.events.some((e) => e.count.value) && !d.funnel.some((s) => s.count) && !d.platforms.length;
}

function Report({ d }: { d: Data }) {
  const { num, pct, money, dur, t } = useFmt();
  const te = useTranslations("exec.ceo.events");
  const evName = (n: string) => (te.has(n) ? te(n) : humanizeSlug(n));
  const kpiValue = (k: CeoKpiKey, m: Metric) => (k === "paid_revenue" ? money(m.value) : k === "avg_session_duration" ? dur(m.value) : num(m.value));
  const kpiPrev = (k: CeoKpiKey, m: Metric) => (m.previous === null ? "" : t("prevValue", { v: k === "paid_revenue" ? money(m.previous) : k === "avg_session_duration" ? dur(m.previous) : num(m.previous) }));

  if (isEmpty(d)) {
    return <EmptyState icon={<IconChartBar />} title={t("empty.title")} text={t("empty.text")} />;
  }
  const top = d.funnel.length ? Math.max(...d.funnel.map((s) => s.count ?? 0), 1) : 1;
  const stores = d.installs.length ? d.installs : [{ platform: "android", value: { value: null, previous: null, changePct: null, status: "", unit: "" }, status: "" }, { platform: "ios", value: { value: null, previous: null, changePct: null, status: "", unit: "" }, status: "" }];

  return (
    <>
      <dl className="ceo-kpis ex-kpis">
        {CEO_KPI_KEYS.map((k) => {
          const m = d.kpis[k];
          return (
            <div key={k}>
              <dt>{t(`kpi.${k}`)}</dt>
              <dd className="ceo-kpis__v">{kpiValue(k, m)}</dd>
              <dd className="ceo-kpis__s">
                <Delta m={m} />
                {kpiPrev(k, m)}
              </dd>
            </div>
          );
        })}
      </dl>

      <Section id="apps" title={t("apps.title")} lead={t("apps.lead")}>
        <dl className="ceo-figs">
          {stores.map((s) => (
            <div key={s.platform}>
              <dt>{t.has(`platforms.${s.platform}`) ? t(`platforms.${s.platform}`) : humanizeSlug(s.platform)}</dt>
              {isNotConnected(s.status) ? (
                <dd className="is-na"><StatusChip status={s.status} /></dd>
              ) : (
                <dd>
                  {num(s.value.value)}
                  <small>{t("installs")} <Delta m={s.value} /></small>
                </dd>
              )}
            </div>
          ))}
          <div>
            <dt>{t("crashFree")}</dt>
            <dd className={d.crashFreePct.value === null ? "is-na" : undefined}>{pct(d.crashFreePct.value)}</dd>
          </div>
        </dl>
        {d.connectors.length ? (
          <ul className="ex-conn" aria-label={t("connectors")}>
            {d.connectors.map((c) => (
              <li key={c.key}>
                <b>{t.has(`connector.${c.key}`) ? t(`connector.${c.key}`) : c.label || humanizeSlug(c.key)}</b>
                <StatusChip status={c.status} />
                {c.detail ? <small>{c.detail}</small> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {d.versions.length ? (
          <div className="ceo-tablewrap ex-gap">
            <table className="ceo-table">
              <caption className="sr-only">{t("versions")}</caption>
              <thead>
                <tr><th scope="col">{t("col.version")}</th><th scope="col">{t("col.platform")}</th><th scope="col" className="ex-num">{t("col.users")}</th><th scope="col" className="ex-num">{t("col.share")}</th></tr>
              </thead>
              <tbody>
                {d.versions.map((v) => (
                  <tr key={`${v.platform}-${v.version}`}>
                    <th scope="row">{v.version}</th>
                    <td>{t.has(`platforms.${v.platform}`) ? t(`platforms.${v.platform}`) : humanizeSlug(v.platform)}</td>
                    <td className="ex-num">{num(v.users)}</td>
                    <td className="ex-num">{pct(v.sharePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Section>

      <Section id="usage" title={t("usage.title")} lead={t("usage.lead")}>
        {d.platforms.length ? (
          <div className="ceo-tablewrap">
            <table className="ceo-table">
              <thead>
                <tr><th scope="col">{t("col.platform")}</th><th scope="col" className="ex-num">{t("col.users")}</th><th scope="col" className="ex-num">{t("col.sessions")}</th><th scope="col" className="ex-num">{t("col.events")}</th></tr>
              </thead>
              <tbody>
                {d.platforms.map((p) => (
                  <tr key={p.platform}>
                    <th scope="row">{t.has(`platforms.${p.platform}`) ? t(`platforms.${p.platform}`) : humanizeSlug(p.platform)}</th>
                    <td className="ex-num">{num(p.users.value)} <Delta m={p.users} /></td>
                    <td className="ex-num">{num(p.sessions.value)} <Delta m={p.sessions} /></td>
                    <td className="ex-num">{num(p.events.value)} <Delta m={p.events} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ex-muted">{t("noData")}</p>
        )}
        <dl className="ceo-figs">
          {(["d1", "d7", "d30"] as const).map((k) => (
            <div key={k}>
              <dt>{t(`retention.${k}`)}</dt>
              <dd className={d.retention[k] === null ? "is-na" : undefined}>{pct(d.retention[k])}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="funnel" title={t("funnel.title")} lead={t("funnel.lead")}>
        {d.funnel.length ? (
          <ol className="ex-funnel">
            {d.funnel.map((s) => (
              <li key={s.key}>
                <span className="ex-funnel__l">{evName(s.key)}</span>
                <span className="ex-funnel__bar" aria-hidden="true"><i style={{ width: `${Math.max(2, ((s.count ?? 0) / top) * 100)}%` }} /></span>
                <b className="ex-num">{num(s.count)}</b>
                <small className="ex-num">{s.conversionPct === null ? "" : pct(s.conversionPct)}</small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ex-muted">{t("noData")}</p>
        )}
      </Section>

      <Section id="ops" title={t("ops.title")} lead={t("ops.lead")}>
        <dl className="ceo-figs">
          {(["inbound", "outbound", "answered", "missed"] as const).map((k) => (
            <div key={k}>
              <dt>{t(`calls.${k}`)}</dt>
              {isNotConnected(d.calls.status) && d.calls[k].value === null ? (
                <dd className="is-na"><StatusChip status={d.calls.status} /></dd>
              ) : (
                <dd>{num(d.calls[k].value)} <small><Delta m={d.calls[k]} /></small></dd>
              )}
            </div>
          ))}
          <div>
            <dt>{t("ai.completed")}</dt>
            <dd>{num(d.ai.completed.value)} <small><Delta m={d.ai.completed} /></small></dd>
          </div>
          <div>
            <dt>{t("ai.failed")}</dt>
            <dd>{num(d.ai.failed.value)} <small><Delta m={d.ai.failed} /></small></dd>
          </div>
          <div>
            <dt>{t("hrm.present")}</dt>
            <dd>{num(d.hrm.present.value)}</dd>
          </div>
          <div>
            <dt>{t("hrm.active")}</dt>
            <dd>{num(d.hrm.active.value)}</dd>
          </div>
        </dl>
      </Section>

      <Section id="events" title={t("eventsTitle")} lead={t("eventsLead")}>
        {d.events.length ? (
          <div className="ceo-tablewrap">
            <table className="ceo-table">
              <thead>
                <tr><th scope="col">{t("col.event")}</th><th scope="col" className="ex-num">{t("col.now")}</th><th scope="col" className="ex-num">{t("col.before")}</th><th scope="col" className="ex-num">{t("col.change")}</th></tr>
              </thead>
              <tbody>
                {d.events.map((e) => (
                  <tr key={e.name}>
                    <th scope="row">{evName(e.name)}</th>
                    <td className="ex-num">{num(e.count.value)}</td>
                    <td className="ex-num">{num(e.count.previous)}</td>
                    <td className="ex-num"><Delta m={e.count} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ex-muted">{t("noData")}</p>
        )}
      </Section>
    </>
  );
}
