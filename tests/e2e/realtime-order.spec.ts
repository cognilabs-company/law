import { expect, test, type Page } from "@playwright/test";
import { CLIENT, mockBackend, signIn, type Mock } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// Realtime events are refresh signals; REST is the truth (enterprise
// contract §2, §18). The server is played by the mocked socket.

const ORDER_PATH = new RegExp(`^/marketplace/me/orders/${ORDER_ID}$`);
const chatEntry = (page: Page) => page.locator('[data-ai-id$=".chat"], [data-ai-id$=".contact"]');

type State = { order: Record<string, unknown> };

async function openOrder(page: Page, state: State): Promise<Mock> {
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "marketplace_order", status: state.order.contact_unlocked ? "paid" : "pending", amount: 110000 }]),
  });
  const mock = await mockBackend(page, routes);
  await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
  await expect(page.locator(".mod-price")).toBeVisible();
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  return mock;
}

const unpaid = () => order({ status: "accepted", payment_status: "pending", contact_unlocked: false });
const paid = () => order({ status: "paid", payment_status: "paid", contact_unlocked: true });

test.describe("order page realtime", () => {
  test("an advance-paid event refetches the order and opens the chat", async ({ page }) => {
    const state: State = { order: unpaid() };
    const mock = await openOrder(page, state);
    await expect(chatEntry(page)).toHaveCount(0);
    const before = mock.count("GET", ORDER_PATH);

    // The provider confirmed the advance; the backend says so on the socket.
    state.order = paid();
    await mock.push({ event: "marketplace.advance_paid", order_id: ORDER_ID, advance_payment_id: "pay-0" });
    await expect.poll(() => mock.count("GET", ORDER_PATH)).toBeGreaterThan(before);
    await expect(chatEntry(page).first()).toBeVisible();
  });

  test("duplicate events cause one consistent state, not a refetch storm", async ({ page }) => {
    const state: State = { order: unpaid() };
    const mock = await openOrder(page, state);
    const before = mock.count("GET", ORDER_PATH);
    state.order = paid();
    for (let i = 0; i < 5; i++) await mock.push({ event: "marketplace.advance_paid", order_id: ORDER_ID });
    await expect(chatEntry(page).first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect(mock.count("GET", ORDER_PATH) - before).toBeLessThanOrEqual(2);
  });

  test("events out of order never move the order backwards: REST decides", async ({ page }) => {
    const state: State = { order: order({ status: "completed", payment_status: "paid", completed_at: "2026-10-24T08:00:00Z" }) };
    const mock = await openOrder(page, state);
    const phase = () => page.locator(".sx.mod").getAttribute("data-phase");
    await expect.poll(phase).toBe("completed");
    // A late advance event arrives after completion.
    await mock.push({ event: "marketplace.final_paid", order_id: ORDER_ID });
    await mock.push({ event: "marketplace.advance_paid", order_id: ORDER_ID });
    await mock.push({ event: "order_accepted", order_id: ORDER_ID });
    await page.waitForTimeout(1500);
    expect(await phase()).toBe("completed");
  });

  test("an event for another order is ignored", async ({ page }) => {
    const state: State = { order: unpaid() };
    const mock = await openOrder(page, state);
    await page.waitForTimeout(800);
    const before = mock.count("GET", ORDER_PATH);
    await mock.push({ event: "marketplace.advance_paid", order_id: "someone-elses-order" });
    await page.waitForTimeout(1500);
    expect(mock.count("GET", ORDER_PATH)).toBe(before);
    await expect(chatEntry(page)).toHaveCount(0);
  });

  test("after a dropped connection the page reconnects and resyncs from REST", async ({ page }) => {
    const state: State = { order: unpaid() };
    const mock = await openOrder(page, state);
    // The advance is confirmed while the socket is down: its event is lost.
    await mock.drop();
    state.order = paid();
    await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me")), { timeout: 15_000 }).toBe(true);
    await expect(chatEntry(page).first()).toBeVisible({ timeout: 15_000 });
  });
});

// TSK-906326: the checklist moves live — a checklist_updated event carrying
// the list replaces it at once, without asking the server again.
test("a checklist event marks the item done live, without a refetch", async ({ page }) => {
  const working = order({ status: "in_progress", started_at: "2026-10-20T10:00:00Z" });
  const CHECKLIST = new RegExp(`/marketplace/orders/${ORDER_ID}/checklist$`);
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/me/orders/${ORDER_ID}`]: working,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
    [`/marketplace/orders/${ORDER_ID}/checklist`]: { order_id: ORDER_ID, items: [{ id: "i1", client_title: "Hujjatlaringiz tekshirildi", status: "pending", payout_stage: "first_checklist" }] },
  });
  const mock = await mockBackend(page, routes);
  await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
  const item = page.locator("#mck-i1");
  await expect(item).toHaveAttribute("data-status", "pending", { timeout: 20_000 });
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  const before = mock.count("GET", CHECKLIST);
  await mock.push({ event: "marketplace.checklist_updated", order_id: ORDER_ID, checklist: { order_id: ORDER_ID, items: [{ id: "i1", client_title: "Hujjatlaringiz tekshirildi", status: "done", payout_stage: "first_checklist" }] } });
  await expect(item).toHaveAttribute("data-status", "done");
  await page.waitForTimeout(800);
  expect(mock.count("GET", CHECKLIST)).toBe(before);
});
