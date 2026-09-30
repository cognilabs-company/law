const KEY = "lexgo_return_to";

export function isSafeReturnPath(p: string): boolean {
  return /^\/(?![/\\])[^\s\\]*$/.test(p) && !p.startsWith("/login") && !p.startsWith("/register");
}

export function setReturnTo(path: string): void {
  if (!isSafeReturnPath(path)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {}
}

export function takeReturnTo(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { path?: unknown; at?: unknown };
    const path = typeof v.path === "string" ? v.path : "";
    const at = typeof v.at === "number" ? v.at : 0;
    if (!isSafeReturnPath(path) || Date.now() - at > 30 * 60 * 1000) return null;
    return path;
  } catch {
    return null;
  }
}
