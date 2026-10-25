"use client";

import "./monitoring.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconAlert, IconBolt, IconCheck, IconClose, IconLock, IconRefresh } from "@/components/icons";
import { ApiError, errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { shortDateTime, timeOnly } from "@/lib/date";
import { humanizeSlug } from "@/lib/lawyers";
import { onUserSocketResync, subscribeUserEvents, subscribeUserSocketState, userSocketState } from "@/lib/userSocket";
import { MONITORING_EVENTS, applyMonitoringEvent, captureMonitoringSnapshot, getMonitoringHistory, getMonitoringIntegration, getMonitoringOverview, type MonHistory, type MonIncident, type MonIntegration, type MonNode, type MonOverview, downloadMonitoringExport, getMonitoringExport, startMonitoringExport, type MonExport } from "@/lib/services/monitoring";

// Platform monitoring: the overview loads once, realtime events patch it
// (no polling), a reconnect reloads it once, and incidents stay on screen
// until a healthy update or the administrator dismisses them.

type Tone = "ok" | "info" | "warn" | "bad" | "off";
const TONE: Readonly<Record<string, Tone>> = {
  healthy: "ok",
  connected: "ok",
  ok: "ok",
  up: "ok",
  configured: "info",
  degraded: "warn",
  slow: "warn",
  warning: "warn",
  pending: "warn",
  down: "bad",
  error: "bad",
  failed: "bad",
  unhealthy: "bad",
  unreachable: "bad",
  disabled: "off",
  not_configured: "off",
  unknown: "off",
};
const toneOf = (s: string): Tone => TONE[s] ?? "off";

const RANGES = ["15m", "1h", "24h", "7d", "custom"] as const;
type Range = (typeof RANGES)[number];
const RANGE_MS: Record<Exclude<Range, "custom">, number> = { "15m": 15 * 60_000, "1h": 3_600_000, "24h": 86_400_000, "7d": 7 * 86_400_000 };
// History pages are read by type, offset and total from the backend.
const HISTORY_PAGE = 20;

function windowOf(range: Range, customFrom: string, customTo: string): { from: string; to: string } {
  const to = new Date();
  if (range === "custom" && customFrom && customTo) return { from: new Date(`${customFrom}T00:00:00`).toISOString(), to: new Date(`${customTo}T23:59:59`).toISOString() };
  return { from: new Date(to.getTime() - RANGE_MS[range === "custom" ? "15m" : range]).toISOString(), to: to.toISOString() };
}

// The Excel export runs on the server; this shows its progress and, once
// done, the download (files expire after 24 hours).
function HistoryExport({ job, error, onStart, onDownload }: { job: MonExport | null; error: string; onStart: () => void; onDownload: () => void }): ReactElement {
  const t = useTranslations("admin.monitoring");
  const running = !!job && (job.status === "queued" || job.status === "running");
  return (
    <span className="mon-export">
      {job?.status === "completed" ? (
        <button type="button" className="btn btn--pri btn--sm" onClick={onDownload}>
          {t("exportDownload", { n: job.rows })}
        </button>
      ) : (
        <button type="button" className="btn btn--line btn--sm" onClick={onStart} disabled={running}>
          {running ? t("exportRunning", { pct: job?.progress ?? 0 }) : t("exportStart")}
        </button>
      )}
      {error ? (
        <small className="mon-export__err" role="alert">
          {error}
        </small>
      ) : null}
    </span>
  );
}

// CPU and memory over the loaded snapshots, oldest first.
function Trend({ items, label }: { items: MonHistory["items"]; label: string }): ReactElement | null {
  const pts = items.filter((h) => h.type === "snapshot" && h.cpuPercent !== null).slice().reverse();
  if (pts.length < 2) return null;
  const W = 600;
  const H = 80;
  const line = (pick: (h: MonHistory["items"][number]) => number | null) =>
    pts.map((h, i) => `${(i / (pts.length - 1)) * W},${H - ((pick(h) ?? 0) / 100) * H}`).join(" ");
  return (
    <svg className="mon-trend" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={line((h) => h.memoryPercent)} data-k="memory" />
      <polyline points={line((h) => h.cpuPercent)} data-k="cpu" />
    </svg>
  );
}

const GB = 1024 ** 3;
const bytes = (n: number) => (n >= GB ? `${(n / GB).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`);
const pct = (n: number | null) => (n === null ? "" : `${Math.round(n * 10) / 10}%`);

type Load = { status: "loading" } | { status: "forbidden" } | { status: "error" } | { status: "ready"; data: MonOverview; at: number };

function useStatusLabel() {
  const t = useTranslations("admin.monitoring");
  return (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : humanizeSlug(s));
}

function Meter({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: Tone }): ReactElement {
  return (
    <div className="mon-card" data-tone={tone}>
      <span className="mon-card__l">{label}</span>
      <b className="mon-card__v">{value}</b>
      {sub ? <small className="mon-card__s">{sub}</small> : null}
    </div>
  );
}

// Alert thresholds, set per administrator (kept in this browser): a figure
// past `warn` turns amber, past `bad` red and raises the banner.
type Limits = { cpu: number; memory: number; disk: number; errors: number };
const DEFAULT_LIMITS: Limits = { cpu: 85, memory: 85, disk: 90, errors: 5 };
const LIMITS_KEY = "lexgo.monitoring.limits";
function readLimits(): Limits {
  try {
    const v = JSON.parse(localStorage.getItem(LIMITS_KEY) ?? "null") as Partial<Limits> | null;
    return { ...DEFAULT_LIMITS, ...(v ?? {}) };
  } catch {
    return DEFAULT_LIMITS;
  }
}
const toneAt = (p: number | null, limit: number): Tone => (p === null ? "off" : p >= limit ? "bad" : p >= limit * 0.85 ? "warn" : "ok");
const ms = (n: number | null) => (n === null ? "" : `${Math.round(n)} ms`);
const rate = (n: number | null) => (n === null ? "" : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB/s` : `${Math.round(n / 1024)} KB/s`);

// The integration map, laid out from the backend's nodes and edges: core
// nodes in the middle, the rest around them in the order the backend sends.
function Graph({ nodes, edges, onPick }: { nodes: MonNode[]; edges: MonOverview["edges"]; onPick: (key: string) => void }): ReactElement {
  const t = useTranslations("admin.monitoring");
  const status = useStatusLabel();
  const W = 520;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const core = nodes.filter((n) => n.type === "core");
  const rest = nodes.filter((n) => n.type !== "core");
  const at = new Map<string, { x: number; y: number }>();
  core.forEach((n, i) => {
    const a = core.length > 1 ? (2 * Math.PI * i) / core.length : 0;
    at.set(n.id, { x: cx + (core.length > 1 ? 40 * Math.cos(a) : 0), y: cy + (core.length > 1 ? 40 * Math.sin(a) : 0) });
  });
  rest.forEach((n, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, rest.length);
    at.set(n.id, { x: cx + 200 * Math.cos(a), y: cy + 140 * Math.sin(a) });
  });
  return (
    <figure className="mon-graph">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t("graphLabel")}>
        {edges.map((e) => {
          const a = at.get(e.source);
          const b = at.get(e.target);
          if (!a || !b) return null;
          return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="mon-graph__e" data-tone={toneOf(e.status)} />;
        })}
        {nodes.map((n) => {
          const p = at.get(n.id);
          if (!p) return null;
          const core = n.type === "core";
          const name = t.has(`keys.${n.id}`) ? t(`keys.${n.id}`) : n.label;
          return (
            <g
              key={n.id}
              className="mon-graph__n"
              data-tone={toneOf(n.status)}
              transform={`translate(${p.x} ${p.y})`}
              role={core ? "img" : "button"}
              tabIndex={core ? undefined : 0}
              aria-label={`${name}: ${status(n.status)}`}
              onClick={core ? undefined : () => onPick(n.id)}
              onKeyDown={core ? undefined : (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(n.id))}
            >
              <circle r={core ? 30 : 20} />
              <text y={core ? 46 : 34} textAnchor="middle">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mon-legend">
        {(["ok", "info", "warn", "bad", "off"] as const).map((k) => (
          <span key={k} data-tone={k}>
            <i aria-hidden="true" />
            {t(`tone.${k}`)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function IntegrationDetail({ itg, onClose, history, edges }: { itg: MonIntegration; onClose: () => void; history: MonHistory | null; edges: MonOverview["edges"] }): ReactElement {
  const t = useTranslations("admin.monitoring");
  const none = useTranslations("common")("none");
  const locale = useLocale();
  const status = useStatusLabel();
  const [live, setLive] = useState<MonIntegration | null>(null);
  const [failed, setFailed] = useState(false);
  const [checks, setChecks] = useState(0);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    getMonitoringIntegration(itg.key, ctl.signal, checks > 0).then(
      (d) => {
        setLive(d);
        setFailed(false);
        setChecking(false);
      },
      (e: unknown) => {
        if (isAborted(e)) return;
        logApiError("monitoring.integration", e);
        setFailed(true);
        setChecking(false);
      },
    );
    return () => ctl.abort();
  }, [itg.key, checks]);
  const d = live ?? itg;
  const name = t.has(`keys.${d.key}`) ? t(`keys.${d.key}`) : d.label || humanizeSlug(d.key);
  const nameOf = (k: string) => (t.has(`keys.${k}`) ? t(`keys.${k}`) : humanizeSlug(k));
  // This integration in the loaded snapshots, newest first.
  const past = (history?.items ?? []).flatMap((h) => {
    const row = h.integrations.find((i) => i.key === d.key);
    return row ? [{ at: h.at, ...row }] : [];
  });
  const okShare = past.length ? Math.round((past.filter((p) => toneOf(p.status) === "ok" || toneOf(p.status) === "info").length / past.length) * 1000) / 10 : null;
  const deps = d.dependencies.length ? d.dependencies : edges.filter((e) => e.target === d.key || e.source === d.key).map((e) => (e.source === d.key ? e.target : e.source));
  return (
    <section className="mon-detail" aria-label={name} data-ai-target="monitoring:integration-detail">
      <header>
        <b>{name}</b>
        <button
          type="button"
          className="btn btn--line btn--sm mon-check"
          disabled={checking}
          aria-busy={checking || undefined}
          onClick={() => {
            setChecking(true);
            setChecks((n) => n + 1);
          }}
        >
          <IconRefresh className={checking ? "mk-spin" : undefined} aria-hidden="true" />
          {checking ? t("checking") : t("checkNow")}
        </button>
        <button type="button" className="mon-x" onClick={onClose} aria-label={t("close")}>
          <IconClose />
        </button>
      </header>
      <dl>
        <div>
          <dt>{t("col.status")}</dt>
          <dd>
            <span className="mon-chip" data-tone={toneOf(d.status)}>
              {status(d.status)}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t("col.configured")}</dt>
          <dd>{d.configured ? t("yes") : t("no")}</dd>
        </div>
        <div>
          <dt>{t("col.latency")}</dt>
          <dd>{d.latencyMs === null ? none : `${Math.round(d.latencyMs * 10) / 10} ms`}</dd>
        </div>
        <div>
          <dt>{t("col.checked")}</dt>
          <dd>{d.checkedAt ? shortDateTime(d.checkedAt, locale) : none}</dd>
        </div>
        {d.uptimePercent !== null || okShare !== null ? (
          <div>
            <dt>{t("col.uptime")}</dt>
            <dd>{d.uptimePercent !== null ? `${d.uptimePercent}%` : t("uptimeLoaded", { n: okShare ?? 0, count: past.length })}</dd>
          </div>
        ) : null}
        {d.lastSuccessAt ? (
          <div>
            <dt>{t("col.lastSuccess")}</dt>
            <dd>{shortDateTime(d.lastSuccessAt, locale)}</dd>
          </div>
        ) : null}
        {d.lastErrorAt || d.lastError ? (
          <div>
            <dt>{t("col.lastError")}</dt>
            <dd>
              {[d.lastErrorAt ? shortDateTime(d.lastErrorAt, locale) : "", d.errorCode ? `(${d.errorCode})` : ""].filter(Boolean).join(" ")}
              {d.lastError ? <small className="mon-detail__err">{d.lastError}</small> : null}
            </dd>
          </div>
        ) : null}
        {d.backlog !== null ? (
          <div>
            <dt>{t("col.backlog")}</dt>
            <dd>{d.backlog}</dd>
          </div>
        ) : null}
        {deps.length ? (
          <div>
            <dt>{t("col.dependencies")}</dt>
            <dd>{deps.map(nameOf).join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      {past.length ? (
        <ol className="mon-detail__hist" aria-label={t("nodeHistory")}>
          {past.slice(0, 10).map((p, i) => (
            <li key={`${p.at}-${i}`}>
              <time>{p.at ? shortDateTime(p.at, locale) : none}</time>
              <span className="mon-chip" data-tone={toneOf(p.status)}>
                {status(p.status)}
              </span>
              <span>{p.latencyMs === null ? "" : `${Math.round(p.latencyMs * 10) / 10} ms`}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {d.detail ? <p className="mon-detail__msg">{d.detail}</p> : null}
      {failed ? <p className="mon-detail__msg">{t("detailFailed")}</p> : null}
    </section>
  );
}

export default function MonitoringPage(): ReactElement {
  const t = useTranslations("admin.monitoring");
  const none = useTranslations("common")("none");
  const locale = useLocale();
  const status = useStatusLabel();
  const [range, setRange] = useState<Range>("15m");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [history, setHistory] = useState<MonHistory | null>(null);
  const [incidents, setIncidents] = useState<MonIncident[]>([]);
  const [picked, setPicked] = useState("");
  const [snap, setSnap] = useState<"" | "busy" | "captured" | "running" | "failed">("");
  const [socket, setSocket] = useState(userSocketState());
  const [refreshing, setRefreshing] = useState(false);
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const [editLimits, setEditLimits] = useState(false);
  const [svcFilter, setSvcFilter] = useState<"all" | "problems">("all");
  const [svcQuery, setSvcQuery] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [histOffset, setHistOffset] = useState(0);
  const [histType, setHistType] = useState<"all" | "snapshot" | "incident">("all");
  const [exportJob, setExportJob] = useState<MonExport | null>(null);
  const [exportErr, setExportErr] = useState("");
  const seq = useRef(0);
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => alive && setLimits(readLimits()));
    return () => {
      alive = false;
    };
  }, []);
  const saveLimits = (next: Limits) => {
    setLimits(next);
    try {
      localStorage.setItem(LIMITS_KEY, JSON.stringify(next));
    } catch {
      // A private window: the thresholds still apply for this visit.
    }
  };

  const exportId = exportJob?.id ?? "";
  const exportRunning = exportJob?.status === "queued" || exportJob?.status === "running";
  async function startExport() {
    setExportErr("");
    try {
      setExportJob(await startMonitoringExport(windowOf(range, customFrom, customTo), histType === "all" ? "" : histType));
    } catch (e) {
      logApiError("monitoring.export", e);
      setExportErr(errDetail(e) || t("exportFailed"));
    }
  }
  async function download() {
    if (!exportJob) return;
    setExportErr("");
    try {
      await downloadMonitoringExport(exportJob);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      if (code === "monitoring_export_expired" || code === "monitoring_export_not_found" || code === "monitoring_export_file_missing") {
        setExportJob(null);
        setExportErr(t("exportExpired"));
      } else {
        logApiError("monitoring.export.download", e);
        setExportErr(errDetail(e) || t("exportFailed"));
      }
    }
  }
  // Follow a running export: its event when it arrives, a light poll meanwhile.
  useEffect(() => {
    if (!exportId || !exportRunning) return;
    let alive = true;
    const check = () =>
      getMonitoringExport(exportId).then(
        (j) => alive && setExportJob(j),
        (e) => logApiError("monitoring.export.status", e),
      );
    const id = window.setInterval(check, 3000);
    const off = subscribeUserEvents((ev) => {
      if (ev.event === "monitoring.export_completed") void check();
    });
    return () => {
      alive = false;
      window.clearInterval(id);
      off();
    };
  }, [exportId, exportRunning]);
  useEffect(() => {
    if (exportJob?.status === "failed") void Promise.resolve().then(() => setExportErr(exportJob.error || t("exportFailed")));
  }, [exportJob, t]);

  const reload = useCallback(
    async (quiet = false) => {
      const my = ++seq.current;
      if (quiet) setRefreshing(true);
      const win = windowOf(range, customFrom, customTo);
      try {
        const [data, hist] = await Promise.all([
          getMonitoringOverview(win),
          getMonitoringHistory(win, { limit: HISTORY_PAGE, offset: histOffset, type: histType === "all" ? "" : histType }).catch(() => null),
        ]);
        if (my !== seq.current) return;
        setLoad({ status: "ready", data, at: Date.now() });
        if (hist) setHistory(hist);
      } catch (e) {
        if (my !== seq.current) return;
        logApiError("monitoring.overview", e);
        if (!quiet) setLoad(isForbidden(e) ? { status: "forbidden" } : { status: "error" });
      } finally {
        if (my === seq.current) setRefreshing(false);
      }
    },
    [range, customFrom, customTo, histOffset, histType],
  );

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) void reload();
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  // Realtime: patch in place; a reconnect reloads once to cover the gap.
  useEffect(() => {
    const offEvents = subscribeUserEvents((ev) => {
      if (!(MONITORING_EVENTS as readonly string[]).includes(ev.event)) return;
      setLoad((cur) => {
        if (cur.status !== "ready") return cur;
        const r = applyMonitoringEvent(cur.data, ev);
        if (r.incident) {
          const inc = r.incident;
          setIncidents((list) => (list.some((x) => x.id === inc.id) ? list : [...list, inc]));
        }
        return { status: "ready", data: r.overview, at: Date.now() };
      });
      if (ev.event === "monitoring.integration_changed") {
        const key = String((ev.integration as { key?: string } | undefined)?.key ?? (ev.data as { key?: string } | undefined)?.key ?? ev.key ?? "");
        const st = String((ev.integration as { status?: string } | undefined)?.status ?? (ev.data as { status?: string } | undefined)?.status ?? ev.status ?? "");
        // A healthy update for the incident's integration clears it.
        if (key && toneOf(st) === "ok") setIncidents((list) => list.filter((x) => x.integration !== key));
      }
    });
    const offResync = onUserSocketResync(() => void reload(true));
    const offState = subscribeUserSocketState(setSocket);
    return () => {
      offEvents();
      offResync();
      offState();
    };
  }, [reload]);

  async function snapshot() {
    if (snap === "running") return;
    setSnap("running");
    try {
      const r = await captureMonitoringSnapshot();
      setSnap(r);
      if (r === "captured") void reload(true);
    } catch (e) {
      logApiError("monitoring.snapshot", e);
      setSnap("failed");
    }
  }

  if (load.status === "loading") {
    return (
      <div className="ppanel mon" aria-busy="true">
        <div className="ppanel__h">
          <b>{t("title")}</b>
        </div>
        <Skeleton rows={4} />
      </div>
    );
  }
  if (load.status === "forbidden") {
    return (
      <div className="ppanel mon">
        <EmptyState icon={<IconLock />} title={t("forbidden")} text={t("forbiddenText")} />
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="ppanel mon">
        <EmptyState icon={<IconBolt />} title={t("error")} text={t("errorText")} action={{ label: t("retry"), onClick: () => void reload() }} />
      </div>
    );
  }

  const o = load.data;
  const x = o.extra;
  const itg = o.integrations.find((i) => i.key === picked) ?? null;
  const shownItg = o.integrations.filter((i) => (svcFilter === "all" || ["warn", "bad"].includes(toneOf(i.status))) && (!svcQuery || `${i.key} ${i.label} ${t.has(`keys.${i.key}`) ? t(`keys.${i.key}`) : ""}`.toLowerCase().includes(svcQuery.toLowerCase())));
  const over = [
    o.system.cpuPercent !== null && o.system.cpuPercent >= limits.cpu ? t("cpu") : "",
    o.system.memoryPercent !== null && o.system.memoryPercent >= limits.memory ? t("memory") : "",
    o.system.diskPercent !== null && o.system.diskPercent >= limits.disk ? t("disk") : "",
    o.requests.errorRate !== null && o.requests.errorRate >= limits.errors ? t("requests") : "",
  ].filter(Boolean);
  const live = socket === "online";
  return (
    <div className="ppanel mon" data-ai-target="monitoring:page">
      <div className="ppanel__h mon-head">
        <div>
          <b>{t("title")}</b>
          <p className="ppanel__note">{t("lead")}</p>
        </div>
        <div className="mon-tools">
          <span className="mon-live" data-on={live ? "" : undefined} role="status">
            <i aria-hidden="true" />
            {live ? t("live") : socket === "connecting" ? t("reconnecting") : t("offline")}
          </span>
          <label className="mon-range">
            <span className="sr-only">{t("range")}</span>
            <select value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label={t("range")}>
              {RANGES.map((r) => (
                <option key={r} value={r}>
                  {t(`ranges.${r}`)}
                </option>
              ))}
            </select>
          </label>
          {range === "custom" ? (
            <span className="mon-dates">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label={t("dateFrom")} max={customTo || undefined} />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label={t("dateTo")} min={customFrom || undefined} />
            </span>
          ) : null}
          <button type="button" className="btn btn--line btn--sm" onClick={() => void reload(true)} disabled={refreshing}>
            <IconRefresh aria-hidden="true" />
            {refreshing ? t("refreshing") : t("refresh")}
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setEditLimits((v) => !v)} aria-expanded={editLimits}>
            {t("thresholds")}
          </button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => void snapshot()} disabled={snap === "running"}>
            {snap === "running" ? t("snapRunning") : t("snapshot")}
          </button>
        </div>
      </div>
      <p className="mon-at">{t("updatedAt", { time: timeOnly(new Date(load.at).toISOString(), locale) })}</p>
      {snap === "busy" ? <p className="mon-note" role="status">{t("snapBusy")}</p> : snap === "captured" ? <p className="mon-note" role="status">{t("snapDone")}</p> : snap === "failed" ? <p className="mon-note" data-tone="bad" role="alert">{t("snapFailed")}</p> : null}

      {editLimits ? (
        <fieldset className="mon-limits">
          <legend>{t("thresholdsLead")}</legend>
          {(["cpu", "memory", "disk", "errors"] as const).map((k) => (
            <label key={k}>
              <span>{t(`limit.${k}`)}</span>
              <input
                type="number"
                min={1}
                max={100}
                value={limits[k]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0 && n <= 100) saveLimits({ ...limits, [k]: n });
                }}
              />
              <small>%</small>
            </label>
          ))}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => saveLimits(DEFAULT_LIMITS)}>
            {t("thresholdsReset")}
          </button>
        </fieldset>
      ) : null}
      {over.length ? (
        <div className="mon-incident" role="alert" data-tone="warn">
          <IconAlert aria-hidden="true" />
          <span>
            <b>{t("overLimit")}</b>
            <small>{over.join(", ")}</small>
          </span>
        </div>
      ) : null}
      {incidents.map((inc) => (
        <div key={inc.id} className="mon-incident" role="alert">
          <IconAlert aria-hidden="true" />
          <span>
            <b>{inc.title || t("incident")}</b>
            {inc.integration ? <small>{t.has(`keys.${inc.integration}`) ? t(`keys.${inc.integration}`) : inc.integration}</small> : null}
          </span>
          <button type="button" className="btn btn--soft btn--sm" onClick={() => setIncidents((l) => l.filter((x) => x.id !== inc.id))}>
            <IconCheck aria-hidden="true" />
            {t("acknowledge")}
          </button>
        </div>
      ))}

      <div className="mon-cards">
        <Meter label={t("cpu")} value={(pct(o.system.cpuPercent) || none)} sub={o.system.cpuCount ? t("cores", { n: o.system.cpuCount }) : undefined} tone={toneAt(o.system.cpuPercent, limits.cpu)} />
        <Meter label={t("memory")} value={(pct(o.system.memoryPercent) || none)} sub={o.system.memoryTotal ? `${bytes(o.system.memoryUsed)} / ${bytes(o.system.memoryTotal)}` : undefined} tone={toneAt(o.system.memoryPercent, limits.memory)} />
        <Meter label={t("disk")} value={(pct(o.system.diskPercent) || none)} sub={o.system.diskTotal ? `${bytes(o.system.diskUsed)} / ${bytes(o.system.diskTotal)}` : undefined} tone={toneAt(o.system.diskPercent, limits.disk)} />
        <Meter label={t("requests")} value={String(o.requests.events)} sub={t("errors", { n: o.requests.errors, rate: (pct(o.requests.errorRate) || none) })} tone={toneAt(o.requests.errorRate, limits.errors)} />
        <Meter label={t("users")} value={String(o.users.active)} sub={[x.usersToday !== null ? t("usersToday", { n: x.usersToday }) : "", t("usersTotal", { n: o.users.total })].filter(Boolean).join(" · ")} />
        <Meter label={t("realtime")} value={String(o.realtime.sockets)} sub={t("realtimeSub", { online: o.realtime.online, channels: o.realtime.channels })} />
        {x.rps !== null ? <Meter label={t("rps")} value={String(Math.round(x.rps * 10) / 10)} sub={x.status4xx !== null || x.status5xx !== null ? t("statusCodes", { c4: x.status4xx ?? 0, c5: x.status5xx ?? 0 }) : undefined} tone={x.status5xx ? "warn" : "ok"} /> : null}
        {x.latency ? <Meter label={t("latency")} value={(ms(x.latency.p95) || none)} sub={t("latencySub", { p50: (ms(x.latency.p50) || none), p99: (ms(x.latency.p99) || none) })} /> : null}
        {x.network ? <Meter label={t("network")} value={(rate(x.network.rx) || none)} sub={t("networkOut", { tx: (rate(x.network.tx) || none) })} /> : null}
        {x.db ? <Meter label={t("db")} value={x.db.inUse !== null && x.db.size !== null ? `${x.db.inUse} / ${x.db.size}` : none} sub={x.db.slowQueries !== null ? t("slowQueries", { n: x.db.slowQueries }) : undefined} tone={x.db.slowQueries ? "warn" : "ok"} /> : null}
        {x.redis ? <Meter label="Redis" value={status(x.redis.status || "unknown")} sub={x.redis.memory !== null ? bytes(x.redis.memory) : undefined} tone={toneOf(x.redis.status)} /> : null}
        {x.queue ? <Meter label={t("queue")} value={String(x.queue.pending ?? 0)} sub={t("failedJobs", { n: x.queue.failed ?? 0 })} tone={x.queue.failed ? "bad" : "ok"} /> : null}
      </div>

      {x.byRole.length ? (
        <p className="mon-roles">
          <b>{t("byRole")}:</b> {x.byRole.map((r) => `${r.role} ${r.count}`).join(" · ")}
        </p>
      ) : null}
      <div className="mon-split">
        {o.nodes.length ? <Graph nodes={o.nodes} edges={o.edges} onPick={setPicked} /> : <EmptyState icon={<IconBolt />} title={t("noGraph")} size="sm" />}
        <div className="mon-itg">
          <div className="mon-filter">
            <input type="search" value={svcQuery} onChange={(e) => setSvcQuery(e.target.value)} placeholder={t("serviceSearch")} aria-label={t("serviceSearch")} />
            <select value={svcFilter} onChange={(e) => setSvcFilter(e.target.value as "all" | "problems")} aria-label={t("serviceFilter")}>
              <option value="all">{t("filterAll")}</option>
              <option value="problems">{t("filterProblems")}</option>
            </select>
          </div>
          <table>
            <caption className="sr-only">{t("integrations")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("col.name")}</th>
                <th scope="col">{t("col.status")}</th>
                <th scope="col">{t("col.latency")}</th>
              </tr>
            </thead>
            <tbody>
              {shownItg.map((i) => (
                <tr key={i.key} data-on={picked === i.key ? "" : undefined}>
                  <th scope="row">
                    <button type="button" className="mon-link" onClick={() => setPicked(i.key)}>
                      {t.has(`keys.${i.key}`) ? t(`keys.${i.key}`) : i.label || humanizeSlug(i.key)}
                    </button>
                  </th>
                  <td>
                    <span className="mon-chip" data-tone={toneOf(i.status)}>
                      {status(i.status)}
                    </span>
                  </td>
                  <td>{i.latencyMs === null ? none : `${Math.round(i.latencyMs * 10) / 10} ms`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {itg ? <IntegrationDetail key={itg.key} itg={itg} onClose={() => setPicked("")} history={history} edges={o.edges} /> : null}
        </div>
      </div>

      <section className="mon-hist" aria-label={t("history")}>
        <div className="mon-hist__h">
          <b>{t("history")}</b>
          <select
            value={histType}
            onChange={(e) => {
              setHistType(e.target.value as typeof histType);
              setHistOffset(0);
            }}
            aria-label={t("historyType")}
          >
            <option value="all">{t("historyAll")}</option>
            <option value="snapshot">{t("historySnapshots")}</option>
            <option value="incident">{t("historyIncidents")}</option>
          </select>
          <HistoryExport job={exportJob} error={exportErr} onStart={() => void startExport()} onDownload={() => void download()} />
        </div>
        {history ? <Trend items={history.items} label={t("trend")} /> : null}
        {history && history.items.length ? (
          <ol>
            {history.items.map((h) => (
              <li key={h.id} data-type={h.type}>
                <time>{h.at ? shortDateTime(h.at, locale) : none}</time>
                <span>{h.type === "incident" ? h.title || t("incident") : t("snapshotRow", { cpu: (pct(h.cpuPercent) || none), memory: (pct(h.memoryPercent) || none) })}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mon-note">{t("noHistory")}</p>
        )}
        {history && history.total !== null && history.total > HISTORY_PAGE ? (
          <div className="mon-pager">
            <button type="button" className="btn btn--soft btn--sm" onClick={() => setHistOffset((n) => Math.max(0, n - HISTORY_PAGE))} disabled={refreshing || histOffset === 0}>
              {t("prevPage")}
            </button>
            <span>{t("pageOf", { from: histOffset + 1, to: histOffset + history.items.length, total: history.total })}</span>
            <button type="button" className="btn btn--soft btn--sm" onClick={() => setHistOffset((n) => n + HISTORY_PAGE)} disabled={refreshing || !history.hasMore}>
              {t("nextPage")}
            </button>
          </div>
        ) : null}
        {history?.retention.snapshotsDays ? <small className="mon-note">{t("retention", { days: history.retention.snapshotsDays, years: history.retention.incidentsYears ?? 0 })}</small> : null}
      </section>
    </div>
  );
}
