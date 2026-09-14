// Legal-consent acceptance record (client-only, no React).
// The backend stores acceptances (user_consents) but has no endpoint to read a
// user's own acceptances back, so the browser remembers which consent id and
// version each user accepted, and whether the accept POST went through.
// Only call the writers from handlers or effects, never during render.
import { acceptLegalConsent, type ConsentDoc } from "@/lib/services/backend";

export type AcceptedConsent = {
  id: string;
  slug: string;
  version: string;
  acceptedAt: string; // when the user ticked/accepted (ISO)
  synced: boolean; // the server has it
  attempts: number;
  lastTry: number; // epoch ms of the last POST attempt
  gaveUp: boolean; // stop retrying (refused, or too many attempts)
};
type Store = Record<string, AcceptedConsent[]>;
type Pending = { phone: string; savedAt: string; items: AcceptedConsent[] };
type DocRef = { id: string; slug: string; version: string; acceptedAt?: string };

export const CONSENTS_KEY = "lexgo_consents";
const KEY = CONSENTS_KEY;
const PENDING_KEY = "lexgo_consents_pending";
const PENDING_TTL_MS = 30 * 24 * 3600 * 1000;
const RETRY_GAP_MS = 60_000;
const MAX_ATTEMPTS = 10;
const RECHECK_GAP_MS = 5 * 60_000;

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
    const rec: AcceptedConsent = {
      id: d.id,
      slug: d.slug || prev?.slug || "",
      version: d.version || prev?.version || "",
      acceptedAt: d.acceptedAt || prev?.acceptedAt || now,
      // Never re-post something the server already has.
      synced: Boolean(opts?.synced || prev?.synced),
      attempts: prev?.attempts ?? 0,
      lastTry: prev?.lastTry ?? 0,
      gaveUp: opts?.synced ? false : (prev?.gaveUp ?? false),
    };
    if (i >= 0) list[i] = rec;
    else list.push(rec);
  }
  store[key] = list;
  writeStore(store);
}

// Registration: the user accepted before any account/token exists. Kept until
// the first tokened session for that phone claims it.
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
    })),
  };
  writeRaw(PENDING_KEY, JSON.stringify(pending));
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
// when its id matches, or its slug and (non-empty) version match — covering
// both "new row per version" and "version bumped in place". updated = an older
// version of a missing document was accepted before.
export function consentStatus(
  current: ConsentDoc[],
  id: string,
  phone: string,
): { missing: ConsentDoc[]; updated: boolean } {
  const recs = readAccepted(id, phone);
  const missing = current.filter(
    (d) => !recs.some((r) => r.id === d.id || (r.slug === d.slug && r.version !== "" && r.version === d.version)),
  );
  const updated = missing.some((d) => recs.some((r) => r.slug === d.slug));
  return { missing, updated };
}

function patchRecord(id: string, phone: string, docId: string, patch: Partial<AcceptedConsent>): void {
  const store = readStore();
  for (const k of userKeys(id, phone)) {
    const list = Array.isArray(store[k]) ? store[k] : [];
    const i = list.findIndex((r) => r.id === docId);
    if (i >= 0) {
      list[i] = { ...list[i], ...patch };
      store[k] = list;
      writeStore(store);
      return;
    }
  }
}

// POST every unsynced acceptance, one at a time. Every outcome keeps the local
// acceptance, so a sync failure never re-prompts the user.
let flushing = false;
export async function flushConsents(id: string, phone: string): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const due = readAccepted(id, phone).filter(
      (r) => !r.synced && !r.gaveUp && r.id && Date.now() - (r.lastTry || 0) >= RETRY_GAP_MS,
    );
    for (const r of due) {
      const res = await acceptLegalConsent(r.id, r.version);
      if (res.outcome === "synced") {
        patchRecord(id, phone, r.id, { synced: true, lastTry: Date.now() });
      } else if (res.outcome === "retry") {
        const attempts = (r.attempts || 0) + 1;
        const gaveUp = attempts >= MAX_ATTEMPTS;
        patchRecord(id, phone, r.id, { attempts, lastTry: Date.now(), gaveUp });
        if (gaveUp) console.warn(`[consents] accept ${r.slug || r.id} gave up after ${attempts} attempts (last HTTP ${res.status})`);
      } else {
        // 400/403/404/422: the server refused it; keep the acceptance, stop
        // retrying, and leave a trace in the logs.
        patchRecord(id, phone, r.id, { attempts: (r.attempts || 0) + 1, lastTry: Date.now(), gaveUp: true });
        console.warn(`[consents] accept ${r.slug || r.id} v${r.version} refused with HTTP ${res.status}; kept locally`);
      }
    }
  } finally {
    flushing = false;
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
