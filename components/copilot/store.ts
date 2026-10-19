import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth, type Role, type Session } from "@/lib/auth";
import { inDesk, tellDesk, useInDesk } from "@/lib/deskBridge";
import {
  copilotClip,
  copilotEntity,
  copilotEntityKey,
  copilotModeFor,
  copilotStaffSession,
  isCopilotSurface,
  loadCopilotAccess,
  newCopilotId,
  peekCopilotAccess,
  sanitizeCopilotContext,
  type CopilotCapsAccess,
  type CopilotEntityRef,
  type CopilotErrorKind,
  type CopilotPageContext,
  type CopilotPanelMode,
  type CopilotReply,
  type CopilotSurface,
} from "@/lib/services/copilotPanel";

export type CopilotOpenOptions = {
  surface: CopilotSurface;
  entity?: { type: string; id: string; title?: string; code?: string } | null;
  title?: string;
  context?: Record<string, string | number | boolean | null | undefined>;
  prompt?: string;
  trigger?: HTMLElement | null;
};

export type CopilotTab = "chat" | "drafts";
export type CopilotTurnStatus = "sending" | "done" | "failed" | "canceled";
export type CopilotActionState = "saving" | "saved" | "confirmation_required" | "not_executed" | "error";
export type CopilotActionOutcome = { state: CopilotActionState; message: string };
export type CopilotFeedback = { rating: number; useful: boolean | null; comment: string };

export type CopilotTurn = {
  id: string;
  ask: string;
  entity: CopilotEntityRef | null;
  surface: CopilotSurface;
  title: string;
  context: CopilotPageContext;
  status: CopilotTurnStatus;
  reply: CopilotReply | null;
  error: CopilotErrorKind | null;
  actions: Record<string, CopilotActionOutcome>;
  feedback: CopilotFeedback | null;
};

export type CopilotConv = {
  key: string;
  sessionId: string;
  surface: CopilotSurface;
  title: string;
  label: string;
  context: CopilotPageContext;
  origin: CopilotEntityRef | null;
  attached: boolean;
  turns: CopilotTurn[];
  prompt: string;
  promptSeq: number;
};

export type CopilotAccess = { owner: string; mode: CopilotPanelMode | null; role: Role | null; available: boolean; tools: string[] | null };

export type CopilotState = {
  access: CopilotAccess;
  hosts: number;
  open: boolean;
  mounted: boolean;
  convs: CopilotConv[];
  active: string;
  tab: CopilotTab;
  drafts: number;
  denied: boolean;
};

export type CopilotAction =
  | { type: "access"; access: CopilotAccess }
  | { type: "host"; delta: 1 | -1 }
  | { type: "open"; surface: CopilotSurface; entity: CopilotEntityRef | null; title: string; label: string; context: CopilotPageContext; prompt: string; sessionId: string }
  | { type: "close" }
  | { type: "tab"; tab: CopilotTab }
  | { type: "detach" }
  | { type: "attach" }
  | { type: "reset"; sessionId: string }
  | { type: "ask"; key: string; turn: CopilotTurn }
  | { type: "retry"; key: string; turnId: string }
  | { type: "answer"; key: string; turnId: string; reply: CopilotReply }
  | { type: "fail"; key: string; turnId: string; error: CopilotErrorKind }
  | { type: "action"; key: string; turnId: string; actionId: string; outcome: CopilotActionOutcome }
  | { type: "feedback"; key: string; turnId: string; feedback: CopilotFeedback }
  | { type: "drafts" }
  | { type: "denied" };

const MAX_CONVS = 8;
const MAX_TURNS = 60;

const NO_ACCESS: CopilotAccess = { owner: "", mode: null, role: null, available: false, tools: null };
const INITIAL: CopilotState = { access: NO_ACCESS, hosts: 0, open: false, mounted: false, convs: [], active: "", tab: "chat", drafts: 0, denied: false };

function patchConv(s: CopilotState, key: string, fn: (c: CopilotConv) => CopilotConv): CopilotState {
  let changed = false;
  const convs = s.convs.map((c) => {
    if (c.key !== key) return c;
    const next = fn(c);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...s, convs } : s;
}

function patchTurn(s: CopilotState, key: string, turnId: string, fn: (t: CopilotTurn) => CopilotTurn): CopilotState {
  return patchConv(s, key, (c) => {
    let changed = false;
    const turns = c.turns.map((t) => {
      if (t.id !== turnId) return t;
      const next = fn(t);
      if (next !== t) changed = true;
      return next;
    });
    return changed ? { ...c, turns } : c;
  });
}

const sameAccess = (a: CopilotAccess, b: CopilotAccess) =>
  a.owner === b.owner && a.mode === b.mode && a.role === b.role && a.available === b.available && (a.tools ?? []).join() === (b.tools ?? []).join() && !a.tools === !b.tools;

export function copilotReduce(s: CopilotState, a: CopilotAction): CopilotState {
  switch (a.type) {
    case "access": {
      if (a.access.owner !== s.access.owner || a.access.mode !== s.access.mode) return { ...s, access: a.access, open: false, convs: [], active: "", tab: "chat", denied: false };
      const access = s.denied ? { ...a.access, available: false } : a.access;
      return sameAccess(access, s.access) ? s : { ...s, access };
    }
    case "host":
      return { ...s, hosts: Math.max(0, s.hosts + a.delta) };
    case "open": {
      const key = copilotEntityKey(a.entity);
      const found = s.convs.find((c) => c.key === key);
      const conv: CopilotConv = found
        ? {
            ...found,
            surface: a.surface,
            title: a.title || found.title,
            label: a.label || found.label,
            context: a.context,
            origin: a.entity ?? found.origin,
            attached: !!(a.entity ?? found.origin),
            prompt: a.prompt || found.prompt,
            promptSeq: a.prompt ? found.promptSeq + 1 : found.promptSeq,
          }
        : { key, sessionId: a.sessionId, surface: a.surface, title: a.title, label: a.label, context: a.context, origin: a.entity, attached: !!a.entity, turns: [], prompt: a.prompt, promptSeq: 1 };
      return { ...s, open: true, mounted: true, active: key, tab: "chat", convs: [conv, ...s.convs.filter((c) => c.key !== key)].slice(0, MAX_CONVS) };
    }
    case "close":
      return s.open ? { ...s, open: false } : s;
    case "tab":
      return s.tab === a.tab ? s : { ...s, tab: a.tab };
    case "detach":
      return patchConv(s, s.active, (c) => (c.attached ? { ...c, attached: false } : c));
    case "attach":
      return patchConv(s, s.active, (c) => (c.origin && !c.attached ? { ...c, attached: true } : c));
    case "reset": {
      const next = patchConv(s, s.active, (c) => ({ ...c, sessionId: a.sessionId, turns: [], prompt: "", promptSeq: c.promptSeq + 1 }));
      return next.tab === "chat" ? next : { ...next, tab: "chat" };
    }
    case "ask":
      return patchConv(s, a.key, (c) => ({ ...c, turns: [...c.turns, a.turn].slice(-MAX_TURNS) }));
    case "retry":
      return patchTurn(s, a.key, a.turnId, (t) => (t.status === "sending" ? t : { ...t, status: "sending", reply: null, error: null }));
    case "answer":
      return patchTurn(s, a.key, a.turnId, (t) => (t.status === "sending" ? { ...t, status: "done", reply: a.reply, error: null, actions: {}, feedback: null } : t));
    case "fail":
      return patchTurn(s, a.key, a.turnId, (t) => (t.status === "sending" ? { ...t, status: a.error === "aborted" ? "canceled" : "failed", error: a.error } : t));
    case "action":
      return patchTurn(s, a.key, a.turnId, (t) => ({ ...t, actions: { ...t.actions, [a.actionId]: a.outcome } }));
    case "feedback":
      return patchTurn(s, a.key, a.turnId, (t) => ({ ...t, feedback: a.feedback }));
    case "drafts":
      return { ...s, drafts: s.drafts + 1 };
    case "denied":
      return { ...s, denied: true, access: { ...s.access, available: false } };
  }
}

let state: CopilotState = INITIAL;
const subs = new Set<() => void>();
let trigger: HTMLElement | null = null;

function markTrigger(): void {
  trigger?.toggleAttribute("data-cpl-on", state.open);
}

export function copilotDispatch(a: CopilotAction): void {
  const next = copilotReduce(state, a);
  if (next === state) return;
  state = next;
  markTrigger();
  subs.forEach((fn) => fn());
}

export function subscribeCopilot(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export const copilotSnapshot = (): CopilotState => state;
const serverSnapshot = (): CopilotState => INITIAL;

export function useCopilotState(): CopilotState {
  return useSyncExternalStore(subscribeCopilot, copilotSnapshot, serverSnapshot);
}

export function copilotTrigger(): HTMLElement | null {
  return trigger && trigger.isConnected ? trigger : null;
}

const hostedAvailable = () => state.access.available && state.hosts > 0;

export function openCopilot(opts: CopilotOpenOptions): void {
  if (typeof window === "undefined" || !opts || !isCopilotSurface(opts.surface)) return;
  const entity = copilotEntity(opts.entity);
  if (inDesk()) {
    if (entity) tellDesk({ type: "lexgo-desk:copilot", entity: { type: entity.type, id: entity.id, ...(entity.title ? { title: entity.title } : {}) } });
    return;
  }
  if (!hostedAvailable()) return;
  const active = document.activeElement;
  const next = opts.trigger instanceof HTMLElement ? opts.trigger : active instanceof HTMLElement && active !== document.body && !active.closest(".cpl") ? active : null;
  if (next !== trigger) {
    trigger?.removeAttribute("data-cpl-on");
    trigger = next;
  }
  const raw = opts.entity && typeof opts.entity === "object" ? opts.entity : null;
  copilotDispatch({
    type: "open",
    surface: opts.surface,
    entity,
    title: copilotClip(opts.title, 140),
    label: copilotClip(opts.context?.label, 120) || (entity ? "" : copilotClip(raw?.title, 120)),
    context: sanitizeCopilotContext(opts.context),
    prompt: typeof opts.prompt === "string" ? opts.prompt.trim().slice(0, 2000) : "",
    sessionId: newCopilotId(),
  });
}

export function closeCopilot(): void {
  if (!state.open) return;
  const active = typeof document === "undefined" ? null : document.activeElement;
  const inside = !!active && (active === document.body || !!active.closest(".cpl"));
  copilotDispatch({ type: "close" });
  const back = copilotTrigger();
  if (back && inside) window.requestAnimationFrame(() => back.focus({ preventScroll: true }));
}

const ownerOf = (session: Session | null | undefined) => (session ? session.id || session.phone || "" : "");

export function copilotChatSurface(session: Session | null | undefined): CopilotSurface {
  const owner = ownerOf(session);
  const mode = owner && state.access.owner === owner && state.access.mode ? state.access.mode : copilotModeFor(session);
  return mode === "lawyer_copilot" ? "lawyer_chat" : "client_chat";
}

export function useCopilotAvailable(entity?: CopilotOpenOptions["entity"] | boolean): boolean {
  const desk = useInDesk();
  const { session, ready } = useAuth();
  const hosted = useSyncExternalStore(subscribeCopilot, hostedAvailable, () => false);
  const owner = desk && ready ? ownerOf(session) : "";
  const staff = !!owner && copilotStaffSession(session);
  const [caps, setCaps] = useState<{ owner: string; caps: CopilotCapsAccess } | null>(null);
  useEffect(() => {
    if (!owner || !staff) return;
    let live = true;
    void loadCopilotAccess(owner).then((c) => {
      if (live) setCaps({ owner, caps: c });
    });
    return () => {
      live = false;
    };
  }, [owner, staff]);
  if (!desk) return hosted;
  const has = typeof entity === "boolean" ? entity : !!copilotEntity(entity);
  if (!has || !ready || !owner) return false;
  const known = caps && caps.owner === owner ? caps.caps : peekCopilotAccess(owner);
  if (known?.status === "denied") return false;
  if (known?.status === "ok" && known.role) return copilotModeFor({ backendRole: known.role }) !== null;
  return !staff && copilotModeFor(session) !== null;
}

export function useCopilot(entity?: CopilotOpenOptions["entity"] | boolean): { open: (opts: CopilotOpenOptions) => void; close: () => void; available: boolean; isOpen: boolean } {
  const available = useCopilotAvailable(entity);
  const isOpen = useSyncExternalStore(subscribeCopilot, () => state.open, () => false);
  return { open: openCopilot, close: closeCopilot, available, isOpen };
}
