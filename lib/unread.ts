// Unread-notification count, shared by every surface that shows it.
//
// LEXGO_REALTIME_NOTIFICATIONS_CALLS_FRONTEND.md: the badge must not poll.
// `notifications.unread_count`, `notification.created`, `notification.read`
// and `notifications.read_all` all carry the authoritative number on the user
// socket, so the count lives here and REST is touched exactly three times —
// on the first mount, after a socket reconnect, and when the panel marks
// something read locally (which the server echoes back anyway, but the UI
// should not wait a round trip to feel right).
import { getUnreadCount } from "./services/backend";
import { subscribeUserEvents, onUserSocketResync, type UserEvent } from "./userSocket";

let count = 0;
let started = false;
let stopSocket: (() => void) | undefined;
let stopResync: (() => void) | undefined;
const listeners = new Set<(n: number) => void>();

export const unreadCount = () => count;

function publish(n: number) {
  const v = Math.max(0, Math.round(n));
  if (v === count) return;
  count = v;
  for (const l of listeners) {
    try { l(v); } catch { /* one bad listener must not break the rest */ }
  }
}

// The server's number always wins; `fromServer` exists only so an optimistic
// local decrement can be distinguished in one place if that ever matters.
export function setUnreadCount(n: number): void {
  publish(n);
}
export function bumpUnread(delta: number): void {
  publish(count + delta);
}

async function sync(): Promise<void> {
  try { publish(await getUnreadCount()); } catch { /* keep whatever we have */ }
}

function onEvent(e: UserEvent) {
  const d = e as Record<string, unknown>;
  // Every one of these events carries the fresh total, so none of them needs
  // arithmetic on our side — except `notification.created`, which some
  // backends send without a count.
  if (e.event === "notifications.unread_count") {
    const n = Number(d.count ?? d.unread_count);
    if (Number.isFinite(n)) publish(n);
    return;
  }
  if (e.event === "notification.created") {
    const n = Number(d.unread_count);
    if (Number.isFinite(n)) publish(n);
    else bumpUnread(1);
    return;
  }
  if (e.event === "notification.read" || e.event === "notifications.read_all") {
    const n = Number(d.unread_count);
    if (Number.isFinite(n)) publish(n);
    else if (e.event === "notifications.read_all") publish(0);
    else bumpUnread(-1);
  }
}

// Subscribing is what starts it: the first listener wires the socket and does
// the one initial REST read; the last one to leave tears it down.
export function subscribeUnread(l: (n: number) => void): () => void {
  listeners.add(l);
  if (!started) {
    started = true;
    stopSocket = subscribeUserEvents(onEvent);
    stopResync = onUserSocketResync(() => void sync());
    void sync();
  } else {
    l(count);
  }
  return () => {
    listeners.delete(l);
    if (listeners.size) return;
    started = false;
    stopSocket?.();
    stopResync?.();
    stopSocket = undefined;
    stopResync = undefined;
  };
}

// The notifications page marks things read over REST; the socket echo will
// confirm it, but the badge should drop the moment the user acts.
export function refreshUnread(): void {
  void sync();
}
