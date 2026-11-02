import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CLIENT, mockBackend, signIn, type Who } from "./mock";

// LEXGO_ROLE_NAVIGATION_FRONTEND_2026_11_02.md: GET /me/navigation decides
// which pages a role profile loses. They leave every menu, their URLs land
// on default_route without the page ever mounting, and a
// role_page_access_denied from any API takes the user off the page.

const CLIENT_POLICY = {
  policy_version: "2026-11-02.1",
  role_profile: "client",
  hidden_page_ids: ["client_works", "problem_analysis", "academy"],
  hidden_pages: [
    { page_id: "client_works", title: "Mening ishlarim", routes: ["/portal/client/works"] },
    { page_id: "problem_analysis", title: "Muammo tahlili", routes: ["/portal/client/intake"] },
    { page_id: "academy", title: "Akademiya", routes: ["/portal/client/academy"] },
  ],
  hidden_routes: ["/portal/client/works", "/portal/client/intake", "/portal/client/academy"],
  default_route: "/portal/client",
  direct_navigation_denied: true,
};

const ADVOKAT_POLICY = {
  policy_version: "2026-11-02.1",
  role_profile: "advokat",
  hidden_page_ids: ["opportunities", "lawyer_works", "urgent_jobs", "lawyer_document_requests", "organization"],
  hidden_routes: ["/portal/advocate/opportunities", "/portal/advocate/cases", "/portal/advocate/urgent", "/portal/advocate/document-requests", "/portal/advocate/organization"],
  default_route: "/portal/advocate",
  direct_navigation_denied: true,
};

const NAVBATCHI: Who = { id: "u-duty", name: "Test Navbatchi", phone: "+998900000009", role: "lawyer", backendRole: "yurist" };
const NAVBATCHI_POLICY = {
  policy_version: "2026-11-02.1",
  role_profile: "navbatchi_yurist",
  hidden_page_ids: ["crm", "duty_services", "operator_chats", "remote_assistance"],
  hidden_routes: ["/crm", "/admin/crm", "/portal/call-center/crm"],
  default_route: "/portal/lawyer",
  direct_navigation_denied: true,
};

const sidebar = (page: Page) => page.locator(".psb__nav");
const link = (page: Page, href: string) => sidebar(page).locator(`a[href$="${href}"]`);

test.describe("role navigation policy", () => {
  test("client: removed pages leave the sidebar and their URLs land on the dashboard", async ({ page }) => {
    const routes = await signIn(page, CLIENT, { "/me/navigation": CLIENT_POLICY });
    const mock = await mockBackend(page, routes);
    await page.goto("/ru/portal/client");
    await expect(link(page, "/portal/client/documents")).toBeVisible();
    await expect(link(page, "/portal/client/works")).toHaveCount(0);
    await expect(link(page, "/portal/client/intake")).toHaveCount(0);
    await expect(link(page, "/portal/client/academy")).toHaveCount(0);

    for (const hidden of ["/ru/portal/client/works", "/ru/portal/client/works?type=document", "/ru/portal/client/academy", "/ru/portal/client/intake"]) {
      await page.goto(hidden);
      await expect(page).toHaveURL(/\/ru\/portal\/client$/);
      await expect(link(page, "/portal/client/documents")).toBeVisible();
    }
    // The blocked pages never mounted: none of their data was asked for.
    expect(mock.count("GET", /^\/clients\/me\/works/)).toBe(0);
    expect(mock.count("GET", /^\/me\/navigation$/)).toBeGreaterThan(0);
  });

  test("advokat: opportunities, works, urgent jobs, document requests and organization are gone", async ({ page }) => {
    const routes = await signIn(page, ADVOCATE, { "/me/navigation": ADVOKAT_POLICY });
    const mock = await mockBackend(page, routes);
    await page.goto("/ru/portal/advocate");
    await expect(link(page, "/portal/advocate/profile")).toBeVisible();
    for (const href of ["/opportunities", "/cases", "/urgent", "/document-requests", "/organization"]) {
      await expect(link(page, `/portal/advocate${href}`)).toHaveCount(0);
    }
    await page.goto("/ru/portal/advocate/organization");
    await expect(page).toHaveURL(/\/ru\/portal\/advocate$/);
    await page.goto("/ru/portal/advocate/document-requests");
    await expect(page).toHaveURL(/\/ru\/portal\/advocate$/);
    expect(mock.count("GET", /^\/lawyers\/me\/(cases|document-requests)/)).toBe(0);
    expect(mock.count("GET", /^\/organizations/)).toBe(0);
  });

  test("navbatchi yurist: a CRM or remote-assistance deep link lands on the lawyer cabinet", async ({ page }) => {
    const routes = await signIn(page, NAVBATCHI, { "/me/navigation": NAVBATCHI_POLICY });
    const mock = await mockBackend(page, routes);
    await page.goto("/ru/admin/crm/leads");
    await expect(page).toHaveURL(/\/ru\/portal\/lawyer$/);
    await page.goto("/ru/admin/remote-assistance");
    await expect(page).toHaveURL(/\/ru\/portal\/lawyer$/);
    expect(mock.count("GET", /^\/crm\//)).toBe(0);
  });

  test("a role_page_access_denied answer refetches the policy and leaves the page with a short notice", async ({ page }) => {
    let policyCalls = 0;
    const routes = await signIn(page, CLIENT, {
      // The first answer is stale (nothing hidden); the backend has moved on.
      "/me/navigation": () => (++policyCalls === 1 ? { ...CLIENT_POLICY, hidden_page_ids: [], hidden_pages: [], hidden_routes: [] } : CLIENT_POLICY),
      "/clients/me/works": {
        status: 403,
        json: { detail: { code: "role_page_access_denied", message: "Bu bo'lim sizning rolingiz uchun yopilgan", page_id: "client_works", role_profile: "client", default_route: "/portal/client", navigation_url: "/me/navigation" } },
      },
    });
    await mockBackend(page, routes);
    await page.goto("/ru/portal/client/works");
    await expect(page).toHaveURL(/\/ru\/portal\/client$/);
    await expect(page.locator(".ntf__t", { hasText: "Этот раздел закрыт для вашей роли" })).toBeVisible();
    await expect.poll(() => policyCalls).toBeGreaterThan(1);
    await expect(link(page, "/portal/client/works")).toHaveCount(0);
  });

  test("logout clears the cached policy; without one, nothing is hidden for a deployment that has no endpoint", async ({ page }) => {
    const routes = await signIn(page, CLIENT, { "/me/navigation": CLIENT_POLICY });
    await mockBackend(page, routes);
    await page.goto("/ru/portal/client");
    await expect(link(page, "/portal/client/documents")).toBeVisible();
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("lexgo_role_nav:")).length)).toBe(1);
    await page.locator(".psb__foot button").first().click();
    await expect(page).toHaveURL(/\/ru\/login/);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("lexgo_role_nav:")).length)).toBe(0);
  });

  test("an older backend without /me/navigation keeps every page", async ({ page }) => {
    const routes = await signIn(page, CLIENT, {});
    await mockBackend(page, routes);
    await page.goto("/ru/portal/client");
    await expect(link(page, "/portal/client/documents")).toBeVisible();
    await expect(link(page, "/portal/client/referrals")).toBeVisible();
  });

  test("a page the policy hides is taken out of a sidebar that still lists it", async ({ page }) => {
    // Works and academy left the client menu on 2026-11-02, so prove the
    // menu filter on a row the sidebar still has.
    const policy = {
      ...CLIENT_POLICY,
      hidden_page_ids: [...CLIENT_POLICY.hidden_page_ids, "referrals"],
      hidden_pages: [...CLIENT_POLICY.hidden_pages, { page_id: "referrals", title: "Takliflar", routes: ["/portal/client/referrals"] }],
      hidden_routes: [...CLIENT_POLICY.hidden_routes, "/portal/client/referrals"],
    };
    const routes = await signIn(page, CLIENT, { "/me/navigation": policy });
    await mockBackend(page, routes);
    await page.goto("/ru/portal/client");
    await expect(link(page, "/portal/client/documents")).toBeVisible();
    await expect(link(page, "/portal/client/referrals")).toHaveCount(0);
  });
});
