import { ApiError, isAborted } from "./http";

export type ToastTone = "info" | "ok" | "err";
export type ToastItem = { id: number; text: string; tone: ToastTone; ms: number };

export type NotifyTone = "success" | "info" | "warning" | "error" | "loading";
export type NotifyAction = { label: string; onClick?: () => void; href?: string };
export type NotifyOptions = {
  body?: string;
  action?: NotifyAction;
  duration?: number;
  id?: string;
  sticky?: boolean;
  error?: unknown;
  map?: Partial<Record<number, string>>;
};
export type NotifyContent = string | ({ title: string } & Omit<NotifyOptions, "id">);
export type NotifyPromiseMessages<T> = {
  loading: NotifyContent;
  success: NotifyContent | ((value: T) => NotifyContent);
  error: NotifyContent | ((error: unknown) => NotifyContent);
};
export type NotifyPatch = Omit<NotifyOptions, "id"> & { tone?: NotifyTone; title?: string };
export type NotifyExit = "up" | "left" | "right";
export type NotifyItem = {
  key: string;
  id: string;
  tone: NotifyTone;
  title: string;
  body: string;
  action?: NotifyAction;
  error?: unknown;
  map?: Partial<Record<number, string>>;
  duration: number;
  sticky: boolean;
  opts: Omit<NotifyOptions, "id">;
  rev: number;
  ver: number;
  leaving?: NotifyExit;
  slot: number;
};
export type NotifyLive = { key: string; ver: number } | null;
export type NotifyState = {
  items: NotifyItem[];
  queued: number;
  paused: boolean;
  polite: NotifyLive;
  assertive: NotifyLive;
};

type Opts = Omit<NotifyOptions, "id">;
type Timer = { handle: ReturnType<typeof setTimeout> | null; left: number; at: number };

const MAX_VISIBLE = 3;
const EXIT_MS = 240;
const MIN_MS = 1500;
const ACTION_MS = 8000;
const BASE_MS: Record<NotifyTone, number> = { success: 4000, info: 4000, warning: 6000, error: 8000, loading: 0 };
const EMPTY: NotifyState = { items: [], queued: 0, paused: false, polite: null, assertive: null };

let visible: NotifyItem[] = [];
let queue: NotifyItem[] = [];
let polite: NotifyLive = null;
let assertive: NotifyLive = null;
let state: NotifyState = EMPTY;
let idSeq = 0;
let keySeq = 0;
let verSeq = 0;
let legacySeq = 0;
const timers = new Map<string, Timer>();
const pauses = new Set<string>();
const listeners = new Set<() => void>();
const legacy = new Set<(t: ToastItem) => void>();

function emit(): void {
  state = { items: visible, queued: queue.length, paused: pauses.size > 0, polite, assertive };
  listeners.forEach((fn) => fn());
}

function timing(tone: NotifyTone, o: Opts): { duration: number; sticky: boolean } {
  const d = o.duration;
  if (o.sticky || tone === "loading" || d === Infinity) return { duration: 0, sticky: true };
  const base = typeof d === "number" && Number.isFinite(d) && d > 0 ? Math.max(MIN_MS, d) : BASE_MS[tone];
  return { duration: o.action ? Math.max(base, ACTION_MS) : base, sticky: false };
}

function build(tone: NotifyTone, title: string, o: Opts, id: string, key: string): NotifyItem {
  const { duration, sticky } = timing(tone, o);
  const ver = ++verSeq;
  return {
    key,
    id,
    tone,
    title,
    body: o.body ?? "",
    action: o.action,
    error: o.error,
    map: o.map,
    duration,
    sticky,
    opts: o,
    rev: ver,
    ver,
    slot: 0,
  };
}

function errSig(e: unknown): string {
  if (e === undefined || e === null) return "";
  if (e instanceof ApiError) return `${e.status}|${e.code ?? ""}|${e.detail ?? ""}`;
  if (e instanceof Error) return `${e.name}|${e.message}`;
  return String(e);
}

function sig(tone: NotifyTone, title: string, body: string, error: unknown): string {
  return `${tone}\n${title}\n${body}\n${errSig(error)}`;
}

function sigOf(it: NotifyItem): string {
  return sig(it.tone, it.title, it.body, it.error);
}

function activeItems(): NotifyItem[] {
  return visible.filter((x) => !x.leaving);
}

function stopTimer(key: string): void {
  const tm = timers.get(key);
  if (tm?.handle) clearTimeout(tm.handle);
  timers.delete(key);
}

function runTimer(key: string, tm: Timer): void {
  tm.at = Date.now();
  tm.handle = setTimeout(() => {
    timers.delete(key);
    const it = visible.find((x) => x.key === key && !x.leaving);
    if (!it) return;
    leave(it, "up", true);
    emit();
  }, tm.left);
}

function startTimer(it: NotifyItem): void {
  stopTimer(it.key);
  if (it.sticky) return;
  const tm: Timer = { handle: null, left: it.duration, at: 0 };
  timers.set(it.key, tm);
  if (!pauses.size) runTimer(it.key, tm);
}

function announce(it: NotifyItem): void {
  const live = { key: it.key, ver: it.ver };
  if (it.tone === "error") assertive = live;
  else polite = live;
}

function reveal(it: NotifyItem): void {
  visible = [it, ...visible];
  startTimer(it);
  announce(it);
}

function fill(): void {
  while (queue.length && activeItems().length < MAX_VISIBLE) {
    const [next, ...rest] = queue;
    queue = rest;
    reveal(next);
  }
}

function leave(it: NotifyItem, dir: NotifyExit, promote: boolean, at?: number): void {
  stopTimer(it.key);
  const slot = at ?? Math.max(0, activeItems().findIndex((x) => x.key === it.key));
  visible = visible.map((x) => (x.key === it.key ? { ...x, leaving: dir, slot } : x));
  setTimeout(() => {
    visible = visible.filter((x) => x.key !== it.key);
    emit();
  }, EXIT_MS);
  if (promote) fill();
}

function place(it: NotifyItem): void {
  const active = activeItems();
  if (active.length < MAX_VISIBLE) {
    reveal(it);
    return;
  }
  if (it.tone === "error") {
    const victim = [...active].reverse().find((x) => x.tone !== "error" && !x.sticky);
    if (victim) {
      leave(victim, "up", false);
      reveal(it);
      return;
    }
    let at = 0;
    while (at < queue.length && queue[at].tone === "error") at++;
    queue = [...queue.slice(0, at), it, ...queue.slice(at)];
    return;
  }
  queue = [...queue, it];
}

function restart(it: NotifyItem): void {
  const next = { ...it, rev: ++verSeq };
  visible = visible.map((x) => (x.key === it.key ? next : x));
  startTimer(next);
}

function legacyEmit(it: NotifyItem): void {
  if (!legacy.size) return;
  const tone: ToastTone = it.tone === "success" ? "ok" : it.tone === "error" ? "err" : "info";
  const item: ToastItem = { id: ++legacySeq, text: it.title, tone, ms: it.duration };
  legacy.forEach((fn) => fn(item));
}

function show(tone: NotifyTone, title: string, opts: NotifyOptions = {}): string {
  if (!title) return "";
  const { id: wanted, ...o } = opts;
  if (o.error !== undefined && isAborted(o.error)) return "";
  if (wanted) {
    const at = visible.findIndex((x) => x.id === wanted && !x.leaving);
    if (at >= 0) {
      const cur = visible[at];
      if (sigOf(cur) === sig(tone, title, o.body ?? "", o.error) && cur.action === o.action) restart(cur);
      else {
        const next = build(tone, title, o, wanted, cur.key);
        visible = visible.map((x, i) => (i === at ? next : x));
        startTimer(next);
        announce(next);
      }
      emit();
      return wanted;
    }
    const q = queue.findIndex((x) => x.id === wanted);
    if (q >= 0) {
      queue = queue.map((x, i) => (i === q ? build(tone, title, o, wanted, x.key) : x));
      emit();
      return wanted;
    }
  } else {
    const s = sig(tone, title, o.body ?? "", o.error);
    const dup = visible.find((x) => !x.leaving && sigOf(x) === s);
    if (dup) {
      restart(dup);
      emit();
      return dup.id;
    }
    const waiting = queue.find((x) => sigOf(x) === s);
    if (waiting) return waiting.id;
  }
  const it = build(tone, title, o, wanted || `n${++idSeq}`, `k${++keySeq}`);
  place(it);
  legacyEmit(it);
  emit();
  return it.id;
}

function exists(id: string): boolean {
  return visible.some((x) => x.id === id && !x.leaving) || queue.some((x) => x.id === id);
}

function update(id: string, patch: NotifyPatch): boolean {
  const at = visible.findIndex((x) => x.id === id && !x.leaving);
  const q = at < 0 ? queue.findIndex((x) => x.id === id) : -1;
  const cur = at >= 0 ? visible[at] : q >= 0 ? queue[q] : null;
  if (!cur) return false;
  const { tone, title, ...rest } = patch;
  const next = build(tone ?? cur.tone, title || cur.title, { ...cur.opts, ...rest }, cur.id, cur.key);
  if (at >= 0) {
    visible = visible.map((x, i) => (i === at ? next : x));
    startTimer(next);
    announce(next);
  } else {
    queue = queue.map((x, i) => (i === q ? next : x));
  }
  emit();
  return true;
}

function dismiss(id?: string): void {
  if (id === undefined) {
    queue = [];
    activeItems().forEach((x, i) => leave(x, "up", false, i));
  } else {
    queue = queue.filter((x) => x.id !== id);
    activeItems()
      .filter((x) => x.id === id)
      .forEach((x) => leave(x, "up", true));
  }
  emit();
}

function parts(c: NotifyContent): [string, Opts] {
  if (typeof c === "string") return [c, {}];
  const { title, ...o } = c;
  return [title, o];
}

function promise<T>(p: Promise<T>, msgs: NotifyPromiseMessages<T>, opts: { id?: string } = {}): Promise<T> {
  const id = opts.id || `p${++idSeq}`;
  const [loadTitle, loadOpts] = parts(msgs.loading);
  show("loading", loadTitle, { ...loadOpts, id });
  p.then(
    (value) => {
      if (!exists(id)) return;
      const [title, o] = parts(typeof msgs.success === "function" ? msgs.success(value) : msgs.success);
      if (!title) {
        dismiss(id);
        return;
      }
      show("success", title, { ...o, id });
    },
    (error: unknown) => {
      if (isAborted(error)) {
        dismiss(id);
        return;
      }
      const [title, o] = parts(typeof msgs.error === "function" ? msgs.error(error) : msgs.error);
      if (!title) {
        dismiss(id);
        return;
      }
      show("error", title, { error, ...o, id });
    },
  );
  return p;
}

function pause(reason: string, on: boolean): void {
  const was = pauses.size > 0;
  if (on) pauses.add(reason);
  else pauses.delete(reason);
  const now = pauses.size > 0;
  if (was === now) return;
  const t = Date.now();
  timers.forEach((tm, key) => {
    if (now) {
      if (!tm.handle) return;
      clearTimeout(tm.handle);
      tm.handle = null;
      tm.left = Math.max(0, tm.left - (t - tm.at));
    } else if (!tm.handle) {
      runTimer(key, tm);
    }
  });
  emit();
}

function dismissKey(key: string, dir: NotifyExit = "up"): void {
  const it = visible.find((x) => x.key === key && !x.leaving);
  if (!it) return;
  leave(it, dir, true);
  emit();
}

export const notify = {
  success: (title: string, opts?: NotifyOptions): string => show("success", title, opts),
  info: (title: string, opts?: NotifyOptions): string => show("info", title, opts),
  warning: (title: string, opts?: NotifyOptions): string => show("warning", title, opts),
  error: (title: string, opts?: NotifyOptions): string => show("error", title, opts),
  promise,
  update,
  dismiss,
};

export const notifyStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getSnapshot: (): NotifyState => state,
  getServerSnapshot: (): NotifyState => EMPTY,
  pause,
  dismissKey,
};

export function toast(text: string, opts: { tone?: ToastTone; ms?: number } = {}): void {
  if (!text) return;
  const tone: NotifyTone = opts.tone === "ok" ? "success" : opts.tone === "err" ? "error" : "info";
  show(tone, text, { duration: opts.ms });
}

export function subscribeToasts(fn: (t: ToastItem) => void): () => void {
  legacy.add(fn);
  return () => {
    legacy.delete(fn);
  };
}
