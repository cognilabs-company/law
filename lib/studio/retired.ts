export const STUDIO_RETIRED_CODES: readonly string[] = ["K05", "K08", "K09", "MP04", "OPS03"];

export const isRetiredStudioCode = (code: unknown): boolean => typeof code === "string" && STUDIO_RETIRED_CODES.includes(code.trim().toUpperCase());

export type RetiredMove = { code: string; anchor: string; target: string; group: string };

export const RETIRED_MOVES: Readonly<Record<string, RetiredMove>> = {
  K05: { code: "K05", anchor: "K02", target: "K02", group: "services_packages" },
  K09: { code: "K09", anchor: "K02", target: "K02", group: "services_packages" },
  K08: { code: "K08", anchor: "K10", target: "", group: "process_quality" },
  MP04: { code: "MP04", anchor: "K12-PROMO", target: "K12-PROMO", group: "advertising" },
  OPS03: { code: "OPS03", anchor: "K10", target: "K10", group: "process_quality" },
};

export function retiredMoveOf(code: unknown): RetiredMove | null {
  if (!isRetiredStudioCode(code)) return null;
  return RETIRED_MOVES[String(code).trim().toUpperCase()] ?? null;
}

export function retiredGroupHref(move: RetiredMove, groupKey = move.group): string {
  return `/admin/studio/g/${encodeURIComponent(groupKey)}?retired=${encodeURIComponent(move.code)}`;
}
