import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, mockBackend, signIn } from "./mock";

// The external lawyer's professional profile: practice areas in words (not
// slugs), experience per category as cards with a sectioned form, and the
// services panel that says which services reach clients (25 Oct 2026).

const SHOTS = process.env.SHOTS ?? "";
const ME = {
  lawyer_name: "Test Advokat",
  region: "tashkent",
  specializations: ["fixture-nikoh-shartnomasi", "fixture-aliment-undirish", "oila-va-nikoh"],
  experience_years: 8,
  total_cases: 24,
  wins_count: 12,
  partial_wins_count: 5,
  success_rate: 71,
};
const CATS = [
  { id: "c-fam", slug: "oila-va-nikoh", name: "Оила ва никоҳ" },
  { id: "c-crim", slug: "jinoyat-ishlari", name: "Жиноят ишлари" },
];
const TREE = [{ id: "c-fam", title: "Оила ва никоҳ", children: [{ id: "s-ali", title: "Алимент ундириш" }] }];
const exp = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  root_id: id,
  version: 1,
  status,
  category_id: "c-fam",
  subcategory_id: "s-ali",
  workplace: "«Adolat» advokatlik byurosi",
  position: "Advokat",
  started_at: "2018-03-01",
  is_current: true,
  description: "Aliment undirish bo'yicha 40 dan ortiq ishni sudda yuritganman, asosan birinchi instansiyada.",
  stages: ["first_instance", "appeal"],
  results: ["claim_granted"],
  evidence: [{ id: "f1", file_name: "guvohnoma.pdf" }],
  years: status === "approved" ? 7 : null,
  ...extra,
});
const SERVICES = {
  items: [
    { id: "s1", title: "Ота-оналик ҳуқуқидан маҳрум қилиш", category_title: "Оила ва никоҳ", status: "active", configured_price: 879749, is_marketplace_visible: true },
    { id: "s2", title: "Qarzdorlikni undirish", category_title: "Qarz, pul va undirish", status: "active", configured_price: 0, is_marketplace_visible: false },
  ],
};

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  const routes = await signIn(page, ADVOCATE, {
    "/lawyers/me": ME,
    "/service-categories": CATS,
    "/service-categories/tree": TREE,
    "/marketplace/me/experience": { items: [exp("e1", "approved"), exp("e2", "rejected", { category_id: "c-crim", subcategory_id: "", rejection_reason: "Ish joyi dalili yetarli emas" })] },
    "/lawyers/me/services/manage": SERVICES,
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/advocate/profile");
  await page.getByRole("tab").nth(1).click();
}

test("practice areas read as words and services show who can see them", async ({ page }) => {
  await open(page, 1440);
  await expect(page.getByText("Nikoh shartnomasi")).toBeVisible();
  await expect(page.getByText("fixture-nikoh-shartnomasi")).toHaveCount(0);
  const svc = page.locator(".psv");
  await expect(svc.getByText("Ota-onalik huquqidan mahrum qilish")).toBeVisible();
  await expect(svc.getByText("1 ta xizmat mijozlarga ko'rinmayapti", { exact: false })).toBeVisible();
  await expect(svc.getByRole("link", { name: "Xizmatlarni boshqarish" })).toHaveAttribute("href", /\/portal\/advocate\/services$/);
  const xp = page.locator(".exp");
  await expect(xp.getByText("Oila va nikoh").first()).toBeVisible();
  await expect(xp.locator(".exp__card-t small").first()).toHaveText("Aliment undirish");
  await expect(xp.getByText("Rad etish sababi: Ish joyi dalili yetarli emas")).toBeVisible();
  if (SHOTS) {
    await xp.screenshot({ path: `${SHOTS}/exp-desktop.png` });
    await svc.screenshot({ path: `${SHOTS}/svc-desktop.png` });
  }
});

test("on a phone the experience form opens as a dialog and marks the first missing field", async ({ page }) => {
  await open(page, 390);
  const xp = page.locator(".exp");
  if (SHOTS) await xp.screenshot({ path: `${SHOTS}/exp-phone.png` });
  await xp.getByRole("button", { name: "Tajriba qo'shish" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Yangi tajriba" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Tekshiruvga yuborish" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Kategoriyani tanlang");
  await expect(dialog.locator(".dsel").first()).toHaveAttribute("data-invalid", "true");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/exp-phone-form.png`, fullPage: false });
});
