import { describe, expect, it } from "vitest";
import { complaintOf, marketSignalOf, normMarketOrder, warrantyOf, warrantyResolutionsOf } from "@/lib/services/marketplace";
import { warrantyClaimOf } from "@/lib/services/mpComplaints";
import { escalationOf } from "@/lib/services/resolution";
import { contactLeftParts, contactSlaState } from "@/components/marketplace/order/contactSla";
import { PAYOUT_LIVE } from "@/components/marketplace/order/useOrderPayouts";

// The marketplace order contract as the backend answered it on 2026-10-31
// (§1.3 contact SLA, §1.5 warranty, §1.9 complaint window, §1.10 payout
// events).

describe("contact SLA (§1.3)", () => {
  it("reads contact_deadline_at and contact_started_at; first_contact_at is not a field", () => {
    const o = normMarketOrder({ id: "o1", contact_speed: "within_15_min", contact_speed_label: "15 daqiqa ichida", contact_deadline_at: "2026-10-31T09:15:00Z", contact_started_at: "2026-10-31T09:05:00Z" });
    expect(o).toMatchObject({ contactSpeed: "within_15_min", contactSpeedLabel: "15 daqiqa ichida", contactDeadlineAt: "2026-10-31T09:15:00Z", contactStartedAt: "2026-10-31T09:05:00Z" });
    expect(normMarketOrder({ id: "o2", first_contact_at: "2026-10-31T09:05:00Z" }).contactStartedAt).toBe("");
    expect(normMarketOrder({ id: "o3", details: { contact_deadline_at: "2026-10-31T10:00:00Z" } }).contactDeadlineAt).toBe("2026-10-31T10:00:00Z");
  });

  it("an escalation lends its contact fields to its order; the order's own win", () => {
    const e = escalationOf({ id: "e1", order_id: "o1", contact_deadline_at: "2026-10-31T09:15:00Z", contact_speed: "today", order: { status: "paid", contact_speed: "within_1_hour" } });
    expect(e?.order).toMatchObject({ contactDeadlineAt: "2026-10-31T09:15:00Z", contactSpeed: "within_1_hour" });
  });

  it("started wins; otherwise the countdown says running or late; no deadline, nothing", () => {
    expect(contactSlaState({ contactStartedAt: "2026-10-31T09:05:00Z" }, 0)).toBe("started");
    expect(contactSlaState({ contactStartedAt: "" }, 120)).toBe("running");
    expect(contactSlaState({ contactStartedAt: "" }, 0)).toBe("late");
    expect(contactSlaState({ contactStartedAt: "" }, null)).toBe("none");
  });

  it("long waits read in hours and minutes, short ones as a clock", () => {
    expect(contactLeftParts(3 * 3600 + 5 * 60 + 9)).toEqual({ h: 3, m: 5, clock: "05:09" });
    expect(contactLeftParts(59)).toEqual({ h: 0, m: 0, clock: "00:59" });
    expect(contactLeftParts(-3)).toEqual({ h: 0, m: 0, clock: "00:00" });
  });

  it("marketplace.contact_started and marketplace.contact_sla_breached re-read the order", () => {
    expect(marketSignalOf({ event: "marketplace.contact_started", order_id: "o1" })).toMatchObject({ kind: "other", sub: "contact_started", orderId: "o1" });
    expect(marketSignalOf({ event: "marketplace.contact_sla_breached", order_id: "o1" })).toMatchObject({ kind: "other", sub: "contact_sla_breached", orderId: "o1" });
  });
});

describe("warranty (§1.5)", () => {
  it("the order carries no eligible kinds any more", () => {
    expect(warrantyOf({ warranty_url: "/w", warranty_eligible_kinds: ["sla_breach"] })).toEqual({ url: "/w", status: "", resolution: "", reason: "", decision: "" });
  });

  it("the client's remedies: available_resolutions when listed, else the on/off flags; never rework", () => {
    expect(warrantyResolutionsOf({ warranty: { available_resolutions: ["full_refund", "rework", "REPLACEMENT"], replacement: false } })).toEqual(["full_refund", "replacement"]);
    expect(warrantyResolutionsOf({ warranty: { replacement: true, full_refund: false } })).toEqual(["replacement"]);
    expect(warrantyResolutionsOf({ warranty: { available_resolutions: [] , replacement: true } })).toEqual([]);
    expect(warrantyResolutionsOf({})).toEqual([]);
  });

  it("a claim offers only its available_resolutions — no added rejection, no fallback", () => {
    expect(warrantyClaimOf({ id: "w1", available_resolutions: ["full_refund", "rework"] })?.resolutions).toEqual(["full_refund"]);
    expect(warrantyClaimOf({ id: "w2" })?.resolutions).toEqual([]);
    expect(warrantyClaimOf({ claim: { id: "w3" }, available_resolutions: ["replacement", "rejected", "replacement"] })?.resolutions).toEqual(["replacement", "rejected"]);
  });
});

describe("complaint window (§1.9)", () => {
  it("the capability is the backend's: complaint.available, can_complain, or the order's own flag", () => {
    expect(complaintOf({ complaint: { available: true, deadline_at: "2026-10-31T09:15:00Z" } })).toMatchObject({ available: true, deadlineAt: "2026-10-31T09:15:00Z" });
    expect(complaintOf({ complaint: { can_complain: true } }).available).toBe(true);
    expect(complaintOf({ can_complain: true, complaint_deadline_at: "2026-10-31T09:15:00Z" })).toMatchObject({ available: true, deadlineAt: "2026-10-31T09:15:00Z" });
    // The complaint's own "no" wins over a stray order flag.
    expect(complaintOf({ complaint: { available: false }, can_complain: true }).available).toBe(false);
    expect(complaintOf({}).available).toBe(false);
  });
});

describe("payout events (§1.10)", () => {
  it("payout_created, payout_paid and payout_required re-read the seller's financials", () => {
    for (const ev of ["marketplace.payout_created", "marketplace.payout_paid", "marketplace.payout_required", "marketplace.checklist_updated", "marketplace.order_completed"]) expect(PAYOUT_LIVE.test(ev)).toBe(true);
    expect(PAYOUT_LIVE.test("marketplace.negotiation_updated")).toBe(false);
  });
});
