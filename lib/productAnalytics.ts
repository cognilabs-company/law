// Product analytics for the CEO dashboard
// (TEZKOR_HIMOYA_EXECUTIVE_HRM_LIVE_AI_FRONTEND_2026_11_13 §3):
// POST /analytics/product/events in batches of 1–100, platform "web".
//
// Privacy, as the backend contract and the Cookie policy require:
// - nothing is queued, stored or sent until the visitor turns the
//   "analytics" cookie category on; turning it off deletes the install and
//   session ids (lib/consent.ts CONSENT_STORAGE.analytics);
// - anonymous_id is a random id made here (the backend keeps only its hash);
// - `properties` carry ids and short codes only — never a phone, e-mail,
//   passport, PINFL or a name (scrubProps drops any such key or value).
// `event_id` is the idempotency key, so a batch that failed in transit is
// simply sent again.
import { API_BASE } from "./http";
import { getToken } from "./client";
import { hasConsent } from "./consent";

export const PRODUCT_EVENTS = [
  "app_installed",
  "app_opened",
  "session_started",
  "session_ended",
  "register_started",
  "phone_entered",
  "otp_started",
  "otp_succeeded",
  "service_viewed",
  "lawyer_viewed",
  "purchase_started",
  "payment_page_opened",
  "payment_succeeded",
  "payment_failed",
  "screen_viewed",
  "app_crashed",
] as const;
export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

export type TrackOptions = {
  screen?: string;
  result?: "success" | "failure" | "cancelled" | string;
  durationMs?: number;
  properties?: Record<string, unknown>;
};

type WireEvent = {
  event_id: string;
  anonymous_id: string;
  session_id: string;
  platform: "web";
  app_version: string;
  event_name: ProductEvent;
  screen: string;
  result: string;
  duration_ms: number;
  properties: Record<string, string | number | boolean>;
  occurred_at: string;
};

// Kept on the device only with analytics consent (see lib/consent.ts).
export const ANALYTICS_INSTALL_KEY = "th_install_id";
export const ANALYTICS_SESSION_KEY = "th_analytics_session";
// Events still unsent when a page closes, picked up by the next page.
export const ANALYTICS_QUEUE_KEY = "th_analytics_queue";

const IDLE_MS = 30 * 60 * 1000; // a new session after 30 idle minutes
const FLUSH_MS = 8000;
const MAX_QUEUE = 300;
const APP_VERSION = "web-0.1.0";

const uuid = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
};

// ── Privacy guard ───────────────────────────────────────────────────
const PII_KEY = /phone|tel(ephone)?$|e-?mail|passport|pinfl|jshshir|(^|_)(full_?)?name$|^fio$|first_?name|last_?name|middle_?name|address/i;
const PII_VALUE = /(\+?998[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})|([^\s@]+@[^\s@]+\.[a-z]{2,})|(\b\d{14}\b)|(\b[A-Z]{2}\d{7}\b)/i;
export function scrubProps(props: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props)) {
    if (PII_KEY.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") {
      const s = v.trim().slice(0, 120);
      if (s && !PII_VALUE.test(s)) out[k] = s;
    }
  }
  return out;
}

// A stable screen name from a path: no locale, ids folded to "id".
// "/uz/lawyers/5f2c…" → "lawyers_id"; "/" → "home".
const LOCALES = new Set(["uz", "ru", "en"]);
export function screenOf(pathname: string): string {
  const parts = pathname
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .filter((p, i) => !(i === 0 && LOCALES.has(p)))
    .map((p) => (/^[0-9a-f-]{8,}$/i.test(p) || /\d{3,}/.test(p) || p.length > 32 ? "id" : p.replace(/[^a-z0-9]+/gi, "_").toLowerCase()));
  return parts.join("_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 80) || "home";
}

// ── Device ids (consent-gated) ──────────────────────────────────────
function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let memInstall = "";
function installId(): string {
  const s = store();
  let id = "";
  try {
    id = s?.getItem(ANALYTICS_INSTALL_KEY) ?? "";
  } catch {
    id = "";
  }
  if (!id) id = memInstall;
  if (!id) {
    id = `install-${uuid()}`;
    try {
      s?.setItem(ANALYTICS_INSTALL_KEY, id);
    } catch {
      /* private mode: this page view keeps it in memory */
    }
  }
  memInstall = id;
  return id;
}

type Sess = { id: string; start: number; last: number };
let memSess: Sess | null = null;
function readSess(): Sess | null {
  try {
    const raw = store()?.getItem(ANALYTICS_SESSION_KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<Sess>;
      if (typeof j.id === "string" && typeof j.start === "number" && typeof j.last === "number") return { id: j.id, start: j.start, last: j.last };
    }
  } catch {
    /* fall back to memory */
  }
  return memSess;
}
function writeSess(s: Sess): void {
  memSess = s;
  try {
    store()?.setItem(ANALYTICS_SESSION_KEY, JSON.stringify(s));
  } catch {
    /* memory only */
  }
}

// ── Queue ───────────────────────────────────────────────────────────
let queue: WireEvent[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false;
let screenNow = "";

type Config = { enabled: boolean; events: Set<string>; batch: number };
let config: Config | null = null;
let configP: Promise<Config> | null = null;
function loadConfig(): Promise<Config> {
  if (config) return Promise.resolve(config);
  if (!configP) {
    configP = fetch(`${API_BASE}/analytics/product/config`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        const d = j && typeof j === "object" ? (j as Record<string, unknown>) : {};
        const events = Array.isArray(d.events) ? d.events.filter((e): e is string => typeof e === "string") : [...PRODUCT_EVENTS];
        const platforms = Array.isArray(d.platforms) ? d.platforms : ["web"];
        const batch = typeof d.batch_size === "number" && d.batch_size > 0 ? Math.min(100, d.batch_size) : 100;
        config = { enabled: d.enabled !== false && platforms.includes("web"), events: new Set(events), batch };
        return config;
      })
      .catch(() => {
        // Unknown for now: send with the documented defaults, ask again later.
        configP = null;
        return { enabled: true, events: new Set<string>(PRODUCT_EVENTS), batch: 100 };
      });
  }
  return configP;
}

function wire(name: ProductEvent, sessionId: string, opts: TrackOptions, at = Date.now()): WireEvent {
  return {
    event_id: uuid(),
    anonymous_id: installId(),
    session_id: sessionId,
    platform: "web",
    app_version: APP_VERSION,
    event_name: name,
    screen: (opts.screen ?? screenNow).slice(0, 80),
    result: opts.result ?? "success",
    duration_ms: Math.max(0, Math.round(opts.durationMs ?? 0)),
    properties: scrubProps(opts.properties),
    occurred_at: new Date(at).toISOString(),
  };
}

// What the last page could not send (it was leaving): sent again here. The
// backend dedupes by event_id, so a batch that did get out is not counted twice.
let restored = false;
function restoreQueue(): void {
  if (restored) return;
  restored = true;
  try {
    const s = store();
    const raw = s?.getItem(ANALYTICS_QUEUE_KEY);
    s?.removeItem(ANALYTICS_QUEUE_KEY);
    const old = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(old)) {
      const seen = new Set(queue.map((e) => e.event_id));
      const back = old.filter((e): e is WireEvent => !!e && typeof e === "object" && typeof (e as WireEvent).event_id === "string" && !seen.has((e as WireEvent).event_id));
      queue = [...back, ...queue].slice(-MAX_QUEUE);
    }
  } catch {
    /* nothing kept */
  }
}
function persistQueue(): void {
  try {
    if (queue.length) store()?.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
    else store()?.removeItem(ANALYTICS_QUEUE_KEY);
  } catch {
    /* storage full or blocked */
  }
}

function push(e: WireEvent): void {
  restoreQueue();
  queue.push(e);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  schedule();
}

// The current session; rolls a new one after IDLE_MS and reports the old
// one's real length as session_ended (when it closed with its tab, this is
// the first moment we can).
function session(now = Date.now()): string {
  const cur = readSess();
  if (cur && now - cur.last < IDLE_MS) {
    if (now - cur.last > 15_000) writeSess({ ...cur, last: now });
    return cur.id;
  }
  if (cur) push(wire("session_ended", cur.id, { durationMs: cur.last - cur.start }, cur.last));
  const next: Sess = { id: `session-${uuid()}`, start: now, last: now };
  writeSess(next);
  push(wire("session_started", next.id, {}, now));
  return next.id;
}

export function track(name: ProductEvent, opts: TrackOptions = {}): void {
  if (typeof window === "undefined" || !hasConsent("analytics")) return;
  try {
    // app_installed is a store install: the mobile apps send it, the web never does.
    if (name === "app_installed") return;
    if (opts.screen && !screenNow) screenNow = opts.screen;
    push(wire(name, session(), opts));
  } catch {
    /* analytics must never break the page */
  }
}

// Remember activity without an event (scroll, typing) so a long read does not
// count as idle.
export function touchSession(): void {
  if (typeof window === "undefined" || !hasConsent("analytics")) return;
  const cur = readSess();
  if (cur && Date.now() - cur.last < IDLE_MS && Date.now() - cur.last > 15_000) writeSess({ ...cur, last: Date.now() });
}

export function setScreen(screen: string): void {
  screenNow = screen;
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flush();
  }, FLUSH_MS);
}

async function post(events: WireEvent[], keepalive: boolean, withToken: boolean): Promise<Response> {
  const token = withToken ? getToken() : null;
  return fetch(`${API_BASE}/analytics/product/events`, {
    method: "POST",
    keepalive,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ events }),
  });
}

export async function flush(keepalive = false): Promise<void> {
  if (!hasConsent("analytics")) {
    queue = [];
    return;
  }
  restoreQueue();
  // Leaving: keep a copy for the next page whatever happens to the request.
  if (keepalive) persistQueue();
  if (sending || !queue.length) return;
  sending = true;
  try {
    const cfg = keepalive && config ? config : keepalive ? { enabled: true, events: new Set<string>(PRODUCT_EVENTS), batch: 100 } : await loadConfig();
    if (!cfg.enabled) {
      queue = [];
      return;
    }
    queue = queue.filter((e) => cfg.events.has(e.event_name));
    // keepalive bodies are capped at 64 KB: send a smaller slice on page exit.
    const size = keepalive ? Math.min(cfg.batch, 40) : cfg.batch;
    while (queue.length) {
      const batch = queue.slice(0, size);
      let res: Response;
      try {
        res = await post(batch, keepalive, true);
        // An expired sign-in must not lose the batch: anonymous is accepted.
        if (res.status === 401) res = await post(batch, keepalive, false);
      } catch {
        break; // offline: keep the queue, try again later
      }
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)) {
        // Sent, or refused for its contents (422) — never resend a bad batch.
        queue = queue.slice(batch.length);
      } else {
        break; // 408/429/5xx: try again later
      }
      if (keepalive) break;
    }
  } finally {
    sending = false;
    // Still here (the tab was only hidden): the kept copy follows what is
    // actually left, so the next page does not send it again.
    try {
      if (store()?.getItem(ANALYTICS_QUEUE_KEY) != null) persistQueue();
    } catch {
      /* storage blocked */
    }
    if (queue.length && !keepalive) schedule();
  }
}
