"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { setToken } from "./client";
import { ApiError, setRefreshHandler } from "./http";
import { normUzPhone } from "./phone";
import type { PlanTier, ProfessionalProfile, RegistrationDraft } from "./types";
import { scoreCompleteness } from "./services/registration";
import {
  apiLogin,
  loginVerify2fa,
  apiMe,
  apiLogout,
  apiRefresh,
  registerStart,
  registerVerify,
  type BackendRole,
  type AuthResult,
  type AcceptedConsentRef,
  type RegisterStartResult,
  type TwoFactorChallenge,
} from "./services/backend";

export type Role = "client" | "lawyer" | "advocate";
export type Session = {
  role: Role;
  name: string;
  phone: string;
  id: string;
  lexgoId?: string;
  accountStatus?: string;
  plan: PlanTier;
  completeness: number;
  profile?: ProfessionalProfile;
  token?: string;
  refreshToken?: string;
  roles?: string[];
  permissions?: string[];
  twoFactorEnabled?: boolean;
  twoFactorMethod?: string;
  // Raw primary backend role (admin, manager, call_center, yurist…). The UI
  // `role` maps every staff role to "client", so RBAC reads this instead.
  backendRole?: string;
  // Backend says 2FA is mandatory for this account.
  twoFactorRequired?: boolean;
  // undefined = unknown (/auth/me doesn't expose the link state).
  telegramLinked?: boolean;
  // Legal consents the server reports as accepted (lib/consents.ts seeds them
  // as synced). Empty until /auth/me exposes them.
  acceptedConsents?: AcceptedConsentRef[];
};

// Shown on the login form: the refresh session ended (401/403 on refresh), or
// a freshly registered account has to sign in (its role needs 2FA).
export type AuthNotice = "sessionExpired" | "loginRequired" | null;

const KEY = "lexgo_session";

// Our UI has client|lawyer|advocate; the backend has client|yurist|advokat
// (+ advokat_tashkiloti and internal staff roles). Map lawyer↔yurist,
// advocate↔advokat (advokat_tashkiloti also lands in the advocate portal).
const toBackendRole = (r: Role): BackendRole =>
  r === "client" ? "client" : r === "lawyer" ? "yurist" : "advokat";
const fromBackendRole = (r: BackendRole): Role =>
  r === "yurist" ? "lawyer" : r === "advokat" || r === "advokat_tashkiloti" ? "advocate" : "client";

type AuthCtx = {
  session: Session | null;
  ready: boolean;
  login: (phone: string, password: string) => Promise<Session | { twoFactor: TwoFactorChallenge }>;
  // Complete a 2FA login challenge (returned by login) with the SMS/app code.
  completeLogin2fa: (verificationId: string, code: string, phone: string) => Promise<Session>;
  startRegistration: (draft: RegistrationDraft) => Promise<RegisterStartResult>;
  register: (
    draft: RegistrationDraft,
    verificationId: string,
    code: string,
  ) => Promise<Session | { pending: true; message: string } | { loginRequired: true; message: string }>;
  update: (patch: Partial<Session>) => void;
  logout: () => void;
  authNotice: AuthNotice;
  clearAuthNotice: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

// Stored session from localStorage (client only; null on the server).
function readStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

// Run `fn` while holding a cross-tab lock when the browser supports it (two
// tabs must not spend the same refresh token); otherwise just run it — http()
// already single-flights refreshes within this tab.
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator && navigator.locks) {
    return navigator.locks.request("lexgo-refresh", fn).then((v) => v);
  }
  return fn();
}

const noSubscribe = () => () => {};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [storedSession, setSession] = useState<Session | null>(readStoredSession);
  // false on the server and during hydration, true once hydrated — the stored
  // session stays hidden until then so server and client markup match.
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  const session = ready ? storedSession : null;
  const [authNotice, setAuthNotice] = useState<AuthNotice>(null);

  const persist = useCallback((s: Session | null) => {
    if (s) {
      localStorage.setItem(KEY, JSON.stringify(s));
      setToken(s.token ?? null);
    } else {
      localStorage.removeItem(KEY);
      setToken(null);
    }
    setSession(s);
  }, []);

  const expireSession = useCallback(() => {
    persist(null);
    setAuthNotice("sessionExpired");
  }, [persist]);

  // Called by http() on a 401 with `failedToken`. Returns a working access
  // token, or null. The session is dropped ONLY when /auth/refresh itself
  // answers 401/403 (inactive or revoked); 429, 5xx and network errors keep it.
  const refreshSession = useCallback(
    (failedToken: string): Promise<string | null> =>
      withRefreshLock(async () => {
        // Re-read inside the lock: another tab may have rotated the tokens
        // (or logged out) while we waited.
        const cur = readStoredSession();
        if (!cur?.token) return null;
        if (failedToken && cur.token !== failedToken) {
          setToken(cur.token);
          return cur.token;
        }
        if (!cur.refreshToken) {
          expireSession();
          return null;
        }
        try {
          const r = await apiRefresh(cur.refreshToken);
          const now = readStoredSession();
          // Logged out or re-logged meanwhile → leave that session alone.
          if (!now || now.refreshToken !== cur.refreshToken) return now?.token ?? null;
          if (!r.token) return null;
          persist({ ...now, token: r.token, refreshToken: r.refreshToken || now.refreshToken });
          return r.token;
        } catch (e) {
          if (!(e instanceof ApiError) || (e.status !== 401 && e.status !== 403)) return null;
          const now = readStoredSession();
          if (now && now.refreshToken !== cur.refreshToken) return now.token ?? null;
          expireSession();
          return null;
        }
      }),
    [persist, expireSession],
  );

  // Declared before the mount effect so the /auth/me call below can refresh.
  useEffect(() => {
    setRefreshHandler(refreshSession);
    return () => setRefreshHandler(null);
  }, [refreshSession]);

  // Another tab logged out, logged in or rotated tokens → follow it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) setSession(readStoredSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const stored = readStoredSession();
    if (stored) {
      setToken(stored.token ?? null);
      // Refresh roles/permissions in the background for real (tokened) sessions.
      // An expired access token is refreshed inside http().
      if (stored.token) {
        // Merge into the LATEST stored session: a refresh during apiMe() has
        // already persisted new tokens that must not be overwritten.
        const applyMe = (u: Awaited<ReturnType<typeof apiMe>>) => {
          const cur = readStoredSession();
          if (!cur) return;
          persist({
            ...cur,
            name: u.name || cur.name,
            phone: u.phone || cur.phone,
            lexgoId: u.lexgoId || cur.lexgoId,
            accountStatus: u.accountStatus || cur.accountStatus,
            roles: u.roles,
            permissions: u.permissions,
            backendRole: u.primaryRole || cur.backendRole,
            twoFactorEnabled: u.twoFactorEnabled,
            twoFactorMethod: u.twoFactorMethod,
            twoFactorRequired: u.twoFactorRequired,
            telegramLinked: u.telegramLinked ?? cur.telegramLinked,
            acceptedConsents: u.acceptedConsents?.length ? u.acceptedConsents : cur.acceptedConsents,
          });
        };
        apiMe().then(applyMe).catch(() => {});
      }
    }
  }, [persist]);

  // Build + persist a session from a successful auth result.
  const sessionFromAuth = useCallback(
    (auth: AuthResult, phone: string, fallbackName?: string): Session => {
      const { token, refreshToken, user } = auth;
      setToken(token);
      const s: Session = {
        role: fromBackendRole(user.role),
        name: user.name || fallbackName || "",
        phone: user.phone || phone,
        id: user.id,
        lexgoId: user.lexgoId,
        accountStatus: user.accountStatus,
        plan: "free",
        completeness: user.role === "advokat" ? 60 : 100,
        token,
        refreshToken,
        roles: user.roles,
        permissions: user.permissions,
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorMethod: user.twoFactorMethod,
        backendRole: user.primaryRole,
        twoFactorRequired: user.twoFactorRequired,
        telegramLinked: user.telegramLinked,
        acceptedConsents: user.acceptedConsents,
      };
      persist(s);
      setAuthNotice(null);
      return s;
    },
    [persist],
  );

  const completeLogin2fa = useCallback(
    async (verificationId: string, code: string, rawPhone: string) => {
      const phone = normUzPhone(rawPhone);
      return sessionFromAuth(await loginVerify2fa(verificationId, code), phone);
    },
    [sessionFromAuth],
  );

  // Errors (bad credentials, 429, backend unreachable) reach the caller.
  const login = useCallback(
    async (rawPhone: string, password: string) => {
      const phone = normUzPhone(rawPhone);
      const res = await apiLogin(phone, password);
      // 2FA required (enabled, or mandatory for the role) → hand the challenge back.
      if ("twoFactorRequired" in res) return { twoFactor: res };
      return sessionFromAuth(res, phone);
    },
    [sessionFromAuth],
  );

  // Step 1: request an OTP. The code arrives by SMS or the Telegram bot and is
  // never in the response; 409/429/offline errors reach the caller.
  const startRegistration = useCallback(async (draft: RegistrationDraft) => {
    const role = (draft.accountType ?? "client") as Role;
    return registerStart({
      role: toBackendRole(role),
      name: draft.profile.name,
      firstName: draft.profile.firstName,
      lastName: draft.profile.lastName,
      middleName: draft.profile.middleName,
      phone: normUzPhone(draft.phone),
      password: draft.password,
    });
  }, []);

  // Step 2: verify the OTP, create the session, then upsert the seller profile.
  const register = useCallback(
    async (draft: RegistrationDraft, verificationId: string, code: string) => {
      const role = (draft.accountType ?? "client") as Role;
      const completeness = scoreCompleteness(role, draft.profile);
      const finish = (s: Session) => {
        persist(s);
        setAuthNotice(null);
        return s;
      };
      if (!verificationId) throw new ApiError(400, "verification_required");
      const res = await registerVerify(verificationId, code);
      // Account created, but its role needs 2FA at sign-in → go through /login.
      if ("loginRequired" in res) {
        setAuthNotice("loginRequired");
        return res;
      }
      // Seller roles are approval-based: no account/token yet — an admin must
      // accept the request. Surface a pending state instead of a session.
      if (res.pending) {
        return {
          pending: true as const,
          message: res.message || "Ro'yxatdan o'tish so'rovi adminga yuborildi",
        };
      }
      const { token, refreshToken, user } = res;
      setToken(token);
      return finish({
        role,
        name: user.name || draft.profile.name,
        phone: user.phone || normUzPhone(draft.phone),
        id: user.id,
        lexgoId: user.lexgoId,
        accountStatus: user.accountStatus,
        plan: "free",
        completeness,
        profile: draft.profile,
        token,
        refreshToken,
        roles: user.roles,
        permissions: user.permissions,
        backendRole: user.primaryRole || toBackendRole(role),
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorMethod: user.twoFactorMethod,
        twoFactorRequired: user.twoFactorRequired,
        telegramLinked: user.telegramLinked,
        acceptedConsents: user.acceptedConsents,
      });
    },
    [persist],
  );

  const update = useCallback((patch: Partial<Session>) => {
    setSession((prev) => {
      if (!prev) return prev;
      // Tokens may have been rotated by a refresh (possibly in another tab):
      // keep the stored ones instead of this render's copy.
      const latest = readStoredSession();
      const next = { ...prev, token: latest?.token ?? prev.token, refreshToken: latest?.refreshToken ?? prev.refreshToken, ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    // Best-effort server-side revocation of this refresh session, then clear
    // locally. http() reads the bearer token before its first await, so it is
    // still attached; /auth/logout never triggers a refresh.
    apiLogout(readStoredSession()?.refreshToken);
    setAuthNotice(null);
    persist(null);
  }, [persist]);

  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);

  return (
    <Ctx.Provider
      value={{ session, ready, login, completeLogin2fa, startRegistration, register, update, logout, authNotice, clearAuthNotice }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

// Lowercased, de-duplicated assigned roles plus the primary backend role.
// Primary roles now carry their own permission matrix, so RBAC must not
// depend on an explicit assigned-role row.
export function sessionRoles(s: Session | null): string[] {
  if (!s) return [];
  const all = [...(s.roles ?? []), s.backendRole ?? ""].map((r) => r.trim().toLowerCase()).filter(Boolean);
  return [...new Set(all)];
}

// Permission codes that unlock an /admin page — mirrors the `perm`s in
// AdminShell's NAV. Primary roles now get default NON-admin permissions too
// (lawyer/advocate: orders, cases, documents), so "has any permission" is no
// longer admin access.
export const ADMIN_PERMISSIONS = [
  "leads.manage",
  "services.manage",
  "subscriptions.manage",
  "templates.manage",
  "ads.manage",
  "users.manage",
  "lawyers.verify",
  "approvals.manage",
  "legal_aid.manage",
  "notifications.manage",
  "roles.manage",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

// Only advocates working in the call center may INITIATE audio/video calls.
// Everyone else (clients, regular lawyers/advocates) can still receive/join.
export function canMakeCalls(s: Session | null): boolean {
  return sessionRoles(s).some((r) => r.includes("call_center"));
}

// Admin access = an admin/superadmin role, or a permission that unlocks at
// least one admin page (so AdminShell never admits someone with an empty nav).
export function hasAdminAccess(s: Session | null): boolean {
  if (!s) return false;
  if (sessionRoles(s).some((r) => r === "superadmin" || r === "admin")) return true;
  return (s.permissions ?? []).some((p) => (ADMIN_PERMISSIONS as readonly string[]).includes(p));
}

// Roles that must use 2FA at login and cannot turn it off (DELETE /auth/2fa → 403).
const MANDATORY_2FA_ROLES = ["yurist", "advokat", "advokat_tashkiloti", "admin", "superadmin", "manager", "call_center", "sales"];
export function requiresTwoFactor(s: Session | null): boolean {
  if (!s) return false;
  // role !== "client" also covers lawyer/advocate sessions stored before
  // backendRole existed.
  if (s.twoFactorRequired || s.role !== "client") return true;
  return sessionRoles(s).some((r) => MANDATORY_2FA_ROLES.includes(r) || r.startsWith("call_center") || r.startsWith("sales"));
}
