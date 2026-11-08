// The one place that decides whether the signed-in account may do something.
//
// Owner law (2026-11-08): an action the user has no permission for is not
// shown at all. Every screen asks `can(session, code)` (or the `useCan` hook
// in lib/useCan.ts) before it renders a button, menu item, row action, tab,
// palette entry or empty-state call to action that needs a permission.
//
// Permission codes are the backend's own (session.permissions from
// /auth/login and /auth/me; the per-endpoint codes in docs/). Never invent
// one here. Kept free of React and of lib/auth.tsx so unit tests and
// non-React modules can use it.

export type PermissionSubject = {
  roles?: readonly string[];
  backendRole?: string;
  permissions?: readonly string[];
} | null | undefined;

export type CanOptions = {
  // true: every listed code is needed. Default: any one of them is enough.
  all?: boolean;
  // Roles the backend itself grants this action to, whatever the session's
  // permission list says (e.g. leads.manage: "admins hold everything").
  // Only roles a backend contract names belong here.
  roles?: readonly string[];
};

// Lowercased, de-duplicated assigned roles plus the primary backend role.
export function rolesOf(s: PermissionSubject): string[] {
  if (!s) return [];
  const all = [...(s.roles ?? []), s.backendRole ?? ""].map((r) => r.trim().toLowerCase()).filter(Boolean);
  return [...new Set(all)];
}

// Superadmin keeps everything.
export function isSuperadmin(s: PermissionSubject): boolean {
  return rolesOf(s).includes("superadmin");
}

export function hasRole(s: PermissionSubject, role: string | readonly string[]): boolean {
  const want = (typeof role === "string" ? [role] : role).map((r) => r.toLowerCase());
  return rolesOf(s).some((r) => want.includes(r));
}

// The session's own permission codes (trimmed, de-duplicated).
export function permissionsOf(s: PermissionSubject): string[] {
  if (!s) return [];
  return [...new Set((s.permissions ?? []).map((p) => p.trim()).filter(Boolean))];
}

// May this session do it? `perm` is one backend permission code or a list
// (any one is enough unless `all`). Signed out → false. Superadmin, or a
// session holding the backend's "*" wildcard → true.
export function can(s: PermissionSubject, perm: string | readonly string[], opts: CanOptions = {}): boolean {
  if (!s) return false;
  if (isSuperadmin(s)) return true;
  const held = permissionsOf(s);
  if (held.includes("*")) return true;
  if (opts.roles?.length && hasRole(s, opts.roles)) return true;
  const want = (typeof perm === "string" ? [perm] : [...perm]).filter(Boolean);
  if (!want.length) return false;
  return opts.all ? want.every((p) => held.includes(p)) : want.some((p) => held.includes(p));
}

// Did the permission set change between two sessions? Used by the 403
// safety net to tell "access was revoked" from an object-level refusal.
export function samePermissions(a: PermissionSubject, b: PermissionSubject): boolean {
  const x = permissionsOf(a).sort();
  const y = permissionsOf(b).sort();
  const rx = rolesOf(a).sort();
  const ry = rolesOf(b).sort();
  return x.length === y.length && x.every((p, i) => p === y[i]) && rx.length === ry.length && rx.every((r, i) => r === ry[i]);
}

// Backend permission codes several screens share (named by the contracts in
// docs/). Kept here so a light component need not import a heavy screen.
// Verification queues (experience, achievements, licenses): 2026-10-29 §1;
// approvals.manage is only a legacy alias the frontend must not check.
export const REVIEW_PERMISSION = "marketplace.experience.review";
