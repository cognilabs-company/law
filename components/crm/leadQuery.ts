import type { CrmLead, LeadQuery } from "@/lib/services/crm";

// What the lead table and board ask the backend for: the tab, every
// filter, and the due chips as next_action_from/to. Nothing is filtered in
// the browser.
export type Tab = "queue" | "mine" | "all";
export type Filters = { status: string; score: string; source: string; category: string; region: string; q: string; operator: string; due: string; createdFrom: string; createdTo: string };
export const EMPTY: Filters = { status: "", score: "", source: "", category: "", region: "", q: "", operator: "", due: "", createdFrom: "", createdTo: "" };
export const LIMIT = 50;

export function queryOf(tab: Tab, f: Filters, offset: number, now: number): LeadQuery {
  const day = new Date(now || Date.now());
  const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59).toISOString();
  return {
    queueOnly: tab === "queue",
    mineOnly: tab === "mine",
    status: f.status,
    score: f.score,
    source: f.source,
    category: f.category,
    region: f.region,
    q: f.q,
    operator: tab === "all" ? f.operator : "",
    nextTo: f.due === "overdue" ? new Date(now || Date.now()).toISOString() : f.due === "today" ? endOfDay : "",
    createdFrom: f.createdFrom ? new Date(f.createdFrom).toISOString() : "",
    createdTo: f.createdTo ? new Date(`${f.createdTo}T23:59:59`).toISOString() : "",
    limit: LIMIT,
    offset,
  };
}

export type BoardColumn = { status: string; items: CrmLead[]; total: number };

// Puts the server's copy of a lead where its status says, at the top of
// that column, and out of every other one; totals follow. Server truth
// arrives with the next reload anyway, this only removes the wait.
export function placeLead(cols: BoardColumn[], lead: CrmLead): BoardColumn[] {
  return cols.map((c) => {
    const had = c.items.some((x) => x.id === lead.id);
    const items = c.items.filter((x) => x.id !== lead.id);
    if (c.status === lead.status) return { ...c, items: [lead, ...items], total: c.total + (had ? 0 : 1) };
    return had ? { ...c, items, total: Math.max(0, c.total - 1) } : c;
  });
}
