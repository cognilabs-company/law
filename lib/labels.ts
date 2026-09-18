// Translated labels for raw backend enums (order/case status, stages,
// regions) with a safe fallback to a readable version of the raw value, so no
// locale ever shows a bare slug or hits a MISSING_MESSAGE.
import { REGION_KEYS } from "@/lib/lawyers";

type T = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

export const humanize = (v: string) => (v || "").replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// tc = useTranslations("portal.common"): tries status.*, orderStatus.*, orderStage.*.
export function statusLabel(tc: T, value?: string | null): string {
  const v = (value || "").trim();
  if (!v) return "";
  for (const ns of ["status", "orderStatus", "orderStage", "paymentStatus", "docStatus"]) {
    if (tc.has(`${ns}.${v}`)) return tc(`${ns}.${v}`);
  }
  return humanize(v);
}

// te = useTranslations("enums"): backend region may be a key ("tashkent") or
// free text ("Toshkent", "Toshkent shahri") — resolve by label prefix.
export function regionKeyOf(te: T, value?: string | null): string {
  const s = (value || "").trim();
  if (!s) return "";
  if ((REGION_KEYS as readonly string[]).includes(s)) return s;
  const low = s.toLowerCase();
  const hit = REGION_KEYS.filter((r) => r !== "all").find((r) => {
    const l = te.has(`regions.${r}`) ? te(`regions.${r}`).toLowerCase() : r;
    return l === low || l.startsWith(low) || low.startsWith(l) || low.includes(r);
  });
  return hit ?? "";
}
export function regionLabel(te: T, value?: string | null): string {
  const k = regionKeyOf(te, value);
  return k && te.has(`regions.${k}`) ? te(`regions.${k}`) : (value || "");
}
