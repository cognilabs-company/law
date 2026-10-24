import { describe, expect, it } from "vitest";
import { applyMonitoringEvent, overviewOf } from "@/lib/services/monitoring";

const base = overviewOf({
  system: { cpu: { load_percent: 10, cpu_count: 2 }, memory: { used_percent: 50 }, disk: { used_percent: 70 } },
  requests: { activity_events: 4, errors: 0, error_rate_percent: 0 },
  users: { active: 2, total: 283 },
  integrations: [{ key: "database", status: "healthy", configured: true, latency_ms: 0.5 }],
  graph: { nodes: [{ id: "api", type: "core", status: "healthy" }, { id: "database", type: "integration", status: "healthy" }], edges: [{ source: "api", target: "database", status: "healthy" }] },
  realtime: { connected_sockets: 6, online_users: 2, active_channels: 3, events: ["monitoring.metrics"] },
});

describe("monitoring overview", () => {
  it("reads the backend's shape", () => {
    expect(base.system).toMatchObject({ cpuPercent: 10, cpuCount: 2, memoryPercent: 50, diskPercent: 70 });
    expect(base.nodes.map((n) => n.id)).toEqual(["api", "database"]);
    expect(base.edges[0]).toMatchObject({ id: "api:database", status: "healthy" });
  });

  it("patches metrics in place", () => {
    const r = applyMonitoringEvent(base, { event: "monitoring.metrics", system: { cpu: { load_percent: 80 }, memory: { used_percent: 60 }, disk: { used_percent: 71 } }, users: { active: 9 } });
    expect(r.overview.system.cpuPercent).toBe(80);
    expect(r.overview.users).toEqual({ active: 9, total: 283 });
    expect(r.overview.integrations).toBe(base.integrations);
  });

  it("moves an integration, its node and its edges together", () => {
    const r = applyMonitoringEvent(base, { event: "monitoring.integration_changed", integration: { key: "database", status: "down" } });
    expect(r.overview.integrations[0].status).toBe("down");
    expect(r.overview.nodes.find((n) => n.id === "database")?.status).toBe("down");
    expect(r.overview.edges[0].status).toBe("down");
  });

  it("adds an integration it did not know", () => {
    const r = applyMonitoringEvent(base, { event: "monitoring.integration_changed", integration: { key: "acme", status: "configured" } });
    expect(r.overview.integrations.map((i) => i.key)).toEqual(["database", "acme"]);
  });

  it("returns an incident for the alert", () => {
    const r = applyMonitoringEvent(base, { event: "monitoring.incident", incident: { id: "i1", title: "DB down", integration: "database" } });
    expect(r.incident).toMatchObject({ id: "i1", title: "DB down", integration: "database" });
    expect(r.overview).toBe(base);
  });
});
