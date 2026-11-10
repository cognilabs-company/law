"use client";

import { useCallback, useEffect, useState } from "react";
import { getCallCenterQueue, getCcClientCard, getCcUrgentRequest, listCcCalls, type CcCall, type CcClientCard, type QueueItem, type UrgentRequest } from "@/lib/services/backend";
import { getCockpit, type CockpitItem } from "@/lib/services/cockpit";
import { getCrmCustomer, getCrmLead, getLeadHistory, getLeadTimeline, type CrmActivity, type CrmLead } from "@/lib/services/crm";
import { isAborted, isForbidden, logApiError } from "@/lib/http";
import { withQueuePeople } from "@/lib/ccx/queuePeople";
import { NOW_COCKPIT_LIMIT } from "@/lib/callcenter/useCcOpen";
import { useClock, useLiveRefresh } from "../useLive";
import type { NowJob } from "./feed";

const REFRESH_MS = 30_000;
const CLOCK_MS = 15_000;

export type NowFeed = { queue: QueueItem[]; cockpit: CockpitItem[]; at: number; partial: boolean };
export type NowLoad = { status: "loading" } | { status: "error" } | { status: "ready"; feed: NowFeed };

const quiet = (e: unknown) => isForbidden(e) || isAborted(e);

export function useNowFeed(): { state: NowLoad; now: number; reload: () => void } {
  const [state, setState] = useState<NowLoad>({ status: "loading" });
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const [q, c] = await Promise.allSettled([getCallCenterQueue().then(withQueuePeople), getCockpit(NOW_COCKPIT_LIMIT)]);
    if (q.status === "rejected" && !quiet(q.reason)) logApiError("ccx-now-queue", q.reason);
    if (c.status === "rejected" && !quiet(c.reason)) logApiError("ccx-now-cockpit", c.reason);
    if (q.status === "rejected" && c.status === "rejected") {
      setState((s) => (s.status === "ready" ? s : { status: "error" }));
      return;
    }
    const at = Date.now();
    setNow(at);
    setState({
      status: "ready",
      feed: {
        queue: q.status === "fulfilled" ? q.value : [],
        cockpit: c.status === "fulfilled" ? c.value.lanes.flatMap((l) => l.items) : [],
        at,
        partial: (q.status === "rejected" && !quiet(q.reason)) || (c.status === "rejected" && !quiet(c.reason)),
      },
    });
  }, []);

  const reload = useCallback(() => void load(), [load]);
  useLiveRefresh(reload, REFRESH_MS);
  useClock(setNow, CLOCK_MS);
  return { state, now, reload };
}

export type JobDetail = { key: string; lead?: CrmLead; history?: CrmActivity[]; timeline?: CrmActivity[]; customerNotes?: string; urgent?: UrgentRequest; failed: boolean };

export function useJobDetail(job: NowJob | null, rev: number): JobDetail | null {
  const [d, setD] = useState<JobDetail | null>(null);
  const key = job?.key ?? "";
  const kind = job?.kind ?? "";
  const id = job?.id ?? "";

  useEffect(() => {
    if (!key || (kind !== "lead" && kind !== "urgent")) return;
    const ctl = new AbortController();
    const run = async () => {
      if (kind === "lead") {
        const [lead, hist, line] = await Promise.allSettled([getCrmLead(id, ctl.signal), getLeadHistory(id, ctl.signal), getLeadTimeline(id, ctl.signal)]);
        if (ctl.signal.aborted) return;
        if (lead.status === "rejected" && !quiet(lead.reason)) logApiError("ccx-now-lead", lead.reason);
        const customerId = lead.status === "fulfilled" ? lead.value.customerId : "";
        const customer = customerId ? await getCrmCustomer(customerId, ctl.signal).catch(() => null) : null;
        if (ctl.signal.aborted) return;
        setD({
          key,
          lead: lead.status === "fulfilled" ? lead.value : undefined,
          history: hist.status === "fulfilled" ? hist.value.events : undefined,
          timeline: line.status === "fulfilled" ? line.value : undefined,
          customerNotes: customer?.notes ?? "",
          failed: lead.status === "rejected",
        });
        return;
      }
      try {
        const urgent = await getCcUrgentRequest(id);
        if (!ctl.signal.aborted) setD({ key, urgent, failed: false });
      } catch (e) {
        if (ctl.signal.aborted) return;
        if (!quiet(e)) logApiError("ccx-now-urgent", e);
        setD({ key, failed: true });
      }
    };
    void run();
    return () => ctl.abort();
  }, [key, kind, id, rev]);

  return d && d.key === key ? d : null;
}

export type ClientInfo = { userId: string; card?: CcClientCard; calls?: CcCall[]; denied: boolean; failed: boolean };

export function useClientInfo(userId: string, rev: number): ClientInfo | null {
  const [c, setC] = useState<ClientInfo | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void Promise.allSettled([getCcClientCard(userId), listCcCalls(userId)]).then(([card, calls]) => {
      if (!alive) return;
      if (card.status === "rejected" && !quiet(card.reason)) logApiError("ccx-now-client", card.reason);
      setC({
        userId,
        card: card.status === "fulfilled" ? card.value : undefined,
        calls: calls.status === "fulfilled" ? calls.value : undefined,
        denied: card.status === "rejected" && isForbidden(card.reason),
        failed: card.status === "rejected" && !isForbidden(card.reason),
      });
    });
    return () => {
      alive = false;
    };
  }, [userId, rev]);

  return c && c.userId === userId ? c : null;
}

export type Who = { userId: string; name: string; phone: string; phoneHidden: string; lexgoId: string };

export function whoOf(job: NowJob, detail: JobDetail | null, client: ClientInfo | null): Who {
  const lead = detail?.lead;
  const urgent = detail?.urgent;
  const card = client?.card?.client;
  const urgentPhone = urgent && urgent.clientPhoneVisible !== false ? urgent.clientPhone : "";
  return {
    userId: job.clientUserId || lead?.clientUserId || urgent?.clientUserId || "",
    name: lead?.customer?.name || urgent?.clientName || job.clientName || card?.name || "",
    phone: lead?.customer?.phone || urgentPhone || job.queue?.clientPhone || card?.phone || "",
    phoneHidden: urgent && urgent.clientPhoneVisible === false ? urgent.clientPhoneHiddenReason || "hidden" : "",
    lexgoId: card?.lexgoId || urgent?.client?.lexgoId || lead?.customer?.publicId || "",
  };
}
