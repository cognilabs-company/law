import { http, asDict, asStr, asNum, asArr, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";

export type PriceTarget = "service" | "package";

export type PriceOption = {
  id: string;
  label: string;
  description: string;
  adjustmentType: string;
  value: number;
  sortOrder: number;
};

export type PriceOptionSection = {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  options: PriceOption[];
};

export type PriceOptionsForm = {
  targetType: PriceTarget;
  targetId: string;
  basePrice: number;
  currency: string;
  allOptional: boolean;
  sections: PriceOptionSection[];
};

export type QuoteLine = {
  id: string;
  label: string;
  adjustmentType: string;
  value: number;
  amount: number;
};

export type PriceQuote = {
  basePrice: number;
  totalPrice: number;
  currency: string;
  breakdown: QuoteLine[];
  selectedOptionIds: string[];
};

const bySort = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

function normOption(raw: unknown, i: number): PriceOption {
  const d = asDict(raw);
  return {
    id: asStr(d.id ?? d.option_id ?? d.key),
    label: asStr(d.label ?? d.title ?? d.name),
    description: asStr(d.description),
    adjustmentType: asStr(d.adjustment_type ?? d.type, "fixed").toLowerCase(),
    value: asNum(d.value ?? d.amount),
    sortOrder: asNum(d.sort_order, i + 1),
  };
}

function normSection(raw: unknown, i: number): PriceOptionSection {
  const d = asDict(raw);
  return {
    id: asStr(d.id ?? d.key) || `s${i}`,
    title: asStr(d.title ?? d.label),
    description: asStr(d.description),
    sortOrder: asNum(d.sort_order, i + 1),
    options: asArr(d.options).map(normOption).filter((o) => o.id).sort(bySort),
  };
}

export function normPriceOptions(raw: unknown, target: PriceTarget, id: string): PriceOptionsForm {
  const d = asDict(raw);
  return {
    targetType: (asStr(d.target_type) as PriceTarget) || target,
    targetId: asStr(d.target_id) || id,
    basePrice: uzs(d, "base_price", "price"),
    currency: asStr(d.currency, "UZS") || "UZS",
    allOptional: d.all_optional !== false,
    sections: asArr(d.sections).map(normSection).filter((s) => s.options.length).sort(bySort),
  };
}

function normLine(raw: unknown): QuoteLine {
  const d = asDict(raw);
  return {
    id: asStr(d.option_id ?? d.id ?? d.key),
    label: asStr(d.label ?? d.title ?? d.name ?? d.description),
    adjustmentType: asStr(d.adjustment_type ?? d.type).toLowerCase(),
    value: asNum(d.value),
    amount: uzs(d, "amount", "price", "delta"),
  };
}

export function normQuote(raw: unknown, ids: string[]): PriceQuote {
  const root = asDict(raw);
  const q: Dict = Object.keys(asDict(root.quote)).length ? asDict(root.quote) : root;
  const base = uzs(q, "base_price", "price");
  return {
    basePrice: base,
    totalPrice: uzs(q, "total_price", "total", "amount") || base,
    currency: asStr(q.currency, "UZS") || "UZS",
    breakdown: asArr(q.breakdown ?? q.lines ?? q.items).map(normLine).filter((l) => l.label || l.amount),
    selectedOptionIds: asArr(q.selected_option_ids).map((x) => asStr(x)).filter(Boolean).length ? asArr(q.selected_option_ids).map((x) => asStr(x)).filter(Boolean) : ids,
  };
}

const enc = encodeURIComponent;

export async function getPriceOptions(target: PriceTarget, id: string, signal?: AbortSignal): Promise<PriceOptionsForm> {
  const path = target === "service" ? `/marketplace/services/${enc(id)}/price-options` : `/marketplace/service-packages/${enc(id)}/price-options`;
  return normPriceOptions(await http(path, { signal }), target, id);
}

export async function getPriceQuote(
  target: PriceTarget,
  id: string,
  selectedOptionIds: string[],
  opts: { lawyerUserId?: string; signal?: AbortSignal } = {},
): Promise<PriceQuote> {
  const path = target === "service" ? `/marketplace/services/${enc(id)}/quote` : `/marketplace/service-packages/${enc(id)}/quote`;
  const body: Dict = { selected_option_ids: selectedOptionIds };
  if (target === "service" && opts.lawyerUserId) body.lawyer_user_id = opts.lawyerUserId;
  return normQuote(await http(path, { method: "POST", body: JSON.stringify(body), signal: opts.signal }), selectedOptionIds);
}
