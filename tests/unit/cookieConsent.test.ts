import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cookie consent (lib/consent.ts) and the gates that hang off it: nothing
// optional is written to the device or loaded before its category is on,
// and turning a category off removes what it kept.

class MemStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const local = new MemStorage();
const session = new MemStorage();
const appended: { src: string }[] = [];

function installBrowser(search = "") {
  local.clear();
  session.clear();
  appended.length = 0;
  const doc = {
    referrer: "https://t.me/",
    head: { appendChild: (el: { src: string }) => appended.push(el) },
    createElement: () => ({ dataset: {}, src: "", async: false, remove() {} }),
    querySelectorAll: () => [],
  };
  vi.stubGlobal("window", {
    localStorage: local,
    sessionStorage: session,
    location: { pathname: "/uz", search },
    addEventListener: () => undefined,
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
}

beforeEach(() => installBrowser("?ref=FRIEND42&utm_source=tg"));
afterEach(() => vi.unstubAllGlobals());

const C = await import("@/lib/consent");

describe("parseConsent", () => {
  const now = Date.UTC(2026, 10, 1);
  const rec = (over: Record<string, unknown> = {}) => JSON.stringify({ v: C.CONSENT_VERSION, at: now - 1000, choices: { functional: true, analytics: false, marketing: true }, ...over });

  it("reads a current record and keeps only real yes answers", () => {
    expect(C.parseConsent(rec(), now)).toEqual({ v: C.CONSENT_VERSION, at: now - 1000, choices: { functional: true, analytics: false, marketing: true } });
    expect(C.parseConsent(rec({ choices: { functional: "yes", analytics: 1, marketing: null } }), now)?.choices).toEqual(C.NO_OPTIONAL);
  });

  it("treats no record, a broken one or another version as no choice", () => {
    expect(C.parseConsent(null, now)).toBeNull();
    expect(C.parseConsent("", now)).toBeNull();
    expect(C.parseConsent("{not json", now)).toBeNull();
    expect(C.parseConsent("[]", now)).toBeNull();
    expect(C.parseConsent(rec({ v: C.CONSENT_VERSION + 1 }), now)).toBeNull();
    expect(C.parseConsent(rec({ v: undefined }), now)).toBeNull();
    expect(C.parseConsent(rec({ choices: undefined }), now)).toBeNull();
  });

  it("asks again after 12 months, and never trusts a date from the future", () => {
    expect(C.parseConsent(rec({ at: now - C.CONSENT_MAX_AGE_MS + 1000 }), now)).not.toBeNull();
    expect(C.parseConsent(rec({ at: now - C.CONSENT_MAX_AGE_MS - 1 }), now)).toBeNull();
    expect(C.parseConsent(rec({ at: now + 10 * 60_000 }), now)).toBeNull();
  });
});

describe("the browser's choice", () => {
  it("has every optional category off before the visitor chooses", () => {
    expect(C.readConsent()).toBeNull();
    for (const k of C.CONSENT_CATEGORIES) expect(C.hasConsent(k)).toBe(false);
  });

  it("saves a dated, versioned choice and reads it back as one stable object", () => {
    const rec = C.saveConsent({ functional: true, analytics: false, marketing: false }, Date.now());
    expect(JSON.parse(local.getItem(C.CONSENT_KEY)!)).toEqual(rec);
    expect(rec.v).toBe(C.CONSENT_VERSION);
    expect(C.hasConsent("functional")).toBe(true);
    expect(C.hasConsent("marketing")).toBe(false);
    expect(C.readConsent()).toBe(C.readConsent());
  });

  it("removes what marketing kept the moment it is turned off", () => {
    C.saveConsent(C.ALL_OPTIONAL);
    local.setItem("lexgo_ref", "x");
    local.setItem("lexgo_attr", "x");
    local.setItem("lexgo_theme", "dark");
    session.setItem("lexgo_promo_session", "x");
    session.setItem("lexgo_promo_attribution", "x");
    C.saveConsent({ functional: true, analytics: true, marketing: false });
    expect(local.getItem("lexgo_ref")).toBeNull();
    expect(local.getItem("lexgo_attr")).toBeNull();
    expect(session.getItem("lexgo_promo_session")).toBeNull();
    expect(session.getItem("lexgo_promo_attribution")).toBeNull();
    // Necessary storage is never touched.
    expect(local.getItem("lexgo_theme")).toBe("dark");
  });

  it("runs gated work only once its category is turned on, and only once", () => {
    const run = vi.fn();
    const stop = C.whenConsented("marketing", run);
    expect(run).not.toHaveBeenCalled();
    C.saveConsent({ functional: true, analytics: false, marketing: false });
    expect(run).not.toHaveBeenCalled();
    C.saveConsent(C.ALL_OPTIONAL);
    C.saveConsent(C.ALL_OPTIONAL);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
    const now = vi.fn();
    C.whenConsented("marketing", now);
    expect(now).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when the caller leaves", () => {
    const run = vi.fn();
    C.whenConsented("analytics", run)();
    C.saveConsent(C.ALL_OPTIONAL);
    expect(run).not.toHaveBeenCalled();
  });

  it("opens and closes the settings dialog for every listener", () => {
    const seen = vi.fn();
    const off = C.subscribeConsentSettings(seen);
    C.openConsentSettings();
    expect(C.consentSettingsOpen()).toBe(true);
    C.closeConsentSettings();
    expect(C.consentSettingsOpen()).toBe(false);
    expect(seen).toHaveBeenCalledTimes(2);
    off();
  });
});

describe("marketing storage waits for consent", () => {
  it("keeps no referral code or UTM tags without it", async () => {
    const { captureReferral, readReferral } = await import("@/lib/referral");
    const { captureAttribution, attributionDetails } = await import("@/lib/attribution");
    captureReferral("?ref=FRIEND42");
    captureAttribution();
    expect(local.getItem("lexgo_ref")).toBeNull();
    expect(local.getItem("lexgo_attr")).toBeNull();
    expect(readReferral()).toBe("");
    expect(attributionDetails()).toEqual({});
  });

  it("keeps them, from the page the visit started on, once marketing is on", async () => {
    const { captureReferral, readReferral } = await import("@/lib/referral");
    const { captureAttribution, attributionDetails } = await import("@/lib/attribution");
    const landing = { pathname: "/uz", search: "?ref=FRIEND42&utm_source=tg", referrer: "https://t.me/" };
    C.saveConsent({ functional: false, analytics: false, marketing: true });
    captureReferral(landing.search);
    captureAttribution(landing);
    expect(readReferral()).toBe("FRIEND42");
    expect(attributionDetails()).toMatchObject({ utm_source: "tg", landing_page: "/uz?ref=FRIEND42&utm_source=tg", referrer: "https://t.me/" });
  });

  it("measures promotions without leaving an id in the tab until marketing is on", async () => {
    const promo = await import("@/lib/services/promoEvents");
    const key = promo.promoSessionKey();
    expect(key).toBeTruthy();
    expect(session.getItem("lexgo_promo_session")).toBeNull();
    promo.rememberPromoClick("seller-1", "promo-1", "search");
    expect(session.getItem("lexgo_promo_attribution")).toBeNull();
  });
});

describe("Yandex Maps waits for functional consent", () => {
  const config = { usable: true, engine: "2.1", loaderUrl: "https://api-maps.yandex.ru/2.1/?lang=uz_UZ" } as never;

  it("refuses to load the script without it and adds nothing to the page", async () => {
    const { openYandexMap } = await import("@/components/marketplace/map/ymaps");
    await expect(openYandexMap(config, {} as HTMLElement, { center: [69.24, 41.3], zoom: 11, theme: "light" })).rejects.toThrow("ymaps_consent");
    expect(appended).toHaveLength(0);
  });

  it("adds the loader script once functional is on", async () => {
    const { openYandexMap } = await import("@/components/marketplace/map/ymaps");
    C.saveConsent({ functional: true, analytics: false, marketing: false });
    const p = openYandexMap(config, {} as HTMLElement, { center: [69.24, 41.3], zoom: 11, theme: "light" });
    p.catch(() => undefined);
    expect(appended.map((s) => s.src)).toEqual(["https://api-maps.yandex.ru/2.1/?lang=uz_UZ"]);
  });
});
