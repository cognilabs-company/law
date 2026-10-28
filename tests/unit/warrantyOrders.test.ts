import { describe, expect, it } from "vitest";
import { normMarketOrder, warrantyOrdersOf } from "@/lib/services/marketplace";

describe("warrantyOrdersOf", () => {
  it("splits filed claims from orders a claim can still be filed for", () => {
    const filed = normMarketOrder({ id: "a", status: "in_progress", payment_status: "paid", warranty_url: "/marketplace/me/orders/a/warranty", warranty: { status: "pending", reason: "Javob yo'q" } });
    const open = normMarketOrder({ id: "b", status: "in_progress", payment_status: "paid", warranty_url: "/marketplace/me/orders/b/warranty" });
    const unpaid = normMarketOrder({ id: "c", status: "pending_payment", payment_status: "pending", warranty_url: "/marketplace/me/orders/c/warranty" });
    const noUrl = normMarketOrder({ id: "d", status: "in_progress", payment_status: "paid" });
    const r = warrantyOrdersOf([filed, open, unpaid, noUrl]);
    expect(r.filed.map((o) => o.id)).toEqual(["a"]);
    expect(r.open.map((o) => o.id)).toEqual(["b"]);
  });
});
