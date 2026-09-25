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
// Called once after every RE-connect (never after the first connect, which
// the caller's own initial load already covered).
const syncHandlers = new Set<() => void>();
let everConnected = false;

export function userSocketUrl(tok: string): string {
  return `${backendOrigin("ws")}/ws/users/me?token=${encodeURIComponent(tok)}`;
}
function setState(s: State) {
  state = s;
  for (const h of stateHandlers) h(s);
}
export const userSocketState = () => state;

// LEXGO_REALTIME_NOTIFICATIONS_CALLS_FRONTEND.md spells the ladder out:
// 1s, 2s, 5s, 10s, then 30s for every attempt after that. Jitter keeps a
// server restart from bringing every open tab back in the same millisecond.
const RETRY_LADDER = [1000, 2000, 5000, 10_000, 30_000];
function backoffMs(n: number): number {
  return RETRY_LADDER[Math.min(n, RETRY_LADDER.length - 1)] + Math.random() * 500;
}
// The socket is idle most of the time and anything in the path (a proxy, a
// phone radio) will drop a silent connection. The documented keepalive is a
// plain {"event":"ping"} answered with {"event":"pong"}.
const PING_MS = 25_000;
let ping: ReturnType<typeof setInterval> | undefined;
function startPing(sock: WebSocket) {
  clearInterval(ping);
  ping = setInterval(() => {
    if (sock.readyState !== WebSocket.OPEN) return;
    try { sock.send(JSON.stringify({ event: "ping" })); } catch { /* onclose reconnects */ }
  }, PING_MS);
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
    const reconnected = everConnected;
    everConnected = true;
    retry = 0;
    startPing(sock);
    setState("online");
    // One-shot state sync after a drop: the events missed while offline are
    // gone, so the authoritative counts are re-read once here rather than by
    // any interval (see the MD — "Interval polling qaytadan yoqilmaydi").
    if (reconnected) for (const h of syncHandlers) { try { h(); } catch { /* keep the rest */ } }
  };
  sock.onmessage = (e) => {
    let o: unknown;
    try { o = JSON.parse(String(e.data)); } catch { return; }
    if (!o || typeof o !== "object") return;
    const ev = o as UserEvent;
    if (typeof ev.event !== "string") return;
    if (ev.event === "pong") return; // keepalive answer, not an app event
    for (const h of handlers) {
      try { h(ev); } catch { /* one bad handler must not break the rest */ }
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    clearInterval(ping);
    setState("offline");
    if (token) schedule();
  };
  sock.onerror = () => { /* onclose follows */ };
}
function schedule() {
  clearTimeout(timer);
  if (!token) return;
  timer = setTimeout(() => { retry = Math.min(retry + 1, RETRY_LADDER.length - 1); open(); }, backoffMs(retry));
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
  clearInterval(ping);
  everConnected = false;
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
// Run once every time the socket comes back after a drop — the place for the
// single /notifications/unread-count + /calls/invited re-sync the MD asks for.
export function onUserSocketResync(h: () => void): () => void {
  syncHandlers.add(h);
  return () => { syncHandlers.delete(h); };
}

// Reconnect promptly when the tab comes back / network returns.
if (typeof window !== "undefined") {
  const kick = () => { if (token && !ws && document.visibilityState === "visible") { clearTimeout(timer); retry = 0; open(); } };
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("online", kick);
}
