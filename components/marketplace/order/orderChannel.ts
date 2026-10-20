"use client";

import { getToken } from "@/lib/client";
import { backendOrigin, backoffMs } from "@/lib/http";

export type OrderChannelEvent = { event: string } & Record<string, unknown>;
type Handler = (event: OrderChannelEvent) => void;

type Channel = {
  name: string;
  handlers: Set<Handler>;
  socket: WebSocket | null;
  retry: number;
  failures: number;
  timer?: ReturnType<typeof setTimeout>;
  ping?: ReturnType<typeof setInterval>;
  closed: boolean;
  refused: boolean;
};

export const ORDER_CHANNEL_MAX_FAILURES = 3;
const REFUSED_CODES = new Set([1003, 1008, 4001, 4003, 4004, 4401, 4403, 4404]);
const channels = new Map<string, Channel>();

export function orderChannelOf(name: string, orderId: string): string {
  const raw = (name || "").trim();
  const id = (orderId || "").trim();
  if (!raw || !id) return "";
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(raw)) return "";
  if (!raw.split(":").includes(id)) return "";
  return raw;
}

export function orderChannelUrl(name: string, token: string): string {
  return `${backendOrigin("ws")}/internal/ws/${encodeURIComponent(name)}?token=${encodeURIComponent(token)}`;
}

function halt(ch: Channel): void {
  ch.closed = true;
  if (ch.timer) clearTimeout(ch.timer);
  if (ch.ping) clearInterval(ch.ping);
  ch.timer = undefined;
  ch.ping = undefined;
  const s = ch.socket;
  ch.socket = null;
  if (s) {
    try {
      s.close();
    } catch {}
  }
}

function later(ch: Channel): void {
  if (ch.closed || ch.refused || !ch.handlers.size || ch.timer) return;
  if (ch.failures >= ORDER_CHANNEL_MAX_FAILURES) {
    ch.refused = true;
    return;
  }
  ch.timer = setTimeout(() => {
    ch.timer = undefined;
    ch.retry = Math.min(ch.retry + 1, 6);
    open(ch);
  }, backoffMs(ch.retry));
}

function refusedFrame(v: Record<string, unknown>): boolean {
  if (v.event !== "error") return false;
  const code = Number(v.status_code ?? v.status ?? v.code);
  return code === 401 || code === 403 || code === 404;
}

function open(ch: Channel): void {
  if (typeof window === "undefined" || typeof WebSocket === "undefined" || ch.closed || ch.refused || !ch.handlers.size) return;
  if (ch.socket && (ch.socket.readyState === WebSocket.OPEN || ch.socket.readyState === WebSocket.CONNECTING)) return;
  const token = getToken();
  if (!token) return;
  let socket: WebSocket;
  try {
    socket = new WebSocket(orderChannelUrl(ch.name, token));
  } catch {
    ch.failures += 1;
    later(ch);
    return;
  }
  ch.socket = socket;
  let opened = false;
  socket.onopen = () => {
    if (ch.socket !== socket) return;
    opened = true;
    if (ch.ping) clearInterval(ch.ping);
    ch.ping = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event: "ping" }));
    }, 25_000);
  };
  socket.onmessage = (m) => {
    let value: unknown;
    try {
      value = JSON.parse(String(m.data));
    } catch {
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const ev = value as Record<string, unknown>;
    if (refusedFrame(ev)) {
      ch.refused = true;
      return;
    }
    if (typeof ev.event !== "string" || ev.event === "pong") return;
    ch.failures = 0;
    ch.retry = 0;
    for (const h of ch.handlers) {
      try {
        h(ev as OrderChannelEvent);
      } catch {}
    }
  };
  socket.onclose = (e) => {
    if (ch.socket !== socket) return;
    ch.socket = null;
    if (ch.ping) clearInterval(ch.ping);
    ch.ping = undefined;
    if (REFUSED_CODES.has(e?.code ?? 0)) ch.refused = true;
    if (!opened) ch.failures += 1;
    later(ch);
  };
  socket.onerror = () => {};
}

export function subscribeOrderChannel(name: string, handler: Handler): () => void {
  const key = (name || "").trim();
  if (!key || typeof window === "undefined") return () => undefined;
  let ch = channels.get(key);
  if (!ch) {
    ch = { name: key, handlers: new Set(), socket: null, retry: 0, failures: 0, closed: false, refused: false };
    channels.set(key, ch);
  }
  ch.closed = false;
  ch.handlers.add(handler);
  open(ch);
  return () => {
    const cur = channels.get(key);
    if (!cur) return;
    cur.handlers.delete(handler);
    if (!cur.handlers.size) {
      halt(cur);
      if (!cur.refused) channels.delete(key);
    }
  };
}

export function orderChannelRefused(name: string): boolean {
  return channels.get((name || "").trim())?.refused === true;
}
