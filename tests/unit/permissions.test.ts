import { afterEach, describe, expect, it, vi } from "vitest";
import { can, hasRole, isSuperadmin, permissionsOf, rolesOf, samePermissions } from "@/lib/permissions";
import { setForbiddenHandler, toApiError } from "@/lib/http";

// Owner law 2026-11-08: an action the session has no permission for is not
// shown. can() is the one gate every screen asks.
describe("can()", () => {
  const operator = { backendRole: "call_center", permissions: ["callcenter.access", "leads.manage"] };

  it("is false when signed out", () => {
    expect(can(null, "leads.manage")).toBe(false);
    expect(can(undefined, ["leads.manage"])).toBe(false);
  });

  it("checks a single permission code", () => {
    expect(can(operator, "leads.manage")).toBe(true);
    expect(can(operator, "users.manage")).toBe(false);
  });

  it("any-of by default, all-of with { all: true }", () => {
    expect(can(operator, ["users.manage", "leads.manage"])).toBe(true);
    expect(can(operator, ["users.manage", "leads.manage"], { all: true })).toBe(false);
    expect(can(operator, ["callcenter.access", "leads.manage"], { all: true })).toBe(true);
  });

  it("an empty list grants nothing", () => {
    expect(can(operator, [])).toBe(false);
    expect(can(operator, "")).toBe(false);
  });

  it("superadmin keeps everything, as primary or assigned role", () => {
    expect(can({ backendRole: "superadmin", permissions: [] }, "roles.manage")).toBe(true);
    expect(can({ backendRole: "client", roles: ["SuperAdmin"] }, "anything.at_all")).toBe(true);
  });

  it("admin is not superadmin: only its own codes", () => {
    const admin = { backendRole: "admin", permissions: ["users.manage"] };
    expect(can(admin, "users.manage")).toBe(true);
    expect(can(admin, "roles.manage")).toBe(false);
  });

  it("the backend wildcard grants everything", () => {
    expect(can({ backendRole: "manager", permissions: ["*"] }, "payments.manage")).toBe(true);
  });

  it("roles named by a contract also grant", () => {
    const admin = { backendRole: "admin", permissions: [] };
    expect(can(admin, "leads.manage")).toBe(false);
    expect(can(admin, "leads.manage", { roles: ["admin"] })).toBe(true);
    expect(can({ backendRole: "sales" }, "leads.manage", { roles: ["admin"] })).toBe(false);
  });

  it("ignores blanks and duplicates", () => {
    expect(permissionsOf({ permissions: [" a.b ", "a.b", ""] })).toEqual(["a.b"]);
    expect(can({ permissions: [" a.b "] }, "a.b")).toBe(true);
  });
});

describe("role helpers", () => {
  it("merges primary and assigned roles, lowercased", () => {
    expect(rolesOf({ backendRole: "Admin", roles: ["admin", " Manager "] })).toEqual(["admin", "manager"]);
    expect(hasRole({ roles: ["call_center"] }, ["call_center", "x"])).toBe(true);
    expect(isSuperadmin({ backendRole: "admin" })).toBe(false);
  });

  it("samePermissions tells a revoked permission from an unchanged set", () => {
    const a = { backendRole: "sales", permissions: ["leads.manage", "crm.leads.view"] };
    expect(samePermissions(a, { backendRole: "sales", permissions: ["crm.leads.view", "leads.manage"] })).toBe(true);
    expect(samePermissions(a, { backendRole: "sales", permissions: ["crm.leads.view"] })).toBe(false);
    expect(samePermissions(a, { backendRole: "manager", permissions: a.permissions })).toBe(false);
  });
});

describe("403 safety net hook", () => {
  afterEach(() => setForbiddenHandler(null));
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("reports an action 403 to the handler with its code", async () => {
    const seen = vi.fn();
    setForbiddenHandler(seen);
    const e = await toApiError(res(403, { detail: { code: "permission_denied", message: "no" } }));
    expect(e.status).toBe(403);
    expect(seen).toHaveBeenCalledWith("permission_denied");
  });

  it("leaves page-level denials to role navigation, and other statuses alone", async () => {
    const seen = vi.fn();
    setForbiddenHandler(seen);
    await toApiError(res(403, { detail: { code: "role_page_access_denied", page_id: "crm" } }));
    await toApiError(res(404, { detail: "Not Found" }));
    await toApiError(res(401, { detail: "expired" }));
    expect(seen).not.toHaveBeenCalled();
  });
});
