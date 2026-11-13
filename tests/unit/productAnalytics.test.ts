import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Product analytics (lib/productAnalytics.ts, backend contract
// TEZKOR_HIMOYA_EXECUTIVE_HRM_LIVE_AI_FRONTEND_2026_11_13 §3): consent-gated,
// no personal data in properties, batched to /analytics/product/events.

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
type Sent = { url: string; body: { events: Record<string, unknown>[] }; auth: string };
let sent: Sent[] = [];

function installBrowser() {
  local.clear();
  session.clear();
  sent = [];
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session, location: { pathname: "/uz", search: "" }, addEventListener: () => undefined });
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
      if (url.endsWith("/analytics/product/config")) {
        return new Response(JSON.stringify({ enabled: true, batch_size: 100, events: ["app_opened", "screen_viewed", "session_started", "session_ended", "lawyer_viewed"], platforms: ["android", "ios", "web"] }), { status: 200 });
      }
      sent.push({ url, body: JSON.parse(init?.body ?? "{}"), auth: init?.headers?.Authorization ?? "" });
      return new Response(JSON.stringify({ accepted: 1, duplicates: 0 }), { status: 200 });
    }),
  );
}

beforeEach(() => {
  vi.resetModules();
  installBrowser();
});
afterEach(() => vi.unstubAllGlobals());

async function load() {
  const C = await import("@/lib/consent");
  const A = await import("@/lib/productAnalytics");
  return { C, A };
}

describe("product analytics", () => {
  it("sends nothing and keeps no id without analytics consent", async () => {
    const { A } = await load();
    A.track("app_opened");
    await A.flush();
    expect(sent).toHaveLength(0);
    expect(local.getItem(A.ANALYTICS_INSTALL_KEY)).toBeNull();
  });

  it("batches web events with a random install id and a session", async () => {
    const { C, A } = await load();
    C.saveConsent({ functional: false, analytics: true, marketing: false });
    A.track("app_opened", { screen: "home" });
    A.track("lawyer_viewed", { properties: { lawyer_id: "u-1", phone: "+998901234567", note: "+998 90 123 45 67", name: "Ali" } });
    await A.flush();
    expect(sent).toHaveLength(1);
    const events = sent[0].body.events;
    expect(events.map((e) => e.event_name)).toEqual(["session_started", "app_opened", "lawyer_viewed"]);
    for (const e of events) {
      expect(e.platform).toBe("web");
      expect(String(e.anonymous_id)).toMatch(/^install-/);
      expect(String(e.session_id)).toMatch(/^session-/);
      expect(typeof e.event_id).toBe("string");
    }
    // Personal data never leaves: by key or by value.
    expect(events[2].properties).toEqual({ lawyer_id: "u-1" });
  });

  it("drops events the backend does not list, and never sends app_installed from the web", async () => {
    const { C, A } = await load();
    C.saveConsent({ functional: false, analytics: true, marketing: false });
    A.track("app_installed");
    A.track("purchase_started"); // not in this test config's list
    await A.flush();
    const names = sent.flatMap((s) => s.body.events.map((e) => e.event_name));
    expect(names).not.toContain("app_installed");
    expect(names).not.toContain("purchase_started");
  });

  it("turning analytics off deletes the install and session ids", async () => {
    const { C, A } = await load();
    C.saveConsent({ functional: false, analytics: true, marketing: false });
    A.track("app_opened");
    expect(local.getItem(A.ANALYTICS_INSTALL_KEY)).not.toBeNull();
    C.saveConsent({ functional: false, analytics: false, marketing: false });
    expect(local.getItem(A.ANALYTICS_INSTALL_KEY)).toBeNull();
    expect(local.getItem(A.ANALYTICS_SESSION_KEY)).toBeNull();
  });

  it("reports the old session's length when a new one starts after idle time", async () => {
    const { C, A } = await load();
    C.saveConsent({ functional: false, analytics: true, marketing: false });
    const start = Date.now() - 3 * 60 * 60 * 1000;
    local.setItem(A.ANALYTICS_SESSION_KEY, JSON.stringify({ id: "session-old", start, last: start + 120_000 }));
    A.track("app_opened");
    await A.flush();
    const ended = sent[0].body.events.find((e) => e.event_name === "session_ended")!;
    expect(ended.session_id).toBe("session-old");
    expect(ended.duration_ms).toBe(120_000);
  });

  it("names screens without the locale or ids", async () => {
    const { A } = await load();
    expect(A.screenOf("/uz")).toBe("home");
    expect(A.screenOf("/ru/lawyers/5f2c9a10-1b2c-4d5e-8f90-1234567890ab")).toBe("lawyers_id");
    expect(A.screenOf("/en/portal/client/services/document/svc-12345")).toBe("portal_client_services_document_id");
  });
});

describe("page exit", () => {
  it("keeps unsent events for the next page and sends them there", async () => {
    let { C, A } = await load();
    C.saveConsent({ functional: false, analytics: true, marketing: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    A.track("app_opened", { screen: "home" });
    await A.flush(true);
    expect(JSON.parse(local.getItem(A.ANALYTICS_QUEUE_KEY) ?? "[]").length).toBeGreaterThan(0);
    // Next page: a fresh module, the network back.
    vi.resetModules();
    const keep = local.getItem(A.ANALYTICS_QUEUE_KEY);
    installBrowser();
    local.setItem("lexgo_cookie_consent", JSON.stringify({ v: 1, at: Date.now(), choices: { functional: false, analytics: true, marketing: false } }));
    local.setItem(A.ANALYTICS_QUEUE_KEY, keep!);
    ({ C, A } = await load());
    A.track("screen_viewed", { screen: "lawyers" });
    await A.flush();
    const names = sent.flatMap((x) => x.body.events.map((e) => `${e.event_name}:${e.screen}`));
    expect(names).toContain("app_opened:home");
    expect(names).toContain("screen_viewed:lawyers");
    expect(local.getItem(A.ANALYTICS_QUEUE_KEY)).toBeNull();
  });
});
