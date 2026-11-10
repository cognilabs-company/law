// Cookie and tracker consent (checklist items 3, 13, 29, 31; the backend's
// Cookie policy, slug "cookie"). The visitor's choice per category is kept in
// this browser, versioned and dated; nothing outside "necessary" may store
// anything on the device or load a third-party script until its category is
// on. No choice is not consent: until the visitor decides, every optional
// category reads as off.
//
// What sits in each category (the audit behind it, 2026-11-01):
// - necessary (always on, no switch): the session and sign-in, language, the
//   theme and layout choices the visitor makes by hand, form drafts, call and
//   device ids the features need, and this record itself. All first-party.
// - functional: Yandex Maps JS API 2.1 (api-maps.yandex.ru), which sets
//   Yandex's own cookies. The marketplace and office maps only load it with
//   this category on (components/marketplace/map/ymaps.ts).
// - analytics: Tezkor Himoya runs no analytics or error-tracking script today. The
//   switch is offered so a later one has to wait for it.
// - marketing: first-touch UTM tags and the referral code kept for 90 days
//   (lib/attribution.ts, lib/referral.ts) and the promotion click memory
//   (lib/services/promoEvents.ts). Without it they are not written to the
//   device; turning it off deletes what was kept.

export const CONSENT_CATEGORIES = ["functional", "analytics", "marketing"] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];
export type ConsentChoices = Record<ConsentCategory, boolean>;
export type ConsentRecord = { v: number; at: number; choices: ConsentChoices };

export const CONSENT_KEY = "lexgo_cookie_consent";
// Raise when the categories or what they cover change: every stored choice
// is then asked again (Cookie policy 7.2).
export const CONSENT_VERSION = 1;
// The choice is asked again after 12 months (Cookie policy 4.6).
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export const NO_OPTIONAL: ConsentChoices = { functional: false, analytics: false, marketing: false };
export const ALL_OPTIONAL: ConsentChoices = { functional: true, analytics: true, marketing: true };

// What a category leaves on the device, removed the moment it is turned off.
export const CONSENT_STORAGE: Record<ConsentCategory, { local: string[]; session: string[] }> = {
  functional: { local: [], session: [] },
  analytics: { local: [], session: [] },
  marketing: { local: ["lexgo_ref", "lexgo_attr"], session: ["lexgo_promo_session", "lexgo_promo_attribution"] },
};

// A stored record, or null when there is none, it is not ours, it was made
// for another version of the categories, or it is older than 12 months.
export function parseConsent(raw: string | null | undefined, now = Date.now()): ConsentRecord | null {
  if (!raw) return null;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const r = d as { v?: unknown; at?: unknown; choices?: unknown };
  if (r.v !== CONSENT_VERSION || typeof r.at !== "number" || !Number.isFinite(r.at)) return null;
  if (r.at > now + 60_000 || now - r.at > CONSENT_MAX_AGE_MS) return null;
  if (!r.choices || typeof r.choices !== "object") return null;
  const c = r.choices as Record<string, unknown>;
  const choices = { ...NO_OPTIONAL };
  for (const k of CONSENT_CATEGORIES) choices[k] = c[k] === true;
  return { v: CONSENT_VERSION, at: r.at, choices };
}

// ── The browser's record, shared by every component ─────────────────────
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: ConsentRecord | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// The same object while the stored text is unchanged (useSyncExternalStore
// needs a stable snapshot).
export function readConsent(): ConsentRecord | null {
  const s = storage();
  let raw: string | null = null;
  try {
    raw = s ? s.getItem(CONSENT_KEY) : null;
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseConsent(raw);
  } else if (cached && Date.now() - cached.at > CONSENT_MAX_AGE_MS) {
    cached = null;
  }
  return cached;
}

export function hasConsent(category: ConsentCategory): boolean {
  return readConsent()?.choices[category] === true;
}

function emit(): void {
  for (const fn of [...listeners]) fn();
}

function forget(category: ConsentCategory): void {
  const { local, session } = CONSENT_STORAGE[category];
  try {
    for (const k of local) window.localStorage.removeItem(k);
  } catch {
    /* storage blocked: nothing was kept */
  }
  try {
    for (const k of session) window.sessionStorage.removeItem(k);
  } catch {
    /* storage blocked: nothing was kept */
  }
}

// Saves a choice (all three categories are always written) and removes what
// any category that is now off had kept.
export function saveConsent(choices: ConsentChoices, now = Date.now()): ConsentRecord {
  const rec: ConsentRecord = { v: CONSENT_VERSION, at: now, choices: { ...NO_OPTIONAL } };
  for (const k of CONSENT_CATEGORIES) rec.choices[k] = choices[k] === true;
  const s = storage();
  try {
    s?.setItem(CONSENT_KEY, JSON.stringify(rec));
  } catch {
    /* storage blocked: the choice holds for this page only */
  }
  cachedRaw = s ? JSON.stringify(rec) : cachedRaw;
  cached = rec;
  for (const k of CONSENT_CATEGORIES) if (!rec.choices[k]) forget(k);
  emit();
  return rec;
}

let storageHooked = false;
export function subscribeConsent(fn: () => void): () => void {
  listeners.add(fn);
  // A choice made in another tab applies here too.
  if (!storageHooked && typeof window !== "undefined") {
    storageHooked = true;
    window.addEventListener("storage", (e) => {
      if (e.key === null || e.key === CONSENT_KEY) emit();
    });
  }
  return () => {
    listeners.delete(fn);
  };
}

// Runs `run` once its category is on: now, or the moment the visitor turns
// it on. The returned function stops waiting.
export function whenConsented(category: ConsentCategory, run: () => void): () => void {
  if (hasConsent(category)) {
    run();
    return () => undefined;
  }
  const off = subscribeConsent(() => {
    if (!hasConsent(category)) return;
    off();
    run();
  });
  return off;
}

// ── The settings dialog, opened from the banner, the footer or a map ────
const panelListeners = new Set<() => void>();
let panelOpen = false;

export function openConsentSettings(): void {
  panelOpen = true;
  for (const fn of [...panelListeners]) fn();
}

export function closeConsentSettings(): void {
  panelOpen = false;
  for (const fn of [...panelListeners]) fn();
}

export function consentSettingsOpen(): boolean {
  return panelOpen;
}

export function subscribeConsentSettings(fn: () => void): () => void {
  panelListeners.add(fn);
  return () => {
    panelListeners.delete(fn);
  };
}
