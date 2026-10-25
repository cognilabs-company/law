// Platform monitoring (FRONTEND_STUDIO_TARIFF_PROMOTION_MONITORING_CLEANUP
// §8–§9): the overview, one integration's detail, history, a manual
// snapshot, and the realtime events that patch the overview in place. The
// integration list and the graph come from the backend; nothing here is
// hardcoded beyond reading their shape.

import { ApiError, asArr, asDict, asNum, asStr, http, httpBlobNamed, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";

export type MonStatus = string;
export type MonSystem = {
  cpuPercent: number | null;
  cpuCount: number | null;
  load1: number | null;
  memoryPercent: number | null;
  memoryUsed: number;
  memoryTotal: number;
  diskPercent: number | null;
  diskUsed: number;
  diskTotal: number;
};
export type MonIntegration = {
  key: string;
  label: string;
  status: MonStatus;
  configured: boolean;
  detail: string;
  latencyMs: number | null;
  checkedAt: string;
  // Shown when the backend sends them (TSK-670563).
  uptimePercent: number | null;
  lastSuccessAt: string;
  lastErrorAt: string;
  lastError: string;
  errorCode: string;
  backlog: number | null;
  dependencies: string[];
};
export type MonNode = { id: string; label: string; type: string; status: MonStatus };
export type MonEdge = { id: string; source: string; target: string; status: MonStatus };
export type MonIncident = { id: string; title: string; status: string; severity: string; integration: string; at: string };
// Figures the backend may add (TSK-762684): shown when sent, left out when not.
export type MonExtra = {
  rps: number | null;
  latency: { p50: number | null; p95: number | null; p99: number | null } | null;
  status4xx: number | null;
  status5xx: number | null;
  usersToday: number | null;
  byRole: { role: string; count: number }[];
  network: { rx: number | null; tx: number | null } | null;
  db: { inUse: number | null; size: number | null; slowQueries: number | null } | null;
  redis: { status: string; memory: number | null } | null;
  queue: { pending: number | null; failed: number | null } | null;
};
export type MonOverview = {
  extra: MonExtra;
  from: string;
  to: string;
  system: MonSystem;
  requests: { events: number; errors: number; errorRate: number | null };
  users: { active: number; total: number };
  integrations: MonIntegration[];
  nodes: MonNode[];
  edges: MonEdge[];
  realtime: { sockets: number; online: number; channels: number; events: string[] };
};
export type MonHistoryItem = { id: string; type: "snapshot" | "incident" | "other"; title: string; status: string; at: string; cpuPercent: number | null; memoryPercent: number | null; errors: number | null; integrations: { key: string; status: string; latencyMs: number | null }[] };
export type MonHistory = { items: MonHistoryItem[]; total: number | null; hasMore: boolean; retention: { snapshotsDays: number | null; incidentsYears: number | null } };

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function systemOf(v: unknown): MonSystem {
  const s = asDict(v);
  const cpu = asDict(s.cpu);
  const mem = asDict(s.memory);
  const disk = asDict(s.disk);
  return {
    cpuPercent: num(cpu.load_percent ?? cpu.percent),
    cpuCount: num(cpu.cpu_count),
    load1: num(cpu.load_1m),
    memoryPercent: num(mem.used_percent),
    memoryUsed: asNum(mem.used_bytes),
    memoryTotal: asNum(mem.total_bytes),
    diskPercent: num(disk.used_percent),
    diskUsed: asNum(disk.used_bytes),
    diskTotal: asNum(disk.total_bytes),
  };
}

function integrationOf(v: unknown): MonIntegration {
  const d = asDict(v);
  return {
    key: asStr(d.key ?? d.id),
    label: asStr(d.label ?? d.title),
    status: asStr(d.status).toLowerCase() || "unknown",
    configured: d.configured === true,
    detail: asStr(d.detail ?? d.message),
    latencyMs: num(d.latency_ms),
    checkedAt: asStr(d.checked_at),
    uptimePercent: num(d.uptime_percent ?? d.uptime),
    lastSuccessAt: asStr(d.last_success_at ?? d.last_ok_at),
    lastErrorAt: asStr(d.last_error_at ?? d.last_failure_at),
    lastError: asStr(d.last_error ?? d.last_error_message),
    errorCode: asStr(d.error_code ?? d.last_error_code),
    backlog: num(d.backlog ?? d.queue ?? d.queue_size),
    dependencies: asArr(d.dependencies ?? d.depends_on).map((x) => asStr(typeof x === "object" && x ? asDict(x).key : x)).filter(Boolean),
  };
}

function extraOf(d: Dict): MonExtra {
  const req = asDict(d.requests);
  const users = asDict(d.users);
  const sys = asDict(d.system);
  const lat = asDict(req.latency_ms ?? req.latency);
  const net = asDict(sys.network);
  const db = asDict(d.database ?? sys.database);
  const redis = asDict(d.redis ?? sys.redis);
  const queue = asDict(d.workers ?? d.queue ?? sys.queue);
  const roles = asDict(users.by_role);
  return {
    rps: num(req.rps ?? req.requests_per_second),
    latency: Object.keys(lat).length ? { p50: num(lat.p50), p95: num(lat.p95), p99: num(lat.p99) } : null,
    status4xx: num(req.status_4xx ?? req.client_errors),
    status5xx: num(req.status_5xx ?? req.server_errors),
    usersToday: num(users.today ?? users.daily_active),
    byRole: Object.entries(roles)
      .map(([role, n]) => ({ role, count: Number(n) || 0 }))
      .filter((r) => r.role),
    network: Object.keys(net).length ? { rx: num(net.rx_bytes_per_sec ?? net.rx), tx: num(net.tx_bytes_per_sec ?? net.tx) } : null,
    db: Object.keys(db).length ? { inUse: num(db.pool_in_use ?? db.connections_in_use), size: num(db.pool_size), slowQueries: num(db.slow_queries) } : null,
    redis: Object.keys(redis).length ? { status: asStr(redis.status).toLowerCase(), memory: num(redis.used_memory_bytes ?? redis.used_memory) } : null,
    queue: Object.keys(queue).length ? { pending: num(queue.pending ?? queue.backlog), failed: num(queue.failed ?? queue.failed_jobs) } : null,
  };
}

export function overviewOf(v: unknown): MonOverview {
  const d = asDict(v);
  const req = asDict(d.requests);
  const users = asDict(d.users);
  const graph = asDict(d.graph);
  const rt = asDict(d.realtime);
  return {
    extra: extraOf(d),
    from: asStr(d.from),
    to: asStr(d.to),
    system: systemOf(d.system),
    requests: { events: asNum(req.activity_events ?? req.count), errors: asNum(req.errors), errorRate: num(req.error_rate_percent) },
    users: { active: asNum(users.active), total: asNum(users.total) },
    integrations: asArr(d.integrations).map(integrationOf).filter((i) => i.key),
    nodes: asArr(graph.nodes)
      .map((x) => {
        const n = asDict(x);
        return { id: asStr(n.id), label: asStr(n.label) || asStr(n.id), type: asStr(n.type), status: asStr(n.status).toLowerCase() || "unknown" };
      })
      .filter((n) => n.id),
    edges: asArr(graph.edges)
      .map((x) => {
        const e = asDict(x);
        return { id: asStr(e.id) || `${asStr(e.source)}:${asStr(e.target)}`, source: asStr(e.source), target: asStr(e.target), status: asStr(e.status).toLowerCase() || "unknown" };
      })
      .filter((e) => e.source && e.target),
    realtime: { sockets: asNum(rt.connected_sockets), online: asNum(rt.online_users), channels: asNum(rt.active_channels), events: asArr(rt.events).map((e) => asStr(e)) },
  };
}

function rangeQuery(range: { from?: string; to?: string } = {}): string {
  const q = new URLSearchParams();
  if (range.from) q.set("date_from", range.from);
  if (range.to) q.set("date_to", range.to);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function getMonitoringOverview(range: { from?: string; to?: string } = {}, signal?: AbortSignal): Promise<MonOverview> {
  return overviewOf(await http(`/admin/monitoring/overview${rangeQuery(range)}`, { signal }));
}

// The default answer is briefly cached by the backend; `refresh` asks for
// a live check and is only for an explicit "check now" (2026-10-24 §7).
export async function getMonitoringIntegration(key: string, signal?: AbortSignal, refresh = false): Promise<MonIntegration & { raw: Dict }> {
  const d = asDict(await http(`/admin/monitoring/integrations/${encodeURIComponent(key)}${refresh ? "?refresh=true" : ""}`, { signal }));
  const own = asDict(d.integration ?? d);
  return { ...integrationOf(own), raw: d };
}

function historyItemOf(v: unknown): MonHistoryItem {
  const d = asDict(v);
  const type = asStr(d.type);
  const sys = systemOf(d.system);
  return {
    id: asStr(d.id),
    type: type === "snapshot" || type === "monitoring_snapshot" ? "snapshot" : type === "incident" || type === "monitoring_incident" ? "incident" : "other",
    title: asStr(d.title),
    status: asStr(d.status).toLowerCase(),
    at: asStr(d.captured_at ?? d.created_at ?? d.occurred_at),
    cpuPercent: sys.cpuPercent,
    memoryPercent: sys.memoryPercent,
    errors: num(asDict(d.requests).errors),
    integrations: asArr(d.integrations).map((x) => {
      const i = asDict(x);
      return { key: asStr(i.key), status: asStr(i.status).toLowerCase(), latencyMs: num(i.latency_ms) };
    }),
  };
}

// One page of the history, filtered by type on the server; total, offset
// and has_more are the only paging source.
export async function getMonitoringHistory(
  range: { from?: string; to?: string } = {},
  page: { limit?: number; offset?: number; type?: "snapshot" | "incident" | "" } = {},
  signal?: AbortSignal,
): Promise<MonHistory> {
  const q = new URLSearchParams(rangeQuery(range).slice(1));
  if (page.type) q.set("type", page.type);
  q.set("limit", String(page.limit ?? 50));
  q.set("offset", String(page.offset ?? 0));
  const d = asDict(await http(`/admin/monitoring/history?${q}`, { signal }));
  const ret = asDict(d.retention);
  return {
    items: asArr(d.items).map(historyItemOf).filter((i) => i.id),
    total: num(d.total),
    hasMore: d.has_more === true,
    retention: { snapshotsDays: num(ret.snapshots_days), incidentsYears: num(ret.incidents_years) },
  };
}

// Excel export of the history as a background job: create it, follow its
// status (or the monitoring.export_completed event), then download.
export type MonExport = { id: string; status: "queued" | "running" | "completed" | "failed" | string; progress: number; rows: number; error: string; downloadUrl: string };
const exportOf = (v: unknown): MonExport => {
  const d = asDict(v);
  return { id: asStr(d.id), status: asStr(d.status), progress: num(d.progress_percent) ?? 0, rows: num(d.rows_count) ?? 0, error: asStr(d.error), downloadUrl: asStr(d.download_url) };
};
export async function startMonitoringExport(range: { from?: string; to?: string }, type: "snapshot" | "incident" | ""): Promise<MonExport> {
  const body: Dict = {};
  if (range.from) body.date_from = range.from;
  if (range.to) body.date_to = range.to;
  if (type) body.type = type;
  return exportOf(await http("/admin/monitoring/history/exports", { method: "POST", body: JSON.stringify(body) }));
}
export async function getMonitoringExport(id: string, signal?: AbortSignal): Promise<MonExport> {
  return exportOf(await http(`/admin/monitoring/history/exports/${encodeURIComponent(id)}`, { signal }));
}
export async function downloadMonitoringExport(job: MonExport): Promise<void> {
  const path = job.downloadUrl.replace(/^https?:\/\/[^/]+/i, "") || `/admin/monitoring/history/exports/${encodeURIComponent(job.id)}/download`;
  const { blob, name } = await httpBlobNamed(path);
  saveBlob(blob, name || `monitoring-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// A manual snapshot. 409 monitoring_collection_in_progress means another
// instance is collecting right now: keep what is shown and try later.
export async function captureMonitoringSnapshot(): Promise<"captured" | "busy"> {
  try {
    await http("/admin/monitoring/snapshots", { method: "POST", body: "{}" });
    return "captured";
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return "busy";
    throw e;
  }
}

export const MONITORING_EVENTS = ["monitoring.metrics", "monitoring.integration_changed", "monitoring.incident"] as const;

// A realtime event applied to the overview shown: metrics replace the
// figures they carry, an integration change updates that integration and
// its graph node, an incident is returned for the persistent alert.
export function applyMonitoringEvent(o: MonOverview, ev: Dict): { overview: MonOverview; incident: MonIncident | null; healthy: boolean } {
  const name = asStr(ev.event);
  const data = asDict(ev.data ?? ev.payload ?? ev);
  if (name === "monitoring.metrics") {
    const next = { ...o };
    if (data.system) next.system = systemOf(data.system);
    if (data.requests) {
      const r = asDict(data.requests);
      next.requests = { events: asNum(r.activity_events ?? r.count), errors: asNum(r.errors), errorRate: num(r.error_rate_percent) };
    }
    if (data.users) next.users = { active: asNum(asDict(data.users).active), total: asNum(asDict(data.users).total) || o.users.total };
    // Extra figures: what the event carries replaces, the rest is kept.
    const fresh = extraOf(data);
    const kept = { ...o.extra } as MonExtra;
    for (const k of Object.keys(fresh) as (keyof MonExtra)[]) {
      const v = fresh[k];
      if (v !== null && !(Array.isArray(v) && !v.length)) (kept as Record<string, unknown>)[k] = v;
    }
    next.extra = kept;
    if (data.realtime) {
      const rt = asDict(data.realtime);
      next.realtime = { ...o.realtime, sockets: asNum(rt.connected_sockets, o.realtime.sockets), online: asNum(rt.online_users, o.realtime.online), channels: asNum(rt.active_channels, o.realtime.channels) };
    }
    return { overview: next, incident: null, healthy: true };
  }
  if (name === "monitoring.integration_changed") {
    const changed = integrationOf(data.integration ?? data);
    if (!changed.key) return { overview: o, incident: null, healthy: false };
    const known = o.integrations.some((i) => i.key === changed.key);
    const integrations = known ? o.integrations.map((i) => (i.key === changed.key ? { ...i, ...changed, label: changed.label || i.label } : i)) : [...o.integrations, changed];
    const nodes = o.nodes.map((n) => (n.id === changed.key ? { ...n, status: changed.status } : n));
    const edges = o.edges.map((e) => (e.target === changed.key || e.source === changed.key ? { ...e, status: changed.status } : e));
    return { overview: { ...o, integrations, nodes, edges }, incident: null, healthy: false };
  }
  if (name === "monitoring.incident") {
    const i = asDict(data.incident ?? data);
    return {
      overview: o,
      incident: { id: asStr(i.id) || String(Date.now()), title: asStr(i.title ?? i.message), status: asStr(i.status), severity: asStr(i.severity).toLowerCase(), integration: asStr(i.integration ?? i.integration_key), at: asStr(i.occurred_at ?? i.created_at) },
      healthy: false,
    };
  }
  return { overview: o, incident: null, healthy: false };
}
