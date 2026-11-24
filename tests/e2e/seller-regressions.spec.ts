import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, mockBackend, signIn, type Mock } from "./mock";
import { ORDER_ID, order } from "./fixtures";
import { mocksFor } from "./design1920/data";

// What the advocate and lawyer cabinets lost after the move to the new design
// (owner, 2026-11-24): the chat's call buttons, the way into a running call,
// the payout ledger, promotion and the lawyer's AI chat in the menu, and the
// dashboard's "Add service" opening the form.
//
// Since 2026-11-21 an external advocate/lawyer no longer holds
// meetings.manage; they call inside a paid, active order's chat, inviting
// only that order's client (contract 2026-11-21 §6). ADVOCATE here carries no
// permissions at all — the way the live account signs in.

const ME = { user_id: "u-adv", name: "Test Advokat", role: "advokat" };
const CLIENT_P = { user_id: "u-client", name: "Test Mijoz", role: "client" };
const ROOM = { id: "r1", status: "active", order_id: ORDER_ID, client_user_id: "u-client", seller_user_id: "u-adv", participants: [ME, CLIENT_P], unread_count: 0 };
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

async function openRoom(page: Page, o: Record<string, unknown>, calls: unknown[] = []): Promise<Mock> {
  const mock = await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "/secure-chats": { rooms: [ROOM] },
      "/secure-chats/r1": ROOM,
      "/secure-chats/r1/messages": { messages: [{ id: "m1", sender_user_id: "u-client", message_type: "text", filtered_content: "Assalomu alaykum", created_at: ago(30) }] },
      "/secure-chats/r1/calls": { items: calls },
      "POST /secure-chats/r1/calls": { id: "c-new", room_id: "r1", call_type: "audio", status: "ringing", caller_user_id: "u-adv", started_at: new Date().toISOString() },
      [`/marketplace/me/orders/${ORDER_ID}`]: o,
    }),
  );
  await page.goto("/uz/portal/advocate/messages?room=r1");
  await expect(page.locator(".mxm").filter({ hasText: "Assalomu alaykum" })).toBeVisible();
  return mock;
}

const callBtn = (page: Page) => page.locator(".mxr__calls").getByRole("button", { name: "Audio qo‘ng‘iroq" });

test("a paid order's chat gives the advocate audio and video calls again, inviting only the order's client", async ({ page }) => {
  const mock = await openRoom(page, order({ status: "in_progress", payment_status: "paid", can_create_call: true, calls_allowed: true }));
  await expect(callBtn(page)).toBeVisible();
  await expect(page.locator(".mxr__calls").getByRole("button", { name: "Video qo‘ng‘iroq" })).toBeVisible();
  await callBtn(page).click();
  await expect.poll(() => mock.calls.filter((c) => c.method === "POST" && c.path === "/secure-chats/r1/calls").length).toBe(1);
  const body = mock.calls.find((c) => c.method === "POST" && c.path === "/secure-chats/r1/calls")?.body as Record<string, unknown>;
  expect(body.participant_user_ids).toEqual(["u-client"]);
  expect(body.call_type).toBe("audio");
});

test("an unpaid order's chat offers no call to an external advocate", async ({ page }) => {
  await openRoom(page, order({ status: "waiting_payment", payment_status: "pending", can_create_call: false, calls_allowed: false }));
  await expect(page.locator(".mxr__acts")).toBeVisible();
  await expect(page.locator(".mxr__calls")).toHaveCount(0);
});

test("a call already running in the room can be joined from the chat header", async ({ page }) => {
  // Started by the client 10 minutes ago: past the in-room ringing card, the
  // header still offers the way in — joining needs only room membership.
  await openRoom(page, order({ status: "waiting_payment", payment_status: "pending", can_create_call: false, calls_allowed: false }), [
    { id: "c-live", room_id: "r1", call_type: "video", status: "active", caller_user_id: "u-client", started_at: ago(10) },
  ]);
  await expect(page.locator(".mxr__join")).toBeVisible();
  await expect(page.locator(".mxr__join")).toContainText("Qo‘shilish");
});

test("the advocate's dashboard shows the payout ledger again", async ({ page }) => {
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      ...mocksFor("advocate"),
      "/payouts/me": { items: [
        { id: "p1", amount: 250000, status: "pending", period: "2026-11", created_at: ago(60 * 24) },
        { id: "p2", amount: 900000, status: "paid", period: "2026-10", created_at: ago(60 * 24 * 20) },
      ] },
    }),
  );
  await page.goto("/uz/portal/advocate");
  const card = page.locator('[data-ai-target="seller-dashboard:payouts"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText("Hisob-kitob");
  await expect(card).toContainText("250 000");
  await expect(card).toContainText("900 000");
  await expect(card.locator(".lxs-table__r")).toHaveCount(2);
});

test("promotion is back in the advocate's menu", async ({ page }) => {
  await mockBackend(page, await signIn(page, ADVOCATE, mocksFor("advocate")));
  await page.goto("/uz/portal/advocate");
  await expect(page.locator('a[href$="/portal/advocate/promotion"]').first()).toBeAttached();
});

test("the lawyer's menu has the AI chat and promotion rows", async ({ page }) => {
  await mockBackend(page, await signIn(page, { id: "u-law", name: "Test Yurist", phone: "+998900000007", role: "lawyer", backendRole: "yurist" }, mocksFor("lawyer")));
  await page.goto("/uz/portal/lawyer");
  await expect(page.locator('a[href$="/portal/lawyer/ai"]').first()).toBeAttached();
  await expect(page.locator('a[href$="/portal/lawyer/promotion"]').first()).toBeAttached();
});

test("the dashboard's Add service opens the service form", async ({ page }) => {
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      ...mocksFor("advocate"),
      "/lawyers/me/services/manage": { seller: { id: "u-adv", role: "advokat" }, profile: { user_id: "u-adv", seller_type: "advokat", is_verified: true }, items: [] },
    }),
  );
  await page.goto("/uz/portal/advocate/services?new=1");
  await expect(page.locator(".svm")).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-ai-id="seller.services.form-modal"], [data-ai-id$=".form-modal"]').first()).toBeVisible();
  await expect(page).not.toHaveURL(/new=1/);
});
