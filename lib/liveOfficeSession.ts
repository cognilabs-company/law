// The Live Office presence session of this tab (guide §9): the id the last
// heartbeat answered with, and closing it when the tab goes away or the user
// signs out. sendBeacon cannot carry the Authorization header, so the close
// is a keepalive fetch with the token.
import { API_BASE } from "./http";
import { getToken } from "./client";

let sessionId = "";

export const setLiveSessionId = (id: string) => {
  if (id) sessionId = id;
};

export function endLiveOfficeSession(token: string | null = getToken()): void {
  const id = sessionId;
  if (!id || !token || typeof fetch === "undefined") return;
  sessionId = "";
  try {
    void fetch(`${API_BASE}/internal/live-office/sessions/${encodeURIComponent(id)}/end`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      body: "{}",
    }).catch(() => undefined);
  } catch {
    /* closing is best effort: the backend closes stale sessions itself */
  }
}

// A key per tab that survives a reload (sessionStorage), and one per browser.
export function tabSessionKey(): string {
  return stored(() => sessionStorage, "lexgo_lo_tab");
}
export function deviceId(): string {
  return stored(() => localStorage, "lexgo_device_id");
}

function stored(store: () => Storage, key: string): string {
  try {
    const s = store();
    const cur = s.getItem(key);
    if (cur) return cur;
    const next = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    s.setItem(key, next);
    return next;
  } catch {
    return "web";
  }
}
