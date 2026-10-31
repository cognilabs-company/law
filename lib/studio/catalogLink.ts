"use client";

// A link into Studio only for a constructor the current catalog lists
// (backend answers 2026-10-31 §4.7): the backend drops removed constructors
// on its startup sync, so a hard-coded /admin/studio/c/{code} may point at
// nothing. Until the catalog has loaded, and when Studio is off for this
// account, there is no link.

import { useStudioRegistry } from "@/lib/services/studio";
import { isRetiredStudioCode } from "@/lib/studio/retired";

const enc = encodeURIComponent;

export function inStudioCatalog(code: string, items: readonly { code: string }[]): boolean {
  const c = code.trim().toUpperCase();
  return !!c && !isRetiredStudioCode(c) && items.some((x) => x.code.trim().toUpperCase() === c);
}

// The constructor code a Studio URL opens (/admin/studio/c/{code} or
// /admin/studio/o/new?new={code}); "" for any other URL.
export function studioCodeOf(href: string): string {
  const m = /^\/admin\/studio\/c\/([^/?#]+)/.exec(href) ?? /^\/admin\/studio\/o\/new\?(?:.*&)?new=([^&#]+)/.exec(href);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

// Every check a page needs: `has(code)`, the list/new hrefs, and whether a
// backend-sent Studio URL may be followed.
export function useStudioCatalog(): { ready: boolean; has: (code: string) => boolean; listHref: (code: string) => string; newHref: (code: string) => string; allow: (href: string) => string } {
  const reg = useStudioRegistry();
  const ready = reg.avail === "on";
  const has = (code: string) => ready && inStudioCatalog(code, reg.items);
  return {
    ready,
    has,
    listHref: (code) => (has(code) ? `/admin/studio/c/${enc(code)}` : ""),
    newHref: (code) => (has(code) ? `/admin/studio/o/new?new=${enc(code)}` : ""),
    allow: (href) => {
      const code = studioCodeOf(href);
      return code ? (has(code) ? href : "") : href;
    },
  };
}
