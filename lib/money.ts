// Money helpers for the T0-16 migration (LEXGO_BACKEND_IMPLEMENTATION_UPDATE_2026-09-14).
// The backend added canonical *_tiyin columns (1 so'm = 100 tiyin), but T0-16 is not
// done: the legacy fields still carry whole so'm (UZS) and stay the source of truth,
// and only payments were backfilled (other tiyin columns may be 0 or empty).
// The UI works in so'm only. Read backend amounts through uzs()/uzsOpt() so a tiyin
// value is never shown or sent as so'm; when the backend publishes the canonical
// contract, switch the reading here, in one place. Never scale amounts by 100
// anywhere else, and never add *_tiyin keys to request bodies before that contract.
import { asNum, type Dict } from "@/lib/http";

// Not used yet: kept for the T0-16 switch to canonical tiyin amounts.
export const TIYIN_PER_SOM = 100;

const present = (v: unknown) => typeof v === "number" || (typeof v === "string" && v.trim() !== "");

// First present legacy so'm key wins, in the given order. It never reads or falls
// back to a `*_tiyin` field: an unbackfilled tiyin twin could turn "no price" into 0.
// undefined = no amount. A nested object or boolean under a key counts as absent.
export function uzsOpt(d: Dict, ...keys: string[]): number | undefined {
  for (const k of keys) if (present(d[k])) return asNum(d[k]);
  return undefined;
}

export const uzs = (d: Dict, ...keys: string[]): number => uzsOpt(d, ...keys) ?? 0;

// Whole so'm with no-break-space grouping ("1 250 000"). Replaces
// toLocaleString("ru-RU").replace(/,/g, " "), which also replaced the decimal comma
// (1234.5 -> "1 234 5", read as 12345).
export function fmtUzs(n: number): string {
  return String(Math.round(asNum(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
