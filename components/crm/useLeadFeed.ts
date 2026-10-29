"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAborted, logApiError } from "@/lib/http";
import { isFinalStatus, listCrmLeads, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";

// Calls and SMS have no list across leads (contract 13cb257 §14–15 give
// them per lead), so the section pages gather them from the operator's
// open leads — at most `LIMIT`, a few requests at a time.
const LIMIT = 30;
const PARALLEL = 4;
export type FeedRow<T> = { lead: CrmLead; item: T };
export function useLeadFeed<T>(meta: CrmMeta, scope: "mine" | "all", fetchFor: (leadId: string, signal: AbortSignal) => Promise<T[]>, refreshOn: (name: string) => boolean) {
  const [rows, setRows] = useState<FeedRow<T>[] | null>(null);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [err, setErr] = useState<unknown>(null);
  const fetchRef = useRef(fetchFor);
  const refreshRef = useRef(refreshOn);
  useEffect(() => {
    fetchRef.current = fetchFor;
    refreshRef.current = refreshOn;
  });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    const ctl = new AbortController();
    void (async () => {
      try {
        const page = await listCrmLeads({ mineOnly: scope === "mine", limit: LIMIT * 2 }, ctl.signal);
        const open = page.items.filter((l) => !isFinalStatus(meta, l.status)).slice(0, LIMIT);
        const out: FeedRow<T>[] = [];
        for (let i = 0; i < open.length; i += PARALLEL) {
          const chunk = open.slice(i, i + PARALLEL);
          const lists = await Promise.all(chunk.map((l) => fetchRef.current(l.id, ctl.signal).catch((e) => (isAborted(e) ? Promise.reject(e) : (logApiError("crm.feed", e), [] as T[])))));
          chunk.forEach((l, j) => lists[j].forEach((item) => out.push({ lead: l, item })));
        }
        if (ctl.signal.aborted) return;
        setLeads(open);
        setRows(out);
        setErr(null);
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.feed.leads", e);
        setErr(e);
      }
    })();
    return () => ctl.abort();
  }, [meta, scope, tick]);
  useCrmEvents((ev) => {
    if (ev.invalidate.includes("all") || refreshRef.current(ev.name)) reload();
  });
  return { rows, leads, err, reload };
}
