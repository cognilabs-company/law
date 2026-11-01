// What a subscriber agrees to before paying (launch compliance 2026-11-01):
// the amount due now, how long it lasts and what — if renewal stays on — is
// charged again, all read off the backend's own amounts. Nothing is
// discounted or added here.

// Months a billing period runs for (BILLING_PERIODS of the backend).
const PERIOD_MONTHS: Record<string, number> = { monthly: 1, six_month: 6, yearly: 12, prepaid_yearly: 12 };
export function periodMonths(period: string): number {
  return PERIOD_MONTHS[period] ?? 1;
}

export type RenewalTerms = {
  months: number;
  // Charged today: the backend's quote (or the plan's price for the period).
  payNow: number;
  // Charged each later period while renewal is on: the plan's listed price for
  // the period; a promotion lowers only the first one.
  renewAt: number;
  // The first period is cheaper than the ones after it.
  promo: boolean;
};

export function renewalTerms(period: string, payNow: number, listed = 0): RenewalTerms {
  const now = Math.max(0, Math.round(payNow || 0));
  const later = listed > now ? Math.round(listed) : now;
  return { months: periodMonths(period), payNow: now, renewAt: later, promo: later !== now };
}

// The package with the lowest price per day, for an honest "lowest price per
// day" mark; "" when there is nothing to compare or two share the lowest.
export function cheapestPerDay(packs: readonly { id: string; price: number; days: number }[]): string {
  const rated = packs.filter((p) => p.days > 0 && p.price > 0).map((p) => ({ id: p.id, rate: p.price / p.days }));
  if (rated.length < 2) return "";
  const min = Math.min(...rated.map((p) => p.rate));
  const best = rated.filter((p) => Math.abs(p.rate - min) < 1e-9);
  return best.length === 1 ? best[0].id : "";
}
