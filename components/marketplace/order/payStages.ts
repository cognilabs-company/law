import type { ChecklistItem, ChecklistPayoutStage } from "@/lib/services/marketRuntime";
import { CHECKLIST_PAYOUT_STAGES } from "@/lib/services/marketRuntime";
import type { Payout, PayoutStage, PlannedStage, Settlement } from "@/lib/services/payouts";
import { sortedItems } from "./checklistRules";

// The seller's checklist in its two payout stages (payout model, contract
// 2026-10-27 §9; backend answers 2026-10-31 §1.10): the first_checklist
// items release the second 30% once every one of them is done or skipped
// with a reason; the final_completion items lead to the last 40%, paid
// once the order is completed, the 15-minute rating/complaint window
// closes and no hold remains. Amounts and payout states are the backend's
// payout rows (GET …/financials); nothing here works an amount out.

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
  // Items still pending: the stage waits for every one of them (§1.10).
  left: number;
  // Items skipped with a reason: they count as done, the reason stays.
  skipped: number;
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
    // Every item of the stage, required or not, done or skipped with a
    // reason (§1.10) — the backend's own trigger for the 30% payout.
    const left = own.filter((i) => i.status === "pending").length;
    const complete = own.length > 0 && left === 0;
    const payout = payouts?.find((p) => p.stage === PAYOUT_ROW[stage]) ?? null;
    return {
      stage,
      items: own,
      done: own.filter((i) => i.status !== "pending").length,
      total: own.length,
      left,
      skipped: own.filter((i) => i.status === "skipped_with_reason").length,
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

// The order's planned payout stages beside its created payout rows (§1.10):
// each planned stage with its percent, and where it really is — only a row
// the backend created says due, on its way, paid or held. Without a row a
// stage is waiting for its condition; the first checklist stage of an order
// whose checklist has no first_checklist items is not triggered
// automatically; the completion stage waits on a settlement hold.
//   paid | sending | due | issue | held — from the created row
//   waiting — no row yet; manual — first stage with no items to trigger it
export type PlanState = "paid" | "sending" | "due" | "issue" | "held" | "waiting" | "manual";
export type PlanStep = { stage: Exclude<PayoutStage, "other">; percent: number; payout: Payout | null; state: PlanState };

function rowState(p: Payout): PlanState {
  if (p.status === "paid") return "paid";
  if (p.status === "held") return "held";
  if (p.status === "processing") return "sending";
  if (p.status === "due") return "due";
  if (ISSUE.has(p.status)) return "issue";
  return "waiting";
}

// `items`: the order's checklist items, null while they are not known.
export function planSteps(plan: readonly PlannedStage[], rows: readonly Payout[], items: readonly ChecklistItem[] | null, settlement: Settlement | null): PlanStep[] {
  return plan.map(({ stage, percent }) => {
    const payout = rows.find((r) => r.stage === stage) ?? null;
    if (payout) return { stage, percent: payout.percent ?? percent, payout, state: rowState(payout) };
    if (stage === "checklist" && items && !items.some((i) => i.payoutStage === "first_checklist")) return { stage, percent, payout, state: "manual" };
    if (stage === "completion" && settlement?.held) return { stage, percent, payout, state: "held" };
    return { stage, percent, payout, state: "waiting" };
  });
}
