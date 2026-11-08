"use client";

import { useCallback, useRef, useState } from "react";
import { getCallCenterQueue, listCcCalls, listQualityComplaints, type CcCall, type QueueItem } from "@/lib/services/backend";
import { listAssignmentEscalations } from "@/lib/services/resolution";
import { listMpComplaints, listWarrantyClaims } from "@/lib/services/mpComplaints";
import { listCancellationReviews } from "@/lib/services/marketRuntime";
import { listExperienceQueue } from "@/lib/services/experience";
import { listAchievementQueue } from "@/lib/services/achievements";
import { listLicenseQueue } from "@/lib/services/advocatePractice";
import { listCcPayouts, listPayoutRecoveries, payoutActionable } from "@/lib/services/payouts";
import { isAborted, isForbidden, logApiError } from "@/lib/http";
import { useClock, useLiveRefresh } from "../useLive";
import { shortId, type QJob, type QKey, type QLane } from "./model";

const LIMIT = 24;
const REFRESH_MS = 30_000;
const CLOCK_MS = 15_000;
const QUALITY_SETTLED = new Set(["resolved", "rejected", "rework_required"]);
const RECOVERY_DONE = new Set(["paid", "recovered", "cancelled"]);

export type QState = { status: "loading" } | { status: "error" } | { status: "ready"; lanes: Partial<Record<QKey, QLane>>; calls: CcCall[] | null; at: number };

type Got = { total: number; jobs: QJob[] };
type Loader = (signal: AbortSignal) => Promise<Got>;

const base = { detail: "", who: "", whoId: "", phone: "", slaMin: 0, slaBreached: false, mine: false, nowKey: "" };

function fromQueue(items: QueueItem[], queue: "queue" | "urgent", me: string): Got {
  const jobs = items
    .filter((q) => (queue === "urgent" ? q.type === "urgent_advokat" : q.type !== "urgent_advokat"))
    .map(
      (q): QJob => ({
        ...base,
        raw: q,
        key: `q:${q.type}:${q.id}`,
        queue,
        id: q.id,
        code: shortId(q.id),
        title: q.type === "lead" ? "" : q.title,
        category: q.type === "lead" ? q.title : undefined,
        serviceKind: q.serviceKind,
        whoId: q.clientUserId ?? "",
        at: q.createdAt,
        baseAgeMin: q.ageMinutes,
        slaMin: q.slaMinutes,
        slaBreached: q.slaBreached,
        mine: Boolean(me) && (q.claimedByUserId === me || q.operatorUserId === me),
        nowKey: `q:${q.type}:${q.id}`,
      }),
    );
  return { total: jobs.length, jobs };
}

const LOADERS: Record<Exclude<QKey, "queue" | "urgent">, Loader> = {
  escalations: async (signal) => {
    const r = await listAssignmentEscalations({}, signal);
    return {
      total: r.total,
      jobs: r.items.map((x) => ({
        ...base,
        raw: x,
        key: `e:${x.id}`,
        queue: "escalations",
        id: x.id,
        code: x.order.workId || shortId(x.orderId || x.id),
        title: x.order.serviceTitle,
        whyCode: x.reason,
        who: x.order.clientName,
        whoId: x.order.clientUserId,
        phone: x.order.clientPhoneVisible === false ? "" : x.order.clientPhone,
        at: x.createdAt,
      })),
    };
  },
  complaints: async () => {
    const r = await listQualityComplaints();
    const open = r.items.filter((x) => !QUALITY_SETTLED.has(x.status));
    return {
      total: open.length,
      jobs: open.map((x) => ({ ...base, raw: x, key: `k:${x.id}`, queue: "complaints", id: x.id, code: x.workId || shortId(x.id), title: x.title || x.complaint, detail: x.title ? x.complaint : "", who: x.clientName, at: x.createdAt })),
    };
  },
  mpComplaints: async (signal) => {
    const r = await listMpComplaints({ status: "new", offset: 0, limit: LIMIT }, signal);
    return {
      total: r.total,
      jobs: r.items.map((x) => ({ ...base, raw: x, key: `m:${x.id}`, queue: "mpComplaints", id: x.id, code: x.order.workId || shortId(x.id), title: x.title || x.reason, detail: x.title ? x.reason : "", who: x.client?.name ?? "", whoId: x.client?.id ?? "", phone: x.client?.phone ?? "", at: x.createdAt })),
    };
  },
  warranty: async (signal) => {
    const r = await listWarrantyClaims({ status: "new", offset: 0, limit: LIMIT }, signal);
    return {
      total: r.total,
      jobs: r.items.map((x) => ({ ...base, raw: x, key: `w:${x.id}`, queue: "warranty", id: x.id, code: x.order.workId || shortId(x.id), title: x.reason, detail: x.note, who: x.client?.name ?? "", whoId: x.client?.id ?? "", phone: x.client?.phone ?? "", at: x.createdAt })),
    };
  },
  cancellations: async (signal) => {
    const r = await listCancellationReviews({ status: "open", limit: LIMIT, offset: 0 }, signal);
    return {
      total: r.total || r.items.length,
      jobs: r.items.map((x) => ({ ...base, raw: x, key: `x:${x.id}`, queue: "cancellations", id: x.id, code: x.workId || shortId(x.orderId || x.id), title: x.serviceTitle, detail: x.reason, who: x.clientName, at: x.createdAt })),
    };
  },
  experience: async (signal) => {
    const r = await listExperienceQueue({ status: "pending_review", offset: 0, limit: LIMIT }, signal);
    return {
      total: r.total,
      jobs: r.items.map((x) => ({ ...base, raw: x, key: `p:${x.id}`, queue: "experience", id: x.id, code: shortId(x.id), title: x.workplace, detail: x.description, who: x.seller?.name ?? "", whoId: x.sellerUserId, phone: x.seller?.phone ?? "", at: x.submittedAt })),
    };
  },
  achievements: async (signal) => {
    const r = await listAchievementQueue({ status: "pending_review", offset: 0, limit: LIMIT }, signal);
    return {
      total: r.total,
      jobs: r.items.map((x) => ({ ...base, raw: x, key: `a:${x.id}`, queue: "achievements", id: x.id, code: shortId(x.id), title: x.categoryTitle || x.description, detail: x.categoryTitle ? x.description : "", who: x.seller?.name ?? "", whoId: x.sellerUserId, phone: x.seller?.phone ?? "", at: x.submittedAt })),
    };
  },
  licenses: async (signal) => {
    const r = await listLicenseQueue({ status: "pending_review", limit: LIMIT, offset: 0 }, signal);
    return {
      total: r.total,
      jobs: r.items.map((x) => ({ ...base, raw: x, key: `l:${x.id}`, queue: "licenses", id: x.id, code: shortId(x.id), title: "", detail: x.reason, who: x.seller?.name ?? "", whoId: x.sellerUserId, phone: x.seller?.phone ?? "", at: x.submittedAt })),
    };
  },
  payouts: async (signal) => {
    const r = await listCcPayouts({ status: "", limit: LIMIT * 2, offset: 0 }, signal);
    const open = r.items.filter((x) => payoutActionable(x.status));
    return {
      total: open.length,
      jobs: open.map((x) => ({ ...base, raw: x, key: `o:${x.id}`, queue: "payouts", id: x.id, code: x.workId || shortId(x.orderId || x.id), title: x.serviceTitle, amount: x.amount, detail: x.reason, who: x.seller?.name ?? "", whoId: x.seller?.id ?? "", at: x.createdAt })),
    };
  },
  recoveries: async (signal) => {
    const r = await listPayoutRecoveries({ status: "", limit: LIMIT, offset: 0 }, signal);
    const open = r.items.filter((x) => !RECOVERY_DONE.has(x.status));
    return {
      total: open.length,
      jobs: open.map((x) => ({ ...base, raw: x, key: `r:${x.id}`, queue: "recoveries", id: x.id, code: x.workId || shortId(x.orderId || x.id), title: x.serviceTitle, amount: x.amount, detail: x.reason, who: x.seller?.name ?? "", whoId: x.seller?.id ?? "", at: x.createdAt })),
    };
  },
};

// Verification lanes need the review permission (docs/LEXGO_ACHIEVEMENTS_
// PRACTICE_FRONTEND_FINAL_2026_10_29.md): without it they are not asked for
// at all, so no lane, tab or card for them shows up.
const REVIEW_LANES = new Set<QKey>(["experience", "achievements", "licenses"]);

const quiet = (e: unknown) => isForbidden(e) || isAborted(e);

function laneOf(queue: QKey, r: PromiseSettledResult<Got>): QLane {
  if (r.status === "fulfilled") return { queue, status: "ready", total: r.value.total, jobs: r.value.jobs };
  if (!quiet(r.reason)) logApiError(`ccx-queues-${queue}`, r.reason);
  return { queue, status: isForbidden(r.reason) ? "denied" : "failed", total: 0, jobs: [] };
}

export function useQueues(me: string, review: boolean): { state: QState; now: number; reload: () => void } {
  const [state, setState] = useState<QState>({ status: "loading" });
  const [now, setNow] = useState(0);
  const seq = useRef(0);
  const ctl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const n = ++seq.current;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    const keys = (Object.keys(LOADERS) as (keyof typeof LOADERS)[]).filter((k) => review || !REVIEW_LANES.has(k));
    const restP = Promise.allSettled(keys.map((k) => LOADERS[k](c.signal)));
    const [queue, calls] = await Promise.allSettled([getCallCenterQueue(), listCcCalls()]);
    const rest = await restP;
    if (n !== seq.current) return;
    const lanes: Partial<Record<QKey, QLane>> = {};
    const fromQ = (q: "queue" | "urgent"): PromiseSettledResult<Got> => (queue.status === "fulfilled" ? { status: "fulfilled", value: fromQueue(queue.value, q, me) } : queue);
    lanes.queue = laneOf("queue", fromQ("queue"));
    lanes.urgent = laneOf("urgent", fromQ("urgent"));
    keys.forEach((k, i) => {
      lanes[k] = laneOf(k, rest[i]);
    });
    const any = Object.values(lanes).some((l) => l?.status === "ready");
    if (!any) {
      setState((s) => (s.status === "ready" ? s : { status: "error" }));
      return;
    }
    const at = Date.now();
    setNow(at);
    setState({ status: "ready", lanes, calls: calls.status === "fulfilled" ? calls.value : null, at });
  }, [me, review]);

  const reload = useCallback(() => void load(), [load]);
  useLiveRefresh(reload, REFRESH_MS);
  useClock(setNow, CLOCK_MS);
  return { state, now, reload };
}
