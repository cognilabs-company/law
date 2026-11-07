import { describe, expect, it } from "vitest";
import { crmLeadOf, crmMetaOf, type CrmLead } from "@/lib/services/crm";
import { callOnRecord, forwardOf, nextLeadStep, wonLocked, type LeadStepContext } from "@/components/ccx/crm/detail/nextStep";

const TRANSITIONS: Record<string, string[]> = { new: ["qualified", "proposal", "decision_pending", "won", "rejected"], qualified: ["proposal", "decision_pending", "won", "rejected"], proposal: ["qualified", "decision_pending", "won", "rejected"], decision_pending: ["proposal", "won", "rejected"], won: [], rejected: [] };
const meta = crmMetaOf({
  statuses: Object.keys(TRANSITIONS).map((key, i) => ({ key, title: key, order: i, is_final: key === "won" || key === "rejected", transitions: TRANSITIONS[key] })),
  permissions: [],
});
const ME = "u-me";
const OWN = ["view_timeline", "add_activity", "edit", "change_status", "set_next_action", "prepare_conversion"];
const lead = (x: Record<string, unknown> = {}): CrmLead => crmLeadOf({ id: "l1", status: "new", assigned_operator_user_id: ME, allowed_actions: OWN, next_action_at: "2026-11-08T10:00:00Z", ...x });
const ctx = (x: Partial<LeadStepContext> = {}): LeadStepContext => ({ me: ME, canDial: true, callLogged: true, dialed: false, drafting: false, ...x });

describe("nextLeadStep: the one bright button of the lead workspace", () => {
  it("an unowned, claimable lead is to be taken, whatever else it allows", () => {
    expect(nextLeadStep(meta, lead({ assigned_operator_user_id: null, allowed_actions: ["claim", ...OWN], next_action_at: null }), ctx({ callLogged: false }))).toBe("claim");
  });

  it("my lead with no call on record is to be called", () => {
    expect(nextLeadStep(meta, lead({ next_action_at: null }), ctx({ callLogged: false }))).toBe("call");
  });

  it("once dialed, the result is what is left to write", () => {
    expect(nextLeadStep(meta, lead({ next_action_at: null }), ctx({ callLogged: false, dialed: true }))).toBe("callResult");
  });

  it("a dial cannot be logged without add_activity: the call stays the step", () => {
    expect(nextLeadStep(meta, lead({ allowed_actions: ["change_status"], next_action_at: null }), ctx({ callLogged: false, dialed: true }))).toBe("call");
  });

  it("no number to dial skips the call", () => {
    expect(nextLeadStep(meta, lead({ next_action_at: null }), ctx({ callLogged: false, canDial: false }))).toBe("nextAction");
  });

  it("lights nothing while the timeline is still loading", () => {
    expect(nextLeadStep(meta, lead(), ctx({ callLogged: null }))).toBeNull();
  });

  it("after the call, a missing next action comes next", () => {
    expect(nextLeadStep(meta, lead({ next_action_at: null }), ctx())).toBe("nextAction");
  });

  it("skips the next action when it may not be set", () => {
    expect(nextLeadStep(meta, lead({ next_action_at: null, allowed_actions: ["change_status"] }), ctx())).toBe("forward");
  });

  it("moves forward before the proposal stage", () => {
    expect(nextLeadStep(meta, lead(), ctx())).toBe("forward");
    expect(nextLeadStep(meta, lead({ status: "qualified" }), ctx())).toBe("forward");
  });

  it("from the proposal on, an order is prepared first", () => {
    expect(nextLeadStep(meta, lead({ status: "proposal" }), ctx())).toBe("order");
    expect(nextLeadStep(meta, lead({ status: "decision_pending" }), ctx())).toBe("order");
  });

  it("with the order there, or no right to prepare one, it moves forward", () => {
    expect(nextLeadStep(meta, lead({ status: "proposal", converted_order_id: "o1" }), ctx())).toBe("forward");
    expect(nextLeadStep(meta, lead({ status: "decision_pending", converted_order_id: "o1" }), ctx())).toBe("forward");
    expect(nextLeadStep(meta, lead({ status: "decision_pending", allowed_actions: ["change_status"] }), ctx())).toBe("forward");
  });

  it("a final lead offers only reopening, if allowed", () => {
    expect(nextLeadStep(meta, lead({ status: "won", allowed_actions: ["reopen"] }), ctx())).toBe("reopen");
    expect(nextLeadStep(meta, lead({ status: "rejected", allowed_actions: ["view_timeline"] }), ctx())).toBeNull();
  });

  it("someone else's lead skips the calling steps", () => {
    expect(nextLeadStep(meta, lead({ assigned_operator_user_id: "u-other", next_action_at: null }), ctx({ callLogged: false }))).toBe("nextAction");
  });

  it("no action allowed means nothing is bright", () => {
    expect(nextLeadStep(meta, lead({ assigned_operator_user_id: "u-other", allowed_actions: [] }), ctx())).toBeNull();
  });

  it("typed text outranks every other step", () => {
    expect(nextLeadStep(meta, lead({ assigned_operator_user_id: null, allowed_actions: ["claim"] }), ctx({ drafting: true }))).toBe("compose");
    expect(nextLeadStep(meta, lead({ status: "won", allowed_actions: ["reopen"] }), ctx({ drafting: true }))).toBe("compose");
  });
});

describe("forwardOf", () => {
  it("is the next stage on the journey, never the rejection", () => {
    expect(forwardOf(meta, lead())).toBe("qualified");
    expect(forwardOf(meta, lead({ status: "proposal" }))).toBe("decision_pending");
    expect(forwardOf(meta, lead({ status: "decision_pending" }))).toBe("won");
  });

  it("is empty without the right to change status", () => {
    expect(forwardOf(meta, lead({ allowed_actions: [] }))).toBe("");
  });
});

describe("callOnRecord", () => {
  const at = (type: string, createdAt: string) => ({ type, createdAt });

  it("finds a written call result among the other activities", () => {
    expect(callOnRecord([at("system", "2026-11-06T08:00:00Z")])).toBe(false);
    expect(callOnRecord([at("system", "2026-11-06T08:00:00Z"), at("call_note", "2026-11-06T09:00:00Z")])).toBe(true);
  });

  it("does not count a call from before the lead was reopened", () => {
    expect(callOnRecord([at("call_note", "2026-09-01T09:00:00Z")], "2026-11-01T00:00:00Z")).toBe(false);
    expect(callOnRecord([at("call_note", "2026-11-02T09:00:00Z")], "2026-11-01T00:00:00Z")).toBe(true);
  });
});

describe("wonLocked", () => {
  it("opens only with a paid order", () => {
    expect(wonLocked(lead())).toBe(true);
    expect(wonLocked(lead({ converted_order: { id: "o1", payment_status: "unpaid" } }))).toBe(true);
    expect(wonLocked(lead({ converted_order: { id: "o1", payment_status: "paid" } }))).toBe(false);
  });
});
