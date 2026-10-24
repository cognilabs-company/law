import { expect, test } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

// A marketplace complaint holds the seller's final payout until the call
// center rules on it (TSK-344069); the operator sees the order and the hold.
const ROW = { id: "qc-1", work_id: "CMP-1", type: "quality_complaint", title: "Marketplace shikoyati: ADV-1", status: "new", status_label: "Yangi", source: "quality_complaint", created_at: "2026-10-24T08:00:00Z" };

test("an open marketplace complaint shows its order and the payout hold, and is ruled on its own endpoint", async ({ page }) => {
  let ruled: unknown = null;
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/quality-complaints": { items: [ROW], count: 1, statuses: ["new", "rework_required", "rejected", "resolved"] },
    "/call-center/quality-complaints/qc-1": {
      summary: ROW,
      complaint: { id: "qc-1", record_type: "marketplace_order", payload: { order_id: "o-1", work_id: "ADV-1", rating: 1, comment: "Natija yo'q", reason: "Natija yo'q" } },
      actions: [],
    },
    "/marketplace/me/orders/o-1/financials": { order_id: "o-1", payments: [], settlement: "complaint_hold" },
    "POST /call-center/marketplace/complaints/qc-1/resolve": (b: unknown) => ((ruled = b), { status: "rework_required" }),
    "/admin/marketplace/orders/o-1": { order: { id: "o-1", work_id: "ADV-1", service_title: "Meros maslahati", price: 250000, payment_status: "paid", status: "rated" }, purchase_requests: [], activity: [] },
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/call-center?tab=complaints");
  await page.getByRole("button", { name: /Marketplace shikoyati/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Заказ маркетплейса")).toBeVisible();
  await expect(dialog.getByText(/Meros maslahati · 250\s000 сум · Оплачен/)).toBeVisible();
  await expect(dialog.getByText(/итоговая выплата исполнителю не проводится/)).toBeVisible();
  await expect(dialog.getByText("Удерживается из-за жалобы")).toBeVisible();
  await dialog.getByText("Обоснована — переделать").click();
  await dialog.getByRole("textbox").fill("Natija topshirilmagan, qayta bajarilsin");
  await dialog.getByRole("button", { name: "Сохранить решение" }).click();
  await expect.poll(() => ruled).toEqual({ action: "valid_rework", note: "Natija topshirilmagan, qayta bajarilsin" });
});
