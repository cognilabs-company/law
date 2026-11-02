import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCachedPolicies,
  isHiddenRoute,
  isPathHidden,
  normalizeRoleNav,
  pageIdOfPath,
  readCachedPolicy,
  roleDeniedOf,
  roleNavOff,
  setRoleNavState,
  stateHidesPath,
  writeCachedPolicy,
  type RoleNavState,
} from "@/lib/roleNav";
import { guideHref } from "@/lib/guide/routes";
import { aiRouteFor } from "@/lib/aiPages";
import { toApiError, setRoleDeniedHandler, isRoleDenied } from "@/lib/http";

// LEXGO_ROLE_NAVIGATION_FRONTEND_2026_11_02.md

const NAVBATCHI = {
  policy_version: "2026-11-02.1",
  role_profile: "navbatchi_yurist",
  hidden_page_ids: ["crm", "duty_services", "operator_chats", "remote_assistance"],
  hidden_pages: [{ page_id: "crm", title: "CRM", routes: ["/crm", "/admin/crm", "/portal/call-center/crm"] }],
  hidden_routes: ["/crm", "/admin/crm", "/portal/call-center/crm"],
  default_route: "/portal/lawyer",
  direct_navigation_denied: true,
};
const CLIENT = {
  policy_version: "2026-11-02.1",
  role_profile: "client",
  hidden_page_ids: ["client_works", "problem_analysis", "academy"],
  hidden_routes: ["/portal/client/works"],
  default_route: "/portal/client",
};
const ADVOKAT = {
  role_profile: "advokat",
  hidden_page_ids: ["opportunities", "lawyer_works", "urgent_jobs", "lawyer_document_requests", "organization"],
  hidden_routes: [],
  default_route: "/portal/advocate",
};

const ready = (raw: unknown, userId = "u1"): RoleNavState => ({ status: "ready", userId, policy: normalizeRoleNav(raw, userId) });

describe("route matching", () => {
  it("matches the prefix itself and below it, never a sibling", () => {
    expect(isHiddenRoute("/admin/crm", ["/admin/crm"])).toBe(true);
    expect(isHiddenRoute("/admin/crm/leads/1", ["/admin/crm"])).toBe(true);
    expect(isHiddenRoute("/admin/crmx", ["/admin/crm"])).toBe(false);
    expect(isHiddenRoute("/admin", ["/admin/crm"])).toBe(false);
  });
  it("ignores the locale, query, hash and trailing slash", () => {
    expect(isHiddenRoute("/uz/admin/crm/?tab=leads", ["/admin/crm"])).toBe(true);
    expect(isHiddenRoute("/admin/crm#x", ["/admin/crm/"])).toBe(true);
  });
  it("never hides everything through a root prefix", () => {
    expect(isHiddenRoute("/portal/client", ["/"])).toBe(false);
  });
});

describe("normalizeRoleNav", () => {
  it("reads the contract's shape", () => {
    const p = normalizeRoleNav(NAVBATCHI, "u1");
    expect(p).toMatchObject({ userId: "u1", policyVersion: "2026-11-02.1", roleProfile: "navbatchi_yurist", defaultRoute: "/portal/lawyer", directNavigationDenied: true });
    expect(p.hiddenPageIds).toEqual(["crm", "duty_services", "operator_chats", "remote_assistance"]);
    expect(p.hiddenRoutes).toEqual(["/crm", "/admin/crm", "/portal/call-center/crm"]);
  });
  it("merges hidden_pages into the id and route lists", () => {
    const p = normalizeRoleNav({ hidden_pages: [{ page_id: "academy", routes: ["/portal/client/academy"] }] }, "u1");
    expect(p.hiddenPageIds).toEqual(["academy"]);
    expect(p.hiddenRoutes).toEqual(["/portal/client/academy"]);
  });
  it("drops an unsafe default route and junk", () => {
    const p = normalizeRoleNav({ default_route: "//evil.example", hidden_routes: ["x", 3, "/ok"] }, "u1");
    expect(p.defaultRoute).toBe("");
    expect(p.hiddenRoutes).toEqual(["/ok"]);
    expect(normalizeRoleNav(null, "u1").hiddenPageIds).toEqual([]);
  });
});

describe("pages by role profile", () => {
  it("navbatchi_yurist loses the CRM, duty service, operator chats and remote assistance", () => {
    const s = ready(NAVBATCHI);
    for (const p of ["/admin/crm", "/admin/crm/leads", "/admin/call-center", "/admin/call-center/support", "/admin/call-center/support/t1", "/admin/remote-assistance", "/portal/call-center"]) {
      expect(stateHidesPath(s, p), p).toBe(true);
    }
    // The experience review opened from a notification is another page.
    expect(stateHidesPath(s, "/admin/call-center/experience/e1")).toBe(false);
    for (const p of ["/portal/lawyer", "/portal/lawyer/cases", "/portal/lawyer/document-requests"]) expect(stateHidesPath(s, p), p).toBe(false);
  });
  it("client loses My works, problem analysis and academy but keeps the archive and catalogue", () => {
    const s = ready(CLIENT);
    for (const p of ["/portal/client/works", "/portal/client/works/w1", "/portal/client/intake", "/portal/client/academy"]) expect(stateHidesPath(s, p), p).toBe(true);
    for (const p of ["/portal/client", "/portal/client/documents", "/portal/client/services", "/portal/client/lawyers", "/portal/client/doc-analysis"]) expect(stateHidesPath(s, p), p).toBe(false);
  });
  it("advokat loses opportunities, works, urgent jobs, document requests and organization", () => {
    const s = ready(ADVOKAT);
    for (const p of ["/portal/advocate/opportunities", "/portal/advocate/cases", "/portal/advocate/urgent", "/portal/advocate/document-requests/r1/editor", "/portal/advocate/organization", "/portal/organization"]) {
      expect(stateHidesPath(s, p), p).toBe(true);
    }
    for (const p of ["/portal/advocate", "/portal/advocate/messages", "/portal/advocate/services", "/portal/advocate/marketplace-orders"]) expect(stateHidesPath(s, p), p).toBe(false);
  });
  it("an organization owner (another profile, nothing hidden) keeps organization management", () => {
    const s = ready({ role_profile: "advokat_tashkiloti", hidden_page_ids: [], hidden_routes: [], default_route: "/portal/advocate" });
    expect(stateHidesPath(s, "/portal/advocate/organization")).toBe(false);
  });
  it("maps a path to the longest matching page id", () => {
    expect(pageIdOfPath("/admin/call-center/support/t1")).toBe("operator_chats");
    expect(pageIdOfPath("/admin/call-center")).toBe("duty_services");
    expect(pageIdOfPath("/admin/call-center/experience/1")).toBe("");
  });
});

describe("states without a current policy", () => {
  it("loading and unavailable hide every role-sensitive page, nothing else", () => {
    for (const status of ["loading", "unavailable"] as const) {
      const s: RoleNavState = { status, userId: "u1", policy: null };
      expect(stateHidesPath(s, "/portal/client/works")).toBe(true);
      expect(stateHidesPath(s, "/admin/crm")).toBe(true);
      expect(stateHidesPath(s, "/portal/client/documents")).toBe(false);
    }
  });
  it("off (signed out, or no endpoint) hides nothing", () => {
    expect(stateHidesPath({ status: "off", userId: "", policy: null }, "/portal/client/works")).toBe(false);
  });
  it("cached uses the cached policy", () => {
    const s: RoleNavState = { status: "cached", userId: "u1", policy: normalizeRoleNav(CLIENT, "u1") };
    expect(stateHidesPath(s, "/portal/client/academy")).toBe(true);
    expect(stateHidesPath(s, "/portal/client/documents")).toBe(false);
  });
});

describe("AI navigation", () => {
  afterEach(() => roleNavOff());
  it("never resolves a hidden page as a destination", () => {
    expect(guideHref("/portal/client/works", "client")).toBe("/portal/client/works");
    expect(aiRouteFor("client_works", "", "client")).toBe("/portal/client/works");
    setRoleNavState(ready(CLIENT));
    expect(isPathHidden("/portal/client/works")).toBe(true);
    expect(guideHref("/portal/client/works", "client")).toBe("");
    expect(guideHref("/portal/client/works?tab=x", "client")).toBe("");
    expect(aiRouteFor("client_works", "", "client")).toBe("");
    expect(aiRouteFor("client_documents", "/portal/client/documents", "client")).toBe("/portal/client/documents");
  });
});

describe("role_page_access_denied", () => {
  const BODY = { detail: { code: "role_page_access_denied", message: "Bu bo'lim sizning rolingiz uchun yopilgan", page_id: "crm", role_profile: "navbatchi_yurist", default_route: "/portal/lawyer", navigation_url: "/me/navigation" } };
  it("reads the detail of a 403 only", () => {
    expect(roleDeniedOf(403, BODY)).toEqual({ pageId: "crm", roleProfile: "navbatchi_yurist", defaultRoute: "/portal/lawyer", message: "Bu bo'lim sizning rolingiz uchun yopilgan" });
    expect(roleDeniedOf(401, BODY)).toBeNull();
    expect(roleDeniedOf(403, { detail: "Forbidden" })).toBeNull();
  });
  it("every failed response passes through the one global handler", async () => {
    const seen = vi.fn();
    setRoleDeniedHandler(seen);
    try {
      const e = await toApiError(new Response(JSON.stringify(BODY), { status: 403 }));
      expect(seen).toHaveBeenCalledWith(expect.objectContaining({ pageId: "crm", defaultRoute: "/portal/lawyer" }));
      expect(isRoleDenied(e)).toBe(true);
      seen.mockClear();
      await toApiError(new Response(JSON.stringify({ detail: "Forbidden" }), { status: 403 }));
      expect(seen).not.toHaveBeenCalled();
    } finally {
      setRoleDeniedHandler(null);
    }
  });
});

describe("cached policy", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const ls = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    };
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", ls);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("is only ever read back for the same user, and logout clears all of them", () => {
    writeCachedPolicy(normalizeRoleNav(CLIENT, "u1"));
    writeCachedPolicy(normalizeRoleNav(ADVOKAT, "u2"));
    expect(readCachedPolicy("u1")?.roleProfile).toBe("client");
    expect(readCachedPolicy("u3")).toBeNull();
    // A tampered entry under another user's key is refused.
    localStorage.setItem("lexgo_role_nav:u3", JSON.stringify(normalizeRoleNav(CLIENT, "u1")));
    expect(readCachedPolicy("u3")).toBeNull();
    clearCachedPolicies();
    expect(readCachedPolicy("u1")).toBeNull();
    expect(readCachedPolicy("u2")).toBeNull();
  });
});
