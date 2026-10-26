import { useSyncExternalStore } from "react";

// Tiny shared state for remote assistance, kept free of heavy imports so the
// root layout and the support chat can use it:
//  • the operator console (which ticket/call it helps, its session, open or
//    folded) — kept in sessionStorage so it survives the jump to the call page
//    and a reload;
//  • the support calls an operator started per ticket (the request needs the
//    call id);
//  • the client's active session id, its last published UI revision and the
//    ids of commands already handled (ids only, never payloads), so a reload
//    picks the session back up without replaying a command.

export type RaConsoleState = {
  ticketId: string;
  callId: string;
  clientName: string;
  workId: string;
  sessionId: string;
  open: boolean;
};

const CONSOLE_KEY = "lexgo_ra_console";
const CALLS_KEY = "lexgo_ra_calls";
const ACTIVE_KEY = "lexgo_ra_active";
const REV_KEY = "lexgo_ra_rev";
const DONE_KEY = "lexgo_ra_done";

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown): void {
  try {
    if (v == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode: memory only */
  }
}

let consoleState: RaConsoleState | null | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function current(): RaConsoleState | null {
  if (consoleState === undefined) consoleState = read<RaConsoleState>(CONSOLE_KEY);
  return consoleState;
}
function set(next: RaConsoleState | null): void {
  consoleState = next;
  write(CONSOLE_KEY, next);
  emit();
}

export function openRaConsole(input: { ticketId: string; callId?: string; clientName?: string; workId?: string }, open = true): void {
  const cur = current();
  const same = cur && cur.ticketId === input.ticketId;
  const callId = input.callId || (same ? cur.callId : "") || supportCallFor(input.ticketId);
  set({
    ticketId: input.ticketId,
    callId,
    clientName: input.clientName || (same ? cur.clientName : ""),
    workId: input.workId || (same ? cur.workId : ""),
    // A new call means a new session; the same call keeps the running one.
    sessionId: same && cur.callId === callId ? cur.sessionId : "",
    open: open || Boolean(same && cur.open),
  });
}

export function patchRaConsole(patch: Partial<RaConsoleState>): void {
  const cur = current();
  if (cur) set({ ...cur, ...patch });
}

export function closeRaConsole(): void {
  set(null);
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useRaConsole(): RaConsoleState | null {
  return useSyncExternalStore(subscribe, current, () => null);
}

// ---- support calls per ticket ----

type Calls = Record<string, { callId: string; at: number }>;

export function rememberSupportCall(ticketId: string, callId: string): void {
  if (!ticketId || !callId) return;
  const calls = read<Calls>(CALLS_KEY) ?? {};
  calls[ticketId] = { callId, at: Date.now() };
  // Only the latest few tickets matter.
  const keep = Object.entries(calls)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 20);
  write(CALLS_KEY, Object.fromEntries(keep));
  const cur = current();
  if (cur && cur.ticketId === ticketId && cur.callId !== callId) set({ ...cur, callId, sessionId: "" });
  else emit();
}

export function forgetSupportCall(ticketId: string, callId = ""): void {
  const calls = read<Calls>(CALLS_KEY) ?? {};
  if (!calls[ticketId] || (callId && calls[ticketId].callId !== callId)) return;
  delete calls[ticketId];
  write(CALLS_KEY, calls);
  const cur = current();
  if (cur && cur.ticketId === ticketId && (!callId || cur.callId === callId)) set({ ...cur, callId: "" });
  else emit();
}

// The live support call remembered for a ticket ("" when none), reactive.
export function useRaSupportCall(ticketId: string): string {
  return useSyncExternalStore(
    subscribe,
    () => supportCallFor(ticketId),
    () => "",
  );
}

export function supportCallFor(ticketId: string): string {
  return read<Calls>(CALLS_KEY)?.[ticketId]?.callId ?? "";
}

// ---- the client's active session ----

export function rememberActiveRa(id: string): void {
  write(ACTIVE_KEY, id || null);
  if (!id) {
    write(REV_KEY, null);
    write(DONE_KEY, null);
  }
}
export function activeRaId(): string {
  return read<string>(ACTIVE_KEY) ?? "";
}

// Monotonic per session, across reloads of this tab.
export function nextRaRevision(sessionId: string, atLeast = 0): number {
  const cur = read<{ id: string; rev: number }>(REV_KEY);
  const base = cur && cur.id === sessionId ? cur.rev : 0;
  const rev = Math.max(base, atLeast) + 1;
  write(REV_KEY, { id: sessionId, rev });
  return rev;
}

export function raHandled(sessionId: string): Set<string> {
  const cur = read<{ id: string; ids: string[] }>(DONE_KEY);
  return new Set(cur && cur.id === sessionId ? cur.ids : []);
}

export function markRaHandled(sessionId: string, commandId: string): void {
  const ids = [...raHandled(sessionId), commandId].slice(-200);
  write(DONE_KEY, { id: sessionId, ids });
}
