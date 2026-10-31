import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

// Answers 2026-10-31 §2.5: the tariff page shows the backend's amount for
// the chosen period and works no discount out itself — no term table, no
// 3-month term the backend can't bill, no local usage counter. What a
// checkout is asked to charge is the same backend amount.
const PRO = { id: "p-pro", slug: "lexgo-ai-pro", name: "LexGo.AI Pro", price: 99000, monthly_price: 99000, six_month_price: 600000, yearly_price: 1100000, prepaid_yearly_price: 1000000, is_active: true, audiences: ["client"], entitlements: { ai_requests: 1000 } };
const FREE = { id: "p-free", slug: "lexgo-ai-free", name: "LexGo.AI Free", price: 0, monthly_price: 0, is_active: true, audiences: ["client"], entitlements: { ai_requests: 5 } };
// Deliberately not any discount table's numbers.
const QUOTES: Record<string, Record<string, unknown>> = {
  monthly: { months: 1, base_amount: 99000, discount_amount: 0, amount: 99000 },
  six_month: { months: 6, base_amount: 564300, discount_amount: 0, amount: 564300 },
  yearly: { months: 12, base_amount: 1069200, discount_amount: 69200, amount: 1000000, campaign: { id: "c1", title: "Kuzgi chegirma", discount_type: "fixed", discount_value: 69200 } },
  prepaid_yearly: { months: 12, base_amount: 962280, discount_amount: 0, amount: 962280 },
};

test("plan cards show the backend's quote for the period and no discount of their own", async ({ page }) => {
  const asked: string[] = [];
  await page.addInitScript(() => localStorage.setItem(`lexgo_ai_used_u-client_${new Date().getFullYear()}-${new Date().getMonth() + 1}`, "4"));
  const routes = await signIn(page, CLIENT, {
    "/subscription-plans": [FREE, PRO],
    "/subscription-plans/p-pro/quote": (_b: unknown, url: URL) => {
      const period = url.searchParams.get("billing_period") ?? "monthly";
      asked.push(period);
      return { plan_id: "p-pro", billing_period: period, currency: "UZS", campaign: null, ...QUOTES[period] };
    },
  });
  await mockBackend(page, routes);
  await page.goto("/ru/portal/client/subscription");
  const card = page.locator('[data-ai-id="pricing.plan.lexgo-ai-pro"]');
  await expect(card).toContainText(/99[\s  ]000/);
  const terms = page.locator('[data-ai-id="pricing.billing"]');
  // The terms the backend sells; no hard-coded "−5%" chips on them.
  await expect(terms.getByRole("button")).toHaveCount(3);
  await expect(terms).not.toContainText("%");
  await expect(terms).not.toContainText("3");

  await terms.getByRole("button", { name: "6 мес" }).click();
  // 564 300 / 6 = 94 050 a month; the saving read off the backend's amounts.
  await expect(card).toContainText(/94[\s  ]050/);
  await expect(card).toContainText(/564[\s  ]300/);
  await expect(card).toContainText("−5%");

  await terms.getByRole("button", { name: "12 мес" }).click();
  await expect(card).toContainText(/Kuzgi chegirma: 1[\s  ]000[\s  ]000/);
  await page.getByText("Оплатить год сразу", { exact: true }).click();
  await expect(card).toContainText(/80[\s  ]190/);
  expect(asked).toEqual(expect.arrayContaining(["monthly", "six_month", "yearly", "prepaid_yearly"]));
  // The free card never shows a usage count kept in the browser.
  await expect(page.locator('[data-ai-id="pricing.plan.lexgo-ai-free"]')).not.toContainText("4 из");
  // The compare table reads the plan's own limit.
  await expect(page.locator('[data-ai-id="pricing.compare"]')).toContainText("1000");
  if (process.env.PLAN_SHOTS) {
    const dir = process.env.PLAN_SHOTS;
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((th) => document.documentElement.setAttribute("data-theme", th), theme);
      for (const w of [1440, 390]) {
        await page.setViewportSize({ width: w, height: 900 });
        await card.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${dir}/plan-amounts-${w}-${theme}.png` });
      }
    }
  }
});
