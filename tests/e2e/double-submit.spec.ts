import { expect, test } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// Decision actions go out once even when two clicks land in the same tick
// (lib/useSameTickGuard).
test("a seller's cancellation request is sent once", async ({ page }) => {
  const sent: unknown[] = [];
  const routes = await signIn(page, ADVOCATE, {
    [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: "in_progress", started_at: new Date().toISOString(), can_request_cancellation: true, cancellation_review_url: `/marketplace/orders/${ORDER_ID}/cancellation-review` }),
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    [`POST /marketplace/orders/${ORDER_ID}/cancellation-review`]: (b: unknown) => (sent.push(b), { id: "rev-1", order_id: ORDER_ID, status: "open", reason: (b as { reason: string }).reason }),
  });
  await mockBackend(page, routes);
  await page.goto(`/ru/portal/advocate/marketplace-orders/${ORDER_ID}`);
  await page.getByRole("button", { name: "Запросить отмену" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Запрос на отмену заказа" });
  await dialog.getByRole("textbox").fill("Mijoz kerakli hujjatlarni bermayapti, uch marta so'radim, javob yo'q");
  const submit = dialog.getByRole("button", { name: "Отправить запрос" });
  await submit.evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect.poll(() => sent.length).toBe(1);
  await page.waitForTimeout(800);
  expect(sent).toHaveLength(1);
});

// Backend answers 2026-10-31 §1.7: mark-paid, recovery resolve and complaint
// resolve take no Idempotency-Key yet, so the screen sends each once — a
// double click goes out once, and the row's own button is gone the moment
// it succeeds, before the list is read again. Escalation resolve actions
// carry an Idempotency-Key (§1.1).
const doubleClick = (b: import("@playwright/test").Locator) =>
  b.evaluate((el: HTMLButtonElement) => {
    el.click();
    el.click();
  });

test("a payout is marked paid once; its button is gone right after", async ({ page }) => {
  const paid: unknown[] = [];
  const row = { id: "po-1", order_id: ORDER_ID, work_id: "ADV-7Q2", service_title: "Maslahat", seller: { id: "u-adv", name: "Aziz Karimov" }, stage: "acceptance", status: "operator_required", gross_percent: 30, payable_amount: 33000, created_at: "2026-10-28T08:00:00Z" };
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      // The list is read again right after, and still lags behind: the row
      // must stay done all the same.
      "/call-center/marketplace/payouts": { items: [row], total: 1, has_more: false },
      "POST /call-center/marketplace/payouts/po-1/mark-paid": (b: unknown) => (paid.push(b), { ...row, status: "paid" }),
    } as never),
  );
  await page.goto("/uz/admin/call-center?tab=payouts");
  await page.getByRole("button", { name: "To'landi deb belgilash" }).click();
  const dlg = page.getByRole("dialog", { name: "Payout to'landi" });
  await dlg.getByRole("textbox", { name: /Tranzaksiya raqami/ }).fill("TRX-1");
  await doubleClick(dlg.getByRole("button", { name: "To'landi" }));
  await expect.poll(() => paid.length).toBe(1);
  await expect(page.getByRole("button", { name: "To'landi deb belgilash" })).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(paid).toHaveLength(1);
  await expect(page.getByRole("button", { name: "To'landi deb belgilash" })).toHaveCount(0);
});

test("a complaint ruling goes out once; the decide button is gone right after", async ({ page }) => {
  const ruled: unknown[] = [];
  const complaint = {
    id: "mc-1",
    status: "new",
    reason: "Natija to'liq emas",
    order: { id: "o-1", work_id: "ADV-1", status: "completed", payment_status: "paid", price: 500000, currency: "UZS" },
    client: { id: "c-1", name: "Test Mijoz" },
    seller: { id: "s-1", name: "Test Advokat" },
    evidence: [],
    settlement: { status: "complaint_hold", held_amount: 500000, currency: "UZS" },
    allowed_actions: ["invalid", "resolved"],
    created_at: "2026-10-24T08:00:00Z",
  };
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/call-center/marketplace/complaints": { items: [complaint], total: 1, has_more: false },
      "POST /call-center/marketplace/complaints/mc-1/resolve": (b: unknown) => (ruled.push(b), { status: "resolved" }),
    }),
  );
  await page.goto("/ru/admin/call-center?tab=mpComplaints");
  await page.getByRole("button", { name: /ADV-1/ }).click();
  await page.getByRole("button", { name: "Принять решение" }).click();
  const dialog = page.locator(".amodal__c");
  await dialog.getByText("Необоснована", { exact: true }).click();
  await dialog.getByRole("textbox", { name: "Заключение" }).fill("Natija to'liq topshirilgan");
  await doubleClick(dialog.getByRole("button", { name: "Отметить необоснованной" }));
  await expect.poll(() => ruled.length).toBe(1);
  await page.waitForTimeout(600);
  expect(ruled).toHaveLength(1);
  await expect(page.locator(".esc__item").first().getByRole("button", { name: "Принять решение" })).toHaveCount(0);
});

test("an escalation reassign goes out once, with an Idempotency-Key", async ({ page }) => {
  const sent: { body: unknown; key: string }[] = [];
  const esc = {
    id: "esc-1",
    status: "open",
    order_id: ORDER_ID,
    order: order({ status: "sent_to_seller", service_title: "Ajrashish bo'yicha maslahat" }),
    reason: "seller_declined",
    history: [],
    assignment_history: [],
    resolution: null,
    actions: ["reassign"],
    created_at: "2026-10-24T08:00:00Z",
  };
  const mock = await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/call-center/marketplace/assignment-escalations": { items: [esc], total: 1 },
      "POST /call-center/marketplace/assignment-escalations/esc-1/resolve": (b: unknown) => (sent.push({ body: b, key: "" }), { action: "reassign" }),
    }),
  );
  await page.goto("/ru/admin/call-center?tab=escalations");
  await page.getByRole("button", { name: /Ajrashish bo'yicha maslahat/ }).click();
  await page.getByRole("button", { name: "Передать другому исполнителю" }).click();
  const dialog = page.getByRole("dialog", { name: "Передать другому исполнителю" });
  // No seller to pick: the backend chooses (§1.1).
  await expect(dialog).toContainText("Система сама выберет лучшего подходящего внешнего специалиста");
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await doubleClick(dialog.getByRole("button", { name: "Передать", exact: true }));
  await expect.poll(() => sent.length).toBe(1);
  await page.waitForTimeout(600);
  expect(sent).toHaveLength(1);
  const call = mock.calls.find((c) => c.method === "POST" && c.path.endsWith("/esc-1/resolve"));
  expect(call?.headers["idempotency-key"]).toMatch(/^[0-9a-z-]{8,}$/i);
  expect(call?.body).toMatchObject({ action: "reassign" });
  expect(call?.body).not.toHaveProperty("seller_user_id");
});
