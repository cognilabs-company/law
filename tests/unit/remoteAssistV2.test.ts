import { describe, expect, it } from "vitest";
import uz from "@/messages/uz.json";
import ru from "@/messages/ru.json";
import en from "@/messages/en.json";
import {
  RA_MARK_MAX_BYTES,
  RA_MARK_MAX_POINTS,
  RA_MARK_TTL_MS,
  containRect,
  encodeRaWire,
  isRaMark,
  markAlive,
  markOpacity,
  parseRaWire,
  raWireAllowed,
  simplifyPath,
  type RaMark,
  type RaPoint,
} from "@/lib/remoteAssist/marks";
import { raSensitivePage, raShareHidden } from "@/lib/remoteAssist/privacy";
import { capturedTabOf, raOtherTab, raTabHandle } from "@/lib/remoteAssist/tabHandle";
import { RA_GROUPS, RA_NAV_TARGETS, RA_PAGES, raPageOf, raSafeRoute } from "@/lib/remoteAssist/registry";
import { normRaMeta, raBestMode, raConsentScopes, raKey, raModeScopes } from "@/lib/services/remoteAssist";

// Remote assistance v2: drawn marks over the shared tab, the privacy
// auto-hide, the extended page list and the one-click request/consent.

const mark = (over: Partial<RaMark> = {}): RaMark => ({ v: 1, id: "m1", tool: "arrow", color: "blue", points: [[0.1, 0.2], [0.5, 0.6]], w: 800, h: 450, ...over });

describe("marks on the wire", () => {
  it("accepts a well-formed mark of each tool", () => {
    expect(isRaMark(mark())).toBe(true);
    expect(isRaMark(mark({ tool: "pointer", points: [[0.3, 0.3]] }))).toBe(true);
    expect(isRaMark(mark({ tool: "circle" }))).toBe(true);
    expect(isRaMark(mark({ tool: "rect", color: "warm" }))).toBe(true);
    expect(isRaMark(mark({ tool: "pen", color: "cyan", points: [[0, 0], [0.5, 0.5], [1, 1]] }))).toBe(true);
  });

  it("refuses anything outside the shape", () => {
    expect(isRaMark(mark({ tool: "laser" as never }))).toBe(false);
    expect(isRaMark(mark({ color: "red" as never }))).toBe(false);
    expect(isRaMark(mark({ points: [[1.2, 0.5], [0.5, 0.5]] }))).toBe(false);
    expect(isRaMark(mark({ points: [[-0.1, 0.5], [0.5, 0.5]] }))).toBe(false);
    expect(isRaMark(mark({ points: [[Number.NaN, 0.5], [0.5, 0.5]] }))).toBe(false);
    expect(isRaMark(mark({ tool: "pointer", points: [[0.1, 0.1], [0.2, 0.2]] }))).toBe(false);
    expect(isRaMark(mark({ tool: "arrow", points: [[0.1, 0.1]] }))).toBe(false);
    const many: RaPoint[] = Array.from({ length: RA_MARK_MAX_POINTS + 1 }, (_, i) => [i / (RA_MARK_MAX_POINTS + 1), 0.5]);
    expect(isRaMark(mark({ tool: "pen", points: many }))).toBe(false);
    expect(isRaMark(mark({ id: "<script>" }))).toBe(false);
    expect(isRaMark(mark({ w: 0 }))).toBe(false);
    expect(isRaMark({ ...mark(), v: 2 })).toBe(false);
    expect(isRaMark(null)).toBe(false);
  });

  it("round-trips through encode/parse and drops junk and oversized payloads", () => {
    const m = mark();
    expect(parseRaWire(encodeRaWire({ t: "mark", mark: m }))).toEqual({ t: "mark", mark: m });
    expect(parseRaWire(encodeRaWire({ t: "clear" }))).toEqual({ t: "clear" });
    expect(parseRaWire(encodeRaWire({ t: "ask-share" }))).toEqual({ t: "ask-share" });
    expect(parseRaWire(JSON.stringify({ t: "share", state: { surface: "browser", hidden: true, on: true, extra: 1 } }))).toEqual({ t: "share", state: { surface: "browser", hidden: true, on: true } });
    expect(parseRaWire("not json")).toBeNull();
    expect(parseRaWire(JSON.stringify({ t: "mark", mark: { ...m, color: "red" } }))).toBeNull();
    expect(parseRaWire(JSON.stringify({ t: "exec", code: "x" }))).toBeNull();
    expect(parseRaWire("x".repeat(RA_MARK_MAX_BYTES + 1))).toBeNull();
  });

  it("takes marks only from the operator and share state only from the client", () => {
    const ids = { operator: "op-1", client: "cl-1" };
    expect(raWireAllowed({ t: "mark", mark: mark() }, "op-1", ids)).toBe(true);
    expect(raWireAllowed({ t: "mark", mark: mark() }, "cl-1", ids)).toBe(false);
    expect(raWireAllowed({ t: "mark", mark: mark() }, "someone", ids)).toBe(false);
    expect(raWireAllowed({ t: "clear" }, "cl-1", ids)).toBe(false);
    expect(raWireAllowed({ t: "ask-share" }, "op-1", ids)).toBe(true);
    expect(raWireAllowed({ t: "share", state: { surface: "browser", hidden: false, on: true } }, "cl-1", ids)).toBe(true);
    expect(raWireAllowed({ t: "share", state: { surface: "browser", hidden: false, on: true } }, "op-1", ids)).toBe(false);
    expect(raWireAllowed({ t: "clear" }, "", ids)).toBe(false);
  });

  it("simplifies a pen line, caps it and keeps both ends", () => {
    const straight: RaPoint[] = Array.from({ length: 500 }, (_, i) => [i / 499, 0.5]);
    expect(simplifyPath(straight)).toEqual([[0, 0.5], [1, 0.5]]);
    const zig: RaPoint[] = Array.from({ length: 1000 }, (_, i) => [i / 999, i % 2 ? 0.1 : 0.9]);
    const out = simplifyPath(zig);
    expect(out.length).toBeLessThanOrEqual(RA_MARK_MAX_POINTS);
    expect(out[0]).toEqual([0, 0.9]);
    expect(out[out.length - 1]).toEqual([1, 0.1]);
    expect(isRaMark(mark({ tool: "pen", points: out }))).toBe(true);
  });

  it("maps clicks to the picture inside an object-fit: contain box", () => {
    expect(containRect(1000, 500, 1600, 900)).toEqual({ x: (1000 - 888.8888888888889) / 2, y: 0, w: 888.8888888888889, h: 500 });
    expect(containRect(400, 800, 1600, 900)).toEqual({ x: 0, y: (800 - 225) / 2, w: 400, h: 225 });
    expect(containRect(0, 0, 0, 0)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("the shared tab is the client's own", () => {
  it("names this tab once and tells other tabs apart", () => {
    const me = raTabHandle();
    expect(me).toMatch(/^lexgo-tab-[a-z0-9]+$/);
    expect(raTabHandle()).toBe(me);
    expect(raOtherTab(me)).toBe(false);
    expect(raOtherTab("")).toBe(false); // browser without the Capture Handle API
    expect(raOtherTab("lexgo-tab-other")).toBe(true);
  });
  it("reads the captured tab's handle when the browser has one", () => {
    expect(capturedTabOf(undefined)).toBe("");
    expect(capturedTabOf({ getCaptureHandle: () => ({ handle: "lexgo-tab-x" }) } as unknown as MediaStreamTrack)).toBe("lexgo-tab-x");
    expect(capturedTabOf({ getCaptureHandle: () => null } as unknown as MediaStreamTrack)).toBe("");
    expect(capturedTabOf({} as MediaStreamTrack)).toBe("");
  });
  it("carries a clean tab handle in the share state, drops a bad one", () => {
    expect(parseRaWire(JSON.stringify({ t: "share", state: { surface: "browser", hidden: false, on: true, tab: "lexgo-tab-ab12" } }))).toEqual({ t: "share", state: { surface: "browser", hidden: false, on: true, tab: "lexgo-tab-ab12" } });
    expect(parseRaWire(JSON.stringify({ t: "share", state: { surface: "browser", hidden: false, on: true, tab: "<x>" } }))).toEqual({ t: "share", state: { surface: "browser", hidden: false, on: true } });
  });
});

describe("marks fade after 3 seconds", () => {
  it("is exactly 3000 ms", () => {
    expect(RA_MARK_TTL_MS).toBe(3000);
  });
  it("fades in, holds, fades out and is gone at 3000 ms", () => {
    expect(markOpacity(0)).toBe(0);
    expect(markOpacity(60)).toBeCloseTo(0.5);
    expect(markOpacity(1500)).toBe(1);
    expect(markOpacity(2800)).toBeCloseTo(0.5);
    expect(markOpacity(2999)).toBeGreaterThan(0);
    expect(markOpacity(3000)).toBe(0);
    expect(markOpacity(5000)).toBe(0);
    expect(markOpacity(1, true)).toBe(1);
    expect(markOpacity(3000, true)).toBe(0);
  });
  it("is alive only inside the window", () => {
    expect(markAlive(1000, 3999)).toBe(true);
    expect(markAlive(1000, 4000)).toBe(false);
  });
});

describe("privacy auto-hide", () => {
  it("hides payment, identity, security and auth pages", () => {
    for (const p of ["/uz/portal/client/payments", "/ru/checkout/abc", "/en/portal/client/profile/security", "/uz/portal/client/identity", "/uz/login", "/register", "/uz/reset-password", "/uz/admin", "/uz/call-center/tickets", "/uz/portal/client/cards/1"]) {
      expect(raSensitivePage(p), p).toBe(true);
    }
    expect(raSensitivePage("/uz/portal/client/profile", "?tab=security")).toBe(true);
    expect(raSensitivePage("/uz/portal/client/profile", "?tab=payments")).toBe(true);
  });
  it("keeps ordinary pages visible", () => {
    for (const p of ["/uz/portal/client", "/uz/portal/client/profile", "/ru/portal/client/subscription", "/en/lawyers/abc", "/uz/portal/client/support/123", "/uz/portal/client/marketplace-orders"]) {
      expect(raSensitivePage(p), p).toBe(false);
    }
    expect(raSensitivePage("/uz/portal/client/profile", "?tab=experience")).toBe(false);
  });
  it("hides while a secret field is focused or sits in an open modal", () => {
    const calm = { focusedSecret: false, modalSecret: false };
    expect(raShareHidden("/uz/portal/client/profile", "", calm)).toBe(false);
    expect(raShareHidden("/uz/portal/client/profile", "", { ...calm, focusedSecret: true })).toBe(true);
    expect(raShareHidden("/uz/portal/client/profile", "", { ...calm, modalSecret: true })).toBe(true);
    expect(raShareHidden("/uz/portal/client/payments", "", calm)).toBe(true);
  });
});

describe("page registry v2", () => {
  it("covers the client portal and the public pages", () => {
    expect(raPageOf("/uz/portal/client/ai")?.pageId).toBe("client.ai");
    expect(raPageOf("/uz/portal/client/marketplace-orders/5c278d31-7045-43aa-991c-45eab4d47f62")?.pageId).toBe("client.marketplace.orders");
    expect(raPageOf("/ru/portal/client/support/abc")?.pageId).toBe("client.support");
    expect(raPageOf("/uz/portal/client/services/document/abc")?.pageId).toBe("client.documents.item");
    expect(raPageOf("/uz")?.pageId).toBe("site.home");
    expect(raPageOf("/en/subscription")?.pageId).toBe("client.pricing");
  });
  it("never lists a sensitive page and still refuses blocked routes", () => {
    for (const p of RA_PAGES) if (p.home) expect(raSensitivePage(p.home), p.home).toBe(false);
    for (const bad of ["/portal/client/payments", "/admin", "/login", "/portal/client/profile/security", "/portal/advocate"]) expect(raSafeRoute(bad), bad).toBe("");
    for (const t of RA_NAV_TARGETS) expect(raSafeRoute(t.route), t.route).toBe(t.route);
  });
  it("puts every target in a known group, once", () => {
    const ids = RA_NAV_TARGETS.map((t) => t.pageId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of RA_NAV_TARGETS) expect(RA_GROUPS).toContain(t.group);
    for (const g of RA_GROUPS) expect(RA_NAV_TARGETS.some((t) => t.group === g), g).toBe(true);
  });
  it("has a title and group name in every language", () => {
    for (const [lang, m] of [["uz", uz], ["ru", ru], ["en", en]] as const) {
      const ra = (m as unknown as { remoteAssist: { pages: Record<string, string>; groups: Record<string, string> } }).remoteAssist;
      for (const p of RA_PAGES) expect(ra.pages[raKey(p.pageId)], `${lang} ${p.pageId}`).toBeTruthy();
      for (const g of RA_GROUPS) expect(ra.groups[g], `${lang} ${g}`).toBeTruthy();
    }
  });
});

describe("one-click request and consent", () => {
  const meta = normRaMeta({
    contract_version: "1.0",
    consent_version: "1.0",
    modes: [
      { key: "guide", scopes: ["highlight", "navigate", "view_page_context"] },
      { key: "control", scopes: ["focus", "form_fill", "highlight", "navigate", "personal_form_fill", "view_page_context"] },
      { key: "prepare", scopes: ["focus", "form_fill", "highlight", "navigate", "personal_form_fill", "prepare_draft", "present_confirmation", "view_page_context"] },
    ],
    actions: [],
    session: { max_minutes: 30 },
    capabilities: { request: true, guide: true, control: true, prepare: true },
  });

  it("asks for the most capable offered mode with all of its scopes", () => {
    expect(raBestMode(meta)).toBe("prepare");
    expect(raModeScopes(meta, raBestMode(meta))).toContain("personal_form_fill");
  });
  it("skips a mode the backend switched off", () => {
    expect(raBestMode({ ...meta, capabilities: { ...meta.capabilities, prepare: false } })).toBe("control");
    expect(raBestMode({ ...meta, capabilities: { ...meta.capabilities, prepare: false, control: false } })).toBe("guide");
    expect(raBestMode({ ...meta, modes: [] })).toBe("");
  });
  it("grants exactly what was asked on Allow and nothing on Decline", () => {
    const asked = ["view_page_context", "highlight", "navigate", "highlight"];
    expect(raConsentScopes(asked, "accept")).toEqual(["view_page_context", "highlight", "navigate"]);
    expect(raConsentScopes(asked, "deny")).toEqual([]);
  });
});
