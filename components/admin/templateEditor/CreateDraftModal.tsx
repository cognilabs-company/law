"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import Select, { type Option } from "@/components/Select";
import FieldError from "@/components/ui/FieldError";
import { notify } from "@/lib/toast";
import { ApiError } from "@/lib/http";
import {
  createEditorDraft,
  slugConflictOf,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  TEMPLATE_VISIBILITIES,
  type EditorSession,
} from "@/lib/services/templateEditor";
import { cleanSlugInput, toSlug } from "./model";
import { IconPlus } from "@/components/icons";

type Errors = Partial<Record<"title" | "slug", string>>;

export default function CreateDraftModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: EditorSession) => void }) {
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

  const cats: Option[] = TEMPLATE_CATEGORIES.map((c) => ({ value: c, label: ti.has(`cats.${c}`) ? ti(`cats.${c}`) : c }));
  const langs: Option[] = TEMPLATE_LANGUAGES.map((c) => ({ value: c, label: ti.has(`langs.${c}`) ? ti(`langs.${c}`) : c }));
  const vis: Option[] = TEMPLATE_VISIBILITIES.map((c) => ({ value: c, label: t.has(`vis.${c}`) ? t(`vis.${c}`) : c }));
  const dirty = Boolean(title || slug || description || price);

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
    setErrors(next);
    if (next.title || next.slug) return;
    setBusy(true);
    try {
      const session = await createEditorDraft({
        slug: s,
        title: title.trim(),
        category,
        language,
        description: description.trim(),
        price: parseInt(price || "0", 10) || 0,
        visibility,
      });
      if (!session.templateId) throw new ApiError(500, "missing template id");
      notify.success(t("create.done"), { id: "tpe-create", body: title.trim() });
      reset();
      onCreated(session);
    } catch (err) {
      if (slugConflictOf(err)) {
        setErrors({ slug: t("create.slugTaken") });
      } else if (err instanceof ApiError && err.status === 422 && (err.fieldErrors.slug || err.fieldErrors.title)) {
        setErrors({ slug: err.fieldErrors.slug, title: err.fieldErrors.title });
      } else {
        notify.error(t("create.error"), { id: "tpe-create", error: err });
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
        <p className="rf__hint">{t("create.draftNote")}</p>
      </form>
    </Modal>
  );
}
