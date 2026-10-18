"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { logApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { cleanPayload, normErrorPaths, normPath, pruneInvisible, targetErrors } from "@/lib/studioSchema";
import {
  addStudioComment,
  archiveStudioObject,
  cloneStudioObject,
  createStudioObject,
  getStudioConstructorDetail,
  getStudioFormContext,
  getStudioObject,
  listStudioComments,
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
  type StudioComment,
  type StudioConstructor,
  type StudioDetail,
  type StudioFormContext,
  type StudioSchemaField,
  type StudioVersion,
} from "@/lib/services/studio";
import { descendantIds, flattenCategoryTree, getCategoryTree } from "@/lib/services/categoryTree";
import type { SchemaModel, SchemaOnly, SxCtorLayout, SxEditMode, SxPayload, SxValues, SxWarning } from "../contract";
import type { SxErrors } from "../types";
import { useSxFormPolicy, type SxFormPolicy } from "../form/formPolicy";
import { dropReferenceCache, firstReferencePage } from "../form/useReferenceOptions";
import { statusKeyOf } from "../status";
import { ctorLayoutOf } from "../ctor/layouts";
import { ctorWarnings } from "../ctor/warnings";
import { SOURCE_PRODUCER } from "../ctor/sources";
import { useSchemaModel } from "../schema/useSchemaModel";
import { invalidOptionPaths, validatePayload } from "../schema/model";
import { focusFieldPath } from "../schema/focus";
import { studioEventCode, studioEventObjectId, useStudioLive } from "../live";
import { useEditorErrorText } from "./useEditorErrorText";
import {
  actionsOf,
  changedKeys,
  currentVersionOf,
  draftKey,
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
export type EditorBusy = "" | "save" | "check" | "submit" | "publish" | "rollback" | "archive" | "clone" | "upload" | "comment";
export type EditorAlert =
  | { kind: "action"; error: unknown }
  | { kind: "publishFail"; text: string }
  | { kind: "remote"; conflict: boolean }
  | { kind: "file"; isNew: boolean }
  | null;
export type EditorPrimary = "saveSubmit" | "submit" | "publishDirect" | "publish" | "openReview" | "edit" | "save" | null;
export type EditorInit = { code: string; id: string | null; ctx?: string; initialPayload?: SxPayload; initialTitle?: string; focus?: string };
export type EditorOptions = {
  onCreated?: (detail: StudioDetail) => void;
  onRedirect?: (objectId: string) => void;
  heartbeat?: boolean;
  live?: boolean;
  idPrefix?: string;
  only?: SchemaOnly;
  onFocusFail?: (path: string) => void;
  lockLive?: boolean;
};
export type EditorDialogError = { title: string; text: string };

export type EditorState = {
  phase: EditorPhase;
  loadError: unknown;
  mode: EditorMode;
  code: string;
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
  blocked: boolean;
  missing: string[];
  status: string;
  runtimeStatus: string;
  direct: boolean;
  access: StudioAccess;
  can: { save: boolean; submit: boolean; publish: boolean; archive: boolean; review: boolean; rollback: boolean; clone: boolean; newVersion: boolean; comment: boolean; upload: boolean; exportVersions: boolean; edit: boolean };
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
  comments: { items: StudioComment[] | null; error: unknown };
  descendants: number;
  fileRequired: boolean;
  hasFile: boolean;
  currentVersion: StudioVersion | null;
  savedAt: string;
  dialogError: EditorDialogError | null;
  fileError: string;
  setPayload: (next: SxPayload, path: string) => void;
  setRecordTitle: (value: string) => void;
  setDraftError: (path: string, invalid: boolean) => void;
  save: (meta?: { summary?: string; version?: string }) => Promise<boolean>;
  prepareSubmit: () => Promise<boolean>;
  submit: () => Promise<boolean>;
  publish: (note: string) => Promise<boolean>;
  rollback: (version: StudioVersion, note: string) => Promise<boolean>;
  archive: () => Promise<boolean>;
  clone: (title: string) => Promise<string | null>;
  cloneHref: () => string;
  upload: (file: File) => Promise<boolean>;
  addComment: (text: string) => Promise<boolean>;
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
const REVIEWING: ReadonlySet<string> = new Set(["submitted", "in_review"]);
const LIVE: ReadonlySet<string> = new Set(["approved", "published"]);
const SUBMIT_PRIMARY: ReadonlySet<EditorPrimary> = new Set<EditorPrimary>(["saveSubmit", "submit", "publishDirect", "save"]);
const NO_CAN: EditorState["can"] = { save: false, submit: false, publish: false, archive: false, review: false, rollback: false, clone: false, newVersion: false, comment: false, upload: false, exportVersions: false, edit: false };
const TITLE_MAX = 200;
type RefreshMode = boolean | "own";

const sameServerVersion = (a: StudioDetail, b: StudioDetail | null): boolean => {
  if (!b || a.id !== b.id) return false;
  if (a.lockVersion !== null && b.lockVersion !== null) return a.lockVersion === b.lockVersion;
  return Boolean(a.currentVersionId) && a.currentVersionId === b.currentVersionId && a.updatedAt === b.updatedAt;
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
  const errText = useEditorErrorText();
  const reg = useStudioRegistry();
  const access = useStudioAccess();

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
  const [comments, setComments] = useState<{ items: StudioComment[] | null; error: unknown }>({ items: null, error: null });
  const [dialogError, setDialogError] = useState<EditorDialogError | null>(null);
  const [fileError, setFileError] = useState("");
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
  const layout = useMemo(() => ctorLayoutOf(code, runtimeTarget), [code, runtimeTarget]);
  const model = useSchemaModel({ ctor: full, layout, runtimeTarget, idPrefix, only: opts.only });
  const titleField = model?.titleField ?? null;

  const statusNorm: string = mode === "object" ? detail?.status ?? "draft" : mode === "create" || mode === "clone" ? "draft" : "";
  const status = mode === "object" ? detail?.statusRaw || detail?.status || "" : statusNorm;
  const statusKey = statusKeyOf(status, "studio");
  const liveKey = `${statusNorm}:${detail?.currentVersionId ?? ""}`;
  const liveLocked = !!opts.lockLive && mode === "object" && LIVE.has(statusNorm) && unlockedFor !== "*" && unlockedFor !== liveKey;
  const readOnlyReason: EditorState["readOnlyReason"] =
    statusNorm === "archived" ? "archived" : REVIEWING.has(statusNorm) ? "locked" : !access.canEdit ? "access" : mode === "runtime-view" ? "view" : liveLocked ? "live" : "";
  const readOnly = readOnlyReason !== "";
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
  const dirty = formReady && Boolean(draft) && (keyBase === null || keyNow !== keyBase);
  const changed = formReady && Boolean(draft) && keyStart !== null && keyNow !== keyStart;

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
      const items = await listStudioComments(id);
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
    listStudioComments(id)
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
    if (e.event === "studio.comment_created") void loadComments();
    else if (e.event.startsWith("studio.object_") || e.event.startsWith("studio.approval_") || e.event === "studio.file_uploaded") void refresh();
  }, opts.live !== false);

  let phase: EditorPhase;
  if ((mode === "create" || mode === "clone") && code && reg.items.length > 0 && !regCtor) phase = "unknown-ctor";
  else if (mode === "object") phase = detail && loaded?.prepared ? "ready" : !detail && loadErr ? (studioErrorOf(loadErr).kind === "not_found" ? "not-found" : "load-error") : "loading";
  else phase = loaded?.prepared ? "ready" : !loaded && fcErr ? "load-error" : "loading";
  const loadError = mode === "object" ? loadErr : fcErr;

  const title = (titleField ? str(payload[titleField]).trim() : recordTitle.trim()) || detail?.title || fc?.title || "";

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
  const fileRequired = code === "K06" && payload.mode === "upload";

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
    newVersion: Boolean(layout.newVersion),
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
    : publishFail !== null
      ? { kind: "publishFail", text: publishFail }
      : remote
        ? { kind: "remote", conflict: remote.conflict }
        : fileRequired && !hasFile && !readOnly && phase === "ready"
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

  const showServer = (fe: SxErrors) => {
    const keys = Object.keys(fe);
    setServerErrors(fe);
    policy.markServer(keys);
    focusFirst(keys);
  };

  const fail = (scope: string, e: unknown) => {
    logApiError(scope, e);
    const se = studioErrorOf(e);
    const raw = Object.keys(se.fieldErrors).length ? targetErrors(normErrorPaths(se.fieldErrors), latestRef.current?.draft.payload ?? payload) : {};
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

  const titleOrFail = (): string => {
    const cur = latestRef.current?.draft ?? draft;
    const typed = cur ? (titleField ? str(cur.payload[titleField]) : cur.title).trim() : "";
    const value = typed || detail?.title || "";
    if (value) return value;
    const p = titleField ?? "$title";
    setServerErrors((s) => ({ ...s, [p]: "@required" }));
    policy.markServer([p]);
    focusFirst([p]);
    return "";
  };

  const persist = async (meta?: { summary?: string; version?: string }): Promise<{ id: string; created: StudioDetail | null } | null> => {
    const cur = latestRef.current?.draft ?? draft;
    if (!cur) return null;
    const objTitle = titleOrFail();
    if (!objTitle) return null;
    setActionError(null);
    setPublishFail(null);
    const body = full?.typed.length ? cleanPayload(full.typed, cur.payload) : cur.payload;
    try {
      if (!id) {
        const target = mode === "runtime-edit" && fc ? { runtimeTargetId: fc.runtimeTargetId, runtimeTargetType: fc.runtimeTargetType } : {};
        const created = await createStudioObject({ constructorCode: code, title: objTitle, payload: body, ...target });
        if (!created.id) {
          notify.error(t("sx.editor.toast.noId"));
          return null;
        }
        hb.markSaved();
        const seeded: StudioDetail = { ...created, code: created.code || code, title: created.title || objTitle, payload: Object.keys(created.payload).length ? created.payload : body };
        seedDetail(seeded);
        return { id: created.id, created: seeded };
      }
      await saveStudioObject(id, { title: objTitle, payload: body, summary: meta?.summary, version: meta?.version, expectedLockVersion: detail?.lockVersion ?? null });
      hb.markSaved();
      return { id, created: null };
    } catch (e) {
      if (studioErrorOf(e).kind === "edit_conflict") {
        logApiError("studio.sx.object.save", e);
        setRemote({ conflict: true });
        await refresh(false);
        return null;
      }
      fail("studio.sx.object.save", e);
      return null;
    }
  };

  const save = async (meta?: { summary?: string; version?: string }): Promise<boolean> => {
    if (busy || !can.save || (id && !dirty)) return false;
    if (draftBlock()) return false;
    setBusy("save");
    const sent = latestRef.current?.draft;
    try {
      const r = await persist(meta);
      if (!r) return false;
      setServerErrors(EMPTY_ERRORS);
      notify.success(t(id ? "sx.editor.toast.saved" : "sx.editor.toast.created"));
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
    if (!titleOrFail()) return false;
    const cur = latestRef.current?.draft ?? draft;
    if (!cur) return false;
    const local: Record<string, string> = { ...validatePayload(model, cur.payload, titleField ? null : cur.title) };
    if (fileRequired && !hasFile) {
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
      const body = full?.typed.length ? cleanPayload(full.typed, cur.payload) : cur.payload;
      const check = await validateStudioDraft(code, body, undefined, recordId);
      if (!check.ok && Object.keys(check.errors).length) {
        showServer(targetErrors(normErrorPaths(check.errors), cur.payload));
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
      const r = id && !dirty ? { id, created: null } : await persist();
      if (!r) return false;
      try {
        await submitStudioObject(r.id);
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
      const c = await addStudioComment(id, text);
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
    void refresh(true);
  };

  const dismissAlert = () => {
    if (actionError) setActionError(null);
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
    descendants,
    fileRequired,
    hasFile,
    currentVersion,
    savedAt: detail?.updatedAt ?? "",
    dialogError,
    fileError,
    setPayload,
    setRecordTitle,
    setDraftError,
    save,
    prepareSubmit,
    submit,
    publish,
    rollback,
    archive,
    clone,
    cloneHref,
    upload,
    addComment,
    reloadComments,
    refresh,
    loadRemote,
    dismissAlert,
    retryLoad,
    clearDialogError,
    unlock,
  };
}

