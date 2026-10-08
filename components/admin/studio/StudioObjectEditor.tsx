"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import {
  addStudioComment,
  archiveStudioObject,
  createStudioObject,
  getStudioObject,
  isApprovalFree,
  listStudioComments,
  publishStudioObject,
  rollbackStudioObject,
  saveStudioObject,
  studioErrorOf,
  submitStudioObject,
  uploadStudioFile,
  useStudioAccess,
  useStudioHeartbeat,
  useStudioRegistry,
  type StudioComment,
  type StudioDetail,
  type StudioFieldErrors,
  type StudioVersion,
} from "@/lib/services/studio";
import StudioShell from "./StudioShell";
import {
  ConstructorIcon,
  StudioCodeChip,
  StudioEmpty,
  StudioErrorNote,
  StudioLoading,
  StudioStatusPill,
  StudioStatusSteps,
  studioEventObjectId,
  useNow,
  useStudioErrorText,
  useStudioLive,
  useStudioText,
} from "./bits";
import { editorFor, validateStudioPayload } from "./editors";
import { STUDIO_ERR, type StudioPayload } from "./editors/types";
import { useLeaveGuard } from "./object/useLeaveGuard";
import {
  LOCKED,
  currentVersionOf,
  draftKey,
  draftOf,
  fieldRoot,
  nextMinor,
  peekSeed,
  pruneErrors,
  reviewNoteOf,
  seedDetail,
  type Busy,
  type Draft,
  type SideTab,
} from "./object/model";
import { Banner, ErrorSummary, IconArchiveBox, VersionBadge } from "./object/ui";
import { NoteDialog, PayloadPreview, VersionLine, type DialogError } from "./object/Dialogs";
import SaveButton from "./object/SaveButton";
import VersionsPane from "./object/VersionsPane";
import CommentsPane from "./object/CommentsPane";
import FilePane from "./object/FilePane";
import StepsPane from "./object/StepsPane";
import {
  IconAlert,
  IconChatDots,
  IconChevronLeft,
  IconCircleCheck,
  IconEdit,
  IconHistory,
  IconHourglass,
  IconInfo,
  IconLayers,
  IconLock,
  IconPaperclip,
  IconRefresh,
  IconRocket,
  IconSend,
  IconShieldCheck,
} from "@/components/icons";

export default function StudioObjectEditor({ id, newCode }: { id: string; newCode: string }) {
  const { t, ctorName } = useStudioText();
  const creating = Boolean(newCode);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const onCode = useCallback((oid: string, code: string) => {
    if (!oid || !code) return;
    setCodes((m) => (m[oid] === code ? m : { ...m, [oid]: code }));
  }, []);
  const code = creating ? newCode : codes[id] || peekSeed(id)?.code || "";
  const key = creating ? `new:${newCode}` : `id:${id}`;

  return (
    <StudioShell
      title={code ? ctorName(code) : t("screens.object.title")}
      lead=""
      eyebrow={code ? t("editor.eyebrow", { code }) : t("eyebrow")}
      icon={code ? <ConstructorIcon code={code} size="lg" /> : undefined}
      need={creating ? "edit" : "any"}
      tabs={false}
    >
      <Workspace key={key} id={creating ? "" : id} newCode={newCode} onCode={onCode} />
    </StudioShell>
  );
}

type Dialog = null | "publish" | "archive" | "submitFree" | "rollback";

function Workspace({ id, newCode, onCode }: { id: string; newCode: string; onCode: (id: string, code: string) => void }) {
  const st = useStudioText();
  const { t, ctorName, fieldErr, ago } = st;
  const errText = useStudioErrorText();
  const router = useRouter();
  const acc = useStudioAccess();
  const reg = useStudioRegistry();
  const uid = useId();
  const now = useNow();

  const creating = !id;
  const seed = peekSeed(id);
  const startCtor = creating ? reg.items.find((c) => c.code === newCode) ?? null : null;

  const [detail, setDetail] = useState<StudioDetail | null>(seed);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [draft, setDraft] = useState<Draft | null>(() => (seed ? draftOf(seed) : creating ? { title: "", payload: editorFor(newCode).emptyPayload(startCtor) } : null));
  const [base, setBase] = useState(() => draftKey(seed ? draftOf(seed) : creating ? { title: "", payload: editorFor(newCode).emptyPayload(startCtor) } : null));
  const [remote, setRemote] = useState(false);
  const [errors, setErrors] = useState<StudioFieldErrors>({});
  const [errTitle, setErrTitle] = useState("");
  const [actErr, setActErr] = useState<unknown>(null);
  const [titleErr, setTitleErr] = useState(false);
  const [busy, setBusy] = useState<Busy>("");
  const [tab, setTab] = useState<SideTab>(() => (seed && seed.code === "K06" && seed.payload.mode === "upload" ? "file" : "versions"));
  const [comments, setComments] = useState<StudioComment[] | null>(null);
  const [commentsErr, setCommentsErr] = useState<unknown>(null);
  const [fileErr, setFileErr] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dlgErr, setDlgErr] = useState<DialogError>(null);
  const [rollTo, setRollTo] = useState<StudioVersion | null>(null);
  const [preview, setPreview] = useState<StudioVersion | null>(null);
  const [publishFail, setPublishFail] = useState<{ text: string } | null>(null);

  const code = detail?.code || newCode;
  const ctor = reg.items.find((c) => c.code === code) ?? null;
  const entry = editorFor(code);
  const Editor = entry.Editor;
  const status = detail?.status ?? "draft";
  const statusRaw = detail?.statusRaw ?? "";
  const approvalFree = isApprovalFree(code, ctor);
  const unknownCode = creating && reg.items.length > 0 && !ctor;
  const dirty = draft !== null && draftKey(draft) !== base;
  const locked = LOCKED.includes(status);
  const readOnly = !acc.canEdit || locked;
  const curVer = currentVersionOf(detail);
  const hasFile = Boolean(detail?.hasFile || curVer?.hasFile);
  const uploadMode = code === "K06" && draft?.payload.mode === "upload";

  const guard = useLeaveGuard(dirty && !readOnly);
  const hb = useStudioHeartbeat({
    enabled: Boolean(code) && !unknownCode && status !== "archived",
    constructorCode: code,
    objectId: id,
    versionId: detail?.currentVersionId ?? "",
    objectName: draft?.title || detail?.title || "",
    screen: `${code.toLowerCase()}-editor`,
  });

  const dirtyRef = useRef(false);
  const seq = useRef(0);
  const hadDetail = useRef(Boolean(seed));
  useEffect(() => {
    dirtyRef.current = dirty;
    hadDetail.current = detail !== null;
  });

  const apply = useCallback(
    (d: StudioDetail, force: boolean) => {
      setDetail(d);
      setLoadErr(null);
      onCode(d.id || id, d.code);
      if (force || !dirtyRef.current) {
        const next = draftOf(d);
        setDraft(next);
        setBase(draftKey(next));
        setRemote(false);
      } else {
        setRemote(true);
      }
    },
    [id, onCode],
  );

  const refresh = useCallback(
    async (force = false): Promise<StudioDetail | null> => {
      if (!id) return null;
      const my = ++seq.current;
      try {
        const d = await getStudioObject(id);
        if (my === seq.current) apply(d, force);
        return d;
      } catch (e) {
        logApiError("studio.object.get", e);
        if (my === seq.current && !hadDetail.current) setLoadErr(e);
        return null;
      }
    },
    [id, apply],
  );

  const loadComments = useCallback(async () => {
    if (!id) return;
    try {
      const list = await listStudioComments(id);
      setComments(list);
      setCommentsErr(null);
    } catch (e) {
      logApiError("studio.comments", e);
      setCommentsErr(e);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const my = ++seq.current;
    getStudioObject(id)
      .then((d) => {
        if (alive && my === seq.current) apply(d, true);
      })
      .catch((e: unknown) => {
        logApiError("studio.object.get", e);
        if (alive && my === seq.current && !hadDetail.current) setLoadErr(e);
      });
    return () => {
      alive = false;
    };
  }, [id, apply]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    listStudioComments(id)
      .then((list) => {
        if (!alive) return;
        setComments(list);
        setCommentsErr(null);
      })
      .catch((e: unknown) => {
        logApiError("studio.comments", e);
        if (alive) setCommentsErr(e);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useStudioLive((e) => {
    if (e.event === "studio.resync") {
      void refresh();
      void loadComments();
      return;
    }
    const oid = studioEventObjectId(e);
    if (!oid || oid !== id) return;
    if (e.event === "studio.comment_created") void loadComments();
    else if (e.event.startsWith("studio.object_") || e.event === "studio.file_uploaded") void refresh();
  }, Boolean(id));

  function fail(scope: string, e: unknown) {
    logApiError(scope, e);
    const se = studioErrorOf(e);
    if (Object.keys(se.fieldErrors).length) {
      setErrors(se.fieldErrors);
      setErrTitle(errText(e).title);
      setActErr(null);
      if (se.fieldErrors.file) setTab("file");
    } else {
      setActErr(e);
    }
    scrollTop();
  }

  function scrollTop() {
    requestAnimationFrame(() => document.getElementById(`${uid}-top`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function setPayload(next: StudioPayload) {
    if (!draft) return;
    setErrors((errs) => pruneErrors(errs, draft.payload, next));
    setDraft({ ...draft, payload: next });
  }

  function setTitle(v: string) {
    if (!draft) return;
    if (v.trim()) setTitleErr(false);
    setDraft({ ...draft, title: v.slice(0, 200) });
  }

  async function persist(meta: { summary?: string; version?: string } = {}): Promise<string> {
    if (!draft) return "";
    const title = draft.title.trim();
    if (!title) {
      setTitleErr(true);
      document.getElementById(`${uid}-title`)?.focus();
      return "";
    }
    setActErr(null);
    setPublishFail(null);
    try {
      if (!id) {
        const created = await createStudioObject({ constructorCode: code, title, payload: draft.payload });
        if (!created.id) {
          toast(t("editor.toast.noId"), { tone: "err" });
          return "";
        }
        hb.markSaved();
        seedDetail({ ...created, code: created.code || code, title: created.title || title, payload: Object.keys(created.payload).length ? created.payload : draft.payload });
        return created.id;
      }
      await saveStudioObject(id, { title, payload: draft.payload, summary: meta.summary, version: meta.version });
      hb.markSaved();
      return id;
    } catch (e) {
      fail("studio.object.save", e);
      return "";
    }
  }

  function openCreated(oid: string) {
    guard.release();
    router.replace(`/admin/studio/o/${encodeURIComponent(oid)}`);
  }

  async function save(meta: { summary?: string; version?: string } = {}) {
    if (busy || readOnly) return;
    setBusy("save");
    const oid = await persist(meta);
    if (oid) {
      setErrors({});
      toast(id ? t("editor.toast.saved") : t("editor.toast.created"), { tone: "ok" });
      if (!id) openCreated(oid);
      else await refresh(true);
    }
    setBusy("");
  }

  function clientErrors(): StudioFieldErrors {
    if (!draft) return {};
    const out = validateStudioPayload(code, draft.payload, ctor, undefined, draft.title);
    if (uploadMode && !hasFile) out.file = STUDIO_ERR.file;
    return out;
  }

  function askSubmit() {
    if (busy || readOnly || !draft) return;
    if (!draft.title.trim()) {
      setTitleErr(true);
      document.getElementById(`${uid}-title`)?.focus();
      return;
    }
    const v = clientErrors();
    if (Object.keys(v).length) {
      setErrors(v);
      setErrTitle(t("editor.errors.beforeSubmit"));
      if (v.file) setTab("file");
      scrollTop();
      return;
    }
    if (approvalFree) {
      setDlgErr(null);
      setDialog("submitFree");
      return;
    }
    void submit();
  }

  async function submit() {
    setBusy("submit");
    setDlgErr(null);
    const oid = id && !dirty ? id : await persist();
    if (!oid) {
      setBusy("");
      setDialog(null);
      return;
    }
    try {
      await submitStudioObject(oid);
      setErrors({});
      setDialog(null);
      toast(approvalFree ? t("editor.toast.submittedFree") : t("editor.toast.submitted"), { tone: "ok" });
      if (!id) {
        const fresh = await getStudioObject(oid).catch(() => null);
        if (fresh) seedDetail(fresh);
        openCreated(oid);
      } else {
        await refresh(true);
      }
    } catch (e) {
      setDialog(null);
      if (!id) {
        openCreated(oid);
        toast(errText(e).text, { tone: "err" });
      } else {
        await refresh(true);
        fail("studio.object.submit", e);
      }
    } finally {
      setBusy("");
    }
  }

  async function archive() {
    if (!id) return;
    setBusy("archive");
    setDlgErr(null);
    try {
      await archiveStudioObject(id);
      setDialog(null);
      toast(t("editor.toast.archived"), { tone: "ok" });
      await refresh(true);
    } catch (e) {
      logApiError("studio.object.archive", e);
      setDlgErr(errText(e));
    } finally {
      setBusy("");
    }
  }

  async function publish(note: string) {
    if (!id) return;
    setBusy("publish");
    setDlgErr(null);
    try {
      await publishStudioObject(id, { note });
      setDialog(null);
      setPublishFail(null);
      toast(t("editor.toast.published"), { tone: "ok" });
      await refresh(true);
    } catch (e) {
      logApiError("studio.object.publish", e);
      const se = studioErrorOf(e);
      if (se.kind === "publish_failed") {
        const text = se.message || t("error.hint.publish_failed");
        setDlgErr({ title: t("editor.publish.failed"), text });
        setPublishFail({ text });
      } else if (se.kind === "publish_requires_approved") {
        setDlgErr({ title: t("error.kind.publish_requires_approved"), text: se.message || t("error.hint.publish_requires_approved") });
      } else {
        setDlgErr(errText(e));
      }
      void refresh();
    } finally {
      setBusy("");
    }
  }

  async function rollback(note: string) {
    if (!id || !rollTo) return;
    setBusy("rollback");
    setDlgErr(null);
    try {
      await rollbackStudioObject(id, { versionId: rollTo.id, note });
      setDialog(null);
      setRollTo(null);
      toast(t("editor.toast.rolledBack", { v: rollTo.version || "—" }), { tone: "ok" });
      await refresh(true);
    } catch (e) {
      logApiError("studio.object.rollback", e);
      setDlgErr(errText(e));
    } finally {
      setBusy("");
    }
  }

  async function upload(file: File): Promise<boolean> {
    if (!id) {
      setFileErr(t("editor.file.saveFirst"));
      return false;
    }
    setBusy("upload");
    setFileErr("");
    try {
      await uploadStudioFile(id, file);
      setErrors((errs) => {
        if (!errs.file) return errs;
        const next = { ...errs };
        delete next.file;
        return next;
      });
      toast(t("editor.toast.uploaded"), { tone: "ok" });
      await refresh();
      return true;
    } catch (e) {
      logApiError("studio.object.file", e);
      setFileErr(errText(e).text);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function uploadFromEditor(file: File): Promise<void> {
    const ok = await upload(file);
    if (!ok) throw new Error(t("editor.file.uploadFail"));
  }

  async function addComment(text: string): Promise<boolean> {
    if (!id) return false;
    setBusy("comment");
    try {
      const c = await addStudioComment(id, text);
      setComments((list) => [c, ...(list ?? []).filter((x) => !c.id || x.id !== c.id)]);
      void loadComments();
      return true;
    } catch (e) {
      logApiError("studio.comment.add", e);
      toast(errText(e).text, { tone: "err" });
      return false;
    } finally {
      setBusy("");
    }
  }

  function pickError(k: string) {
    const root = fieldRoot(k);
    if (root === "file") {
      setTab("file");
      document.getElementById(`${uid}-side`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (root === "title" && !(draft && "title" in draft.payload)) {
      document.getElementById(`${uid}-title`)?.focus();
      return;
    }
    const scope = document.getElementById(`${uid}-main`);
    const el =
      scope?.querySelector<HTMLElement>(`[data-ai-id="admin.studio.editor.field.${root}"]`) ??
      scope?.querySelector<HTMLElement>(`[data-ai-id$=".${root}"]`) ??
      scope?.querySelector<HTMLElement>("[aria-invalid=true]");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus?.({ preventScroll: true });
  }

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  const canSave = acc.canEdit && !readOnly && draft !== null && !unknownCode;
  useEffect(() => {
    if (!canSave) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canSave]);

  const listHref = code ? `/admin/studio/c/${encodeURIComponent(code)}` : "/admin/studio";

  if (unknownCode) {
    return (
      <StudioEmpty icon={IconLayers} title={t("editor.unknown.title")} text={t("editor.unknown.text", { code: newCode })}>
        <Link href="/admin/studio" className="btn btn--line btn--sm">
          <IconChevronLeft aria-hidden />
          {t("actions.backHome")}
        </Link>
      </StudioEmpty>
    );
  }

  if (!detail && loadErr) {
    const se = studioErrorOf(loadErr);
    if (se.kind === "not_found") {
      return (
        <StudioEmpty icon={IconLayers} title={t("editor.notFound.title")} text={t("editor.notFound.text")}>
          <Link href="/admin/studio" className="btn btn--line btn--sm">
            <IconChevronLeft aria-hidden />
            {t("actions.backHome")}
          </Link>
        </StudioEmpty>
      );
    }
    return <StudioErrorNote error={loadErr} onRetry={() => void refresh(true)} />;
  }

  if (!draft) return <StudioLoading rows={4} label={t("editor.loading")} />;

  const reviewNote = status === "changes_requested" ? reviewNoteOf(detail, comments) : null;
  const submitShown = canSave && (creating || status === "draft" || status === "changes_requested" || dirty);
  const archiveShown = Boolean(id) && acc.canArchive && status !== "archived";
  const publishShown = Boolean(id) && status === "approved" && acc.canPublish && !approvalFree;
  const reviewShown = Boolean(id) && (status === "submitted" || status === "in_review") && acc.canReview;
  const savedAt = detail?.updatedAt || "";
  const anyBusy = busy !== "";
  const errCount = Object.keys(errors).length;
  const sideTabs: { key: SideTab; label: string; Icon: typeof IconHistory; count?: number }[] = [
    { key: "versions", label: t("editor.side.versions"), Icon: IconHistory, count: detail?.versions.length || undefined },
    { key: "comments", label: t("editor.side.comments"), Icon: IconChatDots, count: comments?.length || undefined },
    { key: "file", label: t("editor.side.file"), Icon: IconPaperclip },
    { key: "steps", label: t("editor.side.steps"), Icon: IconShieldCheck },
  ];

  return (
    <div className="stu-ed">
      <section className="stu-ed__top" id={`${uid}-top`} aria-label={t("editor.topLabel")}>
        <div className="stu-ed__row">
          <button type="button" className="stu-back stu-ed__back" onClick={() => guard.go(listHref)} data-ai-id="admin.studio.editor.back" data-ai-type="button" data-ai-label={t("editor.backToList")}>
            <IconChevronLeft aria-hidden />
            {code ? ctorName(code) : t("actions.back")}
          </button>
          <StudioCodeChip code={code} />
          <div className="stu-ed__meta">
            {detail?.currentVersion ? <VersionBadge version={detail.currentVersion} /> : null}
            <StudioStatusPill status={status} raw={statusRaw} />
            {dirty && !readOnly ? (
              <span className="stu-odirty">
                <i aria-hidden />
                {t("editor.unsaved")}
              </span>
            ) : savedAt ? (
              <span className="stu-osaved" title={st.when(savedAt)}>
                {t("editor.savedAt", { when: ago(savedAt, now) })}
              </span>
            ) : creating ? (
              <span className="stu-osaved">{t("editor.notSaved")}</span>
            ) : null}
          </div>
        </div>
        <div className="stu-ed__title">
          <label htmlFor={`${uid}-title`} className="stu-ed__tl">
            {t("editor.titleLabel")}
            {!readOnly ? <i className="stu-req" aria-hidden>*</i> : null}
          </label>
          <input
            id={`${uid}-title`}
            type="text"
            value={draft.title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={readOnly}
            placeholder={t("editor.titlePh")}
            autoComplete="off"
            aria-invalid={titleErr}
            aria-required
            data-ai-id="admin.studio.editor.title"
            data-ai-type="input"
            data-ai-label={t("editor.titleLabel")}
          />
          {titleErr ? (
            <p className="stu-ferr" role="alert">
              {t("editor.titleRequired")}
            </p>
          ) : null}
        </div>
        <StudioStatusSteps status={status} raw={statusRaw} approvalFree={approvalFree} />
      </section>

      {publishFail ? (
        <Banner
          tone="err"
          icon={IconAlert}
          title={t("editor.publish.failed")}
          action={
            <button type="button" className="btn btn--line btn--sm" onClick={() => setPublishFail(null)}>
              {t("actions.close")}
            </button>
          }
        >
          <p>{publishFail.text}</p>
        </Banner>
      ) : null}

      {remote ? (
        <Banner
          tone="warn"
          icon={IconRefresh}
          title={t("editor.remote.title")}
          action={
            <button type="button" className="btn btn--line btn--sm" onClick={() => void refresh(true)} data-ai-id="admin.studio.editor.remote.load" data-ai-type="button" data-ai-label={t("editor.remote.load")}>
              <IconRefresh aria-hidden />
              {t("editor.remote.load")}
            </button>
          }
        >
          <p>{t("editor.remote.text")}</p>
        </Banner>
      ) : null}

      {reviewNote ? (
        <Banner tone="warn" icon={IconRefresh} title={reviewNote.rejected ? t("editor.banner.rejected") : t("editor.banner.changes")}>
          <blockquote className="stu-oban__q">{reviewNote.text}</blockquote>
          {reviewNote.by || reviewNote.at ? <small>{[reviewNote.by, st.when(reviewNote.at)].filter(Boolean).join(" · ")}</small> : null}
        </Banner>
      ) : status === "changes_requested" && acc.canEdit ? (
        <Banner tone="warn" icon={IconRefresh} title={t("editor.banner.changes")}>
          <p>{t("editor.banner.changesNoNote")}</p>
        </Banner>
      ) : null}

      {status === "published" && acc.canEdit ? (
        <Banner tone="info" icon={IconRocket} title={t("editor.banner.published")}>
          <p>{t("editor.banner.publishedText")}</p>
        </Banner>
      ) : null}
      {status === "approved" ? (
        <Banner tone="ok" icon={IconCircleCheck} title={t("editor.banner.approved")}>
          <p>{publishShown ? t("editor.banner.approvedPublisher") : t("editor.banner.approvedWait")}</p>
        </Banner>
      ) : null}
      {status === "submitted" || status === "in_review" ? (
        <Banner
          tone="info"
          icon={IconHourglass}
          title={t("editor.banner.review")}
          action={
            reviewShown ? (
              <Link href="/admin/studio/approvals" className="btn btn--soft btn--sm" data-ai-id="admin.studio.editor.open-review" data-ai-type="link" data-ai-label={t("editor.openReview")}>
                <IconShieldCheck aria-hidden />
                {t("editor.openReview")}
              </Link>
            ) : undefined
          }
        >
          <p>{t("editor.banner.reviewText")}</p>
        </Banner>
      ) : null}
      {!acc.canEdit && status !== "archived" ? (
        <Banner tone="info" icon={IconLock} title={t("editor.banner.viewOnly")}>
          <p>{t("editor.banner.viewOnlyText")}</p>
        </Banner>
      ) : null}
      {uploadMode && !hasFile && !readOnly ? (
        <Banner
          tone="warn"
          icon={IconPaperclip}
          title={t("editor.banner.fileNeeded")}
          action={
            <button type="button" className="btn btn--line btn--sm" onClick={() => pickError("file")} data-ai-id="admin.studio.editor.goto-file" data-ai-type="button" data-ai-label={t("editor.side.file")}>
              <IconPaperclip aria-hidden />
              {t("editor.side.file")}
            </button>
          }
        >
          <p>{creating ? t("editor.banner.fileNeededNew") : t("editor.banner.fileNeededText")}</p>
        </Banner>
      ) : null}

      {errCount ? <ErrorSummary errors={errors} title={errTitle || t("error.kind.validation")} onPick={pickError} /> : null}
      {actErr ? <StudioErrorNote error={actErr} /> : null}

      <div className="stu-ed__grid">
        <div className="stu-ed__main">
          <section className="stu-card stu-ed__card" id={`${uid}-main`} aria-label={t("editor.contentLabel")}>
            <div className="stu-card__h">
              <h3>{t("editor.content")}</h3>
              {readOnly ? (
                <small className="stu-ed__ro">
                  <IconLock aria-hidden />
                  {t("editor.readOnly")}
                </small>
              ) : (
                <small>{t("editor.contentHint")}</small>
              )}
            </div>
            <Editor
              code={code}
              constructor={ctor}
              payload={draft.payload}
              onChange={setPayload}
              errors={errors}
              readOnly={readOnly}
              file={curVer || hasFile ? { hasFile, fileName: curVer?.fileName ?? "", fileUrl: curVer?.fileUrl ?? "", versionId: curVer?.id ?? "" } : null}
              onUploadFile={!readOnly && id ? uploadFromEditor : null}
              title={draft.title}
            />
          </section>

          {canSave || archiveShown || publishShown ? (
            <div className="stu-ed__bar" role="toolbar" aria-label={t("editor.actionsLabel")}>
              <div className="stu-ed__state">
                {dirty && !readOnly ? (
                  <span className="stu-odirty">
                    <i aria-hidden />
                    {t("editor.unsaved")}
                  </span>
                ) : (
                  <span className="stu-osaved">{creating ? t("editor.notSaved") : t("editor.allSaved")}</span>
                )}
                {canSave ? <small className="stu-okbd">{t("editor.shortcut")}</small> : null}
              </div>
              <div className="stu-ed__acts">
                {archiveShown ? (
                  <button
                    type="button"
                    className="btn btn--line btn--sm"
                    onClick={() => {
                      setDlgErr(null);
                      setDialog("archive");
                    }}
                    disabled={anyBusy}
                    data-ai-id="admin.studio.editor.archive"
                    data-ai-type="button"
                    data-ai-label={t("actions.archive")}
                  >
                    <IconArchiveBox aria-hidden />
                    {t("actions.archive")}
                  </button>
                ) : null}
                {canSave ? (
                  <SaveButton
                    busy={busy === "save"}
                    disabled={anyBusy || (!dirty && !creating)}
                    isNew={creating}
                    primary={!submitShown && !publishShown}
                    suggest={nextMinor(detail?.currentVersion || "1.0")}
                    onSave={(meta) => void save(meta)}
                  />
                ) : null}
                {submitShown ? (
                  <button type="button" className="btn btn--grad btn--sm" onClick={askSubmit} disabled={anyBusy} data-ai-id="admin.studio.editor.submit" data-ai-type="button" data-ai-label={t("actions.submit")}>
                    {busy === "submit" ? <span className="stu-spin" aria-hidden /> : approvalFree ? <IconRocket aria-hidden /> : <IconSend aria-hidden />}
                    {approvalFree ? t("editor.submit.free") : dirty || creating ? t("editor.submit.saveAnd") : t("actions.submit")}
                  </button>
                ) : null}
                {publishShown ? (
                  <button
                    type="button"
                    className="btn btn--grad btn--sm"
                    onClick={() => {
                      setDlgErr(null);
                      setDialog("publish");
                    }}
                    disabled={anyBusy || dirty}
                    title={dirty ? t("editor.publish.saveFirst") : undefined}
                    data-ai-id="admin.studio.editor.publish"
                    data-ai-type="button"
                    data-ai-label={t("actions.publish")}
                  >
                    <IconRocket aria-hidden />
                    {t("actions.publish")}
                  </button>
                ) : null}
              </div>
              {submitShown && approvalFree ? <p className="stu-ed__note">{t("editor.submit.freeHint")}</p> : null}
            </div>
          ) : null}
        </div>

        <aside className="stu-card stu-oside" id={`${uid}-side`} aria-label={t("editor.sideLabel")}>
          {creating ? (
            <div className="stu-opane__none stu-oside__new">
              <IconEdit aria-hidden />
              <b>{t("editor.side.newTitle")}</b>
              <p>{t("editor.side.newText")}</p>
            </div>
          ) : (
            <>
              <div className="stu-seg stu-oside__tabs" role="tablist" aria-label={t("editor.sideLabel")}>
                {sideTabs.map(({ key, label, Icon: Glyph, count }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    id={`${uid}-tab-${key}`}
                    aria-selected={tab === key}
                    aria-controls={`${uid}-panel`}
                    className="stu-seg__b"
                    onClick={() => setTab(key)}
                    data-ai-id={`admin.studio.editor.side.${key}`}
                    data-ai-type="tab"
                    data-ai-label={label}
                  >
                    <Glyph aria-hidden />
                    <span className="stu-oside__tl">{label}</span>
                    {count ? <em className="stu-oside__n">{count}</em> : null}
                    {key === "file" && (uploadMode && !hasFile) ? <em className="stu-oside__dot" aria-hidden /> : null}
                  </button>
                ))}
              </div>
              <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} className="stu-oside__body">
                {tab === "versions" && detail ? (
                  <VersionsPane
                    detail={detail}
                    canRollback={acc.canPublish && status !== "archived"}
                    canExport={acc.canReview}
                    busy={anyBusy}
                    onRollback={(v) => {
                      setRollTo(v);
                      setDlgErr(null);
                      setDialog("rollback");
                    }}
                    onPreview={setPreview}
                  />
                ) : null}
                {tab === "comments" ? (
                  <CommentsPane
                    comments={comments}
                    error={commentsErr}
                    versions={detail?.versions ?? []}
                    canComment={acc.any && status !== "archived"}
                    sending={busy === "comment"}
                    onRetry={() => void loadComments()}
                    onAdd={addComment}
                  />
                ) : null}
                {tab === "file" ? (
                  <FilePane
                    version={curVer}
                    hasFile={hasFile}
                    canUpload={acc.canEdit}
                    needsSave={!id}
                    required={uploadMode}
                    readOnly={readOnly}
                    uploading={busy === "upload"}
                    error={fileErr || (errors.file ? fieldErr(errors.file) : "")}
                    onUpload={upload}
                  />
                ) : null}
                {tab === "steps" ? <StepsPane steps={detail?.steps ?? []} approvalFree={approvalFree} submitted={status === "submitted" || status === "in_review"} /> : null}
              </div>
            </>
          )}
        </aside>
      </div>

      <NoteDialog
        open={dialog === "publish"}
        title={t("editor.publish.title")}
        onClose={() => setDialog(null)}
        aiId="admin.studio.editor.publish-modal"
        lead={<p>{t("editor.publish.lead")}</p>}
        note={{ label: t("editor.publish.note"), placeholder: t("editor.publish.notePh") }}
        confirmLabel={t("actions.publish")}
        confirmIcon={IconRocket}
        tone="grad"
        busy={busy === "publish"}
        error={dlgErr}
        onConfirm={(note) => void publish(note)}
      >
        {curVer ? <VersionLine version={curVer} /> : null}
      </NoteDialog>

      <NoteDialog
        open={dialog === "rollback" && rollTo !== null}
        title={t("editor.rollback.title", { v: rollTo?.version || "—" })}
        onClose={() => {
          setDialog(null);
          setRollTo(null);
        }}
        aiId="admin.studio.editor.rollback-modal"
        lead={<p>{t("editor.rollback.lead")}</p>}
        note={{ label: t("editor.rollback.note"), placeholder: t("editor.rollback.notePh") }}
        confirmLabel={t("editor.rollback.confirm")}
        confirmIcon={IconHistory}
        tone="pri"
        busy={busy === "rollback"}
        error={dlgErr}
        onConfirm={(note) => void rollback(note)}
      >
        {rollTo ? <VersionLine version={rollTo} /> : null}
      </NoteDialog>

      <NoteDialog
        open={dialog === "archive"}
        title={t("editor.archive.title")}
        onClose={() => setDialog(null)}
        aiId="admin.studio.editor.archive-modal"
        lead={
          <>
            <p>{t("editor.archive.lead")}</p>
            {dirty ? <p className="stu-odlg__warn">{t("editor.archive.dirty")}</p> : null}
          </>
        }
        confirmLabel={t("actions.archive")}
        confirmIcon={IconArchiveBox}
        tone="pri"
        busy={busy === "archive"}
        error={dlgErr}
        onConfirm={() => void archive()}
      />

      <NoteDialog
        open={dialog === "submitFree"}
        title={t("editor.submit.freeTitle")}
        onClose={() => setDialog(null)}
        aiId="admin.studio.editor.submit-modal"
        lead={
          <>
            <p>{t("editor.submit.freeLead")}</p>
            {dirty || creating ? <p className="stu-hint">{t("editor.submit.freeSave")}</p> : null}
          </>
        }
        confirmLabel={t("editor.submit.free")}
        confirmIcon={IconRocket}
        tone="grad"
        busy={busy === "submit" || busy === "save"}
        error={dlgErr}
        onConfirm={() => void submit()}
      />

      <PayloadPreview open={preview !== null} version={preview} onClose={() => setPreview(null)} />

      <NoteDialog
        open={guard.asking}
        title={t("editor.leave.title")}
        onClose={guard.cancel}
        aiId="admin.studio.editor.leave-modal"
        lead={<p>{t("editor.leave.lead")}</p>}
        confirmLabel={t("editor.leave.confirm")}
        confirmIcon={IconInfo}
        tone="line"
        busy={false}
        error={null}
        onConfirm={() => guard.confirm()}
      />
    </div>
  );
}
