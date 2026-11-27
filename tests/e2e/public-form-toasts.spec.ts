import { expect, test } from "@playwright/test";
import { mockBackend } from "./mock";

// The public forms' results show as a notification at the top of the screen,
// not as a box under the form (owner, 2026-11-27).

test("the contact form's success shows as a notification, not under the form", async ({ page }) => {
  const mock = await mockBackend(page, { "POST /leads": { id: "l1" } });
  await page.goto("/ru/contact", { waitUntil: "networkidle" });
  await page.locator("#c-name").fill("Тест");
  await page.locator("#c-contact").fill("+998 90 000 00 00");
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page.locator(".ntf__t")).toHaveText("Спасибо! Дежурный адвокат свяжется с вами в ближайшее время.");
  await expect(page.locator(".cform__ok")).toHaveCount(0);
  expect(mock.count("POST", /^\/leads$/)).toBe(1);
  const box = await page.locator(".ntf__in").first().boundingBox();
  expect(box!.y).toBeLessThan(200);
  await expect(page.locator("#c-name")).toHaveValue("");
});

test("missing fields and a failed send are notifications too", async ({ page }) => {
  await mockBackend(page, { "POST /leads": () => ({ status: 500, json: { detail: "boom" } }) });
  await page.goto("/uz/contact", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Arizani yuborish" }).click();
  await expect(page.locator(".ntf__t")).toHaveText("Iltimos, majburiy maydonlarni to'ldiring.");
  await page.locator("#c-name").fill("Test");
  await page.locator("#c-contact").fill("+998 90 000 00 00");
  await page.getByRole("button", { name: "Arizani yuborish" }).click();
  await expect(page.locator(".ntf__t")).toHaveText("Yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring.");
  await expect(page.locator("#c-name")).toHaveValue("Test");
});
