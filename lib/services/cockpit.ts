// TSK-635882 — the call-center operator's marketplace cockpit (contract
// 2026-10-27 §8): every queue's open total and its oldest items in one view.
// GET /call-center/marketplace/cockpit?limit= answers only for operators
// with marketplace access (call-center lawyers get 403 and never see it).
// The backend's item titles can carry raw ids, so they are never shown: each
// line is built from the item's own human fields.
import { asArr, asDict, asNum, asStr, http } from "@/lib/http";
import { uzs } from "@/lib/money";

export const COCKPIT_QUEUES = ["assignments", "complaints", "refunds", "payouts", "payout_recoveries", "experience", "achievements"] as const;
export type CockpitQueue = (typeof COCKPIT_QUEUES)[number];

export type CockpitItem = {
  id: string;
  queue: CockpitQueue;
  status: string;
  reason: string;
  // Free text a person wrote (a refund's reason, a complaint's comment).
  note: string;
  clientName: string;
  clientUserId: string;
  sellerUserId: string;
  workId: string;
  docTitle: string;
  amount: number;
  rating: number | null;
  priority: string;
  at: string;
  // A complaint about a document request or an urgent call is a quality
  // complaint (its own tab), not a marketplace one.
  quality: boolean;
};

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const human = (v: unknown) => {
  const s = asStr(v).trim();
  return UUIDISH.test(s) ? "" : s;
};

export function cockpitItemOf(queue: CockpitQueue, v: unknown): CockpitItem {
  const d = asDict(v);
  const p = asDict(d.payload);
  const recordType = asStr(d.record_type);
  const rating = p.rating === undefined || p.rating === null ? null : asNum(p.rating);
  const reason = asStr(p.reason);
  // A reason that is a code reads as a code; a sentence is someone's words.
  const coded = /^[a-z0-9_]+$/.test(reason);
  return {
    id: asStr(d.id),
    queue,
    status: asStr(d.status).toLowerCase(),
    reason: coded ? reason : "",
    note: coded ? asStr(p.comment) : reason || asStr(p.comment),
    clientName: human(p.client_name),
    clientUserId: asStr(p.client_user_id),
    sellerUserId: asStr(p.lawyer_user_id ?? p.seller_user_id ?? p.previous_seller_user_id),
    workId: human(p.work_id),
    docTitle: human(p.document_title ?? p.service_title),
    amount: uzs(p, "amount"),
    rating,
    priority: asStr(p.priority).toLowerCase(),
    at: asStr(p.opened_at ?? d.created_at),
    quality: queue === "complaints" && (recordType === "document_request" || recordType === "urgent_advokat_request"),
  };
}

export type CockpitLane = { queue: CockpitQueue; total: number; items: CockpitItem[] };
export type Cockpit = { totalOpen: number; lanes: CockpitLane[]; events: string[] };

export function cockpitOf(raw: unknown): Cockpit {
  const d = asDict(raw);
  const queues = asDict(d.queues);
  const lanes = COCKPIT_QUEUES.map((q) => {
    const x = asDict(queues[q]);
    const items = asArr(x.items).map((it) => cockpitItemOf(q, it)).filter((it) => it.id);
    return { queue: q, total: asNum(x.total) || items.length, items };
  });
  return { totalOpen: asNum(d.total_open) || lanes.reduce((n, l) => n + l.total, 0), lanes, events: asArr(d.events).map((e) => asStr(e)).filter(Boolean) };
}

export async function getCockpit(limit = 4, signal?: AbortSignal): Promise<Cockpit> {
  return cockpitOf(await http(`/call-center/marketplace/cockpit?limit=${limit}`, { signal }));
}
