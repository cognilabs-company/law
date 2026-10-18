import { STUDIO_ROLES, studioCtorRank, type StudioAccessGrant, type StudioConstructor, type StudioGroup } from "@/lib/services/studio";
import { CrownIcon, DownloadIcon, EyeIcon, LayersIcon, PencilLineIcon, RocketIcon, RouteIcon } from "../icons";
import { HUES, type SxHue } from "../tones";
import type { SxIcon } from "../types";
import { UsersIcon } from "lucide-react";

export type SetTab = "access" | "routes" | "registry" | "export";
export type StudioRoleCode = (typeof STUDIO_ROLES)[number];

export const SET_TABS: readonly SetTab[] = ["access", "routes", "registry", "export"];
export const SET_AI = "admin.studio.settings";

export const TAB_ICON: Readonly<Record<SetTab, SxIcon>> = {
  access: UsersIcon,
  routes: RouteIcon,
  registry: LayersIcon,
  export: DownloadIcon,
};

export const TAB_HUE: Readonly<Record<SetTab, SxHue>> = {
  access: "blue",
  routes: "violet",
  registry: "jade",
  export: "amber",
};

export const ROLE_ICON: Readonly<Record<StudioRoleCode, SxIcon>> = {
  studio_editor: PencilLineIcon,
  studio_reviewer: EyeIcon,
  studio_publisher: RocketIcon,
  studio_admin: CrownIcon,
};

export const ROLE_HUE: Readonly<Record<StudioRoleCode, SxHue>> = {
  studio_editor: "blue",
  studio_reviewer: "violet",
  studio_publisher: "jade",
  studio_admin: "amber",
};

export type MatrixRow = { key: string; roles: readonly StudioRoleCode[] };

export const MATRIX: readonly MatrixRow[] = [
  { key: "create", roles: ["studio_editor", "studio_admin"] },
  { key: "edit", roles: ["studio_editor", "studio_admin"] },
  { key: "upload", roles: ["studio_editor", "studio_admin"] },
  { key: "submit", roles: ["studio_editor", "studio_admin"] },
  { key: "review", roles: ["studio_reviewer", "studio_admin"] },
  { key: "publish", roles: ["studio_publisher", "studio_admin"] },
  { key: "rollback", roles: ["studio_publisher", "studio_admin"] },
  { key: "archive", roles: ["studio_publisher", "studio_admin"] },
  { key: "access", roles: ["studio_admin"] },
];

export function isStudioRoleCode(r: string): r is StudioRoleCode {
  return (STUDIO_ROLES as readonly string[]).includes(r);
}

export function roleCodeOf(r: string): StudioRoleCode | null {
  const k = String(r ?? "").trim().toLowerCase();
  if (isStudioRoleCode(k)) return k;
  const pre = `studio_${k}`;
  return isStudioRoleCode(pre) ? pre : null;
}

export function grantKey(g: StudioAccessGrant): string {
  return g.id || g.userId;
}

export function grantName(g: StudioAccessGrant): string {
  return g.userName || g.phone || g.userId;
}

export function grantLexgo(g: StudioAccessGrant): string {
  const u = g.raw.user && typeof g.raw.user === "object" ? (g.raw.user as Record<string, unknown>) : {};
  const v = g.raw.lexgo_id ?? g.raw.lexgoId ?? u.lexgo_id ?? u.lexgoId;
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

export function initialsOf(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0].replace(/^\+/, "").charAt(0);
  const b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (a + b).toUpperCase() || "?";
}

export function hueOfName(name: string): SxHue {
  let h = 0;
  for (const ch of String(name ?? "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export function matchesTerms(hay: readonly (string | undefined | null)[], q: string): boolean {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = hay.filter(Boolean).join(" ").toLowerCase();
  return terms.every((w) => text.includes(w));
}

export function groupKeyOf(code: string, groups: readonly StudioGroup[], items: readonly StudioConstructor[]): string {
  const c = String(code ?? "").trim();
  if (!c) return "";
  const item = items.find((x) => x.code === c);
  if (item?.navigation?.groupKey) return item.navigation.groupKey;
  return groups.find((g) => g.codes.includes(c))?.key ?? "";
}

export function byCtorRank(a: string, b: string): number {
  return studioCtorRank(a) - studioCtorRank(b) || a.localeCompare(b);
}

export const USER_ID_RE = /^(\d{1,12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24})$/i;
