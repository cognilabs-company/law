import { http, asDict, asStr, asNum, asArr, isAborted } from "@/lib/http";
import { featureMissing, noteFeatureError } from "@/lib/endpointGate";

export type GuideAction =
  | { type: "navigate"; href: string }
  | { type: "scroll_to"; target: string }
  | { type: "highlight"; target: string; style: string; durationMs: number }
  | { type: "tooltip"; target: string; text: string }
  | { type: "focus"; target: string }
  | { type: "confirm"; actionType: string; text: string };

export type InstructorReply = {
  reply: string;
  intent: string;
  actions: GuideAction[];
  requiresConfirmation: boolean;
  confirmActionType: string;
  role: string;
};

export type ActionPreview = { actionType: string; requiresConfirmation: boolean; confirmationText: string };

export type ConfirmedTicket = { id: string; workId: string; status: string; title: string };
export type ActionConfirm = { created: boolean; ticket: ConfirmedTicket | null; nextHref: string; nextTarget: string };

function normAction(v: unknown): GuideAction | null {
  const d = asDict(v);
  const type = asStr(d.type);
  const target = asStr(d.target).trim();
  if (type === "navigate") {
    const href = asStr(d.href ?? d.route).trim();
    return href ? { type, href } : null;
  }
  if (type === "scroll_to" || type === "focus") return target ? { type, target } : null;
  if (type === "highlight") return target ? { type, target, style: asStr(d.style, "red_pulse"), durationMs: Math.max(1000, Math.min(15000, asNum(d.duration_ms, 6000))) } : null;
  if (type === "tooltip") {
    const text = asStr(d.text).trim();
    return target && text ? { type, target, text } : null;
  }
  if (type === "confirm" || type === "preview_action" || type === "start_support_ticket") {
    return { type: "confirm", actionType: asStr(d.action_type, type === "start_support_ticket" ? type : ""), text: asStr(d.text ?? d.confirmation_text) };
  }
  return null;
}

export async function askInstructor(
  input: { message: string; currentPath: string; visibleTargets: string[] },
  signal?: AbortSignal,
): Promise<InstructorReply | null> {
  if (featureMissing("instructor")) return null;
  try {
    const d = asDict(
      await http("/ai/platform-instructor", {
        method: "POST",
        body: JSON.stringify({ message: input.message, current_path: input.currentPath, visible_targets: input.visibleTargets }),
        signal,
      }),
    );
    const actions = asArr(d.actions).map(normAction).filter((a): a is GuideAction => a !== null);
    const confirm = actions.find((a) => a.type === "confirm");
    return {
      reply: asStr(d.reply ?? d.answer).trim(),
      intent: asStr(d.intent, "general_help"),
      actions: actions.filter((a) => a.type !== "confirm"),
      requiresConfirmation: d.requires_confirmation === true || Boolean(confirm),
      confirmActionType: (confirm && confirm.type === "confirm" && confirm.actionType) || asStr(d.action_type),
      role: asStr(d.role),
    };
  } catch (e) {
    if (isAborted(e)) throw e;
    if (noteFeatureError("instructor", e)) return null;
    throw e;
  }
}

export async function previewInstructorAction(actionType: string, message: string): Promise<ActionPreview> {
  const d = asDict(await http("/ai/platform-instructor/actions/preview", { method: "POST", body: JSON.stringify({ action_type: actionType, message }) }));
  return {
    actionType: asStr(d.action_type, actionType),
    requiresConfirmation: d.requires_confirmation !== false,
    confirmationText: asStr(d.confirmation_text).trim(),
  };
}

export async function confirmInstructorAction(actionType: string, message: string): Promise<ActionConfirm> {
  const d = asDict(await http("/ai/platform-instructor/actions/confirm", { method: "POST", body: JSON.stringify({ action_type: actionType, message }) }));
  const tk = d.ticket ? asDict(d.ticket) : null;
  const next = asDict(d.next);
  return {
    created: d.created === true,
    ticket: tk ? { id: asStr(tk.id), workId: asStr(tk.work_id), status: asStr(tk.status), title: asStr(tk.title) } : null,
    nextHref: asStr(next.href),
    nextTarget: asStr(next.target),
  };
}
