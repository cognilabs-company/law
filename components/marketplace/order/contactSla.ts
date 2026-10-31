import type { MarketOrder } from "@/lib/services/marketplace";

// Where the contact SLA stands (backend answers 2026-10-31 §1.3), from the
// backend's own times: contacted (contact_started_at), still counting down
// to contact_deadline_at, or past it. "late" only redraws the clock — the
// breach itself is the backend's (marketplace.contact_sla_breached), and
// the order is re-read when the clock reaches zero.
export type ContactSlaState = "started" | "running" | "late" | "none";

// `left`: the countdown's seconds to contact_deadline_at, null when there is
// no deadline to count to.
export function contactSlaState(o: Pick<MarketOrder, "contactStartedAt">, left: number | null): ContactSlaState {
  if (o.contactStartedAt) return "started";
  if (left === null) return "none";
  return left > 0 ? "running" : "late";
}

// Seconds left as hours and minutes once there is more than an hour, else
// as mm:ss — "today" and "tomorrow" deadlines run for many hours.
export function contactLeftParts(sec: number): { h: number; m: number; clock: string } {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return { h, m, clock: `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` };
}
