// Legal-consent acceptance record (client-only, no React).
// The backend stores acceptances (user_consents) but has no endpoint to read a
// user's own acceptances back, so the browser remembers which consent id and
// version each user accepted, and whether the accept POST went through.
// Only call the writers from handlers or effects, never during render.
import { acceptLegalConsent, cmpVersion, type ConsentAcceptOutcome, type ConsentDoc } from "@/lib/services/backend";

export type AcceptedConsent = {
  id: string;
  slug: string;
  version: string;
  acceptedAt: string; // when the user ticked/accepted (ISO)
  synced: boolean; // the server has it
  attempts: number; // counted failures in the current retry round
  lastTry: number; // epoch ms of the last POST attempt
  gaveUp: boolean; // paused: refused for good, or too many attempts (next round after 24h)
  refused?: boolean; // the server refused it (400/403/404/422): never posted again
};
type Store = Record<string, AcceptedConsent[]>;
type Pending = { phone: string; savedAt: string; items: AcceptedConsent[] };
type DocRef = { id: string; slug: string; version: string; acceptedAt?: string };

export const CONSENTS_KEY = "lexgo_consents";
const KEY = CONSENTS_KEY;
const PENDING_KEY = "lexgo_consents_pending";
// Same key as lib/auth.tsx.
const SESSION_KEY = "lexgo_session";
const PENDING_TTL_MS = 30 * 24 * 3600 * 1000;
const RETRY_GAP_MS = 60_000; // doubles per counted failure…
const MAX_RETRY_GAP_MS = 3600_000; // …up to an hour
const MAX_ATTEMPTS = 10;
const GIVE_UP_PAUSE_MS = 24 * 3600 * 1000;
const RECHECK_GAP_MS = 5 * 60_000;
const ACCEPT_TIMEOUT_MS = 15_000;

// localStorage, falling back to an in-memory copy when storage is blocked
// (private mode, quota): an acceptance then lasts for this page session
// instead of re-prompting at every recheck.
const mem = new Map<string, string>();
let storageOk = true;
function readRaw(k: string): string | null {
  if (storageOk && typeof window !== "undefined") {
    try {
      const v = localStorage.getItem(k);
      if (v === null) mem.delete(k);
      else mem.set(k, v);
      return v;
    } catch {
      storageOk = false;
    }
  }
  return mem.get(k) ?? null;
}
function writeRaw(k: string, v: string | null): void {
  if (v === null) mem.delete(k);
  else mem.set(k, v);
  if (!storageOk || typeof window === "undefined") return;
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    storageOk = false;
  }
}
function readJson<T>(k: string): T | null {
  const raw = readRaw(k);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
const readStore = (): Store => {
  const s = readJson<Store>(KEY);
  return s && typeof s === "object" && !Array.isArray(s) ? s : {};
};
const writeStore = (s: Store) => writeRaw(KEY, JSON.stringify(s));

// Last 9 digits: "+998 90…" and "99890…" are the same phone.
const phoneKey = (p: string) => p.replace(/\D/g, "").slice(-9);
// Records live under the user id, or the phone before an id is known; reads
// merge both so an early phone-keyed record is still found.
function userKeys(id: string, phone: string): string[] {
  const pk = phoneKey(phone);
  return [id, pk ? `p:${pk}` : ""].filter(Boolean);
}

export function readAccepted(id: string, phone: string): AcceptedConsent[] {
  const store = readStore();
  const out = new Map<string, AcceptedConsent>();
  for (const k of userKeys(id, phone)) {
    for (const r of Array.isArray(store[k]) ? store[k] : []) {
      if (r && r.id && !out.has(r.id)) out.set(r.id, r);
    }
  }
  return [...out.values()];
}

// The one version equality used everywhere: "1", "1.0" and "v1.0" are the same;
// versions without digits compare as (trimmed) strings.
function sameVersion(a: string, b: string): boolean {
  const x = (a || "").trim();
  const y = (b || "").trim();
  if (x === y) return true;
  if (!/\d/.test(x) || !/\d/.test(y)) return false;
  return cmpVersion(x, y) === 0;
}

export function recordAccepted(id: string, phone: string, docs: DocRef[], opts?: { synced?: boolean }): void {
  const key = userKeys(id, phone)[0];
  if (!key || !docs.length) return;
  const store = readStore();
  const list = Array.isArray(store[key]) ? [...store[key]] : [];
  const now = new Date().toISOString();
  for (const d of docs) {
    if (!d.id) continue;
    const i = list.findIndex((r) => r.id === d.id);
    const prev = i >= 0 ? list[i] : undefined;
    const version = d.version || "";
    // A server ref says nothing about a local acceptance of a known version
    // unless it names that version or a newer one: a bare id (no version) or an
    // older version never marks it synced or rewrites its version.
    if (
      prev?.version &&
      opts?.synced &&
      (!version || (!sameVersion(version, prev.version) && cmpVersion(version, prev.version) < 0))
    ) {
      continue;
    }
    // Same row, another version (bumped in place, or the first known version
    // over an unknown one): a new acceptance to post.
    const bumped = !!(prev && version && !sameVersion(version, prev.version || ""));
    const rec: AcceptedConsent =
      prev && !bumped
        ? {
            id: d.id,
            slug: d.slug || prev.slug || "",
            // Same version (or none given): keep the stored spelling.
            version: prev.version || version,
            acceptedAt: d.acceptedAt || prev.acceptedAt || now,
            // Never re-post something the server already has.
            synced: Boolean(opts?.synced || prev.synced),
            attempts: prev.attempts ?? 0,
            lastTry: prev.lastTry ?? 0,
            gaveUp: opts?.synced ? false : (prev.gaveUp ?? false),
            refused: opts?.synced ? false : (prev.refused ?? false),
          }
        : {
            id: d.id,
            slug: d.slug || prev?.slug || "",
            version,
            acceptedAt: d.acceptedAt || now,
            synced: Boolean(opts?.synced),
            attempts: 0,
            lastTry: 0,
            gaveUp: false,
            refused: false,
          };
    if (i >= 0) list[i] = rec;
    else list.push(rec);
  }
  store[key] = list;
  writeStore(store);
}

// Registration: the user accepted before any account/token exists. Saved once
// the phone is verified, kept until the first tokened session for that phone
// claims it.
export function savePendingRegistration(phone: string, docs: ConsentDoc[]): void {
  const pk = phoneKey(phone);
  if (!pk || !docs.length) return;
  const now = new Date().toISOString();
  const pending: Pending = {
    phone: pk,
    savedAt: now,
    items: docs.map((d) => ({
      id: d.id,
      slug: d.slug,
      version: d.version,
      acceptedAt: now,
      synced: false,
      attempts: 0,
      lastTry: 0,
      gaveUp: false,
      refused: false,
    })),
  };
  writeRaw(PENDING_KEY, JSON.stringify(pending));
}

// Drop an unclaimed registration acceptance for this phone (a document was
// unticked again); another phone's record is left alone.
export function clearPendingRegistration(phone: string): void {
  const p = readJson<Pending>(PENDING_KEY);
  const pk = phoneKey(phone);
  if (p && pk && p.phone === pk) writeRaw(PENDING_KEY, null);
}

export function claimPendingRegistration(id: string, phone: string): void {
  const p = readJson<Pending>(PENDING_KEY);
  if (!p) return;
  const saved = Date.parse(p.savedAt);
  if (!Number.isFinite(saved) || Date.now() - saved > PENDING_TTL_MS || !Array.isArray(p.items)) {
    writeRaw(PENDING_KEY, null);
    return;
  }
  const pk = phoneKey(phone);
  if (!pk || p.phone !== pk) return; // someone else's registration
  recordAccepted(id, phone, p.items);
  writeRaw(PENDING_KEY, null);
}

// Which current documents still need acceptance. A document counts as accepted
// when a record has its id and the same version (either version unknown also
// matches), or its slug and the same non-empty version ("new row per
// version"); versions compare with sameVersion. A version bumped in place on
// the same id is therefore missing.
// updated = an older version of a missing document was accepted before.
export function consentStatus(
  current: ConsentDoc[],
  id: string,
  phone: string,
): { missing: ConsentDoc[]; updated: boolean } {
  const recs = readAccepted(id, phone);
  const missing = current.filter(
    (d) =>
      !recs.some(
        (r) =>
          (r.id === d.id && (!r.version || !d.version || sameVersion(r.version, d.version))) ||
          (!!r.slug && r.slug === d.slug && !!r.version && !!d.version && sameVersion(r.version, d.version)),
      ),
  );
  const updated = missing.some((d) => recs.some((r) => r.slug === d.slug || r.id === d.id));
  return { missing, updated };
}

// Patch the record for docId at `version` (a record re-accepted at another
// version meanwhile is left alone).
function patchRecord(id: string, phone: string, docId: string, version: string, patch: Partial<AcceptedConsent>): void {
  const store = readStore();
  for (const k of userKeys(id, phone)) {
    const list = Array.isArray(store[k]) ? store[k] : [];
    const i = list.findIndex((r) => r.id === docId);
    if (i >= 0) {
      if ((list[i].version || "") !== version) return;
      list[i] = { ...list[i], ...patch };
      store[k] = list;
      writeStore(store);
      return;
    }
  }
}

// Due for a POST: unsynced and not refused, past its backoff (60s doubling per
// counted failure, capped at 1h), or paused after too many attempts for more
// than 24h. A refused record is never posted again (D8).
function isDue(r: AcceptedConsent, now: number): boolean {
  if (r.synced || r.refused || !r.id) return false;
  const since = now - (r.lastTry || 0);
  if (r.gaveUp) return since >= GIVE_UP_PAUSE_MS;
  return since >= Math.min(RETRY_GAP_MS * 2 ** Math.max((r.attempts || 0) - 1, 0), MAX_RETRY_GAP_MS);
}

// Is the stored session (read like lib/auth.tsx readStoredSession) still this
// user? http() picks up the current token per request, so after a logout and
// another login mid-flush the next POST would carry the other account's bearer.
function sessionIsUser(id: string, phone: string): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as { token?: string; id?: string; phone?: string }) : null;
    if (!s?.token) return false;
    if (id) return s.id === id;
    const pk = phoneKey(phone);
    return !!pk && phoneKey(s.phone ?? "") === pk;
  } catch {
    return false;
  }
}

// A stalled POST must not hold the cross-tab lock: after 15s it counts as a
// retry (the request itself may still land; a re-post is answered as synced).
async function acceptWithTimeout(docId: string, version: string): Promise<ConsentAcceptOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ConsentAcceptOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ outcome: "retry", status: 408 }), ACCEPT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([acceptLegalConsent(docId, version), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function flushPass(id: string, phone: string): Promise<void> {
  for (const d of readAccepted(id, phone).filter((r) => isDue(r, Date.now()))) {
    if (!sessionIsUser(id, phone)) return;
    // Re-read: another tab may have synced or stamped it meanwhile.
    const r = readAccepted(id, phone).find((x) => x.id === d.id);
    if (!r || r.version !== d.version || !isDue(r, Date.now())) continue;
    // A paused record starts a fresh round.
    const attempts = r.gaveUp ? 0 : r.attempts || 0;
    // Stamp before the request so other tabs skip it while it is in flight.
    patchRecord(id, phone, r.id, r.version, { lastTry: Date.now(), attempts, gaveUp: false });
    const res = await acceptWithTimeout(r.id, r.version);
    // Account switched mid-request: leave it unsynced for this user's next flush.
    if (!sessionIsUser(id, phone)) return;
    if (res.outcome === "synced") {
      patchRecord(id, phone, r.id, r.version, { synced: true });
    } else if (res.outcome === "retry") {
      // Never reached the backend (offline, proxy 502): not counted; the rest
      // would fail the same way, so wait for the next wake-up.
      if (res.status === 0 || res.status === 502) return;
      const n = attempts + 1;
      const gaveUp = n >= MAX_ATTEMPTS;
      patchRecord(id, phone, r.id, r.version, { attempts: n, gaveUp });
      if (gaveUp) console.warn(`[consents] accept ${r.slug || r.id} paused after ${n} attempts (last HTTP ${res.status})`);
    } else {
      // 400/403/404/422: the server refused it; keep the acceptance, stop
      // posting it for good, and leave one trace in the logs.
      patchRecord(id, phone, r.id, r.version, { attempts: attempts + 1, gaveUp: true, refused: true });
      console.warn(`[consents] accept ${r.slug || r.id} v${r.version} refused with HTTP ${res.status}; kept locally`);
    }
  }
}

// Across tabs, one pass at a time (Web Locks); a tab that waited then reads the
// records the other one already stamped or synced. When the lock itself is
// unavailable (no Web Locks, or request() rejects, e.g. SecurityError in a
// sandboxed context) the pass runs unlocked, still guarded per user.
async function withFlushLock(fn: () => Promise<void>): Promise<void> {
  if (typeof navigator === "undefined" || !("locks" in navigator) || !navigator.locks) return fn();
  let started = false;
  try {
    await navigator.locks.request("lexgo-consents-flush", () => {
      started = true;
      return fn();
    });
  } catch (e) {
    if (started) throw e; // the pass itself failed, not the lock
    await fn();
  }
}

// POST every due acceptance of this user, one at a time. Every outcome keeps
// the local acceptance, so a sync failure never re-prompts the user. A call
// while this user's flush is running queues one more pass instead of being
// dropped.
const flushing = new Map<string, { rerun: boolean }>();
export async function flushConsents(id: string, phone: string): Promise<void> {
  const owner = userKeys(id, phone)[0];
  if (!owner || typeof window === "undefined") return;
  const running = flushing.get(owner);
  if (running) {
    running.rerun = true;
    return;
  }
  const state = { rerun: false };
  flushing.set(owner, state);
  try {
    do {
      state.rerun = false;
      await withFlushLock(() => flushPass(id, phone));
    } while (state.rerun && sessionIsUser(id, phone));
  } catch {
    /* storage/lock failure: retried at the next wake-up */
  } finally {
    flushing.delete(owner);
  }
}

// Focus/online rechecks of the document list: at most every 5 minutes.
let lastCheck = 0;
export function shouldRecheck(force = false): boolean {
  const now = Date.now();
  if (!force && now - lastCheck < RECHECK_GAP_MS) return false;
  lastCheck = now;
  return true;
}
