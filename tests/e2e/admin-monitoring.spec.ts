import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

// Monitoring (contract §8–§9): the map and list come from the backend,
// realtime events patch the page without polling, an incident stays until
// acknowledged, a busy collector is not an error, and a reconnect reloads
// the overview once.
const overview = (dbStatus = "healthy", cpu = 12.5) => ({
  from: "2026-10-24T05:00:00Z",
  to: "2026-10-24T05:15:00Z",
  system: { cpu: { load_percent: cpu, cpu_count: 2 }, memory: { used_percent: 55, used_bytes: 2.2e9, total_bytes: 4e9 }, disk: { used_percent: 80, used_bytes: 32e9, total_bytes: 40e9 } },
  requests: { activity_events: 40, errors: 1, error_rate_percent: 2.5 },
  users: { active: 3, total: 283 },
  integrations: [
    { key: "database", configured: true, status: dbStatus, latency_ms: 0.5, checked_at: "2026-10-24T05:15:00Z" },
    { key: "payme", configured: false, status: "disabled", latency_ms: null, checked_at: "2026-10-24T05:15:00Z" },
    { key: "acme_sms", label: "Acme SMS", configured: true, status: "configured", latency_ms: null },
  ],
  graph: {
    nodes: [
      { id: "api", label: "LexGo API", type: "core", status: "healthy" },
      { id: "database", label: "Database", type: "integration", status: dbStatus },
      { id: "payme", label: "Payme", type: "integration", status: "disabled" },
      { id: "acme_sms", label: "Acme SMS", type: "integration", status: "configured" },
    ],
    edges: [
      { id: "api:database", source: "api", target: "database", status: dbStatus },
      { id: "api:payme", source: "api", target: "payme", status: "disabled" },
      { id: "api:acme_sms", source: "api", target: "acme_sms", status: "configured" },
    ],
  },
  realtime: { connected_sockets: 7, online_users: 4, active_channels: 5, ws_url: "/ws/users/me", events: ["monitoring.metrics", "monitoring.integration_changed", "monitoring.incident"] },
});

test("monitoring renders backend data and follows realtime events", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/admin/monitoring/overview": () => overview(),
    "/admin/monitoring/history": { items: [{ id: "h1", type: "monitoring_incident", title: "Database slow", status: "resolved", captured_at: "2026-10-24T04:00:00Z" }], count: 1, retention: { snapshots_days: 365, incidents_years: 3 } },
    "POST /admin/monitoring/snapshots": { status: 409, json: { detail: { code: "monitoring_collection_in_progress" } } },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/admin/monitoring");
  await expect(page.locator(".mon .mon-cards")).toBeVisible();
  // An integration the frontend has never heard of still shows, from the backend.
  await expect(page.getByRole("button", { name: "Acme SMS" }).first()).toBeVisible();
  // Status colours always come with words.
  await expect(page.getByRole("button", { name: "База данных: Работает" })).toBeVisible();
  await expect(page.getByText("12.5%")).toBeVisible();
  await expect(page.getByText("Database slow")).toBeVisible();
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  const loads = () => mock.count("GET", /^\/admin\/monitoring\/overview$/);
  const before = loads();

  await mock.push({ event: "monitoring.metrics", system: { cpu: { load_percent: 71.2, cpu_count: 2 }, memory: { used_percent: 60 }, disk: { used_percent: 80 } } });
  await expect(page.getByText("71.2%")).toBeVisible();
  await mock.push({ event: "monitoring.integration_changed", integration: { key: "database", status: "down", configured: true } });
  await expect(page.getByRole("button", { name: "База данных: Не работает" })).toBeVisible();
  await mock.push({ event: "monitoring.incident", incident: { id: "inc-1", title: "Database is down", integration: "database", severity: "critical" } });
  await expect(page.getByRole("alert").filter({ hasText: "Database is down" })).toBeVisible();
  // No polling: the events patched the page in place.
  expect(loads()).toBe(before);
  await page.getByRole("button", { name: "Просмотрено" }).click();
  await expect(page.getByText("Database is down")).toHaveCount(0);

  // Another instance is collecting: keep the data, say so.
  await page.getByRole("button", { name: "Сделать снимок" }).click();
  await expect(page.getByText("Сейчас данные собирает другой сервер")).toBeVisible();
  await expect(page.getByText("71.2%")).toBeVisible();

  // A reconnect reloads the overview once.
  await mock.drop();
  await expect.poll(loads, { timeout: 15_000 }).toBe(before + 1);
  await page.waitForTimeout(1500);
  expect(loads()).toBe(before + 1);
});

test("monitoring without permission says so", async ({ page }) => {
  const routes = await signIn(page, ADMIN, { "/admin/monitoring/overview": { status: 403, json: { detail: "Ruxsat yo'q" } } });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/monitoring");
  await expect(page.getByText("Нет доступа")).toBeVisible();
});
