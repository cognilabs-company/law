export type AiScope = { owner: string; role: string };

type Stored = { sid: string; done: string[] };

const PREFIX = "lexgo_ai_sid_";
const DONE_MAX = 200;

let active: AiScope | null = null;
const memory = new Map<string, Stored>();
const listeners = new Set<() => void>();

const keyOf = (s: AiScope) => `${PREFIX}${s.owner}:${s.role}`;

function notify(): void {
  listeners.forEach((fn) => fn());
}

function read(s: AiScope): Stored {
  const key = keyOf(s);
  const hit = memory.get(key);
  if (hit) return hit;
  let v: Stored = { sid: "", done: [] };
  try {
    const raw = sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      const d = parsed as { sid?: unknown; done?: unknown };
      v = {
        sid: typeof d.sid === "string" ? d.sid : "",
        done: Array.isArray(d.done) ? d.done.filter((x): x is string => typeof x === "string").slice(-DONE_MAX) : [],
      };
    }
  } catch {
    v = { sid: "", done: [] };
  }
  memory.set(key, v);
  return v;
}

function write(s: AiScope, v: Stored): void {
  const key = keyOf(s);
  memory.set(key, v);
  try {
    if (!v.sid && !v.done.length) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    return;
  }
}

export function setAiScope(s: AiScope | null): void {
  const same = active && s && active.owner === s.owner && active.role === s.role;
  if (same || (!active && !s)) return;
  active = s && s.owner ? { ...s } : null;
  notify();
}

export function getAiScope(): AiScope | null {
  return active;
}

export function aiSessionId(s: AiScope | null = active): string {
  return s && s.owner ? read(s).sid : "";
}

export function setAiSessionId(s: AiScope, sid: string): void {
  if (!s.owner || !sid) return;
  const cur = read(s);
  if (cur.sid === sid) return;
  write(s, { sid, done: cur.sid ? [] : cur.done });
  notify();
}

export function resetAiSession(s: AiScope | null = active): void {
  if (!s || !s.owner) return;
  write(s, { sid: "", done: [] });
  notify();
}

export function dropAiSessions(owner?: string): void {
  for (const key of [...memory.keys()]) if (!owner || key.startsWith(`${PREFIX}${owner}:`)) memory.delete(key);
  try {
    const doomed: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i) || "";
      if (k.startsWith(PREFIX) && (!owner || k.startsWith(`${PREFIX}${owner}:`))) doomed.push(k);
    }
    doomed.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    return;
  } finally {
    notify();
  }
}

export function wasExecuted(id: string, s: AiScope | null = active): boolean {
  return Boolean(s && s.owner && id && read(s).done.includes(id));
}

export function markExecuted(id: string, s: AiScope | null = active): void {
  if (!s || !s.owner || !id) return;
  const cur = read(s);
  if (cur.done.includes(id)) return;
  write(s, { sid: cur.sid, done: [...cur.done, id].slice(-DONE_MAX) });
}

export function subscribeAiSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
