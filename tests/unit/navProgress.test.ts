import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/navProgress against a minimal window/document: the pending mark is on
// while a Link holds it or until the URL changes after a router push.

type Attrs = Set<string>;
function fakeDom(href: string) {
  const attrs: Attrs = new Set();
  const loc = { href, pathname: new URL(href).pathname, search: new URL(href).search, origin: new URL(href).origin };
  const documentElement = {
    hasAttribute: (n: string) => attrs.has(n),
    toggleAttribute: (n: string, on: boolean) => (on ? attrs.add(n) : attrs.delete(n), on),
  };
  vi.stubGlobal("document", { documentElement });
  vi.stubGlobal("window", { location: loc, setInterval, clearInterval, setTimeout, clearTimeout });
  return { attrs, go: (to: string) => Object.assign(loc, { href: to, pathname: new URL(to).pathname, search: new URL(to).search }) };
}

describe("navProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a Link's hold marks the page pending until released", async () => {
    const dom = fakeDom("https://lexgo.uz/uz/portal/client");
    const { holdNavPending } = await import("@/lib/navProgress");
    const release = holdNavPending();
    expect(dom.attrs.has("data-nav-pending")).toBe(true);
    release();
    release(); // twice is harmless
    expect(dom.attrs.has("data-nav-pending")).toBe(false);
  });

  it("a router push stays pending until the URL changes", async () => {
    const dom = fakeDom("https://lexgo.uz/uz/portal/client");
    const { startNavPending } = await import("@/lib/navProgress");
    startNavPending();
    expect(dom.attrs.has("data-nav-pending")).toBe(true);
    vi.advanceTimersByTime(500);
    expect(dom.attrs.has("data-nav-pending")).toBe(true);
    dom.go("https://lexgo.uz/uz/portal/client/lawyers");
    vi.advanceTimersByTime(60);
    expect(dom.attrs.has("data-nav-pending")).toBe(false);
  });

  it("never stays on for good when no navigation follows", async () => {
    const dom = fakeDom("https://lexgo.uz/uz/portal/client");
    const { startNavPending } = await import("@/lib/navProgress");
    startNavPending();
    vi.advanceTimersByTime(16_000);
    expect(dom.attrs.has("data-nav-pending")).toBe(false);
  });

  it("knows the page already shown", async () => {
    fakeDom("https://lexgo.uz/uz/portal/client?tab=a");
    const { isSamePage } = await import("@/lib/navProgress");
    expect(isSamePage("/uz/portal/client?tab=a")).toBe(true);
    expect(isSamePage("/uz/portal/client/")).toBe(false);
    expect(isSamePage("/uz/portal/client?tab=b")).toBe(false);
    expect(isSamePage("/uz/portal/client/lawyers")).toBe(false);
  });
});
