import { asDict, asStr, type Dict } from "@/lib/http";
import { subscribeUserEvents, type UserEvent } from "@/lib/userSocket";

export type AiRealtimeKind = "response" | "runtime_updated" | "event";

export type AiRealtimeEvent = { kind: AiRealtimeKind; sessionId: string; responseId: string; data: Dict };

const KINDS: Record<string, AiRealtimeKind> = {
  "ai_instructor.response": "response",
  "ai_instructor.runtime_updated": "runtime_updated",
  "ai_instructor.event": "event",
};

const SEEN_MAX = 200;
const seen: string[] = [];
const listeners = new Set<(e: AiRealtimeEvent) => void>();

export function normAiRealtime(e: UserEvent | Dict): AiRealtimeEvent | null {
  let name = asStr(e.event);
  let src: Dict = e;
  if (name === "notification.created") {
    const n = asDict(e.notification);
    const nd = asDict(n.data ?? n.meta);
    name = asStr(nd.event ?? n.kind);
    src = nd;
  }
  const kind = KINDS[name];
  if (!kind) return null;
  const inner = src.data && typeof src.data === "object" && !Array.isArray(src.data) ? (src.data as Dict) : src.payload && typeof src.payload === "object" && !Array.isArray(src.payload) ? (src.payload as Dict) : src;
  const sessionId = asStr(src.session_id ?? inner.session_id).trim();
  const responseId = asStr(src.response_id ?? inner.response_id ?? inner.message_id ?? inner.id).trim();
  return { kind, sessionId, responseId, data: inner };
}

export function markAiSeen(key: string): void {
  if (!key || seen.includes(key)) return;
  seen.push(key);
  if (seen.length > SEEN_MAX) seen.splice(0, seen.length - SEEN_MAX);
}

export function aiSeen(key: string): boolean {
  return Boolean(key) && seen.includes(key);
}

export function onAiRealtime(fn: (e: AiRealtimeEvent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function startAiRealtime(currentSession: () => string): () => void {
  return subscribeUserEvents((raw) => {
    const ev = normAiRealtime(raw);
    if (!ev) return;
    const sid = currentSession();
    if (!sid || ev.sessionId !== sid) return;
    const key = ev.responseId ? `${ev.kind}:${ev.responseId}` : "";
    if (key && aiSeen(key)) return;
    markAiSeen(key);
    listeners.forEach((fn) => {
      try {
        fn(ev);
      } catch {
        return;
      }
    });
  });
}
