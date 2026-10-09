// Task-level realtime for Internal HRM. The general user socket covers broad
// notifications; this channel is needed for task comments and status changes
// while an operator is viewing a specific task.
import { getToken } from "./client";
import { backoffMs, backendOrigin } from "./http";

export type InternalEvent = { event: string } & Record<string, unknown>;
type Handler = (event: InternalEvent) => void;

type ChannelState = {
  channel: string;
  handlers: Set<Handler>;
  socket: WebSocket | null;
  retry: number;
  timer?: ReturnType<typeof setTimeout>;
  ping?: ReturnType<typeof setInterval>;
  closed: boolean;
};

const channels = new Map<string, ChannelState>();

function url(channel: string, token: string): string {
  return `${backendOrigin("ws")}/internal/ws/${encodeURIComponent(channel)}?token=${encodeURIComponent(token)}`;
}

function stop(state: ChannelState): void {
  state.closed = true;
  if (state.timer) clearTimeout(state.timer);
  if (state.ping) clearInterval(state.ping);
  state.timer = undefined;
  state.ping = undefined;
  const socket = state.socket;
  state.socket = null;
  if (socket) socket.close();
}

function schedule(state: ChannelState): void {
  if (state.closed || !state.handlers.size || state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = undefined;
    state.retry = Math.min(state.retry + 1, 8);
    open(state);
  }, backoffMs(state.retry));
}

function open(state: ChannelState): void {
  if (typeof window === "undefined" || state.closed || !state.handlers.size) return;
  if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) return;
  const token = getToken();
  if (!token) {
    schedule(state);
    return;
  }

  let socket: WebSocket;
  try {
    socket = new WebSocket(url(state.channel, token));
  } catch {
    schedule(state);
    return;
  }
  state.socket = socket;
  socket.onopen = () => {
    if (state.socket !== socket) return;
    state.retry = 0;
    if (state.ping) clearInterval(state.ping);
    state.ping = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event: "ping" }));
    }, 25_000);
  };
  socket.onmessage = (message) => {
    let value: unknown;
    try { value = JSON.parse(String(message.data)); } catch { return; }
    if (!value || typeof value !== "object") return;
    const event = value as InternalEvent;
    if (event.event === "pong" || typeof event.event !== "string") return;
    for (const handler of state.handlers) {
      try { handler(event); } catch { /* one subscriber must not break the channel */ }
    }
  };
  socket.onclose = () => {
    if (state.socket !== socket) return;
    state.socket = null;
    if (state.ping) clearInterval(state.ping);
    state.ping = undefined;
    schedule(state);
  };
  socket.onerror = () => { /* onclose schedules reconnect */ };
}

export function subscribeInternalEvents(channel: string, handler: Handler): () => void {
  const key = channel.trim();
  if (!key || typeof window === "undefined") return () => undefined;
  let state = channels.get(key);
  if (!state) {
    state = { channel: key, handlers: new Set(), socket: null, retry: 0, closed: false };
    channels.set(key, state);
  }
  state.closed = false;
  state.handlers.add(handler);
  open(state);
  return () => {
    const current = channels.get(key);
    if (!current) return;
    current.handlers.delete(handler);
    if (!current.handlers.size) {
      stop(current);
      channels.delete(key);
    }
  };
}
