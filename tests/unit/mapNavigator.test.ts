import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { mapErrorKey, normConsent, normNavRoute, normRouteInfo } from "@/lib/services/mapLocation";
import { mapLocaleOf, normMapConfig } from "@/lib/services/sellersMap";
import { orderNavigationOf } from "@/lib/services/marketplace";
import { etaSeconds, pathRemainM, turnKeyOf } from "@/components/marketplace/map/navText";

// LEXGO_YANDEX_MAP_BACKEND_FINAL_2026_11_02: locale loader, routing config,
// the navigation route object, consent states, order navigation and 409.

describe("map config", () => {
  it("keeps the backend's routing settings and the loader for the asked locale", () => {
    const c = normMapConfig({
      provider: "yandex",
      api_version: "2.1",
      configured: true,
      maps_loader_url: "https://api-maps.yandex.ru/2.1/?apikey=k&lang=ru_RU",
      routing: { server_route_available: false, frontend_js_route_available: true, recalculate_distance_threshold_meters: 150 },
    });
    expect(c.usable).toBe(true);
    expect(c.loaderUrl).toContain("lang=ru_RU");
    expect(c.routing).toEqual({ serverRoute: false, recalcM: 150 });
    expect(normMapConfig({}).routing).toEqual({ serverRoute: false, recalcM: 100 });
    expect(normMapConfig({ routing: { recalculate_distance_threshold_meters: 5 } }).routing.recalcM).toBe(100);
  });

  it("maps any language to one of the three loader locales", () => {
    expect(mapLocaleOf("ru")).toBe("ru");
    expect(mapLocaleOf("en-US")).toBe("en");
    expect(mapLocaleOf("uz")).toBe("uz");
    expect(mapLocaleOf("")).toBe("uz");
  });
});

describe("navigation route", () => {
  it("reads a real route: geometry in [lon, lat], distance, time and steps", () => {
    const r = normNavRoute({
      destination_source: "public_office",
      route: {
        available: true,
        mode: "driving",
        distance_m: 4820,
        duration_s: 840,
        duration_in_traffic_s: 1020,
        geometry: [
          [69.2401, 41.2995],
          [69.2433, 41.3012],
          [69.2406, 41.3111],
        ],
        steps: [{ instruction: "Amir Temur ko‘chasiga o‘ngga buriling", distance_m: 350 }, { instruction: "" }],
        coordinate_order: "longitude_latitude",
        recalculate_after_meters: 100,
        reason: null,
      },
    });
    expect(r.info).toEqual({
      available: true,
      distanceM: 4820,
      durationS: 840,
      trafficS: 1020,
      path: [
        [69.2401, 41.2995],
        [69.2433, 41.3012],
        [69.2406, 41.3111],
      ],
      steps: [{ text: "Amir Temur ko‘chasiga o‘ngga buriling", distanceM: 350 }],
      recalcM: 100,
      reason: "",
    });
  });

  it("treats the straight-line fallback as no route", () => {
    const info = normRouteInfo({ available: false, source: "straight_line_external_app_fallback", distance_m: 1288, duration_s: 155, geometry: [[69.2401, 41.2995], [69.240562, 41.311081]], steps: [], reason: "routing_key_not_configured" });
    expect(info?.available).toBe(false);
    expect(info?.durationS).toBe(155);
    expect(info?.reason).toBe("routing_key_not_configured");
    expect(normRouteInfo(null)).toBeNull();
    expect(normRouteInfo({ available: true, geometry: [[69.24, 41.3]] })?.available).toBe(false);
  });

  it("names the closed public office (409) in words", () => {
    const e = new ApiError(409, "x", undefined, { code: "public_office_navigation_unavailable", data: { detail: { code: "public_office_navigation_unavailable" } } });
    expect(mapErrorKey(e)).toBe("public_office_navigation_unavailable");
  });
});

describe("consent and order navigation", () => {
  it("reads the effective consent state", () => {
    expect(normConsent({ granted: true, effective_state: "granted", expires_at: new Date(Date.now() + 3600e3).toISOString() })).toMatchObject({ granted: true, state: "granted" });
    expect(normConsent({ granted: true, expired: true, effective_state: "expired" })).toMatchObject({ granted: false, state: "expired" });
    expect(normConsent({ granted: true, expires_at: new Date(Date.now() - 60e3).toISOString() })).toMatchObject({ granted: false, state: "expired" });
    expect(normConsent({ granted: false, effective_state: "revoked" })).toMatchObject({ granted: false, state: "revoked" });
  });

  it("reads the order's navigation capability and its modes", () => {
    expect(orderNavigationOf({ available: true, reason: null, paid_order_id: "o1", modes: ["driving", "walking", "boat"] })).toEqual({ available: true, reason: "", paidOrderId: "o1", modes: ["driving", "walking"] });
    expect(orderNavigationOf({ available: false, reason: "office_not_set" })).toMatchObject({ available: false, reason: "office_not_set" });
    expect(orderNavigationOf(undefined).available).toBe(false);
  });
});

describe("navigator maths", () => {
  it("names the turn from the angle to the target", () => {
    expect(turnKeyOf(5)).toBe("straight");
    expect(turnKeyOf(40)).toBe("slightRight");
    expect(turnKeyOf(90)).toBe("right");
    expect(turnKeyOf(140)).toBe("sharpRight");
    expect(turnKeyOf(175)).toBe("back");
    expect(turnKeyOf(-90)).toBe("left");
    expect(turnKeyOf(-40)).toBe("slightLeft");
    expect(turnKeyOf(450)).toBe("right");
  });

  it("measures what is left of the route from the nearest point on it", () => {
    const path = [
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.31, longitude: 69.24 },
    ];
    const whole = pathRemainM(path, path[0]);
    expect(whole).toBeGreaterThan(1100);
    expect(whole).toBeLessThan(1120);
    const half = pathRemainM(path, { latitude: 41.305, longitude: 69.24 });
    expect(Math.abs(half - whole / 2)).toBeLessThan(5);
  });

  it("scales the backend's time by what is left, and estimates without it", () => {
    expect(etaSeconds(500, "driving", { distanceM: 1000, durationS: 600 })).toEqual({ s: 300, sure: true });
    const guess = etaSeconds(830, "driving", null);
    expect(guess.sure).toBe(false);
    expect(Math.round(guess.s)).toBe(100);
  });
});
