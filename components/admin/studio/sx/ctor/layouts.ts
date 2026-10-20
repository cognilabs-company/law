import type { SxCtorLayout, SxLayoutField } from "../contract";
import { ctorVariant } from "../labels";
import { GENERIC_LAYOUTS } from "./generic";
import { K12_PROMO_LAYOUT } from "./k12";
import { K29_CHECKLIST_LAYOUT, SERVICE_LAYOUTS } from "./services";

const own = Object.prototype.hasOwnProperty;

export function layoutKey(code: string, variant?: string): string {
  const c = String(code ?? "").trim();
  const v = String(variant ?? "").trim();
  return v ? `${c}__${v}` : c;
}

const ALL: readonly SxCtorLayout[] = [...Object.values(GENERIC_LAYOUTS), ...Object.values(SERVICE_LAYOUTS), K29_CHECKLIST_LAYOUT, K12_PROMO_LAYOUT];

export const CTOR_LAYOUTS: Readonly<Record<string, SxCtorLayout>> = Object.freeze(Object.fromEntries(ALL.map((l) => [layoutKey(l.code, l.variant), l])));

const fallbacks = new Map<string, SxCtorLayout>();
const HIDDEN_SLUG: readonly SxLayoutField[] = [{ path: "slug", hidden: true }];

function fallback(code: string, variant: string): SxCtorLayout {
  const key = layoutKey(code, variant);
  let hit = fallbacks.get(key);
  if (!hit) {
    hit = variant ? { code, variant, fields: HIDDEN_SLUG } : { code, fields: HIDDEN_SLUG };
    fallbacks.set(key, hit);
  }
  return hit;
}

export function ctorLayoutOf(code: string, runtimeTarget: string): SxCtorLayout {
  const raw = String(code ?? "").trim();
  const upper = raw.toUpperCase();
  const c = own.call(CTOR_LAYOUTS, raw) || !own.call(CTOR_LAYOUTS, upper) ? raw : upper;
  const variant = ctorVariant(c, runtimeTarget);
  const key = layoutKey(c, variant);
  return own.call(CTOR_LAYOUTS, key) ? CTOR_LAYOUTS[key] : fallback(c, variant);
}
