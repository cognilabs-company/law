"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isForbidden, logApiError } from "@/lib/http";
import { subscribeInternalEvents } from "@/lib/internalSocket";
import { listStudioObjects, useStudioAccess, useStudioRegistry, type StudioDetail, type StudioObject } from "@/lib/services/studio";
import { useStudioLive } from "../live";
import { APPR_FETCH, APPR_FETCH_MAX, fetchApprovalQueue, type ApprCounts } from "./approvalsApi";
import { buildRow, isListEvent, mergeDetails, type ApprRegistry, type ApprRow, type ApprViewer } from "./model";
import type { ApprServed } from "./queue";

export type ApprData = {
  viewer: ApprViewer;
  rows: ApprRow[];
  doneRows: ApprRow[] | null;
  loading: boolean;
  busy: boolean;
  fetching: boolean;
  error: unknown;
  partial: boolean;
  limited: boolean;
  doneLoading: boolean;
  doneError: unknown;
  counts: ApprCounts | null;
  total: number;
  loaded: number;
  hasMore: boolean;
  moreBusy: boolean;
  moreError: unknown;
  served: ApprServed;
  loadMore: () => void;
  reload: () => void;
};

export type ApprLoadOpts = { ctor: string; status: string; q: string; mine: boolean; done: boolean };

type QueueState = { key: string; tick: number; items: StudioDetail[] | null; error: unknown; limited: boolean; total: number; hasMore: boolean; counts: ApprCounts | null };
type ListState = { ctor: string; items: StudioDetail[] | null; error: unknown };
type QueueLoad = { items: StudioDetail[]; limited: boolean; total: number; hasMore: boolean; counts: ApprCounts | null };

const LIVE_MS = 400;
const Q_MS = 300;
export const DONE_LIMIT = 20;
const RETURNED_LIMIT = 100;
const OPEN_LIMIT = 200;
const OPEN_STATUSES = new Set(["submitted", "in_review", "approved"]);
const SERVER_STATUSES = new Set(["submitted", "in_review", "approved", "published"]);

const asDetail = (o: StudioObject): StudioDetail => ({ ...o, payload: {}, versions: [], steps: [] });

type QueueArgs = { ctor: string; status: string; q: string; mine: boolean; limit: number; offset: number };

async function loadQueue(a: QueueArgs): Promise<QueueLoad> {
  try {
    const r = await fetchApprovalQueue({ constructorCode: a.ctor || undefined, status: a.status || undefined, q: a.q, needsMe: a.mine, limit: a.limit, offset: a.offset });
    return { items: r.items, limited: false, total: r.total, hasMore: r.hasMore, counts: r.counts };
  } catch (e) {
    if (!isForbidden(e) || a.offset > 0) throw e;
    const r = await listStudioObjects({ status: [...OPEN_STATUSES].join(","), constructorCode: a.ctor || undefined, limit: OPEN_LIMIT, offset: 0 });
    const items = r.items.filter((o) => OPEN_STATUSES.has(o.status)).map(asDetail);
    return { items, limited: true, total: items.length, hasMore: false, counts: null };
  }
}

export function useApprViewer(): ApprViewer {
  const { session } = useAuth();
  const acc = useStudioAccess();
  const id = session?.id ?? "";
  const { any, isAdmin, canEdit, canReview, canPublish } = acc;
  const roleKey = acc.roles.join("|");
  return useMemo(
    () => ({ id, access: { any, isAdmin, canEdit, canReview, canPublish, roles: roleKey ? roleKey.split("|") : [] } }),
    [id, any, isAdmin, canEdit, canReview, canPublish, roleKey],
  );
}

export function useApprovals(opts: ApprLoadOpts): ApprData {
  const viewer = useApprViewer();
  const acc = useStudioAccess();
  const reg = useStudioRegistry();
  const ready = acc.avail === "on" && acc.canReview;
  const withReturned = acc.canEdit || acc.canReview;
  const { ctor, mine } = opts;
  const status = SERVER_STATUSES.has(opts.status) ? opts.status : "";
  const doneOn = opts.done;
  const qNow = opts.q.trim();
  const [qSent, setQSent] = useState(qNow);
  const [tick, setTick] = useState(0);
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [returned, setReturned] = useState<ListState | null>(null);
  const [done, setDone] = useState<ListState | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  const seq = useRef(0);
  const rseq = useRef(0);
  const doneSeq = useRef(0);
  const loadedRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = `${ctor}|${status}|${qSent}|${mine ? 1 : 0}`;

  useEffect(() => {
    if (qNow === qSent) return;
    const id = setTimeout(() => setQSent(qNow), Q_MS);
    return () => clearTimeout(id);
  }, [qNow, qSent]);

  useEffect(() => {
    if (!ready) return;
    const my = ++seq.current;
    let live = true;
    const limit = Math.min(APPR_FETCH_MAX, Math.max(APPR_FETCH, loadedRef.current));
    loadQueue({ ctor, status, q: qSent, mine, limit, offset: 0 }).then(
      (r) => {
        if (!live || my !== seq.current) return;
        loadedRef.current = r.items.length;
        setMoreError(null);
        setQueue({ key, tick, items: r.items, error: null, limited: r.limited, total: r.total, hasMore: r.hasMore, counts: r.counts });
      },
      (e: unknown) => {
        if (!live || my !== seq.current) return;
        logApiError("studio.sx.approvals.list", e);
        setQueue((prev) => ({
          key,
          tick,
          items: prev?.items ?? null,
          error: e ?? new Error("failed"),
          limited: prev?.limited ?? false,
          total: prev?.total ?? 0,
          hasMore: prev?.hasMore ?? false,
          counts: prev?.counts ?? null,
        }));
      },
    );
    return () => {
      live = false;
    };
  }, [ready, ctor, status, qSent, mine, key, tick]);

  useEffect(() => {
    if (!ready || !withReturned) return;
    const my = ++rseq.current;
    let live = true;
    listStudioObjects({ status: "changes_requested", constructorCode: ctor || undefined, limit: RETURNED_LIMIT, offset: 0 }).then(
      (r) => {
        if (!live || my !== rseq.current) return;
        setReturned({ ctor, items: r.items.filter((o) => o.status === "changes_requested").map(asDetail), error: null });
      },
      (e: unknown) => {
        if (!live || my !== rseq.current) return;
        logApiError("studio.sx.approvals.returned", e);
        setReturned((prev) => ({ ctor, items: prev?.items ?? null, error: e ?? new Error("failed") }));
      },
    );
    return () => {
      live = false;
    };
  }, [ready, withReturned, ctor, tick]);

  useEffect(() => {
    if (!ready || !doneOn) return;
    const my = ++doneSeq.current;
    let live = true;
    listStudioObjects({ status: "published", constructorCode: ctor || undefined, limit: DONE_LIMIT, offset: 0 }).then(
      (r) => {
        if (!live || my !== doneSeq.current) return;
        setDone({ ctor, items: r.items.filter((o) => o.status === "published").map(asDetail), error: null });
      },
      (e: unknown) => {
        if (!live || my !== doneSeq.current) return;
        logApiError("studio.sx.approvals.done", e);
        setDone((prev) => ({ ctor, items: prev?.items ?? null, error: e ?? new Error("failed") }));
      },
    );
    return () => {
      live = false;
    };
  }, [ready, doneOn, ctor, tick]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const bump = (wait: number) => {
    clearTimeout(timer.current);
    if (wait <= 0) {
      setTick((n) => n + 1);
      return;
    }
    timer.current = setTimeout(() => setTick((n) => n + 1), wait);
  };

  useStudioLive((e) => {
    if (e.event === "studio.resync") {
      bump(0);
      return;
    }
    if (isListEvent(e.event)) bump(LIVE_MS);
  }, ready);

  const limited = !!queue?.limited;
  const channelOn = ready && !!queue && !limited;
  const bumpRef = useRef(bump);
  useEffect(() => {
    bumpRef.current = bump;
  });
  useEffect(() => {
    if (!channelOn) return;
    return subscribeInternalEvents("studio:queue", () => bumpRef.current(LIVE_MS));
  }, [channelOn]);

  const current = !!queue && queue.key === key;
  const loaded = queue?.items?.length ?? 0;

  const loadMore = () => {
    if (!queue || !current || !queue.hasMore || moreBusy || limited) return;
    const my = seq.current;
    const myKey = queue.key;
    setMoreBusy(true);
    setMoreError(null);
    loadQueue({ ctor, status, q: qSent, mine, limit: APPR_FETCH, offset: loaded }).then(
      (r) => {
        setMoreBusy(false);
        if (my !== seq.current) return;
        setQueue((prev) => {
          if (!prev || prev.key !== myKey) return prev;
          const items = mergeDetails(prev.items ?? [], r.items);
          loadedRef.current = items.length;
          const grew = items.length > (prev.items?.length ?? 0);
          return { ...prev, items, total: Math.max(r.total, items.length), hasMore: r.hasMore && grew, counts: r.counts ?? prev.counts };
        });
      },
      (e: unknown) => {
        setMoreBusy(false);
        logApiError("studio.sx.approvals.more", e);
        if (my === seq.current) setMoreError(e ?? new Error("failed"));
      },
    );
  };

  const registry: ApprRegistry = { items: reg.items, groups: reg.groups };
  const shownViewer: ApprViewer = limited ? { ...viewer, access: { ...viewer.access, canReview: false, canPublish: false } } : viewer;
  const returnedItems = withReturned ? (returned?.items ?? []) : [];
  const queueItems = queue?.items ?? [];
  const queueIds = new Set(queueItems.map((d) => d.id));
  const rows = [
    ...queueItems.map((d) => buildRow(d, shownViewer, registry, limited ? "local" : "queue")),
    ...mergeDetails(returnedItems)
      .filter((d) => !queueIds.has(d.id))
      .map((d) => buildRow(d, shownViewer, registry)),
  ];
  const doneRows = done?.items ? done.items.map((d) => buildRow(d, shownViewer, registry)) : null;
  const shown = rows.length > 0;
  const errA = queue?.error ?? null;
  const errR = withReturned ? (returned?.error ?? null) : null;
  const served: ApprServed = { q: current && !limited && qSent === qNow, mine: current && !limited };

  return {
    viewer: shownViewer,
    rows,
    doneRows,
    loading: ready ? !queue?.items && !errA : acc.avail === "checking",
    busy: !!queue?.items && !current,
    fetching: ready && (!queue || queue.tick !== tick || !current),
    error: errA && !shown ? errA : null,
    partial: shown && !!(errA || errR),
    limited,
    doneLoading: doneOn && !done?.items && !done?.error,
    doneError: doneOn ? (done?.error ?? null) : null,
    counts: current && !limited ? (queue?.counts ?? null) : null,
    total: current ? (queue?.total ?? loaded) : loaded,
    loaded,
    hasMore: current && !limited && !!queue?.hasMore,
    moreBusy,
    moreError,
    served,
    loadMore,
    reload: () => bump(0),
  };
}
