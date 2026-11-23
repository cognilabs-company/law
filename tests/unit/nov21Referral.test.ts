import { describe, expect, it } from "vitest";
import { isReferralShape, referralFromUrl } from "@/lib/referral";

// TEZKOR_HIMOYA_FRONTEND_UPDATE_2026_11_21.md §5.2: the referral field is
// back and is pre-filled from ?ref=.
describe("referral code at registration (§5.2)", () => {
  it("takes the code from ?ref= only when it looks like one", () => {
    expect(referralFromUrl("?ref=THREF001")).toBe("THREF001");
    expect(referralFromUrl("?utm=x&ref=%20AB-12_c%20")).toBe("AB-12_c");
    expect(referralFromUrl("?ref=<script>")).toBe("");
    expect(referralFromUrl("")).toBe("");
  });
  it("checks the shape before asking the backend", () => {
    expect(isReferralShape("THREF001")).toBe(true);
    expect(isReferralShape("ab")).toBe(false);
    expect(isReferralShape("a b c d")).toBe(false);
  });
});
