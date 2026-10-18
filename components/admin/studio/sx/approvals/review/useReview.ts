"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logApiError } from "@/lib/http";
import { descendantIds, flattenCategoryTree, getCategoryTree } from "@/lib/services/categoryTree";
import {
  addStudioComment,
  getStudioConstructorDetail,
  getStudioObject,
  listStudioComments,
  normStudioVersion,
  useStudioRegistry,
  type StudioComment,
  type StudioConstructor,
  type StudioDetail,
  type StudioVersion,
} from "@/lib/services/studio";
import type { SchemaModel, SxValues, SxWarning } from "../../contract";
import { ctorLayoutOf } from "../../ctor/layouts";
import { ctorWarnings } from "../../ctor/warnings";
import { currentVersionOf, liveVersionOf } from "../../editor/model";
import { studioEventObjectId, useStudioLive } from "../../live";
import { useSchemaModel } from "../../schema/useSchemaModel";
import { DETAIL_EVENTS, buildRow, isListEvent, type ApprRow, type ApprViewer } from "../model";
import { NO_REVIEW, reviewCan, type ReviewCan } from "./actions";
import type { ReviewTarget } from "./ReviewDrawer";

export type ReviewBase = "live" | "prev" | "first" | "none" | "unknown";
export type ReviewComments = { items: StudioComment[] | null; error: unknown; sending: boolean; sendError: unknown };
export type ReviewState = {
  id: string;
  detail: StudioDetail | null;
  row: ApprRow | null;
  loading: boolean;
  error: unknown;
  ctor: StudioConstructor | null;
  model: SchemaModel | null;
  current: StudioVersion | null;
  live: StudioVersion | null;
  base: ReviewBase;
  before: SxValues | null;
  after: SxValues;
  warnings: SxWarning[];
  can: ReviewCan;
  comments: ReviewComments;
  addComment: (text: string) => Promise<boolean>;
  reloadComments: () => void;
  refresh: () => Promise<StudioDetail | null>;
  retry: () => void;
};

export const REVIEW_DEBOUNCE_MS = 300;

type Dict = Record<string, unknown>;
type Got = { id: string; detail: StudioDetail | null; error: unknown };
type Notes = { id: string; items: StudioComment[] | null; error: unknown };

const EMPTY: SxValues = Object.freeze({});
const STALE_KEYS = ["can_decide", "current_step"];

const dict = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

export function mergeReviewDetail(base: StudioDetail | null, fresh: StudioDetail | null): StudioDetail | null {
  if (!fresh || !fresh.id) return base;
  if (!base) return fresh;
  const baseRaw: Dict = { ...base.raw };
  if (fresh.status !== base.status) for (const k of STALE_KEYS) delete baseRaw[k];
  return {
    ...base,
    ...fresh,
    title: fresh.title || base.title,
    code: fresh.code || base.code,
    currentVersion: fresh.currentVersion || base.currentVersion,
    currentVersionId: fresh.currentVersionId || base.currentVersionId,
    createdBy: fresh.createdBy || base.createdBy,
    payload: Object.keys(fresh.payload).length ? fresh.payload : base.payload,
    versions: fresh.versions.length ? fresh.versions : base.versions,
    steps: fresh.steps.length ? fresh.steps : base.steps,
    hasFile: fresh.hasFile || base.hasFile,
    raw: { ...baseRaw, ...fresh.raw },
  };
}

export function liveOf(d: StudioDetail | null): StudioVersion | null {
  if (!d) return null;
  const own = liveVersionOf(d);
  if (own && Object.keys(own.payload).length) return own;
  const pub = dict(d.raw.published_version);
  if (Object.keys(dict(pub.payload)).length) return normStudioVersion(pub);
  return own;
}

export function reviewBaseOf(d: StudioDetail | null, current: StudioVersion | null, live: StudioVersion | null): { base: ReviewBase; before: SxValues | null } {
  if (!d) return { base: "none", before: null };
  if (d.status === "published" || d.status === "archived") {
    const i = current ? d.versions.findIndex((v) => v.id === current.id) : -1;
    const prev = i >= 0 ? d.versions[i + 1] : undefined;
    if (!prev) return { base: "first", before: null };
    return Object.keys(prev.payload).length ? { base: "prev", before: prev.payload } : { base: "unknown", before: null };
  }
  if (live) return Object.keys(live.payload).length ? { base: "live", before: live.payload } : { base: "unknown", before: null };
  if (text(d.raw.runtime_target_id)) return { base: "unknown", before: null };
  return { base: "none", before: null };
}

export function useReview(target: ReviewTarget | null, viewer: ApprViewer): ReviewState {
  const id = target?.id ?? "";
  const baseDetail = target?.row?.detail ?? null;
  const reg = useStudioRegistry();
  const [got, setGot] = useState<Got>({ id: "", detail: null, error: null });
  const [notes, setNotes] = useState<Notes>({ id: "", items: null, error: null });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const [full, setFull] = useState<{ code: string; ctor: StudioConstructor | null } | null>(null);
  const [desc, setDesc] = useState<{ key: string; n: number } | null>(null);
  const seq = useRef(0);
  const cseq = useRef(0);
  const detailTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback((): Promise<StudioDetail | null> => {
    if (!id) return Promise.resolve(null);
    const n = ++seq.current;
    return getStudioObject(id).then(
      (d) => {
        if (n === seq.current) setGot({ id, detail: d, error: null });
        return d;
      },
      (e: unknown) => {
        logApiError("studio.sx.approvals.detail", e);
        if (n === seq.current) setGot((g) => ({ id, detail: g.id === id ? g.detail : null, error: e }));
        return null;
      },
    );
  }, [id]);

  const loadComments = useCallback((): Promise<void> => {
    if (!id) return Promise.resolve();
    const n = ++cseq.current;
    return listStudioComments(id).then(
      (items) => {
        if (n === cseq.current) setNotes({ id, items, error: null });
      },
      (e: unknown) => {
        logApiError("studio.sx.approvals.comments", e);
        if (n === cseq.current) setNotes((c) => ({ id, items: c.id === id ? c.items : null, error: e }));
      },
    );
  }, [id]);

  useEffect(() => {
    void refresh();
    void loadComments();
  }, [refresh, loadComments]);

  useEffect(
    () => () => {
      clearTimeout(detailTimer.current);
      clearTimeout(notesTimer.current);
    },
    [],
  );

  useStudioLive((e) => {
    if (!id) return;
    if (e.event === "studio.resync") {
      clearTimeout(detailTimer.current);
      clearTimeout(notesTimer.current);
      void refresh();
      void loadComments();
      return;
    }
    const oid = studioEventObjectId(e);
    if (oid && oid !== id) return;
    if (e.event === "studio.comment_created") {
      clearTimeout(notesTimer.current);
      notesTimer.current = setTimeout(() => void loadComments(), REVIEW_DEBOUNCE_MS);
    }
    if (DETAIL_EVENTS.has(e.event) || isListEvent(e.event)) {
      clearTimeout(detailTimer.current);
      detailTimer.current = setTimeout(() => void refresh(), REVIEW_DEBOUNCE_MS);
    }
  }, !!id);

  const fresh = got.id === id ? got.detail : null;
  const error = got.id === id ? got.error : null;
  const detail = useMemo(() => mergeReviewDetail(baseDetail, fresh), [baseDetail, fresh]);
  const code = detail?.code ?? target?.row?.code ?? "";
  const regCtor = useMemo(() => reg.items.find((c) => c.code === code) ?? null, [reg.items, code]);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    getStudioConstructorDetail(code).then(
      (c) => {
        if (alive) setFull({ code, ctor: c });
      },
      () => {
        if (alive) setFull({ code, ctor: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [code]);

  const ctor = full?.code === code ? full.ctor : null;
  const runtimeTarget = ctor?.runtimeTarget || regCtor?.runtimeTarget || "";
  const layout = useMemo(() => ctorLayoutOf(code, runtimeTarget), [code, runtimeTarget]);
  const model = useSchemaModel({ ctor, layout, runtimeTarget, idPrefix: "sx-rv" });

  const targetId = code === "K01" && detail ? text(detail.raw.runtime_target_id) : "";
  useEffect(() => {
    if (!targetId) return;
    let alive = true;
    getCategoryTree({ includeInactive: true }).then(
      (nodes) => {
        if (alive) setDesc({ key: targetId, n: descendantIds(targetId, flattenCategoryTree(nodes)).size });
      },
      () => {
        if (alive) setDesc({ key: targetId, n: 0 });
      },
    );
    return () => {
      alive = false;
    };
  }, [targetId]);
  const descendants = targetId && desc?.key === targetId ? desc.n : 0;

  const current = useMemo(() => currentVersionOf(detail), [detail]);
  const live = useMemo(() => liveOf(detail), [detail]);
  const { base, before } = useMemo(() => reviewBaseOf(detail, current, live), [detail, current, live]);
  const after: SxValues = current && Object.keys(current.payload).length ? current.payload : (detail?.payload ?? EMPTY);
  const warnings = useMemo(() => (detail && detail.status !== "published" && detail.status !== "archived" ? ctorWarnings(code, after, before, { descendants, isNew: before === null }) : []), [detail, code, after, before, descendants]);
  const row = useMemo(() => (detail ? buildRow(detail, viewer, { items: reg.items, groups: reg.groups }) : (target?.row ?? null)), [detail, viewer, reg.items, reg.groups, target?.row]);
  const can = useMemo(() => (detail ? reviewCan(detail, viewer, regCtor) : NO_REVIEW), [detail, viewer, regCtor]);

  const addComment = useCallback(
    async (body: string): Promise<boolean> => {
      const v = body.trim();
      if (!id || !v) return false;
      setSending(true);
      setSendError(null);
      try {
        await addStudioComment(id, v);
        setSending(false);
        await loadComments();
        return true;
      } catch (e) {
        logApiError("studio.sx.approvals.comment", e);
        setSending(false);
        setSendError(e);
        return false;
      }
    },
    [id, loadComments],
  );

  const reloadComments = useCallback(() => void loadComments(), [loadComments]);
  const retry = useCallback(() => {
    void refresh();
    void loadComments();
  }, [refresh, loadComments]);

  const comments: ReviewComments = {
    items: notes.id === id ? notes.items : null,
    error: notes.id === id ? notes.error : null,
    sending,
    sendError,
  };

  return {
    id,
    detail,
    row,
    loading: !!id && got.id !== id,
    error,
    ctor,
    model,
    current,
    live,
    base,
    before,
    after,
    warnings,
    can,
    comments,
    addComment,
    reloadComments,
    refresh,
    retry,
  };
}
