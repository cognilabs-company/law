"use client";

import "./monitoring.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconAlert, IconBolt, IconCheck, IconClose, IconLock, IconRefresh } from "@/components/icons";
import { isAborted, isForbidden, logApiError } from "@/lib/http";
import { shortDateTime, timeOnly } from "@/lib/date";
import { humanizeSlug } from "@/lib/lawyers";
import { onUserSocketResync, subscribeUserEvents, subscribeUserSocketState, userSocketState } from "@/lib/userSocket";
import {
  MONITORING_EVENTS,
  applyMonitoringEvent,
  captureMonitoringSnapshot,
  getMonitoringHistory,
  getMonitoringIntegration,
  getMonitoringOverview,
  type MonHistory,
  type MonIncident,
  type MonIntegration,
  type MonNode,
  type MonOverview,
} from "@/lib/services/monitoring";

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

const RANGES = ["15m", "1h", "24h", "7d"] as const;
type Range = (typeof RANGES)[number];
const RANGE_MS: Record<Range, number> = { "15m": 15 * 60_000, "1h": 3_600_000, "24h": 86_400_000, "7d": 7 * 86_400_000 };

const GB = 1024 ** 3;
const bytes = (n: number) => (n >= GB ? `${(n / GB).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 10) / 10}%`);

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

const loadTone = (p: number | null): Tone => (p === null ? "off" : p >= 90 ? "bad" : p >= 75 ? "warn" : "ok");

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

function IntegrationDetail({ itg, onClose }: { itg: MonIntegration; onClose: () => void }): ReactElement {
  const t = useTranslations("admin.monitoring");
  const locale = useLocale();
  const status = useStatusLabel();
  const [live, setLive] = useState<MonIntegration | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    getMonitoringIntegration(itg.key, ctl.signal).then(
      (d) => setLive(d),
      (e: unknown) => {
        if (isAborted(e)) return;
        logApiError("monitoring.integration", e);
        setFailed(true);
      },
    );
    return () => ctl.abort();
  }, [itg.key]);
  const d = live ?? itg;
  const name = t.has(`keys.${d.key}`) ? t(`keys.${d.key}`) : d.label || humanizeSlug(d.key);
  return (
    <section className="mon-detail" aria-label={name} data-ai-target="monitoring:integration-detail">
      <header>
        <b>{name}</b>
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
          <dd>{d.latencyMs === null ? "—" : `${Math.round(d.latencyMs * 10) / 10} ms`}</dd>
        </div>
        <div>
          <dt>{t("col.checked")}</dt>
          <dd>{d.checkedAt ? shortDateTime(d.checkedAt, locale) : "—"}</dd>
        </div>
      </dl>
      {d.detail ? <p className="mon-detail__msg">{d.detail}</p> : null}
      {failed ? <p className="mon-detail__msg">{t("detailFailed")}</p> : null}
    </section>
  );
}

export default function MonitoringPage(): ReactElement {
  const t = useTranslations("admin.monitoring");
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
  const seq = useRef(0);

  const reload = useCallback(
    async (quiet = false) => {
      const my = ++seq.current;
      if (quiet) setRefreshing(true);
      const to = new Date();
      const win = { from: new Date(to.getTime() - RANGE_MS[range]).toISOString(), to: to.toISOString() };
      try {
        const [data, hist] = await Promise.all([getMonitoringOverview(win), getMonitoringHistory(win, 20).catch(() => null)]);
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
    [range],
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
  const itg = o.integrations.find((i) => i.key === picked) ?? null;
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
          <button type="button" className="btn btn--line btn--sm" onClick={() => void reload(true)} disabled={refreshing}>
            <IconRefresh aria-hidden="true" />
            {refreshing ? t("refreshing") : t("refresh")}
          </button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => void snapshot()} disabled={snap === "running"}>
            {snap === "running" ? t("snapRunning") : t("snapshot")}
          </button>
        </div>
      </div>
      <p className="mon-at">{t("updatedAt", { time: timeOnly(new Date(load.at).toISOString(), locale) })}</p>
      {snap === "busy" ? <p className="mon-note" role="status">{t("snapBusy")}</p> : snap === "captured" ? <p className="mon-note" role="status">{t("snapDone")}</p> : snap === "failed" ? <p className="mon-note" data-tone="bad" role="alert">{t("snapFailed")}</p> : null}

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
        <Meter label={t("cpu")} value={pct(o.system.cpuPercent)} sub={o.system.cpuCount ? t("cores", { n: o.system.cpuCount }) : undefined} tone={loadTone(o.system.cpuPercent)} />
        <Meter label={t("memory")} value={pct(o.system.memoryPercent)} sub={o.system.memoryTotal ? `${bytes(o.system.memoryUsed)} / ${bytes(o.system.memoryTotal)}` : undefined} tone={loadTone(o.system.memoryPercent)} />
        <Meter label={t("disk")} value={pct(o.system.diskPercent)} sub={o.system.diskTotal ? `${bytes(o.system.diskUsed)} / ${bytes(o.system.diskTotal)}` : undefined} tone={loadTone(o.system.diskPercent)} />
        <Meter label={t("requests")} value={String(o.requests.events)} sub={t("errors", { n: o.requests.errors, rate: pct(o.requests.errorRate) })} tone={o.requests.errors > 0 ? "warn" : "ok"} />
        <Meter label={t("users")} value={String(o.users.active)} sub={t("usersTotal", { n: o.users.total })} />
        <Meter label={t("realtime")} value={String(o.realtime.sockets)} sub={t("realtimeSub", { online: o.realtime.online, channels: o.realtime.channels })} />
      </div>

      <div className="mon-split">
        {o.nodes.length ? <Graph nodes={o.nodes} edges={o.edges} onPick={setPicked} /> : <EmptyState icon={<IconBolt />} title={t("noGraph")} size="sm" />}
        <div className="mon-itg">
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
              {o.integrations.map((i) => (
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
                  <td>{i.latencyMs === null ? "—" : `${Math.round(i.latencyMs * 10) / 10} ms`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {itg ? <IntegrationDetail key={itg.key} itg={itg} onClose={() => setPicked("")} /> : null}
        </div>
      </div>

      <section className="mon-hist" aria-label={t("history")}>
        <b>{t("history")}</b>
        {history && history.items.length ? (
          <ol>
            {history.items.map((h) => (
              <li key={h.id} data-type={h.type}>
                <time>{h.at ? shortDateTime(h.at, locale) : "—"}</time>
                <span>{h.type === "incident" ? h.title || t("incident") : t("snapshotRow", { cpu: pct(h.cpuPercent), memory: pct(h.memoryPercent) })}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mon-note">{t("noHistory")}</p>
        )}
        {history?.retention.snapshotsDays ? <small className="mon-note">{t("retention", { days: history.retention.snapshotsDays, years: history.retention.incidentsYears ?? 0 })}</small> : null}
      </section>
    </div>
  );
}
