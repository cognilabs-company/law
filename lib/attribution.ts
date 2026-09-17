// Visit attribution for CRM leads (T1A-05 / S-47): first-touch UTM tags,
// landing page, referrer and device are remembered for 90 days and attached to
// every lead the browser creates. Best effort — storage may be blocked.
const KEY = "lexgo_attr";
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_page: string;
  referrer: string;
  device: "mobile" | "desktop";
  first_seen: string; // ISO
};

function read(): (Attribution & { at: number }) | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Attribution & { at: number }) : null;
    return s && typeof s.at === "number" ? s : null;
  } catch {
    return null;
  }
}

// Remember the first visit's tags; a later visit with UTM tags replaces an
// untagged record (a campaign click beats a stray direct visit).
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  const tags: Partial<Attribution> = {};
  for (const k of UTM) { const v = (q.get(k) || "").trim().slice(0, 100); if (v) tags[k] = v; }
  const cur = read();
  const fresh = cur && Date.now() - cur.at < TTL_MS;
  if (fresh && (cur.utm_source || !Object.keys(tags).length)) return;
  const rec: Attribution & { at: number } = {
    ...tags,
    landing_page: window.location.pathname + window.location.search,
    referrer: (document.referrer || "").slice(0, 200),
    device: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "mobile" : "desktop",
    first_seen: new Date().toISOString(),
    at: Date.now(),
  };
  try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* ignore */ }
}

// The stored attribution as lead details, or {} when none.
export function attributionDetails(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const cur = read();
  if (!cur || Date.now() - cur.at > TTL_MS) return {};
  const out: Record<string, string> = { landing_page: cur.landing_page, referrer: cur.referrer, device: cur.device, first_seen: cur.first_seen, current_page: window.location.pathname };
  for (const k of UTM) if (cur[k]) out[k] = cur[k]!;
  return out;
}
