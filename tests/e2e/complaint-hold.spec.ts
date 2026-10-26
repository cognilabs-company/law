import { expect, test } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

// Marketplace complaints (TSK-344069): an open complaint holds the seller's
// payout; the operator rules in its own queue, which moves the settlement.
const COMPLAINT = {
  id: "mc-1",
  status: "new",
  reason: "Natija to'liq emas",
  rating: 1,
  order: { id: "o-1", work_id: "ADV-1", status: "completed", payment_status: "paid", price: 500000, currency: "UZS" },
  client: { id: "c-1", lexgo_id: "LGC-1", name: "Test Mijoz", phone: "+998900000005" },
  seller: { id: "s-1", lexgo_id: "LGA-1", name: "Test Advokat", phone: "+998900000006" },
  evidence: [],
  settlement: { status: "complaint_hold", gross_amount: 500000, held_amount: 500000, refunded_amount: 0, pending_refund_amount: 0, currency: "UZS" },
  // The live key (26 Oct 2026); `available_actions` is still read.
  allowed_actions: ["valid_rework", "partial_refund", "full_refund", "invalid", "resolved"],
  created_at: "2026-10-24T08:00:00Z",
};

test("a partial refund is sent with its amount, note and uploaded evidence", async ({ page }) => {
  let ruled: unknown = null;
  let upload = "";
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/complaints": { items: [COMPLAINT], total: 1, has_more: false },
    "POST /call-center/marketplace/complaints/mc-1/evidence": (b: unknown) => ((upload = String(b)), { id: "ev-1", file_name: "chek.pdf", visibility: "staff", download_url: "/x" }),
    "POST /call-center/marketplace/complaints/mc-1/resolve": (b: unknown) => ((ruled = b), { status: "refund_required" }),
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/call-center?tab=mpComplaints");
  await page.getByRole("button", { name: /ADV-1/ }).click();
  await expect(page.getByText("Удерживается из-за жалобы")).toBeVisible();
  await page.getByRole("button", { name: "Принять решение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Обоснована — частичный возврат").click();
  await dialog.getByRole("textbox", { name: "Сумма возврата" }).fill("150000");
  await dialog.getByRole("textbox", { name: "Заключение" }).fill("Ishning bir qismi bajarilmagan");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "chek.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(dialog.getByText("chek.pdf")).toBeVisible();
  await dialog.getByRole("button", { name: "Вернуть частично" }).click();
  await expect.poll(() => ruled).toEqual({ action: "partial_refund", note: "Ishning bir qismi bajarilmagan", evidence_ids: ["ev-1"], refund_amount: 150000 });
  expect(upload).toContain("visibility");
  await expect(page.getByText("Частичный возврат начат.")).toBeVisible();
});

test("a second, different decision refreshes instead of failing", async ({ page }) => {
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/complaints": { items: [COMPLAINT], total: 1 },
    "POST /call-center/marketplace/complaints/mc-1/resolve": { status: 409, json: { detail: { code: "marketplace_complaint_already_resolved" } } },
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/call-center?tab=mpComplaints");
  await page.getByRole("button", { name: /ADV-1/ }).click();
  await page.getByRole("button", { name: "Принять решение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Необоснована", { exact: true }).click();
  await dialog.getByRole("textbox", { name: "Заключение" }).fill("Natija to'liq topshirilgan");
  await dialog.getByRole("button", { name: "Отметить необоснованной" }).click();
  await expect(page.getByText("По этой жалобе уже принято другое решение; список обновлён.")).toBeVisible();
});

test("a warranty claim is rejected with a note", async ({ page }) => {
  let ruled: unknown = null;
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/warranty": {
      items: [{ id: "w-1", status: "new", kind: "no_response", reason: "Javob yo'q", order: { id: "o-2", work_id: "ADV-2", price: 300000, service_id: "svc-1" }, client: COMPLAINT.client, seller: COMPLAINT.seller, available_resolutions: ["replacement", "full_refund"], created_at: "2026-10-24T08:00:00Z" }],
      total: 1,
    },
    "POST /call-center/marketplace/warranty/w-1/resolve": (b: unknown) => ((ruled = b), { status: "rejected" }),
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/call-center?tab=warranty");
  await page.getByRole("button", { name: /ADV-2/ }).click();
  await expect(page.getByText("Javob yo'q")).toBeVisible();
  await page.getByRole("button", { name: "Принять решение" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Другой исполнитель")).toBeVisible();
  await dialog.getByText("Отклонить", { exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Комментарий" }).fill("Ijrochi vaqtida javob bergan");
  await dialog.getByRole("button", { name: "Отклонить" }).last().click();
  await expect.poll(() => ruled).toEqual({ resolution: "rejected", note: "Ijrochi vaqtida javob bergan" });
});
