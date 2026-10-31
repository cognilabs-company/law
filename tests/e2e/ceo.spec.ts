import { expect, test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

// Screenshot runs only: CEO_SHOTS=<dir> saves 1440 and 390, light and dark.
const SHOTS = process.env.CEO_SHOTS;
async function shots(page: Page, name: string) {
  if (!SHOTS) return;
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width > 400 ? 1000 : 860 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/${name}-${width}-${scheme}.png` });
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 900 });
}

// TSK-328538: the CEO page — the backend's KPIs (MAU, DAU, GMV, MRR, ARR,
// ARPU, take rate, churn, renewal, refunds) for all time or a chosen period
// picked with the handmade DatePicker, and the same period as Excel.
const ceo = (from = "", to = "") => ({
  period: from ? { date_from: from, date_to: to, timezone: "Asia/Tashkent" } : { date_from: "2026-01-01", date_to: "2026-10-30", timezone: "Asia/Tashkent" },
  revenue: 6788189, period_revenue: 6788189, all_time_revenue: 26986633, revenue_delta_pct: 0, users: 283, active_users: 19, orders_created: 33, orders_paid: 15, conversion_pct: 45.5,
  funnel: [{ stage: "leads", value: 26 }, { stage: "orders", value: 33 }, { stage: "paid", value: 15 }],
  channels: [{ source: "client", leads: 0, payments: 13, revenue: 3525691, conversion_pct: 0 }],
  revenue_trend: [{ date: "2026-10-29", revenue: 120000, payments: 1 }],
  mau: 19, dau: 3, gmv: 6788189, mrr: 1600500, arr: 19206000, active_subscriptions: 13, new_subscriptions: 4, cancelled_subscriptions: 2, renewed_subscriptions: 5,
  renewal_rate_percent: 71.4, churn_rate_percent: 13.3, refunded_amount: 120000, refund_rate_percent: 1.8, arpu: 678818.9, take_rate: 18.0,
  cac: { status: "not_available", total: null, client: null, advocate: null }, ltv: 8145826, ltv_cac: null, payback_months: null,
  nps_client: { status: "not_available", value: null }, nps_advocate: { status: "not_available", value: null },
  new_clients: 2, new_advocates: 1, new_lawyers: 0, paid_payments: 23,
  gift_kpis: { gift_purchases: 0, gift_activation_rate: 0, recipient_conversion: 0, gift_to_paid_conversion: 0, average_gift_value: 0, referral_rate: 0, gift_cac: 0, gift_ltv: 0 },
});

test("the CEO page shows renewal, churn and refunds, filters a period and exports it", async ({ page }) => {
  const asked: string[] = [];
  const routes = await signIn(page, ADMIN, {
    "/analytics/ceo": (_b: unknown, url: URL) => (asked.push(url.search), ceo(url.searchParams.get("date_from") ?? "", url.searchParams.get("date_to") ?? "")),
  } as never);
  await mockBackend(page, routes);
  let exported = "";
  await page.route(/\/analytics\/ceo\/export\.xlsx/, (route) => {
    exported = new URL(route.request().url()).search;
    return route.fulfill({ status: 200, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: "PK" });
  });
  await page.goto("/ru/admin/ceo");
  const sheet = page.locator(".ceo-sheet");
  await expect(sheet).toContainText("Продление подписок", { timeout: 20000 });
  await expect(sheet).toContainText("71,4");
  await expect(sheet).toContainText("Отток (churn)");
  await expect(sheet).toContainText("13,3");
  await expect(sheet).toContainText("Возвраты");
  await expect(sheet).toContainText("1 600 500");
  // A period with the handmade DatePicker reaches the backend.
  await page.getByRole("combobox", { name: "Дата начала" }).fill("01.10.2026");
  await page.getByRole("combobox", { name: "Дата начала" }).press("Tab");
  await page.getByRole("combobox", { name: "Дата окончания" }).fill("20.10.2026");
  await page.getByRole("combobox", { name: "Дата окончания" }).press("Tab");
  await expect.poll(() => asked.some((q) => q.includes("date_from=2026-10-01") && q.includes("date_to=2026-10-20"))).toBe(true);
  // Every request names the time zone the days are counted in (§5.5).
  expect(asked.every((q) => new URLSearchParams(q).get("timezone"))).toBe(true);
  await expect(sheet.locator(".ceo-head__meta")).toContainText("2026");
  // The same period as Excel, from the actions menu.
  await page.locator(".ceo-act").getByRole("button").first().click();
  await page.getByRole("menuitem", { name: "Скачать Excel" }).click();
  await expect.poll(() => exported).toContain("date_from=2026-10-01");
  expect(exported).toContain("date_to=2026-10-20");
  await expect(page.locator("main select, main input[type=date]")).toHaveCount(0);
});

// Every KPI the backend sends, as sent; what it can't measure yet says so;
// service quality (rating, answer on time, complaints) from the quality
// overview, marked as all time because it has no period filter.
test("the CEO page shows every KPI and the service quality", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/analytics/ceo": ceo(),
    "/quality/overview": { avg_rating: 4.6, response_sla_pct: 92.5, complaint_rate: 3.1, resolved_pct: 80, flagged: [] },
  } as never);
  await mockBackend(page, routes);
  await page.goto("/ru/admin/ceo");
  const sheet = page.locator(".ceo-sheet");
  await expect(sheet).toContainText("GMV (объём)", { timeout: 20000 });
  const n = (v: string) => new RegExp(v.replace(/ /g, "[\\s\\u00a0\\u202f]"));
  for (const [label, value] of [
    ["GMV (объём)", "6 788 189"],
    ["MRR (месячная выручка)", "1 600 500"],
    ["ARR (годовая выручка)", "19 206 000"],
    ["LTV (жизненная ценность)", "8 145 826"],
  ] as const) {
    await expect(sheet).toContainText(label);
    await expect(sheet).toContainText(n(value));
  }
  await expect(sheet).toContainText("Доля комиссии");
  await expect(sheet).toContainText("Расходы на маркетинг не внесены, поэтому посчитать нельзя.");
  await expect(sheet).toContainText("ARPU (на активного подписчика)");
  await expect(sheet).toContainText("CAC (стоимость привлечения)");
  await expect(sheet).toContainText("Срок окупаемости");
  await expect(sheet).toContainText("MAU");
  await expect(sheet).toContainText("DAU");
  await expect(sheet).toContainText("NPS");
  // Service quality, all time.
  await expect(sheet).toContainText("Средняя оценка");
  await expect(sheet).toContainText("4,6");
  await expect(sheet).toContainText("Ответ вовремя");
  await expect(sheet).toContainText("92,5");
  await expect(sheet).toContainText("Доля жалоб");
  await expect(sheet).toContainText("Решено 80");
  await expect(sheet).toContainText("За всё время");
  expect(await sheet.innerText()).not.toMatch(/not_available|null|undefined|NaN/);
});

// 2026-10-31 §5.5: the Excel is built inside the request (no background
// job), so the page shows it is busy until the file arrives, sends it once,
// and polls nothing.
test("the CEO export shows a busy state until the synchronous file arrives", async ({ page }) => {
  const routes = await signIn(page, ADMIN, { "/analytics/ceo": ceo() } as never);
  const mock = await mockBackend(page, routes);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  let exports = 0;
  await page.route(/\/analytics\/ceo\/export\.xlsx/, async (route) => {
    exports += 1;
    await gate;
    return route.fulfill({ status: 200, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: "PK" });
  });
  await page.goto("/ru/admin/ceo");
  const sheet = page.locator(".ceo-sheet");
  await expect(sheet).toContainText("Продление подписок", { timeout: 20000 });
  await expect(sheet.locator(".ceo-head__meta")).toContainText("Часовой пояс GMT");
  await page.locator(".ceo-act").getByRole("button").first().click();
  await page.getByRole("menuitem", { name: "Скачать Excel" }).click();
  const busy = page.locator(".ceo-exporting");
  await expect(busy).toBeVisible();
  await expect(busy).toHaveAttribute("role", "status");
  await expect(busy).toContainText("Готовим файл Excel");
  // A second try while it builds is refused: the item is disabled.
  await page.locator(".ceo-act").getByRole("button").first().click();
  await expect(page.getByRole("menuitem", { name: "Готовим…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await busy.scrollIntoViewIfNeeded();
  await shots(page, "ceo-export-busy");
  release();
  await expect(busy).toHaveCount(0);
  await expect(page.locator(".ntf__t", { hasText: "Файл Excel скачан." })).toBeVisible();
  expect(exports).toBe(1);
  // No job polling: nothing but the dashboard and the one file.
  expect(mock.calls.filter((c) => /export|jobs?\//.test(c.path) && !c.path.endsWith("export.xlsx"))).toEqual([]);
});

// §2.4: there is no canonical test-data flag yet, so a channel is never
// guessed to be "test" from its name; figures are shown as the backend sends them.
test("CEO channels are shown as sent, with no guessed test data", async ({ page }) => {
  const data = { ...ceo(), channels: [{ source: "client", leads: 3, payments: 13, revenue: 3525691, conversion_pct: 0 }, { source: "demo_test", leads: 0, payments: 2, revenue: 50000, conversion_pct: 0 }] };
  const routes = await signIn(page, ADMIN, { "/analytics/ceo": data } as never);
  await mockBackend(page, routes);
  await page.goto("/ru/admin/ceo");
  const sheet = page.locator(".ceo-sheet");
  await expect(sheet).toContainText("Продление подписок", { timeout: 20000 });
  await expect(page.getByRole("switch", { name: "Показать тестовые каналы" })).toHaveCount(0);
  await expect(sheet).not.toContainText("Тестовые и демо-платежи не учтены");
  await expect(sheet).not.toContainText("с учётом тест/демо");
  await expect(sheet.locator(".ceo-kpis")).toContainText(/6[\s\u00a0\u202f,.]*8/);
  await shots(page, "ceo");
});

// Owner decision 2026-10-31: no demo mode on the CEO page. An empty report
// is said in words, with no invented figures, no "Demo" switch and no demo
// badges — even when another page left the shared demo switch on.
const EMPTY_CEO = {
  period: { date_from: "2026-01-01", date_to: "2026-10-30", timezone: "Asia/Tashkent" },
  revenue: 0, users: 0, active_users: 0, conversion_pct: 0, revenue_delta_pct: 0,
  funnel: [{ stage: "leads", value: 0 }, { stage: "orders", value: 0 }, { stage: "paid", value: 0 }],
  channels: [], revenue_trend: [], mau: 0, dau: 0, gmv: 0, mrr: 0, arr: 0, paid_payments: 0,
  gift_kpis: { gift_purchases: 0, gift_activation_rate: 0, recipient_conversion: 0, gift_to_paid_conversion: 0, average_gift_value: 0, referral_rate: 0, gift_cac: 0, gift_ltv: 0 },
};

test("an empty CEO report says there is no data yet, with no demo figures or demo switch", async ({ page }) => {
  const asked: string[] = [];
  const routes = await signIn(page, ADMIN, {
    "/analytics/ceo": (_b: unknown, url: URL) => (asked.push(url.search), EMPTY_CEO),
    "/quality/overview": { avg_rating: 4.6, response_sla_pct: 92.5, complaint_rate: 3.1, resolved_pct: 80, flagged: [] },
  } as never);
  await mockBackend(page, routes);
  // The admin overview's demo switch, left on, must not reach this page.
  await page.addInitScript(() => localStorage.setItem("lexgo_demo_stats", "1"));
  await page.goto("/ru/admin/ceo");
  const sheet = page.locator(".ceo-sheet");
  const none = sheet.locator(".ceo-none");
  await expect(none).toBeVisible({ timeout: 20000 });
  await expect(none).toContainText("Данных пока нет");
  await expect(none).toContainText("как только LexGo запишет первую заявку или оплату");
  // No invented figures and no report sections, no demo marks anywhere.
  await expect(sheet.locator(".ceo-kpis, .ceo-sec, .ceo-jump")).toHaveCount(0);
  await expect(page.getByText(/демо/i)).toHaveCount(0);
  expect(await sheet.innerText()).not.toMatch(/\d[\d\s  ]*\s?сум|млн|NaN|undefined/);
  // The period pickers stay, so another period can be tried.
  await expect(page.getByRole("combobox", { name: "Дата начала" })).toBeVisible();
  // The actions menu has no demo switch, and nothing to export.
  await page.locator(".ceo-act").getByRole("button").first().click();
  await expect(page.getByRole("menuitem")).toHaveText([/Обновить данные/, /Скачать Excel/]);
  await expect(page.getByRole("menuitem", { name: "Скачать Excel" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await shots(page, "ceo-empty");
  // Refresh asks the backend again.
  const before = asked.length;
  await none.getByRole("button", { name: "Обновить данные" }).click();
  await expect.poll(() => asked.length).toBeGreaterThan(before);
});

test("an empty period offers all time, and the report comes back with real figures", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/analytics/ceo": (_b: unknown, url: URL) => (url.searchParams.get("date_from") ? EMPTY_CEO : ceo()),
  } as never);
  await mockBackend(page, routes);
  await page.goto("/ru/admin/ceo");
  const sheet = page.locator(".ceo-sheet");
  await expect(sheet).toContainText("Продление подписок", { timeout: 20000 });
  await page.getByRole("combobox", { name: "Дата начала" }).fill("01.02.2026");
  await page.getByRole("combobox", { name: "Дата начала" }).press("Tab");
  await page.getByRole("combobox", { name: "Дата окончания" }).fill("10.02.2026");
  await page.getByRole("combobox", { name: "Дата окончания" }).press("Tab");
  const none = sheet.locator(".ceo-none");
  await expect(none).toContainText("Нет данных за 1 февраля 2026 — 10 февраля 2026", { timeout: 20000 });
  await expect(none).toContainText("Выберите более длинный период");
  await none.getByRole("button", { name: "За всё время" }).click();
  await expect(none).toHaveCount(0);
  await expect(sheet).toContainText("Продление подписок");
  await expect(sheet.locator(".ceo-kpis")).toBeVisible();
});

test("the CEO page says when it can't load and loads again on retry", async ({ page }) => {
  let fail = true;
  const routes = await signIn(page, ADMIN, { "/analytics/ceo": ceo() } as never);
  await mockBackend(page, routes);
  await page.route(/\/analytics\/ceo(\?|$)/, (route) => (fail ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Service Unavailable" }) }) : route.fallback()));
  await page.goto("/ru/admin/ceo");
  const sheet = page.locator(".ceo-sheet");
  await expect(sheet.locator(".pempty--err")).toBeVisible({ timeout: 20000 });
  await expect(sheet).toContainText("503");
  await expect(sheet.locator(".ceo-none, .ceo-kpis")).toHaveCount(0);
  await expect(page.getByText(/демо/i)).toHaveCount(0);
  await shots(page, "ceo-error");
  fail = false;
  await sheet.getByRole("button", { name: /Повторить/ }).click();
  await expect(sheet).toContainText("Продление подписок", { timeout: 20000 });
});
