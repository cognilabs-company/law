import { expect, test, type Page } from "@playwright/test";
import { CLIENT, mockBackend, signIn, type Routes } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// Rating and complaint: two separate actions in one 15-minute window
// (enterprise contract §9).
const inTen = () => new Date(Date.now() + 10 * 60_000).toISOString();
const completed = (extra: Record<string, unknown> = {}) =>
  order({
    status: "completed",
    payment_status: "paid",
    completed_at: new Date().toISOString(),
    result_text: "Maslahat berildi",
    rating: { available: true, deadline_at: inTen(), remaining_seconds: 600 },
    rating_url: `/marketplace/me/orders/${ORDER_ID}/rating`,
    complaint: { available: true, deadline_at: inTen() },
    chat_read_only: true,
    ...extra,
  });

async function openCompleted(page: Page, state: { order: Record<string, unknown> }, more: Routes = {}) {
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    ...more,
  });
  const mock = await mockBackend(page, routes);
  await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
  await expect(page.getByText("Оцените работу")).toBeVisible();
  return mock;
}

test.describe("rating and complaint", () => {
  test("rating and complaint are separate actions, each sent once", async ({ page }) => {
    const sent: { rating: unknown[]; complaint: unknown[] } = { rating: [], complaint: [] };
    const state = { order: completed() };
    const mock = await openCompleted(page, state, {
      [`POST /marketplace/me/orders/${ORDER_ID}/rating`]: (b: unknown) => {
        sent.rating.push(b);
        state.order = completed({ rating: { available: false, value: 4 }, complaint: { available: true, deadline_at: inTen() } });
        return {};
      },
      [`POST /marketplace/me/orders/${ORDER_ID}/complaint`]: (b: unknown) => {
        sent.complaint.push(b);
        state.order = completed({ rating: { available: false, value: 4 }, complaint: { available: false, status: "open" } });
        return { status: "open" };
      },
    });
    await page.getByRole("radio", { name: "4 звезды" }).click();
    await page.getByRole("button", { name: "Отправить оценку" }).click();
    await expect(page.getByText("Спасибо! Оценка принята.")).toBeVisible();
    expect(sent.rating).toEqual([{ rating: 4, comment: "" }]);

    // The complaint is still on offer and goes out on its own.
    await page.getByRole("button", { name: "Пожаловаться" }).click();
    const send = page.getByRole("button", { name: "Отправить жалобу" });
    await expect(send).toBeDisabled();
    await page.getByPlaceholder(/Что пошло не так/).fill("Natija kelishilgan hajmda emas, muddat ham o'tib ketdi");
    await send.evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });
    await expect(page.getByText("Жалоба отправлена — колл-центр её рассматривает.")).toBeVisible();
    expect(sent.complaint).toEqual([{ reason: "Natija kelishilgan hajmda emas, muddat ham o'tib ketdi" }]);
    expect(mock.refused).toEqual([]);
  });

  test("a 1–2 star rating opens the complaint itself; it is not asked for again", async ({ page }) => {
    const state = { order: completed() };
    const complaints: unknown[] = [];
    await openCompleted(page, state, {
      [`POST /marketplace/me/orders/${ORDER_ID}/rating`]: () => {
        state.order = completed({ rating: { available: false, value: 2 }, complaint: { available: false, status: "open" } });
        return {};
      },
      [`POST /marketplace/me/orders/${ORDER_ID}/complaint`]: (b: unknown) => (complaints.push(b), {}),
    });
    await page.getByRole("radio", { name: "2 звезды" }).click();
    // A low rating needs its reason.
    await expect(page.getByRole("button", { name: "Отправить оценку" })).toBeDisabled();
    await page.getByRole("textbox").first().fill("Javob kechikdi, natija to'liq emas");
    await page.getByRole("button", { name: "Отправить оценку" }).click();
    await expect(page.getByText("Низкая оценка отправлена в отдел качества").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Пожаловаться" })).toHaveCount(0);
    expect(complaints).toEqual([]);
  });

  test("a closed window removes the complaint action", async ({ page }) => {
    const state = { order: completed() };
    await openCompleted(page, state, {
      [`POST /marketplace/me/orders/${ORDER_ID}/complaint`]: { status: 409, json: { detail: { code: "complaint_window_closed", message: "Shikoyat muddati tugagan" } } },
    });
    await page.getByRole("button", { name: "Пожаловаться" }).click();
    await page.getByPlaceholder(/Что пошло не так/).fill("Natija kelishilgan hajmda emas, muddat o'tdi");
    await page.getByRole("button", { name: "Отправить жалобу" }).click();
    await expect(page.getByRole("button", { name: "Отправить жалобу" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Пожаловаться" })).toHaveCount(0);
  });

  test("nothing is offered once the backend closes both", async ({ page }) => {
    const routes = await signIn(page, CLIENT, {
      [`/marketplace/me/orders/${ORDER_ID}`]: completed({ rating: { available: false, closed: true }, complaint: { available: false } }),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    });
    await mockBackend(page, routes);
    await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
    await expect(page.locator(".mod-price")).toBeVisible();
    await expect(page.getByRole("button", { name: "Отправить оценку" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Пожаловаться" })).toHaveCount(0);
  });
});
