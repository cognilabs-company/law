import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { consentBody, filterOfError, geocoderFailOf, mapErrorKey, navigationPath, nearbySearchBody, normConsent, normNavRoute, normNearbySearch, normOffice, normPlaces, officeSourceOf, safeRouteUrl } from "@/lib/services/mapLocation";
import { DEFAULT_MAP_FILTERS, filterParams, loaderUrlOf, normMapConfig, normSellersMap, serviceActionOf } from "@/lib/services/sellersMap";

// LEXGO_YANDEX_MARKETPLACE_MAP_FRONTEND_2026_10_30: config, markers, consent,
// nearby search, navigation and office location as the backend sends them.

const LIVE_CONFIG = {
  provider: "yandex",
  api_version: "2.1",
  maps_api_key: "0f0f0f0f-1111-2222-3333-444444444444",
  maps_loader_url: "https://api-maps.yandex.ru/2.1/?apikey=0f0f0f0f-1111-2222-3333-444444444444&lang=uz_UZ",
  configured: true,
  default_location: { center: [69.2401, 41.2995], zoom: 11, country_bbox: [55.9, 37.1, 73.2, 45.7] },
  nearby_search_url: "/marketplace/nearby-sellers/search",
  navigation_url_template: "/marketplace/sellers/{seller_user_id}/navigation",
  viewport_debounce_ms: 400,
  consent_policy: { allowed_duration_hours: [1, 24, 168, 720], default_duration_hours: 24 },
  accuracy_warning_threshold_meters: 500,
  realtime: { subscribe_event: "marketplace.map.subscribe", update_event: "marketplace.seller_location_updated" },
  privacy: { public_marker_precision: "approximate_500m", nearby_precision: "approximate_50m" },
};

describe("map config", () => {
  it("reads the contract fields and draws the deployed 2.1 from the config's loader", () => {
    const c = normMapConfig(LIVE_CONFIG);
    expect(c.usable).toBe(true);
    expect(c.engine).toBe("2.1");
    expect(c.loaderUrl).toBe(LIVE_CONFIG.maps_loader_url);
    // The key travels only inside the loader URL.
    expect(Object.values(c)).not.toContain(LIVE_CONFIG.maps_api_key);
    expect(c.center).toEqual([69.2401, 41.2995]);
    expect(c.countryBbox).toEqual({ minLon: 55.9, minLat: 37.1, maxLon: 73.2, maxLat: 45.7 });
    expect(c.consentHours).toBe(24);
    expect(c.accuracyWarnM).toBe(500);
    expect(c.realtime.update).toBe("marketplace.seller_location_updated");
    expect(c.realtime.unsubscribe).toBe("marketplace.map.unsubscribe");
    expect(c.markerPrecision).toBe("approximate_500m");
  });
  it("configured=false, no loader or an unknown api_version means no map (the list)", () => {
    expect(normMapConfig({ ...LIVE_CONFIG, configured: false }).usable).toBe(false);
    expect(normMapConfig({ ...LIVE_CONFIG, maps_loader_url: "" }).usable).toBe(false);
    expect(normMapConfig({ ...LIVE_CONFIG, api_version: "v3" })).toMatchObject({ engine: "", usable: false });
    expect(normMapConfig({ ...LIVE_CONFIG, api_version: "3.0" }).usable).toBe(false);
    expect(normMapConfig({ ...LIVE_CONFIG, api_version: "2.1.79" })).toMatchObject({ engine: "2.1", usable: true });
  });
  it("takes the loader only from a Yandex Maps host over https", () => {
    expect(loaderUrlOf("https://api-maps.yandex.ru/2.1/?apikey=k&lang=ru_RU")).toBe("https://api-maps.yandex.ru/2.1/?apikey=k&lang=ru_RU");
    expect(loaderUrlOf("https://enterprise.api-maps.yandex.ru/2.1/?apikey=k")).toBe("https://enterprise.api-maps.yandex.ru/2.1/?apikey=k");
    expect(loaderUrlOf("http://api-maps.yandex.ru/2.1/")).toBe("");
    expect(loaderUrlOf("https://api-maps.yandex.ru.evil.example/2.1/")).toBe("");
    expect(loaderUrlOf("https://evil.example/?api-maps.yandex.ru")).toBe("");
    expect(loaderUrlOf("javascript:alert(1)")).toBe("");
    expect(loaderUrlOf("/2.1/")).toBe("");
  });
  it("ignores unsafe URLs from the config", () => {
    const c = normMapConfig({ ...LIVE_CONFIG, nearby_search_url: "https://evil.example/x", navigation_url_template: "//evil/{seller_user_id}" });
    expect(c.nearbySearchUrl).toBe("/marketplace/nearby-sellers/search");
    expect(c.navigationTemplate).toBe("/marketplace/sellers/{seller_user_id}/navigation");
  });
});

describe("map markers and filters", () => {
  it("reads display_name, the approximate source and navigation availability", () => {
    const r = normSellersMap({
      items: [{ seller_user_id: "s1", display_name: "Dilnoza Karimova", coordinates: [69.24, 41.3], location_source: "profile_region", navigation: { available: false, modes: ["walking"] }, service_action: { id: "v1", title: "Aliment", price: 300000, currency: "UZS", can_purchase: true, purchase_url: "/marketplace/services/v1/purchase" } }],
      markers: [],
      clusters: [{ id: "cluster-6-98-58", count: 8, coordinates: [69.239, 41.298], bbox: { min_longitude: 69.2, min_latitude: 41.2, max_longitude: 69.3, max_latitude: 41.3 } }],
      total_in_bbox: 9,
    });
    expect(r.sellers[0]).toMatchObject({ name: "Dilnoza Karimova", source: "profile_region", exact: false, nav: { available: false, modes: ["walking"] }, service: { id: "v1", title: "Aliment", price: 300000, currency: "UZS", canPurchase: true, purchaseUrl: "/marketplace/services/v1/purchase" } });
    expect(r.clusters[0]).toMatchObject({ id: "cluster-6-98-58", count: 8 });
    expect(r.total).toBe(9);
  });
  it("reads service_action by its id (§7.3), never a service_id", () => {
    expect(serviceActionOf({ service_action: { id: "s9", title: "Maslahat", price: "150000", currency: "uzs", can_purchase: false, purchase_url: "https://evil.example/x" } })).toEqual({ id: "s9", title: "Maslahat", price: 150000, currency: "UZS", canPurchase: false, purchaseUrl: "" });
    expect(serviceActionOf({ service_action: { service_id: "old", title: "Old", effective_price: 1 } })).toBeNull();
    expect(serviceActionOf({ service_action: null })).toBeNull();
  });
  it("sends every filter the contract lists", () => {
    const qs = filterParams({ serviceId: "v1", categoryId: "c1", subcategoryId: "c2", sellerType: "advokat_tashkiloti", minRating: 4.5, verifiedOnly: false }, new URLSearchParams());
    expect(Object.fromEntries(qs)).toEqual({ service_id: "v1", category_id: "c1", subcategory_id: "c2", seller_type: "advokat_tashkiloti", minimum_rating: "4.5", verified_only: "false" });
    expect(Object.fromEntries(filterParams(DEFAULT_MAP_FILTERS, new URLSearchParams()))).toEqual({ verified_only: "true" });
  });
});

describe("consent", () => {
  it("builds the three request shapes", () => {
    expect(consentBody({ granted: true, source: "web", durationHours: 24 })).toEqual({ granted: true, permission_state: "granted", source: "web", duration_hours: 24 });
    expect(consentBody({ granted: true, source: "manual", durationHours: 24 })).toEqual({ granted: true, permission_state: "granted", source: "manual", duration_hours: 24 });
    expect(consentBody({ granted: false, permissionState: "denied" })).toEqual({ granted: false, permission_state: "denied", source: "web" });
  });
  it("treats an expired consent as not granted", () => {
    expect(normConsent({ granted: true, permission_state: "granted", expires_at: "2000-01-01T00:00:00Z" }).granted).toBe(false);
    expect(normConsent({ granted: false, permission_state: "prompt" })).toMatchObject({ granted: false, permissionState: "prompt" });
  });
});

describe("nearby search", () => {
  it("sends the contract body", () => {
    const b = nearbySearchBody({ point: { latitude: 41.2995, longitude: 69.2401 }, accuracyM: 25.4, radius: 10, sort: "nearest", filters: DEFAULT_MAP_FILTERS, limit: 50 });
    expect(b).toEqual({ latitude: 41.2995, longitude: 69.2401, accuracy_meters: 25, radius_km: 10, service_id: null, category_id: null, subcategory_id: null, seller_type: null, minimum_rating: 0, verified_only: true, sort: "nearest", limit: 50 });
  });
  it("reads the fallback and accuracy flags", () => {
    const r = normNearbySearch({ items: [{ seller_user_id: "s1", display_name: "A", distance_km: 12.5, navigation: { available: true } }], radius_km: 5, fallback_nearest: true, accuracy_warning: true, accuracy_meters: 900, sort: "rating" }, { radius: 5, sort: "nearest" });
    expect(r).toMatchObject({ fallbackNearest: true, accuracyWarning: true, accuracyMeters: 900, sort: "rating", radiusKm: 5 });
    expect(r.items[0]).toMatchObject({ name: "A", distanceKm: 12.5, nav: { available: true } });
  });
});

describe("navigation", () => {
  it("uses only the backend's links and refuses script URLs", () => {
    const r = normNavRoute({ app_url: "yandexmaps://maps.yandex.ru/?rtext=1", web_url: "https://yandex.uz/maps/?rtext=1", fallback_url: "javascript:alert(1)", destination_source: "public_office", mode: "walking" });
    expect(r).toMatchObject({ appUrl: "yandexmaps://maps.yandex.ru/?rtext=1", webUrl: "https://yandex.uz/maps/?rtext=1", fallbackUrl: "", destinationSource: "public_office", mode: "walking" });
    expect(safeRouteUrl("http://plain.example", false)).toBe("");
    expect(safeRouteUrl("data:text/html,x", true)).toBe("");
  });
  it("builds the path from the marker's endpoint or the template", () => {
    expect(navigationPath("a b", "/marketplace/sellers/x1/navigation")).toBe("/marketplace/sellers/x1/navigation");
    expect(navigationPath("a b", "", "/marketplace/sellers/{seller_user_id}/navigation")).toBe("/marketplace/sellers/a%20b/navigation");
  });
});

describe("office and geocoder", () => {
  it("reads the office (§7.5) without its record id", () => {
    expect(normOffice({ configured: false, office: null })).toMatchObject({ configured: false, point: null });
    const o = normOffice({
      configured: true,
      office: { latitude: 41.3, longitude: 69.24, formatted_address: "Toshkent", source: "manual", public_navigation_enabled: true, confirmed_at: "2026-10-31T09:30:00Z", geocoded_at: "2026-10-31T09:29:00Z", record_id: "7f1d2c3b-0000-4000-8000-000000000001" },
    });
    expect(o).toMatchObject({ configured: true, point: { latitude: 41.3, longitude: 69.24 }, address: "Toshkent", source: "map", publicNavigation: true, confirmedAt: Date.parse("2026-10-31T09:30:00Z"), geocodedAt: Date.parse("2026-10-31T09:29:00Z") });
    expect(JSON.stringify(o)).not.toContain("7f1d2c3b");
  });
  it("keeps only office sources it can put in words", () => {
    expect(officeSourceOf("yandex_geocoder")).toBe("address");
    expect(officeSourceOf("browser_geolocation")).toBe("device");
    expect(officeSourceOf("admin")).toBe("staff");
    expect(officeSourceOf("seller_manual")).toBe("map");
    expect(officeSourceOf("x9_unknown")).toBe("");
  });
  it("reads normalized geocoder items (§7.2)", () => {
    expect(
      normPlaces({
        items: [
          { id: "g1", name: "Amir Temur 1", description: "Toshkent, O‘zbekiston", formatted_address: "Toshkent, Amir Temur 1", latitude: 41.311, longitude: 69.279, precision: "exact", kind: "house", country_code: "UZ", components: {} },
          { id: "g2", name: "Chorsu", description: "Toshkent", formatted_address: "Chorsu", latitude: 41.326, longitude: 69.235, precision: "other", kind: "metro" },
          { name: "no point" },
        ],
        count: 3,
        found: 3,
        provider: "yandex",
        cached: false,
        rate_limit_remaining: 58,
        coordinate_order: "longitude_latitude",
      }),
    ).toEqual([
      { key: "69.27900,41.31100|Amir Temur 1", title: "Amir Temur 1", detail: "Toshkent, Amir Temur 1", point: { latitude: 41.311, longitude: 69.279 } },
      { key: "69.23500,41.32600|Chorsu", title: "Chorsu", detail: "Toshkent", point: { latitude: 41.326, longitude: 69.235 } },
    ]);
  });
  it("reads a coordinates array in the answer's coordinate_order", () => {
    expect(normPlaces({ items: [{ name: "A", coordinates: [69.279, 41.311] }], coordinate_order: "longitude_latitude" })[0].point).toEqual({ latitude: 41.311, longitude: 69.279 });
    expect(normPlaces({ items: [{ name: "A", coordinates: [41.311, 69.279] }], coordinate_order: "latitude_longitude" })[0].point).toEqual({ latitude: 41.311, longitude: 69.279 });
  });
});

describe("errors", () => {
  const err = (status: number, code?: string) => new ApiError(status, "x", undefined, { code, data: code ? { detail: { code } } : {} });
  it("maps every listed code to its own key", () => {
    for (const code of ["client_location_consent_required", "navigation_destination_unavailable", "seller_not_found", "paid_order_not_found", "active_paid_order_required", "service_not_found", "category_not_found", "subcategory_not_found", "radius_invalid", "seller_type_invalid", "subcategory_category_mismatch"]) {
      expect(mapErrorKey(err(422, code))).toBe(code);
    }
    expect(mapErrorKey(err(401))).toBe("login_required");
    expect(mapErrorKey(err(429))).toBe("rate_limited");
    expect(filterOfError("subcategory_category_mismatch")).toBe("subcategoryId");
  });
  it("reads a plain string detail as a code and words an unknown code by its status", () => {
    expect(mapErrorKey(new ApiError(404, "seller_not_found", undefined, { data: { detail: "seller_not_found" } }))).toBe("seller_not_found");
    expect(mapErrorKey(err(403, "some_new_backend_code"))).toBe("forbidden");
    expect(mapErrorKey(err(422, "some_new_backend_code"))).toBe("generic");
  });
});

describe("geocoder failures", () => {
  const obj = (status: number, code: string) => new ApiError(status, undefined, undefined, { code, data: { detail: { code } } });
  const str = (status: number, code: string) => new ApiError(status, code, undefined, { data: { detail: code } });
  it("puts every geocoder outage code, object or string detail, in the safe fallback", () => {
    for (const code of ["yandex_geocoder_key_invalid", "yandex_geocoder_not_configured", "yandex_geocoder_unavailable", "seller_type_invalid"]) {
      expect(geocoderFailOf(obj(403, code))).toBe("unavailable");
      expect(geocoderFailOf(str(503, code))).toBe("unavailable");
    }
    expect(geocoderFailOf(obj(429, "geocoder_rate_limit_exceeded"))).toBe("busy");
    expect(geocoderFailOf(str(429, "geocoder_rate_limit_exceeded"))).toBe("busy");
  });
  it("treats a provider 403 without a code as the outage, an unknown code as generic", () => {
    expect(geocoderFailOf(new ApiError(403, "Forbidden"))).toBe("unavailable");
    expect(geocoderFailOf(obj(400, "brand_new_code"))).toBe("generic");
    expect(geocoderFailOf(new ApiError(0, "network_error"))).toBe("offline");
    expect(geocoderFailOf(new Error("x"))).toBe("generic");
  });
});
