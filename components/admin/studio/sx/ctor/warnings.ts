import type { SxValues, SxWarning } from "../contract";

const numOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

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
    case "K02": {
      const max = numOf(cur.max_price);
      const base = numOf(cur.base_price);
      if (max !== null && base !== null && max > 0 && base > 0 && max < base) out.push({ key: "sx.warn.K02__maxBelowBase", tone: "warn", path: "max_price" });
      break;
    }
  }
  return out;
}
