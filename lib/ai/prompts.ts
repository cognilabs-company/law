import type { ActionPreview } from "./types";

export type ActionView = {
  key: string;
  commandId: string;
  action: string;
  generic: boolean;
  text: string;
  preview: ActionPreview | null;
  free: boolean;
  busy: boolean;
  error: unknown;
  note: "" | "expired";
  pay: string;
  done: boolean;
};

export type ActionHandlers = {
  confirm: () => Promise<{ pay?: string } | void>;
  refresh?: () => Promise<ActionPreview | null>;
  isExpired?: (e: unknown) => boolean;
};

export type FillRow = { aiId: string; label: string; value: string };

export type FillView = { key: string; commandId: string; rows: FillRow[] };

export type PromptSnapshot = { action: ActionView | null; fill: FillView | null };

type ActionSlot = { view: ActionView; handlers: ActionHandlers; resolve: (ok: boolean) => void; refreshed: boolean };
type FillSlot = { view: FillView; resolve: (ok: boolean) => void };

let actionSlot: ActionSlot | null = null;
let fillSlot: FillSlot | null = null;
let snap: PromptSnapshot = { action: null, fill: null };
const listeners = new Set<() => void>();

const EMPTY: PromptSnapshot = { action: null, fill: null };

function emit(): void {
  snap = { action: actionSlot?.view ?? null, fill: fillSlot?.view ?? null };
  listeners.forEach((fn) => fn());
}

export function subscribePrompts(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function promptSnapshot(): PromptSnapshot {
  return snap;
}

export function promptServerSnapshot(): PromptSnapshot {
  return EMPTY;
}

function patchAction(slot: ActionSlot, next: Partial<ActionView>): void {
  if (actionSlot !== slot) return;
  slot.view = { ...slot.view, ...next };
  emit();
}

export function freeAction(action: string, preview: ActionPreview | null): boolean {
  return Boolean(preview && (preview.amount === 0 || (action === "start_support_ticket" && preview.amount === null)));
}

let seq = 0;

export function askAction(view: Omit<ActionView, "key" | "busy" | "error" | "note" | "pay" | "done">, handlers: ActionHandlers): Promise<boolean> {
  const prev = actionSlot;
  if (prev) {
    actionSlot = null;
    if (!prev.view.done) prev.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    actionSlot = { view: { ...view, key: `a${++seq}`, busy: false, error: null, note: "", pay: "", done: false }, handlers, resolve, refreshed: false };
    emit();
  });
}

async function refreshInto(slot: ActionSlot): Promise<void> {
  const fn = slot.handlers.refresh;
  if (!fn) return;
  try {
    const p = await fn();
    const preview = p ?? slot.view.preview;
    slot.refreshed = true;
    patchAction(slot, { busy: false, preview, free: preview ? freeAction(slot.view.action, preview) : slot.view.free, note: "expired" });
  } catch (e) {
    patchAction(slot, { busy: false, error: e });
  }
}

export async function confirmPrompt(trusted: boolean): Promise<void> {
  const slot = actionSlot;
  if (!slot || !trusted || slot.view.busy || slot.view.done) return;
  if (slot.view.preview && !slot.view.preview.canExecute) return;
  const exp = slot.view.preview?.expiresAt ?? 0;
  if (exp && Date.now() > exp && slot.handlers.refresh && !slot.refreshed) {
    patchAction(slot, { busy: true, error: null });
    await refreshInto(slot);
    return;
  }
  patchAction(slot, { busy: true, error: null, note: "" });
  try {
    const r = await slot.handlers.confirm();
    if (actionSlot !== slot) return;
    const pay = r && r.pay ? r.pay : "";
    if (pay) {
      patchAction(slot, { busy: false, done: true, pay });
      slot.resolve(true);
      return;
    }
    actionSlot = null;
    emit();
    slot.resolve(true);
  } catch (e) {
    if (actionSlot !== slot) return;
    if (slot.handlers.isExpired?.(e) && slot.handlers.refresh) {
      await refreshInto(slot);
      return;
    }
    patchAction(slot, { busy: false, error: e });
  }
}

export function cancelPrompt(): void {
  const slot = actionSlot;
  if (!slot || slot.view.busy) return;
  actionSlot = null;
  emit();
  if (!slot.view.done) slot.resolve(false);
}

export function askFill(view: Omit<FillView, "key">): Promise<boolean> {
  const prev = fillSlot;
  if (prev) {
    fillSlot = null;
    prev.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    fillSlot = { view: { ...view, key: `f${++seq}` }, resolve };
    emit();
  });
}

export function answerFill(ok: boolean): void {
  const slot = fillSlot;
  if (!slot) return;
  fillSlot = null;
  emit();
  slot.resolve(ok);
}

export function dismissPrompts(): void {
  const a = actionSlot;
  const f = fillSlot;
  actionSlot = null;
  fillSlot = null;
  if (a || f) emit();
  if (a && !a.view.done) a.resolve(false);
  f?.resolve(false);
}
