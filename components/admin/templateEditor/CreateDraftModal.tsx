"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import Select, { type Option } from "@/components/Select";
import FieldError from "@/components/ui/FieldError";
import { notify } from "@/lib/toast";
import { ApiError, errDetail } from "@/lib/http";
import { getDocumentTemplateCategories, type DocTemplateCategory } from "@/lib/services/backend";
import {
  checkDocx,
  createEditorDraft,
  DEFAULT_UI_CONTRACT,
  getEditorUiContract,
  LocalFileError,
  slugConflictOf,
  uploadEditorDraft,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  TEMPLATE_VISIBILITIES,
  type EditorSession,
  type EditorUiContract,
} from "@/lib/services/templateEditor";
import { cleanSlugInput, toSlug } from "./model";
import { IconFileText, IconPlus, IconUpload } from "@/components/icons";

type Errors = Partial<Record<"title" | "slug" | "file", string>>;
type Mode = "blank" | "device_upload";

// `contractFrom`: any existing template — its ui-contract says how a new one
// may be started (blank, or from a file on the device) and which files the
// editor takes. Without one the modal offers the blank document only.
export default function CreateDraftModal({ open, onClose, onCreated, contractFrom = "" }: { open: boolean; onClose: () => void; onCreated: (s: EditorSession) => void; contractFrom?: string }) {
  const t = useTranslations("admin.templateEditor");
  const ti = useTranslations("admin.templates.import");
  const id = useId();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState("contract");
  const [language, setLanguage] = useState("uz-latn");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [visibility, setVisibility] = useState("client");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("blank");
  const [file, setFile] = useState<File | null>(null);
  const [contract, setContract] = useState<EditorUiContract>(DEFAULT_UI_CONTRACT);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open || !contractFrom) return;
    const c = new AbortController();
    getEditorUiContract(contractFrom, c.signal)
      .then((x) => !c.signal.aborted && setContract(x))
      .catch(() => undefined);
    return () => c.abort();
  }, [open, contractFrom]);
  const canUpload = contract.createModes.includes("device_upload");
  const upload = canUpload && mode === "device_upload";
  const maxMb = Math.round(contract.maxUploadBytes / 1048576);

  // The catalog's own template categories come first (GET
  // /document-template-categories); the editor's general kinds follow.
  const [docCats, setDocCats] = useState<DocTemplateCategory[]>([]);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    getDocumentTemplateCategories(c.signal)
      .then((rows) => !c.signal.aborted && setDocCats(rows))
      .catch(() => undefined);
    return () => c.abort();
  }, [open]);
  const catLabel = (c: string, fallback = c) => (ti.has(`cats.${c}`) ? ti(`cats.${c}`) : fallback);
  const cats: Option[] = [
    ...docCats.map((c) => ({ value: c.key, label: catLabel(c.key, c.title) })),
    ...TEMPLATE_CATEGORIES.filter((c) => !docCats.some((d) => d.key === c)).map((c) => ({ value: c, label: catLabel(c) })),
  ];
  const langs: Option[] = TEMPLATE_LANGUAGES.map((c) => ({ value: c, label: ti.has(`langs.${c}`) ? ti(`langs.${c}`) : c }));
  const vis: Option[] = TEMPLATE_VISIBILITIES.map((c) => ({ value: c, label: t.has(`vis.${c}`) ? t(`vis.${c}`) : c }));
  const dirty = Boolean(title || slug || description || price || file);

  function reset() {
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setCategory("contract");
    setLanguage("uz-latn");
    setDescription("");
    setPrice("");
    setVisibility("client");
    setErrors({});
    setMode("blank");
    setFile(null);
  }

  function onFile(f: File | null) {
    setFile(f);
    const bad = f ? checkDocx(f, contract) : null;
    setErrors((e) => ({ ...e, file: bad ? (bad.code === "too_big" ? t("upload.tooBigN", { mb: maxMb }) : t("upload.onlyTypes", { types: contract.acceptedExtensions.join(", ") })) : undefined }));
    // A file named like a document gives the form its title.
    if (f && !bad && !title.trim()) onTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
  }

  function onTitle(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(toSlug(v));
    if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const s = slug.replace(/^-+|-+$/g, "");
    const next: Errors = {};
    if (!title.trim()) next.title = t("create.titleRequired");
    if (!s) next.slug = t("create.slugRequired");
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) next.slug = t("create.slugInvalid");
    if (upload) {
      const bad = file ? checkDocx(file, contract) : null;
      if (!file) next.file = t("create.fileRequired");
      else if (bad) next.file = bad.code === "too_big" ? t("upload.tooBigN", { mb: maxMb }) : t("upload.onlyTypes", { types: contract.acceptedExtensions.join(", ") });
    }
    setErrors(next);
    if (next.title || next.slug || next.file) return;
    setBusy(true);
    try {
      const input = {
        slug: s,
        title: title.trim(),
        category,
        language,
        description: description.trim(),
        price: parseInt(price || "0", 10) || 0,
        visibility,
      };
      // One request per press: a failed upload is not sent again by itself.
      const session = upload && file ? await uploadEditorDraft(input, file, contract) : await createEditorDraft(input);
      if (!session.templateId) throw new ApiError(500, "missing template id");
      notify.success(t("create.done"), { id: "tpe-create", body: title.trim() });
      reset();
      onCreated(session);
    } catch (err) {
      if (slugConflictOf(err)) {
        setErrors({ slug: t("create.slugTaken") });
      } else if (err instanceof ApiError && err.status === 422 && (err.fieldErrors.slug || err.fieldErrors.title)) {
        setErrors({ slug: err.fieldErrors.slug, title: err.fieldErrors.title });
      } else if (err instanceof LocalFileError) {
        setErrors({ file: err.code === "too_big" ? t("upload.tooBigN", { mb: maxMb }) : t("upload.onlyTypes", { types: contract.acceptedExtensions.join(", ") }) });
      } else if (err instanceof ApiError && (err.status === 413 || err.status === 415)) {
        // The backend's own reason first; ours only when it gave none.
        setErrors({ file: errDetail(err) || (err.status === 413 ? t("upload.tooBigN", { mb: maxMb }) : t("upload.badFile")) });
      } else {
        notify.error(t("create.error"), { id: "tpe-create", error: err, map: { 503: t("upload.converterDown"), 403: t("create.forbidden") } });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("create.title")}
      description={t("create.lead")}
      busy={busy}
      dirty={dirty}
      aiId="admin.templates.create-modal"
      footer={
        <>
          <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
            {t("create.cancel")}
          </button>
          <button type="submit" form={`${id}f`} className={`btn btn--pri${busy ? " is-busy" : ""}`} aria-disabled={busy || undefined}>
            <IconPlus />
            {busy ? t("create.creating") : t("create.submit")}
          </button>
        </>
      }
    >
      <form id={`${id}f`} className="cform" style={{ maxWidth: "none" }} onSubmit={submit} noValidate>
        {canUpload ? (
          <div className="tpe-mode" role="radiogroup" aria-label={t("create.modeLabel")}>
            {(["blank", "device_upload"] as Mode[]).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} disabled={busy} data-ai-id={`admin.templates.create-modal.mode-${m}`}>
                {m === "blank" ? <IconFileText /> : <IconUpload />}
                <span>
                  <b>{t(`create.mode.${m}`)}</b>
                  <small>{t(`create.mode.${m}Hint`)}</small>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {upload ? (
          <div>
            <label htmlFor={`${id}file`}>{t("create.file")}</label>
            <div className={`tpe-drop${errors.file ? " is-bad" : ""}${file ? " has-file" : ""}`}>
              <input
                ref={fileRef}
                id={`${id}file`}
                type="file"
                accept={contract.acceptedExtensions.join(",")}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                aria-invalid={Boolean(errors.file) || undefined}
                aria-describedby={`${id}fh${errors.file ? ` ${id}fe` : ""}`}
              />
              <IconUpload />
              <span>
                <b>{file ? file.name : t("create.filePick")}</b>
                <small id={`${id}fh`}>{file ? t("create.fileSize", { mb: (file.size / 1048576).toFixed(1) }) : t("create.fileHint", { types: contract.acceptedExtensions.join(", "), mb: maxMb })}</small>
              </span>
            </div>
            <FieldError id={`${id}fe`} msg={errors.file} />
          </div>
        ) : null}
        <div>
          <label htmlFor={`${id}t`}>{t("meta.title")}</label>
          <input id={`${id}t`} value={title} onChange={(e) => onTitle(e.target.value)} aria-invalid={Boolean(errors.title) || undefined} aria-describedby={errors.title ? `${id}te` : undefined} placeholder={t("create.titlePh")} />
          <FieldError id={`${id}te`} msg={errors.title} />
        </div>
        <div>
          <label htmlFor={`${id}s`}>{t("meta.slug")}</label>
          <input
            id={`${id}s`}
            value={slug}
            spellCheck={false}
            autoCapitalize="off"
            onChange={(e) => {
              setSlug(cleanSlugInput(e.target.value));
              setSlugTouched(true);
              if (errors.slug) setErrors((x) => ({ ...x, slug: undefined }));
            }}
            aria-invalid={Boolean(errors.slug) || undefined}
            aria-describedby={`${id}sh${errors.slug ? ` ${id}se` : ""}`}
            placeholder="service-agreement"
          />
          <p className="rf__hint" id={`${id}sh`}>{t("meta.slugHint")}</p>
          <FieldError id={`${id}se`} msg={errors.slug} />
        </div>
        <div className="cform__row2">
          <div>
            <label id={`${id}cl`}>{t("meta.category")}</label>
            <Select value={category} onChange={setCategory} options={cats} labelId={`${id}cl`} />
          </div>
          <div>
            <label id={`${id}ll`}>{t("meta.language")}</label>
            <Select value={language} onChange={setLanguage} options={langs} labelId={`${id}ll`} />
          </div>
        </div>
        <div className="cform__row2">
          <div>
            <label htmlFor={`${id}p`}>{t("meta.price")}</label>
            <input id={`${id}p`} inputMode="numeric" value={price} placeholder="0" onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <label id={`${id}vl`}>{t("meta.visibility")}</label>
            <Select value={visibility} onChange={setVisibility} options={vis} labelId={`${id}vl`} />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}d`}>{t("meta.description")}</label>
          <textarea id={`${id}d`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <p className="rf__hint">{upload ? t("create.uploadNote") : t("create.draftNote")}</p>
      </form>
    </Modal>
  );
}
