import { test, type Page } from "@playwright/test";
import { ADMIN, ADVOCATE, CLIENT, mockBackend, signIn, type Routes, type Who } from "./mock";
import { OPERATOR, crmServer } from "./crmServer";

// Before/after screenshots for the unstyled-UI audit
// (docs/LEXGO_UNSTYLED_UI_AUDIT_2026_11_08.md): every page state that got a
// real fix, in uz/ru/en × desktop/390px × light/dark. Run explicitly (it is in
// testIgnore) with SHOTS_DIR set; the same file names on both sides.

const DIR = process.env.SHOTS_DIR || "/tmp/lexgo-design-audit/after";
const LOCALES = ["uz", "ru", "en"] as const;
const VIEWS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;
const THEMES = ["light", "dark"] as const;
type Locale = (typeof LOCALES)[number];

type State = {
  name: string;
  who: Who | null;
  routes: () => Routes;
  url: (l: Locale) => string;
  init?: (page: Page) => Promise<void>;
  act?: (page: Page) => Promise<void>;
  // The region to frame (falls back to the viewport).
  focus?: string;
};

// A full admin who also works the call-center queues: the admin console
// shows every queue tab (the operator role gets the separate workspace).
const CC_ADMIN: Who = { id: "u-ccadmin", name: "Test Admin", phone: "+998900000011", role: "client", backendRole: "admin", roles: ["admin"], permissions: ["callcenter.access"] };

const iso = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

const STATES: State[] = [
  {
    name: "crm-customer-tabs",
    who: OPERATOR,
    routes: () => crmServer(OPERATOR.permissions ?? []).routes as Routes,
    url: (l) => `/${l}/admin/call-center?view=crm&s=customers&customer=c1`,
    act: async (page) => {
      await page.locator(".opx-cd-tabs").waitFor({ timeout: 15_000 });
    },
    focus: ".opx-cd",
  },
  {
    name: "crm-customer-orders-tab",
    who: OPERATOR,
    routes: () => crmServer(OPERATOR.permissions ?? []).routes as Routes,
    url: (l) => `/${l}/admin/call-center?view=crm&s=customers&customer=c1`,
    act: async (page) => {
      await page.locator(".opx-cd-tabs [role=tab]").nth(1).click({ timeout: 15_000 });
    },
    focus: ".opx-cd-feed",
  },
  {
    name: "crm-lead-pane-menu",
    who: OPERATOR,
    routes: () => crmServer(OPERATOR.permissions ?? []).routes as Routes,
    url: (l) => `/${l}/admin/call-center?view=crm&s=leads&lead=m1&pane=history`,
    act: async (page) => {
      // The feed card's own "⋯" (the pane switcher), not the lead header's.
      const feed = page.locator(".opx-cd-feed").filter({ has: page.locator(".opx-cd-menu") }).first();
      await feed.locator(".opx-cd-menu .opx-jr-more").click({ timeout: 15_000 });
      await feed.locator(".opx-cd-pop[role=menu]").waitFor({ timeout: 15_000 });
      await feed.scrollIntoViewIfNeeded({ timeout: 15_000 });
    },
  },
  {
    name: "cc-cancellations",
    who: CC_ADMIN,
    routes: () => ({
      "/call-center/marketplace/cancellation-reviews": {
        items: [
          { id: "r1", order_id: "o1", status: "open", reason: "Mijoz fikridan qaytdi", work_id: "LX-1042", service_title: "Shartnoma ekspertizasi", client_name: "Aziz Karimov", created_at: iso(-90) },
          { id: "r2", order_id: "o2", status: "open", reason: "Muddat o'tdi", work_id: "LX-1043", service_title: "Da'vo arizasi", client_name: "Dilnoza Karimova", created_at: iso(-30) },
        ],
        count: 2,
        total: 60,
      },
    }),
    url: (l) => `/${l}/admin/call-center?tab=cancellations`,
  },
  {
    name: "admin-payouts-status",
    who: ADMIN,
    routes: () => ({
      "/admin/payouts": { items: [{ id: "p1", payment_id: "pay1", gross_amount: 100000, platform_fee: 10000, status: "on_hold" }] },
      "/payments/reconciliation": {},
    }),
    url: (l) => `/${l}/admin/payouts`,
  },
  {
    name: "admin-audit-outcome",
    who: ADMIN,
    routes: () => ({
      "/admin/audit-trail": {
        items: [
          { id: "a1", action: "login", outcome: "auth_failed", created_at: "2026-11-08T09:00:00Z" },
          { id: "a2", action: "export", outcome: "partial", created_at: "2026-11-08T09:05:00Z" },
        ],
      },
    }),
    url: (l) => `/${l}/admin/audit-trail`,
  },
  {
    name: "portal-promo-pending",
    who: ADVOCATE,
    routes: () => ({
      "/promotions/me": { items: [], by_placement: {} },
      "/promotions/analytics": {},
      "/promotions/packages": { items: [] },
      "/notifications": { items: [] },
    }),
    init: async (page) => {
      await page.addInitScript((uid) => {
        localStorage.setItem(
          `lexgo_promo_pending_${uid}`,
          JSON.stringify({ profile: { requestId: "req-1", packageTitle: "Profil boost · 7 kun", amount: 150000, currency: "UZS", telegramSent: true, at: Date.now() } }),
        );
      }, ADVOCATE.id);
    },
    url: (l) => `/${l}/portal/advocate/promotion`,
    act: async (page) => {
      await page.locator(".promo__pend").first().scrollIntoViewIfNeeded({ timeout: 15_000 });
    },
  },
  {
    name: "portal-doc-rating-closed",
    who: CLIENT,
    routes: () => {
      const doc = { id: "dr-1", status: "file_ready", mode: "manual", title: "Ijara shartnomasi", created_at: "2026-11-01T10:00:00Z" };
      const rated = { ...doc, rating_available: false, rating_submitted: false, rating_deadline_at: "2026-11-01T10:15:00Z", rating_closed_reason: "expired" };
      return { "/document-requests/service-flow": { items: [rated], total: 1 }, "/document-requests/dr-1": rated };
    },
    url: (l) => `/${l}/portal/client/documents`,
    act: async (page) => {
      await page.locator(".drate--shut").first().scrollIntoViewIfNeeded({ timeout: 15_000 });
    },
  },
  {
    name: "portal-doc-handoff-note",
    who: CLIENT,
    routes: () => ({
      "POST /ai/document-analysis/quote": { price: 0, free: true, total: 0, currency: "UZS" },
      "POST /ai/document-analysis/file": {
        summary: "Shartnomada xavfli bandlar bor.",
        risks: [{ level: "high", text: "Bir tomonlama bekor qilish huquqi" }],
        recommendations: ["Bekor qilish shartini ikki tomonlama qiling"],
        page_count: 2,
        upsell_offer: { available: true, title: "Advokat tekshiruvi", reason: "Shartnomada xavfli bandlar bor" },
      },
      "POST /document-services/review-existing/request": { status: 500, json: { detail: "mocked failure" } },
    }),
    url: (l) => `/${l}/portal/client/doc-analysis`,
    act: async (page) => {
      await page.locator('input[type="file"]').first().setInputFiles({ name: "shartnoma.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%mock\n") });
      await page.locator('[data-ai-target="button:doc-analysis-run"]').click({ timeout: 15_000 });
      await page.locator(".docup .btn--grad").first().click({ timeout: 15_000 });
      await page.locator(".docup__note").first().waitFor({ timeout: 15_000 });
      await page.locator(".docup").first().scrollIntoViewIfNeeded({ timeout: 15_000 });
    },
    focus: ".docup",
  },
  {
    name: "map-manual-pick",
    who: CLIENT,
    routes: () => ({ "/marketplace/map/config": { status: 500, json: { detail: "mocked" } } }),
    init: async (page) => {
      await page.addInitScript(() => {
        const deny = (_ok: unknown, err?: (e: { code: number; message: string }) => void) => err?.({ code: 1, message: "denied" });
        Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: deny, watchPosition: (a: unknown, b?: (e: { code: number; message: string }) => void) => (deny(a, b), 0), clearWatch: () => {} } });
      });
    },
    url: (l) => `/${l}/lawyers`,
    act: async (page) => {
      // Map view, then its "Nearby" asks for the position; the browser says no.
      await page.locator('[data-ai-id="marketplace.mode.nearby"]').first().click({ timeout: 15_000 });
      await page.locator('[data-ai-id="marketplace.nearby.locate"]').first().click({ timeout: 15_000 });
      await page.locator('[data-ai-id="marketplace.map.manual.start"]').first().click({ timeout: 15_000 });
      await page.locator(".mmman__head").first().waitFor({ timeout: 15_000 });
      await page.locator(".mmman__head").first().scrollIntoViewIfNeeded({ timeout: 15_000 });
    },
  },
  {
    name: "register-advocate-benefit",
    who: null,
    routes: () => ({}),
    // A saved half-finished advocate sign-up resumes on the professional step
    // (RegisterFlow lexgo_reg_draft), where the tenure card sits.
    init: async (page) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          "lexgo_reg_draft",
          JSON.stringify({ at: Date.now(), idx: 3, agreed: {}, draft: { accountType: "advocate", phone: "+998901112233", profile: { firstName: "Aziz", lastName: "Karimov", region: "tashkent_city" } } }),
        );
      });
    },
    url: (l) => `/${l}/register`,
    act: async (page) => {
      await page.locator(".rf__tenure").first().waitFor({ timeout: 15_000 });
      await page.locator(".rf__tenure").first().scrollIntoViewIfNeeded({ timeout: 15_000 });
    },
  },
];

for (const st of STATES) {
  test.describe(st.name, () => {
    for (const locale of LOCALES) {
      for (const [view, size] of Object.entries(VIEWS)) {
        for (const theme of THEMES) {
          test(`${locale} ${view} ${theme}`, async ({ page }) => {
            await page.setViewportSize(size);
            await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
            await page.addInitScript((t) => {
              localStorage.setItem("lexgo_theme", t);
              localStorage.setItem("lexgo_ccx_prefs", JSON.stringify({ theme: t, bg: "night", motion: false, keys: true }));
              localStorage.setItem("lexgo_ccx_intro", "1");
            }, theme);
            const routes = st.routes();
            await mockBackend(page, st.who ? await signIn(page, st.who, routes) : routes);
            if (st.init) await st.init(page);
            await page.goto(st.url(locale));
            await page.waitForLoadState("networkidle").catch(() => undefined);
            if (st.act) {
              try {
                await st.act(page);
              } catch (e) {
                await page.screenshot({ path: `${DIR}/${st.name}-${locale}-${view}-${theme}-FAILED.png` });
                throw e;
              }
            }
            await page.waitForTimeout(600);
            const file = `${DIR}/${st.name}-${locale}-${view}-${theme}.png`;
            const region = st.focus ? page.locator(st.focus).first() : null;
            if (region && (await region.isVisible().catch(() => false))) await region.screenshot({ path: file });
            else await page.screenshot({ path: file });
          });
        }
      }
    }
  });
}
