import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

// Platform policies are edited field by field at every depth — a group of
// settings under its heading, a list of rows that can be added and removed
// — never as a raw JSON box, and the saved body keeps every type.

const SECURITY = {
  session_minutes: 30,
  require_2fa: true,
  allowed_countries: ["UZ", "KZ"],
  lockout: { max_attempts: 5, window_minutes: 15 },
  ip_rules: [{ cidr: "10.0.0.0/8", note: "Ofis", enabled: true }],
};

test("a nested policy is edited in fields, rows are added, types are kept", async ({ page }) => {
  const saved: unknown[] = [];
  const routes = await signIn(page, ADMIN, {
    "/admin/platform/policies": { items: { security: SECURITY } },
    "PUT /admin/platform/policies/security": (body: unknown) => {
      saved.push(body);
      return { ok: true };
    },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/admin/policies");
  const card = page.locator(".polcard", { hasText: "Безопасность" }).first();
  await card.getByRole("button", { name: "Изменить" }).click();

  const dialog = page.getByRole("dialog", { name: "Безопасность — изменить правила" });
  await expect(dialog).toBeVisible();
  // No JSON box and no braces anywhere.
  await expect(dialog.locator("textarea")).toHaveCount(0);
  await expect(dialog).not.toContainText("{");
  await expect(dialog.locator("legend", { hasText: "Lockout" })).toBeVisible();

  // A nested number: a typo is refused in words and blocks saving.
  const attempts = dialog.getByLabel("Max attempts");
  await attempts.fill("5x");
  await expect(dialog).toContainText("Введите число.");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  expect(saved).toHaveLength(0);
  await attempts.fill("7");

  // A list of rows: add one shaped like the first, fill it in.
  await dialog.getByRole("button", { name: "Добавить строку" }).click();
  const rows = dialog.locator(".polform__row");
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByLabel("Cidr").fill("192.168.0.0/16");

  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0]).toEqual({
    ...SECURITY,
    lockout: { max_attempts: 7, window_minutes: 15 },
    ip_rules: [SECURITY.ip_rules[0], { cidr: "192.168.0.0/16", note: "", enabled: false }],
  });
  expect(mock.refused).toEqual([]);
});
