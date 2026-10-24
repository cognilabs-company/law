import { localDay, shortDate, dateOnly, timeOnly, weekdays } from "@/lib/date";
import type { SecureParticipant, SecureRoom } from "@/lib/services/backend";

// Small pure helpers shared by the conversation list and the room header.

type T = (key: string, values?: Record<string, string | number>) => string;

// `role` is the backend's own word. "seller" is what a room's participants
// call the lawyer side of a marketplace order; the rest are the sender roles
// the chat already names (see SecureChat ROLE_KEYS).
const ROLE_KEYS: Record<string, string> = {
  client: "roleClient",
  seller: "roleSeller",
  lawyer: "roleSeller",
  advokat: "roleAdvokat",
  advocate: "roleAdvokat",
  advokat_tashkiloti: "roleAdvokat",
  yurist: "roleYurist",
  call_center: "roleDuty",
  call_center_lawyer: "roleDuty",
  operator: "roleOperator",
};
// A role there is no wording for is shown as the backend spelled it, tidied —
// guessing would label a new staff role as something it is not.
export function roleLabel(role: string, t: T): string {
  const key = ROLE_KEYS[role.trim().toLowerCase()];
  if (key) return t(key);
  return role.replace(/[_-]+/g, " ").replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const a = Array.from(words[0])[0] ?? "";
  const b = words.length > 1 ? Array.from(words[words.length - 1])[0] ?? "" : Array.from(words[0])[1] ?? "";
  return (a + b).toUpperCase();
}

// A stable colour per person, so the same client reads the same in the list,
// the header and on their bubbles. Six hues that hold contrast with white
// initials in both themes.
const HUES = [212, 262, 168, 24, 330, 190];
export function hueOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return HUES[Math.abs(h) % HUES.length];
}

export type Peer = { name: string; role: string; ids: string[]; group: boolean; count: number; others: SecureParticipant[] };

// Who the other side of a room is. A plain room is two people; an urgent
// panel holds the client, the duty advocate and several advocates, which is
// a group and is named by its people.
export function peerOf(room: SecureRoom | null, me: string): Peer {
  const all = room?.participants ?? [];
  const others = all.filter((p) => p.userId !== me);
  const count = Math.max(room?.participantCount ?? 0, all.length);
  const group = others.length > 1 || count > 2;
  const names = others.map((p) => p.name.trim()).filter(Boolean);
  let name = "";
  if (!group) name = names[0] || "";
  else if (names.length) name = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  if (!name && room?.lastMessage && !room.lastMessage.isMine && room.lastMessage.senderId !== me) name = room.lastMessage.senderName;
  return { name, role: group ? "" : others[0]?.role || "", ids: others.map((p) => p.userId), group, count, others };
}

const DAY = 86_400_000;
// Two letters ("Se") read as a typo in a row's corner; the list spells
// Uzbek weekdays a little longer than the calendar grid does.
const LIST_WEEKDAYS: Record<string, string[]> = { uz: ["Dush", "Sesh", "Chor", "Pay", "Jum", "Shan", "Yak"] };
// The list's clock: today a time, yesterday a word, this week a weekday,
// then a date — the year only once it is not this year's.
export function listTime(iso: string, locale: string, t: T): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const day = localDay(d);
  if (day === localDay(now)) return timeOnly(iso, locale);
  if (day === localDay(new Date(now.getTime() - DAY))) return t("yesterday");
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (start - d.getTime() < 6 * DAY) return (LIST_WEEKDAYS[locale] ?? weekdays(locale))[(d.getDay() + 6) % 7];
  return d.getFullYear() === now.getFullYear() ? shortDate(day, locale) : dateOnly(iso, locale);
}

export function dayLabel(iso: string, locale: string, t: T): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const day = localDay(d);
  if (day === localDay(now)) return t("today");
  if (day === localDay(new Date(now.getTime() - DAY))) return t("yesterday");
  return d.getFullYear() === now.getFullYear() ? shortDate(day, locale) : dateOnly(iso, locale);
}
