"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { logApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { cleanPayload, normErrorPaths, normPath, pruneInvisible, targetErrors } from "@/lib/studioSchema";
import {
  archiveStudioObject,
  cloneStudioObject,
  createStudioObject,
  getStudioConstructorDetail,
  getStudioFormContext,
  getStudioObject,
  publishStudioObject,
  rollbackStudioObject,
  saveStudioObject,
  studioDefaults,
  studioDetailSnapshot,
  studioErrorOf,
  studioFormContextUrl,
  studioObjectAction,
  studioReferenceKey,
  submitStudioObject,
  uploadStudioFile,
  useStudioAccess,
  useStudioHeartbeat,
  useStudioRegistry,
  validateStudioDraft,
  type StudioAccess,
  type StudioConstructor,
  type StudioDetail,
  type StudioFormContext,
  type StudioSchemaField,
  type StudioVersion,
} from "@/lib/services/studio";
import { descendantIds, flattenCategoryTree, getCategoryTree } from "@/lib/services/categoryTree";
import type { SchemaModel, SchemaOnly, SxCtorLayout, SxEditMode, SxFileSlot, SxPayload, SxValues, SxWarning } from "../contract";
import type { SxErrors } from "../types";
import { useSxFormPolicy, type SxFormPolicy } from "../form/formPolicy";
import { dropReferenceCache, firstReferencePage } from "../form/useReferenceOptions";
import { statusKeyOf } from "../status";
import { RULE_TITLE_DUPLICATE, dropRuleTwins, duplicateFieldOf, duplicateNameOf, rememberDuplicate, ruleDuplicateErrors } from "../schema/ruleDuplicates";
import { ctorLayoutOf } from "../ctor/layouts";
import { k01LayoutOf, type CategoryKind } from "../ctor/services";
import { ctorWarnings } from "../ctor/warnings";
import { SOURCE_PRODUCER } from "../ctor/sources";
import { useSchemaModel } from "../schema/useSchemaModel";
import { getAt, invalidOptionPaths, validatePayload } from "../schema/model";
import { focusFieldPath } from "../schema/focus";
import { studioEventCode, studioEventObjectId, useStudioLive } from "../live";
import { withServerMessages } from "./serverMessages";
import { REVIEWING_STATUSES, editInReviewOf, missingRequired } from "./reviewEdit";
import { useEditorErrorText } from "./useEditorErrorText";
import { inheritedSlugOf, noteInheritedSlug, slugErrorsOnTitle, slugOf, withGeneratedSlug } from "./slug";
import {
  commentFromEvent,
  createComment,
  deleteComment,
  lifecycleOf,
  listComments,
  lockErrorOf,
  runLifecycle,
  structuredFieldOf,
  updateComment,
  upsertComment,
  type SxComment,
  type SxLifecycle,
  type SxLifecycleAction,
} from "./objectApi";
import {
  LOCKED_STATUSES,
  actionsOf,
  changedKeys,
  currentVersionOf,
  draftKey,
  editableOf,
  editorModeOf,
  liveVersionOf,
  nextNoteOf,
  peekPatch,
  peekSeed,
  pruneErrors,
  reviewNoteOf,
  runtimeStatusOf,
  seedDetail,
  seedPatch,
  takePatch,
} from "./model";

export type EditorMode = "create" | "clone" | "runtime-view" | "runtime-edit" | "object";
export type EditorPhase = "loading" | "ready" | "not-found" | "unknown-ctor" | "load-error";
export type EditorBusy = "" | "save" | "check" | "submit" | "publish" | "rollback" | "archive" | "clone" | "upload" | "comment" | "withdraw" | "restore";
export type EditorAlert =
  | { kind: "action"; error: unknown }
  | { kind: "locked"; code: string; withdraw: boolean; review?: boolean }
  | { kind: "publishFail"; text: string }
  | { kind: "remote"; conflict: boolean }
  | { kind: "file"; isNew: boolean }
  | null;
export type EditorPrimary = "saveSubmit" | "submit" | "publishDirect" | "publish" | "openReview" | "edit" | "save" | "restore" | null;
export type EditorInit = { code: string; id: string | null; ctx?: string; initialPayload?: SxPayload; initialTitle?: string; focus?: string; categoryKind?: CategoryKind };
export type EditorOptions = {
  onCreated?: (detail: StudioDetail) => void;
  onRedirect?: (objectId: string) => void;
  heartbeat?: boolean;
  live?: boolean;
  idPrefix?: string;
  only?: SchemaOnly;
  onFocusFail?: (path: string) => void;
  lockLive?: boolean;
  reviewEdit?: boolean;
};
export type EditorDialogError = { title: string; text: string };

export type EditorState = {
  phase: EditorPhase;
  loadError: unknown;
  mode: EditorMode;
  code: string;
  // A new category's kind (top level or subcategory), when it was chosen.
  categoryKind: CategoryKind | undefined;
  ctor: StudioConstructor | null;
  full: StudioConstructor | null;
  runtimeTarget: string;
  layout: SxCtorLayout;
  model: SchemaModel | null;
  idPrefix: string;
  fc: StudioFormContext | null;
  detail: StudioDetail | null;
  recordId: string;
  payload: SxPayload;
  recordTitle: string;
  title: string;
  dirty: boolean;
  changed: boolean;
  formMode: SxEditMode;
  schemaFailed: boolean;
  readOnly: boolean;
  readOnlyReason: "" | "access" | "locked" | "view" | "archived" | "live";
  editInReview: boolean;
  reviewMissing: string[];
  blocked: boolean;
  missing: string[];
  status: string;
  runtimeStatus: string;
  direct: boolean;
  access: StudioAccess;
  can: {
    save: boolean;
    submit: boolean;
    publish: boolean;
    archive: boolean;
    review: boolean;
    rollback: boolean;
    clone: boolean;
    newVersion: boolean;
    comment: boolean;
    upload: boolean;
    exportVersions: boolean;
    edit: boolean;
    withdraw: boolean;
    restore: boolean;
  };
  primary: EditorPrimary;
  editHref: string;
  next: { key: string; values?: Readonly<Record<string, string>> };
  reviewNote: { text: string; by: string; at: string; rejected: boolean } | null;
  clientErrors: SxErrors;
  serverErrors: SxErrors;
  draftErrors: SxErrors;
  errors: SxErrors;
  showSummary: boolean;
  policy: SxFormPolicy;
  warnings: SxWarning[];
  cascadeWarning: SxWarning | null;
  prevPayload: SxValues | null;
  changedPaths: string[] | null;
  alert: EditorAlert;
  busy: EditorBusy;
  comments: { items: SxComment[] | null; error: unknown };
  me: string;
  lifecycle: SxLifecycle;
  conflict: { fields: string[] } | null;
  descendants: number;
  fileRequired: boolean;
  hasFile: boolean;
  pendingFile: File | null;
  fileSlot: SxFileSlot | null;
  pickFile: (file: File | null) => void;
  currentVersion: StudioVersion | null;
  savedAt: string;
  dialogError: EditorDialogError | null;
  fileError: string;
  setPayload: (next: SxPayload, path: string) => void;
  setRecordTitle: (value: string) => void;
  setDraftError: (path: string, invalid: boolean) => void;
  save: (meta?: { summary?: string; version?: string }) => Promise<boolean>;
  prepareSubmit: () => Promise<boolean>;
  previewBody: () => SxPayload | null;
  submit: () => Promise<boolean>;
  publish: (note: string) => Promise<boolean>;
  rollback: (version: StudioVersion, note: string) => Promise<boolean>;
  archive: () => Promise<boolean>;
  withdraw: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  overwrite: () => Promise<boolean>;
  closeConflict: () => void;
  clone: (title: string) => Promise<string | null>;
  cloneHref: () => string;
  upload: (file: File) => Promise<boolean>;
  addComment: (text: string) => Promise<boolean>;
  editComment: (commentId: string, text: string) => Promise<boolean>;
  removeComment: (commentId: string) => Promise<boolean>;
  reloadComments: () => void;
  refresh: (force?: boolean) => Promise<void>;
  loadRemote: () => void;
  dismissAlert: () => void;
  retryLoad: () => void;
  clearDialogError: () => void;
  unlock: () => void;
};

type Draft = { title: string; payload: SxPayload };
type Loaded = { gen: number; draft: Draft; base: Draft | null; start: Draft | null; prepared: boolean; patched: boolean };
type FullState = { code: string; ctor: StudioConstructor | null; done: boolean };

const EMPTY_PAYLOAD: SxPayload = {};
const EMPTY_ERRORS: SxErrors = {};
const EMPTY_PATHS: string[] = [];
const LIVE: ReadonlySet<string> = new Set(["approved", "published"]);
const SUBMIT_PRIMARY: ReadonlySet<EditorPrimary> = new Set<EditorPrimary>(["saveSubmit", "submit", "publishDirect", "save"]);
const NO_CAN: EditorState["can"] = {
  save: false,
  submit: false,
  publish: false,
  archive: false,
  review: false,
  rollback: false,
  clone: false,
  newVersion: false,
  comment: false,
  upload: false,
  exportVersions: false,
  edit: false,
  withdraw: false,
  restore: false,
};
const TITLE_MAX = 200;
type RefreshMode = boolean | "own";

const sameServerVersion = (a: StudioDetail, b: StudioDetail | null): boolean => {
  if (!b || a.id !== b.id) return false;
  if (a.lockVersion !== null && b.lockVersion !== null) return a.lockVersion === b.lockVersion;
  return Boolean(a.currentVersionId) && a.currentVersionId === b.currentVersionId && a.updatedAt === b.updatedAt;
};

const stripPayload = (errors: Readonly<Record<string, string>>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errors)) {
    const key = k.replace(/^(body|payload)\./, "");
    out[key] = out[key] ? `${out[key]}; ${v}` : v;
  }
  return out;
};
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const draftOf = (d: StudioDetail): Draft => ({ title: d.title, payload: { ...d.payload } });
const omit = (errors: SxErrors, key: string): SxErrors => {
  if (!(key in errors)) return errors;
  const out: Record<string, string> = { ...errors };
  delete out[key];
  return out;
};

function fieldSources(fields: readonly StudioSchemaField[], out: Set<string>): Set<string> {
  for (const f of fields) {
    if (f.source) out.add(f.source);
    if (f.item) fieldSources([f.item], out);
    if (f.properties.length) fieldSources(f.properties, out);
  }
  return out;
}

function sortByDom(idPrefix: string, paths: readonly string[]): string[] {
  if (typeof document === "undefined") return [...paths];
  const form = document.getElementById(`${idPrefix}-form`);
  const at = (p: string): Element | null => {
    if (!form) return null;
    const norm = p === "$title" ? p : normPath(p);
    return form.querySelector(`[data-path="${norm.replace(/["\\]/g, "\\$&")}"]`);
  };
  return [...paths]
    .map((p, i) => ({ p, i, el: at(p) }))
    .sort((a, b) => {
      if (a.el && b.el) {
        if (a.el === b.el) return a.i - b.i;
        return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      }
      if (a.el) return -1;
      if (b.el) return 1;
      return a.i - b.i;
    })
    .map((x) => x.p);
}

export function useEditorState(init: EditorInit, opts: EditorOptions = {}): EditorState {
  const t = useTranslations("studio");
  const locale = useLocale();
  const errText = useEditorErrorText();
  const reg = useStudioRegistry();
  const access = useStudioAccess();
  const { session } = useAuth();
  const me = session?.id ?? "";

  const id = init.id || null;
  const ctx = id ? "" : init.ctx ?? "";
  const idPrefix = opts.idPrefix ?? "sx-ed";
  const seed = id ? peekSeed(id) : null;

  const [detail, setDetail] = useState<StudioDetail | null>(seed);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [fc, setFc] = useState<StudioFormContext | null>(null);
  const [fcErr, setFcErr] = useState<unknown>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(() => (seed ? { gen: 1, draft: draftOf(seed), base: draftOf(seed), start: null, prepared: false, patched: false } : null));
  const [attempt, setAttempt] = useState(0);
  const [fullState, setFullState] = useState<FullState>(() => {
    const code0 = init.code || seed?.code || "";
    const snap = code0 ? studioDetailSnapshot(code0) : null;
    return { code: code0, ctor: snap, done: Boolean(snap) };
  });
  const [serverErrors, setServerErrors] = useState<SxErrors>(EMPTY_ERRORS);
  const [draftErrors, setDraftErrors] = useState<SxErrors>(EMPTY_ERRORS);
  const [actionError, setActionError] = useState<{ error: unknown } | null>(null);
  const [publishFail, setPublishFail] = useState<string | null>(null);
  const [remote, setRemote] = useState<{ conflict: boolean } | null>(null);
  const [busy, setBusy] = useState<EditorBusy>("");
  const [comments, setComments] = useState<{ items: SxComment[] | null; error: unknown }>({ items: null, error: null });
  const [locked, setLocked] = useState<{ code: string; withdrawUrl: string; review: boolean } | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [dialogError, setDialogError] = useState<EditorDialogError | null>(null);
  const [fileError, setFileError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [desc, setDesc] = useState<{ id: string; n: number }>({ id: "", n: 0 });
  const [unlockedFor, setUnlockedFor] = useState<string | null>(() => (id && peekPatch(id) ? "*" : null));

  const code = init.code || detail?.code || seed?.code || "";
  const regCtor = useMemo(() => (code ? reg.items.find((c) => c.code === code) ?? null : null), [reg.items, code]);
  const full = fullState.code === code ? fullState.ctor : null;
  const schemaFailed = Boolean(code) && fullState.code === code && fullState.done && !fullState.ctor;
  const meta = full ?? regCtor;

  let mode = editorModeOf(id, ctx);
  if (fc?.mode === "view" && (mode === "runtime-edit" || mode === "runtime-view")) mode = "runtime-view";

  const runtimeTarget = full?.runtimeTarget || regCtor?.runtimeTarget || "";
  const categoryKind = !id && code.toUpperCase() === "K01" ? init.categoryKind : undefined;
  const baseLayout = useMemo(() => (categoryKind ? k01LayoutOf(categoryKind) : ctorLayoutOf(code, runtimeTarget)), [code, runtimeTarget, categoryKind]);
  const model = useSchemaModel({ ctor: full, layout: baseLayout, runtimeTarget, idPrefix, only: opts.only });
  const layout = model?.layout ?? baseLayout;
  const derive = layout.titleFrom;
  const titleField = model?.titleField ?? null;

  const statusNorm: string = mode === "object" ? detail?.status ?? "draft" : mode === "create" || mode === "clone" ? "draft" : "";
  const status = mode === "object" ? detail?.statusRaw || detail?.status || "" : statusNorm;
  const statusKey = statusKeyOf(status, "studio");
  const liveKey = `${statusNorm}:${detail?.currentVersionId ?? ""}`;
  const liveLocked = !!opts.lockLive && mode === "object" && LIVE.has(statusNorm) && unlockedFor !== "*" && unlockedFor !== liveKey;
  const lifecycle = useMemo(() => lifecycleOf(detail), [detail]);
  const reviewOpt = opts.reviewEdit === true;
  const reviewing = mode === "object" && REVIEWING_STATUSES.has(statusNorm);
  const editInReview = reviewOpt && reviewing && editInReviewOf(detail?.raw);
  const editable = editInReview || editableOf(access, lifecycle);
  const readOnlyReason: EditorState["readOnlyReason"] =
    statusNorm === "archived" ? "archived" : LOCKED_STATUSES.has(statusNorm) && !editInReview ? "locked" : !editable ? "access" : mode === "runtime-view" ? "view" : liveLocked ? "live" : "";
  const readOnly = readOnlyReason !== "";
  const editMismatch = lifecycle.contract && access.known && access.canEdit && lifecycle.canEdit === false && (statusNorm === "draft" || statusNorm === "changes_requested");
  const mismatchId = editMismatch ? detail?.id ?? "" : "";
  useEffect(() => {
    if (mismatchId) console.warn("[lexgo]", "studio.sx.object.can_edit", { id: mismatchId, canEdit: false, roleCanEdit: true });
  }, [mismatchId]);
  const formMode: SxEditMode = readOnly ? "view" : mode === "create" || mode === "clone" ? "create" : "edit";
  const gate = regCtor ?? full;
  const blocked = mode === "create" && Boolean(gate && (gate.availability === "blocked" || gate.missingRequired.length));
  const missing = gate?.missingRequired ?? [];
  const direct = meta ? !meta.approvalRequired : false;
  const recordId = mode === "object" ? str(detail?.raw.runtime_target_id) : mode === "runtime-view" || mode === "runtime-edit" ? fc?.runtimeTargetId ?? "" : "";
  const transformCtx = useMemo(() => ({ code, runtimeTarget, mode: formMode }), [code, runtimeTarget, formMode]);

  const edited = useCallback(
    (prev: SxValues, next: SxPayload): SxPayload => {
      let out: SxPayload = full?.typed.length ? pruneInvisible(full.typed, next) : next;
      if (layout.transform) out = layout.transform(out, prev, transformCtx);
      return out;
    },
    [full, layout, transformCtx],
  );

  if (loaded && !loaded.prepared && (full !== null || schemaFailed) && access.known) {
    let draft = loaded.draft;
    let patched = false;
    if (!readOnly) {
      if (layout.transform) draft = { ...draft, payload: layout.transform(draft.payload, draft.payload, transformCtx) };
      const patch = id ? peekPatch(id) : null;
      if (patch) {
        const payload = edited(draft.payload, { ...draft.payload, ...patch });
        draft = { title: titleField && titleField in patch ? str(payload[titleField]) : draft.title, payload };
        patched = true;
      }
    }
    setLoaded({ ...loaded, draft, start: draft, prepared: true, patched });
  }

  const draft = loaded?.draft ?? null;
  const payload = draft?.payload ?? EMPTY_PAYLOAD;
  const recordTitle = draft?.title ?? "";
  const formReady = Boolean(model && loaded?.prepared);
  const keyNow = useMemo(() => (draft ? draftKey(titleField ? "" : draft.title, draft.payload) : ""), [draft, titleField]);
  const keyBase = useMemo(() => (loaded?.base ? draftKey(titleField ? "" : loaded.base.title, loaded.base.payload) : null), [loaded?.base, titleField]);
  const keyStart = useMemo(() => (loaded?.start ? draftKey(titleField ? "" : loaded.start.title, loaded.start.payload) : null), [loaded?.start, titleField]);
  const fileRequired = code === "K06" && payload.mode === "upload";
  const pending = fileRequired ? pendingFile : null;
  const payloadDirty = formReady && Boolean(draft) && (keyBase === null || keyNow !== keyBase);
  const dirty = payloadDirty || (formReady && Boolean(pending));
  const changed = formReady && Boolean(draft) && ((keyStart !== null && keyNow !== keyStart) || Boolean(pending));

  const resetKey = `${id ?? ctx}:${detail?.currentVersionId ?? ""}`;
  const policy = useSxFormPolicy(resetKey);

  const latestRef = useRef<Loaded | null>(loaded);
  const changedRef = useRef(false);
  const hadDetailRef = useRef(Boolean(seed));
  const seqRef = useRef(0);
  const detailRef = useRef<StudioDetail | null>(detail);
  const optsRef = useRef(opts);
  const initRef = useRef(init);
  const regCtorRef = useRef(regCtor);
  const slugForceRef = useRef(false);
  const slugRejectedRef = useRef("");
  const slugSentRef = useRef("");
  const slugMadeRef = useRef<string[]>([]);
  useEffect(() => {
    latestRef.current = loaded;
    changedRef.current = changed;
    hadDetailRef.current = detail !== null;
    detailRef.current = detail;
    optsRef.current = opts;
    initRef.current = init;
    regCtorRef.current = regCtor;
  });

  const commit = useCallback((next: Loaded) => {
    latestRef.current = next;
    setLoaded(next);
  }, []);

  const apply = useCallback(
    (d: StudioDetail, force: RefreshMode) => {
      const known = detailRef.current;
      detailRef.current = d;
      setDetail(d);
      setLoadErr(null);
      if (changedRef.current && (force === "own" || (force === false && sameServerVersion(d, known)))) {
        const prev = latestRef.current;
        if (prev) commit({ ...prev, base: draftOf(d) });
      } else if (force === true || !changedRef.current) {
        const prev = latestRef.current;
        commit({ gen: (prev?.gen ?? 0) + 1, draft: draftOf(d), base: draftOf(d), start: null, prepared: false, patched: false });
        setDraftErrors(EMPTY_ERRORS);
        setRemote(null);
      } else {
        setRemote((r) => r ?? { conflict: false });
      }
    },
    [commit],
  );

  const refresh = useCallback(
    async (force: RefreshMode = false): Promise<void> => {
      if (!id) return;
      const my = ++seqRef.current;
      try {
        const d = await getStudioObject(id);
        if (my === seqRef.current) apply(d, force);
      } catch (e) {
        logApiError("studio.sx.object.get", e);
        if (my === seqRef.current && !hadDetailRef.current) setLoadErr(e);
      }
    },
    [id, apply],
  );

  const loadComments = useCallback(async () => {
    if (!id) return;
    try {
      const items = await listComments(id);
      setComments({ items, error: null });
    } catch (e) {
      logApiError("studio.sx.comments", e);
      setComments((c) => ({ items: c.items, error: e }));
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const my = ++seqRef.current;
    getStudioObject(id)
      .then((d) => {
        if (alive && my === seqRef.current) apply(d, true);
      })
      .catch((e: unknown) => {
        logApiError("studio.sx.object.get", e);
        if (alive && my === seqRef.current && !hadDetailRef.current) setLoadErr(e);
      });
    return () => {
      alive = false;
    };
  }, [id, apply, attempt]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    listComments(id)
      .then((items) => {
        if (alive) setComments({ items, error: null });
      })
      .catch((e: unknown) => {
        logApiError("studio.sx.comments", e);
        if (alive) setComments((c) => ({ items: c.items, error: e }));
      });
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    void getStudioConstructorDetail(code).then((c) => {
      if (alive) setFullState({ code, ctor: c, done: true });
    });
    return () => {
      alive = false;
    };
  }, [code, attempt]);

  useEffect(() => {
    if (id || !ctx || !code) return;
    let alive = true;
    const ac = new AbortController();
    Promise.all([getStudioFormContext(ctx, ac.signal), getStudioConstructorDetail(code)])
      .then(([form, fullCtor]) => {
        if (!alive) return;
        const redirect = optsRef.current.onRedirect;
        if (form.studioObjectId && form.mode !== "clone" && redirect) {
          redirect(form.studioObjectId);
          return;
        }
        const wanted = initRef.current;
        setFc(form);
        setFcErr(null);
        const isCreate = form.mode === "create";
        const start: SxPayload = isCreate ? { ...(fullCtor?.typed.length ? studioDefaults(fullCtor) : {}), ...form.initialPayload, ...(wanted.initialPayload ?? {}) } : { ...form.initialPayload };
        const first: Draft = { title: form.title || wanted.initialTitle || "", payload: start };
        const cur = latestRef.current;
        if (cur) return;
        commit({ gen: 1, draft: first, base: isCreate || form.mode === "view" ? first : null, start: null, prepared: false, patched: false });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        logApiError("studio.sx.form_context", e);
        setFcErr(e);
      });
    return () => {
      alive = false;
      ac.abort();
    };
  }, [id, ctx, code, attempt, commit]);

  useEffect(() => {
    if (id || ctx || !code) return;
    let alive = true;
    void getStudioConstructorDetail(code).then((fullCtor) => {
      if (!alive) return;
      const wanted = initRef.current;
      const defaults = fullCtor ? studioDefaults(fullCtor) : { ...(regCtorRef.current?.defaultPayload ?? {}) };
      const first: Draft = { title: wanted.initialTitle ?? "", payload: { ...defaults, ...(wanted.initialPayload ?? {}) } };
      const cur = latestRef.current;
      if (cur) {
        const untouched = !cur.start || draftKey(cur.draft.title, cur.draft.payload) === draftKey(cur.start.title, cur.start.payload);
        if (!untouched || !fullCtor) return;
      }
      commit({ gen: (cur?.gen ?? 0) + 1, draft: first, base: first, start: null, prepared: false, patched: false });
    });
    return () => {
      alive = false;
    };
  }, [id, ctx, code, attempt, commit]);

  useEffect(() => {
    if (loaded?.patched && id) takePatch(id);
  }, [loaded?.patched, loaded?.gen, id]);

  const gen = loaded?.gen ?? 0;
  const prepared = Boolean(loaded?.prepared);
  useEffect(() => {
    if (!model || !prepared || readOnly) return;
    const cur = latestRef.current;
    if (!cur) return;
    const paths = invalidOptionPaths(model, cur.draft.payload);
    if (paths.length) policy.markServer(paths);
  }, [model, prepared, gen, resetKey, readOnly, policy]);

  useEffect(() => {
    const refs = full?.references ?? [];
    for (const s of refs) firstReferencePage(s).catch(() => undefined);
  }, [full]);

  useEffect(() => {
    if (code !== "K01" || !recordId) return;
    let alive = true;
    getCategoryTree({ includeInactive: true })
      .then((nodes) => {
        if (alive) setDesc({ id: recordId, n: descendantIds(recordId, flattenCategoryTree(nodes)).size });
      })
      .catch(() => {
        if (alive) setDesc({ id: recordId, n: 0 });
      });
    return () => {
      alive = false;
    };
  }, [code, recordId]);
  const descendants = code === "K01" && desc.id === recordId ? desc.n : 0;

  const dropProducedSources = useCallback(
    (producer: string) => {
      const keys = Object.entries(SOURCE_PRODUCER)
        .filter(([, p]) => p.code === producer)
        .map(([k]) => k);
      if (!keys.length) return;
      const known = fieldSources(full?.typed ?? [], new Set(full?.references ?? []));
      for (const k of keys) known.add(`/studio/reference/${k}`);
      for (const s of known) if (keys.includes(studioReferenceKey(s).key)) dropReferenceCache(s);
    },
    [full],
  );

  useStudioLive((e) => {
    if (e.event === "studio.object_published") {
      const producer = studioEventCode(e);
      if (producer) dropProducedSources(producer);
    }
    if (!id) return;
    if (e.event === "studio.resync") {
      void refresh();
      void loadComments();
      return;
    }
    if (studioEventObjectId(e) !== id) return;
    if (e.event === "studio.comment_created" || e.event === "studio.comment_updated" || e.event === "studio.comment_deleted") {
      const c = commentFromEvent(e.data ?? e);
      const gone = e.event === "studio.comment_deleted";
      if (c) setComments((s) => ({ items: upsertComment(s.items, gone ? { ...c, deleted: true, text: "" } : c), error: null }));
      else void loadComments();
    }
    else if (e.event.startsWith("studio.object_") || e.event.startsWith("studio.approval_") || e.event === "studio.file_uploaded") void refresh();
  }, opts.live !== false);

  let phase: EditorPhase;
  if ((mode === "create" || mode === "clone") && code && reg.items.length > 0 && !regCtor) phase = "unknown-ctor";
  else if (mode === "object") phase = detail && loaded?.prepared ? "ready" : !detail && loadErr ? (studioErrorOf(loadErr).kind === "not_found" ? "not-found" : "load-error") : "loading";
  else phase = loaded?.prepared ? "ready" : !loaded && fcErr ? "load-error" : "loading";
  const loadError = mode === "object" ? loadErr : fcErr;

  const title = (derive ? derive(payload).value : titleField ? str(payload[titleField]).trim() : recordTitle.trim()) || detail?.title || fc?.title || "";

  const hb = useStudioHeartbeat({
    enabled: opts.heartbeat !== false && phase === "ready" && statusNorm !== "archived",
    constructorCode: code,
    objectId: id ?? "",
    versionId: detail?.currentVersionId ?? "",
    objectName: title,
    screen: `${code.toLowerCase()}-editor`,
  });

  const currentVersion = currentVersionOf(detail);
  const hasFile = Boolean(detail?.hasFile || currentVersion?.hasFile);
  const fileMissing = fileRequired && !hasFile && !pending;
  const reviewMissing = useMemo(() => (reviewOpt && reviewing && formReady ? missingRequired(model, payload, { fileMissing }) : EMPTY_PATHS), [reviewOpt, reviewing, formReady, model, payload, fileMissing]);
  const missingKey = editInReview ? reviewMissing.join("|") : "";
  useEffect(() => {
    if (missingKey) policy.markServer(missingKey.split("|"));
  }, [missingKey, policy]);

  const prevPayload: SxValues | null = useMemo(() => {
    if (mode === "object") return liveVersionOf(detail)?.payload ?? null;
    if (mode === "runtime-edit") return fc?.initialPayload ?? null;
    return null;
  }, [mode, detail, fc]);
  const basePayload: SxValues | null = loaded?.base?.payload ?? prevPayload;
  const isNew = mode !== "object";
  const warnings = useMemo(() => (formReady ? ctorWarnings(code, payload, prevPayload, { descendants, isNew }) : []), [formReady, code, payload, prevPayload, descendants, isNew]);
  const cascadeWarning = useMemo(
    () => (formReady ? ctorWarnings(code, payload, basePayload, { descendants, isNew }).find((w) => w.key === "sx.warn.K01__cascade") ?? null : null),
    [formReady, code, payload, basePayload, descendants, isNew],
  );
  const changedPaths = useMemo(() => (prevPayload ? changedKeys(prevPayload, payload) : null), [prevPayload, payload]);
  const serverPayload = detail?.payload ?? null;
  const conflict = useMemo(() => (conflictOpen && serverPayload ? { fields: changedKeys(serverPayload, payload) } : null), [conflictOpen, serverPayload, payload]);

  const clientErrors = useMemo(
    () => (model && formReady && !readOnly ? validatePayload(model, payload, titleField ? null : recordTitle) : EMPTY_ERRORS),
    [model, formReady, readOnly, payload, titleField, recordTitle],
  );
  const errors = useMemo<SxErrors>(() => ({ ...clientErrors, ...serverErrors, ...draftErrors }), [clientErrors, serverErrors, draftErrors]);
  const showSummary = policy.submitted || Object.keys(serverErrors).length > 0;

  const reviewNote = statusNorm === "changes_requested" ? reviewNoteOf(detail, comments.items) : null;
  const actionsInput = {
    mode,
    status: statusNorm,
    statusKey,
    dirty,
    readOnly,
    readOnlyReason,
    blocked,
    direct,
    access,
    hasObject: Boolean(id && detail),
    versions: detail?.versions.length ?? 0,
    // A rule's next version continues a published rule (existing_rule_id), so
    // a rule that has never been published has none to offer.
    newVersion: Boolean(layout.newVersion) && (code.toUpperCase() !== "K31" || !!recordId),
    lifecycle,
    reviewEdit: editInReview,
    reviewNeedsPermission: reviewOpt && reviewing && !editInReview && access.canReview,
  };
  const acts = actionsOf(actionsInput);
  let can = acts.can;
  let primary = acts.primary;
  if (phase !== "ready") {
    can = NO_CAN;
    primary = null;
  } else if (!formReady) {
    can = { ...can, save: false, submit: false };
    if (SUBMIT_PRIMARY.has(primary)) primary = null;
  }
  const next = phase === "ready" ? nextNoteOf({ ...actionsInput, reviewNote }) : { key: "" };

  const formUrl = (m: "edit" | "clone"): string => {
    const url = ctx ? studioFormContextUrl(ctx, m) : "";
    return url ? `/admin/studio/o/new?new=${encodeURIComponent(code)}&ctx=${encodeURIComponent(url)}` : "";
  };
  const editHref = mode === "runtime-view" ? formUrl("edit") : "";

  const alert: EditorAlert = actionError
    ? { kind: "action", error: actionError.error }
    : locked
      ? { kind: "locked", code: locked.code, withdraw: !locked.review && (Boolean(locked.withdrawUrl) || can.withdraw), ...(locked.review ? { review: true } : {}) }
      : publishFail !== null
        ? { kind: "publishFail", text: publishFail }
        : remote
          ? { kind: "remote", conflict: remote.conflict }
          : fileRequired && !hasFile && !pending && !readOnly && phase === "ready"
            ? { kind: "file", isNew: !id }
            : null;

  const focusFirst = (paths: readonly string[]) => {
    if (!paths.length || typeof window === "undefined") return;
    const list = [...paths];
    window.requestAnimationFrame(() => {
      const first = sortByDom(idPrefix, list)[0];
      if (first && !focusFieldPath(idPrefix, first)) optsRef.current.onFocusFail?.(first);
    });
  };

  const showServer = (raw: SxErrors) => {
    const moved = slugErrorsOnTitle(raw, titleField ?? "$title");
    if (moved.moved) {
      slugForceRef.current = true;
      slugRejectedRef.current = slugSentRef.current;
    }
    const fe = moved.errors;
    const keys = Object.keys(fe);
    setServerErrors(fe);
    policy.markServer(keys);
    focusFirst(keys);
  };

  const fail = (scope: string, e: unknown) => {
    logApiError(scope, e);
    const lock = lockErrorOf(e);
    if (lock?.code === "studio_version_locked") {
      setActionError(null);
      setLocked({ code: lock.code, withdrawUrl: lock.withdrawUrl, review: editInReview });
      void refresh(false);
      return;
    }
    // A name the backend says is taken lands on that name's field, and the
    // rule it named is remembered for the note there.
    const dup = code.toUpperCase() === "K31" || code.toUpperCase() === "K02" ? duplicateNameOf(e) : null;
    const cur = latestRef.current?.draft.payload ?? payload;
    const dupField = dup ? duplicateFieldOf(code, cur, dup) : "";
    if (dup && dupField) {
      rememberDuplicate(getAt(cur, dupField), dup);
      setActionError(null);
      showServer({ [dupField]: RULE_TITLE_DUPLICATE });
      return;
    }
    const se = studioErrorOf(e);
    if (fileRequired && !Object.keys(se.fieldErrors).length && /file/i.test(se.code)) {
      setActionError(null);
      showServer({ file: "@file" });
      return;
    }
    const one = Object.keys(se.fieldErrors).length ? null : structuredFieldOf(e);
    const found: Record<string, string> = one ? { [one.field]: `@code:${one.code}` } : se.fieldErrors;
    const raw = Object.keys(found).length ? withServerMessages(targetErrors(normErrorPaths(stripPayload(found)), latestRef.current?.draft.payload ?? payload), e, locale) : {};
    if (Object.keys(raw).length) {
      setActionError(null);
      showServer(raw);
    } else {
      setActionError({ error: e });
    }
  };

  const draftBlock = (): boolean => {
    const keys = Object.keys(draftErrors);
    if (!keys.length) return false;
    policy.markServer(keys);
    focusFirst(keys);
    return true;
  };

  const titleNow = (): string => {
    const cur = latestRef.current?.draft ?? draft;
    const typed = cur ? (derive ? derive(cur.payload).value : titleField ? str(cur.payload[titleField]) : cur.title).trim() : "";
    return typed || detail?.title || "";
  };

  const titleOrFail = (): string => {
    const value = titleNow();
    if (value) return value;
    const cur = latestRef.current?.draft ?? draft;
    const p = derive && cur ? derive(cur.payload).path : titleField ?? "$title";
    setServerErrors((s) => ({ ...s, [p]: "@required" }));
    policy.markServer([p]);
    focusFirst([p]);
    return "";
  };

  const lockVersionFor = async (objectId: string): Promise<number | null> => {
    const known = detailRef.current?.lockVersion ?? null;
    if (known !== null) return known;
    const fresh = await getStudioObject(objectId).catch(() => null);
    return fresh?.lockVersion ?? null;
  };

  const bodyOf = (values: SxPayload, objTitle: string): SxPayload => {
    const clean = full?.typed.length ? cleanPayload(full.typed, values) : values;
    const serverTitle = detailRef.current?.title ?? "";
    const inheritedSlug = inheritedSlugOf(id);
    const out = withGeneratedSlug(full, clean, objTitle, {
      force: slugForceRef.current,
      keep: Boolean(recordId) || Boolean(detailRef.current?.publishedVersionId),
      fresh: mode === "create" || mode === "clone",
      rejected: slugRejectedRef.current,
      generated: inheritedSlug ? [...slugMadeRef.current, inheritedSlug] : slugMadeRef.current,
      titles: serverTitle ? [serverTitle] : [],
    });
    const made = slugOf(out);
    if (made && made !== slugOf(clean) && !slugMadeRef.current.includes(made)) slugMadeRef.current = [...slugMadeRef.current, made];
    return out;
  };

  const slugPending = (cur: Draft, objTitle: string): boolean => slugOf(bodyOf(cur.payload, objTitle)) !== slugOf(cur.payload);

  const previewBody = (): SxPayload | null => {
    const cur = latestRef.current?.draft ?? draft;
    return cur ? bodyOf(cur.payload, titleNow()) : null;
  };

  const persist = async (meta?: { summary?: string; version?: string }): Promise<{ id: string; created: StudioDetail | null } | null> => {
    const cur = latestRef.current?.draft ?? draft;
    if (!cur) return null;
    const objTitle = titleOrFail();
    if (!objTitle) return null;
    // A subcategory is never saved without its parent, not even as a draft:
    // without one it would land at the top level.
    if (categoryKind === "sub" && !str(cur.payload.parent_id)) {
      setServerErrors((s) => ({ ...s, parent_id: "@required" }));
      policy.markServer(["parent_id"]);
      focusFirst(["parent_id"]);
      return null;
    }
    // A rule name another rule already has (once normalised) is refused here;
    // the note under the field offers the existing rule instead.
    const twins = ruleDuplicateErrors(code, cur.payload, [id ?? "", recordId]);
    if (Object.keys(twins).length) {
      showServer(twins);
      return null;
    }
    setActionError(null);
    setPublishFail(null);
    const body = bodyOf(cur.payload, objTitle);
    slugSentRef.current = slugOf(body);
    try {
      if (!id) {
        const target = mode === "runtime-edit" && fc ? { runtimeTargetId: fc.runtimeTargetId, runtimeTargetType: fc.runtimeTargetType } : {};
        const created = await createStudioObject({ constructorCode: code, title: objTitle, payload: body, ...target });
        if (!created.id) {
          notify.error(t("sx.editor.toast.noId"));
          return null;
        }
        hb.markSaved();
        if (code.toUpperCase() === "K31") dropRuleTwins();
        const seeded: StudioDetail = { ...created, code: created.code || code, title: created.title || objTitle, payload: Object.keys(created.payload).length ? created.payload : body };
        seedDetail(seeded);
        return { id: created.id, created: seeded };
      }
      const expectedLockVersion = await lockVersionFor(id);
      await saveStudioObject(id, { title: objTitle, payload: body, summary: meta?.summary, version: meta?.version, expectedLockVersion }, lifecycle.saveUrl);
      hb.markSaved();
      if (code.toUpperCase() === "K31") dropRuleTwins();
      return { id, created: null };
    } catch (e) {
      const se = studioErrorOf(e);
      if (se.kind === "edit_conflict" || se.code === "studio_version_conflict") {
        logApiError("studio.sx.object.save", e);
        setRemote({ conflict: true });
        setConflictOpen(true);
        await refresh(false);
        return null;
      }
      fail("studio.sx.object.save", e);
      return null;
    }
  };

  const sendPending = async (objectId: string): Promise<boolean> => {
    if (!pending) return true;
    try {
      await uploadStudioFile(objectId, pending);
      setPendingFile(null);
      setFileError("");
      hb.markSaved();
      return true;
    } catch (e) {
      logApiError("studio.sx.object.file", e);
      setFileError(errText(e).text || t("sx.editor.files.uploadFail"));
      notify.error(t(objectId === id ? "sx.editor.files.uploadFail" : "sx.k06.toast.uploadAfterCreate"));
      return false;
    }
  };

  const pickFile = (file: File | null) => {
    setPendingFile(file);
    setFileError("");
    if (file) setServerErrors((s) => omit(s, "file"));
  };

  const save = async (meta?: { summary?: string; version?: string }): Promise<boolean> => {
    if (busy || !can.save || (id && !dirty)) return false;
    if (draftBlock()) return false;
    setBusy("save");
    const sent = latestRef.current?.draft;
    try {
      const r = id && !payloadDirty ? { id, created: null } : await persist(meta);
      if (!r) return false;
      const uploaded = await sendPending(r.id);
      setServerErrors(EMPTY_ERRORS);
      if (uploaded) notify.success(t(id ? (editInReview ? "sx.ap4.ed.saved" : "sx.editor.toast.saved") : "sx.editor.toast.created"));
      if (!id) {
        if (r.created) optsRef.current.onCreated?.(r.created);
      } else {
        await refresh(latestRef.current?.draft === sent ? true : "own");
      }
      return true;
    } finally {
      setBusy("");
    }
  };

  const prepareSubmit = async (): Promise<boolean> => {
    if (busy || !can.submit || !model) return false;
    policy.markSubmitted();
    if (draftBlock()) return false;
    const objTitle = titleOrFail();
    if (!objTitle) return false;
    const cur = latestRef.current?.draft ?? draft;
    if (!cur) return false;
    const local: Record<string, string> = { ...validatePayload(model, cur.payload, titleField ? null : cur.title) };
    if (fileRequired && !hasFile && !pending) {
      local.file = "@file";
      setServerErrors((s) => ({ ...s, file: "@file" }));
      policy.markServer(["file"]);
    }
    const localKeys = Object.keys(local);
    if (localKeys.length) {
      focusFirst(localKeys);
      return false;
    }
    setBusy("check");
    try {
      const body = bodyOf(cur.payload, objTitle);
      slugSentRef.current = slugOf(body);
      const check = await validateStudioDraft(code, body, undefined, recordId);
      if (!check.ok && Object.keys(check.errors).length) {
        showServer(withServerMessages(targetErrors(normErrorPaths(check.errors), cur.payload), check.raw, locale));
        return false;
      }
      setServerErrors(EMPTY_ERRORS);
      return true;
    } catch (e) {
      fail("studio.sx.object.validate", e);
      return false;
    } finally {
      setBusy("");
    }
  };

  const submit = async (): Promise<boolean> => {
    if (busy) return false;
    setBusy("submit");
    setDialogError(null);
    setActionError(null);
    try {
      const cur = latestRef.current?.draft ?? draft;
      const stale = cur !== null && slugPending(cur, titleNow());
      const r = id && !payloadDirty && !stale ? { id, created: null } : await persist();
      if (!r) return false;
      if (!(await sendPending(r.id))) {
        if (!id && r.created) optsRef.current.onCreated?.(r.created);
        else if (id) await refresh("own");
        return false;
      }
      try {
        await submitStudioObject(r.id, r.id === id ? lifecycle.submitUrl : "");
        setServerErrors(EMPTY_ERRORS);
        notify.success(t(direct ? "sx.editor.toast.submittedDirect" : "sx.editor.toast.submitted"));
        if (!id) {
          const fresh = await getStudioObject(r.id).catch(() => null);
          if (fresh) seedDetail(fresh);
          const open = fresh ?? r.created;
          if (open) optsRef.current.onCreated?.(open);
        } else {
          await refresh(true);
        }
        return true;
      } catch (e) {
        if (!id) {
          logApiError("studio.sx.object.submit", e);
          if (r.created) optsRef.current.onCreated?.(r.created);
          notify.error(errText(e).text);
        } else {
          await refresh(true);
          fail("studio.sx.object.submit", e);
        }
        return false;
      }
    } finally {
      setBusy("");
    }
  };

  const publish = async (note: string): Promise<boolean> => {
    if (!id || busy) return false;
    setBusy("publish");
    setDialogError(null);
    setActionError(null);
    try {
      await publishStudioObject(id, { note });
      setPublishFail(null);
      notify.success(t("sx.editor.toast.published"));
      await refresh(true);
      return true;
    } catch (e) {
      logApiError("studio.sx.object.publish", e);
      const se = studioErrorOf(e);
      if (se.kind === "publish_failed") {
        const text = se.message || t("sx.editor.alert.publishFailText");
        setDialogError({ title: t("sx.editor.alert.publishFailTitle"), text });
        setPublishFail(text);
      } else {
        setDialogError(errText(e));
        setActionError({ error: e });
      }
      void refresh();
      return false;
    } finally {
      setBusy("");
    }
  };

  const rollback = async (version: StudioVersion, note: string): Promise<boolean> => {
    if (!id || busy || !version.id) return false;
    setBusy("rollback");
    setDialogError(null);
    setActionError(null);
    try {
      await rollbackStudioObject(id, { versionId: version.id, note });
      notify.success(t("sx.editor.toast.rolledBack", { v: version.version || "—" }));
      await refresh(true);
      return true;
    } catch (e) {
      logApiError("studio.sx.object.rollback", e);
      setDialogError(errText(e));
      setActionError({ error: e });
      return false;
    } finally {
      setBusy("");
    }
  };

  const archive = async (): Promise<boolean> => {
    if (!id || busy) return false;
    setBusy("archive");
    try {
      await archiveStudioObject(id);
      notify.success(t("sx.editor.toast.archived"));
      await refresh(true);
      return true;
    } catch (e) {
      logApiError("studio.sx.object.archive", e);
      notify.error(errText(e).text);
      setActionError({ error: e });
      return false;
    } finally {
      setBusy("");
    }
  };

  const lifecycleRun = async (action: SxLifecycleAction): Promise<boolean> => {
    if (!id || busy) return false;
    setBusy(action);
    setActionError(null);
    try {
      const url = action === "withdraw" ? locked?.withdrawUrl || lifecycle.withdrawUrl : lifecycle.restoreUrl;
      await runLifecycle(id, action, url);
      setLocked(null);
      notify.success(t(action === "withdraw" ? "sx.editor.toast.withdrawn" : "sx.editor.toast.restored"));
      await refresh(action === "withdraw" && changedRef.current ? "own" : true);
      return true;
    } catch (e) {
      logApiError(`studio.sx.object.${action}`, e);
      notify.error(errText(e).text);
      setActionError({ error: e });
      void refresh(false);
      return false;
    } finally {
      setBusy("");
    }
  };

  const withdraw = () => lifecycleRun("withdraw");
  const restore = () => lifecycleRun("restore");

  const overwrite = async (): Promise<boolean> => {
    setConflictOpen(false);
    setRemote(null);
    return save();
  };

  const closeConflict = () => setConflictOpen(false);

  const clone = async (name: string): Promise<string | null> => {
    if (mode !== "object" || !id || busy) return null;
    const wanted = name.trim().slice(0, TITLE_MAX);
    if (!wanted) return null;
    setBusy("clone");
    setDialogError(null);
    setActionError(null);
    try {
      const copy = await cloneStudioObject(studioObjectAction(id, "clone"), wanted);
      if (!copy.id) {
        notify.error(t("sx.editor.toast.noId"));
        return null;
      }
      noteInheritedSlug(copy.id, copy.payload);
      notify.success(t("sx.editor.toast.cloned"));
      if (titleField && wanted !== str(payload[titleField]).trim()) seedPatch(copy.id, { [titleField]: wanted });
      return copy.id;
    } catch (e) {
      logApiError("studio.sx.object.clone", e);
      setDialogError(errText(e));
      setActionError({ error: e });
      return null;
    } finally {
      setBusy("");
    }
  };

  const upload = async (file: File): Promise<boolean> => {
    if (!id) {
      setFileError(t("sx.editor.files.saveFirst"));
      return false;
    }
    if (busy) return false;
    setBusy("upload");
    setFileError("");
    try {
      await uploadStudioFile(id, file);
      setServerErrors((s) => omit(s, "file"));
      setActionError((a) => (a ? null : a));
      notify.success(t("sx.editor.toast.uploaded"));
      await refresh("own");
      return true;
    } catch (e) {
      logApiError("studio.sx.object.file", e);
      setFileError(errText(e).text || t("sx.editor.files.uploadFail"));
      setActionError({ error: e });
      return false;
    } finally {
      setBusy("");
    }
  };

  const addComment = async (text: string): Promise<boolean> => {
    if (!id || !text.trim() || busy) return false;
    setBusy("comment");
    try {
      const c = await createComment(id, text);
      setComments((s) => ({ items: [c, ...(s.items ?? []).filter((x) => !c.id || x.id !== c.id)], error: null }));
      void loadComments();
      return true;
    } catch (e) {
      logApiError("studio.sx.comment.add", e);
      notify.error(errText(e).text);
      return false;
    } finally {
      setBusy("");
    }
  };

  const editComment = async (commentId: string, text: string): Promise<boolean> => {
    const v = text.trim();
    if (!id || !commentId || !v || busy) return false;
    setBusy("comment");
    try {
      const c = await updateComment(id, commentId, v);
      setComments((s) => ({ items: upsertComment(s.items, c), error: null }));
      return true;
    } catch (e) {
      logApiError("studio.sx.comment.edit", e);
      notify.error(errText(e).text);
      return false;
    } finally {
      setBusy("");
    }
  };

  const removeComment = async (commentId: string): Promise<boolean> => {
    if (!id || !commentId || busy) return false;
    setBusy("comment");
    try {
      const c = await deleteComment(id, commentId);
      const prev = comments.items?.find((x) => x.id === commentId) ?? null;
      const gone = c ?? prev;
      if (gone) setComments((s) => ({ items: upsertComment(s.items, { ...gone, id: gone.id || commentId, deleted: true, text: "", editedAt: "" }), error: null }));
      else void loadComments();
      return true;
    } catch (e) {
      logApiError("studio.sx.comment.delete", e);
      notify.error(errText(e).text);
      return false;
    } finally {
      setBusy("");
    }
  };

  const setPayload = (next: SxPayload, path: string) => {
    const cur = latestRef.current;
    if (!cur) return;
    const prev = cur.draft.payload;
    const out = edited(prev, next);
    const followTitle = Boolean(titleField) && str(out[titleField as string]) !== str(prev[titleField as string]);
    commit({ ...cur, draft: { title: followTitle ? str(out[titleField as string]) : cur.draft.title, payload: out } });
    setServerErrors((s) => pruneErrors(s, prev, out));
    const own = normPath(path);
    setDraftErrors((d) => {
      const pruned = pruneErrors(d, prev, out);
      if (pruned === d) return d;
      const keep: Record<string, string> = { ...pruned };
      for (const [k, v] of Object.entries(d)) if (normPath(k) === own) keep[k] = v;
      return Object.keys(keep).length === Object.keys(d).length ? d : keep;
    });
  };

  const setRecordTitle = (value: string) => {
    const cur = latestRef.current;
    if (!cur) return;
    const v = value.slice(0, TITLE_MAX);
    commit({ ...cur, draft: { ...cur.draft, title: v } });
    if (v.trim()) setServerErrors((s) => omit(s, "$title"));
  };

  const setDraftError = (path: string, invalid: boolean) => {
    const p = normPath(path);
    if (!p) return;
    setDraftErrors((d) => (invalid ? (d[p] === "@number" ? d : { ...d, [p]: "@number" }) : omit(d, p)));
    if (invalid) policy.markServer([p]);
  };

  const cloneHref = () => (mode === "runtime-view" || mode === "runtime-edit" ? formUrl("clone") : "");

  const reloadComments = () => {
    void loadComments();
  };

  const loadRemote = () => {
    setRemote(null);
    setConflictOpen(false);
    void refresh(true);
  };

  const dismissAlert = () => {
    if (actionError) setActionError(null);
    else if (locked) setLocked(null);
    else if (publishFail !== null) setPublishFail(null);
    else if (remote) setRemote(null);
  };

  const retryLoad = () => {
    setLoadErr(null);
    setFcErr(null);
    setAttempt((a) => a + 1);
  };

  const clearDialogError = () => setDialogError(null);

  const unlock = () => {
    if (readOnlyReason !== "live") return;
    setUnlockedFor(liveKey);
    const cur = latestRef.current;
    if (cur?.prepared) commit({ ...cur, prepared: false });
  };

  return {
    phase,
    loadError,
    mode,
    code,
    categoryKind,
    ctor: regCtor,
    full,
    runtimeTarget,
    layout,
    model,
    idPrefix,
    fc,
    detail,
    recordId,
    payload,
    recordTitle,
    title,
    dirty,
    changed,
    formMode,
    schemaFailed,
    readOnly,
    readOnlyReason,
    editInReview,
    reviewMissing,
    blocked,
    missing,
    status,
    runtimeStatus: runtimeStatusOf(payload),
    direct,
    access,
    can,
    primary,
    editHref,
    next,
    reviewNote,
    clientErrors,
    serverErrors,
    draftErrors,
    errors,
    showSummary,
    policy,
    warnings,
    cascadeWarning,
    prevPayload,
    changedPaths,
    alert,
    busy,
    comments,
    me,
    lifecycle,
    conflict,
    descendants,
    fileRequired,
    hasFile,
    pendingFile: pending,
    fileSlot: fileRequired
      ? {
          name: pending?.name || currentVersion?.fileName || "",
          meta: !pending && currentVersion?.version ? t("sx.editor.versionTag", { v: currentVersion.version }) : "",
          pending: Boolean(pending),
          has: hasFile,
          busy: busy === "upload" || (Boolean(pending) && (busy === "save" || busy === "submit")),
          canPick: !readOnly && phase === "ready",
          pick: pickFile,
        }
      : null,
    pickFile,
    currentVersion,
    savedAt: detail?.updatedAt ?? "",
    dialogError,
    fileError,
    setPayload,
    setRecordTitle,
    setDraftError,
    save,
    prepareSubmit,
    previewBody,
    submit,
    publish,
    rollback,
    archive,
    withdraw,
    restore,
    overwrite,
    closeConflict,
    clone,
    cloneHref,
    upload,
    addComment,
    editComment,
    removeComment,
    reloadComments,
    refresh,
    loadRemote,
    dismissAlert,
    retryLoad,
    clearDialogError,
    unlock,
  };
}

