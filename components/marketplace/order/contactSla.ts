import { shortDate } from "@/lib/date";
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

// The SLA times come as UTC (backend answers 2026-11-01 N2) and are read in
// Asia/Tashkent, UTC+5 all year with no daylight saving, whatever the
// browser's own zone: "31 Okt, 03:57". The deadline itself is the
// backend's; nothing here moves it.
const TASHKENT_MS = 5 * 3600_000;
export function tashkentDateTime(iso: string, locale: string): string {
  const at = new Date(iso);
  if (!iso || Number.isNaN(at.getTime())) return "";
  const wall = new Date(at.getTime() + TASHKENT_MS).toISOString();
  return `${shortDate(wall.slice(0, 10), locale)}, ${wall.slice(11, 16)}`;
}

// How the seller first made contact (N1): only a chat message, a file in
// the chat, or an audio or video call in the paid order's room counts. Any
// other value is left unsaid rather than shown as a code.
export const CONTACT_CHANNELS = ["chat", "chat_file", "audio", "video"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export function contactChannelOf(v: string): ContactChannel | "" {
  return (CONTACT_CHANNELS as readonly string[]).includes(v) ? (v as ContactChannel) : "";
}
