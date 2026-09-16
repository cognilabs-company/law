// Referral attribution (T1A-08): the first ?ref= code a visitor arrives with is
// kept for 90 days (first touch) and sent as referral_code at registration.
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
  if (typeof window === "undefined") return;
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
