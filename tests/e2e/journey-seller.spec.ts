import { expect, test } from "@playwright/test";
import { ADVOCATE, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// A seller's whole path: an assignment with the backend's answer deadline,
// accepting it, then starting and completing the work on the order page.

const assignment = (deadline: string) => ({
  id: ORDER_ID,
  work_id: "MP-TEST1",
  status: "assigned",
  payment_status: "paid",
  service_title: "Test xizmat",
  price: 110000,
  currency: "UZS",
  lawyer_user_id: "u-adv",
  acceptance_deadline_at: deadline,
  created_at: new Date().toISOString(),
  details: { region: "Toshkent", problem: "Ajrashish masalasi" },
});

test.describe("seller journey", () => {
  test("the answer countdown comes from the backend; accepting sends one request", async ({ page }) => {
    const deadline = new Date(Date.now() + 12 * 60_000 + 30_000).toISOString();
    const accepts: number[] = [];
    const routes = await signIn(page, ADVOCATE, {
      "/orders": { items: [assignment(deadline)] },
      [`POST /orders/${ORDER_ID}/accept`]: () => {
        accepts.push(Date.now());
        return { ...assignment(deadline), status: "accepted" };
      },
    });
    const mock = await mockBackend(page, routes);
    await page.goto("/ru/portal/advocate/opportunities");
    // 12 minutes and change left, from the backend's acceptance_deadline_at.
    await expect(page.locator(".rtimer").first()).toContainText(/1[12]:\d\d/);
    await page.getByRole("button", { name: "Принять" }).first().click();
    await expect(page.getByText("Принято").first()).toBeVisible();
    expect(accepts).toHaveLength(1);
    expect(mock.refused).toEqual([]);
  });

  test("an expired answer window is a calm message, not an error", async ({ page }) => {
    const deadline = new Date(Date.now() + 60_000).toISOString();
    const routes = await signIn(page, ADVOCATE, {
      "/orders": { items: [assignment(deadline)] },
      [`POST /orders/${ORDER_ID}/accept`]: { status: 409, json: { detail: { code: "assignment_response_deadline_expired", acceptance_deadline_at: deadline } } },
    });
    await mockBackend(page, routes);
    await page.goto("/ru/portal/advocate/opportunities");
    await page.getByRole("button", { name: "Принять" }).first().click();
    await expect(page.getByText("Время на ответ истекло").first()).toBeVisible();
  });

  test("declining sends the reason code the contract names", async ({ page }) => {
    let declined: Record<string, unknown> | null = null;
    const routes = await signIn(page, ADVOCATE, {
      "/orders": { items: [assignment(new Date(Date.now() + 600_000).toISOString())] },
      [`POST /orders/${ORDER_ID}/decline`]: (body: unknown) => {
        declined = body as Record<string, unknown>;
        return { id: ORDER_ID, status: "declined" };
      },
    });
    await mockBackend(page, routes);
    await page.goto("/ru/portal/advocate/opportunities");
    await page.getByRole("button", { name: "Отклонить" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Отклонить заказ" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Отклонить" }).click();
    await expect.poll(() => declined).not.toBeNull();
    expect(declined).toMatchObject({ reason_code: "busy" });
  });

  test("seller starts and completes paid work from the order page", async ({ page }) => {
    const state = { order: order({ status: "paid", payment_status: "paid", can_start: true, start_url: `/marketplace/me/orders/${ORDER_ID}/start`, can_complete: false }) };
    let completed: Record<string, unknown> | null = null;
    const routes = await signIn(page, ADVOCATE, {
      [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
      [`POST /marketplace/me/orders/${ORDER_ID}/start`]: () => {
        state.order = order({ status: "in_progress", payment_status: "paid", started_at: new Date().toISOString(), can_start: false, can_complete: true, complete_url: `/marketplace/me/orders/${ORDER_ID}/complete` });
        return state.order;
      },
      [`PATCH /orders/${ORDER_ID}/status`]: () => {
        state.order = order({ status: "in_progress", payment_status: "paid", started_at: new Date().toISOString(), can_start: false, can_complete: true, complete_url: `/marketplace/me/orders/${ORDER_ID}/complete` });
        return state.order;
      },
      "POST /.*/complete(-v2)?": (body: unknown) => {
        completed = body as Record<string, unknown>;
        state.order = order({ status: "completed", payment_status: "paid", completed_at: new Date().toISOString(), can_complete: false, chat_read_only: true });
        return state.order;
      },
    });
    const mock = await mockBackend(page, routes);
    await page.goto(`/ru/portal/advocate/marketplace-orders/${ORDER_ID}`);
    const phase = () => page.locator(".sx.mod").getAttribute("data-phase");
    await expect.poll(phase).toBe("paid");
    await page.getByRole("button", { name: "Начать работу" }).click();
    await page.getByRole("button", { name: "Да, начать" }).click();
    await expect.poll(phase).toBe("in_progress");
    await page.getByRole("button", { name: "Завершить" }).click();
    const done = page.getByRole("dialog", { name: "Завершить работу с результатом" });
    // A result is required: nothing goes out without text or a file.
    await expect(done.getByRole("button", { name: "Завершить с результатом" })).toBeDisabled();
    await done.getByRole("textbox").fill("Maslahat berildi, yozma xulosa tayyorlandi");
    await done.getByRole("button", { name: "Завершить с результатом" }).click();
    await expect.poll(() => completed).not.toBeNull();
    expect(JSON.stringify(completed)).toContain("Maslahat berildi, yozma xulosa tayyorlandi");
    await expect.poll(phase).toBe("completed");
    expect(mock.refused).toEqual([]);
  });
});
