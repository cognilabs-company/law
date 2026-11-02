import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { ADVOCATE, CLIENT, mockBackend, signIn, type Mock, type Routes } from "./mock";
import { installYmapsStub } from "./ymapsStub";
import { ORDER_ID, order } from "./fixtures";

// The marketplace map (LEXGO_YANDEX_MARKETPLACE_MAP_FRONTEND_2026_10_30):
// the list stands in when the map is off or Yandex can't load, location is
// asked only after a click and recorded as consent, the nearby search
// explains a nearest-fallback, routes come only from the backend, and a
// seller saves (and removes) an office location. Backend answers 2026-10-31
// §7: the map is Yandex Maps JS API 2.1, loaded only from the config's
// maps_loader_url; the geocoder's key is refused in production, so address
// search falls back to picking the point on the map. The real Yandex script
// never loads here: the loader URL serves a 2.1 stand-in (ymapsStub.ts).
// Screenshots: MAP_SHOTS=<dir> (e.g. /tmp/lexgo-answers/map).

// MAP_VIEW=390x844 and MAP_SCHEME=light|dark size and colour the run.
const SHOTS = process.env.MAP_SHOTS ?? "";
const VIEW = (process.env.MAP_VIEW ?? "").split("x").map(Number);
const SCHEME = process.env.MAP_SCHEME === "light" || process.env.MAP_SCHEME === "dark" ? process.env.MAP_SCHEME : null;

test.beforeEach(async ({ page }) => {
  if (VIEW.length === 2 && VIEW.every((n) => n > 0)) await page.setViewportSize({ width: VIEW[0], height: VIEW[1] });
  if (SCHEME) await page.emulateMedia({ colorScheme: SCHEME });
});
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const WEB_ROUTE = "https://yandex.uz/maps/?rtext=41.3,69.24~41.31,69.28&rtt=pd";

const nav = (id: string, available: boolean) => ({
  available,
  public_office_available: available,
  endpoint: `/marketplace/sellers/${id}/navigation`,
  modes: ["driving", "walking", "transit", "bicycle"],
});
const marker = (id: string, name: string, type: string, rating: number, source: string, navOn = false) => ({
  seller_user_id: id,
  public_id: `LG-${id.slice(0, 6).toUpperCase()}`,
  display_name: name,
  seller_type: type,
  latitude: 41.3,
  longitude: 69.24,
  coordinates: [69.24, 41.3],
  location_precision: source === "profile_region" ? "region" : "approximate_500m",
  location_source: source,
  rating,
  reviews_count: 4,
  is_verified: true,
  region: "Toshkent",
  navigation_available: navOn,
  navigation: nav(id, navOn),
  service_action: null,
});
const S1 = "0b9c2c4e-1a2b-4c3d-8e9f-111111111111";
const S2 = "0b9c2c4e-1a2b-4c3d-8e9f-222222222222";
const MARKERS = [marker(S1, "Dilnoza Karimova", "advokat", 4.9, "office", true), marker(S2, "Akmal Yusupov", "yurist", 4.6, "profile_region")];
// §7.3 service_action: its `id` is the service (there is no service_id).
const ACTION = { id: "svc-77", title: "Aliment undirish", price: 300000, currency: "UZS", can_purchase: true, purchase_url: "/marketplace/services/svc-77/purchase" };
const HITS = [
  { ...marker(S1, "Dilnoza Karimova", "advokat", 4.9, "office", true), distance_km: 14.2, service_action: ACTION },
  { ...marker(S2, "Akmal Yusupov", "yurist", 4.6, "live"), distance_km: 31.6 },
];

const MAPS_KEY = "0f0f0f0f-1111-2222-3333-444444444444";
const LOADER = `https://api-maps.yandex.ru/2.1/?apikey=${MAPS_KEY}&lang=uz_UZ`;
const config = (configured: boolean, apiVersion = "2.1") => ({
  provider: "yandex",
  api_version: apiVersion,
  maps_api_key: configured ? MAPS_KEY : "",
  maps_loader_url: configured ? LOADER : "",
  configured,
  default_location: { center: [69.2401, 41.2995], zoom: 11, country_bbox: [55.9, 37.1, 73.2, 45.7] },
  seller_map_url: "/marketplace/sellers/map",
  nearby_search_url: "/marketplace/nearby-sellers/search",
  location_consent_url: "/marketplace/me/location-consent",
  seller_office_location_url: "/marketplace/me/office-location",
  navigation_url_template: "/marketplace/sellers/{seller_user_id}/navigation",
  geocoder_search_url: "/marketplace/geocoder/search",
  geocoder_reverse_url: "/marketplace/geocoder/reverse",
  geocoder_configured: true,
  coordinate_order: "longitude_latitude",
  viewport_debounce_ms: 400,
  consent_policy: { allowed_duration_hours: [1, 24, 168, 720], default_duration_hours: 24 },
  accuracy_warning_threshold_meters: 500,
  realtime: { websocket_url: "/ws/users/me", subscribe_event: "marketplace.map.subscribe", unsubscribe_event: "marketplace.map.unsubscribe", subscribed_event: "marketplace.map.subscribed", update_event: "marketplace.seller_location_updated" },
  privacy: { public_marker_precision: "approximate_500m", nearby_precision: "approximate_50m" },
});
const consent = (granted: boolean, source = "web") => ({
  granted,
  permission_state: granted ? "granted" : "denied",
  source,
  expires_at: granted ? new Date(Date.now() + 24 * 3600_000).toISOString() : null,
  policy: {},
});
// §7.2: normalized items with latitude/longitude; coordinate_order is longitude_latitude.
const PLACES = {
  items: [{ id: "geo-1", name: "Amir Temur ko'chasi, 1", description: "Toshkent, O‘zbekiston", formatted_address: "Toshkent, Yunusobod tumani, Amir Temur ko'chasi, 1", latitude: 41.311, longitude: 69.279, precision: "exact", kind: "house", country_code: "UZ", components: {} }],
  count: 1,
  found: 1,
  provider: "yandex",
  cached: false,
  rate_limit_remaining: 59,
  coordinate_order: "longitude_latitude",
};
// What the deployed geocoder answers today (§7.1): the provider refuses the key.
const GEOCODER_DOWN = { status: 403, json: { detail: { code: "yandex_geocoder_key_invalid" } } };

function mapRoutes(opts: { configured: boolean; search?: (b: unknown) => unknown; queries?: URLSearchParams[] }): Routes {
  return {
    "/marketplace/lawyers": { items: [], count: 0, total: 0 },
    "/marketplace/map/config": config(opts.configured),
    "/marketplace/sellers/map": (_b: unknown, url: URL) => {
      opts.queries?.push(url.searchParams);
      return { items: MARKERS, markers: MARKERS, clusters: [], count: 2, total_in_bbox: 2, truncated: false, location_precision: "mixed", coordinate_order: "longitude_latitude" };
    },
    "/marketplace/me/location-consent": { granted: false, permission_state: "prompt", source: "web", policy: {} },
    "POST /marketplace/me/location-consent": (b: unknown) => {
      const body = b as { granted: boolean; source: string };
      return consent(body.granted, body.source);
    },
    "POST /marketplace/nearby-sellers/search":
      opts.search ??
      (() => ({
        items: HITS,
        count: 2,
        radius_km: 10,
        fallback_nearest: true,
        sort: "nearest",
        location_not_persisted: true,
        accuracy_meters: 900,
        accuracy_warning: true,
        accuracy_warning_threshold_meters: 500,
        consent: consent(true),
      })),
    "/marketplace/geocoder/search": PLACES,
    "/marketplace/geocoder/reverse": PLACES,
  };
}

// Every request to the Yandex Maps host: "abort" fails the loader, "count"
// answers 500, "stub" serves the 2.1 stand-in from the loader URL.
async function noYandex(context: BrowserContext, mode: "abort" | "count" | "stub"): Promise<{ hits: number; urls: string[] }> {
  const seen = { hits: 0, urls: [] as string[] };
  await context.route(/api-maps\.yandex\./, (route) => {
    seen.hits += 1;
    seen.urls.push(route.request().url());
    if (mode === "abort") return route.abort();
    if (mode === "count") return route.fulfill({ status: 500, body: "" });
    return route.fulfill({ status: 200, contentType: "application/javascript", body: `(${installYmapsStub.toString()})();` });
  });
  return seen;
}

async function openMap(page: Page, routes: Routes): Promise<Mock> {
  const mock = await mockBackend(page, await signIn(page, CLIENT, routes));
  await page.goto("/uz/portal/client/lawyers?mode=nearby");
  return mock;
}

async function shot(page: Page, name: string, target = "") {
  if (!SHOTS) return;
  const w = page.viewportSize()?.width ?? 0;
  const scheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme") ?? "light");
  await page.evaluate((sel) => {
    if (document.querySelector(".amodal__c")) return;
    const el = (sel && document.querySelector(sel)) || document.querySelector('[data-ai-id="profile.office"], [data-ai-id="marketplace.nearby"]');
    if (el) (el as HTMLElement).style.scrollMarginTop = "76px";
    (el as HTMLElement | null)?.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
  }, target);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/task-c-${name}-${w}-${scheme}.png`, fullPage: false });
}

async function tapAt(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const b = await target.boundingBox();
  expect(b, "the marker is on screen").not.toBeNull();
  await page.mouse.click((b?.x ?? 0) + (b?.width ?? 0) / 2, (b?.y ?? 0) + (b?.height ?? 0) / 2);
}

async function noOverflow(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(wide, "the page scrolls sideways").toBe(false);
  // The app shell scrolls inside itself; the document never does (nothing
  // — e.g. an .sr-only text placed against the page root — sticks out below).
  const tall = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, body: document.body.scrollHeight, vh: window.innerHeight }));
  expect(tall.doc, "the document scrolls").toBeLessThanOrEqual(tall.vh + 1);
  expect(tall.body, "the body is taller than the screen").toBeLessThanOrEqual(tall.vh + 1);
}

async function storedNothing(page: Page) {
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/41\.3\d*|69\.2\d*|latitude|longitude/);
}

test("map off: filters and the list stand in, realtime refreshes the list and unsubscribes on leave", async ({ page, context }) => {
  const yandex = await noYandex(context, "count");
  const queries: URLSearchParams[] = [];
  const mock = await openMap(page, mapRoutes({ configured: false, queries }));
  await expect(page.getByText("Xarita hozir mavjud emas — mutaxassislar o‘sha filtrlar bilan ro‘yxat ko‘rinishida.")).toBeVisible();
  const list = page.locator('[data-ai-id="marketplace.map.area.list"]');
  await expect(list.getByText("Dilnoza Karimova")).toBeVisible();
  await expect(list.getByText("Ofis hududi (taxminiy)")).toBeVisible();
  await expect(list.getByText("Viloyat markazi (taxminiy)")).toBeVisible();
  await expect(page.locator('[data-ai-id="marketplace.nearby"]')).not.toContainText(UUID);
  await expect(page.locator('[data-ai-id="marketplace.nearby"]')).not.toContainText("LG-");
  // The whole country at marker zoom, verified only by default.
  const lastMapQuery = async () => queries.at(-1) as URLSearchParams;
  let qs = await lastMapQuery();
  expect(qs.get("bbox")).toBe("55.9,37.1,73.2,45.7");
  expect(qs.get("zoom")).toBe("13");
  expect(qs.get("verified_only")).toBe("true");
  await shot(page, "not-configured", ".mtb");

  // Handmade filters reach the backend.
  const opener = page.locator('[data-ai-id="marketplace.map.filters.open"]');
  await opener.click();
  const sheet = page.getByRole("dialog", { name: "Filtrlar" });
  await expect(sheet).toBeVisible();
  await sheet.locator('[data-ai-id="marketplace.map.filter.type"]').getByRole("button").click();
  await page.getByRole("option", { name: "Yurist" }).click();
  await sheet.locator('[data-ai-id="marketplace.map.filter.verified"]').getByText("Faqat tasdiqlangan mutaxassislar").click();
  await expect.poll(async () => (await lastMapQuery()).get("verified_only")).toBe("false");
  qs = await lastMapQuery();
  expect(qs.get("seller_type")).toBe("yurist");
  await shot(page, "filter-sheet");
  await sheet.locator('[data-ai-id="marketplace.map.filters.done"]').click();
  await expect(sheet).toBeHidden();
  await expect(opener.locator(".mtb__badge")).toHaveText("2");

  // Realtime: subscribed on the user socket; an update refetches the list.
  await expect.poll(() => mock.sent.some((m) => m.includes('"marketplace.map.subscribe"'))).toBe(true);
  await mock.push({ event: "marketplace.map.subscribed" });
  const before = mock.count("GET", /^\/marketplace\/sellers\/map$/);
  await mock.push({ event: "marketplace.seller_location_updated", seller_user_id: S1, marker: null });
  await expect.poll(() => mock.count("GET", /^\/marketplace\/sellers\/map$/)).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Mutaxassislar bo'yicha" }).click();
  await expect.poll(() => mock.sent.some((m) => m.includes('"marketplace.map.unsubscribe"'))).toBe(true);
  expect(yandex.hits).toBe(0);
  await noOverflow(page);
});

test("map configured but Yandex fails to load: the list takes over without a broken map", async ({ page, context }) => {
  const yandex = await noYandex(context, "abort");
  await openMap(page, mapRoutes({ configured: true }));
  await expect(page.getByText("Xarita yuklanmadi — mutaxassislar o‘sha filtrlar bilan ro‘yxat ko‘rinishida.")).toBeVisible();
  await expect(page.locator('[data-ai-id="marketplace.map.area.list"]').getByText("Akmal Yusupov")).toBeVisible();
  await expect(page.locator(".ymk-canvas")).toHaveCount(0);
  // Only the config's 2.1 loader was tried.
  expect(yandex.urls).toEqual([LOADER]);
  await shot(page, "list-fallback", ".mtb");
  await noOverflow(page);
});

test("2.1 loader: the script is the config's maps_loader_url, never v3, and the key is never logged", async ({ page, context }) => {
  const yandex = await noYandex(context, "stub");
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  page.on("pageerror", (e) => logs.push(String(e)));
  await openMap(page, mapRoutes({ configured: true }));
  await expect(page.locator(".ymk-pin, .ymk-group").first()).toBeVisible();
  await expect(page.locator('script[data-lexgo-map="yandex"]')).toHaveAttribute("src", LOADER);
  expect(yandex.urls).toEqual([LOADER]);
  expect(yandex.urls.some((u) => /\/v3\//.test(u))).toBe(false);
  // The 2.1 map is drawn: tiles in the ground pane, the backend's markers on top.
  await expect(page.locator(".ymaps-stub-ground")).toHaveCount(1);
  await expect(page.locator('[data-ai-id="marketplace.map.panel"]')).toContainText("Taxminiy hududlar, ≈500 m");
  // Dark mode re-tints only the tiles; light mode leaves them alone.
  const filter = await page.locator(".ymaps-stub-ground").evaluate((el) => (el as HTMLElement).style.filter);
  const dark = (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark";
  expect(filter.includes("invert")).toBe(dark);
  // Two pins on one spot: the Clusterer shows one count, which opens from the keyboard.
  const near = page.locator(".ymk-group--near");
  await expect(near).toHaveText("2");
  await expect(near).toHaveAttribute("aria-label", "2 ta mutaxassis — yaqinlashtirish uchun bosing");
  await shot(page, "map-clusterer", '[data-ai-id="marketplace.map.ask"]');
  await near.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".ymk-pin[data-seller]")).toHaveCount(2);
  await expect(page.locator(".ymk-group--near")).toHaveCount(0);
  expect(logs.join("\n")).not.toContain(MAPS_KEY);
  await expect(page.locator("body")).not.toContainText(MAPS_KEY);
});

test("an api_version this page can't draw stays the list and loads no script", async ({ page, context }) => {
  const yandex = await noYandex(context, "stub");
  const routes = mapRoutes({ configured: true });
  routes["/marketplace/map/config"] = config(true, "v3");
  await openMap(page, routes);
  await expect(page.getByText("Xarita hozir mavjud emas — mutaxassislar o‘sha filtrlar bilan ro‘yxat ko‘rinishida.")).toBeVisible();
  await expect(page.locator('[data-ai-id="marketplace.map.area.list"]').getByText("Dilnoza Karimova")).toBeVisible();
  await expect(page.locator(".ymk-canvas")).toHaveCount(0);
  expect(yandex.hits).toBe(0);
});

test("near me: location only after the click, consent recorded, nearest fallback and low accuracy explained", async ({ page, context }) => {
  await noYandex(context, "abort");
  let searched: Record<string, unknown> | null = null;
  const routes = mapRoutes({ configured: false });
  const search = routes["POST /marketplace/nearby-sellers/search"] as (b: unknown) => unknown;
  routes["POST /marketplace/nearby-sellers/search"] = (b: unknown) => ((searched = b as Record<string, unknown>), search(b));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.31234, longitude: 69.27987, accuracy: 900 });
  const mock = await openMap(page, routes);
  await expect(page.getByRole("heading", { name: "Yaqinimdagi mutaxassislarni ko‘rsatish" }).or(page.getByText("Yaqinimdagi mutaxassislarni ko‘rsatish").first())).toBeVisible();
  await shot(page, "permission-prompt", ".mtb");
  // Nothing location-related was sent before the click.
  expect(mock.calls.some((c) => c.method === "POST")).toBe(false);
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await expect(page.locator('[data-ai-id="marketplace.map.near.fallback"]')).toHaveText("10 km ichida hech kim yo‘q — o‘rniga eng yaqin mutaxassislar ko‘rsatilmoqda.");
  await expect(page.locator('[data-ai-id="marketplace.map.near.accuracy"]')).toContainText("Joylashuvingiz aniq emas");
  const consentCall = mock.calls.find((c) => c.method === "POST" && c.path === "/marketplace/me/location-consent");
  expect(consentCall?.body).toEqual({ granted: true, permission_state: "granted", source: "web", duration_hours: 24 });
  const consentAt = mock.calls.indexOf(consentCall as Mock["calls"][number]);
  const searchAt = mock.calls.findIndex((c) => c.method === "POST" && c.path === "/marketplace/nearby-sellers/search");
  expect(consentAt).toBeLessThan(searchAt);
  expect(searched).toMatchObject({ latitude: 41.312, longitude: 69.28, accuracy_meters: 900, radius_km: 10, sort: "nearest", verified_only: true, limit: 50 });
  const rows = page.locator('[data-ai-id="marketplace.nearby.results"]');
  await expect(rows.getByText("Dilnoza Karimova")).toBeVisible();
  await expect(rows.getByText("≈ 14 km")).toBeVisible();
  await expect(rows).not.toContainText(UUID);
  await noOverflow(page);
  await shot(page, "nearby-fallback", '[data-ai-id="marketplace.map.near"]');

  // Radius and sort are handmade controls and go to the backend.
  await page.locator('[data-ai-id="marketplace.nearby.radius.25"]').click();
  await expect(page.locator('[data-ai-id="marketplace.nearby.radius.25"]')).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => (searched as Record<string, unknown> | null)?.radius_km).toBe(25);
  await page.locator('[data-ai-id="marketplace.map.sort.rating"]').click();
  await expect.poll(() => (searched as Record<string, unknown> | null)?.sort).toBe("rating");
  await expect(page.locator('[data-ai-id="marketplace.map.consent"]')).toContainText("Bekor qilish");
  await storedNothing(page);
  await noOverflow(page);
});

test("denied: the browser's refusal is recorded, the client picks an address and searches with manual consent", async ({ page, context }) => {
  await noYandex(context, "abort");
  await context.clearPermissions();
  await page.addInitScript(() => {
    const deny = (_ok: unknown, err?: (e: { code: number; message: string }) => void) => setTimeout(() => err?.({ code: 1, message: "denied" }), 10);
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: deny, watchPosition: deny, clearWatch: () => undefined } });
  });
  const mock = await openMap(page, mapRoutes({ configured: false }));
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await expect(page.locator('[data-ai-id="marketplace.map.denied"]')).toContainText("Joylashuvga ruxsat berilmagan");
  await expect.poll(() => mock.calls.find((c) => c.method === "POST" && c.path === "/marketplace/me/location-consent")?.body).toEqual({ granted: false, permission_state: "denied", source: "web" });
  await shot(page, "denied", '[data-ai-id="marketplace.map.denied"]');
  await page.locator('[data-ai-id="marketplace.map.manual.start"]').click();
  await page.getByRole("searchbox", { name: "Manzilni topish" }).fill("Amir Temur");
  await page.getByRole("button", { name: /Amir Temur ko'chasi, 1/ }).click();
  await expect(page.getByText("Nuqta tanlandi")).toBeVisible();
  await shot(page, "denied-manual", '[data-ai-id="marketplace.map.manual"]');
  await page.locator('[data-ai-id="marketplace.map.manual.confirm"]').click();
  await expect(page.locator('[data-ai-id="marketplace.nearby.results"]').getByText("Akmal Yusupov")).toBeVisible();
  await expect(page.getByText("Siz tanlagan nuqtadan qidirilmoqda")).toBeVisible();
  const grants = mock.calls.filter((c) => c.method === "POST" && c.path === "/marketplace/me/location-consent").map((c) => c.body);
  expect(grants.at(-1)).toEqual({ granted: true, permission_state: "granted", source: "manual", duration_hours: 24 });
  const search = mock.calls.find((c) => c.method === "POST" && c.path === "/marketplace/nearby-sellers/search");
  expect(search?.body).toMatchObject({ latitude: 41.311, longitude: 69.279 });
  await storedNothing(page);
});

test("route: the mode goes to the backend, the straight distance is shown and the returned web route is offered", async ({ page, context }) => {
  await noYandex(context, "abort");
  await context.route(/yandex\.uz\/maps/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>route</title>" }));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 30 });
  let navBody: Record<string, unknown> | null = null;
  const routes = mapRoutes({ configured: false });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = (b: unknown) => (
    (navBody = b as Record<string, unknown>),
    {
      provider: "yandex",
      seller_user_id: S1,
      seller_public_id: "LG-0B9C2C",
      display_name: "Dilnoza Karimova",
      mode: "walking",
      destination_source: "public_office",
      destination: { latitude: 41.31, longitude: 69.28 },
      app_url: "yandexmaps://maps.yandex.ru/?rtext=41.3,69.24~41.31,69.28&rtt=pd",
      web_url: WEB_ROUTE,
      fallback_url: WEB_ROUTE,
      privacy: {},
    }
  );
  const mock = await openMap(page, routes);
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  const results = page.locator('[data-ai-id="marketplace.nearby.results"]');
  const card = page.locator('[data-ai-id="marketplace.map.card"]');
  // Only the seller whose route the backend allows offers one.
  await results.getByRole("button", { name: /Akmal Yusupov/ }).click();
  await expect(card).toContainText("Akmal Yusupov");
  await expect(card.locator('[data-ai-id="marketplace.route"]')).toHaveCount(0);
  await card.getByRole("button", { name: "Ro‘yxatga qaytish" }).click();
  await expect(card).toHaveCount(0);
  await results.getByRole("button", { name: /Dilnoza Karimova/ }).click();
  const nav = card.locator('[data-ai-id="marketplace.route"]');
  await expect(nav).toBeVisible();
  await nav.getByRole("radio", { name: "Mashina" }).press("ArrowRight");
  await expect(nav.getByRole("radio", { name: "Piyoda" })).toHaveAttribute("aria-checked", "true");
  await shot(page, "route-modes", '[data-ai-id="marketplace.map.card"]');
  await nav.getByRole("button", { name: "Yo‘lni ko‘rsatish" }).click();
  await expect(nav.locator('[data-ai-id="marketplace.route.straight"]')).toContainText(/To‘g‘ri chiziq bo‘yicha ≈ 3[,.]5 km/);
  expect(navBody).toEqual({ latitude: 41.3, longitude: 69.24, mode: "walking", paid_order_id: null, recalculate: false, session_id: expect.stringMatching(UUID), locale: "uz" });
  expect(mock.calls.filter((c) => c.method === "POST" && c.path.startsWith("/marketplace/sellers/"))).toHaveLength(1);
  const web = nav.getByRole("link", { name: "Yandex Xaritada ochish" });
  await expect(web).toHaveAttribute("href", WEB_ROUTE);
  await expect(web).toHaveAttribute("target", "_blank");
  await expect(nav.getByText(/Manzil: mutaxassis ofisi/)).toBeVisible();
  await expect(nav.locator(".mnv__privacy")).toContainText("bir marta");
  await expect(nav.getByRole("button", { name: "Navigatorni boshlash" })).toBeVisible();
  await expect(nav.locator('[data-ai-id="marketplace.route.app"]')).toHaveCount(0);
  await shot(page, "route-ready", '[data-ai-id="marketplace.map.card"]');
  await storedNothing(page);
});

test("route: a seller without public navigation is explained in words", async ({ page, context }) => {
  await noYandex(context, "abort");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 30 });
  const routes = mapRoutes({ configured: false });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = { status: 403, json: { detail: { code: "navigation_destination_unavailable", message: "x" } } };
  await openMap(page, routes);
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await page.locator('[data-ai-id="marketplace.nearby.results"]').getByRole("button", { name: /Dilnoza Karimova/ }).click();
  const nav = page.locator('[data-ai-id="marketplace.map.card"] [data-ai-id="marketplace.route"]');
  await nav.getByRole("button", { name: "Yo‘lni ko‘rsatish" }).click();
  await expect(nav.getByRole("alert")).toHaveText("Bu mutaxassis ofisiga yo‘nalishni ochmagan. U bilan profil orqali bog‘laning.");
  await expect(nav).not.toContainText("navigation_destination_unavailable");
  await expect(nav.getByRole("button", { name: "Qayta urinish" })).toBeVisible();
  await expect(nav.locator('[data-ai-id="marketplace.route.follow"]')).toHaveCount(0);
});

test("navigator: the guidance line on the map, then the in-app follow mode until arrival", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 20 });
  const routes = mapRoutes({ configured: true });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = {
    provider: "yandex",
    destination_source: "public_office",
    destination: { latitude: 41.31, longitude: 69.28, coordinates: [69.28, 41.31] },
    app_url: "yandexmaps://maps.yandex.ru/?rtext=41.3,69.24~41.31,69.28&rtt=auto",
    app_urls: { yandex_maps: "yandexmaps://maps.yandex.ru/?rtext=41.3,69.24~41.31,69.28&rtt=auto", yandex_navigator: "yandexnavi://build_route_on_map?lat_to=41.31&lon_to=69.28" },
    web_url: WEB_ROUTE,
    fallback_url: WEB_ROUTE,
    event_recorded: true,
  };
  await openMap(page, routes);
  await expect(page.locator(".ymk-pin, .ymk-group").first()).toBeVisible();
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await page.locator('[data-ai-id="marketplace.nearby.results"]').getByRole("button", { name: /Dilnoza Karimova/ }).click();
  const nav = page.locator('[data-ai-id="marketplace.map.card"] [data-ai-id="marketplace.route"]');
  await nav.getByRole("button", { name: "Yo‘lni ko‘rsatish" }).click();
  await expect(nav.locator('[data-ai-id="marketplace.route.straight"]')).toContainText(/≈ 3[,.]5 km/);
  await expect(page.locator('.ymaps-stub-line[data-style="solid"]')).toHaveCount(3);
  await expect(page.locator('.ymaps-stub-line[data-style="dot"]')).toHaveCount(1);
  await shot(page, "navigator-line", '[data-ai-id="marketplace.nearby"]');
  await nav.getByRole("button", { name: "Navigatorni boshlash" }).click();
  const hud = page.locator('[data-ai-id="marketplace.map.follow"]');
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Dilnoza Karimova tomon");
  await expect(hud.locator(".mfh__big")).toHaveText(/^≈ \d+ daq$/);
  await expect(hud.locator(".mfh__sub")).toContainText(/3[,.]5 km · \d{2}:\d{2} da yetasiz/);
  await expect(hud.locator(".mfh__head")).toHaveText(/yuring$/);
  await expect(page.locator(".ymk-stage")).toHaveClass(/is-tilt/);
  await expect(page.locator(".ymk-me.is-nav")).toHaveCount(1);
  await expect(page.locator(".mtb--float")).toBeHidden();
  await expect(hud.getByRole("button", { name: "To‘xtatish" })).toBeVisible();
  await shot(page, "navigator-follow", '[data-ai-id="marketplace.nearby"]');
  await context.setGeolocation({ latitude: 41.3099, longitude: 69.2799, accuracy: 10 });
  await expect(hud.locator(".mfh__big")).toHaveText("Yetib keldingiz");
  await expect(hud).toHaveClass(/is-arrived/);
  await shot(page, "navigator-arrived", '[data-ai-id="marketplace.nearby"]');
  await hud.getByRole("button", { name: "To‘xtatish" }).click();
  await expect(hud).toHaveCount(0);
  await expect(page.locator(".ymk-stage")).not.toHaveClass(/is-tilt/);
  await expect(nav.getByRole("button", { name: "Navigatorni boshlash" })).toBeVisible();
  await storedNothing(page);
  await noOverflow(page);
});

test("navigator: when the browser stops giving the location the follow mode says so and offers Yandex", async ({ page, context }) => {
  await noYandex(context, "abort");
  await page.addInitScript(() => {
    const fix = (ok: (p: unknown) => void) => setTimeout(() => ok({ coords: { latitude: 41.3, longitude: 69.24, accuracy: 25, heading: null, speed: null }, timestamp: Date.now() }), 10);
    const lost = (_ok: unknown, err?: (e: { code: number; message: string }) => void) => {
      setTimeout(() => err?.({ code: 1, message: "denied" }), 10);
      return 7;
    };
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: fix, watchPosition: lost, clearWatch: () => undefined } });
  });
  const routes = mapRoutes({ configured: false });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = {
    destination_source: "public_office",
    destination: { latitude: 41.31, longitude: 69.28 },
    app_url: "yandexmaps://maps.yandex.ru/?rtext=41.3,69.24~41.31,69.28&rtt=auto",
    web_url: WEB_ROUTE,
    fallback_url: WEB_ROUTE,
  };
  await openMap(page, routes);
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await page.locator('[data-ai-id="marketplace.nearby.results"]').getByRole("button", { name: /Dilnoza Karimova/ }).click();
  const nav = page.locator('[data-ai-id="marketplace.map.card"] [data-ai-id="marketplace.route"]');
  await nav.getByRole("button", { name: "Yo‘lni ko‘rsatish" }).click();
  await nav.getByRole("button", { name: "Navigatorni boshlash" }).click();
  const hud = page.locator('[data-ai-id="marketplace.map.follow"]');
  await expect(hud.getByRole("alert")).toContainText("Brauzer joylashuvni kuzatishga ruxsat bermadi");
  await expect(hud.getByRole("link", { name: "Yandex Xaritada ochish" })).toHaveAttribute("href", WEB_ROUTE);
  await hud.getByRole("button", { name: "To‘xtatish" }).click();
  await expect(hud).toHaveCount(0);
  await storedNothing(page);
});

test("seller settings: the office location is saved with the public route switch", async ({ page, context }) => {
  await noYandex(context, "abort");
  let put: Record<string, unknown> | null = null;
  const routes = await signIn(page, ADVOCATE, {
    "/lawyers/me": { lawyer_name: "Test Advokat", region: "tashkent" },
    "/marketplace/map/config": config(false),
    "/marketplace/me/office-location": { configured: false, office: null },
    "PUT /marketplace/me/office-location": (b: unknown) => {
      put = b as Record<string, unknown>;
      const body = b as { latitude: number; longitude: number; formatted_address: string; public_navigation_enabled: boolean };
      return { configured: true, office: { ...body, updated_at: new Date().toISOString() } };
    },
    "/marketplace/geocoder/search": PLACES,
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/advocate/profile?tab=work");
  const card = page.locator('[data-ai-id="profile.office"]');
  await expect(card.getByText("Ofisingiz hali xaritada yo‘q")).toBeVisible();
  await card.getByRole("button", { name: "Ofis qo‘shish" }).click();
  await expect(card.getByText("Mijozlarga ofisimgacha yo‘nalish olishga ruxsat berish")).toBeVisible();
  await expect(card.getByText(/Yoqilgan: sizni xaritada topgan mijozlar shu ofisga Yandex yo‘nalishini olishi mumkin/)).toBeVisible();
  await card.getByRole("searchbox", { name: "Ofis manzilini topish" }).fill("Amir Temur");
  await card.getByRole("button", { name: /Amir Temur ko'chasi, 1/ }).click();
  await expect(card.getByText("Ofis nuqtasi tanlandi")).toBeVisible();
  await noOverflow(page);
  await expect(card.getByRole("textbox", { name: "Ofis manzili", exact: true })).toHaveValue("Toshkent, Yunusobod tumani, Amir Temur ko'chasi, 1");
  await shot(page, "office-settings");
  await card.getByText("Mijozlarga ofisimgacha yo‘nalish olishga ruxsat berish").click();
  await expect(card.getByText(/O‘chirilgan: ofis yopiq qoladi/)).toBeVisible();
  await card.getByRole("button", { name: "Ofisni saqlash" }).click();
  await expect(card.getByText("Ofis yopiq holda saqlandi. Mijozlarga yo‘nalish berilmaydi.")).toBeVisible();
  expect(put).toEqual({ latitude: 41.311, longitude: 69.279, formatted_address: "Toshkent, Yunusobod tumani, Amir Temur ko'chasi, 1", public_navigation_enabled: false });
  await expect(card.getByText("Yopiq — yo‘nalishsiz")).toBeVisible();
  await expect(card).not.toContainText("41.311");
  await noOverflow(page);
});

test("map view: clusters zoom in, markers open a card with a route, and a point can be picked on the map", async ({ page, context }) => {
  await noYandex(context, "stub");
  await page.addInitScript(() => {
    const deny = (_ok: unknown, err?: (e: { code: number; message: string }) => void) => setTimeout(() => err?.({ code: 1, message: "denied" }), 10);
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: deny, watchPosition: deny, clearWatch: () => undefined } });
  });
  const zooms: number[] = [];
  const routes = mapRoutes({ configured: true });
  routes["/marketplace/sellers/map"] = (_b: unknown, url: URL) => {
    const z = Number(url.searchParams.get("zoom"));
    zooms.push(z);
    if (z < 13) return { items: [], markers: [], clusters: [{ id: "cluster-11-1", count: 2, coordinates: [69.25, 41.3], bbox: { min_longitude: 69.245, min_latitude: 41.298, max_longitude: 69.256, max_latitude: 41.301 } }], count: 2, total_in_bbox: 2 };
    const near = [
      { ...MARKERS[0], coordinates: [69.245, 41.301], longitude: 69.245, latitude: 41.301, service_action: ACTION },
      { ...MARKERS[1], coordinates: [69.256, 41.298], longitude: 69.256, latitude: 41.298 },
    ];
    return { items: near, markers: near, clusters: [], count: 2, total_in_bbox: 2, location_precision: "mixed" };
  };
  const mock = await openMap(page, routes);
  const group = page.locator(".ymk-group");
  await expect(group).toHaveText("2");
  await expect(page.locator('[data-ai-id="marketplace.map.panel"]')).toContainText("Shu hududda 2 ta mutaxassis");
  await shot(page, "map", '[data-ai-id="marketplace.nearby"]');
  // A cluster opens from the keyboard too: it zooms in and the viewport is asked again.
  await group.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".ymk-pin")).toHaveCount(2);
  expect(Math.max(...zooms)).toBeGreaterThanOrEqual(13);
  // Markers are approximate areas, never addresses (§7.7), and wear the
  // initials avatar (§7.4: no avatar_url yet).
  const pin = page.locator(`.ymk-pin[data-seller="${S1}"]`);
  await expect(pin).toHaveAttribute("title", "Dilnoza Karimova · ofis hududi (taxminiy)");
  await expect(pin).toHaveText("DK");
  await expect(page.locator(`.ymk-pin[data-seller="${S2}"]`)).toHaveAttribute("title", "Akmal Yusupov · viloyat markazi (taxminiy)");
  // As in 2.1, the events pane lies over the pins: a tap at the pin's place
  // reaches it through its shape.
  await tapAt(page, pin);
  const card = page.locator('[data-ai-id="marketplace.map.card"]');
  await expect(card).toContainText("Dilnoza Karimova");
  await expect(card).toContainText("Ofis hududi (taxminiy)");
  await expect(card.locator('[data-ai-id="marketplace.map.card.approx"]')).toHaveText("Taxminiy hudud, ≈500 m — aniq manzil emas");
  await expect(card.locator(".mk-mono")).toHaveText("DK");
  // service_action.id is the service the purchase opens.
  await expect(card.getByRole("link", { name: "Buyurtma: Aliment undirish" })).toHaveAttribute("href", `/uz/portal/client/lawyers/${S1}?buy=svc-77`);
  await expect(card).toContainText("300 000 so‘m");
  await expect(card.locator('[data-ai-id="marketplace.route"]').getByRole("button", { name: "Yo‘lni ko‘rsatish" })).toBeVisible();
  await expect(card).not.toContainText(UUID);
  await expect(pin).toHaveClass(/is-on/);
  await shot(page, "map-card", '[data-ai-id="marketplace.nearby"]');
  await card.getByRole("button", { name: "Ro‘yxatga qaytish" }).click();
  await expect(card).toHaveCount(0);

  // Location refused: the client marks the point on the map instead.
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await page.locator('[data-ai-id="marketplace.map.manual.start"]').click();
  await expect(page.locator('[data-ai-id="marketplace.map.pick-hint"]')).toHaveText("Xaritada nuqtani bosing yoki manzilni qidiring");
  const canvas = page.locator(".ymk-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 300) * 0.6, (box?.y ?? 0) + (box?.height ?? 300) * 0.35);
  await expect(page.locator(".ymk-pick")).toHaveCount(1);
  await expect(page.locator('[data-ai-id="marketplace.map.manual"]').getByText("Nuqta tanlandi")).toBeVisible();
  await shot(page, "denied-manual-map", '[data-ai-id="marketplace.map.manual"]');
  await page.locator('[data-ai-id="marketplace.map.manual.confirm"]').click();
  await expect(page.locator('[data-ai-id="marketplace.nearby.results"]').getByText("Dilnoza Karimova")).toBeVisible();
  await page.locator('[data-ai-id="marketplace.nearby.results"]').getByRole("button", { name: /Dilnoza Karimova/ }).click();
  await expect(card.getByRole("link", { name: "Buyurtma: Aliment undirish" })).toHaveAttribute("href", `/uz/portal/client/lawyers/${S1}?buy=svc-77`);
  await card.getByRole("button", { name: "Ro‘yxatga qaytish" }).click();
  const grants = mock.calls.filter((c) => c.method === "POST" && c.path === "/marketplace/me/location-consent").map((c) => c.body);
  expect(grants).toEqual([
    { granted: false, permission_state: "denied", source: "web" },
    { granted: true, permission_state: "granted", source: "manual", duration_hours: 24 },
  ]);

  // The list view keeps the same filters and the visible area.
  await page.locator('[data-ai-id="marketplace.map.manual.again"]').click();
  await page.locator('[data-ai-id="marketplace.map.manual.cancel"]').click();
  await noOverflow(page);
});

test("list view of the map area", async ({ page, context }) => {
  await noYandex(context, "stub");
  const queries: URLSearchParams[] = [];
  await openMap(page, mapRoutes({ configured: true, queries }));
  // A tap on the Clusterer's count zooms in until the pins separate.
  const near = page.locator(".ymk-group--near");
  await expect(near).toHaveText("2");
  await tapAt(page, near);
  await expect(page.locator(".ymk-pin[data-seller]")).toHaveCount(2);
  await page.locator('[data-ai-id="marketplace.nearby.view.list"]').click();
  const list = page.locator('[data-ai-id="marketplace.map.area.list"]');
  await expect(list.getByText("Akmal Yusupov")).toBeVisible();
  await expect(page.locator('[data-ai-id="marketplace.map.panel"]')).toContainText("Shu hududda 2 ta mutaxassis");
  await expect(page.locator('[data-ai-id="marketplace.nearby.view.list"]')).toHaveAttribute("aria-checked", "true");
  // The map's own area, at marker zoom.
  expect(queries.some((q) => q.get("zoom") === "13" && q.get("bbox") !== "55.9,37.1,73.2,45.7")).toBe(true);
  expect(queries.some((q) => q.get("bbox") === "55.9,37.1,73.2,45.7")).toBe(false);
  await shot(page, "list", '.mmarea');
  await noOverflow(page);
});

test("geocoder down (provider 403): address search says so in words and the point is picked on the map", async ({ page, context }) => {
  await noYandex(context, "stub");
  await page.addInitScript(() => {
    const deny = (_ok: unknown, err?: (e: { code: number; message: string }) => void) => setTimeout(() => err?.({ code: 1, message: "denied" }), 10);
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: deny, watchPosition: deny, clearWatch: () => undefined } });
  });
  const routes = mapRoutes({ configured: true });
  routes["/marketplace/geocoder/search"] = GEOCODER_DOWN;
  const mock = await openMap(page, routes);
  await expect(page.locator(".ymk-pin, .ymk-group").first()).toBeVisible();
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await page.locator('[data-ai-id="marketplace.map.manual.start"]').click();
  await page.getByRole("searchbox", { name: "Manzilni topish" }).fill("Amir Temur");
  const down = page.locator('[data-ai-id="marketplace.map.manual.place.error"]');
  await expect(down).toHaveText("Manzil qidiruvi hozir ishlamayapti — nuqtani xaritada tanlang.");
  await expect(page.locator('[data-ai-id="marketplace.nearby"]')).not.toContainText("yandex_geocoder");
  await expect.poll(() => mock.count("GET", /^\/marketplace\/geocoder\/search$/)).toBeGreaterThan(0);
  await shot(page, "geocoder-unavailable", '[data-ai-id="marketplace.map.manual"]');
  // The map still takes the point.
  const canvas = page.locator(".ymk-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 300) * 0.62, (box?.y ?? 0) + (box?.height ?? 300) * 0.32);
  await expect(page.locator(".ymk-pick")).toHaveCount(1);
  await page.locator('[data-ai-id="marketplace.map.manual.confirm"]').click();
  await expect(page.locator('[data-ai-id="marketplace.nearby.results"]').getByText("Dilnoza Karimova")).toBeVisible();
  const search = mock.calls.find((c) => c.method === "POST" && c.path === "/marketplace/nearby-sellers/search");
  expect(typeof (search?.body as { latitude?: unknown })?.latitude).toBe("number");
  await noOverflow(page);
});

test("office: shown with its source and check time, picked on the map while the geocoder is down, removed behind a confirm", async ({ page, context }) => {
  await noYandex(context, "stub");
  const RECORD = "7f1d2c3b-0000-4000-8000-000000000001";
  let office: Record<string, unknown> | null = {
    latitude: 41.311,
    longitude: 69.279,
    formatted_address: "Toshkent, Yunusobod tumani, Amir Temur ko'chasi, 1",
    source: "manual",
    public_navigation_enabled: true,
    confirmed_at: "2026-10-30T09:30:00Z",
    geocoded_at: null,
    record_id: RECORD,
  };
  let put: Record<string, unknown> | null = null;
  const routes = await signIn(page, ADVOCATE, {
    "/lawyers/me": { lawyer_name: "Test Advokat", region: "tashkent" },
    "/marketplace/map/config": config(true),
    "/marketplace/me/office-location": () => ({ configured: !!office, office }),
    "PUT /marketplace/me/office-location": (b: unknown) => {
      put = b as Record<string, unknown>;
      office = { ...(b as Record<string, unknown>), source: "manual", confirmed_at: new Date().toISOString(), record_id: RECORD };
      return { configured: true, office };
    },
    "DELETE /marketplace/me/office-location": () => {
      office = null;
      return { configured: false, office: null };
    },
    "/marketplace/geocoder/search": GEOCODER_DOWN,
    // A plain string detail is read as the code too (§7.6).
    "/marketplace/geocoder/reverse": { status: 503, json: { detail: "yandex_geocoder_unavailable" } },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/uz/portal/advocate/profile?tab=work");
  const card = page.locator('[data-ai-id="profile.office"]');
  const read = card.locator('[data-ai-id="profile.office.read"]');
  await expect(read).toContainText("Toshkent, Yunusobod tumani, Amir Temur ko'chasi, 1");
  await expect(read.locator('[data-ai-id="profile.office.source"]')).toContainText("Siz xaritada belgilagansiz");
  await expect(read.locator('[data-ai-id="profile.office.state"]')).toHaveText("Mijozlar yo‘nalish olishi mumkin");
  await expect(read.locator('[data-ai-id="profile.office.confirmed"]')).toContainText("Tasdiqlangan");
  await expect(read.locator('[data-ai-id="profile.office.confirmed"] time')).toHaveAttribute("datetime", "2026-10-30T09:30:00.000Z");
  await expect(card).not.toContainText(RECORD);
  await expect(card).not.toContainText(UUID);
  await expect(card).not.toContainText("manual");
  await shot(page, "office-configured", '[data-ai-id="profile.office"]');

  // Edit: the address search is down, the map still takes the point.
  await card.getByRole("button", { name: "O‘zgartirish" }).click();
  await card.getByRole("searchbox", { name: "Ofis manzilini topish" }).fill("Amir Temur");
  await expect(card.locator('[data-ai-id="profile.office.place.error"]')).toHaveText("Manzil qidiruvi hozir ishlamayapti — nuqtani xaritada tanlang.");
  const canvas = card.locator(".ymk-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 300) / 2 + 40, (box?.y ?? 0) + (box?.height ?? 300) / 2 + 30);
  await expect(card.locator(".ymk-pick")).toHaveCount(1);
  await expect(card.locator('[data-ai-id="profile.office.reverse-fail"]')).toContainText("Manzilni nuqta bo‘yicha avtomatik to‘ldirib bo‘lmadi");
  await expect(card).not.toContainText("yandex_geocoder");
  await shot(page, "point-picker", '[data-ai-id="profile.office"]');
  await noOverflow(page);
  await card.getByRole("button", { name: "Ofisni saqlash" }).click();
  await expect(card.getByText("Ofis saqlandi. Endi mijozlar unga yo‘nalish olishi mumkin.")).toBeVisible();
  const saved = put as Record<string, unknown> | null;
  expect(typeof saved?.latitude).toBe("number");
  expect(saved?.latitude).not.toBe(41.311);
  expect(saved).toMatchObject({ formatted_address: "Toshkent, Yunusobod tumani, Amir Temur ko'chasi, 1", public_navigation_enabled: true });

  // Remove office: the app's own confirm dialog, then DELETE, then "not configured".
  await card.getByRole("button", { name: "Ofisni olib tashlash" }).click();
  const dialog = page.getByRole("dialog", { name: "Ofis xaritadan olib tashlansinmi?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Mijozlar ofisingizni xaritada topa olmaydi");
  expect(mock.count("DELETE", /^\/marketplace\/me\/office-location$/)).toBe(0);
  await shot(page, "remove-confirm");
  await dialog.getByRole("button", { name: "Olib tashlash" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => mock.count("DELETE", /^\/marketplace\/me\/office-location$/)).toBe(1);
  await expect(card.locator('[data-ai-id="profile.office.empty"]')).toContainText("Ofisingiz hali xaritada yo‘q");
  await expect(card.getByText("Ofis olib tashlandi. Endi u xaritada ko‘rinmaydi.")).toBeVisible();
  await expect(card.getByRole("button", { name: "Ofis qo‘shish" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Ofisni olib tashlash" })).toHaveCount(0);
  await shot(page, "office-not-configured", '[data-ai-id="profile.office"]');
  await noOverflow(page);
});

test("office remove: cancelling the confirm keeps the office and sends nothing", async ({ page, context }) => {
  await noYandex(context, "abort");
  const routes = await signIn(page, ADVOCATE, {
    "/lawyers/me": { lawyer_name: "Test Advokat", region: "tashkent" },
    "/marketplace/map/config": config(false),
    "/marketplace/me/office-location": { configured: true, office: { latitude: 41.3, longitude: 69.24, formatted_address: "Toshkent", public_navigation_enabled: false, geocoded_at: "2026-10-29T12:00:00Z" } },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/uz/portal/advocate/profile?tab=work");
  const card = page.locator('[data-ai-id="profile.office"]');
  await expect(card.locator('[data-ai-id="profile.office.geocoded"]')).toContainText("Manzil tekshirilgan");
  await expect(card.locator('[data-ai-id="profile.office.state"]')).toHaveText("Yopiq — yo‘nalishsiz");
  await card.getByRole("button", { name: "Ofisni olib tashlash" }).click();
  const dialog = page.getByRole("dialog", { name: "Ofis xaritadan olib tashlansinmi?" });
  await dialog.getByRole("button", { name: "Bekor qilish" }).click();
  await expect(dialog).toBeHidden();
  await expect(card.locator('[data-ai-id="profile.office.read"]')).toContainText("Toshkent");
  expect(mock.count("DELETE", /^\/marketplace\/me\/office-location$/)).toBe(0);
});

// LEXGO_YANDEX_MAP_BACKEND_FINAL_2026_11_02 §4: a real route from the backend
// is drawn along its geometry with its own time and first instruction, and
// asked again after the client moves past recalculate_after_meters.
test("navigator: a backend route is drawn with its time and steps, and recalculated after 100 m", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 15 });
  const bodies: Record<string, unknown>[] = [];
  const routes = mapRoutes({ configured: true });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = (b: unknown) => {
    bodies.push(b as Record<string, unknown>);
    return {
      destination_source: "public_office",
      destination: { latitude: 41.31, longitude: 69.28, coordinates: [69.28, 41.31] },
      app_urls: { yandex_navigator: "yandexnavi://build_route_on_map?lat_to=41.31&lon_to=69.28" },
      web_url: WEB_ROUTE,
      route: {
        available: true,
        provider: "yandex",
        mode: "driving",
        distance_m: 4820,
        duration_s: 840,
        duration_in_traffic_s: 1020,
        geometry: [
          [69.24, 41.3],
          [69.25, 41.302],
          [69.265, 41.305],
          [69.28, 41.31],
        ],
        steps: [{ instruction: "Amir Temur ko‘chasiga o‘ngga buriling", distance_m: 350 }],
        coordinate_order: "longitude_latitude",
        recalculate_after_meters: 100,
      },
      event_recorded: true,
    };
  };
  const mock = await openMap(page, routes);
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await page.locator('[data-ai-id="marketplace.nearby.results"]').getByRole("button", { name: /Dilnoza Karimova/ }).click();
  const nav = page.locator('[data-ai-id="marketplace.map.card"] [data-ai-id="marketplace.route"]');
  await nav.getByRole("button", { name: "Yo‘lni ko‘rsatish" }).click();
  const eta = nav.locator('[data-ai-id="marketplace.route.eta"]');
  await expect(eta).toContainText("14 daq");
  await expect(eta).toContainText(/4[,.]8 km yo‘l/);
  await expect(nav).toContainText("Yandex marshruti bo‘yicha");
  await expect(nav).toContainText("tirbandlik bilan 17 daq");
  await expect(nav.locator('[data-ai-id="marketplace.route.straight"]')).toHaveCount(0);
  await expect(nav.locator(".mnv__privacy")).toContainText("taxminan har 100 m da");
  await expect(nav.locator(".mnv__privacy")).not.toContainText("bir marta");
  await expect(page.locator('.ymaps-stub-line[data-style="solid"]').first()).toHaveAttribute("points", /\S+ \S+ \S+ \S+/);
  await nav.getByRole("button", { name: "Navigatorni boshlash" }).click();
  const hud = page.locator('[data-ai-id="marketplace.map.follow"]');
  await expect(hud.locator(".mfh__head")).toHaveText("Amir Temur ko‘chasiga o‘ngga buriling");
  await expect(hud.locator(".mfh__big")).toHaveText(/^\d+ daq$/);
  await shot(page, "navigator-route", '[data-ai-id="marketplace.nearby"]');
  await context.setGeolocation({ latitude: 41.3025, longitude: 69.2405, accuracy: 10 });
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[0]).toMatchObject({ recalculate: false, locale: "uz", session_id: expect.stringMatching(UUID) });
  expect(bodies[1]).toEqual({ latitude: 41.3025, longitude: 69.2405, mode: "driving", paid_order_id: null, recalculate: true, session_id: bodies[0].session_id, locale: "uz" });
  expect(mock.calls.filter((c) => c.method === "POST" && c.path.startsWith("/marketplace/sellers/"))).toHaveLength(2);
  await expect(hud).toBeVisible();
  await hud.getByRole("button", { name: "To‘xtatish" }).click();
  await storedNothing(page);
});

test("route: a closed public office (409) is explained in words", async ({ page, context }) => {
  await noYandex(context, "abort");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 30 });
  const routes = mapRoutes({ configured: false });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = { status: 409, json: { detail: { code: "public_office_navigation_unavailable", message: "x" } } };
  await openMap(page, routes);
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await page.locator('[data-ai-id="marketplace.nearby.results"]').getByRole("button", { name: /Dilnoza Karimova/ }).click();
  const nav = page.locator('[data-ai-id="marketplace.map.card"] [data-ai-id="marketplace.route"]');
  await nav.getByRole("button", { name: "Yo‘lni ko‘rsatish" }).click();
  await expect(nav.getByRole("alert")).toHaveText("Mutaxassis ofisiga yo‘l ko‘rsatishni yoqmagan.");
  await expect(nav).not.toContainText("public_office_navigation_unavailable");
});

test("order: the paid order opens the map on its specialist and the route carries the order", async ({ page, context }) => {
  await noYandex(context, "abort");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 20 });
  let navBody: Record<string, unknown> | null = null;
  const locales: string[] = [];
  const routes = mapRoutes({ configured: false });
  routes["/marketplace/map/config"] = (_b: unknown, url: URL) => (locales.push(url.searchParams.get("locale") ?? ""), config(false));
  routes[`/marketplace/lawyers/${S1}`] = { user_id: S1, name: "Dilnoza Karimova", lawyer_name: "Dilnoza Karimova", is_verified: true };
  routes[`POST /marketplace/sellers/${S1}/navigation`] = (b: unknown) => (
    (navBody = b as Record<string, unknown>),
    { destination_source: "paid_order_live_location", destination: { latitude: 41.31, longitude: 69.28 }, web_url: WEB_ROUTE, route: { available: false, distance_m: 3500, duration_s: 420, geometry: [], reason: "routing_key_not_configured" } }
  );
  await mockBackend(page, await signIn(page, CLIENT, routes));
  await page.goto(`/uz/portal/client/lawyers?mode=nearby&route=${S1}&order=ord-77`);
  const card = page.locator('[data-ai-id="marketplace.map.card"]');
  await expect(card).toContainText("Dilnoza Karimova");
  expect(locales).toContain("uz");
  const nav = card.locator('[data-ai-id="marketplace.route"]');
  await nav.getByRole("button", { name: "Yo‘lni ko‘rsatish" }).click();
  await expect(nav.locator('[data-ai-id="marketplace.route.straight"]')).toContainText(/taxminan 7 daq/);
  await expect(nav).toContainText("to‘langan buyurtmangiz bo‘yicha");
  expect(navBody).toMatchObject({ mode: "driving", paid_order_id: "ord-77", recalculate: false, locale: "uz" });
  await storedNothing(page);
});

test("map: the config is asked in the page language and an expired location consent says so", async ({ page, context }) => {
  await noYandex(context, "abort");
  const locales: string[] = [];
  const routes = mapRoutes({ configured: false });
  routes["/marketplace/map/config"] = (_b: unknown, url: URL) => (locales.push(url.searchParams.get("locale") ?? ""), config(false));
  routes["/marketplace/me/location-consent"] = { granted: true, expired: true, effective_state: "expired", permission_state: "granted", source: "web" };
  await mockBackend(page, await signIn(page, CLIENT, routes));
  await page.goto("/ru/portal/client/lawyers?mode=nearby");
  await expect(page.locator('[data-ai-id="marketplace.map.consent.expired"]')).toHaveText("Срок разрешения на геолокацию истёк — разрешите снова, чтобы продолжить.");
  expect(locales).toEqual(expect.arrayContaining(["ru"]));
  expect(locales).not.toContain("uz");
});

test("order page: a paid order offers the route to its specialist only when the backend allows it", async ({ page }) => {
  const nav = { available: true, reason: null, destination_source: "public_office", endpoint: "/marketplace/sellers/{seller_user_id}/navigation", requires_location_consent: true, paid_order_id: ORDER_ID, modes: ["driving", "walking"] };
  await mockBackend(page, await signIn(page, CLIENT, { [`/marketplace/me/orders/${ORDER_ID}`]: order({ navigation: nav }) }));
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  const link = page.locator(".mor");
  await expect(link).toContainText("Mutaxassisga yo‘l");
  await expect(link).toHaveAttribute("href", new RegExp(`/uz/portal/client/lawyers\\?mode=nearby&route=u-adv&order=${ORDER_ID}$`));
  await shot(page, "order-route", ".mor");
});

test("order page: no route card when the order's navigation is closed", async ({ page }) => {
  await mockBackend(page, await signIn(page, CLIENT, { [`/marketplace/me/orders/${ORDER_ID}`]: order({ navigation: { available: false, reason: "office_not_set" } }) }));
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  await expect(page.locator(".mod__facts").first()).toBeVisible();
  await expect(page.locator(".mor")).toHaveCount(0);
});

const NAV_POST = /^\/marketplace\/sellers\/[^/]+\/navigation$/;
const ROUTED = (route: Record<string, unknown> = {}) => ({
  destination_source: "public_office",
  destination: { latitude: 41.31, longitude: 69.28, coordinates: [69.28, 41.31] },
  web_url: WEB_ROUTE,
  route: {
    available: true,
    provider: "yandex",
    mode: "driving",
    distance_m: 4820,
    duration_s: 840,
    duration_in_traffic_s: 1020,
    geometry: [
      [69.24, 41.3],
      [69.25, 41.302],
      [69.265, 41.305],
      [69.28, 41.31],
    ],
    steps: [{ instruction: "Amir Temur ko‘chasiga o‘ngga buriling", distance_m: 350 }],
    coordinate_order: "longitude_latitude",
    recalculate_after_meters: 100,
    ...route,
  },
  event_recorded: true,
});
const STRAIGHT = (reason = "routing_key_not_configured", retryable = false) => ({
  destination_source: "public_office",
  destination: { latitude: 41.31, longitude: 69.28, coordinates: [69.28, 41.31] },
  web_url: WEB_ROUTE,
  route: { available: false, source: "straight_line_external_app_fallback", mode: "driving", distance_m: 3500, duration_s: 420, geometry: [[69.24, 41.3], [69.28, 41.31]], steps: [], recalculate_after_meters: 100, reason, retryable },
  event_recorded: true,
});

async function startRoute(page: Page) {
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await page.locator('[data-ai-id="marketplace.nearby.results"]').getByRole("button", { name: /Dilnoza Karimova/ }).click();
  const nav = page.locator('[data-ai-id="marketplace.map.card"] [data-ai-id="marketplace.route"]');
  await nav.locator('[data-ai-id="marketplace.route.build"]').click();
  return nav;
}

test("navigator: one session per route — a retry and a mode change keep it, Hide and another seller start a new one", async ({ page, context }) => {
  await noYandex(context, "abort");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 20 });
  const bodies: Record<string, unknown>[] = [];
  const routes = mapRoutes({
    configured: false,
    search: () => ({ items: [HITS[0], { ...marker(S2, "Akmal Yusupov", "yurist", 4.6, "live", true), distance_km: 31.6 }], count: 2, radius_km: 10, fallback_nearest: false, sort: "nearest", consent: consent(true) }),
  });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = (b: unknown) => (bodies.push(b as Record<string, unknown>), bodies.length === 1 ? { status: 503, json: { detail: "x" } } : STRAIGHT());
  routes[`POST /marketplace/sellers/${S2}/navigation`] = (b: unknown) => (bodies.push(b as Record<string, unknown>), STRAIGHT());
  await openMap(page, routes);
  const nav = await startRoute(page);
  await expect(nav.getByRole("alert")).toBeVisible();
  await nav.getByRole("button", { name: "Qayta urinish" }).click();
  await expect(nav.locator('[data-ai-id="marketplace.route.straight"]')).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(String(bodies[0].session_id)).toMatch(UUID);
  expect(bodies[1].session_id).toBe(bodies[0].session_id);
  await nav.getByRole("radio", { name: "Mashina" }).press("ArrowRight");
  await expect(nav.getByRole("radio", { name: "Piyoda" })).toHaveAttribute("aria-checked", "true");
  await nav.locator('[data-ai-id="marketplace.route.build"]').click();
  await expect.poll(() => bodies.length).toBe(3);
  expect(bodies[2]).toMatchObject({ mode: "walking", session_id: bodies[0].session_id });
  await nav.locator('[data-ai-id="marketplace.route.hide"]').click();
  await nav.locator('[data-ai-id="marketplace.route.build"]').click();
  await expect.poll(() => bodies.length).toBe(4);
  expect(String(bodies[3].session_id)).toMatch(UUID);
  expect(bodies[3].session_id).not.toBe(bodies[0].session_id);
  const card = page.locator('[data-ai-id="marketplace.map.card"]');
  await card.getByRole("button", { name: "Ro‘yxatga qaytish" }).click();
  await page.locator('[data-ai-id="marketplace.nearby.results"]').getByRole("button", { name: /Akmal Yusupov/ }).click();
  await card.locator('[data-ai-id="marketplace.route.build"]').click();
  await expect.poll(() => bodies.length).toBe(5);
  expect(String(bodies[4].session_id)).toMatch(UUID);
  expect(new Set(bodies.map((b) => b.session_id)).size).toBe(3);
  for (const b of bodies) expect(b).toMatchObject({ recalculate: false, locale: "uz" });
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  for (const b of bodies) expect(stored).not.toContain(String(b.session_id));
  await storedNothing(page);
});

test("navigator: the route is asked in the page language and the recalculation keeps it", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 15 });
  const bodies: Record<string, unknown>[] = [];
  const routes = mapRoutes({ configured: true });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = (b: unknown) => {
    const body = b as Record<string, unknown>;
    bodies.push(body);
    return ROUTED({ steps: [{ instruction: body.locale === "ru" ? "Поверните направо на Амир Темур" : "Amir Temur ko‘chasiga o‘ngga buriling", distance_m: 350 }] });
  };
  await mockBackend(page, await signIn(page, CLIENT, routes));
  await page.goto("/ru/portal/client/lawyers?mode=nearby");
  const nav = await startRoute(page);
  await nav.locator('[data-ai-id="marketplace.route.follow"]').click();
  const hud = page.locator('[data-ai-id="marketplace.map.follow"]');
  await expect(hud.locator(".mfh__head")).toHaveText("Поверните направо на Амир Темур");
  expect(bodies[0]).toMatchObject({ locale: "ru", recalculate: false });
  await context.setGeolocation({ latitude: 41.3025, longitude: 69.2405, accuracy: 10 });
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({ locale: "ru", recalculate: true, session_id: bodies[0].session_id });
  await hud.locator('[data-ai-id="marketplace.map.follow.stop"]').click();
  await storedNothing(page);
});

test("navigator: the HUD shows the next maneuver with its icon and a live distance, then the destination", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 10 });
  const routes = mapRoutes({ configured: true });
  routes["/marketplace/map/config"] = { ...config(true), routing: { server_route_available: true, frontend_js_route_available: false, recalculate_distance_threshold_meters: 100, server_rate_limit_per_minute: 30 } };
  const step = (index: number, maneuver: string, point: number[], next: number[] | null, instruction: string, street: string | null) => ({
    index,
    mode: "driving",
    distance_m: next ? 300 : 0,
    duration_s: next ? 40 : 0,
    instruction,
    point,
    maneuver,
    street,
    geometry: next ? [point, next] : [point],
  });
  const P = [
    [69.24, 41.3],
    [69.24, 41.303],
    [69.25, 41.303],
    [69.25, 41.3085],
  ];
  const L_ROUTE = {
    destination_source: "public_office",
    destination: { latitude: 41.3085, longitude: 69.25, coordinates: [69.25, 41.3085] },
    web_url: WEB_ROUTE,
    route: {
      available: true,
      mode: "driving",
      distance_m: 1780,
      duration_s: 260,
      geometry: P,
      steps: [
        step(0, "straight", P[0], P[1], "To‘g‘ri davom eting — Bobur ko‘chasi", "Bobur ko‘chasi"),
        step(1, "right", P[1], P[2], "O‘ngga buriling — Amir Temur ko‘chasi", "Amir Temur ko‘chasi"),
        step(2, "left", P[2], P[3], "Chapga buriling — Navoiy ko‘chasi", "Navoiy ko‘chasi"),
        step(3, "arrive", P[3], null, "Manzilga yetib keldingiz", null),
      ],
      coordinate_order: "longitude_latitude",
      recalculate_after_meters: 100,
    },
    event_recorded: true,
  };
  routes[`POST /marketplace/sellers/${S1}/navigation`] = () => L_ROUTE;
  const mock = await openMap(page, routes);
  await page.locator('[data-ai-id="marketplace.nearby.locate"]').click();
  await page.locator('[data-ai-id="marketplace.nearby.results"]').getByRole("button", { name: /Dilnoza Karimova/ }).click();
  const nav = page.locator('[data-ai-id="marketplace.map.card"] [data-ai-id="marketplace.route"]');
  await expect(nav.locator(".mnv__privacy")).toContainText("taxminan har 100 m da");
  await nav.locator('[data-ai-id="marketplace.route.build"]').click();
  await nav.locator('[data-ai-id="marketplace.route.follow"]').click();
  const hud = page.locator('[data-ai-id="marketplace.map.follow"]');
  await expect(hud.locator(".mfh__head")).toHaveText("O‘ngga buriling — Amir Temur ko‘chasi");
  await expect(hud.locator('[data-man="right"]')).toHaveCount(1);
  await expect(hud.locator(".mfh__arrow")).toHaveCount(0);
  await expect(hud.locator(".mfh__headd")).toHaveText("≈ 330 m");
  await shot(page, "navigator-maneuver", '[data-ai-id="marketplace.nearby"]');
  await context.setGeolocation({ latitude: 41.3006, longitude: 69.24, accuracy: 10 });
  await expect(hud.locator(".mfh__headd")).toHaveText("≈ 270 m");
  expect(mock.count("POST", NAV_POST)).toBe(1);
  await context.setGeolocation({ latitude: 41.303, longitude: 69.2425, accuracy: 10 });
  await expect.poll(() => mock.count("POST", NAV_POST)).toBe(2);
  await expect(hud.locator(".mfh__head")).toHaveText("Chapga buriling — Navoiy ko‘chasi");
  await expect(hud.locator('[data-man="left"]')).toHaveCount(1);
  await expect(hud.locator(".mfh__headd")).toHaveText("≈ 630 m");
  await context.setGeolocation({ latitude: 41.3055, longitude: 69.25, accuracy: 10 });
  await expect.poll(() => mock.count("POST", NAV_POST)).toBe(3);
  await expect(hud.locator(".mfh__head")).toHaveText("Manzil oldinda");
  await expect(hud.locator('[data-man="arrive"]')).toHaveCount(1);
  await expect(hud.locator(".mfh__headd")).toHaveText("≈ 330 m");
  await expect(hud).not.toContainText("Manzilga yetib keldingiz");
  await context.setGeolocation({ latitude: 41.3082, longitude: 69.25, accuracy: 10 });
  await expect(hud.locator(".mfh__big")).toHaveText("Yetib keldingiz");
  await expect(hud.locator("[data-man]")).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(mock.count("POST", NAV_POST)).toBe(3);
  await hud.locator('[data-ai-id="marketplace.map.follow.stop"]').click();
  await storedNothing(page);
});

test("navigator: the recalculation goes on when the client passes the threshold again while a request is in flight", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 10 });
  const routes = mapRoutes({ configured: true });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = () => ROUTED();
  await openMap(page, routes);
  const sent: Record<string, unknown>[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((r) => {
    release = () => r();
  });
  await page.route(new RegExp(`/marketplace/sellers/${S1}/navigation$`), async (route) => {
    sent.push(route.request().postDataJSON() as Record<string, unknown>);
    if (sent.length === 2) await held;
    await route.fallback();
  });
  const nav = await startRoute(page);
  await nav.locator('[data-ai-id="marketplace.route.follow"]').click();
  await context.setGeolocation({ latitude: 41.3025, longitude: 69.2405, accuracy: 10 });
  await expect.poll(() => sent.length).toBe(2);
  await context.setGeolocation({ latitude: 41.3051, longitude: 69.2412, accuracy: 10 });
  await page.waitForTimeout(300);
  release();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toEqual({ latitude: 41.3051, longitude: 69.2412, mode: "driving", paid_order_id: null, recalculate: true, session_id: sent[0].session_id, locale: "uz" });
  await page.locator('[data-ai-id="marketplace.map.follow.stop"]').click();
});

test("navigator: reaching the destination stops the recalculation, leaving it starts it again", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 10 });
  const bodies: Record<string, unknown>[] = [];
  const routes = mapRoutes({ configured: true });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = (b: unknown) => (bodies.push(b as Record<string, unknown>), ROUTED());
  await openMap(page, routes);
  const nav = await startRoute(page);
  await nav.locator('[data-ai-id="marketplace.route.follow"]').click();
  const hud = page.locator('[data-ai-id="marketplace.map.follow"]');
  await context.setGeolocation({ latitude: 41.3099, longitude: 69.2799, accuracy: 10 });
  await expect(hud.locator(".mfh__big")).toHaveText("Yetib keldingiz");
  await context.setGeolocation({ latitude: 41.3102, longitude: 69.2803, accuracy: 10 });
  await page.waitForTimeout(600);
  await expect(hud).toHaveClass(/is-arrived/);
  expect(bodies).toHaveLength(1);
  await context.setGeolocation({ latitude: 41.308, longitude: 69.277, accuracy: 10 });
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({ latitude: 41.308, longitude: 69.277, recalculate: true });
  await expect(hud).not.toHaveClass(/is-arrived/);
  await hud.locator('[data-ai-id="marketplace.map.follow.stop"]').click();
  await storedNothing(page);
});

test("navigator: a 429 while recalculating keeps the route and waits retry_after_seconds", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 10 });
  const bodies: Record<string, unknown>[] = [];
  const at: number[] = [];
  const routes = mapRoutes({ configured: true });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = (b: unknown) => {
    bodies.push(b as Record<string, unknown>);
    at.push(Date.now());
    return bodies.length === 2 ? { status: 429, json: { detail: { code: "routing_rate_limit_exceeded", retry_after_seconds: 3, limit_per_minute: 30, remaining: 0 } } } : ROUTED();
  };
  await openMap(page, routes);
  const nav = await startRoute(page);
  await nav.locator('[data-ai-id="marketplace.route.follow"]').click();
  const hud = page.locator('[data-ai-id="marketplace.map.follow"]');
  await expect(hud.locator(".mfh__head")).toHaveText("Amir Temur ko‘chasiga o‘ngga buriling");
  await context.setGeolocation({ latitude: 41.3025, longitude: 69.2405, accuracy: 10 });
  await expect.poll(() => bodies.length).toBe(2);
  await expect(hud).toBeVisible();
  await expect(hud.locator(".mfh__head")).toHaveText("Amir Temur ko‘chasiga o‘ngga buriling");
  await expect(page.locator('.ymaps-stub-line[data-style="solid"]').first()).toHaveAttribute("points", /\S+ \S+ \S+ \S+/);
  await context.setGeolocation({ latitude: 41.305, longitude: 69.241, accuracy: 10 });
  await page.waitForTimeout(1000);
  expect(bodies).toHaveLength(2);
  await expect.poll(() => bodies.length, { timeout: 8000 }).toBe(3);
  expect(at[2] - at[1]).toBeGreaterThanOrEqual(2900);
  expect(bodies[2]).toMatchObject({ latitude: 41.305, longitude: 69.241, recalculate: true });
  await hud.locator('[data-ai-id="marketplace.map.follow.stop"]').click();
});

test("route: a 429 on Show route names the limit and counts down before Retry, with the same session", async ({ page, context }) => {
  await noYandex(context, "abort");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 20 });
  const bodies: Record<string, unknown>[] = [];
  const routes = mapRoutes({ configured: false });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = (b: unknown) => (
    bodies.push(b as Record<string, unknown>),
    bodies.length === 1 ? { status: 429, json: { detail: { code: "routing_rate_limit_exceeded", retry_after_seconds: 2, limit_per_minute: 30, remaining: 0 } } } : STRAIGHT()
  );
  await openMap(page, routes);
  const nav = await startRoute(page);
  await expect(nav.getByRole("alert")).toHaveText("Yo‘nalish so‘rovlari vaqtincha cheklandi. Birozdan so‘ng qayta urining.");
  await expect(nav).not.toContainText("routing_rate_limit_exceeded");
  const build = nav.locator('[data-ai-id="marketplace.route.build"]');
  await expect(build).toBeDisabled();
  await expect(build).toHaveText(/· [1-3] s/);
  expect(bodies).toHaveLength(1);
  await expect(build).toBeEnabled({ timeout: 6000 });
  await expect(build).toHaveText("Qayta urinish");
  await build.click();
  await expect(nav.locator('[data-ai-id="marketplace.route.straight"]')).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1].session_id).toBe(bodies[0].session_id);
});

test("navigator: a retryable fallback mid-trip keeps the route and the recalculation goes on", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 10 });
  const bodies: Record<string, unknown>[] = [];
  const routes = mapRoutes({ configured: true });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = (b: unknown) => (bodies.push(b as Record<string, unknown>), bodies.length === 2 ? STRAIGHT("routing_provider_unavailable", true) : ROUTED());
  await openMap(page, routes);
  const nav = await startRoute(page);
  await nav.locator('[data-ai-id="marketplace.route.follow"]').click();
  const hud = page.locator('[data-ai-id="marketplace.map.follow"]');
  await context.setGeolocation({ latitude: 41.3025, longitude: 69.2405, accuracy: 10 });
  await expect.poll(() => bodies.length).toBe(2);
  await page.waitForTimeout(400);
  await expect(hud.locator(".mfh__head")).toHaveText("Amir Temur ko‘chasiga o‘ngga buriling");
  await expect(page.locator('.ymaps-stub-line[data-style="solid"]').first()).toHaveAttribute("points", /\S+ \S+ \S+ \S+/);
  await context.setGeolocation({ latitude: 41.305, longitude: 69.241, accuracy: 10 });
  await expect.poll(() => bodies.length).toBe(3);
  await hud.locator('[data-ai-id="marketplace.map.follow.stop"]').click();
});

test("navigator: the production fallback (no routing key) sends no recalculation", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 10 });
  const routes = mapRoutes({ configured: true });
  routes[`POST /marketplace/sellers/${S1}/navigation`] = () => STRAIGHT();
  const mock = await openMap(page, routes);
  const nav = await startRoute(page);
  await nav.locator('[data-ai-id="marketplace.route.follow"]').click();
  await context.setGeolocation({ latitude: 41.3025, longitude: 69.2405, accuracy: 10 });
  await page.waitForTimeout(1500);
  expect(mock.count("POST", NAV_POST)).toBe(1);
  await page.locator('[data-ai-id="marketplace.map.follow.stop"]').click();
});

test("navigator: Stop drops a recalculation still in flight and nothing more is sent", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 10 });
  const routes = mapRoutes({ configured: true });
  let calls = 0;
  routes[`POST /marketplace/sellers/${S1}/navigation`] = () => (++calls === 1 ? ROUTED({ distance_m: 9000 }) : ROUTED({ distance_m: 2000, duration_s: 100 }));
  await openMap(page, routes);
  const sent: unknown[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((r) => {
    release = () => r();
  });
  await page.route(new RegExp(`/marketplace/sellers/${S1}/navigation$`), async (route) => {
    sent.push(route.request().postDataJSON());
    if (sent.length === 2) await held;
    await route.fallback().catch(() => undefined);
  });
  const nav = await startRoute(page);
  const eta = nav.locator('[data-ai-id="marketplace.route.eta"]');
  const before = (await eta.textContent()) ?? "";
  await nav.locator('[data-ai-id="marketplace.route.follow"]').click();
  await context.setGeolocation({ latitude: 41.3025, longitude: 69.2405, accuracy: 10 });
  await expect.poll(() => sent.length).toBe(2);
  await page.locator('[data-ai-id="marketplace.map.follow.stop"]').click();
  release();
  await page.waitForTimeout(500);
  await expect(eta).toHaveText(before);
  await context.setGeolocation({ latitude: 41.306, longitude: 69.243, accuracy: 10 });
  await page.waitForTimeout(800);
  expect(sent).toHaveLength(2);
});

test("order: the paid order's navigator shows even when the public marker has no office route", async ({ page, context }) => {
  await noYandex(context, "abort");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 20 });
  let navBody: Record<string, unknown> | null = null;
  const routes = mapRoutes({ configured: false });
  routes[`/marketplace/lawyers/${S2}`] = { user_id: S2, name: "Akmal Yusupov", lawyer_name: "Akmal Yusupov", is_verified: true };
  routes[`POST /marketplace/sellers/${S2}/navigation`] = (b: unknown) => ((navBody = b as Record<string, unknown>), STRAIGHT());
  await mockBackend(page, await signIn(page, CLIENT, routes));
  await page.goto(`/uz/portal/client/lawyers?mode=nearby&route=${S2}&order=ord-9`);
  const card = page.locator('[data-ai-id="marketplace.map.card"]');
  await expect(card).toContainText("Akmal Yusupov");
  await expect(page.locator('[data-ai-id="marketplace.map.area.list"]')).toContainText("Akmal Yusupov");
  await expect(card.locator('[data-ai-id="marketplace.map.card.no-route"]')).toHaveCount(0);
  await card.locator('[data-ai-id="marketplace.route.build"]').click();
  await expect(card.locator('[data-ai-id="marketplace.route.straight"]')).toBeVisible();
  expect(navBody).toMatchObject({ paid_order_id: "ord-9", recalculate: false });
});

test("navigator: a lost location consent during the trip stops the navigator and sends nothing more", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 10 });
  const routes = mapRoutes({ configured: true });
  let calls = 0;
  routes[`POST /marketplace/sellers/${S1}/navigation`] = () => (++calls === 2 ? { status: 403, json: { detail: { code: "client_location_consent_required", consent_url: "/marketplace/me/location-consent" } } } : ROUTED());
  const mock = await openMap(page, routes);
  const nav = await startRoute(page);
  await nav.locator('[data-ai-id="marketplace.route.follow"]').click();
  const hud = page.locator('[data-ai-id="marketplace.map.follow"]');
  await expect(hud).toBeVisible();
  await context.setGeolocation({ latitude: 41.3025, longitude: 69.2405, accuracy: 10 });
  await expect.poll(() => mock.count("POST", NAV_POST)).toBe(2);
  await expect(hud).toHaveCount(0);
  await context.setGeolocation({ latitude: 41.306, longitude: 69.243, accuracy: 10 });
  await page.waitForTimeout(800);
  expect(mock.count("POST", NAV_POST)).toBe(2);
});

test("route: a wait set during the trip explains itself on the disabled route button", async ({ page, context }) => {
  await noYandex(context, "stub");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.3, longitude: 69.24, accuracy: 10 });
  const routes = mapRoutes({ configured: true });
  let calls = 0;
  routes[`POST /marketplace/sellers/${S1}/navigation`] = () => (++calls === 2 ? { status: 429, json: { detail: { code: "routing_rate_limit_exceeded", retry_after_seconds: 6, limit_per_minute: 30, remaining: 0 } } } : ROUTED());
  const mock = await openMap(page, routes);
  const nav = await startRoute(page);
  await nav.locator('[data-ai-id="marketplace.route.follow"]').click();
  await context.setGeolocation({ latitude: 41.3025, longitude: 69.2405, accuracy: 10 });
  await expect.poll(() => mock.count("POST", NAV_POST)).toBe(2);
  await page.locator('[data-ai-id="marketplace.map.follow.stop"]').click();
  await nav.locator('[data-ai-id="marketplace.route.hide"]').click();
  const build = nav.locator('[data-ai-id="marketplace.route.build"]');
  await expect(build).toBeDisabled();
  await expect(build).toHaveText(/· \d s/);
  await expect(nav.locator('[data-ai-id="marketplace.route.wait"]')).toHaveText("Yo‘nalish so‘rovlari vaqtincha cheklandi. Birozdan so‘ng qayta urining.");
  await expect(build).toBeEnabled({ timeout: 9000 });
  await expect(nav.locator('[data-ai-id="marketplace.route.wait"]')).toHaveCount(0);
});
