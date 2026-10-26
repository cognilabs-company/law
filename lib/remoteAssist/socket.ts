// One remote-assistance socket per session (contract §12):
// wss://<backend>/ws/remote-assistance/{session_id}?token=… — the browser
// can't set headers, so the token rides the query and the URL is never
// logged. Pings every 25 s, reconnects with backoff, and tells the owner after
// a reconnect so it can re-read the session and publish a higher revision.
import { getToken } from "@/lib/client";
import { asDict, asStr, backoffMs, backendOrigin, type Dict } from "@/lib/http";

export type RaSocketEvent = { event: string; data: Dict; raw: Dict };

export type RaSocket = {
  // false when the socket is not open — the caller falls back to REST.
  send: (event: string, payload?: Dict) => boolean;
  isOpen: () => boolean;
  close: () => void;
};

const PING_MS = 25_000;

export function parseRaFrame(text: string): RaSocketEvent | null {
  let raw: Dict;
  try {
    raw = asDict(JSON.parse(text));
  } catch {
    return null;
  }
  const event = asStr(raw.event ?? raw.type);
  if (!event || event === "pong") return null;
  const inner = asDict(raw.payload ?? raw.data);
  return { event, data: Object.keys(inner).length ? inner : raw, raw };
}

export function openRaSocket(sessionId: string, on: { event: (e: RaSocketEvent) => void; reconnected?: () => void }): RaSocket {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let opened = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const schedule = () => {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      retry = Math.min(retry + 1, 8);
      connect();
    }, backoffMs(retry));
  };

  const connect = () => {
    if (closed || typeof window === "undefined") return;
    const token = getToken();
    if (!token) return schedule();
    let s: WebSocket;
    try {
      s = new WebSocket(`${backendOrigin("ws")}/ws/remote-assistance/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`);
    } catch {
      return schedule();
    }
    ws = s;
    s.onopen = () => {
      if (ws !== s) return;
      retry = 0;
      clearInterval(ping);
      ping = setInterval(() => {
        if (s.readyState === WebSocket.OPEN) s.send('{"event":"ping"}');
      }, PING_MS);
      if (opened) on.reconnected?.();
      opened = true;
    };
    s.onmessage = (m) => {
      const e = parseRaFrame(String(m.data));
      if (e) on.event(e);
    };
    s.onclose = () => {
      if (ws !== s) return;
      ws = null;
      clearInterval(ping);
      schedule();
    };
    s.onerror = () => {
      /* onclose reconnects */
    };
  };

  connect();

  return {
    send: (event, payload) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(JSON.stringify(payload ? { event, payload } : { event }));
        return true;
      } catch {
        return false;
      }
    },
    isOpen: () => Boolean(ws && ws.readyState === WebSocket.OPEN),
    close: () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(ping);
      const s = ws;
      ws = null;
      s?.close();
    },
  };
}
