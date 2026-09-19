"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { previewDocumentRequest, type DocumentPreview, type DocumentRequest } from "@/lib/services/backend";
import { humanizeSlug } from "@/lib/lawyers";
import { IconChevronLeft, IconChevronRight, IconCheck } from "@/components/icons";

type Field = DocumentRequest["questionnaire"][number] & { type?: string; step?: number; placeholder?: string; hint?: string };

// Field kind from an explicit `type` or the field code (T1-14 schema: text /
// multiline / number / money / date / phone / pinfl / inn / select).
function kindOf(f: Field): "text" | "multiline" | "number" | "money" | "date" | "phone" | "pinfl" | "inn" {
  const t = (f.type || "").toLowerCase();
  if (["multiline", "textarea", "long"].includes(t)) return "multiline";
  if (["number", "int"].includes(t)) return "number";
  if (["money", "amount", "sum"].includes(t)) return "money";
  if (t === "date") return "date";
  if (["phone", "tel"].includes(t)) return "phone";
  if (["pinfl", "jshshir"].includes(t)) return "pinfl";
  if (["inn", "stir"].includes(t)) return "inn";
  // An explicit "text" (or an unstyled "select"/"checkbox", not yet its own
  // widget) means exactly that — don't let the name heuristics below
  // second-guess it into a native <input type=date> etc. A backend-declared
  // "contract_date" of type text is a free-text string, not an ISO date the
  // browser's date picker would silently blank out on any other format.
  if (t === "text" || t === "select" || t === "checkbox") return "text";
  // No explicit type at all — guess from the field's own name/code.
  const n = f.name.toLowerCase();
  if (/(_at|date|sana|_dob|birth)/.test(n)) return "date";
  if (/(phone|tel)/.test(n)) return "phone";
  if (/pinfl|jshshir/.test(n)) return "pinfl";
  if (/\b(inn|stir)\b/.test(n)) return "inn";
  if (/(amount|sum|price|salary|debt|narx|summa|haq)/.test(n)) return "money";
  if (/(claim|evidence|description|details|text|body|reason|facts|demand|note|address|manzil|content|subject)/.test(n)) return "multiline";
  return "text";
}
// LegalZoom-style preview: an unfilled field comes back from the backend as
// a bracketed label — "[Client full name]" — render that as a highlighted
// blank box (like the picture) rather than plain bracket text; everything
// else is just the document's own wording, already filled in for real.
function renderPreview(text: string) {
  return text.split(/(\[[^\]]+\])/g).map((part, i) =>
    part.startsWith("[") && part.endsWith("]") ? (
      <span key={i} className="dwprev__blank">{part.slice(1, -1)}</span>
    ) : (
      part
    ),
  );
}

const DRAFT_KEY = (id: string) => `lexgo_doc_draft_${id}`;
export function loadDraft(id: string): Record<string, string> | null {
  try { const raw = localStorage.getItem(DRAFT_KEY(id)); return raw ? (JSON.parse(raw) as Record<string, string>) : null; } catch { return null; }
}
export function clearDraft(id: string) { try { localStorage.removeItem(DRAFT_KEY(id)); } catch { /* ignore */ } }

// T1-14 questionnaire wizard: fields grouped into steps (by the schema's
// `step`, else 3–4 per step), progress, validation per step, draft saved in
// the browser after every keystroke so a half-filled form survives a reload
// and a "resume" opens where the client left off.
export default function DocWizard({ req, answers, onChange, onSubmit, busy, submitLabel }: {
  req: DocumentRequest;
  answers: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onSubmit: () => void;
  busy: boolean;
  submitLabel: string;
}) {
  const t = useTranslations("portal.client.documents");
  const tf = useTranslations("portal.client.documents.fields");
  const fields = req.questionnaire as Field[];
  const steps = useMemo(() => {
    const explicit = fields.some((f) => typeof f.step === "number");
    if (explicit) {
      const m = new Map<number, Field[]>();
      for (const f of fields) { const k = f.step ?? 1; if (!m.has(k)) m.set(k, []); m.get(k)!.push(f); }
      return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    }
    const per = fields.length <= 4 ? fields.length || 1 : fields.length <= 8 ? 3 : 4;
    const out: Field[][] = [];
    for (let i = 0; i < fields.length; i += per) out.push(fields.slice(i, i + per));
    return out.length ? out : [[]];
  }, [fields]);
  const [idx, setIdx] = useState(() => {
    // Resume at the first step with an empty required field.
    const d = loadDraft(req.id) || answers;
    const i = steps.findIndex((s) => s.some((f) => f.required && !(d[f.name] ?? "").trim()));
    return i < 0 ? 0 : i;
  });
  const [touched, setTouched] = useState(false);
  // Persist the draft on every change.
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY(req.id), JSON.stringify(answers)); } catch { /* ignore */ }
  }, [req.id, answers]);

  // Real-time preview (POST …/preview), debounced 400ms after the last
  // keystroke so it doesn't fire on every character.
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      previewDocumentRequest(req.id, answers)
        .then((p) => alive && setPreview(p))
        .catch(() => {});
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [req.id, answers]);

  const cur = steps[idx] ?? [];
  const missing = (s: Field[]) => s.filter((f) => f.required && !(answers[f.name] ?? "").trim());
  // Seed templates label fields with their English code ("Principal"): prefer our
  // translation of the code, then a real (multi-word / non-latin) label, then a humanized code.
  const label = (f: Field) => {
    const key = (f.name || f.label || "").toLowerCase();
    if (tf.has(key)) return tf(key);
    if (f.label && (/\s/.test(f.label) || /[^\x20-\x7e]/.test(f.label) || f.label.toLowerCase() !== key)) return f.label;
    return humanizeSlug(f.label || f.name);
  };
  const filled = fields.filter((f) => (answers[f.name] ?? "").trim()).length;
  // Backend-computed once the first preview lands; the local count covers the
  // instant before that (and if the endpoint is ever unavailable).
  const pct = preview ? preview.completionPercent : fields.length ? Math.round((filled / fields.length) * 100) : 0;
  const last = idx === steps.length - 1;

  function next() {
    setTouched(true);
    if (missing(cur).length) return;
    setTouched(false);
    if (last) onSubmit(); else setIdx((i) => i + 1);
  }
  const setVal = (name: string, v: string) => onChange({ ...answers, [name]: v });

  return (
    <div className="dwiz2col">
    <div className="dwiz">
      <div className="dwiz__top">
        <span className="dwiz__step">{t("wizStep", { n: idx + 1, total: steps.length })}</span>
        <span className="dwiz__pct">{t("wizFilled", { pct })}</span>
      </div>
      <div className="dwiz__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
      <ol className="dwiz__dots" aria-hidden>
        {steps.map((s, i) => (
          <li key={i} className={i < idx || (i === idx && !missing(s).length && filled > 0) ? "done" : i === idx ? "on" : ""} onClick={() => i < idx && setIdx(i)}>{i < idx ? <IconCheck /> : i + 1}</li>
        ))}
      </ol>
      <p className="advmuted">{t("answersLead")}</p>
      {cur.length === 0 ? <p className="advmuted">{t("noFields")}</p> : null}
      {cur.map((f) => {
        const k = kindOf(f);
        const v = answers[f.name] ?? "";
        const err = touched && f.required && !v.trim();
        // A template's placeholder is sometimes just its own {{mustache}} token
        // (authoring leftover) — showing that literally in the field would
        // read as a broken hint rather than an example value.
        const rawHint = f.placeholder && !/^\{\{.*\}\}$/.test(f.placeholder) ? f.placeholder : "";
        const common = { id: `dw-${f.name}`, value: v, "aria-invalid": err || undefined, placeholder: rawHint || (k === "date" ? "" : k === "phone" ? "+998 __ ___ __ __" : k === "pinfl" ? "14 raqam" : k === "inn" ? "9 raqam" : "") };
        return (
          <div key={f.name} className={`dwiz__f${err ? " err" : ""}`}>
            <label htmlFor={`dw-${f.name}`}>{label(f)}{f.required ? " *" : ""}</label>
            {k === "multiline" ? (
              <textarea {...common} rows={3} onChange={(e) => setVal(f.name, e.target.value)} />
            ) : (
              <input
                {...common}
                type={k === "date" ? "date" : k === "number" || k === "money" ? "text" : k === "phone" ? "tel" : "text"}
                inputMode={k === "number" || k === "money" || k === "pinfl" || k === "inn" ? "numeric" : k === "phone" ? "tel" : undefined}
                onChange={(e) => setVal(f.name, k === "money" || k === "number" || k === "pinfl" || k === "inn" ? e.target.value.replace(/[^\d\s]/g, "") : e.target.value)}
              />
            )}
            {k === "money" && v ? <small className="dwiz__hint">{Number(v.replace(/\s/g, "")).toLocaleString("ru-RU")} {t("som")}</small> : f.hint ? <small className="dwiz__hint">{f.hint}</small> : null}
            {err ? <small className="dwiz__err">{t("wizRequired")}</small> : null}
          </div>
        );
      })}
      <div className="dwiz__nav">
        <button type="button" className="btn btn--ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0 || busy}><IconChevronLeft />{t("wizBack")}</button>
        <button type="button" className="btn btn--pri" onClick={next} disabled={busy || (last && preview ? !preview.canGenerate : false)}>
          {busy ? t("saving") : last ? submitLabel : t("wizNext")}{last ? null : <IconChevronRight />}
        </button>
      </div>
      <small className="dwiz__auto">{t("wizAutosave")}</small>
    </div>
    {preview?.previewText ? (
      <aside className="dwprevpane">
        <div className="dwprev">
          <b>{t("previewTitle")}</b>
          <p>{renderPreview(preview.previewText)}</p>
        </div>
      </aside>
    ) : null}
    </div>
  );
}
