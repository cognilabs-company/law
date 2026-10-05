import type { GuidePage, GuideRole } from "../types";
import { normPath } from "../routes";
import { CLIENT_PAGES } from "./client";
import { SELLER_PAGES } from "./seller";
import { ADMIN_PAGES } from "./admin";
import { SUPPORT_PAGES } from "./support";

export const GUIDE_PAGES: GuidePage[] = [...CLIENT_PAGES, ...SELLER_PAGES, ...ADMIN_PAGES, ...SUPPORT_PAGES];

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

const fits = (page: GuidePage, role: GuideRole) => !page.roles || page.roles.includes(role);

export function pageFor(path: string, role: GuideRole): GuidePage | null {
  const p = normPath(path);
  let best: { page: GuidePage; len: number } | null = null;
  for (const { page, rules } of COMPILED) {
    if (!fits(page, role)) continue;
    for (const { m, re } of rules) {
      if (re.test(p) && (!best || m.length > best.len)) best = { page, len: m.length };
    }
  }
  return best?.page ?? null;
}

export function stepTextKey(target: string, role: GuideRole, path = ""): string {
  const here = path ? pageFor(path, role) : null;
  const local = here?.tour.find((s) => s.target === target);
  if (local) return local.text;
  for (const { page } of COMPILED) {
    if (!fits(page, role)) continue;
    const step = page.tour.find((s) => s.target === target);
    if (step) return step.text;
  }
  return "";
}

export function registryHome(target: string, role: GuideRole): string {
  for (const { page, rules } of COMPILED) {
    if (!fits(page, role) || !page.tour.some((s) => s.target === target)) continue;
    const plain = rules.find(({ m }) => !m.includes("[") && (role === "staff" ? m.startsWith("/admin") : m.startsWith(`/portal/${role}`)));
    if (plain) return plain.m;
  }
  return "";
}
