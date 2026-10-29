import { asDict, asStr } from "@/lib/http";

// A label the backend sends with its translations (contract 2026-10-29
// §2, §7, §8): shown as label_i18n[language], else label. Our locales map to
// the backend's keys: uz → uz_latn, ru → ru, en → en.
export type Labelled = { label: string; i18n: Record<string, string> };
export const apiLang = (locale: string) => (locale === "uz" ? "uz_latn" : locale);
export function labelledOf(v: unknown): Labelled {
  const d = asDict(v);
  const i18n = Object.fromEntries(Object.entries(asDict(d.label_i18n)).filter(([, y]) => typeof y === "string" && y.trim()).map(([k, y]) => [k, String(y).trim()]));
  return { label: asStr(d.label).trim(), i18n };
}
// "" when the backend sent no label: the caller leaves the item out rather
// than showing its code.
export const labelIn = (l: Labelled | null | undefined, locale: string): string => (l ? l.i18n[apiLang(locale)] || l.label : "");
