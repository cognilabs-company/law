import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, isRateLimited, retryAfterSec } from "@/lib/http";
import { mapErrorKey, navCoord, navigationBody, navSessionId, normConsent, normNavRoute, normRouteInfo, providerWaitS, recalcArmed, type RouteStep } from "@/lib/services/mapLocation";
import { mapLocaleOf, normMapConfig } from "@/lib/services/sellersMap";
import { orderNavigationOf } from "@/lib/services/marketplace";
import { arrivedNear, etaSeconds, maneuverOfTurn, nextManeuver, nextManeuverAt, pathRemainM, routeRemainM, stepMarks, turnKeyOf } from "@/components/marketplace/map/navText";
import { pathLength, snapOnPath, trackOnPath } from "@/components/marketplace/map/geoMath";

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
      steps: [{ index: 0, mode: "driving", text: "Amir Temur ko‘chasiga o‘ngga buriling", distanceM: 350, durationS: null, point: null, maneuver: null, street: null, geometry: [] }],
      recalcM: 100,
      reason: "",
      retryable: false,
      retryAfterS: null,
    });
  });

  it("reads the d3c6adf step shape: index order, point and geometry in [lon, lat], maneuver, street", () => {
    const info = normRouteInfo({
      available: true,
      mode: "driving",
      geometry: [
        [69.24, 41.3],
        [69.24, 41.303],
        [69.25, 41.303],
      ],
      steps: [
        { index: 1, mode: "driving", distance_m: 700, duration_s: 90, instruction: "Chapga buriling — Amir Temur ko‘chasi", point: [69.24, 41.303], maneuver: "LEFT", street: "Amir Temur ko‘chasi", geometry: [[69.24, 41.303], [69.25, 41.303]] },
        { index: 0, distance_m: 330, duration_s: 40, instruction: "To‘g‘ri davom eting", point: [69.24, 41.3], maneuver: "straight", street: null, geometry: [[69.24, 41.3], [69.24, 41.303]] },
        { index: 2, instruction: "Manzilga yetib keldingiz", point: [69.25, 41.303], maneuver: "arrive", street: "  " },
        { index: 3, instruction: "x", point: [500, 41], maneuver: "teleport" },
        { index: 4, instruction: "" },
      ],
    });
    expect(info?.steps.map((x) => x.index)).toEqual([0, 1, 2, 3]);
    expect(info?.steps[1]).toEqual({ index: 1, mode: "driving", text: "Chapga buriling — Amir Temur ko‘chasi", distanceM: 700, durationS: 90, point: [69.24, 41.303], maneuver: "left", street: "Amir Temur ko‘chasi", geometry: [[69.24, 41.303], [69.25, 41.303]] });
    expect(info?.steps[0].mode).toBe("driving");
    expect(info?.steps[2]).toMatchObject({ maneuver: "arrive", street: null, mode: "driving" });
    expect(info?.steps[3]).toMatchObject({ maneuver: null, point: null });
    const flipped = normRouteInfo({ available: true, coordinate_order: "latitude_longitude", geometry: [[41.3, 69.24], [41.31, 69.24]], steps: [{ index: 0, instruction: "a", point: [41.31, 69.24], geometry: [[41.3, 69.24]] }] });
    expect(flipped?.steps[0].point).toEqual([69.24, 41.31]);
    expect(flipped?.steps[0].geometry).toEqual([[69.24, 41.3]]);
  });

  it("arms recalculation only for a real route or a retryable fallback", () => {
    const retry = normRouteInfo({ available: false, reason: "routing_provider_unavailable", retryable: true, geometry: [[69.24, 41.3], [69.25, 41.31]] });
    expect(retry?.retryable).toBe(true);
    expect(recalcArmed(retry)).toBe(true);
    expect(recalcArmed(normRouteInfo({ available: false, reason: "routing_key_not_configured", retryable: false }))).toBe(false);
    expect(recalcArmed(normRouteInfo({ available: true, geometry: [[69.24, 41.3], [69.25, 41.31]] }))).toBe(true);
    expect(recalcArmed(null)).toBe(false);
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
    const live = new ApiError(409, "x", undefined, { code: "paid_order_live_location_unavailable", data: { detail: { code: "paid_order_live_location_unavailable" } } });
    expect(mapErrorKey(live)).toBe("paid_order_live_location_unavailable");
  });

  it("waits out the provider's own rate limit, which arrives as a 200", () => {
    const limited = normRouteInfo({ available: false, reason: "routing_provider_rate_limit", retryable: true, retry_after_seconds: 37 });
    expect(limited?.retryAfterS).toBe(37);
    expect(providerWaitS(limited)).toBe(37);
    expect(recalcArmed(limited)).toBe(true);

    const noWait = normRouteInfo({ available: false, reason: "routing_provider_rate_limit", retryable: true });
    expect(noWait?.retryAfterS).toBeNull();
    expect(providerWaitS(noWait)).toBe(60);

    expect(providerWaitS(normRouteInfo({ available: false, reason: "routing_provider_unavailable", retryable: true }))).toBe(0);
    expect(providerWaitS(normRouteInfo({ available: true, reason: "routing_provider_rate_limit", geometry: [[69.24, 41.3], [69.25, 41.31]] }))).toBe(0);
    expect(providerWaitS(null)).toBe(0);
  });

  it("names the routing limit (429) and keeps its wait", () => {
    const e = new ApiError(429, "x", 60, { code: "routing_rate_limit_exceeded", data: { detail: { code: "routing_rate_limit_exceeded", retry_after_seconds: 60, limit_per_minute: 30, remaining: 0 } } });
    expect(mapErrorKey(e)).toBe("routing_rate_limit_exceeded");
    expect(isRateLimited(e)).toBe(true);
    expect(retryAfterSec(e, 5)).toBe(60);
    expect(mapErrorKey(new ApiError(429, "x"))).toBe("rate_limited");
  });
});

describe("navigation request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the body with recalculate, session_id and locale", () => {
    expect(navigationBody({ point: { latitude: 41.2995, longitude: 69.2401 }, mode: "driving", recalculate: false, sessionId: "s-1", locale: "uz" })).toEqual({
      latitude: 41.2995,
      longitude: 69.2401,
      mode: "driving",
      paid_order_id: null,
      recalculate: false,
      session_id: "s-1",
      locale: "uz",
    });
    const b = navigationBody({ point: { latitude: 41.3, longitude: 69.24 }, mode: "walking", paidOrderId: "ord-77", recalculate: true, sessionId: "x".repeat(80), locale: "ru" });
    expect(b).toMatchObject({ paid_order_id: "ord-77", recalculate: true, locale: "ru", mode: "walking" });
    expect(String(b.session_id)).toHaveLength(64);
  });

  it("makes a fresh session id of at most 64 characters, with a fallback", () => {
    const a = navSessionId();
    const b = navSessionId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
    vi.stubGlobal("crypto", {});
    const c = navSessionId();
    const d = navSessionId();
    expect(c.length).toBeGreaterThan(4);
    expect(c.length).toBeLessThanOrEqual(64);
    expect(c).not.toBe(d);
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

  it("finds the next maneuver along the route and its live distance", () => {
    const P = [
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.303, longitude: 69.24 },
      { latitude: 41.303, longitude: 69.25 },
      { latitude: 41.3085, longitude: 69.25 },
    ];
    const step = (index: number, maneuver: "straight" | "right" | "left" | "arrive", p: { latitude: number; longitude: number }) => ({
      index,
      mode: "driving" as const,
      text: maneuver,
      distanceM: null,
      durationS: null,
      point: [p.longitude, p.latitude] as [number, number],
      maneuver,
      street: null,
      geometry: [],
    });
    const steps = [step(0, "straight", P[0]), step(1, "right", P[1]), step(2, "left", P[2]), step(3, "arrive", P[3])];
    const marks = stepMarks(P, steps);
    expect(marks).toHaveLength(4);
    expect(marks[0].along).toBe(0);
    expect(Math.abs(marks[1].along - 333.6)).toBeLessThan(3);
    expect(Math.abs(marks[2].along - 1168.9)).toBeLessThan(3);
    expect(Math.abs(marks[3].along - 1780.5)).toBeLessThan(3);
    const at = (lat: number, lon: number) => nextManeuver(P, marks, { latitude: lat, longitude: lon });
    expect(at(41.3, 69.24)).toMatchObject({ step: { maneuver: "right" } });
    expect(Math.abs((at(41.3, 69.24)?.distM ?? 0) - 333.6)).toBeLessThan(3);
    expect(at(41.3006, 69.24)?.step.maneuver).toBe("right");
    expect(Math.abs((at(41.3006, 69.24)?.distM ?? 0) - 266.9)).toBeLessThan(3);
    expect(at(41.303, 69.2425)?.step.maneuver).toBe("left");
    expect(at(41.3055, 69.25)?.step.maneuver).toBe("arrive");
    expect(at(41.30845, 69.25)).toBeNull();
    const back = [
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.31, longitude: 69.24 },
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.3, longitude: 69.25 },
    ];
    const loop = stepMarks(back, [step(0, "straight", back[0]), step(1, "left", back[1]), step(2, "right", back[2]), step(3, "arrive", back[3])]);
    for (let i = 1; i < loop.length; i++) expect(loop[i].along).toBeGreaterThan(loop[i - 1].along);
    expect(stepMarks(P, [{ ...steps[1], point: null }])).toEqual([]);
    expect(stepMarks([P[0]], steps)).toEqual([]);
  });

  it("scales the backend's time by what is left, and estimates without it", () => {
    expect(etaSeconds(500, "driving", { distanceM: 1000, durationS: 600 })).toEqual({ s: 300, sure: true });
    const guess = etaSeconds(830, "driving", null);
    expect(guess.sure).toBe(false);
    expect(Math.round(guess.s)).toBe(100);
  });
});

describe("navigator texts", () => {
  const read = (l: string) => JSON.parse(readFileSync(join(process.cwd(), "messages", `${l}.json`), "utf8")).marketMap;
  it.each(["uz", "ru", "en"])("%s has the recalculation, rate limit and arrival texts", (l) => {
    const m = read(l);
    expect(m.route.privacyFollow).toContain("{m}");
    expect(m.route.privacyFollow).not.toMatch(/bir marta|один раз|\bonce\b/);
    expect(m.route.privacy).toBeTruthy();
    expect(m.route.retryIn).toContain("{n}");
    expect(m.follow.arriveAhead).toBeTruthy();
    expect(m.errors.routing_rate_limit_exceeded).toBeTruthy();
    expect(m.errors.routing_rate_limit_exceeded).not.toContain("{");
    expect(m.errors.paid_order_live_location_unavailable).toBeTruthy();
  });
});

describe("turn-by-turn helpers", () => {
  const ll = (lon: number, lat: number): [number, number] => [lon, lat];
  const north = [ll(69.24, 41.3), ll(69.24, 41.301)];
  it("names a turn with the backend's thresholds", () => {
    expect(maneuverOfTurn(north, [ll(69.24, 41.301), ll(69.241, 41.301)])).toBe("right");
    expect(maneuverOfTurn(north, [ll(69.24, 41.301), ll(69.239, 41.301)])).toBe("left");
    expect(maneuverOfTurn(north, [ll(69.24, 41.301), ll(69.24, 41.302)])).toBe("straight");
    expect(maneuverOfTurn(north, [ll(69.24, 41.301), ll(69.2404, 41.302)])).toBe("slight_right");
    expect(maneuverOfTurn(north, [ll(69.24, 41.301), ll(69.24, 41.3)])).toBe("uturn");
    expect(maneuverOfTurn(north, [ll(69.24, 41.301), ll(69.241, 41.3)])).toBe("sharp_right");
    expect(maneuverOfTurn([ll(69.24, 41.3)], north)).toBeNull();
  });

  const P = [
    { latitude: 41.3, longitude: 69.24 },
    { latitude: 41.303, longitude: 69.24 },
    { latitude: 41.303, longitude: 69.25 },
    { latitude: 41.3085, longitude: 69.25 },
  ];
  const L = P.map((p) => ll(p.longitude, p.latitude));
  const step = (index: number, maneuver: RouteStep["maneuver"], point: [number, number] | null, geometry: [number, number][], mode: RouteStep["mode"] = "driving"): RouteStep => ({
    index,
    mode,
    text: String(maneuver),
    distanceM: null,
    durationS: null,
    point,
    maneuver,
    street: null,
    geometry,
  });

  it("adds the final turn the backend folds into its last 'arrive' step", () => {
    const today = stepMarks(P, [step(0, "straight", L[0], [L[0], L[1]]), step(1, "right", L[1], [L[1], L[2]]), step(2, "arrive", L[3], [L[2], L[3]])]);
    expect(today.map((m) => m.step.maneuver)).toEqual(["straight", "right", "left", "arrive"]);
    expect(today[2].step.text).toBe("");
    expect(Math.abs(today[2].along - 1168.9)).toBeLessThan(3);
    const fixed = stepMarks(P, [step(0, "straight", L[0], [L[0], L[1]]), step(1, "right", L[1], [L[1], L[2]]), step(2, "left", L[2], [L[2], L[3]]), step(3, "arrive", L[3], [L[3]])]);
    expect(fixed.map((m) => m.step.maneuver)).toEqual(["straight", "right", "left", "arrive"]);
    expect(fixed[2].step.text).toBe("left");
  });

  it("passes a turn later on foot than by car", () => {
    const marks = [
      { step: step(1, "right", L[1], [], "walking"), along: 100 },
      { step: step(2, "arrive", L[3], [], "walking"), along: 400 },
    ];
    expect(nextManeuverAt(marks, 95)?.step.maneuver).toBe("right");
    const car = marks.map((m) => ({ ...m, step: { ...m.step, mode: "driving" as const } }));
    expect(nextManeuverAt(car, 95)?.step.maneuver).toBe("arrive");
  });

  it("follows progress along an out-and-back route instead of jumping to the first leg", () => {
    const back = [
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.31, longitude: 69.24 },
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.3, longitude: 69.25 },
    ];
    const near = { latitude: 41.3012, longitude: 69.24 };
    expect(snapOnPath(back, near).along).toBeLessThan(200);
    const t = trackOnPath(back, near, { along: 2000, off: 0, at: { latitude: 41.3025, longitude: 69.24 } });
    expect(t.along).toBeGreaterThan(2000);
    expect(t.off).toBeLessThan(1);
    const fresh = trackOnPath(back, { latitude: 41.3005, longitude: 69.24 }, null);
    expect(fresh.along).toBeLessThan(100);
    const lost = trackOnPath(back, { latitude: 41.3, longitude: 69.2495 }, { along: 100, off: 0, at: { latitude: 41.3009, longitude: 69.24 } });
    expect(lost.along).toBeGreaterThan(2200);
  });

  it("arrives by the route, not by the crow's distance", () => {
    expect(arrivedNear(30, 500, 0)).toBe(false);
    expect(arrivedNear(30, 40, 0)).toBe(true);
    expect(arrivedNear(30, null, 0)).toBe(true);
    expect(arrivedNear(70, 10, 0)).toBe(false);
    expect(arrivedNear(30, 80, 30)).toBe(true);
    expect(arrivedNear(null, 10, 0)).toBe(false);
    const len = pathLength(P);
    expect(routeRemainM(P, len, { path: P, along: len - 20, off: 5 })).toBeCloseTo(25, 5);
    expect(routeRemainM(P, len, { path: [...P], along: 10, off: 0 })).toBeNull();
  });

  it("rounds the navigation origin to about 11 m", () => {
    expect(navCoord(41.302549)).toBe(41.3025);
    expect(navCoord(69.24056)).toBe(69.2406);
  });
});
