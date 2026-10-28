// TSK-460646 — the manual Superadvokat override (contract 2026-10-27 §20).
// Only the configured primary superadmin may change it (others get 403
// primary_superadmin_required); every change keeps its reason, period and
// the before/after values in an audit history. An expired override stops
// applying on its own; the backend recalculates price and rating.
import { ApiError, asArr, asDict, asStr, http } from "@/lib/http";

export type SuperEntry = {
  id: string;
  active: boolean;
  reason: string;
  startsAt: string;
  endsAt: string;
  before: string;
  after: string;
  by: string;
  at: string;
};

const flag = (v: unknown): string => (v === true ? "on" : v === false ? "off" : typeof v === "string" ? v : asStr(asDict(v).active === true ? "on" : asDict(v).active === false ? "off" : ""));

export function superEntryOf(v: unknown): SuperEntry {
  const d = asDict(v);
  const actor = asDict(d.changed_by ?? d.actor ?? d.created_by);
  const next = d.new_value ?? d.after ?? d.active;
  return {
    id: asStr(d.id),
    active: d.active === true || asDict(d.new_value).active === true || next === true,
    reason: asStr(d.reason),
    startsAt: asStr(d.starts_at ?? asDict(d.new_value).starts_at),
    endsAt: asStr(d.ends_at ?? asDict(d.new_value).ends_at),
    before: flag(d.old_value ?? d.before ?? d.previous_value),
    after: flag(next),
    by: asStr(actor.name ?? actor.full_name ?? d.changed_by_name),
    at: asStr(d.created_at ?? d.changed_at),
  };
}

export async function getSuperHistory(sellerUserId: string, signal?: AbortSignal): Promise<SuperEntry[]> {
  const d = await http(`/admin/marketplace/sellers/${encodeURIComponent(sellerUserId)}/superadvokat/history`, { signal });
  const items = asArr(Array.isArray(d) ? d : asDict(d).items).map(superEntryOf);
  return items.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
}

// Whether an override applies at `now`: the newest entry decides, and an
// end date in the past means it no longer applies.
export function superActiveAt(history: SuperEntry[], now: number): { active: boolean; until: string } {
  const last = history[0];
  if (!last || !last.active) return { active: false, until: "" };
  const start = Date.parse(last.startsAt);
  const end = Date.parse(last.endsAt);
  if (Number.isFinite(start) && start > now) return { active: false, until: "" };
  if (Number.isFinite(end) && end <= now) return { active: false, until: "" };
  return { active: true, until: last.endsAt };
}

export type SuperInput = { active: boolean; reason: string; startsAt: string; endsAt: string };
export function superBody(input: SuperInput): Record<string, unknown> {
  const body: Record<string, unknown> = { active: input.active, reason: input.reason.trim(), starts_at: input.startsAt };
  if (input.endsAt) body.ends_at = input.endsAt;
  return body;
}
export async function setSuperadvokat(sellerUserId: string, input: SuperInput): Promise<void> {
  await http(`/admin/marketplace/sellers/${encodeURIComponent(sellerUserId)}/superadvokat`, { method: "PUT", body: JSON.stringify(superBody(input)) });
}
export const isPrimaryOnly = (e: unknown) => e instanceof ApiError && (e.code === "primary_superadmin_required" || e.status === 403);
