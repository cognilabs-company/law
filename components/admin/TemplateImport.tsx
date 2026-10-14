"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { importTemplateDocx, importTemplatesZip, previewTemplate, type TemplateField } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import FieldError from "@/components/ui/FieldError";
import ScrollCue from "@/components/ui/ScrollCue";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { IconUpload, IconCheck } from "@/components/icons";

const CATS = ["contract", "claim", "application", "power_of_attorney", "corporate", "other"];
const LANGS = ["uz-latn", "uz-cyrl", "ru"];
const VIS = ["staff", "clients", "public"];

// T1B-09 template constructor: upload a DOCX → the backend extracts the
// {{field}} markers → check the field list and preview → the template is
// created inactive (draft) for review. ZIP uploads import many at once.
export default function TemplateImport({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("admin.templates.import");
  const uid = useId();
  const [mode, setMode] = useState<"docx" | "zip">("docx");
  const [file, setFile] = useState<File | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("contract");
  const [language, setLanguage] = useState("uz-latn");
  const [visibility, setVisibility] = useState("clients");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileErr, setFileErr] = useState("");
  const [slugErr, setSlugErr] = useState("");
  const [fields, setFields] = useState<TemplateField[] | null>(null);
  const [preview, setPreview] = useState("");

  function pick(f: File | null) {
    setFile(f);
    setFileErr("");
    setFields(null);
    setPreview("");
    if (f && !title) setTitle(f.name.replace(/\.(docx|zip)$/i, ""));
    if (f && !slug) setSlug(f.name.replace(/\.(docx|zip)$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setFileErr("");
    setSlugErr("");
    try {
      if (mode === "zip") {
        const r = await importTemplatesZip({ file, category, language, visibility });
        notify.success(t("zipDone", { n: r.created }), { id: "tpl-import" });
        onDone();
      } else {
        const tpl = await importTemplateDocx({ file, slug: slug.trim(), title: title.trim(), category, language, visibility, price: parseInt(price || "0", 10) || 0 });
        const p = await previewTemplate({ templateId: tpl.id }).catch(() => null);
        setFields(p?.fields ?? []);
        setPreview(p?.previewText ?? "");
        notify.success(t("docxDone", { n: p?.fields.length ?? 0 }), { id: "tpl-import", body: title.trim() });
        onDone();
      }
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 409 && mode === "docx") {
        setSlugErr(t("slugTaken"));
        document.getElementById(`${uid}-slug`)?.focus();
      } else if (status === 415 || status === 413) {
        setFileErr(status === 415 ? t("onlyDocx") : t("tooBig"));
        document.getElementById(`${uid}-file`)?.focus();
      } else {
        notify.error(t("error"), { id: "tpl-import", error: err, map: { 403: t("forbidden"), 409: t("slugTaken") } });
      }
    } finally {
      setBusy(false);
    }
  }

  const opt = (xs: string[], ns: string) => xs.map((x) => ({ value: x, label: t.has(`${ns}.${x}`) ? t(`${ns}.${x}`) : x }));

  return (
    <Modal open={open} onClose={onClose} title={t("title")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
        <p className="advmuted">{t("lead")}</p>
        <ScrollCue className="tabs" role="tablist" style={{ marginBottom: 0 }}>
          <button type="button" role="tab" className="tab" aria-selected={mode === "docx"} onClick={() => { setMode("docx"); pick(null); }}>{t("modeDocx")}</button>
          <button type="button" role="tab" className="tab" aria-selected={mode === "zip"} onClick={() => { setMode("zip"); pick(null); }}>{t("modeZip")}</button>
        </ScrollCue>
        <div>
          <label htmlFor={`${uid}-file`}>{mode === "zip" ? t("zipFile") : t("docxFile")}</label>
          <input
            id={`${uid}-file`}
            type="file"
            accept={mode === "zip" ? ".zip" : ".docx"}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            aria-invalid={fileErr ? true : undefined}
            aria-describedby={fileErr ? `${uid}-file-err` : undefined}
          />
          <FieldError id={`${uid}-file-err`} msg={fileErr} />
          <p className="rf__hint">{mode === "zip" ? t("zipHint") : t("docxHint")}</p>
        </div>
        {mode === "docx" ? (
          <>
            <div className="cform__row2">
              <div><label>{t("titleLabel")}</label><input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
              <div>
                <label htmlFor={`${uid}-slug`}>{t("slug")}</label>
                <input
                  id={`${uid}-slug`}
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                    setSlugErr("");
                  }}
                  required
                  aria-invalid={slugErr ? true : undefined}
                  aria-describedby={slugErr ? `${uid}-slug-err` : undefined}
                />
                <FieldError id={`${uid}-slug-err`} msg={slugErr} />
              </div>
            </div>
          </>
        ) : null}
        <div className="cform__row2">
          <div><label>{t("category")}</label><Select value={category} onChange={setCategory} options={opt(CATS, "cats")} ariaLabel={t("category")} /></div>
          <div><label>{t("language")}</label><Select value={language} onChange={setLanguage} options={opt(LANGS, "langs")} ariaLabel={t("language")} /></div>
        </div>
        <div className="cform__row2">
          <div><label>{t("visibility")}</label><Select value={visibility} onChange={setVisibility} options={opt(VIS, "vis")} ariaLabel={t("visibility")} /></div>
          {mode === "docx" ? <div><label>{t("price")}</label><input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} placeholder="0" /></div> : <div />}
        </div>
        {fields ? (
          <div className="rf__benefit">
            <b>{t("fieldsFound", { n: fields.length })}</b>
            {fields.length ? (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: ".82rem" }}>
                {fields.map((f) => <li key={f.key}><code>{`{{${f.key}}}`}</code> — {f.label} · {t.has(`types.${f.type}`) ? t(`types.${f.type}`) : f.type}{f.required ? " *" : ""}</li>)}
              </ul>
            ) : <p>{t("noFields")}</p>}
            {preview ? <pre className="legaldoc__body" style={{ marginTop: 8, maxHeight: 220 }}>{preview}</pre> : null}
            <p style={{ marginTop: 8, fontSize: ".8rem" }}><IconCheck style={{ width: 13, height: 13 }} /> {t("draftNote")}</p>
          </div>
        ) : null}
        <button className="btn btn--pri btn--full" type="submit" disabled={busy || !file || (mode === "docx" && (!slug || !title))}><IconUpload />{busy ? t("uploading") : t("upload")}</button>
      </form>
    </Modal>
  );
}
