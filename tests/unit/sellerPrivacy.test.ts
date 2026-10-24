import { describe, expect, it } from "vitest";
import { normMarketSeller } from "@/lib/services/marketplace";

// A seller's license number, education and internal verification state stay
// off public pages (TSK-260704), even while the public API still sends the
// keys (measured 24 Oct 2026: /lawyers carries verification_status on every
// row). Only the public `verified` flag survives.
describe("public seller shape", () => {
  it("drops private professional fields", () => {
    const s = normMarketSeller({
      user_id: "u1",
      lawyer_name: "Test Advokat",
      license_number: "AB-12345",
      education: "TDYU, 2012",
      verification_status: "approved",
      verification_note: "passport checked",
      seller_profile: { verification_status: "approved", license_number: "AB-12345" },
    });
    const wire = JSON.stringify(s);
    for (const secret of ["AB-12345", "TDYU", "passport checked", "verification_status", "license"]) expect(wire).not.toContain(secret);
  });
});
