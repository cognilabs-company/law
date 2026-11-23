import type { SxValues, SxWarning } from "../contract";

const upper = (code: string): string => String(code ?? "").trim().toUpperCase();

export function ctorWarnings(code: string, next: SxValues, prev: SxValues | null, ctx: { descendants?: number; isNew: boolean }): SxWarning[] {
  const out: SxWarning[] = [];
  const cur: SxValues = next ?? {};
  switch (upper(code)) {
    case "K01": {
      const n = typeof ctx?.descendants === "number" && Number.isFinite(ctx.descendants) ? ctx.descendants : 0;
      if (prev?.is_active === true && cur.is_active === false && n > 0) out.push({ key: "sx.warn.K01__cascade", tone: "warn", values: { n }, path: "is_active" });
      break;
    }
    case "K31": {
      if (cur.is_active === true && (ctx?.isNew === true || !prev || cur.version !== prev.version || cur.body !== prev.body)) out.push({ key: "sx.warn.K31__reaccept", tone: "warn", path: "version" });
      break;
    }
    // K02 has no max_price any more (2026-11-21 contract §3): the price is
    // the base × verified coefficients, with no upper cap.
  }
  return out;
}
