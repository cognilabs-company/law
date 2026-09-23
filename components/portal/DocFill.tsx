"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { previewDocumentRequest, getServiceTemplateSourceFile, requestServiceDocumentLawyer, type DocumentPreview, type DocumentRequest, type ServiceDocumentFields } from "@/lib/services/backend";
import { preopenTab, showBlob, saveBlob, closeTab } from "@/lib/download";
import { docxToTree } from "@/lib/docxParse";
import {
  MAX_DIGITS,
  fieldKind,
  filledCount,
  isFilled,
  isoDate,
  missingRequired,
  normalizeAnswers,
  parseTemplate,
  sanitizeInput,
  tokenCounts,
  tokenCountsTree,
  type DocField,
  type DocKind,
  type DocTree,
} from "@/lib/docTemplate";
import { humanizeSlug } from "@/lib/lawyers";
import { formatUzSubscriber, uzSubscriber } from "@/lib/phone";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import DocPaper from "./DocPaper";
import { Link } from "@/i18n/navigation";
import { IconCheck, IconFileText, IconHeadset, IconList } from "@/components/icons";

const DRAFT_KEY = (id: string) => `lexgo_doc_draft_${id}`;
export function loadDraft(id: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(id));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    // A key collision or a hand-edited value can leave anything here; only a
    // plain object of strings is a draft, everything else is discarded.
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Record<string, string> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === "string") out[k] = x;
    return out;
  } catch {
    return null;
  }
}
export function clearDraft(id: string) {
  try {
    localStorage.removeItem(DRAFT_KEY(id));
  } catch {
    /* ignore */
  }
}

// "Complete your document" — the LegalZoom builder, two panes on one page:
// every question in one list on the left, the document itself on the right,
// filling in as the client types.
//
// Deliberately not a step-by-step wizard: the backend sends no `step` on any
// field (checked across all 37 production templates), and these templates
// carry 20-37 fields each, so one-question-per-screen meant up to 37 screens
// with the document hidden behind them. One list also makes the "×2" badge
// meaningful — a single answer visibly fills several places at once.
export default function DocFill({
  req,
  fields,
  templateText,
  sourceFile,
  answers,
  onChange,
  onSubmit,
  busy,
  submitLabel,
}: {
  req: DocumentRequest;
  // The template's own field list, used when the request came back without
  // its questionnaire echoed back (the service-scoped create sends none).
  fields: DocField[];
  templateText: string;
  // The template's own blank source file (service-scoped documents only).
  sourceFile?: ServiceDocumentFields | null;
  answers: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onSubmit: () => void;
  busy: boolean;
  submitLabel: string;
}) {
  const t = useTranslations("portal.client.documents");
  const tf = useTranslations("portal.client.documents.fields");

  const segs = useMemo(() => parseTemplate(templateText || "", fields), [templateText, fields]);

  // The document pane renders the template's own real DOCX (justified body
  // text, the centered bold title, the header/signature block indented the
  // way the actual filing is) when one is available, read client-side
  // straight from the file's own XML — falling back to the flat template_text
  // rendering below while it loads, on failure, or when the service has no
  // source file at all (the standalone template-list flow, which has no
  // equivalent endpoint).
  const [tree, setTree] = useState<DocTree[] | null>(null);
  // Cleared during render (not inside the effect below) so a service switch
  // never shows the previous one's document for even one paint.
  const [prevSourceFile, setPrevSourceFile] = useState(sourceFile);
  if (sourceFile !== prevSourceFile) {
    setPrevSourceFile(sourceFile);
    setTree(null);
  }
  useEffect(() => {
    if (!sourceFile?.hasSourceFile) return;
    let alive = true;
    (async () => {
      try {
        const blob = await getServiceTemplateSourceFile(sourceFile.sourceFileUrl || sourceFile.sourceFileInlineUrl);
        const buf = await blob.arrayBuffer();
        const parsed = await docxToTree(buf, fields);
        if (alive && parsed.length) setTree(parsed);
      } catch {
        /* falls back to the plain-text rendering below */
      }
    })();
    return () => {
      alive = false;
    };
  }, [sourceFile, fields]);

  const counts = useMemo(() => (tree ? tokenCountsTree(tree) : tokenCounts(segs)), [tree, segs]);

  const [touched, setTouched] = useState(false);
  const [active, setActive] = useState("");
  // Bumped on every navigation to a document spot (a question focused or
  // jumped to) so DocPaper's arrival flash restarts even when it's a repeat
  // click on the field that's already active.
  const [navTick, setNavTick] = useState(0);
  const [tab, setTab] = useState<"form" | "doc">("form");
  const formPane = useRef<HTMLDivElement>(null);
  const inputs = useRef(new Map<string, HTMLElement>());

  // The template's own blank source file, alongside the live filled-in
  // preview — fetched through the authed proxy (never a plain link) and
  // either shown in a new tab or saved, same pattern as every other file
  // delivery in the app.
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceErr, setSourceErr] = useState(false);
  // LEXGO_CLEAN_TEMPLATE_DOWNLOAD_FRONTEND.md: what a user views/downloads
  // must never show {{field}}/{field} markers — clean-source-file (blanks
  // rendered as ________) is what these two show, not source-file. Falls
  // back to the marked-up source only for a service the backend hasn't
  // wired the clean file for yet, so this never regresses to a dead button.
  async function viewSource() {
    if (!sourceFile?.hasSourceFile || sourceBusy) return;
    setSourceErr(false);
    const win = preopenTab();
    setSourceBusy(true);
    try {
      const blob = await getServiceTemplateSourceFile(
        sourceFile.cleanSourceFileInlineUrl || sourceFile.cleanSourceFileUrl || sourceFile.sourceFileInlineUrl || sourceFile.sourceFileUrl,
      );
      showBlob(blob, sourceFile.sourceFileName || "template", win);
    } catch {
      closeTab(win);
      setSourceErr(true);
    } finally {
      setSourceBusy(false);
    }
  }
  async function downloadSource() {
    if (!sourceFile?.hasSourceFile || sourceBusy) return;
    setSourceErr(false);
    setSourceBusy(true);
    try {
      const blob = await getServiceTemplateSourceFile(
        sourceFile.cleanSourceFileUrl || sourceFile.cleanSourceFileInlineUrl || sourceFile.sourceFileUrl || sourceFile.sourceFileInlineUrl,
      );
      saveBlob(blob, sourceFile.sourceFileName || "template");
    } catch {
      setSourceErr(true);
    } finally {
      setSourceBusy(false);
    }
  }

  // LEXGO_SERVICE_DOCUMENT_ASSIST_FLOW_2026-09-22.md §4: no lawyer_user_id in
  // the request body means the backend auto-assigns it to a call-center
  // agent — this is the real "become a lead" action, not just a link to the
  // lawyer directory (what this button did before). Whatever's already
  // filled in comes along, so the agent isn't starting from zero.
  const locale = useLocale();
  const [askBusy, setAskBusy] = useState(false);
  const [askSent, setAskSent] = useState(false);
  const [askErr, setAskErr] = useState(false);
  async function askLawyer() {
    if (askBusy || askSent || !sourceFile?.lawyerFlow) return;
    setAskErr(false);
    setAskBusy(true);
    try {
      await requestServiceDocumentLawyer(sourceFile.lawyerFlow.requestUrl, {
        need: t("askLawyerNeed", { title: req.title || t("fillTitle") }),
        answers,
        language: locale,
      });
      setAskSent(true);
    } catch {
      setAskErr(true);
    } finally {
      setAskBusy(false);
    }
  }

  // Seed templates label a field with its own English code ("Principal"):
  // prefer our translation of the code, then a real label (multi-word or
  // non-ASCII), then a humanized code.
  const label = useCallback(
    (f: DocField) => {
      const key = (f.name || f.label || "").toLowerCase();
      if (tf.has(key)) return tf(key);
      if (f.label && (/\s/.test(f.label) || /[^\x20-\x7e]/.test(f.label) || f.label.toLowerCase() !== key)) return f.label;
      return humanizeSlug(f.label || f.name);
    },
    [tf],
  );
  const byName = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);
  const labelOf = useCallback(
    (name: string) => {
      const f = byName.get(name);
      return f ? label(f) : tf.has(name.toLowerCase()) ? tf(name.toLowerCase()) : humanizeSlug(name);
    },
    [byName, label, tf],
  );

  // What the document shows is exactly what gets PUT to …/answers, so the
  // pane is a true preview of the generated file, not a prettier one.
  const values = useMemo(() => normalizeAnswers(fields, answers), [fields, answers]);

  const total = fields.length;
  const done = useMemo(() => filledCount(fields, answers), [fields, answers]);
  const missing = useMemo(() => missingRequired(fields, answers), [fields, answers]);
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Persist the draft on every change so a reload resumes where they left off.
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY(req.id), JSON.stringify(answers));
    } catch {
      /* ignore */
    }
  }, [req.id, answers]);

  // The backend preview (POST …/preview) is only needed when there is no
  // template text to render locally — then its filled-in text is what the
  // document pane shows. With the template in hand (every production
  // template) the pane is rendered here, instantly, and the local required-
  // field check is authoritative, so calling it on every typing pause would
  // be dozens of requests per document for a result nothing reads.
  const needPreview = !templateText;
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!needPreview) return;
    let alive = true;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      previewDocumentRequest(req.id, normalizeAnswers(fields, answers))
        .then((p) => {
          // Ignore a slow response that a newer keystroke has superseded.
          if (alive && mine === seq.current) setPreview(p);
        })
        .catch(() => {});
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [needPreview, req.id, answers, fields]);

  // A requirement the backend knows about but the field list doesn't express.
  // Surfaced as a warning, never as a block: there is no input to fix it
  // with, so blocking on it would strand a client who has answered
  // everything they were asked.
  const serverMissing = useMemo(() => {
    if (!preview) return [] as string[];
    const known = new Set(fields.map((f) => f.name));
    return preview.missingRequiredFields.map((m) => m.key || m.name).filter((k) => k && !known.has(k));
  }, [preview, fields]);

  const blocked = missing.length > 0;

  const setVal = (f: DocField, v: string) => onChange({ ...answers, [f.name]: v });

  // Jump from a blank in the document to the question that fills it. On a
  // phone that also means switching tabs, and the form is still display:none
  // during this render — measuring or focusing now would silently do nothing
  // — so the move is deferred to the effect below, after the tab is shown.
  const jumpTo = useRef("");
  const [jumpTick, setJumpTick] = useState(0);
  const focusField = useCallback((name: string) => {
    setActive(name);
    setTab("form");
    jumpTo.current = name;
    setJumpTick((n) => n + 1);
  }, []);
  // Shared by the jump-from-document-blank effect below and by a field's own
  // onFocus (a plain tap into a row, no jump involved) — on a phone the
  // keyboard can cover the bottom third of the screen, and without this a
  // field near the end of a long list opens hidden behind it with no way to
  // scroll the (separately-scrolling) list up to reach it.
  const scrollIntoPane = useCallback((name: string) => {
    const el = inputs.current.get(name);
    const box = formPane.current;
    if (!el || !box) return;
    const er = el.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    if (er.top >= br.top + 16 && er.bottom <= br.bottom - 16) return;
    box.scrollTo({ top: box.scrollTop + (er.top - br.top) - br.height / 2 + er.height / 2, behavior: "smooth" });
  }, []);
  useEffect(() => {
    const name = jumpTo.current;
    jumpTo.current = "";
    if (!name) return;
    const el = inputs.current.get(name);
    if (!el) return;
    el.focus({ preventScroll: true });
    scrollIntoPane(name);
  }, [jumpTick, scrollIntoPane]);

  function submit() {
    setTouched(true);
    if (blocked) {
      const first = missing[0];
      if (first) focusField(first.name);
      return;
    }
    onSubmit();
  }

  // Honour an authored `step` as a section break when a template ever sends
  // one; otherwise it is one flat list, like the reference builder.
  const groups = useMemo(() => {
    if (!fields.some((f) => typeof f.step === "number")) return [fields];
    const m = new Map<number, DocField[]>();
    for (const f of fields) {
      const k = f.step ?? 1;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }, [fields]);

  return (
    <div className="docb">
      <div className="docb__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          id="docb-tab-form"
          aria-controls="docb-pane-form"
          aria-selected={tab === "form"}
          className={tab === "form" ? "on" : ""}
          onClick={() => setTab("form")}
        >
          <IconList />
          {t("tabForm")}
          {total ? <span className="docb__tabn">{done}/{total}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          id="docb-tab-doc"
          aria-controls="docb-pane-doc"
          aria-selected={tab === "doc"}
          className={tab === "doc" ? "on" : ""}
          onClick={() => setTab("doc")}
        >
          <IconFileText />
          {t("tabDoc")}
        </button>
      </div>

      <section
        id="docb-pane-form"
        role="tabpanel"
        aria-labelledby="docb-tab-form"
        className={`docfill${tab === "form" ? " on" : ""}`}
      >
        <header className="docfill__h">
          <div className="docfill__ht">
            <b>{t("fillTitle")}</b>
            <span className="docfill__n" aria-live="polite">
              {t("filledOf", { done, total })}
            </span>
          </div>
          <div className="docfill__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="docfill__lead">{t("fillLead")}</p>
          {sourceFile?.lawyerFlow ? (
            <button
              type="button"
              className={`docfill__ask${askSent ? " docfill__ask--sent" : ""}`}
              onClick={askLawyer}
              disabled={askBusy || askSent}
            >
              {askSent ? <IconCheck /> : <IconHeadset />}
              {askSent ? t("askLawyerSent") : askBusy ? t("askLawyerSending") : t("askLawyer")}
            </button>
          ) : (
            <Link href="/portal/client/lawyers" className="docfill__ask">
              <IconHeadset />
              {t("askLawyer")}
            </Link>
          )}
          {askErr ? <p className="svc__err">{t("askLawyerError")}</p> : null}
        </header>

        <div className="docfill__list" ref={formPane}>
          {total === 0 ? <p className="advmuted">{t("noFields")}</p> : null}
          {groups.map((g, gi) => (
            <div className="docfill__grp" key={gi}>
              {groups.length > 1 ? <h3 className="docfill__gt">{t("sectionN", { n: gi + 1 })}</h3> : null}
              {g.map((f) => (
                <Row
                  key={f.name}
                  f={f}
                  kind={fieldKind(f)}
                  label={label(f)}
                  count={counts[f.name] ?? 0}
                  value={answers[f.name] ?? ""}
                  shown={values[f.name] ?? ""}
                  active={active === f.name}
                  err={touched && !!f.required && !isFilled(fieldKind(f), answers[f.name])}
                  onVal={(v) => setVal(f, v)}
                  onFocus={() => {
                    setActive(f.name);
                    setNavTick((n) => n + 1);
                    // Deferred, not immediate: on a phone the virtual keyboard
                    // is still animating open at this point, so a scroll done
                    // now would aim at the pre-keyboard viewport and miss.
                    setTimeout(() => scrollIntoPane(f.name), 300);
                  }}
                  onBlur={() => setActive((a) => (a === f.name ? "" : a))}
                  onJump={() => {
                    setActive(f.name);
                    setNavTick((n) => n + 1);
                    setTab("doc");
                  }}
                  bind={(el) => {
                    if (el) inputs.current.set(f.name, el);
                    else inputs.current.delete(f.name);
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <footer className="docfill__f">
          <div className="docfill__st" role="status">
            {touched && blocked ? (
              <p className="docfill__miss">{t("missingN", { n: missing.length })}</p>
            ) : total > 0 && done === total ? (
              <p className="docfill__ok">
                <IconCheck />
                {t("allFilled")}
              </p>
            ) : total > 0 && !blocked ? (
              // All required answers are in but some optional fields are
              // still blank — say so, or an enabled button next to a
              // part-full progress bar reads as a mistake.
              <p className="docfill__ok">
                <IconCheck />
                {t("requiredDone", { n: total - done })}
              </p>
            ) : null}
            {serverMissing.length ? <p className="docfill__warn">{t("missingServer")}</p> : null}
          </div>
          <button type="button" className="btn btn--grad btn--full btn--lg" onClick={submit} disabled={busy} aria-disabled={blocked}>
            {busy ? t("saving") : submitLabel}
          </button>
          <small className="docfill__auto">{t("wizAutosave")}</small>
        </footer>
      </section>

      <section
        id="docb-pane-doc"
        role="tabpanel"
        aria-labelledby="docb-tab-doc"
        className={`docb__pane${tab === "doc" ? " on" : ""}`}
      >
        <DocPaper
          segs={segs}
          tree={tree ?? undefined}
          values={values}
          labelOf={labelOf}
          active={active}
          navTick={navTick}
          onPick={focusField}
          fallbackText={preview?.previewText}
          sourceFileName={sourceFile?.sourceFileName}
          onViewSource={sourceFile?.hasSourceFile ? viewSource : undefined}
          onDownloadSource={sourceFile?.hasSourceFile ? downloadSource : undefined}
          sourceBusy={sourceBusy}
          sourceError={sourceErr}
        />
      </section>
    </div>
  );
}

// One question: the placeholder exactly as it reads in the document, how many
// places this one answer fills, the label, and the input.
function Row({
  f,
  kind,
  label,
  count,
  value,
  shown,
  active,
  err,
  onVal,
  onFocus,
  onBlur,
  onJump,
  bind,
}: {
  f: DocField;
  kind: DocKind;
  label: string;
  count: number;
  value: string;
  shown: string;
  active: boolean;
  err: boolean;
  onVal: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onJump: () => void;
  bind: (el: HTMLElement | null) => void;
}) {
  const t = useTranslations("portal.client.documents");
  const id = `df-${f.name}`;
  const filled = shown !== "";
  const ph = t("enterField", { label });
  // An authoring leftover — a placeholder that is just the field's own
  // {{mustache}} token — would read as a broken hint, so it is dropped.
  const hint = f.hint || (f.placeholder && !/^\{\{.*\}\}$/.test(f.placeholder) ? f.placeholder : "");

  const common = {
    id,
    placeholder: ph,
    onFocus,
    onBlur,
    "aria-invalid": err || undefined,
    "aria-describedby": err ? `${id}-e` : undefined,
  };

  return (
    <div className={`dfrow${active ? " on" : ""}${err ? " err" : ""}${filled ? " done" : ""}`}>
      <div className="dfrow__top">
        <button type="button" className="dfrow__tok" onClick={onJump} title={t("jumpToSpot")}>
          {filled ? <IconCheck /> : null}
          <span>[{label}]</span>
        </button>
        {count > 1 ? (
          <span className="dfrow__x" title={t("occursTimes", { n: count })}>
            ×{count}
          </span>
        ) : null}
      </div>
      <label className="dfrow__l" htmlFor={id}>
        {label}
        {f.required ? <i aria-hidden> *</i> : null}
      </label>

      {kind === "multiline" ? (
        <textarea
          {...common}
          ref={bind as (el: HTMLTextAreaElement | null) => void}
          rows={3}
          value={value}
          onChange={(e) => onVal(sanitizeInput(kind, e.target.value))}
        />
      ) : kind === "date" ? (
        // tabIndex so focusField() can actually move focus here when a blank
        // date is clicked in the document — .focus() on a plain div is a
        // no-op. The value is read back through isoDate because what gets
        // saved is the document's 21.09.2026 form, not an ISO string.
        <div className="dfrow__w" tabIndex={-1} ref={bind as (el: HTMLDivElement | null) => void} onFocus={onFocus} onBlur={onBlur}>
          <DatePicker value={isoDate(value)} onChange={onVal} placeholder={ph} ariaLabel={label} clearLabel={t("clear")} />
        </div>
      ) : kind === "select" ? (
        <div className="dfrow__w" tabIndex={-1} ref={bind as (el: HTMLDivElement | null) => void} onFocus={onFocus} onBlur={onBlur}>
          <Select
            value={value}
            onChange={onVal}
            options={(f.options || []).map((o) => ({ value: o, label: o }))}
            ariaLabel={label}
            placeholder={ph}
          />
        </div>
      ) : kind === "phone" ? (
        <div className="phonf">
          <span className="phonf__cc">+998</span>
          <input
            {...common}
            ref={bind as (el: HTMLInputElement | null) => void}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="90 123 45 67"
            value={formatUzSubscriber(value)}
            // Stored as the full readable number the document will show; an
            // empty field must stay empty rather than become a bare "+998".
            onChange={(e) => {
              const d = uzSubscriber(e.target.value);
              onVal(d ? `+998 ${formatUzSubscriber(d)}` : "");
            }}
          />
        </div>
      ) : (
        <input
          {...common}
          ref={bind as (el: HTMLInputElement | null) => void}
          type={kind === "email" ? "email" : "text"}
          inputMode={kind === "money" || kind === "number" || kind === "pinfl" || kind === "inn" ? "numeric" : kind === "email" ? "email" : undefined}
          autoComplete={kind === "email" ? "email" : undefined}
          maxLength={MAX_DIGITS[kind]}
          value={value}
          onChange={(e) => onVal(sanitizeInput(kind, e.target.value))}
        />
      )}

      {err ? (
        <small className="dfrow__e" id={`${id}-e`}>
          {t("wizRequired")}
        </small>
      ) : kind === "money" && shown ? (
        <small className="dfrow__hint">
          {shown} {t("som")}
        </small>
      ) : hint ? (
        <small className="dfrow__hint">{hint}</small>
      ) : null}
    </div>
  );
}
