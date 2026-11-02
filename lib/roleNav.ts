// Role navigation policy (LEXGO_ROLE_NAVIGATION_FRONTEND_2026_11_02.md).
//
// The backend owns which pages a role profile loses: GET /me/navigation
// returns the hidden page ids, every hidden route prefix and the route to
// land on instead. Nothing here decides a removal on its own; the only list
// kept in the frontend (PAGE_ROUTES) maps a backend page id to the frontend
// routes that draw that page, so a hidden id also hides its sidebar row and
// blocks its URL when the backend's route list names the page by another
// path (/portal/call-center/crm vs the cabinet's /admin/crm). It is also the
// "role-sensitive" set that stays hidden while the policy is loading or
// could not be fetched.

export type RoleNavPolicy = {
  userId: string;
  policyVersion: string;
  roleProfile: string;
  hiddenPageIds: string[];
  hiddenRoutes: string[];
  defaultRoute: string;
  directNavigationDenied: boolean;
};

// "loading": no policy yet for this user (first fetch in flight).
// "ready": the current policy from the backend.
// "cached": the backend could not be reached; the last policy fetched for
//   this same user is in use while it retries.
// "unavailable": no policy and no safe cache; role-sensitive pages stay
//   hidden while it retries.
// "off": nobody is signed in, or the backend has no /me/navigation (an older
//   deployment): nothing is hidden by this module.
export type RoleNavStatus = "loading" | "ready" | "cached" | "unavailable" | "off";

export type RoleNavState = { status: RoleNavStatus; userId: string; policy: RoleNavPolicy | null };

// Frontend routes of each backend page id. `=` marks an exact route (the
// call-center console is /admin/call-center itself; its /support and
// /experience sub-pages are other pages).
const PAGE_ROUTES: Record<string, string[]> = {
  // navbatchi_yurist
  crm: ["/admin/crm", "/crm", "/portal/call-center/crm"],
  duty_services: ["=/admin/call-center", "/portal/call-center", "/portal/callcenter"],
  operator_chats: ["/admin/call-center/support", "/portal/call-center/support"],
  remote_assistance: ["/admin/remote-assistance"],
  // client
  client_works: ["/portal/client/works"],
  problem_analysis: ["/portal/client/intake", "/portal/client/matches"],
  academy: ["/portal/client/academy"],
  // advokat
  opportunities: ["/portal/advocate/opportunities"],
  lawyer_works: ["/portal/advocate/cases", "/portal/lawyer/cases"],
  urgent_jobs: ["/portal/advocate/urgent", "/portal/lawyer/urgent"],
  lawyer_document_requests: ["/portal/advocate/document-requests", "/portal/lawyer/document-requests"],
  organization: ["/portal/advocate/organization", "/portal/organization"],
};

const asStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(asStr).filter(Boolean) : []);

// Path without query, hash, locale prefix or trailing slash.
export function navPath(raw: string): string {
  const p = (raw || "").split(/[?#]/)[0].replace(/^\/(uz|ru|en)(?=\/|$)/, "").replace(/\/+$/, "");
  return p || "/";
}

// The contract's matcher: equal to the prefix, or below it.
export function isHiddenRoute(pathname: string, hiddenRoutes: string[]): boolean {
  const p = navPath(pathname);
  return hiddenRoutes.some((raw) => {
    const prefix = navPath(raw);
    if (prefix === "/") return false;
    return p === prefix || p.startsWith(`${prefix}/`);
  });
}

function matchesPageRoute(pathname: string, route: string): boolean {
  if (route.startsWith("=")) return pathname === route.slice(1);
  return pathname === route || pathname.startsWith(`${route}/`);
}

// The backend page id a frontend path belongs to ('' for none).
export function pageIdOfPath(pathname: string): string {
  const p = navPath(pathname);
  let best = "";
  let bestLen = -1;
  for (const [id, routes] of Object.entries(PAGE_ROUTES)) {
    for (const r of routes) {
      const len = r.replace(/^=/, "").length;
      if (matchesPageRoute(p, r) && len > bestLen) {
        best = id;
        bestLen = len;
      }
    }
  }
  return best;
}

// A page some role profile can lose: hidden while the policy is unknown.
export const isRoleSensitivePath = (pathname: string): boolean => pageIdOfPath(pathname) !== "";

export function policyHidesPath(policy: RoleNavPolicy, pathname: string): boolean {
  if (isHiddenRoute(pathname, policy.hiddenRoutes)) return true;
  const id = pageIdOfPath(pathname);
  return !!id && policy.hiddenPageIds.includes(id);
}

// What the UI should do with a path under the current state.
export function stateHidesPath(state: RoleNavState, pathname: string): boolean {
  if (state.status === "off") return false;
  if ((state.status === "ready" || state.status === "cached") && state.policy) return policyHidesPath(state.policy, pathname);
  return isRoleSensitivePath(pathname);
}

// A same-origin path the router can open ('' otherwise).
function safeRoute(v: unknown): string {
  const r = asStr(v);
  if (!r.startsWith("/") || r.startsWith("//") || /[\s\\]/.test(r)) return "";
  return r;
}

export function normalizeRoleNav(raw: unknown, userId: string): RoleNavPolicy {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pages = Array.isArray(d.hidden_pages) ? d.hidden_pages : [];
  const ids = new Set(strList(d.hidden_page_ids));
  const routes = new Set(strList(d.hidden_routes));
  // hidden_pages carries the same pages with their routes; merge them in so
  // a response that fills only one of the two lists still hides everything.
  for (const p of pages) {
    if (!p || typeof p !== "object") continue;
    const page = p as Record<string, unknown>;
    const id = asStr(page.page_id);
    if (id) ids.add(id);
    for (const r of strList(page.routes)) routes.add(r);
  }
  return {
    userId,
    policyVersion: asStr(d.policy_version),
    roleProfile: asStr(d.role_profile),
    hiddenPageIds: [...ids],
    hiddenRoutes: [...routes].filter((r) => r.startsWith("/")),
    defaultRoute: safeRoute(d.default_route),
    directNavigationDenied: d.direct_navigation_denied !== false,
  };
}

// 403 detail of a dedicated API that belongs to a removed page.
export type RoleDenied = { pageId: string; roleProfile: string; defaultRoute: string; message: string };

export function roleDeniedOf(status: number, body: unknown): RoleDenied | null {
  if (status !== 403 || !body || typeof body !== "object") return null;
  const detail = (body as Record<string, unknown>).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const d = detail as Record<string, unknown>;
  if (d.code !== "role_page_access_denied") return null;
  return { pageId: asStr(d.page_id), roleProfile: asStr(d.role_profile), defaultRoute: safeRoute(d.default_route), message: asStr(d.message) };
}

// ── Store ────────────────────────────────────────────────────────────
// Module-level so non-React code (the AI navigation in lib/guide/routes.ts)
// reads the same answer as the shells.

const CACHE_PREFIX = "lexgo_role_nav:";
const OFF: RoleNavState = { status: "off", userId: "", policy: null };
let state: RoleNavState = OFF;
const listeners = new Set<() => void>();

export function getRoleNavState(): RoleNavState {
  return state;
}

export function setRoleNavState(next: RoleNavState): void {
  if (next.status === state.status && next.userId === state.userId && next.policy === state.policy) return;
  state = next;
  listeners.forEach((fn) => fn());
}

export function subscribeRoleNav(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const roleNavOff = (): void => setRoleNavState(OFF);

// Used by every surface that links somewhere: sidebar, drawer, desktop,
// command palette, dashboard shortcuts and AI navigation.
export const isPathHidden = (pathname: string): boolean => stateHidesPath(state, pathname);

export function readCachedPolicy(userId: string): RoleNavPolicy | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    if (!raw) return null;
    const p = JSON.parse(raw) as RoleNavPolicy;
    // Never another account's policy, whatever the key says.
    return p && p.userId === userId && Array.isArray(p.hiddenRoutes) && Array.isArray(p.hiddenPageIds) ? p : null;
  } catch {
    return null;
  }
}

export function writeCachedPolicy(p: RoleNavPolicy): void {
  if (!p.userId || typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + p.userId, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

// Logout: drop every cached policy, not only the last account's.
export function clearCachedPolicies(): void {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
}
