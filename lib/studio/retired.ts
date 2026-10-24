// Constructors the backend no longer serves from Studio (23 Oct 2026
// cleanup): their runtime functions remain, only the Studio surface is gone.
// A stale link to one lands on the Studio home with a note.
export const STUDIO_REMOVED_CODES: readonly string[] = ["CALL01", "INT01", "INT02", "INT03", "K10", "K12-M", "K13", "K14", "K20", "K21", "K22", "K25", "K27", "MP02", "MP03", "MP05", "MP06", "MP07", "MP08", "SEC01", "SEC02", "SEC03", "SEC04", "SEC05"];

// Commented out of Studio (24 Oct 2026): the whole "Operatsiyalar" and
// "Tizim va ma'lumotnomalar" sections, and "Narx qoidalari" (K04) and
// "To'lov operatsiyalari" (K18) in "Moliya va tariflar". The backend no
// longer lists them either. Their code stays; to bring one back, take it
// off this list (and un-comment it in lib/studio/constructors.ts).
export const STUDIO_PAUSED_CODES: readonly string[] = [
  // Operatsiyalar
  "OPS01", "OPS02", "OPS04", "OPS05", "OPS06", "ORG01", "K23", "K24", "MP01", "MP10", "K28", "K19",
  // Tizim va ma'lumotnomalar
  "CORE", "K16", "OPS07", "OPS08", "SEARCH01", "M1", "M2", "M3",
  // Moliya va tariflar
  "K04", "K18",
];

export const STUDIO_RETIRED_CODES: readonly string[] = ["K05", "K08", "K09", "MP04", "OPS03", ...STUDIO_REMOVED_CODES, ...STUDIO_PAUSED_CODES];

export const isRetiredStudioCode = (code: unknown): boolean => typeof code === "string" && STUDIO_RETIRED_CODES.includes(code.trim().toUpperCase());

export type RetiredMove = { code: string; anchor: string; target: string; group: string };

export const RETIRED_MOVES: Readonly<Record<string, RetiredMove>> = {
  K05: { code: "K05", anchor: "K02", target: "K02", group: "services_packages" },
  K09: { code: "K09", anchor: "K02", target: "K02", group: "services_packages" },
  K08: { code: "K08", anchor: "", target: "", group: "" },
  MP04: { code: "MP04", anchor: "K12-PROMO", target: "K12-PROMO", group: "advertising" },
  OPS03: { code: "OPS03", anchor: "", target: "", group: "" },
};

export function retiredMoveOf(code: unknown): RetiredMove | null {
  if (!isRetiredStudioCode(code)) return null;
  const c = String(code).trim().toUpperCase();
  return RETIRED_MOVES[c] ?? { code: c, anchor: "", target: "", group: "" };
}

// No group to go to: the Studio home says the constructor is gone.
export function retiredGroupHref(move: RetiredMove, groupKey = move.group): string {
  if (!groupKey) return `/admin/studio?retired=${encodeURIComponent(move.code)}`;
  return `/admin/studio/g/${encodeURIComponent(groupKey)}?retired=${encodeURIComponent(move.code)}`;
}
