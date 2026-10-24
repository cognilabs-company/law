import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

// Browsing the marketplace by service: every service as a card with how
// many specialists offer it; picking one shows exactly those specialists.
const svc = (id: string, title: string, cat: string, price: number) => ({ service_id: id, title, category_id: cat, category_title: cat, base_price: price, selected_price: price, effective_price: price, currency: "UZS" });
const seller = (id: string, name: string, rating: number, services: unknown[]) => ({ user_id: id, name, seller_type: "advokat", region: "tashkent", rating, reviews_count: 5, is_verified: true, services });
const SELLERS = [
  seller("s1", "Dilnoza Karimova", 4.9, [svc("v1", "Ajrashish bo'yicha maslahat", "c-family", 300000), svc("v2", "Aliment undirish", "c-family", 450000)]),
  seller("s2", "Akmal Yusupov", 4.6, [svc("v1", "Ajrashish bo'yicha maslahat", "c-family", 250000)]),
  seller("s3", "Nodira Rashidova", 4.8, [svc("v3", "Meros rasmiylashtirish", "c-inherit", 500000)]),
];

test("by service: cards with counts, and a pick finds that service's specialists", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const routes = await signIn(page, CLIENT, { "/marketplace/lawyers": { items: SELLERS, count: 3, total: 3 } });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/client/lawyers");
  await expect(page.getByRole("button", { name: "Mutaxassislar bo'yicha" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Xizmatlar bo'yicha" }).click();
  await expect(page).toHaveURL(/mode=services/);
  const card = page.getByRole("button", { name: /Ajrashish bo'yicha maslahat: 2 ta mutaxassis/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText(/250\s000 so.mdan/);
  await page.locator(".mksv").screenshot({ path: "/tmp/claude-1000/-home-abdurahmon-Desktop-law/1b23aff7-656c-46a8-a16f-81213b23ff98/scratchpad/shots/by-service.png" });
  await card.click();
  await expect(page.getByRole("button", { name: "Mutaxassislar bo'yicha" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Dilnoza Karimova").first()).toBeVisible();
  await expect(page.getByText("Akmal Yusupov").first()).toBeVisible();
  await expect(page.locator(".mk-grid")).not.toContainText("Nodira Rashidova");
});
