// Global per-user realtime socket (LEXGO_CALL_WEBSOCKET_FRONTEND_UPDATE):
// wss://…/ws/users/me?token=… — one connection per tab, opened once a session
// exists, with exponential reconnect. Events (e.g. `call.incoming`) fan out to
// subscribers; call/meeting invites no longer need per-second polling.
import { backendOrigin } from "./http";

export type UserEvent = { event: string } & Record<string, unknown>;
type Handler = (e: UserEvent) => void;
type State = "offline" | "connecting" | "online";

let ws: WebSocket | null = null;
let token = "";
let retry = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let state: State = "offline";
const handlers = new Set<Handler>();
const stateHandlers = new Set<(s: State) => void>();

export function userSocketUrl(tok: string): string {
  return `${backendOrigin("ws")}/ws/users/me?token=${encodeURIComponent(tok)}`;
}
function setState(s: State) {
  state = s;
  for (const h of stateHandlers) h(s);
}
export const userSocketState = () => state;

function backoffMs(n: number): number {
  return Math.min(30_000, 1000 * 2 ** n) + Math.random() * 500;
}

function open() {
  if (!token || typeof window === "undefined") return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  setState("connecting");
  let sock: WebSocket;
  try {
    sock = new WebSocket(userSocketUrl(token));
  } catch {
    schedule();
    return;
  }
  ws = sock;
  sock.onopen = () => {
    if (ws !== sock) return;
    retry = 0;
    setState("online");
  };
  sock.onmessage = (e) => {
    let o: unknown;
    try { o = JSON.parse(String(e.data)); } catch { return; }
    if (!o || typeof o !== "object") return;
    const ev = o as UserEvent;
    if (typeof ev.event !== "string") return;
    for (const h of handlers) {
      try { h(ev); } catch { /* one bad handler must not break the rest */ }
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    setState("offline");
    if (token) schedule();
  };
  sock.onerror = () => { /* onclose follows */ };
}
function schedule() {
  clearTimeout(timer);
  if (!token) return;
  timer = setTimeout(() => { retry = Math.min(retry + 1, 8); open(); }, backoffMs(retry));
}

// Connect for this token (a new token replaces the connection).
export function connectUserSocket(tok: string): void {
  if (!tok) { disconnectUserSocket(); return; }
  if (tok === token && ws) return;
  token = tok;
  retry = 0;
  if (ws) { const old = ws; ws = null; old.close(); }
  open();
}
export function disconnectUserSocket(): void {
  token = "";
  clearTimeout(timer);
  if (ws) { const old = ws; ws = null; old.close(); }
  setState("offline");
}
export function subscribeUserEvents(h: Handler): () => void {
  handlers.add(h);
  return () => { handlers.delete(h); };
}
export function subscribeUserSocketState(h: (s: State) => void): () => void {
  stateHandlers.add(h);
  return () => { stateHandlers.delete(h); };
}

// Reconnect promptly when the tab comes back / network returns.
if (typeof window !== "undefined") {
  const kick = () => { if (token && !ws && document.visibilityState === "visible") { clearTimeout(timer); retry = 0; open(); } };
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("online", kick);
}
