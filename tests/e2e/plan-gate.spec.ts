import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

// A used-up subscription limit (backend 2026-10-25: 402
// feature_limit_exhausted) explains what was reached and leads to the plans.
const SHOTS = process.env.SHOTS ?? "";
for (const width of [1440, 390]) {
  test(`document analysis at the limit shows the plan card (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const routes = await signIn(page, CLIENT, {
      "/document-service-settings/runtime": { settings: { allowed_formats: ["pdf", "doc", "docx"], max_file_mb: 25, included_pages: 10, modes: ["analysis"] }, version: 1 },
      "POST /ai/document-analysis/quote": { page_count: 1, total_amount: 0, base_amount: 0, included_pages: 10 },
      "POST /ai/document-analysis": {
        status: 402,
        json: { detail: { code: "feature_limit_exhausted", feature_key: "ai_document_analysis", mode: "limited", allowed: false, limit: 5, used: 5, remaining: 0, unit: "document", resets_at: "2026-11-24T00:00:00+00:00" } },
      },
    });
    await mockBackend(page, routes);
    await page.goto("/uz/portal/client/doc-analysis");
    await page.locator("textarea").first().fill("Ijara shartnomasi: ijarachi har oy 5 000 000 so'm to'laydi, shartnoma 12 oyga tuziladi.");
    await page.getByRole("button", { name: "Tahlil qilish" }).first().click();
    const card = page.locator(".pgate");
    await expect(card.getByText("Tarifingiz limiti tugadi")).toBeVisible();
    await expect(card.getByText("«Hujjat tahlili» uchun", { exact: false })).toBeVisible();
    await expect(card.getByText("5 / 5 ta hujjat ishlatildi", { exact: false })).toBeVisible();
    await expect(card.getByRole("link", { name: "Tarifni tanlash" })).toHaveAttribute("href", /\/portal\/client\/subscription$/);
    if (SHOTS) await card.screenshot({ path: `${SHOTS}/plan-gate-${width}.png` });
  });
}
