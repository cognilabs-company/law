"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { logApiError } from "@/lib/http";
import { getStudioObject, useStudioAccess, useStudioRegistry } from "@/lib/services/studio";
import type { UserEvent } from "@/lib/userSocket";
import { studioEventObjectId, useStudioLive } from "../live";
import { InlineDrawer, type InlineSettled } from "./InlineDrawer";
import { canReopen, editContextUrl, eventRuntimeId, eventStatus, inlineKindOf, isGoneStatus, isLiveStatus, slotOf, type InlineContext, type InlinePending, type InlineTarget } from "./model";
import { dropPending, patchPending, pendingOf, putPending, usePending } from "./pending";

export type InlineEditing = {
  code: string;
  slot: string;
  canManage: boolean;
  pending: readonly InlinePending[];
  openNew: (title: string) => void;
  openEdit: (value: string, label: string, ctxUrl?: string) => void;
  openPending: (item: InlinePending) => void;
  drawer: ReactElement | null;
};

type Args = {
  code: string;
  formCode: string;
  owner: string;
  pattern: string;
  context: InlineContext;
  enabled: boolean;
  onPublished: (item: InlinePending, runtimeId: string) => void;
};

const handled = new Set<string>();
const checked = new Set<string>();

export function useInlineAccess(code: string): boolean {
  const access = useStudioAccess();
  const reg = useStudioRegistry();
  if (!code || !inlineKindOf(code) || !access.known || !access.canEdit) return false;
  return reg.items.some((c) => c.code === code);
}

export function useInlineEditing({ code, formCode, owner, pattern, context, enabled, onPublished }: Args): InlineEditing {
  const reg = useStudioRegistry();
  const allowed = useInlineAccess(code);
  const canManage = enabled && allowed && !!owner;
  const slot = slotOf(owner, formCode, pattern);
  const pending = usePending(slot);
  const [open, setOpen] = useState<{ n: number; target: InlineTarget } | null>(null);
  const counter = useRef(0);
  const publishedRef = useRef(onPublished);
  useEffect(() => {
    publishedRef.current = onPublished;
  });

  const show = (target: InlineTarget) => {
    counter.current += 1;
    setOpen({ n: counter.current, target });
  };

  const openNew = (title: string) => {
    if (!canManage) return;
    show({ kind: "new", code, title: title.trim(), context });
  };

  const openPending = (item: InlinePending) => {
    if (!canManage) return;
    show({ kind: "object", code: item.code, id: item.objectId, label: item.title, value: item.value, isNew: item.isNew });
  };

  const openEdit = (value: string, label: string, ctxUrl?: string) => {
    if (!canManage || !value) return;
    const own = pending.find((p) => !p.isNew && p.value === value && canReopen(p.status));
    if (own) {
      openPending(own);
      return;
    }
    const ctor = reg.items.find((c) => c.code === code) ?? null;
    show({ kind: "edit", code, ctx: ctxUrl || editContextUrl(ctor, code, value), label, value });
  };

  const settle = (r: InlineSettled) => {
    putPending(slot, { objectId: r.objectId, code, title: r.title, isNew: r.isNew, value: r.value, status: r.status, at: Date.now() });
  };

  const resolve = useCallback(
    async (item: InlinePending, hint: { runtimeId?: string; status?: string }) => {
      let status = hint.status ?? "";
      let runtimeId = hint.runtimeId ?? "";
      if (!status || (isLiveStatus(status) && !runtimeId)) {
        try {
          const d = await getStudioObject(item.objectId);
          status = d.statusRaw || d.status;
          const rt = d.raw.runtime_target_id;
          if (!runtimeId && typeof rt === "string") runtimeId = rt.trim();
        } catch (e) {
          logApiError("studio.sx.inline.object", e);
          return;
        }
      }
      if (!pendingOf(slot).some((x) => x.objectId === item.objectId)) return;
      if (isLiveStatus(status)) {
        const key = `${slot}#${item.objectId}`;
        if (handled.has(key)) return;
        handled.add(key);
        dropPending(slot, item.objectId);
        publishedRef.current(item, runtimeId || (item.isNew ? "" : item.value));
        return;
      }
      if (isGoneStatus(status)) {
        dropPending(slot, item.objectId);
        return;
      }
      if (status && status !== item.status) patchPending(slot, item.objectId, { status });
    },
    [slot],
  );

  const pendingKey = pending.map((p) => p.objectId).join(",");
  useEffect(() => {
    if (!pendingKey) return;
    for (const item of pendingOf(slot)) {
      const key = `${slot}#${item.objectId}`;
      if (checked.has(key)) continue;
      checked.add(key);
      void resolve(item, {});
    }
  }, [pendingKey, slot, resolve]);

  useStudioLive((e: UserEvent) => {
    if (e.event === "studio.resync") {
      for (const item of pendingOf(slot)) void resolve(item, {});
      return;
    }
    if (!e.event.startsWith("studio.object_") && !e.event.startsWith("studio.approval_")) return;
    const id = studioEventObjectId(e);
    if (!id) return;
    const item = pendingOf(slot).find((x) => x.objectId === id);
    if (!item) return;
    if (e.event === "studio.object_published") void resolve(item, { status: "published", runtimeId: eventRuntimeId(e) });
    else if (e.event === "studio.object_archived") void resolve(item, { status: "archived" });
    else void resolve(item, { status: e.event === "studio.object_submitted" ? eventStatus(e) || "submitted" : "" });
  }, pending.length > 0);

  const drawer = open ? (
    <InlineDrawer
      key={open.n}
      target={open.target}
      onClose={() => setOpen(null)}
      onSettled={settle}
    />
  ) : null;

  return { code, slot, canManage, pending, openNew, openEdit, openPending, drawer };
}
