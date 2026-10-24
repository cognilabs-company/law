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

test("by service: a pick asks for the situation and lets the backend match the specialist", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let sent: Record<string, unknown> | null = null;
  const routes = await signIn(page, CLIENT, {
    "/marketplace/lawyers": { items: SELLERS, count: 3, total: 3 },
    "POST /orders": (b: unknown) => ((sent = b as Record<string, unknown>), { id: "ord-9", status: "new", service_id: "v1", source: "marketplace" }),
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/client/lawyers");
  await expect(page.getByRole("button", { name: "Mutaxassislar bo'yicha" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Xizmatlar bo'yicha" }).click();
  await expect(page).toHaveURL(/mode=services/);
  const card = page.getByRole("button", { name: /Ajrashish bo'yicha maslahat: 2 ta mutaxassis/ });
  await expect(card).toContainText(/250\s000 so.mdan/);
  await page.locator(".mksv").screenshot({ path: "/tmp/claude-1000/-home-abdurahmon-Desktop-law/1b23aff7-656c-46a8-a16f-81213b23ff98/scratchpad/shots/by-service.png" });
  await card.click();
  const dialog = page.getByRole("dialog", { name: "Ajrashish bo'yicha maslahat" });
  await dialog.getByRole("button", { name: "LexGo mutaxassis tanlasin" }).click();
  await expect(dialog.getByText("Kamida 15 ta belgi yozing")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Muammo tavsifi" }).fill("Turmush o'rtog'im bilan ajrashmoqchiman, aliment masalasi bor");
  await dialog.getByRole("combobox", { name: "Hudud" }).selectOption("tashkent");
  await page.screenshot({ path: "/tmp/claude-1000/-home-abdurahmon-Desktop-law/1b23aff7-656c-46a8-a16f-81213b23ff98/scratchpad/shots/by-service-dialog.png" });
  await dialog.getByRole("button", { name: "LexGo mutaxassis tanlasin" }).click();
  await expect(page).toHaveURL(/\/portal\/client\/marketplace-orders\/ord-9/);
  expect(sent).toMatchObject({ service_id: "v1", source: "marketplace", details: { region: "tashkent", problem: "Turmush o'rtog'im bilan ajrashmoqchiman, aliment masalasi bor", selected_option_ids: [] } });
  expect(sent).not.toHaveProperty("lawyer_user_id");
});

test("by service: 'I'll choose myself' shows that service's specialists", async ({ page }) => {
  const routes = await signIn(page, CLIENT, { "/marketplace/lawyers": { items: SELLERS, count: 3, total: 3 } });
  const mock = await mockBackend(page, routes);
  await page.goto("/uz/portal/client/lawyers?mode=services");
  await page.getByRole("button", { name: /Ajrashish bo'yicha maslahat: 2 ta mutaxassis/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "O'zim tanlayman" }).click();
  await expect(page.getByRole("button", { name: "Mutaxassislar bo'yicha" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Dilnoza Karimova").first()).toBeVisible();
  await expect(page.getByText("Akmal Yusupov").first()).toBeVisible();
  await expect(page.locator(".mk-grid")).not.toContainText("Nodira Rashidova");
  expect(mock.calls.some((c) => c.method === "POST" && c.path === "/orders")).toBe(false);
});
