import { describe, expect, it } from "vitest";
import { isExternalSeller, type Session } from "@/lib/auth";

// TEZKOR_HIMOYA_FRONTEND_UPDATE_2026_11_21.md §6: external (marketplace)
// lawyers get no people search and no "new meeting"; call-center lawyers,
// operators and admins keep them.
const who = (role: string, roles: string[] = [], permissions: string[] = []) => ({ id: "u", name: "x", phone: "", role, roles, permissions }) as unknown as Session;
describe("external sellers (§6)", () => {
  it("marketplace advocates, lawyers and organizations are external", () => {
    expect(isExternalSeller(who("advocate", ["advokat"]))).toBe(true);
    expect(isExternalSeller(who("lawyer", ["yurist"]))).toBe(true);
    expect(isExternalSeller(who("organization", ["advokat_tashkiloti"]))).toBe(true);
  });
  it("call-center lawyers, operators, admins and clients are not", () => {
    expect(isExternalSeller(who("lawyer", ["call_center_lawyer"]))).toBe(false);
    expect(isExternalSeller(who("client", ["call_center"], ["callcenter.access"]))).toBe(false);
    expect(isExternalSeller(who("client", ["superadmin"]))).toBe(false);
    expect(isExternalSeller(who("client", ["client"]))).toBe(false);
    expect(isExternalSeller(null)).toBe(false);
  });
});
