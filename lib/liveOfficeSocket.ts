// Live Office realtime (guide §9): one socket per tab at
// /internal/live-office/ws?token=…, shared by every subscriber. Reconnects with
// exponential backoff; after a reconnect each subscriber is told once so it can
// re-read the board instead of trusting a state that missed events.
import { getToken } from "./client";
import { asDict, asStr, backoffMs, backendOrigin } from "./http";

export type LiveEvent = { event: string; data: Record<string, unknown>; raw: Record<string, unknown> };
type Sub = { onEvent: (e: LiveEvent) => void; onResync?: () => void };

const subs = new Set<Sub>();
let socket: WebSocket | null = null;
let retry = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let ping: ReturnType<typeof setInterval> | undefined;
let everOpened = false;

// Frames come as {event, data} or {type, payload}; the payload may also sit
// flat on the frame.
function parse(value: unknown): LiveEvent | null {
  const d = asDict(value);
  const event = asStr(d.event ?? d.type ?? d.name);
  if (!event || event === "pong" || event === "ping") return null;
  const inner = asDict(d.data ?? d.payload ?? d.body);
  return { event, data: Object.keys(inner).length ? inner : d, raw: d };
}

function close(): void {
  if (timer) clearTimeout(timer);
  if (ping) clearInterval(ping);
  timer = undefined;
  ping = undefined;
  const s = socket;
  socket = null;
  if (s) s.close();
}

function schedule(): void {
  if (!subs.size || timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    retry = Math.min(retry + 1, 8);
    open();
  }, backoffMs(retry));
}

function open(): void {
  if (typeof window === "undefined" || !subs.size) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const token = getToken();
  if (!token) {
    schedule();
    return;
  }
  let s: WebSocket;
  try {
    s = new WebSocket(`${backendOrigin("ws")}/internal/live-office/ws?token=${encodeURIComponent(token)}`);
  } catch {
    schedule();
    return;
  }
  socket = s;
  s.onopen = () => {
    if (socket !== s) return;
    retry = 0;
    if (ping) clearInterval(ping);
    ping = setInterval(() => {
      if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ event: "ping" }));
    }, 25_000);
    if (everOpened) for (const sub of subs) sub.onResync?.();
    everOpened = true;
  };
  s.onmessage = (m) => {
    let value: unknown;
    try {
      value = JSON.parse(String(m.data));
    } catch {
      return;
    }
    const e = parse(value);
    if (!e) return;
    for (const sub of subs) {
      try {
        sub.onEvent(e);
      } catch {
        /* one subscriber must not break the others */
      }
    }
  };
  s.onclose = () => {
    if (socket !== s) return;
    socket = null;
    if (ping) clearInterval(ping);
    ping = undefined;
    schedule();
  };
  s.onerror = () => {
    /* onclose schedules the reconnect */
  };
}

export function subscribeLiveOffice(onEvent: (e: LiveEvent) => void, onResync?: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const sub: Sub = { onEvent, onResync };
  subs.add(sub);
  open();
  return () => {
    subs.delete(sub);
    if (!subs.size) {
      close();
      everOpened = false;
      retry = 0;
    }
  };
}
