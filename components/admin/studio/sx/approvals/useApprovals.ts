"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { logApiError } from "@/lib/http";
import { listStudioApprovals, listStudioObjects, useStudioAccess, useStudioRegistry, type StudioDetail, type StudioObject } from "@/lib/services/studio";
import { useStudioLive } from "../live";
import { buildRow, isListEvent, mergeDetails, type ApprRegistry, type ApprRow, type ApprViewer } from "./model";

export type ApprLists = { approvals: StudioDetail[] | null; returned: StudioDetail[] | null; done: StudioDetail[] | null };
export type ApprData = {
  viewer: ApprViewer;
  rows: ApprRow[];
  doneRows: ApprRow[] | null;
  loading: boolean;
  busy: boolean;
  fetching: boolean;
  error: unknown;
  partial: boolean;
  doneLoading: boolean;
  doneError: unknown;
  reload: () => void;
};

type MainState = { ctor: string; tick: number; approvals: StudioDetail[] | null; returned: StudioDetail[] | null; errA: unknown; errR: unknown };
type DoneState = { ctor: string; items: StudioDetail[] | null; error: unknown };

const LIVE_MS = 400;
export const DONE_LIMIT = 20;
const RETURNED_LIMIT = 100;

const asDetail = (o: StudioObject): StudioDetail => ({ ...o, payload: {}, versions: [], steps: [] });

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

export function useApprovals(opts: { ctor: string; done: boolean }): ApprData {
  const viewer = useApprViewer();
  const acc = useStudioAccess();
  const reg = useStudioRegistry();
  const ready = acc.avail === "on" && acc.canReview;
  const withReturned = acc.canEdit || acc.canReview;
  const ctor = opts.ctor;
  const doneOn = opts.done;
  const [tick, setTick] = useState(0);
  const [main, setMain] = useState<MainState | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);
  const seq = useRef(0);
  const doneSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!ready) return;
    const my = ++seq.current;
    const code = ctor || undefined;
    let live = true;
    const jobs: [Promise<StudioDetail[]>, Promise<StudioDetail[] | null>] = [
      listStudioApprovals({ constructorCode: code }).then((r) => r.items),
      withReturned
        ? listStudioObjects({ status: "changes_requested", constructorCode: code, limit: RETURNED_LIMIT, offset: 0 }).then((r) => r.items.filter((o) => o.status === "changes_requested").map(asDetail))
        : Promise.resolve(null),
    ];
    void Promise.allSettled(jobs).then(([a, r]) => {
      if (!live || my !== seq.current) return;
      if (a.status === "rejected") logApiError("studio.sx.approvals.list", a.reason);
      if (r.status === "rejected") logApiError("studio.sx.approvals.returned", r.reason);
      setMain((prev) => ({
        ctor,
        tick,
        approvals: a.status === "fulfilled" ? a.value : (prev?.approvals ?? null),
        returned: r.status === "fulfilled" ? r.value : withReturned ? (prev?.returned ?? null) : null,
        errA: a.status === "rejected" ? (a.reason ?? new Error("failed")) : null,
        errR: r.status === "rejected" ? (r.reason ?? new Error("failed")) : null,
      }));
    });
    return () => {
      live = false;
    };
  }, [ready, ctor, withReturned, tick]);

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

  useStudioLive((e) => {
    if (e.event === "studio.resync") {
      clearTimeout(timer.current);
      setTick((n) => n + 1);
      return;
    }
    if (!isListEvent(e.event)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTick((n) => n + 1), LIVE_MS);
  }, ready);

  const registry: ApprRegistry = { items: reg.items, groups: reg.groups };
  const details = main ? mergeDetails(main.approvals ?? [], main.returned ?? []) : [];
  const rows = details.map((d) => buildRow(d, viewer, registry));
  const doneRows = done?.items ? done.items.map((d) => buildRow(d, viewer, registry)) : null;
  const shown = rows.length > 0;
  const errA = main?.errA ?? null;
  const errR = main?.errR ?? null;

  return {
    viewer,
    rows,
    doneRows,
    loading: ready ? !main : acc.avail === "checking",
    busy: !!main && main.ctor !== ctor,
    fetching: ready && (!main || main.tick !== tick || main.ctor !== ctor),
    error: errA && !shown ? errA : null,
    partial: shown && !!(errA || errR),
    doneLoading: doneOn && !done?.items && !done?.error,
    doneError: doneOn ? (done?.error ?? null) : null,
    reload: () => setTick((n) => n + 1),
  };
}
