"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth, type Session } from "@/lib/auth";
import { ApiError, backoffMs, currentTokenOwner, http, isRouteMissing, setRoleDeniedHandler } from "@/lib/http";
import { notify } from "@/lib/toast";
import {
  clearCachedPolicies,
  getRoleNavState,
  navPath,
  normalizeRoleNav,
  pageIdOfPath,
  readCachedPolicy,
  roleNavOff,
  setRoleNavState,
  stateHidesPath,
  subscribeRoleNav,
  writeCachedPolicy,
  type RoleDenied,
  type RoleNavState,
} from "@/lib/roleNav";

// LEXGO_ROLE_NAVIGATION_FRONTEND_2026_11_02.md: GET /me/navigation after
// sign-in and whenever the account or its roles change, the policy kept in
// authenticated state (lib/roleNav.ts), every hidden route blocked before
// it renders, and one handler for the backend's role_page_access_denied.

const ownerOf = (s: Session | null): string => (s ? s.id || s.phone || "" : "");

const SERVER_STATE: RoleNavState = { status: "off", userId: "", policy: null };

// The store as this render should read it: a signed-in account whose policy
// has not been asked for yet (the first render after a page load, before
// RoleNavHost's effect runs) is "loading", never "off", so a hidden page
// cannot mount and fire its queries in that first commit.
export function useRoleNavState(): RoleNavState {
  const raw = useSyncExternalStore(subscribeRoleNav, getRoleNavState, () => SERVER_STATE);
  const { session } = useAuth();
  const owner = ownerOf(session);
  if (owner && session?.token && raw.userId !== owner) return { status: "loading", userId: owner, policy: null };
  return raw;
}

// `hides(href)` for every list of links: true = do not render the link.
export function useRoleNav(): { state: RoleNavState; hides: (href: string) => boolean } {
  const state = useRoleNavState();
  const hides = useCallback((href: string) => stateHidesPath(state, href), [state]);
  return { state, hides };
}

// What the policy depends on besides the account: its roles.
const rolesKey = (s: Session | null): string =>
  s ? [s.role, s.backendRole ?? "", ...[...(s.roles ?? [])].sort()].join("|") : "";

// Where a role lands when the backend gave no default route.
function homeFor(s: Session | null, pathname: string): string {
  if (navPath(pathname).startsWith("/admin")) return "/admin";
  return `/portal/${s?.role ?? "client"}`;
}

const PORTAL_ROLES = new Set(["client", "lawyer", "advocate"]);

// The policy's default_route when this session can actually open it ('' if
// not): not one of the policy's own hidden routes, and not another role's
// portal (PortalShell would only bounce it on to /portal/<role>, one more
// spinner and one more page).
export function policyLanding(state: RoleNavState, session: Session | null): string {
  if ((state.status !== "ready" && state.status !== "cached") || !state.policy?.defaultRoute) return "";
  const to = state.policy.defaultRoute;
  const seg = navPath(to).split("/")[2] ?? "";
  if (navPath(to).startsWith("/portal/") && PORTAL_ROLES.has(seg) && session && seg !== session.role) return "";
  return stateHidesPath(state, to) ? "" : to;
}

// A profile the backend restricts (it hides at least one page) lands on its
// default_route right after sign-in instead of the generic home.
export function restrictedLanding(state: RoleNavState, session: Session | null): string {
  const p = state.policy;
  if (!p || (!p.hiddenPageIds.length && !p.hiddenRoutes.length)) return "";
  return policyLanding(state, session);
}

const DENIED_TOAST_ID = "role-page-access-denied";
const REFETCH_THROTTLE_MS = 5000;

export default function RoleNavHost() {
  const t = useTranslations("roleNav");
  const { session, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const userId = ownerOf(session);
  const roles = rolesKey(session);
  const hasToken = !!session?.token;
  // Bumped to refetch now (a denial, the tab coming back after a while).
  const [nonce, setNonce] = useState(0);
  const lastFetch = useRef(0);
  const lastDenied = useRef(0);
  const hadSession = useRef(false);
  const lastRoles = useRef("");

  useEffect(() => {
    if (!ready) return;
    if (!userId || !hasToken) {
      // Signed out (or a token-less demo session): no policy, and none of
      // the cached ones may outlive the session.
      if (hadSession.current) clearCachedPolicies();
      hadSession.current = false;
      lastRoles.current = "";
      roleNavOff();
      return;
    }
    hadSession.current = true;
    const cur = getRoleNavState();
    // Another account, or the same one with other roles: the old policy
    // says nothing about it, so the neutral shell shows until it is known.
    if (cur.userId !== userId || (lastRoles.current && lastRoles.current !== roles)) {
      setRoleNavState({ status: "loading", userId, policy: null });
    }
    lastRoles.current = roles;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const load = () => {
      lastFetch.current = Date.now();
      http<unknown>("/me/navigation")
        .then((raw) => {
          // The answer belongs to whoever was signed in when it was sent.
          if (cancelled || currentTokenOwner() !== userId) return;
          const policy = normalizeRoleNav(raw, userId);
          writeCachedPolicy(policy);
          setRoleNavState({ status: "ready", userId, policy });
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          // A deployment without the endpoint: nothing to apply.
          if (isRouteMissing(e)) {
            setRoleNavState({ status: "off", userId, policy: null });
            return;
          }
          // 401 is the refresh/logout flow's: http() already refreshed once,
          // and a session that could not be renewed is being dropped.
          if (e instanceof ApiError && e.status === 401 && !currentTokenOwner()) return;
          const now = getRoleNavState();
          if (now.userId === userId && now.status === "ready" && now.policy) {
            setRoleNavState({ status: "cached", userId, policy: now.policy });
          } else {
            const cached = readCachedPolicy(userId);
            setRoleNavState(cached ? { status: "cached", userId, policy: cached } : { status: "unavailable", userId, policy: null });
          }
          timer = setTimeout(load, backoffMs(attempt++, 3000, 60000));
        });
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ready, userId, roles, hasToken, nonce]);

  // Back on the tab after a while: the role may have been changed meanwhile.
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch.current > 5 * 60_000) setNonce((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId]);

  // The backend refused a page's API for this role. Refetch the policy (it
  // is stale, or the denial would not have been asked for), leave the page
  // the API belongs to with replace, and say so briefly. A widget on an
  // allowed page that touches a removed API does not move the user.
  const pathRef = useRef(pathname);
  const sessionRef = useRef(session);
  useEffect(() => {
    pathRef.current = pathname;
    sessionRef.current = session;
  }, [pathname, session]);
  useEffect(() => {
    const onDenied = (d: RoleDenied) => {
      // The policy that let the user here is stale: refetch, once per burst
      // of denials (a page may fire several requests at once).
      if (Date.now() - lastDenied.current > REFETCH_THROTTLE_MS) {
        lastDenied.current = Date.now();
        setNonce((n) => n + 1);
      }
      const here = pathRef.current;
      const state = getRoleNavState();
      const onThatPage = (!!d.pageId && pageIdOfPath(here) === d.pageId) || stateHidesPath(state, here);
      if (!onThatPage) return;
      const to = d.defaultRoute || policyLanding(state, sessionRef.current) || homeFor(sessionRef.current, here);
      if (navPath(to) === navPath(here)) return;
      router.replace(to);
      notify.info(t("denied"), { id: DENIED_TOAST_ID, duration: 4000 });
    };
    setRoleDeniedHandler(onDenied);
    return () => setRoleDeniedHandler(null);
  }, [router, t]);

  return null;
}

const CABINET = /^\/(portal|admin|internal)(\/|$)/;

// Wraps every page. A hidden route never mounts (nor do its queries): the
// neutral shell shows while the user is sent to the default route.
export function RoleRouteGuard({ children }: { children: ReactNode }) {
  const state = useRoleNavState();
  const { session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const hidden = stateHidesPath(state, pathname);
  // First policy of this account still loading: no cabinet page yet.
  const waiting = state.status === "loading" && CABINET.test(navPath(pathname));
  const target = state.status === "loading" ? "" : policyLanding(state, session) || homeFor(session, pathname);
  useEffect(() => {
    if (!hidden || !target) return;
    // Never bounce onto another hidden route.
    if (navPath(target) === navPath(pathname) || stateHidesPath(state, target)) return;
    router.replace(target);
  }, [hidden, target, pathname, router, state]);
  if (hidden || waiting) {
    return (
      <div className="portal portal--redirect" aria-busy="true" data-role-nav={hidden ? "blocked" : "loading"}>
        <span className="rf__spinner" />
      </div>
    );
  }
  return <>{children}</>;
}
