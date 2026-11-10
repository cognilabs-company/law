import { getCallCenterKanban, type KanbanColumn, type QueueItem } from "@/lib/services/backend";
import { asStr } from "@/lib/http";

// Queue rows that came without a client name or phone. A lead row is the
// same lead the call-center board (GET /call-center/leads/kanban) shows with
// its contact, so one board read fills every lead at once. Orders without a
// client on the row stay as they are (backend question, see
// docs/LEXGO_FRONTEND_QUESTIONS_CALL_CENTER_2026_11_10.md).

type Contact = { name: string; phone: string; userId: string };

const TTL = 60_000;
let board: { at: number; p: Promise<Map<string, Contact>> } | null = null;

export function contactsFromBoard(cols: KanbanColumn[]): Map<string, Contact> {
  const out = new Map<string, Contact>();
  for (const c of cols) {
    for (const { lead } of c.cards) {
      if (!lead.id) continue;
      const det = lead.details ?? {};
      const userId = asStr(det.user_id ?? det.client_user_id ?? det.created_by_user_id).trim();
      out.set(lead.id, { name: lead.name.trim(), phone: lead.phone.trim(), userId });
    }
  }
  return out;
}

function boardContacts(): Promise<Map<string, Contact>> {
  const now = Date.now();
  if (!board || now - board.at > TTL) {
    const p = getCallCenterKanban()
      .then(contactsFromBoard)
      .catch(() => {
        board = null;
        return new Map<string, Contact>();
      });
    board = { at: now, p };
  }
  return board.p;
}

export const lacksPerson = (q: QueueItem) => !q.clientName && !q.clientPhone;

export function fillFromContacts(items: QueueItem[], contacts: Map<string, Contact>): QueueItem[] {
  return items.map((q) => {
    if (q.type !== "lead" || !lacksPerson(q)) return q;
    const c = contacts.get(q.id);
    if (!c) return q;
    return { ...q, clientName: c.name || undefined, clientPhone: c.phone || undefined, clientUserId: q.clientUserId || c.userId || undefined };
  });
}

export async function withQueuePeople(items: QueueItem[]): Promise<QueueItem[]> {
  if (!items.some((q) => q.type === "lead" && lacksPerson(q))) return items;
  return fillFromContacts(items, await boardContacts());
}

export function resetQueuePeopleCache() {
  board = null;
}
