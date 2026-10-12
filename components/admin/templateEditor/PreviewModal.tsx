"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { notify } from "@/lib/toast";
import { previewEditor, type EditorField, type EditorPreview, type EditorSection, type PreviewAnswer } from "@/lib/services/templateEditor";
import { fieldsOf, orphanFields } from "./model";
import { IconEye } from "@/components/icons";

type Answers = Record<string, string | boolean>;

function toAnswers(fields: EditorField[], values: Answers): Record<string, PreviewAnswer> {
  const out: Record<string, PreviewAnswer> = {};
  for (const f of fields) {
    if (!f.key) continue;
    const v = values[f.key];
    if (f.type === "checkbox") {
      if (v === true) out[f.key] = true;
      continue;
    }
    if (typeof v !== "string" || !v.trim()) continue;
    if (f.type === "number") {
      const n = Number(v.replace(",", "."));
      out[f.key] = Number.isFinite(n) ? n : v;
    } else out[f.key] = v;
  }
  return out;
}

export default function PreviewModal({
  open,
  onClose,
  templateId,
  sections,
  fields,
  ensureSaved,
}: {
  open: boolean;
  onClose: () => void;
  templateId: string;
  sections: EditorSection[];
  fields: EditorField[];
  ensureSaved: () => Promise<boolean>;
}) {
  const t = useTranslations("admin.templateEditor");
  const id = useId();
  const [values, setValues] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EditorPreview | null>(null);
  const [view, setView] = useState<"preview" | "final">("preview");
  const usable = fields.filter((f) => f.key);
  const groups = [
    ...sections.map((s) => ({ id: s.id, title: s.title || s.id, list: fieldsOf(usable, s.id) })),
    { id: "", title: t("nav.orphans"), list: orphanFields(usable, sections) },
  ].filter((g) => g.list.length);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const ok = await ensureSaved();
      if (!ok) {
        notify.warning(t("preview.saveFirst"), { id: "tpe-preview" });
        return;
      }
      setResult(await previewEditor(templateId, toAnswers(usable, values)));
    } catch (err) {
      notify.error(t("preview.error"), { id: "tpe-preview", error: err });
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string, v: string | boolean) => setValues((cur) => ({ ...cur, [k]: v }));

  function input(f: EditorField) {
    const fid = `${id}-${f.uid}`;
    const v = values[f.key];
    const str = typeof v === "string" ? v : "";
    if (f.type === "checkbox") {
      return (
        <label className="tpe-check" key={f.uid}>
          <input type="checkbox" checked={v === true} onChange={(e) => set(f.key, e.target.checked)} />
          <span>
            {f.label || f.key}
            {f.required ? " *" : ""}
          </span>
        </label>
      );
    }
    return (
      <div className="tpe-fld" key={f.uid}>
        <label htmlFor={fid} id={`${fid}l`}>
          {f.label || f.key}
          {f.required ? " *" : ""}
        </label>
        {f.type === "textarea" ? (
          <textarea id={fid} rows={3} value={str} onChange={(e) => set(f.key, e.target.value)} />
        ) : f.type === "select" ? (
          <Select value={str} onChange={(x) => set(f.key, x)} options={[{ value: "", label: t("preview.none") }, ...f.options.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label || o.value }))]} labelId={`${fid}l`} />
        ) : (
          <input
            id={fid}
            type={f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
            inputMode={f.type === "number" ? "decimal" : undefined}
            value={str}
            onChange={(e) => set(f.key, e.target.value)}
          />
        )}
        {f.helpText ? <p className="tpe-hint">{f.helpText}</p> : null}
      </div>
    );
  }

  const text = result ? (view === "final" ? result.finalText : result.previewText) : "";

  return (
    <Modal open={open} onClose={onClose} title={t("preview.title")} description={t("preview.lead")} size="xl" busy={busy}>
      <div className="tpe-prev">
        <form className="tpe-prev__form tpe-form" onSubmit={submit}>
          {!groups.length ? <p className="tpe-empty">{t("preview.noFields")}</p> : null}
          {groups.map((g) => (
            <fieldset className="tpe-prev__grp" key={g.id || "orphans"}>
              <legend>{g.title}</legend>
              {g.list.map(input)}
            </fieldset>
          ))}
          <div className="tpe-form__acts">
            <button type="submit" className={`btn btn--pri btn--sm${busy ? " is-busy" : ""}`} aria-disabled={busy || undefined}>
              <IconEye />
              {busy ? t("preview.loading") : t("preview.run")}
            </button>
            <button type="button" className="btn btn--line btn--sm" onClick={() => { setValues({}); setResult(null); }}>
              {t("preview.reset")}
            </button>
          </div>
        </form>
        <div className="tpe-prev__out" aria-live="polite">
          {result ? (
            <>
              <div className="tpe-prev__stats">
                {result.completion != null ? (
                  <div className="tpe-meter" role="img" aria-label={t("preview.completion", { n: result.completion })}>
                    <span style={{ width: `${Math.max(0, Math.min(100, result.completion))}%` }} />
                  </div>
                ) : null}
                {result.completion != null ? <b>{t("preview.completion", { n: result.completion })}</b> : null}
                <span className={`tpe-chip ${result.canGenerate ? "tpe-chip--ok" : "tpe-chip--warn"}`}>{result.canGenerate ? t("preview.canGenerate") : t("preview.cannotGenerate")}</span>
              </div>
              {result.missing.length ? (
                <div className="tpe-prev__miss">
                  <b>{t("preview.missing", { n: result.missing.length })}</b>
                  <ul>
                    {result.missing.map((m) => (
                      <li key={m.key || m.label}>
                        {m.label}
                        {m.key && m.key !== m.label ? <code>{m.key}</code> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="tpe-seg" role="tablist" aria-label={t("preview.title")}>
                <button type="button" role="tab" aria-selected={view === "preview"} className={view === "preview" ? "on" : ""} onClick={() => setView("preview")}>
                  {t("preview.previewText")}
                </button>
                <button type="button" role="tab" aria-selected={view === "final"} className={view === "final" ? "on" : ""} onClick={() => setView("final")}>
                  {t("preview.finalText")}
                </button>
              </div>
              <pre className="tpe-prev__text">{text || t("preview.emptyText")}</pre>
            </>
          ) : (
            <p className="tpe-empty">{t("preview.hint")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
