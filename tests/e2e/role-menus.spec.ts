import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, CLIENT, mockBackend, signIn, type Who } from "./mock";

const DUTY_LAWYER: Who = {
  id: "u-duty",
  name: "Test Navbatchi",
  phone: "+998900000011",
  role: "client",
  backendRole: "call_center",
  roles: ["call_center_lawyer"],
  permissions: ["orders.manage", "cases.manage", "templates.manage", "documents.manage", "callcenter.access", "meetings.manage"],
};

const SALES_OPERATOR: Who = {
  id: "u-sales-op",
  name: "Test Sotuv",
  phone: "+998900000012",
  role: "client",
  backendRole: "sales",
  roles: ["sales_operator"],
  permissions: ["orders.manage", "notifications.manage", "leads.manage", "sales.access", "crm.customers.view", "crm.leads.view"],
};

const LAWYER: Who = { id: "u-law", name: "Test Yurist", phone: "+998900000013", role: "lawyer", backendRole: "yurist" };

async function sidebarHrefs(page: Page, path: string) {
  const nav = page.locator(".psb__nav").first();
  await expect(nav.locator("a").first()).toBeVisible();
  const hrefs = await nav.locator("a").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  return hrefs.map((h) => h.replace(/^\/(uz|ru|en)/, "")).filter((h) => h.startsWith(path));
}

test("the duty lawyer has no CRM, duty desk, operator chats or remote assistance, even with the call_center primary role", async ({ page }) => {
  await mockBackend(page, await signIn(page, DUTY_LAWYER, {}));
  await page.goto("/uz/admin/call-center");
  await expect(page).not.toHaveURL(/\/admin\/call-center$/);
  const hrefs = await sidebarHrefs(page, "/admin");
  for (const gone of ["/admin/crm", "/admin/call-center", "/admin/call-center/support", "/admin/remote-assistance"]) expect(hrefs).not.toContain(gone);
  await page.goto("/uz/admin/remote-assistance");
  await expect(page).not.toHaveURL(/\/admin\/remote-assistance$/);
});

test("a plain call-center operator keeps the duty desk", async ({ page }) => {
  await mockBackend(page, await signIn(page, CALL_CENTER, {}));
  await page.goto("/uz/admin/meetings");
  expect(await sidebarHrefs(page, "/admin")).toContain("/admin/call-center");
});

test("the sales operator has no marketplace monitoring", async ({ page }) => {
  await mockBackend(page, await signIn(page, SALES_OPERATOR, {}));
  await page.goto("/uz/admin/marketplace");
  await expect(page).not.toHaveURL(/\/admin\/marketplace$/);
  expect(await sidebarHrefs(page, "/admin")).not.toContain("/admin/marketplace");
});

test("advocate and lawyer menus drop opportunities, cases, urgent work, document requests and organization", async ({ page }) => {
  await mockBackend(page, await signIn(page, ADVOCATE, {}));
  await page.goto("/uz/portal/advocate");
  const adv = await sidebarHrefs(page, "/portal/advocate");
  for (const gone of ["opportunities", "cases", "urgent", "document-requests", "organization"]) expect(adv).not.toContain(`/portal/advocate/${gone}`);
  expect(adv).toContain("/portal/advocate/services");
});

test("lawyer menu drops the job market, cases, urgent work and document requests", async ({ page }) => {
  await mockBackend(page, await signIn(page, LAWYER, {}));
  await page.goto("/uz/portal/lawyer");
  const law = await sidebarHrefs(page, "/portal/lawyer");
  for (const gone of ["marketplace", "cases", "urgent", "document-requests"]) expect(law).not.toContain(`/portal/lawyer/${gone}`);
  expect(law).toContain("/portal/lawyer/services");
});

test("client menu drops works, problem analysis, academy and gifts; gifts open as a tab of plans", async ({ page }) => {
  await mockBackend(page, await signIn(page, CLIENT, {}));
  await page.goto("/uz/portal/client");
  const cl = await sidebarHrefs(page, "/portal/client");
  for (const gone of ["works", "intake", "academy", "gifts"]) expect(cl).not.toContain(`/portal/client/${gone}`);
  expect(cl).toContain("/portal/client/subscription");
  await page.goto("/uz/portal/client/gifts");
  await expect(page).toHaveURL(/\/portal\/client\/subscription\?tab=gifts$/);
  await expect(page.getByRole("tab", { name: "Sovg'alar" })).toHaveAttribute("aria-selected", "true");
});
