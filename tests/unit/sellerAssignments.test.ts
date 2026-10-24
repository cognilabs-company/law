import { describe, expect, it } from "vitest";
import { notifLink } from "@/lib/notifications";

// A new assignment's notification opens that order, where the seller can
// accept or decline it (live payload, 24 Oct 2026).
describe("assignment notification link", () => {
  it("goes straight to the order for a seller", () => {
    const data = { order_id: "22f8a7b5-62e4-4ee5-969b-5b17aa79af8b", event: "marketplace.assignment_received", response_minutes: 30 };
    expect(notifLink("marketplace.assignment_received", "orders", data, "advocate")).toBe("/portal/advocate/marketplace-orders/22f8a7b5-62e4-4ee5-969b-5b17aa79af8b");
  });
  it("leaves the client's marketplace links as they were", () => {
    expect(notifLink("marketplace_purchase_approved", "orders", { room_id: "r1" }, "client")).toBe("/portal/chat/r1");
  });
});
