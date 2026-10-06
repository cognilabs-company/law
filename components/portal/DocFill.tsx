"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { previewDocumentRequest, getServiceTemplateSourceFile, requestServiceDocumentLawyerGated, type DocumentPreview, type DocumentRequest, type ServiceDocumentFields } from "@/lib/services/backend";
import { preopenTab, showBlob, saveBlob, closeTab } from "@/lib/download";
import { useIsFreeAiTier } from "@/lib/useAiTier";
import { docxToDoc, type DocPage } from "@/lib/docxParse";
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
import { fmtUzs } from "@/lib/money";
import { IconCheck, IconChevronLeft, IconClock, IconClose, IconFileText, IconHeadset, IconInfo, IconList, IconMenu } from "@/components/icons";
import InstructorButton from "@/components/guide/InstructorButton";
import { useAiReveal } from "@/lib/guide/targets";
import { aiId } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";

const AI_FIELD_TR: Record<string, string> = {
  "ў": "o", "ғ": "g", "қ": "q", "ҳ": "h", "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
  "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
  "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "s", "ч": "ch", "ш": "sh", "ъ": "", "ь": "", "э": "e",
  "ю": "yu", "я": "ya",
};

function aiFieldKey(name: string): string {
  let k = (name || "").trim();
  if (k.startsWith("{{")) k = k.slice(2);
  if (k.endsWith("}}")) k = k.slice(0, -2);
  k = k.trim();
  if (k.startsWith("{")) k = k.slice(1);
  if (k.endsWith("}")) k = k.slice(0, -1);
  k = k.trim().replace(/[.-]/g, "_").replace(/'/g, "");
  let out = "";
  for (const ch of k) {
    const low = ch.toLowerCase();
    out += low in AI_FIELD_TR ? AI_FIELD_TR[low] : ch;
  }
  return out.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function aiRowId(name: string): string {
  const key = aiFieldKey(name);
  return key ? aiId("documents.constructor.field", key) : "";
}

const AI_NO_FILL_KINDS: ReadonlySet<DocKind> = new Set<DocKind>(["phone", "email", "pinfl", "inn"]);
const AI_NO_FILL_NAME = /pass?port|паспорт|pinfl|jshshir|жшшир|karta|карта|card|parol|password/i;

function aiFillable(f: DocField, kind: DocKind): boolean {
  return !AI_NO_FILL_KINDS.has(kind) && !AI_NO_FILL_NAME.test(`${f.name} ${f.label}`);
}

function aiFieldValue(f: DocField, kind: DocKind, raw: string): string | null {
  const v = String(raw ?? "");
  if (kind === "date") {
    const iso = isoDate(v);
    if (!iso) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d ? iso : null;
  }
  if (kind === "select") {
    const want = v.trim().toLowerCase();
    if (!want) return "";
    return (f.options || []).find((o) => o.trim().toLowerCase() === want) ?? null;
  }
  return sanitizeInput(kind, v);
}

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
// Whether leaving would actually lose anything: a draft exists AND somebody
// has typed into it. The draft is written on every keystroke, so an untouched
// builder already has one — an empty `{}` — and presence alone is not the
// question. This is what decides whether the exit confirmation is raised at
// all: it is a warning about losing answers, so it has no business appearing
// on a screen that has none (the wait screen, the payment step, a finished
// document) or in a builder nobody has typed in yet.
export function hasDraftAnswers(id: string): boolean {
  if (!id) return false;
  const d = loadDraft(id);
  return !!d && Object.values(d).some((v) => v.trim() !== "");
}
export function clearDraft(id: string) {
  try {
    localStorage.removeItem(DRAFT_KEY(id));
  } catch {
    /* ignore */
  }
}

type DocT = (key: string, values?: Record<string, string | number | Date>) => string;
// The one sentence every advocate control shows once a request for this same
// document is already with an advocate, followed by whichever of the two
// facts the record actually carries (a list row has neither a work_id nor a
// detail fetch behind it). Composed in one place because four separate
// controls say it — the builder's three "Advokatdan yordam" buttons, the
// finished document's "Advokat tekshiruviga yuborish", and the chooser — and
// a client who meets two of them must not be told two different things.
export function lawyerPendingNote(t: DocT, statusText: string, workId: string): string {
  const facts: string[] = [];
  if (statusText) facts.push(t("lawyerPendingStatus", { status: statusText }));
  if (workId) facts.push(t("lawyerPendingWork", { id: workId }));
  const lead = t("lawyerPendingLead");
  return facts.length ? `${lead} ${facts.join(" · ")}` : lead;
}

// The page around the builder, when it is the full-page one: given, DocFill
// lays itself out as the advocate's document editor (DocumentEditorWorkspace)
// and owns the top bar — back, exit, generate — instead of sitting under the
// page's own. Not given (the catalog's modal), it keeps its two-pane layout.
export type DocChrome = { onBack: () => void; onExit: () => void };
export const DocChromeContext = createContext<DocChrome | null>(null);

// The form panel's draggable wall: the stored width is what the client chose,
// re-clamped against the window it is shown in. Never more than half the body,
// so the page always keeps the larger share.
const LEFT_MIN = 320;
const LEFT_MAX = 640;
const LEFT_DEF = 420;
const LEFT_KEY = "lexgo_dfws_leftw";
// Sections and details need less than the advocate's chat does.
const RIGHT_W = 300;
function clampLeftW(w: number, bodyW: number): number {
  const max = Math.max(LEFT_MIN, Math.min(LEFT_MAX, Math.round((bodyW || 0) * 0.5) || LEFT_MAX));
  return Math.round(Math.min(Math.max(Number.isFinite(w) ? w : LEFT_DEF, LEFT_MIN), max));
}
function storedLeftW(): number {
  if (typeof window === "undefined") return LEFT_DEF;
  try {
    const v = Number(localStorage.getItem(LEFT_KEY));
    return clampLeftW(v > 0 ? v : LEFT_DEF, window.innerWidth);
  } catch {
    return LEFT_DEF;
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
  lawyerHeldNote,
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
  // Non-empty when the client already has a request for this same document
  // with an advocate (lawyerPendingNote above). The "ask a lawyer" buttons
  // then stop being actions and carry this sentence instead — a second
  // request would just create a second row, which the backend does not
  // refuse on its own.
  lawyerHeldNote?: string;
}) {
  const t = useTranslations("portal.client.documents");
  const tf = useTranslations("portal.client.documents.fields");
  const tc = useTranslations("cta");

  const segs = useMemo(() => parseTemplate(templateText || "", fields), [templateText, fields]);

  // The document pane renders the template's own real DOCX (justified body
  // text, the centered bold title, the header/signature block indented the
  // way the actual filing is) when one is available, read client-side
  // straight from the file's own XML — falling back to the flat template_text
  // rendering below while it loads, on failure, or when the service has no
  // source file at all (the standalone template-list flow, which has no
  // equivalent endpoint).
  const [tree, setTree] = useState<DocTree[] | null>(null);
  const [page, setPage] = useState<DocPage | null>(null);
  // Cleared during render (not inside the effect below) so a service switch
  // never shows the previous one's document for even one paint.
  const [prevSourceFile, setPrevSourceFile] = useState(sourceFile);
  if (sourceFile !== prevSourceFile) {
    setPrevSourceFile(sourceFile);
    setTree(null);
    setPage(null);
  }
  //
  // The clean file comes first. The marked-up source-file is internal-only
  // now — the backend answers it with 403 for every client ("Original markerli
  // source fayl faqat ichki workflow uchun", every service checked) — and
  // asking for it first is exactly what sent every document to the flat text
  // fallback: no table, no right-hand addressee block, no centered title. The
  // clean file keeps the whole layout, and its `________ (label)` blanks
  // resolve to fields in docTemplate's TOKEN. The marked-up file stays as a
  // second try for a template whose clean copy binds no field at all.
  useEffect(() => {
    if (!sourceFile?.hasSourceFile) return;
    let alive = true;
    const urls = [
      sourceFile.cleanSourceFileUrl || sourceFile.cleanSourceFileInlineUrl,
      sourceFile.sourceFileUrl || sourceFile.sourceFileInlineUrl,
    ].filter(Boolean);
    (async () => {
      for (const url of urls) {
        try {
          const blob = await getServiceTemplateSourceFile(url);
          const parsed = await docxToDoc(await blob.arrayBuffer(), fields);
          if (!alive) return;
          // A layout nothing can be typed into is worse than the flat text
          // below, which at least fills in live.
          if (parsed.tree.length && (!fields.length || Object.keys(tokenCountsTree(parsed.tree)).length)) {
            setTree(parsed.tree);
            setPage(parsed.page);
            return;
          }
        } catch {
          /* next source, then the plain-text rendering below */
        }
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

  // Drag-resizable split between the form and the document (desktop only —
  // below 980px the two are tabs, not side by side, see .docb's own media
  // query). Persisted per browser so a client who prefers more document than
  // form (or the reverse) keeps that on their next visit; clamped well short
  // of 0/100 so neither pane can be dragged away entirely.
  const SPLIT_KEY = "lexgo_docb_split";
  const SPLIT_MIN = 26;
  const SPLIT_MAX = 62;
  const [splitPct, setSplitPct] = useState(() => {
    try {
      const v = Number(localStorage.getItem(SPLIT_KEY));
      return v >= SPLIT_MIN && v <= SPLIT_MAX ? v : 45;
    } catch {
      return 45;
    }
  });
  const docbRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const onResizerPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const onResizerPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!resizing.current || !docbRef.current) return;
    const rect = docbRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(pct))));
  }, []);
  const onResizerPointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!resizing.current) return;
    resizing.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setSplitPct((v) => {
      try {
        localStorage.setItem(SPLIT_KEY, String(v));
      } catch {
        /* ignore */
      }
      return v;
    });
  }, []);
  const onResizerKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setSplitPct((v) => {
      const next = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, v + (e.key === "ArrowLeft" ? -2 : 2)));
      try {
        localStorage.setItem(SPLIT_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // ── Workspace mode (ServiceDocumentPage, see DocChromeContext) ──────────
  // The advocate editor's own frame: the questions in a left panel the client
  // can collapse or widen, the page in the middle, sections and details in a
  // right panel. Same grid, same drag-wall behaviour and bounds logic as
  // DocumentEditorWorkspace, only with the wall on the left panel — here it is
  // the form, not the chat, that someone wants more or less of.
  const chrome = useContext(DocChromeContext);
  const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1101px)").matches;
  // Three columns and a readable page need room; below this the right panel
  // starts closed and is one click away in the top bar.
  const roomy = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1361px)").matches;
  const [leftOpen, setLeftOpen] = useState(true);
  useAiReveal("documents:fill-form", () => {
    setTab("form");
    setLeftOpen(true);
  });
  useAiReveal("documents:fill-preview", () => setTab("doc"));
  const [rightOpen, setRightOpen] = useState(roomy);
  const [rightTab, setRightTab] = useState<"sections" | "info">("sections");
  const revealForm = () => {
    setTab("form");
    setLeftOpen(true);
  };
  const revealSections = () => {
    setRightOpen(true);
    setRightTab("sections");
  };
  useAiReveal("documents.constructor.form", revealForm);
  useAiReveal("documents.constructor.generate", revealForm);
  useAiReveal("documents.constructor.preview", () => setTab("doc"));
  useAiReveal("documents.constructor.steps", revealSections);
  useAiReveal(/^documents\.constructor\.(field|step)\./, (id) => (id.endsWith(".nav") ? revealSections() : revealForm()));
  const [leftW, setLeftW] = useState(storedLeftW);
  const wsBody = useRef<HTMLDivElement>(null);
  const sizing = useRef(false);
  const [sizingOn, setSizingOn] = useState(false);
  const applyLeftW = useCallback((w: number) => {
    const v = clampLeftW(w, wsBody.current?.getBoundingClientRect().width ?? 0);
    setLeftW(v);
    try {
      localStorage.setItem(LEFT_KEY, String(v));
    } catch {
      /* private mode */
    }
  }, []);
  // Re-clamped from the STORED width on every resize, never from the current
  // one — otherwise a narrower window would ratchet the panel down for good.
  useEffect(() => {
    if (!chrome) return;
    const onResize = () => setLeftW(storedLeftW());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [chrome]);
  function onSizerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    sizing.current = true;
    setSizingOn(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onSizerMove(e: PointerEvent<HTMLDivElement>) {
    if (!sizing.current) return;
    const rect = wsBody.current?.getBoundingClientRect();
    if (rect) applyLeftW(e.clientX - rect.left);
  }
  function onSizerUp() {
    if (!sizing.current) return;
    sizing.current = false;
    setSizingOn(false);
  }
  function onSizerKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowRight") applyLeftW(leftW + step);
    else if (e.key === "ArrowLeft") applyLeftW(leftW - step);
    else if (e.key === "Home") applyLeftW(LEFT_MIN);
    else if (e.key === "End") applyLeftW(LEFT_MAX);
    else return;
    e.preventDefault();
  }

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
  // Only a Lite/Pro AI-tier client gets this: filling in is free, but a raw
  // copy of the template still costs a subscription (same rule the services
  // catalog's own download button uses — see lib/useAiTier.ts).
  const isFreeTier = useIsFreeAiTier();
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
  // LEXGO_FRONTEND_DOC_ANALYSIS_PAYMENT_GATE_2026-09-28.md L124: when the
  // backend opens a payment gate the request has NOT reached the advocates,
  // so the tick and "Advokatga yuborildi" must not appear. This button was
  // using the un-gated call and claimed success either way.
  const [askGated, setAskGated] = useState("");
  const [askErr, setAskErr] = useState(false);
  async function askLawyer() {
    // lawyerHeldNote disables every button that reaches here, so this guard
    // is for the paths a disabled attribute does not cover (a stale click
    // already in flight, a keyboard activation on the workspace's own
    // action row). Nothing downstream would stop the duplicate row.
    if (askBusy || askSent || lawyerHeldNote || !sourceFile?.lawyerFlow) return;
    setAskErr(false);
    setAskBusy(true);
    try {
      const r = await requestServiceDocumentLawyerGated(sourceFile.lawyerFlow.requestUrl, {
        need: t("askLawyerNeed", { title: req.title || t("fillTitle") }),
        answers,
        language: locale,
      });
      // Three outcomes and only one of them is "sent": the fee is waiting for
      // approval, the same document already has a live request, or it really
      // did go. The backend's own sentence is preferred when it sent one.
      if (r.paymentRequired) setAskGated(r.message || t("gateWaitShort"));
      else if (r.alreadyExists) setAskGated(r.message || t("askLawyerAlready"));
      else setAskSent(true);
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

  const liveAnswers = useRef(answers);
  const changeRef = useRef(onChange);
  useEffect(() => {
    liveAnswers.current = answers;
    changeRef.current = onChange;
  }, [answers, onChange]);
  const aiSetVal = useCallback((name: string, v: string) => {
    const next = { ...liveAnswers.current, [name]: v };
    liveAnswers.current = next;
    changeRef.current(next);
  }, []);

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

  // LEXGO_DOCUMENT_FIELD_SECTIONS_FRONTEND.md: document-fields now groups a
  // template's fields into real, titled sections ("Ариза реквизитлари",
  // "Даъвогар", …), in the backend's own order — the client never infers or
  // re-sorts this, it only matches each section's field names back onto the
  // `fields` this component already has (which may carry more/newer answer
  // state than sourceFile's own copy). Falls back to the old `step`-based
  // split, then a single flat list, for a service document-fields hasn't
  // been given sections for yet.
  const groups = useMemo(() => {
    const sections = sourceFile?.sections;
    if (sections?.length) {
      const byName = new Map(fields.map((f) => [f.name, f]));
      const used = new Set<string>();
      const out: { id: string; title: string; items: DocField[] }[] = [];
      for (const sec of sections) {
        const items = sec.fields.map((sf) => byName.get(sf.name)).filter((f): f is DocField => !!f);
        items.forEach((f) => used.add(f.name));
        if (items.length) out.push({ id: sec.id, title: sec.title || t("sectionN", { n: out.length + 1 }), items });
      }
      // A field the section list somehow missed still needs to be fillable —
      // trailing group rather than a silently dropped question.
      const leftover = fields.filter((f) => !used.has(f.name));
      if (leftover.length) out.push({ id: "", title: t("sectionN", { n: out.length + 1 }), items: leftover });
      if (out.length) return out;
    }
    if (!fields.some((f) => typeof f.step === "number")) return [{ id: "", title: "", items: fields }];
    const m = new Map<number, DocField[]>();
    for (const f of fields) {
      const k = f.step ?? 1;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    const stepped = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, items]) => items);
    return stepped.length > 1
      ? stepped.map((items, i) => ({ id: "", title: t("sectionN", { n: i + 1 }), items }))
      : [{ id: "", title: "", items: stepped[0] ?? [] }];
  }, [fields, sourceFile, t]);

  // ── Shared pieces: both layouts show the same form and the same page ──
  const tabs = (
    <div className={`docb__tabs${chrome ? " dfws__tabs" : ""}`} role="tablist">
      <button
        type="button"
        role="tab"
        id="docb-tab-form"
        aria-controls="docb-pane-form"
        aria-selected={tab === "form"}
        className={tab === "form" ? "on" : ""}
        onClick={() => setTab("form")}
        data-ai-id="documents.constructor.tab.form"
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
        data-ai-id="documents.constructor.tab.doc"
      >
        <IconFileText />
        {t("tabDoc")}
      </button>
    </div>
  );

  // In the workspace this is the constructor's one red, pulsing action (the
  // same #E5484D the two-pane layout's .docpaper__ask uses): the way out for a
  // client stuck on a form, so it has to be seen next to "Hujjatni yaratish".
  // Its own --help modifier keeps it off the advocate editor's .deditor__act.
  const askButton = sourceFile?.lawyerFlow ? (
    <button
      type="button"
      className={chrome ? `deditor__act deditor__act--help${askSent ? " deditor__act--helpSent" : ""}` : `docfill__ask${askSent ? " docfill__ask--sent" : ""}`}
      onClick={askLawyer}
      disabled={askBusy || askSent || !!lawyerHeldNote}
      title={lawyerHeldNote || (askSent ? t("askLawyerSent") : t("askLawyer"))}
      data-ai-id="documents.constructor.ask-lawyer"
    >
      {askSent ? <IconCheck /> : <IconHeadset />}
      <span className={chrome ? "deditor__actLabel" : undefined}>{askSent ? t("askLawyerSent") : askBusy ? t("askLawyerSending") : t("askLawyer")}</span>
    </button>
  ) : (
    <Link href="/portal/client/lawyers" className={chrome ? "deditor__act deditor__act--help" : "docfill__ask"} title={t("askLawyer")} data-ai-id="documents.constructor.ask-lawyer">
      <IconHeadset />
      <span className={chrome ? "deditor__actLabel" : undefined}>{t("askLawyer")}</span>
    </Link>
  );

  const formHead = (
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
      {/* The workspace carries this in its top bar, next to the other two
          actions, the way the advocate's "Uchrashuv boshlash" sits there. */}
      {chrome ? null : askButton}
      {askErr ? <p className="svc__err">{t("askLawyerError")}</p> : null}
      {askGated ? <p className="dgate__note">{askGated}</p> : null}
      {chrome || !lawyerHeldNote ? null : <p className="dgate__note">{lawyerHeldNote}</p>}
    </header>
  );

  const formList = (
    <div className="docfill__list" ref={formPane}>
      {total === 0 ? <p className="advmuted">{t("noFields")}</p> : null}
      {groups.map((g, gi) => (
        <div
          className="docfill__grp"
          key={gi}
          data-ai-id={g.id ? aiId("documents.constructor.step", g.id) : undefined}
          data-ai-type={g.id ? "section" : undefined}
          data-ai-label={g.id ? g.title : undefined}
          data-ai-private={g.id ? true : undefined}
        >
          {g.title ? <h3 className="docfill__gt">{g.title}</h3> : null}
          {g.items.map((f) => (
            <Row
              key={f.name}
              fieldAiId={aiRowId(f.name)}
              aiSet={(v) => aiSetVal(f.name, v)}
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
  );

  const submitButton = (
    <button type="button" className={`btn btn--grad btn--full btn--lg${chrome ? " dfws__submit" : ""}`} onClick={submit} disabled={busy} aria-disabled={blocked} data-ai-target="button:document-submit" data-ai-id="documents.constructor.generate">
      {busy ? t("saving") : submitLabel}
    </button>
  );

  const formFoot = (
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
      {/* In the workspace this is the phone/tablet copy only (CSS): on a
          desktop the same action is the top bar's primary button. */}
      {submitButton}
      <small className="docfill__auto">{t("wizAutosave")}</small>
    </footer>
  );

  const paper = (
    <DocPaper
      segs={segs}
      tree={tree ?? undefined}
      page={tree ? page ?? undefined : undefined}
      values={values}
      labelOf={labelOf}
      active={active}
      navTick={navTick}
      onPick={focusField}
      fallbackText={preview?.previewText}
      sourceFileName={sourceFile?.sourceFileName}
      onViewSource={sourceFile?.hasSourceFile ? viewSource : undefined}
      onDownloadSource={sourceFile?.hasSourceFile && !isFreeTier ? downloadSource : undefined}
      onAskLawyer={!chrome && sourceFile?.lawyerFlow ? askLawyer : undefined}
      askLawyerBusy={askBusy}
      askLawyerSent={askSent}
      askLawyerGated={askGated}
      askLawyerNote={lawyerHeldNote}
      sourceBusy={sourceBusy}
      sourceError={sourceErr}
    />
  );

  if (chrome) {
    const docTitle = req.title || sourceFile?.title || t("fillTitle");
    const requiredN = fields.filter((f) => f.required).length;
    const hasDraft = Object.values(answers).some((v) => typeof v === "string" && v.trim() !== "");
    const badge = !blocked ? "ready" : done ? "progress" : "new";
    // A section's row in the right panel sends the client to the first
    // question in it still waiting for an answer — or its first, once done.
    const goSection = (items: DocField[]) => {
      const target = items.find((f) => !isFilled(fieldKind(f), answers[f.name])) ?? items[0];
      if (!target) return;
      setLeftOpen(true);
      if (!wide()) setRightOpen(false);
      focusField(target.name);
    };
    return (
      <div
        className={`deditor deditor--fill${rightOpen ? "" : " deditor--rightClosed"}`}
        style={{ "--deditor-rw": `${RIGHT_W}px` } as CSSProperties}
      >
        <div className="deditor__top">
          <button type="button" className="deditor__back" onClick={chrome.onBack} data-ai-id="documents.constructor.back">
            <IconChevronLeft />
            {tc("back")}
          </button>
          <button
            type="button"
            className={`deditor__toggle deditor__toggle--left${leftOpen ? "" : " deditor__toggle--show"}`}
            onClick={() => setLeftOpen((v) => !v)}
            aria-label={t("wsTogglePanel")}
            aria-expanded={leftOpen}
          >
            <IconMenu />
          </button>
          <span className="deditor__ident">
            <b className="deditor__title" title={docTitle}>{docTitle}</b>
            <small className="deditor__sub">{t("filledOf", { done, total })}</small>
          </span>
          <span className="deditor__status">
            <span className={`deditor__badge deditor__badge--${badge}`}>{badge === "ready" ? t("wsBadgeReady") : t("wsBadgeDraft")}</span>
            {hasDraft ? (
              <span className="deditor__save deditor__save--saved" title={t("wizAutosave")}>
                <i aria-hidden />
                {t("wsDraftSaved")}
              </span>
            ) : null}
          </span>
          <span className="deditor__spacer" />
          {/* One group, right-aligned over the right panel — the same
              .deditor__actions the advocate's two actions sit in. */}
          <div className="deditor__actions">
            {askButton}
            <InstructorButton className="deditor__act deditor__act--ai" labelClassName="deditor__actLabel" size={18} />
            <button type="button" className="deditor__act" onClick={chrome.onExit} title={t("exit")} data-ai-id="documents.constructor.exit">
              <IconClose />
              <span className="deditor__actLabel">{t("exit")}</span>
            </button>
            <button type="button" className="deditor__act deditor__act--primary" onClick={submit} disabled={busy} aria-disabled={blocked} data-ai-target="button:document-submit" data-ai-id="documents.constructor.generate">
              <IconCheck />
              <span className="deditor__actLabel">{busy ? t("saving") : submitLabel}</span>
            </button>
          </div>
          <button
            type="button"
            className={`deditor__toggle${rightOpen ? "" : " deditor__toggle--show"}`}
            onClick={() => setRightOpen((v) => !v)}
            aria-label={t("wsTogglePanel")}
            aria-expanded={rightOpen}
          >
            <IconInfo />
          </button>
        </div>

        {/* Phone/tablet only (CSS): the form and the page take turns. */}
        {tabs}

        <div
          ref={wsBody}
          className={`deditor__body${leftOpen ? "" : " deditor__body--leftClosed"}${rightOpen ? "" : " deditor__body--rightClosed"}${sizingOn ? " deditor__body--sizing" : ""}`}
          style={leftOpen ? ({ "--deditor-lw": `${leftW}px` } as CSSProperties) : undefined}
        >
          <aside
            id="docb-pane-form"
            role="tabpanel"
            aria-labelledby="docb-tab-form"
            className={`deditor__left${leftOpen ? " on" : ""}${tab === "form" ? " is-tab" : ""}`}
            data-ai-target="documents:fill-form"
            data-ai-id="documents.constructor.form"
            data-ai-type="section"
            data-ai-label={t("tabForm")}
            data-ai-private
          >
            <button type="button" className="deditor__panelToggle" onClick={() => setLeftOpen(false)} aria-label={t("wsTogglePanel")}>
              <IconChevronLeft />
            </button>
            {formHead}
            {formList}
            {formFoot}
          </aside>

          {leftOpen ? (
            <div
              className="deditor__sizer deditor__sizer--left"
              role="separator"
              aria-orientation="vertical"
              aria-label={t("resizePanes")}
              aria-valuenow={leftW}
              aria-valuemin={LEFT_MIN}
              aria-valuemax={LEFT_MAX}
              tabIndex={0}
              onPointerDown={onSizerDown}
              onPointerMove={onSizerMove}
              onPointerUp={onSizerUp}
              onPointerCancel={onSizerUp}
              onLostPointerCapture={onSizerUp}
              onKeyDown={onSizerKey}
            >
              <span className="deditor__sizerGrip" aria-hidden />
            </div>
          ) : null}

          <main
            id="docb-pane-doc"
            role="tabpanel"
            aria-labelledby="docb-tab-doc"
            className={`deditor__main${tab === "doc" ? " is-tab" : ""}`}
            data-ai-target="documents:fill-preview"
            data-ai-id="documents.constructor.preview"
            data-ai-type="section"
            data-ai-label={t("tabDoc")}
            data-ai-private
          >
            {paper}
          </main>

          <aside className={`deditor__right${rightOpen ? " on" : ""}`}>
            <button
              type="button"
              className="deditor__panelToggle deditor__panelToggle--right"
              onClick={() => setRightOpen(false)}
              aria-label={t("wsTogglePanel")}
            >
              <IconChevronLeft />
            </button>
            <div className="deditor__tabs" role="tablist">
              {(["sections", "info"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={rightTab === k} className={rightTab === k ? "on" : ""} onClick={() => setRightTab(k)}>
                  {k === "sections" ? <IconList /> : <IconInfo />}
                  <span>{k === "sections" ? t("wsTabSections") : t("wsTabInfo")}</span>
                </button>
              ))}
            </div>
            <div className="deditor__tabBody">
              {rightTab === "sections" ? (
                <ul className="dfws__secs" data-ai-id="documents.constructor.steps" data-ai-type="list">
                  {groups.map((g, gi) => {
                    const n = g.items.length;
                    const d = g.items.filter((f) => isFilled(fieldKind(f), answers[f.name])).length;
                    const complete = n > 0 && d === n;
                    return (
                      <li key={gi}>
                        <button
                          type="button"
                          className={`dfws__sec${complete ? " done" : ""}`}
                          onClick={() => goSection(g.items)}
                          data-ai-id={g.id ? aiId("documents.constructor.step", g.id, "nav") : undefined}
                        >
                          <span className="dfws__secn" aria-hidden>{complete ? <IconCheck /> : gi + 1}</span>
                          <span className="dfws__sect">
                            <b>{g.title || t("wsAllFields")}</b>
                            <small>{t("wsSecCount", { done: d, total: n })}</small>
                          </span>
                          <span className="dfws__secbar" aria-hidden>
                            <i style={{ width: `${n ? Math.round((d / n) * 100) : 0}%` }} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="dpane">
                  <section className="dsec">
                    <div className="dmeta">
                      <span>{t("wsDocLabel")}</span>
                      <b>{docTitle}</b>
                    </div>
                    <div className="dmeta">
                      <span>{t("price")}</span>
                      <b>{req.price ? `${fmtUzs(req.price)} ${t("som")}` : t("free")}</b>
                    </div>
                    <div className="dmeta">
                      <span>{t("wsFieldsLabel")}</span>
                      <b>{t("wsFieldsValue", { total, required: requiredN })}</b>
                    </div>
                  </section>
                  <div className={`dstate${hasDraft ? " dstate--ok" : ""}`}>
                    <span className="dstate__i"><IconClock /></span>
                    <span className="dstate__t">
                      <b>{t("wsDraftSaved")}</b>
                      <small>{t("wizAutosave")}</small>
                    </span>
                  </div>
                  <div className="dstate">
                    <span className="dstate__i"><IconHeadset /></span>
                    <span className="dstate__t">
                      <b>{t("wsHelpTitle")}</b>
                      <small>{t("wsHelpLead")}</small>
                    </span>
                  </div>
                  {askButton}
                  {askErr ? <p className="svc__err">{t("askLawyerError")}</p> : null}
                  {askGated ? <p className="dgate__note">{askGated}</p> : null}
                  {lawyerHeldNote ? <p className="dgate__note">{lawyerHeldNote}</p> : null}
                </div>
              )}
            </div>
          </aside>

          {/* Phone/tablet only (CSS): tapping outside the details drawer
              closes it. The form is a tab there, never a drawer. */}
          {rightOpen ? <button type="button" className="deditor__scrim" aria-label={t("wsTogglePanel")} onClick={() => setRightOpen(false)} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="docb" ref={docbRef} style={{ "--docb-split": `${splitPct}%` } as CSSProperties}>
      {tabs}

      <section
        id="docb-pane-form"
        role="tabpanel"
        aria-labelledby="docb-tab-form"
        className={`docfill${tab === "form" ? " on" : ""}`}
        data-ai-target="documents:fill-form"
        data-ai-id="documents.constructor.form"
        data-ai-type="section"
        data-ai-label={t("tabForm")}
        data-ai-private
      >
        {formHead}
        {formList}
        {formFoot}
      </section>

      {/* Desktop-only (see .docb's media query) — drag left/right to
          reallocate space between the form and the document; hidden on the
          tabbed mobile layout, where there's nothing side by side to split. */}
      <div
        className="docb__resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("resizePanes")}
        tabIndex={0}
        onPointerDown={onResizerPointerDown}
        onPointerMove={onResizerPointerMove}
        onPointerUp={onResizerPointerUp}
        onPointerCancel={onResizerPointerUp}
        onKeyDown={onResizerKeyDown}
      />

      <section
        id="docb-pane-doc"
        role="tabpanel"
        aria-labelledby="docb-tab-doc"
        className={`docb__pane${tab === "doc" ? " on" : ""}`}
        data-ai-target="documents:fill-preview"
        data-ai-id="documents.constructor.preview"
        data-ai-type="section"
        data-ai-label={t("tabDoc")}
        data-ai-private
      >
        {paper}
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
  fieldAiId,
  aiSet,
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
  fieldAiId: string;
  aiSet: (v: string) => void;
}) {
  const t = useTranslations("portal.client.documents");
  useAiField(aiFillable(f, kind) ? fieldAiId : "", {
    get: () => value,
    set: (v) => {
      const next = aiFieldValue(f, kind, v);
      if (next !== null) aiSet(next);
    },
    sensitive: true,
    fillable: true,
  });
  const id = `df-${f.name}`;
  const filled = shown !== "";
  const ph = t("enterField", { label });
  // A real, backend-authored tooltip — never `f.placeholder`: for the
  // human-label-style import (docTemplate.ts's file header), a field's own
  // `placeholder` IS its label text verbatim (`{Label}`), so showing it here
  // duplicated the label a second time under the input for no reason. Also
  // guards the rare case `f.hint` itself just repeats the label.
  const hint = f.hint && f.hint.trim().toLowerCase() !== label.trim().toLowerCase() ? f.hint : "";

  const common = {
    id,
    placeholder: ph,
    "aria-label": label,
    onFocus,
    onBlur,
    "aria-invalid": err || undefined,
    "aria-describedby": err ? `${id}-e` : undefined,
  };

  return (
    <div
      className={`dfrow${active ? " on" : ""}${err ? " err" : ""}${filled ? " done" : ""}`}
      data-ai-id={fieldAiId || undefined}
      data-ai-type={kind === "multiline" ? "textarea" : kind === "select" ? "select" : "input"}
      data-ai-label={label}
      data-ai-private
    >
      {/* One label, doing double duty: click jumps to this field's spot in
          the document pane (same as the old separate [bracket] chip did),
          and its own check icon animates in once filled — no `<label
          htmlFor>` any more (no second, functionally-identical copy of the
          same text to have one), so the input gets its accessible name from
          aria-label instead. */}
      <button type="button" className="dfrow__l" onClick={onJump} title={t("jumpToSpot")}>
        <span className="dfrow__ltext">
          {label}
          {f.required ? <i aria-hidden> *</i> : null}
        </span>
        {count > 1 ? (
          <span className="dfrow__x" title={t("occursTimes", { n: count })}>
            ×{count}
          </span>
        ) : null}
        <span className="dfrow__done-ic" aria-hidden>
          <IconCheck />
        </span>
      </button>

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
