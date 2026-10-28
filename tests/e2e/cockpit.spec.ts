import { expect, test } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

// TSK-635882 — the operator's marketplace cockpit. The live titles carry
// raw ids ("…eskalatsiyasi: 9d042a95-…"); the cockpit never shows them.
// Screenshots: CKP_SHOTS=<dir>, CKP_NARROW=1.
test.use({ viewport: process.env.CKP_NARROW ? { width: 375, height: 812 } : { width: 1440, height: 960 } });
const UUID = "9d042a95-ce4a-4e37-ac56-786b2c404372";
const cockpit = {
  total_open: 14,
  queues: {
    assignments: {
      total: 9,
      items: [
        { id: "x1", record_type: UUID, title: `Marketplace ijrochi eskalatsiyasi: ${UUID}`, status: "open", payload: { order_id: UUID, client_user_id: "u-c1", reason: "contact_sla_breached", opened_at: new Date(Date.now() - 20 * 60000).toISOString() } },
        { id: "x2", record_type: UUID, title: `Marketplace ijrochi eskalatsiyasi: ${UUID}`, status: "open", payload: { order_id: UUID, client_user_id: "u-c2", reason: "seller_acceptance_timeout", opened_at: new Date(Date.now() - 90 * 60000).toISOString() } },
      ],
    },
    complaints: { total: 3, items: [{ id: "c1", record_type: "marketplace_order", work_id: "CMP-TPGNT", order_id: UUID, title: "Marketplace shikoyati · CMP-TPGNT · Shartnoma tahlili", owner: { id: "u-c3", name: "Dilnoza Karimova" }, status: "new", payload: { client_name: "Dilnoza Karimova", rating: 1, reason: "low_rating", priority: "high", work_id: "CMP-TPGNT" } }] },
    refunds: { total: 2, items: [{ id: "r1", record_type: UUID, title: "test xizmat", status: "pending", payload: { client_name: "Aziz Rahimov", amount: 8000, currency: "UZS", reason: "Mijoz haq chiqdi", order_id: UUID, payment_id: UUID } }] },
    payouts: { total: 0, items: [] },
    payout_recoveries: { total: 0, items: [] },
    experience: { total: 0, items: [] },
    achievements: { total: 0, items: [] },
  },
  events: ["marketplace.assignment_escalated", "marketplace.contact_sla_breached"],
};

test("the cockpit lists every queue in human words and opens the right one", async ({ page }) => {
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/call-center/marketplace/cockpit": cockpit,
      "/call-center/clients/u-c1": { client: { id: "u-c1", name: "Malika Yusupova" } },
      "/call-center/clients/u-c2": { client: { id: "u-c2", name: "Bobur Aliyev" } },
      "/call-center/marketplace/assignment-escalations": { items: [], total: 0 },
    } as never),
  );
  await page.goto("/uz/admin/call-center?tab=cockpit");
  const ckp = page.locator(".ckp");
  await expect(ckp.locator(".ckp__total b")).toHaveText("14", { timeout: 20000 });
  const lanes = ckp.locator(".ckp__lane");
  await expect(lanes).toHaveCount(7);
  const assign = lanes.filter({ hasText: "Ijrochi muammosi" });
  await expect(assign).toContainText("Mijoz bilan tanlangan muddatda bog'lanilmadi");
  await expect(assign).toContainText("30 daqiqada javob bo'lmadi");
  await expect(assign).toContainText("Malika Yusupova");
  // The backend's own title leads (gaps closed §15); an older title with an id never shows.
  await expect(lanes.filter({ hasText: "Shikoyatlar" }).locator(".ckp__it b").first()).toHaveText("Marketplace shikoyati · CMP-TPGNT · Shartnoma tahlili");
  await expect(lanes.filter({ hasText: "Shikoyatlar" })).toContainText("Dilnoza Karimova · ★");
  await expect(lanes.filter({ hasText: "Pul qaytarish" })).toContainText("8 000 so'm");
  await expect(lanes.filter({ hasText: "Tajriba tekshiruvi" })).toContainText("Hammasi joyida");
  await expect(ckp.locator(".ckp__first")).toContainText("Ijrochi muammosi — 9");
  const text = await ckp.innerText();
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|seller_acceptance_timeout|contact_sla_breached/);
  if (process.env.CKP_SHOTS) await page.screenshot({ path: `${process.env.CKP_SHOTS}/cockpit${process.env.CKP_NARROW ? "-phone" : ""}.png` });
  await assign.getByRole("button", { name: /Navbatga o'tish/ }).click();
  await expect(page).toHaveURL(/tab=escalations/);
});

test("a call-center lawyer the backend refuses never sees the cockpit", async ({ page }) => {
  await mockBackend(page, await signIn(page, CALL_CENTER, { "/call-center/marketplace/cockpit": { status: 403, json: { detail: "forbidden" } } } as never));
  await page.goto("/uz/admin/call-center?tab=cockpit");
  await expect(page.locator(".ckp")).toHaveCount(0);
});

test("a queue the operator's role cannot open says so instead of a dead button", async ({ page }) => {
  const ach = { ...cockpit, queues: { ...cockpit.queues, achievements: { total: 1, items: [{ id: "a1", work_id: "MKT-A4OKA", title: "Yutuq tekshiruvi · MKT-A4OKA · sss", owner: { id: "s", name: "Demo Advokat 1" }, status: "pending_review", payload: {}, created_at: new Date().toISOString() }] } } };
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/call-center/marketplace/cockpit": ach,
      "/call-center/clients/u-c1": { client: { id: "u-c1", name: "Malika Yusupova" } },
      "/call-center/clients/u-c2": { client: { id: "u-c2", name: "Bobur Aliyev" } },
      "/call-center/marketplace/assignment-escalations": { items: [], total: 0 },
      // The backend refuses this role the achievements queue itself.
      "/call-center/marketplace/achievements": { status: 403, json: { detail: "forbidden" } },
    } as never),
  );
  await page.goto("/uz/admin/call-center?tab=cockpit");
  const lane = page.locator(".ckp__lane", { hasText: "Yutuq" });
  await expect(lane.locator(".ckp__locked")).toHaveText("Bu navbat sizning rolingizga ochiq emas", { timeout: 20000 });
  await expect(lane.getByRole("button", { name: /Navbatga o'tish/ })).toHaveCount(0);
  // Queues the role can open still go there.
  await page.locator(".ckp__lane", { hasText: "Ijrochi muammosi" }).getByRole("button", { name: /Navbatga o'tish/ }).click();
  await expect(page).toHaveURL(/tab=escalations/);
});
