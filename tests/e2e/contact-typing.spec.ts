import { expect, test, type Locator, type Page } from "@playwright/test";
import { ADVOCATE, CLIENT, mockBackend, signIn } from "./mock";

// Typing a contact while writing, fast: the field keeps focus, the caret
// stays where the writer is, and a keystroke in the middle that would turn
// their own words into a contact ("@" before "yozing") is refused instead
// of eating those words.

const SELLER = "u-adv";
async function probe(page: Page, field: Locator, label: string) {
  await field.click();
  await field.fill("");
  // Fast typing, a phone at the end, then more words.
  await field.pressSequentially("Salom +998 90 123 45 67 yozing", { delay: 0 });
  await page.waitForTimeout(300);
  const focused = await field.evaluate((el) => el === document.activeElement);
  await field.pressSequentially(" davomi", { delay: 0 });
  // A handle typed in the middle: the caret must stay where the user is.
  await field.press("Home");
  for (let i = 0; i < 6; i++) await field.press("ArrowRight");
  await field.pressSequentially("@akmal_law ok ", { delay: 0 });
  await page.waitForTimeout(300);
  const focused2 = await field.evaluate((el) => el === document.activeElement);
  const value = await field.inputValue();
  return { focused: focused && focused2, value, label };
}

test("purchase dialog note", async ({ page }) => {
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Test Advokat", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true },
    [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "Test xizmat", base_price: 100000, selected_price: 100000, effective_price: 100000, currency: "UZS" }] },
    "POST /marketplace/services/svc-1/quote": { base_price: 100000, total_price: 100000, currency: "UZS", breakdown: [] },
  });
  await mockBackend(page, routes);
  await page.goto(`/uz/lawyers/${SELLER}`);
  await page.getByRole("button", { name: "Sotib olish" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Xizmatni sotib olish" });
  const r = await probe(page, dialog.getByRole("textbox").first(), "purchase");
  expect(r).toEqual({ focused: true, value: "Salom akmal_law ok yozing davomi", label: "purchase" });
});

test("chat composer", async ({ page }) => {
  const routes = await signIn(page, CLIENT, {
    "/secure-chats/room-1/messages": { items: [] },
    "/secure-chats/room-1": { id: "room-1", title: "Test", participants: [{ user_id: "u-client" }, { user_id: "u-adv", name: "Test Advokat" }] },
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/chat/room-1");
  // The chat keeps the text and refuses only the send (its own design).
  const r = await probe(page, page.getByPlaceholder(/Xabar yozing/), "chat");
  expect(r.focused).toBe(true);
});

test("experience description", async ({ page }) => {
  const routes = await signIn(page, ADVOCATE, {
    "/lawyers/me": { lawyer_name: "Test Advokat", region: "tashkent", bio: "", languages: ["uz"], specializations: [], experience_years: 8 },
    "/service-categories": [{ id: "c1", name: "Оила ва никоҳ", slug: "oila-va-nikoh" }],
    "/marketplace/me/experience": { items: [], groups: [] },
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/advocate/profile");
  await page.getByRole("tab").nth(1).click();
  const cat = page.locator(".exp:not(.ach):not(.exp--pre):not(.prc)");
  await cat.getByRole("button").first().click();
  const r = await probe(page, page.locator("#exp-form-category_experience textarea[aria-describedby]"), "experience");
  expect(r).toEqual({ focused: true, value: "Salom akmal_law ok yozing davomi", label: "experience" });
});
