import { crmNextStatuses, isFinalStatus, journeyOf, leadCan, type CrmActivity, type CrmLead, type CrmMeta } from "@/lib/services/crm";

// The one thing to do next on a lead. It drives the "do this now" block, the
// single most prominent shape on the lead page.
export type LeadStep = "claim" | "call" | "callResult" | "nextAction" | "forward" | "order" | "reopen" | "compose" | null;

export type LeadStepContext = {
  // The signed-in user's id.
  me: string;
  // The customer has a number the "call" button can dial.
  canDial: boolean;
  // A call is on record for this cycle; null while the timeline is loading.
  callLogged: boolean | null;
  // The call button was pressed in this session. A tel: link leaves no trace
  // on the backend, so this is the only thing that tells step 2 from step 3.
  dialed: boolean;
  // The operator is typing in a form on the page: its submit is the next step.
  drafting: boolean;
};

// The next stage on the lead's journey (rejecting is a separate action).
export function forwardOf(meta: CrmMeta | null, lead: CrmLead): string {
  const moves = leadCan(lead, "change_status") ? crmNextStatuses(meta, lead.status) : [];
  const journey = journeyOf(meta, lead.status);
  const at = journey.indexOf(lead.status);
  return moves.find((s) => s !== "rejected" && journey.indexOf(s) > at) ?? moves.find((s) => s !== "rejected" && !isFinalStatus(meta, s)) ?? "";
}

// "Won" takes a paid order (the backend refuses it otherwise).
export const wonLocked = (lead: Pick<CrmLead, "order">): boolean => lead.order?.paymentStatus !== "paid";

// A call on record in the current cycle: a written call result, or a call the
// telephony logged. A reopened lead starts over.
export function callOnRecord(items: Pick<CrmActivity, "type" | "createdAt">[], cycleOpenedAt = ""): boolean {
  const since = Date.parse(cycleOpenedAt) || 0;
  return items.some((a) => a.type.startsWith("call") && (Date.parse(a.createdAt) || 0) >= since);
}

export function nextLeadStep(meta: CrmMeta | null, lead: CrmLead, ctx: LeadStepContext): LeadStep {
  if (ctx.drafting) return "compose";
  if (isFinalStatus(meta, lead.status)) return leadCan(lead, "reopen") || leadCan(lead, "edit") ? "reopen" : null;
  if (!lead.operatorId && leadCan(lead, "claim")) return "claim";
  if (ctx.me && lead.operatorId === ctx.me) {
    // Nothing is bright for the moment the timeline takes to answer: better
    // than lighting one button and jumping to another.
    if (ctx.callLogged === null) return null;
    if (!ctx.callLogged) {
      if (ctx.dialed && leadCan(lead, "add_activity")) return "callResult";
      if (ctx.canDial) return "call";
    }
  }
  if (!lead.nextActionAt && leadCan(lead, "set_next_action")) return "nextAction";
  const forward = forwardOf(meta, lead);
  const journey = journeyOf(meta, lead.status);
  const blocked = forward === "won" && wonLocked(lead);
  if (forward && !blocked && journey.indexOf(lead.status) < journey.indexOf("proposal")) return "forward";
  if (!lead.order && leadCan(lead, "prepare_conversion")) return "order";
  // Winning takes a paid order: until there is one, the way forward is the order.
  if (blocked) return lead.order ? "order" : null;
  return forward ? "forward" : null;
}
