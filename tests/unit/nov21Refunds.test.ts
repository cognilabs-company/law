import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { refundErrorOf, refundNeedsNote, refundRequestOf } from "@/lib/services/refunds";

// TEZKOR_HIMOYA_FRONTEND_UPDATE_2026_11_21.md §2: refunds that Click or ATMOS
// could not make wait for a call-center decision.
describe("call-center refund requests (§2)", () => {
  it("reads the documented row", () => {
    const r = refundRequestOf({
      id: "rf-1",
      module: "marketplace_refund_request",
      status: "operator_required",
      price: 100000,
      currency: "UZS",
      payload: { order_id: "o-1", payment_id: "p-1", refund_type: "full", amount: 100000, provider_error: { code: "x", message: "Click: refund window closed" }, reason: "Mijoz voz kechdi" },
    });
    expect(r).toMatchObject({ id: "rf-1", status: "operator_required", amount: 100000, orderId: "o-1", paymentId: "p-1", refundType: "full", reason: "Mijoz voz kechdi", providerError: "Click: refund window closed" });
  });
  it("only the manual refund and the refusal need a note", () => {
    expect(refundNeedsNote("retry_provider")).toBe(false);
    expect(refundNeedsNote("confirm_manual_refund")).toBe(true);
    expect(refundNeedsNote("reject")).toBe(true);
  });
  it("maps the documented errors", () => {
    const err = (status: number, code: string, extra: Record<string, unknown> = {}) => new ApiError(status, code, undefined, { code, data: { detail: { code, ...extra } } });
    expect(refundErrorOf(err(409, "provider_refund_failed", { refund_request: { id: "rf-1", payload: { provider_error: "again" } } }))).toMatchObject({ key: "providerFailed", refund: { providerError: "again" } });
    expect(refundErrorOf(err(409, "refund_already_decided")).key).toBe("alreadyDecided");
    expect(refundErrorOf(err(422, "refund_note_required")).key).toBe("noteRequired");
    expect(refundErrorOf(err(422, "refund_action_invalid")).key).toBe("actionInvalid");
    expect(refundErrorOf(new Error("x")).key).toBe("generic");
  });
});
