"use client";

import { useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { canInternal, type InternalPermission } from "@/lib/services/internalHrm";
import { NAV_GROUPS, type NavItem } from "@/components/internal/nav";
import { hrmRoute } from "./text";

// Who may write in a catalog module (owner law 2026-11-08: an action the
// account has no permission for is not shown). The catalog itself names no
// permission per record type, so the code the HRM menu already puts on each
// module's page and record type (components/internal/nav.ts — the 10-08
// contract's internal_*.manage codes) is the one asked here. A module or a
// record type the menu leaves open to every employee (leave, travel,
// learning, policies, …) stays open; the backend checks again.

const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
const itemsOf = (domain: string) => NAV_ITEMS.filter((i) => i.href === hrmRoute(domain));

// The permission the whole module's page sits behind: every menu entry for
// it carries the same code. No entry, or entries without one: open.
export function modulePermission(domain: string): InternalPermission | null {
  const items = itemsOf(domain);
  if (!items.length || items.some((i) => !i.permission)) return null;
  const first = items[0].permission ?? null;
  return items.every((i) => i.permission === first) ? first : null;
}

// The permission one record type of a module needs: its own menu entry's,
// else the module page's own entry (the one without ?type=), else the
// module's shared code.
export function typePermission(domain: string, type: string): InternalPermission | null {
  const items = itemsOf(domain);
  const own = items.find((i) => i.type === type);
  if (own) return own.permission ?? null;
  const page = items.find((i) => !i.type);
  if (page) return page.permission ?? null;
  return modulePermission(domain);
}

// Reopening a closed timesheet: internal_time.manage AND
// internal_payroll.manage (HRM 10-13 §1.2, 10-14 timesheet row). Admins
// hold every internal_* code (10-08 guide).
export const REOPEN_SHEET: InternalPermission[] = ["internal_time.manage", "internal_payroll.manage"];

export function useHrmAccess() {
  const { session } = useAuth();
  const has = useCallback((p: InternalPermission | null) => !p || canInternal(session, p), [session]);
  const canModule = useCallback((domain: string) => has(modulePermission(domain)), [has]);
  const canType = useCallback((domain: string, type: string) => has(typePermission(domain, type)), [has]);
  const canAll = useCallback((codes: readonly InternalPermission[]) => can(session, codes, { all: true, roles: ["admin", "superadmin"] }), [session]);
  return { session, has, canModule, canType, canAll };
}
