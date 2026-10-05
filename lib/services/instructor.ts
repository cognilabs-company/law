import { http, asDict, asStr, asArr, isAborted } from "@/lib/http";
import { featureMissing, noteFeatureError } from "@/lib/endpointGate";
import { routeForKey } from "@/lib/guide/routes";
import type { GuideRole, GuideStep, GuideTour, TargetInfo } from "@/lib/guide/types";

export type GuideAction =
  | { type: "navigate"; href: string }
  | { type: "scroll_to"; target: string }
  | { type: "highlight"; target: string }
  | { type: "tooltip"; target: string; text: string }
  | { type: "focus"; target: string }
  | { type: "confirm"; actionType: string; text: string };

export type InstructorV2Step = { action: string; routeKey: string; href: string; target: string; caption: string };

export type InstructorReply = {
  reply: string;
  intent: string;
  actions: GuideAction[];
  steps: InstructorV2Step[];
  suggestions: string[];
  requiresConfirmation: boolean;
  confirmActionType: string;
  fallback: string;
};

export type InstructorRequest = {
  message: string;
  current_path: string;
  visible_targets: string[];
  contract_version: 2;
  locale: string;
  session_id: string;
  page: { id: string; path: string; title: string; portal: GuideRole };
  targets: TargetInfo[];
  state: Record<string, unknown>;
  history: { q: string; intent: string }[];
};

function normAction(v: unknown): GuideAction | null {
  const d = asDict(v);
  const type = asStr(d.type ?? d.action);
  const target = asStr(d.target ?? d.target_id).trim();
  if (type === "navigate") {
    const href = asStr(d.href ?? d.route).trim();
    return href ? { type, href } : null;
  }
  if (type === "scroll_to" || type === "focus" || type === "highlight") return target ? { type, target } : null;
  if (type === "tooltip") {
    const text = asStr(d.text ?? d.caption).trim();
    return target ? { type, target, text } : null;
  }
  if (type === "confirm" || type === "preview_action" || type === "request_confirmation" || type === "start_support_ticket") {
    return { type: "confirm", actionType: asStr(d.action_type ?? d.confirm_action, type === "start_support_ticket" ? type : ""), text: asStr(d.text ?? d.confirmation_text) };
  }
  return null;
}

function normStep(v: unknown): InstructorV2Step | null {
  const d = asDict(v);
  const action = asStr(d.action ?? d.type);
  if (!action) return null;
  return {
    action,
    routeKey: asStr(d.route_key),
    href: asStr(d.href ?? d.route),
    target: asStr(d.target_id ?? d.target).trim(),
    caption: asStr(d.caption ?? d.text).trim(),
  };
}

export async function askInstructor(input: InstructorRequest, signal?: AbortSignal): Promise<InstructorReply | null> {
  if (featureMissing("instructor")) return null;
  try {
    const d = asDict(await http("/ai/platform-instructor", { method: "POST", body: JSON.stringify(input), signal }));
    const actions = asArr(d.actions).map(normAction).filter((a): a is GuideAction => a !== null);
    const confirm = actions.find((a) => a.type === "confirm");
    return {
      reply: asStr(d.reply ?? d.answer).trim(),
      intent: asStr(d.intent, "general_help"),
      actions: actions.filter((a) => a.type !== "confirm"),
      steps: asArr(d.steps).map(normStep).filter((s): s is InstructorV2Step => s !== null),
      suggestions: asArr(d.suggestions).map((s) => asStr(s).trim()).filter(Boolean).slice(0, 3),
      requiresConfirmation: d.requires_confirmation === true || Boolean(confirm),
      confirmActionType: (confirm && confirm.type === "confirm" && confirm.actionType) || asStr(d.action_type),
      fallback: asStr(d.fallback),
    };
  } catch (e) {
    if (isAborted(e)) throw e;
    if (noteFeatureError("instructor", e)) return null;
    throw e;
  }
}

export function replyHasGuide(r: InstructorReply): boolean {
  return r.intent !== "general_help" && (r.actions.length > 0 || r.steps.some((s) => s.action !== "suggest_next_step"));
}

let seq = 0;
const tourId = () => `t${Date.now().toString(36)}${(++seq).toString(36)}`;

export function tourFromReply(reply: InstructorReply, role: GuideRole, captionFor: (target: string) => string): GuideTour {
  const steps: GuideStep[] = [];
  let navigate: string | undefined;
  const take = (target: string) => {
    let s = steps.find((x) => x.target === target);
    if (!s) {
      s = { target, caption: "", focus: true };
      steps.push(s);
    }
    return s;
  };
  if (reply.steps.length) {
    for (const st of reply.steps) {
      if (st.action === "navigate") {
        const href = st.routeKey ? routeForKey(st.routeKey, role) : st.href;
        if (href && !navigate) navigate = href;
        continue;
      }
      if (!st.target || st.action === "suggest_next_step" || st.action === "request_confirmation") continue;
      const s = take(st.target);
      if (st.caption) s.caption = st.caption;
    }
  } else {
    for (const a of reply.actions) {
      if (a.type === "navigate") {
        if (!navigate) navigate = a.href;
        continue;
      }
      if (a.type === "confirm") continue;
      const s = take(a.target);
      if (a.type === "tooltip" && a.text) s.caption = a.text;
    }
  }
  steps.forEach((s, i) => {
    if (!s.caption) s.caption = captionFor(s.target) || (i === 0 ? reply.reply : "");
  });
  if (!steps.length) steps.push({ target: "ai-help:current-page", caption: reply.reply, focus: true });
  return { id: tourId(), source: "instructor", navigate, steps, reply: reply.reply };
}

export function newTourId(): string {
  return tourId();
}
