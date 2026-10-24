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
    "/admin/monitoring/history": { items: [{ id: "h1", type: "incident", title: "Database slow", status: "resolved", captured_at: "2026-10-24T04:00:00Z" }], count: 1, retention: { snapshots_days: 365, incidents_years: 3 } },
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

test("extra figures show when sent; thresholds and the service filter work", async ({ page }) => {
  const rich = {
    ...overview("down", 70),
    requests: { activity_events: 900, errors: 2, error_rate_percent: 0.2, rps: 12.5, latency_ms: { p50: 40, p95: 180, p99: 420 }, status_4xx: 7, status_5xx: 2 },
    users: { active: 30, total: 283, today: 120, by_role: { client: 90, advokat: 20, yurist: 10 } },
    workers: { pending: 4, failed: 1 },
  };
  const routes = await signIn(page, ADMIN, { "/admin/monitoring/overview": () => rich, "/admin/monitoring/history": { items: [] } });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/monitoring");
  await expect(page.getByText("Задержка p95")).toBeVisible();
  await expect(page.getByText("180 ms")).toBeVisible();
  await expect(page.getByText("4xx: 7 · 5xx: 2")).toBeVisible();
  await expect(page.getByText("Сегодня: 120 · Всего: 283")).toBeVisible();
  await expect(page.getByText("С ошибкой: 1")).toBeVisible();
  await expect(page.getByText(/client 90 · advokat 20/)).toBeVisible();
  await expect(page.getByText("Превышен порог")).toHaveCount(0);
  // Lower the CPU threshold below 70%: the alert appears.
  await page.getByRole("button", { name: "Пороги" }).click();
  await page.getByRole("spinbutton", { name: "Процессор" }).fill("60");
  await expect(page.getByRole("alert").filter({ hasText: "Превышен порог" })).toContainText("Процессор");
  // Only services with problems.
  await page.getByRole("combobox", { name: "Состояние сервиса" }).selectOption("problems");
  await expect(page.getByRole("button", { name: "База данных", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Acme SMS", exact: true })).toHaveCount(0);
});

test("history: server type filter, paging, custom dates and an Excel export job", async ({ page }) => {
  const hist = (url: URL) => {
    const type = url.searchParams.get("type") ?? "";
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const total = type === "incident" ? 3 : 45;
    const n = Math.max(0, Math.min(limit, total - offset));
    const items = Array.from({ length: n }, (_, k) => {
      const i = offset + k;
      return type === "incident"
        ? { id: `i${i}`, type: "incident", title: `Incident ${i}`, created_at: "2026-10-24T08:00:00Z" }
        : { id: `s${i}`, type: "snapshot", system: { cpu: { load_percent: 10 + (i % 50) }, memory: { used_percent: 50 } }, captured_at: "2026-10-24T08:30:00Z" };
    });
    return { items, total, count: n, limit, offset, has_more: offset + n < total, retention: { snapshots_days: 30, incidents_years: 3 } };
  };
  let polls = 0;
  const routes = await signIn(page, ADMIN, {
    "/admin/monitoring/overview": () => overview(),
    "/admin/monitoring/history": (_b: unknown, url: URL) => hist(url),
    "POST /admin/monitoring/history/exports": { status: 202, json: { id: "job-1", status: "queued", progress_percent: 0, rows_count: 0 } },
    "/admin/monitoring/history/exports/job-1": () => (++polls > 1 ? { id: "job-1", status: "completed", progress_percent: 100, rows_count: 45, download_url: "/admin/monitoring/history/exports/job-1/download" } : { id: "job-1", status: "running", progress_percent: 40 }),
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/admin/monitoring");
  await expect(page.getByText("1–20 из 45")).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByText("21–40 из 45")).toBeVisible();
  await page.getByRole("combobox", { name: "Тип записей" }).selectOption("incident");
  await expect(page.locator(".mon-hist li")).toHaveCount(3);
  expect(mock.calls.some((c) => c.path === "/admin/monitoring/history" && c.method === "GET")).toBe(true);
  await page.getByRole("button", { name: "Экспорт в Excel" }).click();
  await expect(page.getByRole("button", { name: "Скачать Excel (45 строк)" })).toBeVisible({ timeout: 15_000 });
  expect(mock.calls.find((c) => c.method === "POST" && c.path === "/admin/monitoring/history/exports")?.body).toMatchObject({ type: "incident" });
  await page.getByRole("combobox", { name: "Период" }).selectOption("custom");
  await page.locator('input[aria-label="Дата начала"]').fill("2026-10-01");
  await page.locator('input[aria-label="Дата окончания"]').fill("2026-10-20");
});

test("an integration's detail shows its own history and dependencies", async ({ page }) => {
  const snap = (i: number, st: string) => ({ id: `s${i}`, type: "snapshot", captured_at: `2026-10-24T0${i}:00:00Z`, integrations: [{ key: "database", status: st, latency_ms: 1 + i }] });
  const routes = await signIn(page, ADMIN, {
    "/admin/monitoring/overview": () => overview(),
    "/admin/monitoring/history": { items: [snap(1, "healthy"), snap(2, "down"), snap(3, "healthy"), snap(4, "healthy")], retention: {} },
    "/admin/monitoring/integrations/database": { key: "database", status: "healthy", configured: true, latency_ms: 0.5, last_error: "timeout", error_code: "DB_TIMEOUT", last_error_at: "2026-10-24T02:00:00Z" },
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/monitoring");
  await page.getByRole("button", { name: "База данных", exact: true }).click();
  const detail = page.locator(".mon-detail");
  await expect(detail).toContainText("75% (по последним 4 снимкам)");
  await expect(detail).toContainText("(DB_TIMEOUT)");
  await expect(detail).toContainText("LexGo API");
  await expect(detail.locator(".mon-detail__hist li")).toHaveCount(4);
});
