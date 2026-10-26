import { expect, test } from "@playwright/test";
import { ADVOCATE, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// A finished order the call center sends back to work (complaint ruled
// valid_rework, contract 2026-10-24 §3: order in_progress, settlement
// rework_hold). The seller is told live and the order says the work moved
// from "completed" back to "being redone".

const done = () => order({ status: "completed", completed_at: "2026-10-25T10:00:00Z", result_text: "Hujjat tayyor" });
const reopened = () =>
  order({ status: "in_progress", started_at: "2026-10-20T10:00:00Z", complaint: { status: "resolved", resolution: "valid_rework", resolution_note: "Shartnomaning 4-bandi to'ldirilmagan", resolved_at: "2026-10-26T09:30:00Z" } });

test("the seller is told live and the order shows it moved back from completed to rework", async ({ page }) => {
  const state = { order: done(), settlement: "complaint_hold" };
  const routes = await signIn(page, ADVOCATE, {
    [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
    "/marketplace/me/orders": () => ({ items: [state.order], total: 1 }),
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "marketplace_advance", status: "paid", amount: 50000 }], state.settlement),
    [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
  });
  const mock = await mockBackend(page, routes);
  await page.goto(`/uz/portal/advocate/marketplace-orders/${ORDER_ID}`);
  await expect(page.locator(".mod")).toHaveAttribute("data-phase", /completed|rated/);
  await expect(page.locator(".mod-rework")).toHaveCount(0);

  // The call center rules valid_rework.
  state.order = reopened();
  state.settlement = "rework_hold";
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  await mock.push({ event: "marketplace.complaint_resolved", order_id: ORDER_ID, work_id: "MP-TEST1", resolution: "valid_rework" });

  const toast = page.locator(".mk-toast--complaint");
  await expect(toast).toContainText("Ish qayta ochildi");
  await expect(toast).toContainText("«Bajarilgan»dan «Jarayonda»ga qaytdi");
  const notice = page.locator(".mod-rework");
  await expect(notice).toContainText("Ish qayta ochildi — qayta bajarish kerak");
  await expect(notice.getByRole("list", { name: "Buyurtma holati o'zgardi" })).toContainText("Bajarilgan");
  await expect(notice).toContainText("Qayta bajarishda");
  await expect(notice).toContainText("Shartnomaning 4-bandi to'ldirilmagan");
  await expect(notice).toContainText("Yakuniy to'lov ish qayta bajarilguncha ushlab turiladi");
  await expect(page.locator(".mod")).toHaveAttribute("data-phase", "in_progress");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rework-seller.png` });

  // The list marks it too.
  await page.goto("/uz/portal/advocate/marketplace-orders");
  await expect(page.locator(".mko-card").first()).toContainText("Qayta bajarishda");
});

test("the rework is recognised from the settlement alone, and the client is told too", async ({ page }) => {
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: "in_progress", started_at: "2026-10-20T10:00:00Z" }),
    "/marketplace/me/orders": { items: [], total: 0 },
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_advance", status: "paid", amount: 50000 }], "rework_hold"),
  });
  await mockBackend(page, routes);
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  const notice = page.locator(".mod-rework");
  await expect(notice).toContainText("Ish qayta bajariladi");
  await expect(notice).toContainText("Ijrochi ishni qayta bajaradi");
});
