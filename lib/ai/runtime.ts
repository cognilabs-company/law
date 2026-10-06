import { ApiError, isAborted, isRouteMissing, logApiError } from "@/lib/http";
import { instructorV21Missing, isUnknownSession, postInstructorEvent, postInstructorRuntime } from "@/lib/services/instructorV21";
import { aiSessionId, getAiScope, resetAiSession } from "./session";
import { sleep } from "./dom";
import type { AiEventBody, AiRuntimeRequest } from "./types";

const DEBOUNCE = 800;
const MAX_WAIT = 3000;
const ENGAGED_MS = 10 * 60 * 1000;
const QUEUE_MAX = 60;
const ROUTE_RETRY = 10 * 60 * 1000;

type Provider = () => Omit<AiRuntimeRequest, "session_id"> | null;

let panelOpen = false;
let queueRunning = false;
let lastChat = 0;
let provider: Provider | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let firstAt = 0;
let lastHash = "";
let inflight: AbortController | null = null;
let expiry: ReturnType<typeof setTimeout> | undefined;
let engagedSnap = false;
let runtimeGoneAt = 0;
let eventsGoneAt = 0;
const engageListeners = new Set<() => void>();

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h >>> 0}`;
}

function computeEngaged(): boolean {
  return panelOpen || queueRunning || (lastChat > 0 && Date.now() - lastChat < ENGAGED_MS);
}

function refreshEngaged(): void {
  const next = computeEngaged();
  if (next === engagedSnap) return;
  engagedSnap = next;
  engageListeners.forEach((fn) => fn());
}

export function aiEngaged(): boolean {
  return engagedSnap;
}

export function subscribeEngagement(fn: () => void): () => void {
  engageListeners.add(fn);
  return () => {
    engageListeners.delete(fn);
  };
}

export function setPanelEngaged(open: boolean): void {
  panelOpen = open;
  refreshEngaged();
}

export function setQueueRunning(on: boolean): void {
  queueRunning = on;
  refreshEngaged();
}

export function noteChatActivity(): void {
  lastChat = Date.now();
  clearTimeout(expiry);
  expiry = setTimeout(refreshEngaged, ENGAGED_MS + 50);
  refreshEngaged();
}

export function resetAiEngagement(): void {
  lastChat = 0;
  panelOpen = false;
  queueRunning = false;
  lastHash = "";
  clearTimeout(expiry);
  clearTimeout(timer);
  firstAt = 0;
  inflight?.abort();
  inflight = null;
  refreshEngaged();
}

export function setRuntimeProvider(p: Provider | null): void {
  provider = p;
}

function currentSessionId(): string {
  return aiSessionId(getAiScope());
}

const gone = (at: number) => at > 0 && Date.now() - at < ROUTE_RETRY;

function usable(): boolean {
  const scope = getAiScope();
  return Boolean(scope && currentSessionId() && !instructorV21Missing(scope.role) && !gone(runtimeGoneAt));
}

export function scheduleRuntime(): void {
  if (!engagedSnap || !provider || !usable()) return;
  const now = Date.now();
  if (!firstAt) firstAt = now;
  clearTimeout(timer);
  const wait = Math.max(0, Math.min(DEBOUNCE, firstAt + MAX_WAIT - now));
  timer = setTimeout(() => void flushRuntime(), wait);
}

export async function flushRuntime(force = false, opts: { bypassHash?: boolean } = {}): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  firstAt = 0;
  if (typeof document === "undefined" || document.hidden) return;
  if (!provider || !usable()) return;
  if (!force && !engagedSnap) return;
  const scope = getAiScope();
  const sid = currentSessionId();
  const p = provider();
  if (!p || !scope || !sid) return;
  const body: AiRuntimeRequest = { session_id: sid, ...p };
  const h = hash(JSON.stringify(body));
  if (h === lastHash && !opts.bypassHash) return;
  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  try {
    await postInstructorRuntime(body, ctrl.signal);
    lastHash = h;
  } catch (e) {
    if (isAborted(e)) return;
    if (isRouteMissing(e)) {
      runtimeGoneAt = Date.now();
      return;
    }
    if (isUnknownSession(e)) {
      resetAiSession(scope);
      return;
    }
    logApiError("ai instructor runtime", e);
  } finally {
    if (inflight === ctrl) inflight = null;
  }
}

const queue: AiEventBody[] = [];
let pumping = false;

const retryable = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status >= 500) && e.detail !== "aborted";

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const body = queue.shift();
      if (!body) continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await postInstructorEvent(body);
          break;
        } catch (e) {
          if (isRouteMissing(e)) {
            eventsGoneAt = Date.now();
            queue.length = 0;
            return;
          }
          if (isUnknownSession(e)) {
            resetAiSession(getAiScope());
            break;
          }
          if (attempt === 0 && retryable(e)) {
            await sleep(800);
            continue;
          }
          logApiError("ai instructor event", e);
          break;
        }
      }
    }
  } finally {
    pumping = false;
  }
}

export function queueAiEvent(body: AiEventBody): void {
  if (!body.session_id || gone(eventsGoneAt)) return;
  const scope = getAiScope();
  if (scope && instructorV21Missing(scope.role)) return;
  queue.push(body);
  if (queue.length > QUEUE_MAX) queue.shift();
  void pump();
}
