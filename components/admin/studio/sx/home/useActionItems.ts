"use client";

import { useEffect, useRef, useState } from "react";
import { isForbidden } from "@/lib/http";
import { listStudioApprovals, listStudioConstructors, listStudioObjects, useStudioAccess, useStudioRegistry, type StudioObject } from "@/lib/services/studio";
import type { UserEvent } from "@/lib/userSocket";
import { useStudioLive } from "../live";
import { groupOfCode } from "./groupModel";

export type ActionKind = "returned" | "review" | "publish";
export type ActionItem = { kind: ActionKind; id: string; title: string; code: string; group: string; at: string };
export type ActionItems = {
  items: ActionItem[];
  byGroup: Readonly<Record<string, Readonly<Record<ActionKind, number>>>>;
  loading: boolean;
  errors: Partial<Record<ActionKind, unknown>>;
  reload: () => void;
};

export const ACTION_KINDS: readonly ActionKind[] = ["returned", "review", "publish"];

const RELOAD_MS = 400;
const REGISTRY_MS = 1500;
const REVIEW_STATUSES = new Set(["submitted", "in_review"]);

type Lists = Record<ActionKind, StudioObject[] | null>;
type Loaded = { lists: Lists; errors: Partial<Record<ActionKind, unknown>> };

async function loadReview(status: string): Promise<StudioObject[]> {
  try {
    return (await listStudioApprovals({ status })).items;
  } catch (e) {
    if (!isForbidden(e)) throw e;
    return (await listStudioObjects({ status, limit: 100, offset: 0 })).items;
  }
}

const timeOf = (o: Pick<StudioObject, "updatedAt" | "createdAt">): number => {
  const v = Date.parse(o.updatedAt || o.createdAt || "");
  return Number.isFinite(v) ? v : 0;
};

export const touchesStudioObjects = (e: UserEvent): boolean => e.event === "studio.resync" || e.event.startsWith("studio.object_") || e.event.startsWith("studio.approval_");

export function orderActionObjects(kind: ActionKind, list: readonly StudioObject[]): StudioObject[] {
  const sign = kind === "returned" ? -1 : 1;
  return list
    .map((o, i) => ({ o, i, t: timeOf(o) }))
    .sort((a, b) => (a.t - b.t) * sign || a.i - b.i)
    .map((x) => x.o);
}

export function buildActionItems(lists: Lists, groupOf: (code: string) => string): { items: ActionItem[]; byGroup: Record<string, Record<ActionKind, number>> } {
  const items: ActionItem[] = [];
  const byGroup: Record<string, Record<ActionKind, number>> = {};
  for (const kind of ACTION_KINDS) {
    const list = lists[kind];
    if (!list) continue;
    const seen = new Set<string>();
    for (const o of orderActionObjects(kind, list)) {
      if (!o.id || seen.has(o.id)) continue;
      seen.add(o.id);
      const group = groupOf(o.code);
      items.push({ kind, id: o.id, title: o.title, code: o.code, group, at: o.updatedAt || o.createdAt });
      if (!group) continue;
      const row = byGroup[group] ?? (byGroup[group] = { returned: 0, review: 0, publish: 0 });
      row[kind] += 1;
    }
  }
  return { items, byGroup };
}

function useLiveReload(run: () => void, enabled: boolean, onPublished?: () => void): void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const regTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(regTimer.current);
    },
    [],
  );
  useStudioLive((e) => {
    if (!touchesStudioObjects(e)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(run, RELOAD_MS);
    if (onPublished && e.event === "studio.object_published") {
      clearTimeout(regTimer.current);
      regTimer.current = setTimeout(onPublished, REGISTRY_MS);
    }
  }, enabled);
}

const refreshRegistry = () => {
  void listStudioConstructors().catch(() => undefined);
};

export function useActionItems(): ActionItems {
  const acc = useStudioAccess();
  const reg = useStudioRegistry();
  const ready = acc.avail === "on" && acc.any;
  const { canEdit, canReview, canPublish } = acc;
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    const jobs: Promise<StudioObject[] | null>[] = [
      canEdit ? listStudioObjects({ status: "changes_requested", limit: 100, offset: 0 }).then((r) => r.items.filter((o) => o.status === "changes_requested")) : Promise.resolve(null),
      canReview ? Promise.all([...REVIEW_STATUSES].map(loadReview)).then((rs) => rs.flat().filter((o) => REVIEW_STATUSES.has(o.status))) : Promise.resolve(null),
      canPublish ? listStudioObjects({ status: "approved", limit: 100, offset: 0 }).then((r) => r.items.filter((o) => o.status === "approved")) : Promise.resolve(null),
    ];
    void Promise.allSettled(jobs).then((res) => {
      if (!live) return;
      const lists: Lists = { returned: null, review: null, publish: null };
      const errors: Partial<Record<ActionKind, unknown>> = {};
      ACTION_KINDS.forEach((kind, i) => {
        const r = res[i];
        if (r.status === "fulfilled") lists[kind] = r.value;
        else errors[kind] = r.reason ?? new Error("failed");
      });
      setData({ lists, errors });
    });
    return () => {
      live = false;
    };
  }, [ready, canEdit, canReview, canPublish, tick]);

  useLiveReload(() => setTick((n) => n + 1), ready, refreshRegistry);

  const groupOf = (code: string) => groupOfCode(code, reg.groups, reg.items);
  const built = data ? buildActionItems(data.lists, groupOf) : { items: [], byGroup: {} };
  return {
    items: built.items,
    byGroup: built.byGroup,
    loading: !data && (acc.avail === "checking" || ready),
    errors: data?.errors ?? {},
    reload: () => setTick((n) => n + 1),
  };
}

export function useMyObjects(limit: number): { items: StudioObject[]; loading: boolean; error: unknown; reload: () => void } {
  const acc = useStudioAccess();
  const ready = acc.avail === "on" && acc.any;
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<{ items: StudioObject[]; error: unknown } | null>(null);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    listStudioObjects({ assignedToMe: true, limit: 30, offset: 0 }).then(
      (r) => {
        if (live) setData({ items: r.items, error: null });
      },
      (e: unknown) => {
        if (live) setData((prev) => ({ items: prev?.items ?? [], error: e ?? new Error("failed") }));
      },
    );
    return () => {
      live = false;
    };
  }, [ready, tick]);

  useLiveReload(() => setTick((n) => n + 1), ready);

  const items = (data?.items ?? [])
    .filter((o) => o.status !== "archived")
    .map((o, i) => ({ o, i, t: timeOf(o) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .slice(0, Math.max(0, limit))
    .map((x) => x.o);
  return { items, loading: !data && (acc.avail === "checking" || ready), error: data?.error ?? null, reload: () => setTick((n) => n + 1) };
}
