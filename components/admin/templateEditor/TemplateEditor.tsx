"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import ScrollCue from "@/components/ui/ScrollCue";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import { notify } from "@/lib/toast";
import { isConflict, parseServerTime } from "@/lib/http";
import { fetchAndDeliver } from "@/lib/download";
import { timeOnly } from "@/lib/date";
import {
  buildDraftPayload,
  checkDocx,
  uiContractOf,
  editorSaveRequiredOf,
  getEditorFile,
  openTemplateEditor,
  publishEditor,
  revisionConflictOf,
  saveEditorDraft,
  uploadEditorSource,
  validateEditor,
  validationFailedOf,
  type EditorField,
  type EditorIssue,
  type EditorMeta,
  type EditorSection,
  type EditorSession,
  type EditorValidation,
  type RevisionConflict,
  type TemplateVersion,
} from "@/lib/services/templateEditor";
import {
  appendToSection,
  blankField,
  dropField,
  dropSection,
  fieldsOf,
  humanizeKey,
  indexIssues,
  moveField,
  moveSection,
  patchFromServer,
  uniqueSectionId,
  type Model,
  type Selection,
} from "./model";
import { useOnlyOffice } from "./useOnlyOffice";
import Navigator from "./Navigator";
import { FieldInspector, MetaInspector, SectionInspector } from "./Inspector";
import PreviewModal from "./PreviewModal";
import VersionsModal from "./VersionsModal";
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconClose,
  IconEye,
  IconFileText,
  IconHistory,
  IconRefresh,
  IconRocket,
  IconShieldCheck,
  IconUpload,
} from "@/components/icons";

const AUTOSAVE_MS = 1000;

type Flash = { kind: "published" | "restored"; revision: number | null; active?: boolean | null };
type ConflictState = RevisionConflict & { server: EditorSession | null; loading: boolean; error: unknown };
type ValidationState = { result: EditorValidation; revision: number; serial: string; docVer: number };
type Banner = { kind: "copied" | "copyFailed" | "source"; text: string };

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export default function TemplateEditor({ templateId }: { templateId: string }) {
  const t = useTranslations("admin.templateEditor");
  const [loadKey, setLoadKey] = useState(0);
  const [mount, setMount] = useState(0);
  const [loaded, setLoaded] = useState<{ key: number; session: EditorSession } | null>(null);
  const [failed, setFailed] = useState<{ key: number; error: unknown } | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    let alive = true;
    openTemplateEditor(templateId).then(
      (session) => {
        if (alive) setLoaded({ key: loadKey, session });
      },
      (error: unknown) => {
        if (alive) setFailed({ key: loadKey, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [templateId, loadKey]);

  const state = loaded?.key === loadKey ? "ready" : failed?.key === loadKey ? "error" : "loading";

  if (state === "ready" && loaded) {
    return (
      <Workspace
        key={`${loadKey}:${mount}`}
        templateId={templateId}
        session={loaded.session}
        flash={flash}
        onFlashDone={() => setFlash(null)}
        onReload={(f) => {
          setFlash(f);
          setLoadKey((k) => k + 1);
        }}
        onReplace={(s) => {
          setLoaded({ key: loadKey, session: s });
          setMount((m) => m + 1);
        }}
      />
    );
  }

  return (
    <div className="tpe tpe--state">
      <div className="tpe-bar">
        <Link href="/admin/templates" className="tpe-back">
          <IconChevronLeft />
          {t("back")}
        </Link>
      </div>
      {state === "error" ? (
        <ErrorState error={failed?.error} title={t("loadError")} onRetry={() => setLoadKey((k) => k + 1)} />
      ) : (
        <div className="tpe-loading" aria-busy="true">
          <p className="tpe-hint">{t("loading")}</p>
          <Skeleton rows={6} />
        </div>
      )}
    </div>
  );
}

function Workspace({
  templateId,
  session,
  flash,
  onFlashDone,
  onReload,
  onReplace,
}: {
  templateId: string;
  session: EditorSession;
  flash: Flash | null;
  onFlashDone: () => void;
  onReload: (f: Flash | null) => void;
  onReplace: (s: EditorSession) => void;
}) {
  const t = useTranslations("admin.templateEditor");
  const locale = useLocale();
  const uid = useId();

  const [init] = useState(() => {
    const m: Model = { meta: session.draft.meta, sections: session.draft.sections, fields: session.draft.fields };
    return { model: m, serial: buildDraftPayload(m.meta, m.sections, m.fields).serial };
  });
  const [model, setModel] = useState<Model>(init.model);
  const [savedSerial, setSavedSerial] = useState(init.serial);
  const [revision, setRevision] = useState(session.draft.revision);
  const [lastSavedAt, setLastSavedAt] = useState(session.draft.lastSavedAt);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [oo, setOo] = useState(session.oo);
  const [ooNonce, setOoNonce] = useState(0);
  const [docPending, setDocPending] = useState(false);
  const [docError, setDocError] = useState(false);
  const [docVer, setDocVer] = useState(0);
  const [sourceName, setSourceName] = useState(session.template.sourceFileName);
  // Which files the editor takes, how large and where they go: the
  // backend's contract (10-13 spec §3), not values written here.
  const contract = useMemo(() => uiContractOf(session.uiContract), [session.uiContract]);
  const [selection, setSelection] = useState<Selection>(null);
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [validating, setValidating] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [activate, setActivate] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [saveRequired, setSaveRequired] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [delSection, setDelSection] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [pane, setPane] = useState<"nav" | "insp" | "">("nav");
  const [fileBusy, setFileBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const built = useMemo(() => buildDraftPayload(model.meta, model.sections, model.fields), [model]);
  const serial = built.serial;
  const dirty = serial !== savedSerial;

  const revRef = useRef(session.draft.revision);
  const savedRef = useRef(init.serial);
  const builtRef = useRef(built);
  const blockedRef = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const queued = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    builtRef.current = built;
  }, [built]);

  function startConflict(c: RevisionConflict) {
    blockedRef.current = true;
    setConflict({ ...c, server: null, loading: true, error: null });
    openTemplateEditor(templateId).then(
      (s) => setConflict((cur) => (cur ? { ...cur, server: s, current: s.draft.revision || cur.current, loading: false } : cur)),
      (error: unknown) => setConflict((cur) => (cur ? { ...cur, loading: false, error } : cur)),
    );
  }

  async function flush(): Promise<void> {
    if (inFlight.current) {
      queued.current = true;
      return inFlight.current;
    }
    if (blockedRef.current) return;
    const b = builtRef.current;
    if (b.serial === savedRef.current) return;
    const sentRev = revRef.current;
    const run = (async () => {
      setSaving(true);
      try {
        const r = await saveEditorDraft(templateId, sentRev, b.body);
        const next = Number.isFinite(r.revision) ? r.revision : sentRev + 1;
        revRef.current = Math.max(revRef.current, next);
        savedRef.current = b.serial;
        setRevision(revRef.current);
        setSavedSerial(b.serial);
        setSaveError(null);
        setLastSavedAt(r.savedAt || new Date().toISOString());
        const serverFields = r.draft?.fields ?? [];
        if (serverFields.length) {
          setModel((m) => {
            const nf = patchFromServer(m.fields, serverFields);
            return nf === m.fields ? m : { ...m, fields: nf };
          });
        }
      } catch (e) {
        const c = revisionConflictOf(e) ?? (isConflict(e) && !editorSaveRequiredOf(e) ? { expected: sentRev, current: null } : null);
        if (c) startConflict(c);
        else setSaveError(e);
      } finally {
        setSaving(false);
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
    if (queued.current) {
      queued.current = false;
      await flush();
    }
  }

  useEffect(() => {
    flushRef.current = flush;
  });

  async function ensureSaved(): Promise<boolean> {
    while (inFlight.current) await inFlight.current;
    if (builtRef.current.serial !== savedRef.current) await flushRef.current();
    while (inFlight.current) await inFlight.current;
    return !blockedRef.current && builtRef.current.serial === savedRef.current;
  }

  async function syncRevision(): Promise<EditorSession | null> {
    try {
      const s = await openTemplateEditor(templateId);
      const sSerial = buildDraftPayload(s.draft.meta, s.draft.sections, s.draft.fields).serial;
      if (s.draft.revision > revRef.current && sSerial === savedRef.current) {
        revRef.current = s.draft.revision;
        setRevision(s.draft.revision);
      }
      return s;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (!dirty || conflict) return;
    const h = setTimeout(() => {
      void flushRef.current();
    }, AUTOSAVE_MS);
    return () => clearTimeout(h);
  }, [serial, dirty, conflict]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, saving]);

  useEffect(() => {
    const ref = flushRef;
    return () => {
      void ref.current();
    };
  }, []);

  const { status: ooStatus, insertText } = useOnlyOffice({
    hostRef,
    config: oo.configured ? oo.config : null,
    serverUrl: oo.configured ? oo.serverUrl : "",
    mountKey: oo.configured ? `${oo.docKey || "doc"}:${ooNonce}` : "",
    onDocState: (pending) => {
      setDocPending(pending);
      if (pending) {
        setDocError(false);
        setDocVer((v) => v + 1);
      }
    },
    onDocError: () => setDocError(true),
  });

  const issues = useMemo(() => indexIssues(validation?.result ?? null, model.fields, new Set(model.sections.map((s) => s.id))), [validation, model.fields, model.sections]);
  const validFresh = Boolean(validation) && validation?.revision === revision && validation?.serial === serial && validation?.docVer === docVer;
  const canPublish = validFresh && Boolean(validation?.result.valid) && !dirty && !saving && !conflict && !publishing && !uploading && built.skipped.size === 0;
  const publishWhy = !validation
    ? t("publish.needValidate")
    : !validFresh
      ? t("publish.stale")
      : !validation.result.valid
        ? t("publish.fixErrors")
        : dirty || saving
          ? t("publish.waitSave")
          : conflict
            ? t("publish.conflict")
            : built.skipped.size
              ? t("publish.skipped")
              : "";

  const issueText = (x: EditorIssue) => {
    const base = x.code && t.has(`issues.${x.code}`) ? t(`issues.${x.code}`, { key: x.key || "—", section: x.sectionId || "—" }) : x.message || x.code || t("issues.unknown");
    return x.message && x.code && t.has(`issues.${x.code}`) && x.message !== base ? `${base} — ${x.message}` : base;
  };

  const updateMeta = (patch: Partial<EditorMeta>) => setModel((m) => ({ ...m, meta: { ...m.meta, ...patch } }));
  const updateSection = (id: string, patch: Partial<EditorSection>) => setModel((m) => ({ ...m, sections: m.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const updateField = (fuid: string, patch: Partial<EditorField>) => setModel((m) => ({ ...m, fields: m.fields.map((f) => (f.uid === fuid ? { ...f, ...patch } : f)) }));

  function select(s: Selection) {
    setSelection(s);
    if (s) setPane("insp");
  }

  function addSection(title: string) {
    const id = uniqueSectionId(title, model.sections);
    setModel((m) => ({ ...m, sections: [...m.sections, { id, title, description: "" }] }));
    setSelection({ kind: "section", id });
  }

  function addField(sectionId: string, key = "") {
    const f = blankField(sectionId, key, key ? humanizeKey(key) : "");
    setModel((m) => ({ ...m, fields: appendToSection(m.fields, f) }));
    select({ kind: "field", uid: f.uid });
  }

  function createMissing(key: string) {
    const exists = model.fields.find((f) => f.key === key);
    if (exists) {
      select({ kind: "field", uid: exists.uid });
      return;
    }
    const selSection = selection?.kind === "section" ? selection.id : selection?.kind === "field" ? model.fields.find((f) => f.uid === selection.uid)?.sectionId : "";
    let target = model.sections.find((s) => s.id === selSection)?.id || model.sections[0]?.id || "";
    if (!target) {
      const title = t("nav.defaultSection");
      target = uniqueSectionId(title, model.sections);
      const sid = target;
      setModel((m) => ({ ...m, sections: [...m.sections, { id: sid, title, description: "" }] }));
    }
    addField(target, key);
  }

  function deleteField(fuid: string) {
    const f = model.fields.find((x) => x.uid === fuid);
    if (!f) return;
    void confirmDialog({
      title: t("field.deleteTitle", { name: f.label || f.key || "—" }),
      text: f.insertText ? t("field.deleteTextPlaced", { ph: f.insertText }) : t("field.deleteText"),
      confirmLabel: t("field.delete"),
      tone: "danger",
    }).then((ok) => {
      if (!ok) return;
      setModel((m) => ({ ...m, fields: m.fields.filter((x) => x.uid !== fuid) }));
      setSelection((s) => (s?.kind === "field" && s.uid === fuid ? null : s));
    });
  }

  function deleteSection(id: string) {
    const list = fieldsOf(model.fields, id);
    if (list.length) {
      const other = model.sections.find((s) => s.id !== id);
      setMoveTarget(other?.id ?? "");
      setDelSection(id);
      return;
    }
    const s = model.sections.find((x) => x.id === id);
    void confirmDialog({ title: t("section.deleteTitle", { name: s?.title || id }), text: t("section.deleteEmptyText"), confirmLabel: t("section.delete"), tone: "danger" }).then((ok) => {
      if (!ok) return;
      setModel((m) => ({ ...m, sections: m.sections.filter((x) => x.id !== id) }));
      setSelection((cur) => (cur?.kind === "section" && cur.id === id ? null : cur));
    });
  }

  function confirmDeleteSection() {
    const id = delSection;
    if (!id || !moveTarget || moveTarget === id) return;
    setModel((m) => {
      let fields = m.fields;
      for (const f of fieldsOf(m.fields, id)) fields = dropField(fields, f.uid, moveTarget, null);
      return { ...m, sections: m.sections.filter((s) => s.id !== id), fields };
    });
    setSelection((cur) => (cur?.kind === "section" && cur.id === id ? null : cur));
    setDelSection(null);
  }

  async function insertField(f: EditorField) {
    if (!f.insertText || f.savedKey !== f.key) return;
    const ok = ooStatus === "ready" ? await insertText(f.insertText) : false;
    if (ok) {
      setBanner(null);
      notify.success(t("insert.done"), { id: "tpe-insert", body: f.insertText });
      return;
    }
    const copied = await copyText(f.insertText);
    setBanner({ kind: copied ? "copied" : "copyFailed", text: f.insertText });
  }

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploading) return;
    const bad = checkDocx(file, contract);
    if (bad) {
      notify.error(bad.code === "too_big" ? t("upload.tooBigN", { mb: Math.round(contract.maxUploadBytes / 1048576) }) : t("upload.onlyTypes", { types: contract.acceptedExtensions.join(", ") }), { id: "tpe-upload", body: file.name });
      return;
    }
    setUploading(true);
    try {
      while (inFlight.current) await inFlight.current;
      const r = await uploadEditorSource(templateId, file, contract);
      let next = r.oo;
      if (Number.isFinite(r.revision)) {
        revRef.current = Math.max(revRef.current, r.revision);
        setRevision(revRef.current);
      }
      if (!next || !next.config || !Number.isFinite(r.revision)) {
        const s = await syncRevision();
        if (!next || !next.config) next = s?.oo ?? next;
      }
      if (next) setOo(next);
      setOoNonce((n) => n + 1);
      setDocPending(false);
      setDocError(false);
      setDocVer((v) => v + 1);
      setSourceName(r.sourceFileName);
      setBanner({ kind: "source", text: r.sourceFileName });
    } catch (err) {
      notify.error(t("upload.failed"), { id: "tpe-upload", error: err, map: { 413: t("upload.tooBigN", { mb: Math.round(contract.maxUploadBytes / 1048576) }), 415: t("upload.badFile"), 503: t("upload.converterDown") } });
    } finally {
      setUploading(false);
    }
  }

  async function openFile() {
    if (fileBusy) return;
    setFileBusy(true);
    let name = sourceName || `${model.meta.slug || "template"}.docx`;
    const ok = await fetchAndDeliver(
      async () => {
        const r = await getEditorFile(templateId);
        if (r.name) name = r.name;
        return r.blob;
      },
      name,
      false,
    );
    setFileBusy(false);
    if (!ok) notify.error(t("file.error"), { id: "tpe-file" });
  }

  async function runValidate() {
    if (validating) return;
    setValidating(true);
    const startDocVer = docVer;
    try {
      const ok = await ensureSaved();
      if (!ok) {
        notify.warning(t("validate.saveFirst"), { id: "tpe-validate" });
        return;
      }
      const v = await validateEditor(templateId);
      await syncRevision();
      setValidation({ result: v, revision: revRef.current, serial: savedRef.current, docVer: startDocVer });
      setSaveRequired(null);
      if (v.valid) notify.success(t("validate.ok"), { id: "tpe-validate" });
      else notify.warning(t("validate.failed", { n: v.errors.length }), { id: "tpe-validate" });
    } catch (e) {
      const sr = editorSaveRequiredOf(e);
      if (sr) setSaveRequired(sr.message);
      else notify.error(t("validate.error"), { id: "tpe-validate", error: e });
    } finally {
      setValidating(false);
    }
  }

  async function runPublish() {
    if (!canPublish) return;
    setPublishing(true);
    setSaveRequired(null);
    try {
      const r = await publishEditor(templateId, revRef.current, activate);
      setPublishOpen(false);
      blockedRef.current = true;
      notify.success(t("publish.done"), { id: "tpe-publish" });
      onReload({ kind: "published", revision: r.revision, active: r.isActive ?? activate });
    } catch (e) {
      const vf = validationFailedOf(e);
      const sr = vf ? null : editorSaveRequiredOf(e);
      const c = vf || sr ? null : revisionConflictOf(e);
      if (vf) {
        setValidation({ result: vf, revision: revRef.current, serial: savedRef.current, docVer });
        setPublishOpen(false);
        notify.error(t("publish.invalid", { n: vf.errors.length }), { id: "tpe-publish" });
      } else if (sr) {
        setSaveRequired(sr.message);
        setPublishOpen(false);
      } else if (c) {
        setPublishOpen(false);
        startConflict(c);
      } else {
        notify.error(t("publish.error"), { id: "tpe-publish", error: e });
      }
    } finally {
      setPublishing(false);
    }
  }

  function takeServer() {
    if (conflict?.server) onReplace(conflict.server);
    else onReload(null);
  }

  function keepMine() {
    const cur = conflict?.server?.draft.revision ?? conflict?.current;
    if (cur == null) return;
    revRef.current = cur;
    setRevision(cur);
    blockedRef.current = false;
    savedRef.current = "";
    setSavedSerial("");
    setConflict(null);
    setSaveError(null);
    void flushRef.current();
  }

  function onRestored(v: TemplateVersion) {
    blockedRef.current = true;
    setVersionsOpen(false);
    notify.success(t("versions.restored"), { id: "tpe-restore" });
    onReload({ kind: "restored", revision: v.revision });
  }

  const selField = selection?.kind === "field" ? model.fields.find((f) => f.uid === selection.uid) ?? null : null;
  const selSection = selection?.kind === "section" ? model.sections.find((s) => s.id === selection.id) ?? null : null;
  const canInsert = !conflict;

  const savedMs = parseServerTime(lastSavedAt);
  const savedLabel = Number.isFinite(savedMs) ? timeOnly(new Date(savedMs).toISOString(), locale) : "";
  const draftChip = conflict
    ? { tone: "err", label: t("chip.conflict") }
    : saving
      ? { tone: "busy", label: t("chip.saving") }
      : saveError
        ? { tone: "err", label: t("chip.saveError") }
        : dirty
          ? { tone: "warn", label: t("chip.pending") }
          : { tone: "ok", label: savedLabel ? t("chip.savedAt", { time: savedLabel }) : t("chip.saved") };
  const tplStatus = session.template.status;
  const delSec = delSection ? model.sections.find((s) => s.id === delSection) : null;
  const delTargets = model.sections.filter((s) => s.id !== delSection).map((s) => ({ value: s.id, label: s.title || s.id }));
  const v = validation?.result;

  return (
    <div className="tpe">
      <header className="tpe-bar">
        <Link href="/admin/templates" className="tpe-back">
          <IconChevronLeft />
          <span>{t("back")}</span>
        </Link>
        <div className="tpe-bar__t">
          <h2 title={model.meta.title}>{model.meta.title || t("untitled")}</h2>
          <div className="tpe-chips" aria-live="polite">
            <span className={`tpe-chip tpe-chip--${tplStatus === "active" ? "ok" : "muted"}`}>{t.has(`status.${tplStatus}`) ? t(`status.${tplStatus}`) : tplStatus}</span>
            <span className="tpe-chip tpe-chip--muted">{t("chip.revision", { n: revision })}</span>
            <span className={`tpe-chip tpe-chip--${draftChip.tone}`}>
              {draftChip.tone === "busy" ? <span className="tpe-spin" aria-hidden="true" /> : draftChip.tone === "ok" ? <IconCheck /> : draftChip.tone === "err" ? <IconAlert /> : null}
              {draftChip.label}
            </span>
            {saveError && !conflict ? (
              <button type="button" className="tpe-chip tpe-chip--btn" onClick={() => void flushRef.current()}>
                <IconRefresh />
                {t("chip.retry")}
              </button>
            ) : null}
            {built.skipped.size ? <span className="tpe-chip tpe-chip--warn">{t("chip.skipped", { n: built.skipped.size })}</span> : null}
            {docError ? (
              <span className="tpe-chip tpe-chip--err">{t("chip.docError")}</span>
            ) : docPending ? (
              <span className="tpe-chip tpe-chip--warn">
                <span className="tpe-spin" aria-hidden="true" />
                {t("chip.docPending")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="tpe-bar__acts">
          <input ref={fileRef} type="file" accept={contract.acceptedExtensions.join(",")} hidden onChange={onPickFile} />
          <button type="button" className={`btn btn--line btn--sm${uploading ? " is-busy" : ""}`} onClick={() => fileRef.current?.click()} disabled={uploading || Boolean(conflict)}>
            <IconUpload />
            {uploading ? t("actions.uploading") : t("actions.replace")}
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => void openFile()} disabled={fileBusy}>
            <IconFileText />
            {t("actions.viewFile")}
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setPreviewOpen(true)}>
            <IconEye />
            {t("actions.preview")}
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setVersionsOpen(true)}>
            <IconHistory />
            {t("actions.versions")}
          </button>
          <button type="button" className={`btn btn--soft btn--sm${validating ? " is-busy" : ""}`} onClick={() => void runValidate()} disabled={validating || Boolean(conflict)}>
            <IconShieldCheck />
            {validating ? t("actions.validating") : t("actions.validate")}
          </button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => setPublishOpen(true)} disabled={!canPublish} title={publishWhy || undefined} aria-describedby={publishWhy ? `${uid}pw` : undefined}>
            <IconRocket />
            {t("actions.publish")}
          </button>
          {publishWhy ? (
            <span id={`${uid}pw`} className="tpe-sr">
              {publishWhy}
            </span>
          ) : null}
        </div>
      </header>

      <div className="tpe-banners">
        {flash ? (
          <div className="tpe-banner tpe-banner--ok" role="status">
            <IconCheck />
            <p>
              {flash.kind === "published"
                ? flash.active
                  ? t("flash.publishedActive", { n: flash.revision ?? "—" })
                  : t("flash.published", { n: flash.revision ?? "—" })
                : t("flash.restored", { n: flash.revision ?? "—" })}
            </p>
            <button type="button" className="tpe-ib" onClick={onFlashDone} aria-label={t("dismiss")}>
              <IconClose />
            </button>
          </div>
        ) : null}

        {conflict ? (
          <div className="tpe-banner tpe-banner--err" role="alert">
            <IconAlert />
            <div className="tpe-banner__b">
              <b>{t("conflict.title")}</b>
              <p>
                {t("conflict.text", { mine: conflict.expected ?? "—", server: conflict.server?.draft.revision ?? conflict.current ?? "—" })}
              </p>
              {conflict.loading ? <p className="tpe-hint">{t("conflict.loading")}</p> : null}
              {conflict.error ? <p className="tpe-hint">{t("conflict.loadError")}</p> : null}
              <div className="tpe-banner__acts">
                <button type="button" className="btn btn--line btn--sm" onClick={takeServer} disabled={conflict.loading}>
                  {t("conflict.takeServer")}
                </button>
                <button type="button" className="btn btn--pri btn--sm" onClick={keepMine} disabled={conflict.loading || (conflict.server?.draft.revision ?? conflict.current) == null}>
                  {t("conflict.keepMine")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {saveRequired !== null ? (
          <div className="tpe-banner tpe-banner--warn" role="alert">
            <IconAlert />
            <div className="tpe-banner__b">
              <b>{t("saveRequired.title")}</b>
              <p>{saveRequired || t("saveRequired.text")}</p>
              <div className="tpe-banner__acts">
                <button type="button" className="btn btn--pri btn--sm" onClick={() => (canPublish ? setPublishOpen(true) : void runValidate())} disabled={validating || publishing}>
                  <IconRefresh />
                  {t("saveRequired.retry")}
                </button>
              </div>
            </div>
            <button type="button" className="tpe-ib" onClick={() => setSaveRequired(null)} aria-label={t("dismiss")}>
              <IconClose />
            </button>
          </div>
        ) : null}

        {banner ? (
          <div className={`tpe-banner tpe-banner--${banner.kind === "copyFailed" ? "warn" : "info"}`} role="status">
            {banner.kind === "source" ? <IconCheck /> : <IconFileText />}
            <p>
              {banner.kind === "source" ? t("banner.source", { name: banner.text }) : banner.kind === "copied" ? t("banner.copied") : t("banner.copyFailed")}
              {banner.kind !== "source" ? <code className="tpe-ph__code">{banner.text}</code> : null}
            </p>
            <button type="button" className="tpe-ib" onClick={() => setBanner(null)} aria-label={t("dismiss")}>
              <IconClose />
            </button>
          </div>
        ) : null}

        {v ? (
          <div className={`tpe-banner tpe-banner--${v.valid ? "ok" : "err"}${validFresh ? "" : " is-stale"}`} role="status">
            {v.valid ? <IconCheck /> : <IconAlert />}
            <div className="tpe-banner__b">
              <b>
                {v.valid ? t("validate.summaryOk") : t("validate.summaryErr", { n: v.errors.length })}
                {v.warnings.length ? ` · ${t("validate.warnings", { n: v.warnings.length })}` : ""}
                {validFresh ? "" : ` · ${t("validate.stale")}`}
              </b>
              <p className="tpe-stats">
                {v.sectionCount != null ? <span>{t("validate.sections", { n: v.sectionCount })}</span> : null}
                {v.fieldCount != null ? <span>{t("validate.fields", { n: v.fieldCount })}</span> : null}
                {v.requiredCount != null ? <span>{t("validate.required", { n: v.requiredCount })}</span> : null}
                {v.placeholderCount != null ? <span>{t("validate.placeholders", { n: v.placeholderCount })}</span> : null}
              </p>
              {issues.documentIssues.length ? (
                <ul className="tpe-issues">
                  {issues.documentIssues.map((x, i) => (
                    <li key={i} className={`tpe-issue tpe-issue--${x.level}`}>
                      {issueText(x)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button type="button" className="tpe-ib" onClick={() => setValidation(null)} aria-label={t("dismiss")}>
              <IconClose />
            </button>
          </div>
        ) : null}
      </div>

      <ScrollCue className="tpe-tabs" role="tablist" aria-label={t("tabs.label")}>
        <button type="button" role="tab" aria-selected={pane === "nav"} className={pane === "nav" ? "on" : ""} onClick={() => setPane(pane === "nav" ? "" : "nav")}>
          {t("tabs.nav")}
        </button>
        <button type="button" role="tab" aria-selected={pane === "insp"} className={pane === "insp" ? "on" : ""} onClick={() => setPane(pane === "insp" ? "" : "insp")}>
          {selField ? t("tabs.field") : selSection ? t("tabs.section") : t("tabs.meta")}
        </button>
      </ScrollCue>

      <div className="tpe-grid" data-pane={pane}>
        <aside className="tpe-pane tpe-pane--nav" aria-label={t("nav.title")}>
          <Navigator
            sections={model.sections}
            fields={model.fields}
            selection={selection}
            issues={issues}
            skipped={built.skipped}
            canInsert={canInsert}
            onSelect={select}
            onAddSection={addSection}
            onRenameSection={(id, title) => updateSection(id, { title })}
            onMoveSection={(id, dir) => setModel((m) => ({ ...m, sections: moveSection(m.sections, id, dir) }))}
            onDropSection={(id, before) => setModel((m) => ({ ...m, sections: dropSection(m.sections, id, before) }))}
            onDeleteSection={deleteSection}
            onAddField={(sid) => addField(sid)}
            onMoveField={(fuid, dir) => setModel((m) => ({ ...m, fields: moveField(m.fields, fuid, dir) }))}
            onDropField={(fuid, sid, before) => setModel((m) => ({ ...m, fields: dropField(m.fields, fuid, sid, before) }))}
            onDeleteField={deleteField}
            onInsert={(f) => void insertField(f)}
            onCreateMissing={createMissing}
          />
        </aside>

        <section className="tpe-doc" aria-label={t("doc.label")}>
          {oo.configured ? (
            <>
              <div ref={hostRef} className="tpe-oo" />
              {ooStatus === "loading" ? (
                <div className="tpe-doc__state" aria-busy="true">
                  <span className="tpe-spin tpe-spin--lg" aria-hidden="true" />
                  <p>{t("doc.loading")}</p>
                </div>
              ) : ooStatus === "error" ? (
                <div className="tpe-doc__state" role="alert">
                  <IconAlert />
                  <b>{t("doc.error")}</b>
                  <p>{t("doc.errorText")}</p>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setOoNonce((n) => n + 1)}>
                    <IconRefresh />
                    {t("doc.retry")}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="tpe-doc__state" role="status">
              <IconAlert />
              <b>{t("doc.notConfigured")}</b>
              <p>{t("doc.notConfiguredText")}</p>
              {oo.configErrors.length ? (
                <ul className="tpe-issues">
                  {oo.configErrors.map((x) => (
                    <li key={x} className="tpe-issue tpe-issue--warning">
                      {x}
                    </li>
                  ))}
                </ul>
              ) : null}
              <button type="button" className="btn btn--line btn--sm" onClick={() => void openFile()} disabled={fileBusy}>
                <IconFileText />
                {t("actions.viewFile")}
              </button>
            </div>
          )}
        </section>

        <aside className="tpe-pane tpe-pane--insp" aria-label={t("insp.label")}>
          <div className="tpe-pane__h">
            <b>{selField ? t("insp.field") : selSection ? t("insp.section") : t("insp.meta")}</b>
            {selection ? (
              <button type="button" className="tpe-link" onClick={() => setSelection(null)}>
                {t("insp.toMeta")}
              </button>
            ) : null}
          </div>
          {selField ? (
            <FieldInspector
              key={selField.uid}
              field={selField}
              fields={model.fields}
              sections={model.sections}
              fieldTypes={session.fieldTypes}
              issues={(selField.key && issues.byKey.get(selField.key)) || []}
              issueText={issueText}
              canInsert={canInsert}
              onChange={(patch) => updateField(selField.uid, patch)}
              onMoveTo={(sid) => setModel((m) => ({ ...m, fields: dropField(m.fields, selField.uid, sid, null) }))}
              onDelete={() => deleteField(selField.uid)}
              onInsert={() => void insertField(selField)}
            />
          ) : selSection ? (
            <SectionInspector
              key={selSection.id}
              section={selSection}
              fields={model.fields}
              issues={issues.bySection.get(selSection.id) ?? []}
              issueText={issueText}
              onChange={(patch) => updateSection(selSection.id, patch)}
              onDelete={() => deleteSection(selSection.id)}
              onAddField={() => addField(selSection.id)}
            />
          ) : (
            <MetaInspector meta={model.meta} onChange={updateMeta} />
          )}
        </aside>
      </div>

      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} templateId={templateId} sections={model.sections} fields={model.fields} ensureSaved={ensureSaved} />

      <VersionsModal open={versionsOpen} onClose={() => setVersionsOpen(false)} templateId={templateId} blocked={saving || publishing} onRestored={onRestored} />

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title={t("publish.title")}
        description={t("publish.lead", { n: revision })}
        size="sm"
        busy={publishing}
        footer={
          <>
            <button type="button" className="btn btn--line" onClick={() => setPublishOpen(false)} disabled={publishing}>
              {t("publish.cancel")}
            </button>
            <button type="button" className={`btn btn--pri${publishing ? " is-busy" : ""}`} onClick={() => void runPublish()} aria-disabled={publishing || !canPublish || undefined}>
              <IconRocket />
              {publishing ? t("publish.publishing") : t("publish.confirm")}
            </button>
          </>
        }
      >
        <div className="tpe-form">
          <label className="tpe-check">
            <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} disabled={publishing} />
            <span>{t("publish.activate")}</span>
          </label>
          <p className="tpe-hint">{activate ? t("publish.activateHint") : t("publish.keepInactiveHint")}</p>
        </div>
      </Modal>

      <Modal
        open={delSection !== null}
        onClose={() => setDelSection(null)}
        title={t("section.deleteTitle", { name: delSec?.title || delSection || "" })}
        description={t("section.deleteMoveLead", { n: delSection ? fieldsOf(model.fields, delSection).length : 0 })}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn--line" onClick={() => setDelSection(null)}>
              {t("publish.cancel")}
            </button>
            <button type="button" className="btn btn--danger" onClick={confirmDeleteSection} disabled={!moveTarget || moveTarget === delSection}>
              {t("section.moveAndDelete")}
            </button>
          </>
        }
      >
        <div className="tpe-form">
          {delTargets.length ? (
            <div className="tpe-fld">
              <label id={`${uid}mt`}>{t("section.moveTo")}</label>
              <Select value={moveTarget} onChange={setMoveTarget} options={delTargets} labelId={`${uid}mt`} placeholder={t("field.pickSection")} />
            </div>
          ) : (
            <p className="tpe-warn">{t("section.needOther")}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
