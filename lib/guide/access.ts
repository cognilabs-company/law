// Which guide pages and tour steps the signed-in account may be shown.
//
// Owner law (2026-11-08): an action the user has no permission for is not
// offered at all — that includes the guide tours and the AI instructor's
// cross-page targets (lib/ai/destinations.ts), not only the buttons. The
// codes are the ones the admin shell already gates the same pages/buttons
// on (components/admin/AdminShell.tsx NAV, lib/services/leads.ts
// canManageLeads, lib/auth.tsx canMakeCalls/isCallCenterUser) — none is
// invented here. GuideHost keeps the subject in step with the session.

import { can, hasRole, type PermissionSubject } from "@/lib/permissions";

let subject: PermissionSubject = null;

export function setGuideSubject(s: PermissionSubject): void {
  subject = s;
}

type Gate = (s: PermissionSubject) => boolean;

const perm = (code: string | readonly string[], roles?: readonly string[]): Gate => (s) => can(s, code, roles ? { roles } : {});
// AdminShell: a page with no permission code is for full admins only.
const fullAdmin: Gate = (s) => can(s, [], { roles: ["admin"] });
// lib/auth.tsx canMakeCalls: meetings.manage or a call-centre role.
const makesCalls: Gate = (s) => can(s, "meetings.manage") || hasRole(s, ["call_center", "call_center_lawyer"]);

// Staff guide pages (lib/guide/pages/admin.ts, support.ts) → the gate their
// admin page has in AdminShell NAV.
const PAGE_GATES: Record<string, Gate> = {
  admin_overview: fullAdmin,
  admin_ceo: fullAdmin,
  admin_pipeline: perm("leads.manage"),
  admin_call_center: perm(["leads.manage", "callcenter.access"], ["call_center_lawyer"]),
  admin_meetings: (s) => makesCalls(s) || can(s, ["leads.manage", "callcenter.access"]),
  admin_call_analytics: perm("leads.manage"),
  admin_retention: perm("leads.manage"),
  admin_b2b: perm("b2b.manage"),
  admin_marketplace: perm("orders.manage"),
  admin_services: perm("services.manage"),
  admin_plans: perm("subscriptions.manage"),
  admin_templates: perm("templates.manage"),
  admin_ads: perm("ads.manage"),
  admin_register_requests: perm("users.manage"),
  admin_reviews: perm("lawyers.verify"),
  admin_payouts: perm("payments.manage"),
  admin_approvals: perm("approvals.manage"),
  admin_legal_aid: perm("legal_aid.manage"),
  admin_notifications: perm("notifications.manage"),
  admin_integrations: fullAdmin,
  admin_test_otps: fullAdmin,
  admin_roles: perm("roles.manage"),
  admin_audit_trail: perm("users.manage"),
  admin_legal: perm("users.manage"),
  admin_policies: fullAdmin,
  admin_bootstrap: fullAdmin,
  admin_support: perm("callcenter.access", ["call_center", "call_center_lawyer"]),
};

// Tour steps that point at an action with its own gate, stricter than the
// page's (the page is reachable without it).
const STEP_GATES: Record<string, Gate> = {
  "button:new-lead": perm("leads.manage", ["admin"]),
  "button:auto-assign": perm("leads.manage", ["admin"]),
  "meetings:create": makesCalls,
};

export function guidePageAllowed(pageId: string): boolean {
  const g = PAGE_GATES[pageId];
  return !g || g(subject);
}

export function guideStepAllowed(target: string): boolean {
  const g = STEP_GATES[target];
  return !g || g(subject);
}
