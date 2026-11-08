import type { GuidePage, GuideRole, RegistryTarget } from "../types";
import { normPath } from "../routes";
import { guidePageAllowed, guideStepAllowed } from "../access";
import { CLIENT_PAGES } from "./client";
import { SELLER_PAGES } from "./seller";
import { ADMIN_PAGES } from "./admin";
import { SUPPORT_PAGES } from "./support";
import { COMPLAINT_PAGES } from "./complaints";

export const GUIDE_PAGES: GuidePage[] = [...CLIENT_PAGES, ...SELLER_PAGES, ...ADMIN_PAGES, ...SUPPORT_PAGES, ...COMPLAINT_PAGES];

const toRegex = (pattern: string) =>
  new RegExp(
    "^" +
      normPath(pattern)
        .split("/")
        .map((seg) => (/^\[.+\]$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("/") +
      "$",
  );

const COMPILED = GUIDE_PAGES.map((page) => ({ page, rules: page.match.map((m) => ({ m, re: toRegex(m) })) }));

// Role first, then the account's own permissions (lib/guide/access.ts): a
// page or a step the session may not use is never part of a tour or of the
// AI instructor's targets.
const fits = (page: GuidePage, role: GuideRole) => (!page.roles || page.roles.includes(role)) && guidePageAllowed(page.id);
const allowedTour = (page: GuidePage) => page.tour.filter((s) => guideStepAllowed(s.target));
const withAllowedTour = (page: GuidePage): GuidePage => {
  const tour = allowedTour(page);
  return tour.length === page.tour.length ? page : { ...page, tour };
};

export function pageFor(path: string, role: GuideRole): GuidePage | null {
  const p = normPath(path);
  let best: { page: GuidePage; len: number } | null = null;
  for (const { page, rules } of COMPILED) {
    if (!fits(page, role)) continue;
    for (const { m, re } of rules) {
      if (re.test(p) && (!best || m.length > best.len)) best = { page, len: m.length };
    }
  }
  return best ? withAllowedTour(best.page) : null;
}

export function stepTextKey(target: string, role: GuideRole, path = ""): string {
  const here = path ? pageFor(path, role) : null;
  const local = here?.tour.find((s) => s.target === target);
  if (local) return local.text;
  if (!guideStepAllowed(target)) return "";
  const owners = COMPILED.filter(({ page }) => fits(page, role) && page.tour.some((s) => s.target === target));
  if (owners.length !== 1) return "";
  return owners[0].page.tour.find((s) => s.target === target)?.text ?? "";
}

const SHELL = /^(ai-help|header|nav):/;

const plainRoute = (rules: { m: string }[], role: GuideRole) =>
  rules.find(({ m }) => !m.includes("[") && (role === "staff" ? m.startsWith("/admin") : m.startsWith(`/portal/${role}`)))?.m ?? "";

export function registryHome(target: string, role: GuideRole): string {
  if (SHELL.test(target) || !guideStepAllowed(target)) return "";
  for (const { page, rules } of COMPILED) {
    if (!fits(page, role) || !page.tour.some((s) => s.target === target)) continue;
    const plain = plainRoute(rules, role);
    if (plain) return plain;
  }
  return "";
}

export function registryTargets(role: GuideRole, path = ""): RegistryTarget[] {
  const here = path ? pageFor(path, role) : null;
  const columns: RegistryTarget[][] = [];
  for (const { page, rules } of COMPILED) {
    if (!fits(page, role) || page === here) continue;
    const route = plainRoute(rules, role);
    if (!route || (path && normPath(route) === normPath(path))) continue;
    const steps = allowedTour(page).filter((s) => !SHELL.test(s.target)).map((s) => ({ id: s.target, text: s.text, route, page: page.id }));
    if (steps.length) columns.push(steps);
  }
  const out: RegistryTarget[] = [];
  const seen = new Set<string>();
  const depth = Math.max(0, ...columns.map((c) => c.length));
  for (let i = 0; i < depth; i++) {
    for (const col of columns) {
      const item = col[i];
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
