import { expect, test } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

// The operator's support queue: the "new" tab asks once per waiting status
// (waiting_operator, reopened) and merges the answers. A ticket that moves
// between them while the two load comes back in both — it is listed once.

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const TICKET = { id: "t1", work_id: "SUP-1042", subject: "To'lov o'tmadi", status: "waiting_operator", category: "payment", priority: "high", last_message: "Kartadan pul yechildi", last_message_at: ago(8), client: { id: "u-c1", name: "Dilnoza Karimova", lexgo_id: "LGC-1" }, unread_count: 1, created_at: ago(15) };

test("a ticket returned for both waiting statuses is listed once", async ({ page }) => {
  const dupes: string[] = [];
  page.on("console", (m) => {
    if (/same key/.test(m.text())) dupes.push(m.text().slice(0, 120));
  });
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      // The mock answers every status with the same page, as a status that
      // changed between the two requests would.
      "/call-center/support/tickets": { items: [TICKET], total: 1 },
      "/support/meta": { categories: [{ key: "payment", label: "To'lov" }], priorities: [{ key: "high", label: "Yuqori" }], statuses: ["waiting_operator", "reopened", "closed"] },
    } as never),
  );
  await page.goto("/ru/admin/call-center/support");
  await expect(page.locator(".supitem").filter({ hasText: "Dilnoza Karimova" })).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(dupes).toEqual([]);
});
