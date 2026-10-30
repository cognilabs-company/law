import { expect, test } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

// TSK-635882 — the operator's marketplace cockpit (the focus home screen,
// fb64ec3). The live titles carry raw ids ("…eskalatsiyasi: 9d042a95-…");
// the cockpit never shows them.
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

// The home screen since fb64ec3: one job in focus (the longest waiting) and
// the next jobs as rows, all in human words.
test("the cockpit puts the longest wait in focus, in human words, and opens the right queue", async ({ page }) => {
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
  const ccf = page.locator(".ccf");
  // The backend's own title leads (gaps closed §15): the complaint by its work id.
  await expect(ccf.locator(".ccf__id b")).toHaveText("CMP-TPGNT", { timeout: 20000 });
  await expect(ccf.locator(".ccf__facts")).toContainText("Dilnoza Karimova");
  await expect(ccf.locator(".ccf__facts")).toContainText("★");
  await expect(ccf.locator(".ccf__count")).toHaveText("4 ta navbatda");
  const next = ccf.locator(".ccf__list");
  await expect(next).toContainText("Mijoz bilan tanlangan muddatda bog'lanilmadi");
  await expect(next).toContainText("30 daqiqada javob bo'lmadi");
  await expect(next).toContainText("Malika Yusupova");
  await expect(next).toContainText("Bobur Aliyev");
  await expect(next).toContainText("Aziz Rahimov");
  const text = await ccf.innerText();
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|seller_acceptance_timeout|contact_sla_breached|low_rating/);
  if (process.env.CKP_SHOTS) await page.screenshot({ path: `${process.env.CKP_SHOTS}/cockpit${process.env.CKP_NARROW ? "-phone" : ""}.png` });
  // A refund goes to the refund money in the focus, then to its queue.
  await next.getByRole("button", { name: /Aziz Rahimov/ }).click();
  await expect(ccf.locator(".ccf__facts")).toContainText("8 000 so'm");
  await next.getByRole("button", { name: /Malika Yusupova/ }).click();
  await expect(ccf.locator(".ccf__facts")).toContainText("Malika Yusupova");
  await ccf.getByRole("button", { name: "Navbatga o'tish" }).click();
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
  const ccf = page.locator(".ccf");
  const next = ccf.locator(".ccf__list");
  await next.getByRole("button", { name: /MKT-A4OKA/ }).click({ timeout: 20000 });
  await expect(ccf.locator(".ccf__id b")).toHaveText("MKT-A4OKA");
  await expect(ccf.locator(".ccf__locked")).toHaveText("Bu navbat sizning rolingizga ochiq emas");
  await expect(ccf.getByRole("button", { name: "Navbatga o'tish" })).toHaveCount(0);
  // Jobs from queues the role can open still go there.
  await next.getByRole("button", { name: /Malika Yusupova/ }).click();
  await ccf.getByRole("button", { name: "Navbatga o'tish" }).click();
  await expect(page).toHaveURL(/tab=escalations/);
});
