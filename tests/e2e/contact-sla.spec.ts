import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, CLIENT, mockBackend, signIn, type Mock, type Who } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// The contact SLA (backend answers 2026-10-31 §1.3): the order carries
// contact_speed, contact_speed_label, contact_deadline_at and
// contact_started_at (never first_contact_at). The seller, the client and the
// operator see the speed, a countdown to the deadline and the first contact;
// marketplace.contact_started and marketplace.contact_sla_breached re-read the
// order; the escalation reason seller_contact_sla_breach reads in words.
// Screenshots: orders-answers-shots.spec.ts (ORDERS_SHOTS=<dir>).

const inMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const ORDER_PATH = new RegExp(`^/marketplace/me/orders/${ORDER_ID}$`);

type State = { order: Record<string, unknown> };

async function openOrder(page: Page, who: Who, state: State, locale = "ru"): Promise<Mock> {
  const mock = await mockBackend(
    page,
    await signIn(page, who, {
      [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "full_payment", status: "paid", amount: 110000 }]),
      [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
      [`/marketplace/orders/${ORDER_ID}/checklist`]: { order_id: ORDER_ID, items: [] },
      "/marketplace/me/orders": { items: [], total: 0 },
    }),
  );
  await page.goto(`/${locale}/portal/${who.role === "client" ? "client" : "advocate"}/marketplace-orders/${ORDER_ID}`);
  return mock;
}

test("seller: the chosen speed, the time left to contact, then the first contact once the backend says so", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state: State = { order: order({ status: "paid", contact_speed: "within_1_hour", contact_speed_label: "1 soat ichida (backend)", contact_deadline_at: inMin(42), contact_started_at: null }) };
  const mock = await openOrder(page, ADVOCATE, state);
  const facts = page.locator(".mod-facts");
  await expect(facts).toContainText("1 soat ichida (backend)", { timeout: 20_000 });
  await expect(facts).toContainText("Связаться до");
  const timer = facts.getByRole("timer");
  await expect(timer).toHaveText(/Осталось (41|42):\d\d/);
  await expect(facts).not.toContainText("Первая связь");
  expect(await facts.innerText()).not.toMatch(/within_1_hour|contact_deadline_at|first_contact/);

  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  const reads = mock.count("GET", ORDER_PATH);
  state.order = { ...state.order, contact_started_at: "2026-10-31T09:12:00Z" };
  await mock.push({ event: "marketplace.contact_started", order_id: ORDER_ID });
  await expect.poll(() => mock.count("GET", ORDER_PATH)).toBeGreaterThan(reads);
  await expect(facts).toContainText("Первая связь");
  await expect(facts.locator('time[datetime="2026-10-31T09:12:00Z"]')).toBeVisible();
  await expect(facts.getByRole("timer")).toHaveCount(0);
  await expect(facts).not.toContainText("Связаться до");
});

test("client: the speed in words when the backend sends no label; a breach re-reads the order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state: State = { order: order({ status: "paid", contact_speed: "today", contact_deadline_at: inMin(3 * 60 + 5) }) };
  const mock = await openOrder(page, CLIENT, state);
  const facts = page.locator(".mod-facts");
  await expect(facts).toContainText("Сегодня", { timeout: 20_000 });
  await expect(facts.getByRole("timer")).toHaveText(/Осталось 3 ч (4|5) мин/);
  await expect(facts).not.toContainText("today");
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  const reads = mock.count("GET", ORDER_PATH);
  state.order = { ...state.order, contact_deadline_at: new Date(Date.now() - 60_000).toISOString() };
  await mock.push({ event: "marketplace.contact_sla_breached", order_id: ORDER_ID });
  await expect.poll(() => mock.count("GET", ORDER_PATH)).toBeGreaterThan(reads);
  await expect(facts).toContainText("Срок связи истёк");
  await expect(facts.getByRole("timer")).toHaveCount(0);
  // No sideways scroll on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("the countdown reaching zero re-reads the order; the backend decides what happened", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state: State = { order: order({ status: "paid", contact_speed: "within_15_min", contact_deadline_at: new Date(Date.now() + 4_000).toISOString() }) };
  const mock = await openOrder(page, ADVOCATE, state);
  const facts = page.locator(".mod-facts");
  await expect(facts.getByRole("timer")).toBeVisible({ timeout: 20_000 });
  const reads = mock.count("GET", ORDER_PATH);
  await expect(facts).toContainText("Срок связи истёк", { timeout: 10_000 });
  await expect.poll(() => mock.count("GET", ORDER_PATH), { timeout: 10_000 }).toBeGreaterThan(reads);
});

test("operator: the escalation names the contact breach and shows the order's contact times, live", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const esc = (o: Record<string, unknown>) => ({
    id: "esc-c1",
    status: "open",
    order_id: ORDER_ID,
    order: order({ status: "paid", service_title: "Ajrashish bo'yicha maslahat", ...o }),
    reason: "seller_contact_sla_breach",
    previous_seller_user_id: "u-adv",
    previous_seller_name: "Test Advokat",
    history: [],
    assignment_history: [],
    resolution: null,
    actions: ["message", "reassign"],
    created_at: "2026-10-31T09:00:00Z",
  });
  let items: unknown[] = [esc({ contact_speed: "within_15_min", contact_speed_label: "", contact_deadline_at: new Date(Date.now() - 120_000).toISOString() })];
  const mock = await mockBackend(page, await signIn(page, CALL_CENTER, { "/call-center/marketplace/assignment-escalations": () => ({ items, total: items.length }) }));
  await page.goto("/ru/admin/call-center?tab=escalations");
  await page.getByRole("button", { name: /Ajrashish bo'yicha maslahat/ }).click();
  const item = page.locator(".esc__item").first();
  await expect(item).toContainText("Исполнитель не связался с клиентом в выбранный срок");
  await expect(item).toContainText("В течение 15 минут");
  await expect(item).toContainText("Срок связи истёк");
  expect(await item.innerText()).not.toMatch(/seller_contact_sla_breach|within_15_min/);
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  const reads = mock.count("GET", /assignment-escalations$/);
  items = [esc({ contact_speed: "within_15_min", contact_deadline_at: new Date(Date.now() - 120_000).toISOString(), contact_started_at: "2026-10-31T09:20:00Z" })];
  await mock.push({ event: "marketplace.contact_started", order_id: ORDER_ID });
  await expect.poll(() => mock.count("GET", /assignment-escalations$/)).toBeGreaterThan(reads);
  await expect(item).toContainText("Первая связь");
  await expect(item).not.toContainText("Срок связи истёк");
});

// Backend answers 2026-11-01 N1 / N2. Contact is only the seller's first
// chat message, file, or audio/video call in the paid room — so an order can
// be in progress with no contact, and the screen says so and what counts.
// The times are UTC and read in Tashkent time, with the zone named; "today"
// is accepted + 12 h, so the exact deadline is always shown, never
// recomputed. A fixed far deadline: 2030-10-30T22:57:00Z = 31 Oct, 03:57 in
// Tashkent.
const FAR = "2030-10-30T22:57:00Z";
const working = (extra: Record<string, unknown> = {}) => order({ status: "in_progress", started_at: "2030-10-30T11:00:00Z", contact_speed: "today", contact_deadline_at: FAR, contact_started_at: null, ...extra });

test("seller: work has started but no message or call is recorded — said in words, with the exact Tashkent deadline", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOrder(page, ADVOCATE, { order: working() });
  const facts = page.locator(".mod-facts");
  await expect(facts).toContainText("Связаться до", { timeout: 20_000 });
  await expect(facts.locator(`time[datetime="${FAR}"]`)).toHaveText("31 окт, 03:57");
  await expect(facts).toContainText("по Ташкенту");
  await expect(facts).toContainText("Точный срок — в строке «Связаться до» ниже");
  const note = facts.locator(".mcs__none");
  await expect(note).toContainText("Работа начата, но сообщений и звонков клиенту пока нет.");
  await expect(note).toContainText("Связь — это первое сообщение, файл или аудио/видеозвонок в чате этого заказа.");
  expect(await facts.innerText()).not.toMatch(/today|in_progress|contact_/);
});

test("client: before the work starts the note says only that nothing is recorded; overdue keeps the note", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state: State = { order: order({ status: "paid", contact_speed: "within_1_hour", contact_deadline_at: inMin(30) }) };
  const mock = await openOrder(page, CLIENT, state, "en");
  const facts = page.locator(".mod-facts");
  const note = facts.locator(".mcs__none");
  await expect(note).toContainText("No message or call to the client is recorded yet.", { timeout: 20_000 });
  await expect(note).not.toContainText("Work has started");
  await expect(facts).toContainText("Tashkent time");
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  state.order = { ...state.order, contact_deadline_at: new Date(Date.now() - 60_000).toISOString() };
  await mock.push({ event: "marketplace.contact_sla_breached", order_id: ORDER_ID });
  await expect(facts).toContainText("The contact time has passed");
  await expect(facts.locator('.mcs__none[data-state="late"]')).toContainText("No message or call to the client is recorded yet.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("the first contact shows its time in Tashkent and its channel in words; an unknown channel is left out", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state: State = { order: working({ contact_started_at: "2030-10-30T11:20:00Z", contact_started_channel: "video" }) };
  const mock = await openOrder(page, ADVOCATE, state, "uz");
  const facts = page.locator(".mod-facts");
  await expect(facts).toContainText("Birinchi bog'lanish", { timeout: 20_000 });
  await expect(facts.locator('time[datetime="2030-10-30T11:20:00Z"]')).toHaveText("30 Okt, 16:20");
  await expect(facts.locator('.mcs__via[data-channel="video"]')).toHaveText("video qo‘ng‘iroq");
  await expect(facts.locator(".mcs__none")).toHaveCount(0);
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  const reads = mock.count("GET", ORDER_PATH);
  state.order = { ...state.order, contact_started_channel: "phone_reveal" };
  await mock.push({ event: "marketplace.contact_started", order_id: ORDER_ID });
  await expect.poll(() => mock.count("GET", ORDER_PATH)).toBeGreaterThan(reads);
  await expect(facts.locator(".mcs__via")).toHaveCount(0);
  expect(await facts.innerText()).not.toMatch(/phone_reveal|video\b(?! qo)/);
});

// CONTACT_SLA_SHOTS=<dir>: no contact yet / overdue / contacted with its
// channel, uz/ru/en, 1440 and 390, light and dark. Defined only then, so a
// normal run neither skips nor takes it.
const SHOTS = process.env.CONTACT_SLA_SHOTS;
if (SHOTS)
  test("screenshots: the contact SLA states (N1 / N2)", async ({ browser }: { browser: Browser }) => {
    test.setTimeout(900_000);
    const states: Record<string, () => Record<string, unknown>> = {
      "no-contact": () => working({ contact_deadline_at: inMin(9 * 60 + 15) }),
      overdue: () => working({ contact_deadline_at: new Date(Date.now() - 20 * 60_000).toISOString() }),
      contacted: () => working({ contact_started_at: "2030-10-30T11:20:00Z", contact_started_channel: "chat_file" }),
    };
    for (const [name, make] of Object.entries(states))
      for (const locale of ["uz", "ru", "en"])
        for (const [w, h] of [[1440, 900], [390, 844]] as const)
          for (const scheme of ["light", "dark"] as const) {
            const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
            const page = await ctx.newPage();
            await openOrder(page, ADVOCATE, { order: make() }, locale);
            const facts = page.locator(".mod-facts");
            await expect(facts.locator(".mcs").first()).toBeVisible({ timeout: 30_000 });
            await facts.scrollIntoViewIfNeeded();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
            await page.waitForTimeout(400);
            await facts.screenshot({ path: `${SHOTS}/contact-sla-${name}-${locale}-${w}-${scheme}.png` });
            await ctx.close();
          }
  });
