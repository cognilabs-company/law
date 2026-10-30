import type { ChecklistItem, ChecklistPayoutStage } from "@/lib/services/marketRuntime";
import { CHECKLIST_PAYOUT_STAGES } from "@/lib/services/marketRuntime";
import type { Payout, PayoutStage } from "@/lib/services/payouts";
import { sortedItems } from "./checklistRules";

// The seller's checklist in its two payout stages (payout model, contract
// 2026-10-27 §9): the first_checklist items release the second 30% as soon
// as they are done; the final_completion items lead to the last 40%, paid
// once the order is completed and the 15-minute rating/complaint window
// closes. Amounts and payout states are the backend's payout rows
// (GET …/financials); nothing here works an amount out.

// The payout row each checklist stage is paid by.
const PAYOUT_ROW: Readonly<Record<ChecklistPayoutStage, PayoutStage>> = { first_checklist: "checklist", final_completion: "completion" };
// The stage's share as the product names it; the backend's gross_percent
// wins when its row says one.
const NAMED_PERCENT: Readonly<Record<ChecklistPayoutStage, number>> = { first_checklist: 30, final_completion: 40 };

// open      — items still to do (30%) / not paid yet (40%)
// recording — the 30% items are done; no payout row has come yet
// sending   — the payout is due or on its way (never "paid" before it is)
// paid      — the backend says paid
// issue     — the transfer failed or is under review; an operator acts
// held      — the settlement holds it (complaint, rework, rating window)
export type StageState = "open" | "recording" | "sending" | "paid" | "issue" | "held";

export type StageGroup = {
  stage: ChecklistPayoutStage;
  items: ChecklistItem[];
  done: number;
  total: number;
  // Items still pending that the stage waits for: the required ones when
  // the stage has any, every item otherwise.
  left: number;
  complete: boolean;
  payout: Payout | null;
  percent: number;
  state: StageState;
};

const ISSUE = new Set(["failed", "recovery", "review"]);

function stateOf(stage: ChecklistPayoutStage, complete: boolean, payout: Payout | null, orderDone: boolean): StageState {
  const s = payout?.status;
  if (s === "paid") return "paid";
  if (s === "held") return "held";
  if (s && ISSUE.has(s)) return "issue";
  if (stage === "first_checklist") {
    // The backend moving the payout counts even if an optional item is open.
    if (!complete && s !== "processing") return "open";
    return payout ? "sending" : "recording";
  }
  // The final 40% leaves only after completion and the 15-minute window.
  if (s === "processing" || (orderDone && s === "due")) return "sending";
  return "open";
}

export function stageGroups(items: readonly ChecklistItem[], payouts: readonly Payout[] | null, orderDone = false): StageGroup[] {
  const sorted = sortedItems(items);
  return CHECKLIST_PAYOUT_STAGES.map((stage) => {
    const own = sorted.filter((i) => i.payoutStage === stage);
    const needed = own.some((i) => i.required) ? own.filter((i) => i.required) : own;
    const left = needed.filter((i) => i.status === "pending").length;
    const complete = own.length > 0 && left === 0;
    const payout = payouts?.find((p) => p.stage === PAYOUT_ROW[stage]) ?? null;
    return {
      stage,
      items: own,
      done: own.filter((i) => i.status !== "pending").length,
      total: own.length,
      left,
      complete,
      payout,
      percent: payout?.percent ?? NAMED_PERCENT[stage],
      state: stateOf(stage, complete, payout, orderDone),
    };
  }).filter((g) => g.total > 0);
}

// The amount to show for a stage: the payout row's own payable amount, or
// nothing (the percent alone is shown) when the backend has not sent one.
export function stageAmount(g: Pick<StageGroup, "payout">): number | null {
  return g.payout && g.payout.amount > 0 ? g.payout.amount : null;
}

// Whether the first stage just became complete, between two looks at the
// same order's checklist (not on the first load of an already-done list).
export type StageMark = { total: number; complete: boolean } | null;
export function firstStageMark(groups: readonly StageGroup[]): StageMark {
  const g = groups.find((x) => x.stage === "first_checklist");
  return g ? { total: g.total, complete: g.complete } : null;
}
export function justCompleted(before: StageMark, now: StageMark): boolean {
  return !!before && !!now && before.total > 0 && !before.complete && now.complete;
}
