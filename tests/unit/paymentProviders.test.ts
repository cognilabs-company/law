import { afterEach, describe, expect, it } from "vitest";
import { forgetPendingPayment, groupReasons, paymentOutcome, providerTone, readPendingPayment, readinessOf, reconciliationOf, rememberPendingPayment, PENDING_TTL_MS } from "@/lib/services/paymentProviders";

describe("provider readiness", () => {
  it("reads the live shape, Click → Payme → ATMOS, with a tone per state", () => {
    const r = readinessOf({
      items: [
        { key: "payme", configured: false, status: "disabled", detail: "", latency_ms: 0.01, checked_at: "2026-10-28T05:54:30Z" },
        { key: "atmos", configured: true, status: "configured_not_verified", detail: "", latency_ms: 0, checked_at: "" },
        { key: "click", configured: false, status: "disabled" },
      ],
      all_enabled: false,
      mode: "feature_flagged_until_contracts",
      requirements: ["merchant_contract", "signed_webhook"],
    });
    expect(r.providers.map((p) => [p.key, p.tone])).toEqual([
      ["click", "off"],
      ["payme", "off"],
      ["atmos", "warn"],
    ]);
    expect(r.flagged).toBe(true);
    expect(r.allEnabled).toBe(false);
    expect(r.requirements).toEqual(["merchant_contract", "signed_webhook"]);
  });
  it("only a working state is green; a failure is red", () => {
    expect(providerTone("enabled", true)).toBe("ok");
    expect(providerTone("error", true)).toBe("bad");
    expect(providerTone("something_new", false)).toBe("off");
    expect(providerTone("something_new", true)).toBe("warn");
  });
});

describe("reconciliation", () => {
  const raw = {
    providers: [
      { provider: "atmos", count: 11, paid_count: 3, amount: 900, paid_amount: 300, discrepancies: 2 },
      { provider: "telegram_manual", count: 61, paid_count: 34, amount: 1000, paid_amount: 500, discrepancies: 0 },
    ],
    discrepancies: [
      { payment_id: "3f30810c-c35c-40d6-9eeb-31e1481d1a7f", provider: "atmos", status: "paid", amount: 447000, paid_amount: 447000, reasons: ["provider_transaction_id_missing"] },
      { payment_id: "aa", provider: "payme", status: "paid", amount: 3000, paid_amount: 3000, reasons: ["provider_transaction_id_missing", "amount_mismatch"] },
    ],
    discrepancy_count: 2,
    checked_count: 205,
  };
  it("sorts providers by volume and groups mismatches by reason with money and providers", () => {
    const r = reconciliationOf(raw);
    expect(r.providers.map((p) => p.provider)).toEqual(["telegram_manual", "atmos"]);
    expect(r.reasons[0]).toEqual({ reason: "provider_transaction_id_missing", count: 2, amount: 450000, providers: ["atmos", "payme"] });
    expect(r.reasons[1].reason).toBe("amount_mismatch");
    expect(r.checkedCount).toBe(205);
  });
  it("a row without a reason still counts", () => {
    expect(groupReasons([{ key: "k", provider: "click", status: "paid", amount: 5, paidAmount: 5, reasons: [] }])[0].reason).toBe("unknown");
  });
});

describe("return from the provider", () => {
  // Unit tests run in node: a minimal sessionStorage.
  const store = new Map<string, string>();
  globalThis.sessionStorage ??= {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  afterEach(() => forgetPendingPayment());
  it("only a confirmed status is paid; anything unknown keeps waiting", () => {
    expect(paymentOutcome("paid")).toBe("paid");
    expect(paymentOutcome("cancelled")).toBe("failed");
    expect(paymentOutcome("pending")).toBe("waiting");
    expect(paymentOutcome("created")).toBe("waiting");
    expect(paymentOutcome("")).toBe("waiting");
  });
  it("remembers the payment for 30 minutes, then forgets it", () => {
    rememberPendingPayment({ id: "p1", amount: 150000 }, 1000);
    expect(readPendingPayment(2000)).toEqual({ id: "p1", amount: 150000, at: 1000 });
    expect(readPendingPayment(1000 + PENDING_TTL_MS + 1)).toBeNull();
    expect(readPendingPayment(2000)).toBeNull();
  });
});
