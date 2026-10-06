// Translated labels for raw backend enums (order/case status, stages,
// regions) with a safe fallback to a readable version of the raw value, so no
// locale ever shows a bare slug or hits a MISSING_MESSAGE.
import { REGION_KEYS } from "@/lib/lawyers";

type T = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

export const humanize = (v: string) => (v || "").replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const STATUS_NAMESPACES = ["status", "orderStatus", "orderStage", "paymentStatus", "docStatus"] as const;
export type StatusNamespace = (typeof STATUS_NAMESPACES)[number];

// tc = useTranslations("portal.common"): tries status.*, orderStatus.*,
// orderStage.*, paymentStatus.*, docStatus.* in that order, first hit wins.
//
// `prefer` moves one namespace to the front. First-hit-wins means a value
// several namespaces define always resolves to whichever is listed earlier,
// and for the document-request screens that is the wrong sentence: the shared
// status.claimed is "Olingan" (somebody took the queue row) where
// docStatus.claimed is "Advokat ish boshladi" (your document is being worked
// on), and status.open_pool is "Bo'sh navbatda" where docStatus.open_pool is
// "Advokat kutilmoqda" — the difference between describing a queue and telling
// the client what is happening to their document. Those screens pass
// "docStatus"; every other call site keeps the order it has always had.
export function statusLabel(tc: T, value?: string | null, prefer?: StatusNamespace): string {
  const v = (value || "").trim();
  if (!v) return "";
  if (prefer && tc.has(`${prefer}.${v}`)) return tc(`${prefer}.${v}`);
  for (const ns of STATUS_NAMESPACES) {
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

// A person's name, without the id fragment some accounts carry in it.
// Twelve of the seventy advocate accounts on production are seeded with one —
// "Iqtisodiy Advokat 81ebba64", "AI Docs Seller b03c26ef" — and the operator
// picking a panel sees it in every row. The backend stores it as part of the
// name, so there is nothing to ask for at read time; this drops it at the
// point of display.
//
// Deliberately narrow, because this runs over real people's names: only a
// trailing word of six or more characters, all of them hex digits, carrying
// BOTH a letter and a number. A surname cannot be mistaken for that — "Decade"
// is all hex letters but has no digit, "2026" has no letter and is too short —
// and a name that is nothing but the fragment is left alone rather than
// emptied.
const ID_TAIL = /\s+(?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{6,}$/i;
export function personName(value?: string | null): string {
  const s = (value || "").trim();
  const out = s.replace(ID_TAIL, "").trim();
  return out || s;
}

const DOC_NEXT_ACTION_KEYS = new Map([
  ["So'rov holatini kuzating", "nextTrack"],
  ["Tayyor hujjatni yuklab oling", "nextDownload"],
  ["Advokat hujjatni tayyorlagandan keyin shu sahifada yuklab olasiz", "nextLawyer"],
  ["Ma'lumotlarni tekshirib hujjatni yarating", "nextFill"],
]);
export function docNextActionKey(raw?: string | null): string {
  return DOC_NEXT_ACTION_KEYS.get((raw || "").trim().replace(/[‘’ʻʼ`]/g, "'")) ?? "";
}
