import { asStr, type Dict } from "@/lib/http";
import { RA_PERSONAL_SCOPE, raGrantedActions, type RaAck, type RaCommand, type RaMeta } from "@/lib/services/remoteAssist";
import {
  raClearHighlight,
  raCollect,
  raFieldValid,
  raHighlight,
  raOpenModal,
  raPageOf,
  raSafeRoute,
  raSelectOption,
  raSetValue,
  raToggle,
  type RaLive,
} from "./registry";

// The one place an operator command is carried out on the client (contract
// §20). In order: the session is live on this device, the command was not
// handled before, the page and revision still match, the component resolves
// through the registry and still permits the action, the client confirms when
// required, then the page's own adapter runs it. The caller publishes the
// next revision and sends the single acknowledgement this returns.

export type RaPrompt =
  | { kind: "draft"; label: string; rows: { label: string; value: string }[] }
  | { kind: "present"; label: string; summary: string }
  | { kind: "confirm"; label: string; actionId: string };

export type RaExecCtx = {
  meta: RaMeta;
  mode: string;
  grantedScopes: string[];
  live: boolean;
  deviceOk: boolean;
  // Revision published when the client arrived on the current page/modal: a
  // command aimed at an older screen is stale.
  pageRevision: number;
  operator: string;
  // Shows the confirmation sheet; the executor has already acked
  // confirmation_required by then.
  confirm: (p: RaPrompt) => Promise<boolean>;
  confirmationShown: () => Promise<void>;
  navigate: (route: string) => void;
  pathname: () => string;
};

const MAX_VALUE = 2000;
const VALUE_ACTIONS = new Set(["form.set_value", "form.select_option", "form.toggle", "draft.prepare", "element.focus"]);
const ALWAYS_CONFIRM = new Set(["draft.prepare", "confirmation.present"]);

const textOf = (p: Dict) => asStr(p.text ?? p.message ?? p.tooltip ?? p.note).slice(0, 300);
const valueOf = (p: Dict) => {
  const v = p.value;
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
};

const reject = (code: string): RaAck => ({ status: "rejected", failureCode: code, result: { applied: false } });

export async function raExecute(cmd: RaCommand, ctx: RaExecCtx): Promise<RaAck> {
  // 1. live session on this device
  if (!ctx.deviceOk) return reject("device_session_mismatch");
  if (!ctx.live) return reject("session_not_active");
  if (cmd.expiresAt && Date.parse(cmd.expiresAt) < Date.now()) return reject("command_expired");

  const meta = ctx.meta.actions.find((a) => a.id === cmd.actionId);
  if (!meta) return reject("unknown_action");
  if (!raGrantedActions(ctx.meta, ctx.mode, ctx.grantedScopes).has(cmd.actionId)) return reject("action_not_granted");
  const mustConfirm = meta.confirm || cmd.requiresConfirmation || ALWAYS_CONFIRM.has(cmd.actionId);

  // 3. page + revision
  const page = raPageOf(ctx.pathname());
  if (!page) return reject("page_not_registered");

  if (cmd.actionId === "route.navigate") {
    const route = raSafeRoute(cmd.payload.route);
    if (!route) return reject("route_not_allowed");
    if (mustConfirm && !(await ask(ctx, { kind: "confirm", label: route, actionId: cmd.actionId }))) return cancelled();
    ctx.navigate(route);
    return done(mustConfirm, { page_id: raPageOf(route)?.pageId ?? "" });
  }

  if (cmd.pageId && cmd.pageId !== page.pageId) return reject("page_changed");
  if (cmd.expectedUiRevision && cmd.expectedUiRevision < ctx.pageRevision) return reject("ui_revision_conflict");

  // 4–6. resolve through the registry
  if (meta.componentRequired && !cmd.componentId) return reject("component_required");
  const list = raCollect(new Set(ctx.meta.actions.map((a) => a.id)));
  const live = list.find((x) => x.def.componentId === cmd.componentId);
  if (cmd.componentId && !live) return reject("component_not_mounted");
  if (live) {
    if (live.def.sensitivity === "secret") return reject("secret_component_blocked");
    if (live.def.state === "disabled" && cmd.actionId !== "element.highlight" && cmd.actionId !== "page.scroll_to" && cmd.actionId !== "element.tooltip") return reject("component_disabled");
    if (!live.def.actions.includes(cmd.actionId)) return reject("action_not_permitted");
    if (live.def.sensitivity === "personal" && VALUE_ACTIONS.has(cmd.actionId) && !ctx.grantedScopes.includes(RA_PERSONAL_SCOPE)) return reject("personal_scope_required");
  }

  try {
    return await run(cmd, live ?? null, list, ctx, mustConfirm);
  } catch (e) {
    return reject(e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : "execution_failed");
  }
}

async function ask(ctx: RaExecCtx, p: RaPrompt): Promise<boolean> {
  await ctx.confirmationShown();
  return ctx.confirm(p);
}
const cancelled = (): RaAck => ({ status: "cancelled", failureCode: "client_declined", result: { applied: false } });
const done = (confirmed: boolean, result: Dict = {}): RaAck => ({ status: confirmed ? "confirmed" : "executed", failureCode: "", result: { applied: true, ...result } });

async function run(cmd: RaCommand, live: RaLive | null, list: RaLive[], ctx: RaExecCtx, mustConfirm: boolean): Promise<RaAck> {
  const p = cmd.payload;
  const need = () => {
    if (!live) throw new Error("component_required");
    return live;
  };
  const gate = async (prompt: RaPrompt) => !mustConfirm || (await ask(ctx, prompt));

  switch (cmd.actionId) {
    case "element.highlight": {
      const x = need();
      if (!(await gate({ kind: "confirm", label: x.def.label, actionId: cmd.actionId }))) return cancelled();
      raHighlight(x.el, textOf(p), ctx.operator);
      return done(mustConfirm);
    }
    case "element.tooltip": {
      const x = need();
      const text = textOf(p);
      if (!text) return reject("tooltip_text_required");
      if (!(await gate({ kind: "confirm", label: x.def.label, actionId: cmd.actionId }))) return cancelled();
      raHighlight(x.el, text, ctx.operator, 12_000);
      return done(mustConfirm);
    }
    case "page.scroll_to": {
      const x = need();
      if (!(await gate({ kind: "confirm", label: x.def.label, actionId: cmd.actionId }))) return cancelled();
      x.el.scrollIntoView({ block: "center", behavior: "smooth" });
      return done(mustConfirm);
    }
    case "element.focus": {
      const x = need();
      const target = x.field ?? x.el;
      if (!(await gate({ kind: "confirm", label: x.def.label, actionId: cmd.actionId }))) return cancelled();
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.focus({ preventScroll: true });
      raHighlight(x.el, "", ctx.operator, 1800);
      return done(mustConfirm);
    }
    case "form.set_value":
    case "form.select_option": {
      const x = need();
      const value = valueOf(p);
      if (value === null || value.length > MAX_VALUE) return reject("invalid_value");
      if (!(await gate({ kind: "draft", label: x.def.label, rows: [{ label: x.def.label, value }] }))) return cancelled();
      if (cmd.actionId === "form.select_option") raSelectOption(x, value);
      else raSetValue(x, value);
      raHighlight(x.el, "", ctx.operator, 1800);
      return done(mustConfirm, { valid: raFieldValid(x) });
    }
    case "form.toggle": {
      const x = need();
      const want = typeof p.value === "boolean" ? p.value : undefined;
      if (!(await gate({ kind: "confirm", label: x.def.label, actionId: cmd.actionId }))) return cancelled();
      raToggle(x, want);
      raHighlight(x.el, "", ctx.operator, 1800);
      return done(mustConfirm);
    }
    case "modal.open": {
      const x = need();
      if (!(await gate({ kind: "confirm", label: x.def.label, actionId: cmd.actionId }))) return cancelled();
      if (!(await raOpenModal(x.def.componentId))) return reject("modal_not_opened");
      return done(mustConfirm);
    }
    case "step.next":
    case "step.back": {
      const x = need();
      if (!(await gate({ kind: "confirm", label: x.def.label, actionId: cmd.actionId }))) return cancelled();
      // The wizard's own button: its handler runs the step's validation.
      x.el.click();
      return done(mustConfirm);
    }
    case "editor.open": {
      const x = need();
      if (!(await gate({ kind: "confirm", label: x.def.label, actionId: cmd.actionId }))) return cancelled();
      if (x.kind === "editor") (x.field ?? x.el).focus({ preventScroll: false });
      else x.el.click();
      return done(mustConfirm);
    }
    case "editor.highlight": {
      const x = need();
      if (!(await gate({ kind: "confirm", label: x.def.label, actionId: cmd.actionId }))) return cancelled();
      raHighlight(x.el, textOf(p), ctx.operator);
      return done(mustConfirm);
    }
    case "draft.prepare": {
      // One field ({value}) or several ({values: {component_id: value}}),
      // shown to the client and applied only after they confirm.
      const entries: [RaLive, string][] = [];
      const many = p.values && typeof p.values === "object" ? (p.values as Dict) : null;
      if (many) {
        for (const [id, raw] of Object.entries(many).slice(0, 20)) {
          const target = list.find((l) => l.def.componentId === id);
          const v = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : null;
          if (!target || v === null || v.length > MAX_VALUE) return reject("invalid_draft");
          if (!target.def.actions.includes("form.set_value") && !target.def.actions.includes("form.select_option")) return reject("action_not_permitted");
          if (target.def.sensitivity === "personal" && !ctx.grantedScopes.includes(RA_PERSONAL_SCOPE)) return reject("personal_scope_required");
          entries.push([target, v]);
        }
      } else {
        const x = need();
        const v = valueOf(p);
        if (v === null || v.length > MAX_VALUE) return reject("invalid_value");
        entries.push([x, v]);
      }
      if (!entries.length) return reject("invalid_draft");
      if (!(await ask(ctx, { kind: "draft", label: live?.def.label ?? entries[0][0].def.label, rows: entries.map(([l, v]) => ({ label: l.def.label, value: v })) }))) return cancelled();
      for (const [l, v] of entries) {
        if (l.def.actions.includes("form.select_option")) raSelectOption(l, v);
        else raSetValue(l, v);
      }
      raHighlight(entries[0][0].el, "", ctx.operator, 2000);
      return done(true, { fields: entries.length });
    }
    case "confirmation.present": {
      // The final step stays the client's: confirming only points them at
      // the button — the operator's command never presses it.
      const x = need();
      if (!(await ask(ctx, { kind: "present", label: x.def.label, summary: textOf(p) }))) return cancelled();
      raHighlight(x.el, "", ctx.operator, 15_000);
      (x.field ?? x.el).focus({ preventScroll: true });
      return done(true, { presented: true });
    }
    default:
      raClearHighlight();
      return reject("unsupported_action");
  }
}
