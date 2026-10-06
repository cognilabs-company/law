import { asArr, asDict, asStr, type Dict } from "@/lib/http";
import { subscribeUserEvents, type UserEvent } from "@/lib/userSocket";

export type AiRealtimeKind = "response" | "runtime_updated" | "event";

export type AiRealtimeEvent = { kind: AiRealtimeKind; sessionId: string; responseId: string; key: string; data: Dict };

const KINDS: Record<string, AiRealtimeKind> = {
  "ai_instructor.response": "response",
  "ai_instructor.runtime_updated": "runtime_updated",
  "ai_instructor.event": "event",
};

const SEEN_MAX = 200;
const seen: string[] = [];
const listeners = new Set<(e: AiRealtimeEvent) => void>();

const isDict = (v: unknown): v is Dict => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}.${(h >>> 0).toString(36)}`;
}

export function aiResponseKey(responseId: string, rawCommands: unknown[], answer = ""): string {
  if (responseId) return `response:${responseId}`;
  const ids = rawCommands.map((c) => (isDict(c) ? asStr(c.id ?? c.command_id).trim() : "")).filter(Boolean);
  if (ids.length) return `response:cmds:${ids.join("|")}`;
  const text = answer.trim();
  return text ? `response:text:${hash(text)}` : "";
}

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
  const wrapped = isDict(src.data) ? src.data : isDict(src.payload) ? src.payload : src;
  const inner = kind === "response" && isDict(wrapped.response) ? wrapped.response : wrapped;
  const sessionId = asStr(src.session_id ?? wrapped.session_id ?? inner.session_id).trim();
  const responseId = asStr(src.response_id ?? inner.response_id ?? inner.message_id ?? inner.id).trim();
  const key =
    kind === "response"
      ? aiResponseKey(responseId, asArr(inner.commands ?? inner.actions), asStr(inner.answer ?? inner.reply))
      : responseId
        ? `${kind}:${responseId}`
        : "";
  return { kind, sessionId, responseId, key, data: inner };
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
    if (ev.key && aiSeen(ev.key)) return;
    markAiSeen(ev.key);
    listeners.forEach((fn) => {
      try {
        fn(ev);
      } catch {
        return;
      }
    });
  });
}
