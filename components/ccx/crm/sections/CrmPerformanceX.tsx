"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { fmtNum } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { crmCan, getMyCrmMetrics, type CrmMeta, type CrmMetrics } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import { Note } from "../../panel/bits";
import { IcAward, IcChart, IcClock, IcFlag, IcLayers, IcUser } from "../../icons";
import { IcPercent, IcTrend } from "../misc/icons";
import { Card, Empty, Failed, Kpi, KpiRow, RefreshButton, Seg, Skel } from "../misc/ui";
import { crmHref, type CrmSectionProps } from "../nav";
import { useCrmErr, useStatusName } from "../leads/util";
import DatePicker from "@/components/DatePicker";

type Preset = "7" | "30" | "90" | "all" | "custom";

const FALLBACK: Record<string, string> = {
  new: "var(--opx-ice)",
  qualified: "var(--opx-aqua)",
  proposal: "var(--opx-st-wrap)",
  decision_pending: "var(--opx-warn)",
  won: "var(--opx-teal)",
  rejected: "var(--opx-hot)",
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function lastDays(days: number): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  return { from: ymd(start), to: ymd(end) };
}

const colorOf = (meta: CrmMeta, s: string): string => meta.statusInfo.find((x) => x.key === s)?.color || FALLBACK[s] || "var(--opx-ink-3)";

export default function CrmPerformanceX({ meta }: CrmSectionProps) {
  const t = useTranslations("crm.perf");
  const tx = useTranslations("admin.ccx.crmMisc");
  const locale = useLocale();
  const crmErr = useCrmErr();
  const tf = useTranslations("crm.fields");
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [m, setM] = useState<CrmMetrics | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const req = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const n = ++req.current;
      setBusy(true);
      try {
        setM(await getMyCrmMetrics({ from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined }, signal));
        setErr("");
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.perf", e);
        setErr(crmErr(e));
      } finally {
        if (n === req.current) setBusy(false);
      }
    },
    [from, to, crmErr],
  );

  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);

  useCrmEvents((ev) => {
    if (ev.invalidate.some((k) => k === "all" || k === "metrics")) void load();
  });

  const pick = (p: Preset) => {
    setPreset(p);
    if (p === "custom") return;
    if (p === "all") {
      setFrom("");
      setTo("");
      return;
    }
    const r = lastDays(Number(p));
    setFrom(r.from);
    setTo(r.to);
  };

  const n = (v: number) => fmtNum(v, locale);

  return (
    <div className="opx-cm" data-ai-target="callcenter:crm:performance">
      <div className="opx-cm-bar">
        <Seg
          label={t("period")}
          value={preset}
          options={[
            { value: "7", label: tx("p7") },
            { value: "30", label: tx("p30") },
            { value: "90", label: tx("p90") },
            { value: "all", label: tx("pAll") },
            { value: "custom", label: tx("pCustom") },
          ]}
          onChange={pick}
        />
        {preset === "custom" ? (
          <span className="opx-cm-range" role="group" aria-label={t("period")}>
            <DatePicker value={from} max={to || undefined} placeholder={t("from")} ariaLabel={t("from")} clearLabel={tf("clear")} onChange={setFrom} />
            <DatePicker value={to} min={from || undefined} placeholder={t("to")} ariaLabel={t("to")} clearLabel={tf("clear")} onChange={setTo} />
          </span>
        ) : null}
        <RefreshButton onClick={() => void load()} busy={busy} />
      </div>

      {err && !m ? (
        <Failed title={t("failed")} text={err} retry={t("retry")} onRetry={() => void load()} />
      ) : !m ? (
        <Skel heights={[110, 120, 280]} />
      ) : (
        <div className="opx-cm-perf" aria-busy={busy || undefined}>
          {err ? <Note tone="bad">{err}</Note> : null}

          <header className="opx-cm-hero">
            <span className="opx-cm-hero__ic" aria-hidden="true">
              <IcUser size={22} />
            </span>
            <div>
              <h3>{m.operator?.name || t("title")}</h3>
            </div>
          </header>

          <KpiRow>
            <Kpi icon={<IcLayers size={20} />} label={t("active")} value={n(m.active)} sub={t("activeSub", { total: n(m.total) })} tone="info" />
            <Kpi icon={<IcAward size={20} />} label={t("won")} value={n(m.won)} sub={t("closedSub", { n: n(m.closed) })} tone="ok" />
            <Kpi icon={<IcPercent size={20} />} label={t("conversion")} value={`${fmtNum(m.conversion, locale, 1)}%`} sub={t("conversionSub")} />
            <Kpi icon={<IcClock size={20} />} label={t("firstResponse")} value={m.firstResponseMin === null ? "—" : t("min", { n: fmtNum(m.firstResponseMin, locale, 1) })} sub={t("firstResponseSub")} />
            <Kpi icon={<IcFlag size={20} />} label={t("overdue")} value={n(m.overdue)} sub={t("overdueSub")} tone={m.overdue ? "hot" : undefined} />
          </KpiRow>

          <div className="opx-cm-split opx-cm-split--even">
            <Card icon={<IcChart size={17} />} title={t("byStatus")}>
              <StatusBars meta={meta} counts={m.statusCounts} />
            </Card>
            <Card icon={<IcTrend size={17} />} title={t("cycles")}>
              <dl className="opx-cm-stats">
                {(["total", "open", "won", "rejected", "completed"] as const).map((k) => (
                  <div key={k} data-tone={k === "won" ? "ok" : k === "rejected" ? "hot" : undefined}>
                    <dt>{t(`c.${k}`)}</dt>
                    <dd className="opx-num">{n(m.cycles[k])}</dd>
                  </div>
                ))}
              </dl>
              <div className="opx-cm-meter">
                <span>
                  <b>{t("c.conversion")}</b>
                  <b className="opx-num">{`${fmtNum(m.cycles.conversion, locale, 1)}%`}</b>
                </span>
                <i aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, m.cycles.conversion))}%` }} />
                </i>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBars({ meta, counts }: { meta: CrmMeta; counts: Record<string, number> }) {
  const t = useTranslations("crm.perf");
  const td = useTranslations("crm.overview.donut");
  const label = useStatusName();
  const locale = useLocale();
  if (!Object.values(counts).some(Boolean)) return <Empty icon={<IcChart size={24} />} title={t("empty")} text={t("emptyText")} />;
  const slices = meta.statuses.map((s) => ({ s, n: counts[s] ?? 0 }));
  // The rows open the lead list only for a session that can see leads.
  const leads = crmCan(meta, "crm.leads.view");
  const total = slices.reduce((a, x) => a + x.n, 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  const paint = (s: string) => ({ ["--c" as string]: colorOf(meta, s) }) as CSSProperties;
  return (
    <div className="opx-cm-status">
      <div className="opx-cm-stack" role="img" aria-label={td("aria", { n: total })}>
        {slices
          .filter((x) => x.n > 0)
          .map((x) => (
            <span key={x.s} style={{ ...paint(x.s), flexGrow: x.n }} title={`${label(x.s)}: ${x.n} (${pct(x.n)}%)`}>
              {pct(x.n) >= 9 ? <b className="opx-num">{`${fmtNum(x.n, locale)} (${pct(x.n)}%)`}</b> : null}
            </span>
          ))}
      </div>
      <ul className="opx-cm-legend">
        {slices.map((x) => (
          <li key={x.s}>
            {leads ? (
              <Link href={crmHref("leads", { scope: "mine", status: x.s })} style={paint(x.s)} data-zero={x.n === 0 || undefined} aria-label={td("row", { status: label(x.s), n: x.n, p: pct(x.n) })}>
                <i aria-hidden="true" />
                <span>{label(x.s)}</span>
                <b className="opx-num">{fmtNum(x.n, locale)}</b>
                <small className="opx-num">{pct(x.n)}%</small>
              </Link>
            ) : (
              <div className="opx-cm-legend__row" style={paint(x.s)} data-zero={x.n === 0 || undefined}>
                <i aria-hidden="true" />
                <span>{label(x.s)}</span>
                <b className="opx-num">{fmtNum(x.n, locale)}</b>
                <small className="opx-num">{pct(x.n)}%</small>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
