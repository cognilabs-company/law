import { hasConsent } from "./consent";
import { http } from "./http";

// Referral attribution (T1A-08): the first ?ref= code a visitor arrives with is
// kept for 90 days (first touch) and sent as referral_code at registration.
// Kept only with marketing consent (Cookie policy 2.4, "Referral").
const KEY = "lexgo_ref";
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const VALID = /^[A-Za-z0-9_-]{3,32}$/;

type Stored = { code: string; at: number };

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Stored) : null;
    if (!s || typeof s.code !== "string" || typeof s.at !== "number") return null;
    return s;
  } catch {
    return null;
  }
}

// Remember the code from the current URL unless an unexpired one exists.
export function captureReferral(search: string): void {
  if (typeof window === "undefined" || !hasConsent("marketing")) return;
  const code = (new URLSearchParams(search).get("ref") || "").trim();
  if (!VALID.test(code)) return;
  const cur = read();
  if (cur && Date.now() - cur.at < TTL_MS) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    /* storage blocked: attribution is best effort */
  }
}

// The stored code, or "" when none or expired.
export function readReferral(): string {
  if (typeof window === "undefined") return "";
  const cur = read();
  return cur && Date.now() - cur.at < TTL_MS ? cur.code : "";
}

// 2026-11-21 contract §5.2: the registration form shows the code again and
// checks it with GET /referrals/{code}/validate (public) — while the user
// types, and when the page opens with ?ref=CODE.
export const isReferralShape = (code: string): boolean => VALID.test(code.trim());

// The ?ref= of the current page, when it looks like a code.
export function referralFromUrl(search: string): string {
  const code = (new URLSearchParams(search).get("ref") || "").trim();
  return VALID.test(code) ? code : "";
}

export type ReferralCheck = { code: string; valid: boolean; referrerName: string };
export async function validateReferral(code: string, signal?: AbortSignal): Promise<ReferralCheck> {
  const c = code.trim();
  const d = await http(`/referrals/${encodeURIComponent(c)}/validate`, { signal });
  const o = d && typeof d === "object" ? (d as Record<string, unknown>) : {};
  return { code: typeof o.code === "string" ? o.code : c, valid: o.valid === true, referrerName: typeof o.referrer_name === "string" ? o.referrer_name.trim() : "" };
}
