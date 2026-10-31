import { describe, expect, it } from "vitest";
import { normChecklistItem, normOrderChecklist } from "@/lib/services/marketRuntime";
import { payoutOf } from "@/lib/services/payouts";
import { mergeChecklistItem } from "@/components/marketplace/order/checklistRules";
import { firstStageMark, justCompleted, planSteps, stageAmount, stageGroups } from "@/components/marketplace/order/payStages";
import { PLANNED_STAGES, settlementOf } from "@/lib/services/payouts";

// The seller's checklist in its 30% and 40% payout stages (owner,
// 2026-10-30): the item's payout_stage decides the group; amounts and
// payout states are the backend's payout rows, never worked out here.
const item = (id: string, stage: string | undefined, status = "pending", required = true) => normChecklistItem({ id, executor_title: id, status, required, ...(stage ? { payout_stage: stage } : {}) });
const row = (stage: string, status: string, amount = 33000, pct = 30) => payoutOf({ id: `po-${stage}`, stage, status, gross_percent: pct, payable_amount: amount });

describe("checklist payout stages", () => {
  it("reads payout_stage; an item without one is a final item", () => {
    expect(item("a", "first_checklist").payoutStage).toBe("first_checklist");
    expect(item("b", "final_completion").payoutStage).toBe("final_completion");
    expect(item("c", undefined).payoutStage).toBe("final_completion");
    expect(item("d", "FIRST_CHECKLIST").payoutStage).toBe("first_checklist");
  });

  it("keeps an item's stage when a save answers without it", () => {
    const list = normOrderChecklist({ items: [{ id: "a", status: "pending", payout_stage: "first_checklist" }] }, "o1");
    const merged = mergeChecklistItem(list, normChecklistItem({ id: "a", status: "done" }));
    expect(merged.items[0].payoutStage).toBe("first_checklist");
    expect(merged.items[0].status).toBe("done");
  });

  it("splits the list into the 30% group first, each with its own progress", () => {
    const groups = stageGroups([item("f1", "final_completion"), item("a1", "first_checklist", "done"), item("a2", "first_checklist"), item("f2", undefined)], null);
    expect(groups.map((g) => g.stage)).toEqual(["first_checklist", "final_completion"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a1", "a2"]);
    expect([groups[0].done, groups[0].total, groups[0].left]).toEqual([1, 2, 1]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["f1", "f2"]);
    expect(groups[0].percent).toBe(30);
    expect(groups[1].percent).toBe(40);
  });

  it("drops a stage with no items", () => {
    expect(stageGroups([item("f1", "final_completion")], null).map((g) => g.stage)).toEqual(["final_completion"]);
  });

  // Backend answers 2026-10-31 §1.10: the 30% stage is reached when EVERY
  // first_checklist item is done or skipped_with_reason — optional ones too.
  it("waits for every first-stage item, required or not; a skipped one counts and is counted", () => {
    const g = stageGroups([item("a1", "first_checklist", "done"), item("a2", "first_checklist", "pending", false)], null)[0];
    expect(g.left).toBe(1);
    expect(g.complete).toBe(false);
    const s = stageGroups([item("a1", "first_checklist", "skipped_with_reason"), item("a2", "first_checklist", "done", false)], null)[0];
    expect(s.complete).toBe(true);
    expect(s.skipped).toBe(1);
    expect(s.done).toBe(2);
  });

  it("the 30% stage: open, then recording, sending or paid by the payout row — never paid before it is", () => {
    const open = [item("a1", "first_checklist", "done"), item("a2", "first_checklist")];
    const done = [item("a1", "first_checklist", "done"), item("a2", "first_checklist", "done")];
    expect(stageGroups(open, [row("first_checklist", "operator_required")])[0].state).toBe("open");
    expect(stageGroups(done, null)[0].state).toBe("recording");
    expect(stageGroups(done, [])[0].state).toBe("recording");
    expect(stageGroups(done, [row("first_checklist", "operator_required")])[0].state).toBe("sending");
    expect(stageGroups(done, [row("first_checklist", "provider_pending")])[0].state).toBe("sending");
    expect(stageGroups(done, [row("first_checklist", "paid")])[0].state).toBe("paid");
    expect(stageGroups(done, [row("first_checklist", "provider_failed")])[0].state).toBe("issue");
    // The backend already moving the money counts, even with an optional item open.
    expect(stageGroups(open, [row("first_checklist", "provider_pending")])[0].state).toBe("sending");
  });

  it("the 40% stage waits for completion and the window", () => {
    const fin = [item("f1", "final_completion", "done")];
    expect(stageGroups(fin, [row("completion", "operator_required", 24200, 40)])[0].state).toBe("open");
    expect(stageGroups(fin, [row("completion", "operator_required", 24200, 40)], true)[0].state).toBe("sending");
    expect(stageGroups(fin, [row("completion", "paid", 24200, 40)], true)[0].state).toBe("paid");
  });

  it("the amount is the payout row's own; no row, no amount", () => {
    const done = [item("a1", "first_checklist", "done")];
    expect(stageAmount(stageGroups(done, [row("first_checklist", "paid", 33000)])[0])).toBe(33000);
    expect(stageAmount(stageGroups(done, null)[0])).toBeNull();
    expect(stageGroups(done, [row("first_checklist", "paid", 33000, 25)])[0].percent).toBe(25);
  });

  it("the 30% moment fires once, when the stage turns complete — not on a first load", () => {
    const before = firstStageMark(stageGroups([item("a1", "first_checklist", "done"), item("a2", "first_checklist")], null));
    const after = firstStageMark(stageGroups([item("a1", "first_checklist", "done"), item("a2", "first_checklist", "done")], null));
    expect(justCompleted(before, after)).toBe(true);
    expect(justCompleted(null, after)).toBe(false);
    expect(justCompleted(after, after)).toBe(false);
    expect(justCompleted(after, before)).toBe(false);
  });

  // §1.10: planned stages and created payout rows are separate.
  describe("planned stages beside the created rows", () => {
    const rowOf = (stage: string, status: string, amount = 33000, pct = 30) => payoutOf({ id: `po-${stage}`, stage, status, gross_percent: pct, payable_amount: amount });
    it("every planned stage shows; only a created row gives a status or an amount", () => {
      const steps = planSteps(PLANNED_STAGES, [rowOf("acceptance", "paid")], [item("a1", "first_checklist")], null);
      expect(steps.map((s) => [s.stage, s.percent, s.state])).toEqual([
        ["accept", 30, "paid"],
        ["checklist", 30, "waiting"],
        ["completion", 40, "waiting"],
      ]);
      expect(steps[1].payout).toBeNull();
    });
    it("no first_checklist items: that stage is not triggered automatically", () => {
      expect(planSteps(PLANNED_STAGES, [], [item("f1", "final_completion")], null)[1].state).toBe("manual");
      expect(planSteps(PLANNED_STAGES, [], [], null)[1].state).toBe("manual");
      // Not known yet (the checklist is loading): not claimed either way.
      expect(planSteps(PLANNED_STAGES, [], null, null)[1].state).toBe("waiting");
      // A row the backend created anyway wins.
      expect(planSteps(PLANNED_STAGES, [rowOf("first_checklist", "operator_required")], [], null)[1].state).toBe("due");
    });
    it("the completion stage waits on a hold; a created row says how it stands", () => {
      const held = settlementOf({ settlement: { status: "held" } });
      expect(planSteps(PLANNED_STAGES, [], [], held)[2].state).toBe("held");
      expect(planSteps(PLANNED_STAGES, [rowOf("completion", "provider_pending", 24200, 40)], [], null)[2]).toMatchObject({ state: "sending", percent: 40 });
      expect(planSteps(PLANNED_STAGES, [rowOf("completion", "provider_failed", 24200, 40)], [], null)[2].state).toBe("issue");
    });
  });
});
