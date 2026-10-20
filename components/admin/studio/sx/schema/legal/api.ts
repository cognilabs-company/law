import { asDict, http, isForbidden, isRouteMissing } from "@/lib/http";
import type { LegalResult, TranslitDirection } from "./model";

export const TRANSLITERATE_PATH = "/admin/legal/transliterate";

export type TranslitAvail = "unknown" | "on" | "off";
export type TranslitInput = { direction: TranslitDirection; title: string; body: string };

let avail: TranslitAvail = "unknown";

export function transliterateAvail(): TranslitAvail {
  return avail;
}

export function resetTransliterateAvail(): void {
  avail = "unknown";
}

export function isTranslitOff(e: unknown): boolean {
  return isRouteMissing(e) || isForbidden(e);
}

const part = (d: Record<string, unknown>, key: string): string | null => (typeof d[key] === "string" ? (d[key] as string) : null);

export function parseTransliteration(raw: unknown): LegalResult {
  const top = asDict(raw);
  const inner = asDict(top.result ?? top.data ?? top.item);
  const d = Object.keys(inner).length && (typeof inner.title === "string" || typeof inner.body === "string") ? inner : top;
  return { title: part(d, "title"), body: part(d, "body") };
}

export async function transliterate(input: TranslitInput, signal?: AbortSignal): Promise<LegalResult> {
  try {
    const res = parseTransliteration(await http(TRANSLITERATE_PATH, { method: "POST", body: JSON.stringify(input), signal }));
    avail = "on";
    return res;
  } catch (e) {
    if (isTranslitOff(e)) avail = "off";
    throw e;
  }
}
