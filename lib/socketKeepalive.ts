// The documented keepalive for /ws/users/me and /ws/secure-chats/{room_id}
// (2026-11-21 contract §7.1): send {"event":"ping"} every 25 seconds; the
// server answers {"event":"pong", …}. No pong within 10 seconds means the
// connection is dead even if the browser has not noticed — it is closed so
// the caller's own onclose reconnects.
export const PING_EVERY_MS = 25_000;
export const PONG_WAIT_MS = 10_000;

export type KeepAlive = { pong: () => void; stop: () => void };

export function keepAlive(sock: WebSocket, everyMs = PING_EVERY_MS, waitMs = PONG_WAIT_MS): KeepAlive {
  let wait: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearInterval(tick);
    clearTimeout(wait);
    wait = undefined;
  };
  const tick = setInterval(() => {
    // A socket closed by its owner (handlers cleared) stops its own timer.
    if (sock.readyState === WebSocket.CLOSING || sock.readyState === WebSocket.CLOSED) return stop();
    if (sock.readyState !== WebSocket.OPEN) return;
    try {
      sock.send(JSON.stringify({ event: "ping" }));
    } catch {
      return; // onclose reconnects
    }
    if (wait === undefined) {
      wait = setTimeout(() => {
        wait = undefined;
        try {
          sock.close(4000, "no pong");
        } catch {
          /* already closing */
        }
      }, waitMs);
    }
  }, everyMs);
  return {
    pong: () => {
      clearTimeout(wait);
      wait = undefined;
    },
    stop,
  };
}

export const isPong = (o: unknown): boolean => !!o && typeof o === "object" && (o as { event?: unknown }).event === "pong";
