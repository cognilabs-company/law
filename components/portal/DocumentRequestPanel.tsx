"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getPlatformPolicies,
  updateDocumentAnswers,
  payDocumentRequest,
  getDocumentRequest,
  getDocumentUnlockPolicy,
  generateDocumentRequest,
  getDocumentRequestFile,
  requestDocumentLawyerReviewGated,
  listDocumentRequests,
  isDocPaymentSkipped,
  quoteDocReviewFee,
  DOC_PAYMENT_WAIT,
  DOC_PAYMENT_CANCELLED,
  type DocPaymentGate,
  type DocumentRequest,
  type PlatformPolicies,
  type TemplateQuestion,
  type ServiceDocumentFields,
} from "@/lib/services/backend";
import { ApiError, isProviderUnavailable, logApiError } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import { base64Blob, closeTab, extFromMime, mimeFromName, preopenTab, saveBlob, showBlob } from "@/lib/download";
import { normalizeAnswers } from "@/lib/docTemplate";
import ContractSign from "./ContractSign";
import DocumentRequestChat from "./DocumentRequestChat";
import DocFill, { loadDraft, clearDraft } from "./DocFill";
import DocTemplateViewer from "./DocTemplateViewer";
import DocTypePicker from "./DocTypePicker";
import Modal from "@/components/admin/Modal";
import { useResource, useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Notice } from "@/components/admin/AdminBits";
import { Link, useRouter } from "@/i18n/navigation";
import { IconDownload, IconExternal, IconCheck, IconClock, IconHeadset, IconCard, IconAlert, IconEdit } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

// ── The advocate-review payment gate ─────────────────────────────────
// LEXGO_FRONTEND_DOC_ANALYSIS_PAYMENT_GATE_2026-09-28.md: past the free
// allowance an advocate review is no longer free, and the request does NOT
// reach the advocates until the fee is approved — the backend opens a gate,
// sends the client an inline "To'landi / Bekor qilish" request over Telegram
// (MD step 4) and holds the work until one of them is pressed (steps 5-7).
//
// Three of the four endpoints that can open a gate are called from this file
// and from the two order forms beside it, so the pieces all three share live
// here: DocumentRequestPanel is the module both forms already import, and
// putting them in NewDocumentOrder (the other shared module of this trio)
// would close an import cycle.
//
// Verified against production 2026-09-29 on the test client: the gate has
// never fired on this account (0 of 114 document requests is in any of the
// gate statuses, 0 of 300 notifications names one), so everything below is
// read from the MD and rendered defensively — a deployment that opens no gate
// reaches none of it.
export const MAX_REVIEW_PAGES = 500;
// How many pages the review fee covers before the gate can open. Read from
// the live table rather than typed in: GET /platform/policies 2026-09-29 gives
// document_analysis.review_fee_ranges 1-10 / 11-20 / 21-30, so the first
// band's top page is the free allowance, and MD L182 ("Payment gate faqat
// page_count > 10 bo'lganda majburiy") agrees with it at today's values.
function includedPagesOf(p: PlatformPolicies | null): number {
  const rs = [...(p?.documentAnalysis.ranges || [])].sort((a, b) => a.minPages - b.minPages);
  return rs[0]?.maxPages || 10;
}

// The optional page count, asked for at the three call sites where a document
// the advocate will have to read actually exists.
//
// It is asked for, never computed: counting the pages of a PDF in the browser
// means parsing a page tree that every modern writer compresses into object
// streams, so a hand-rolled count is wrong exactly on the documents that are
// long enough to matter — and a wrong count here is a wrong fee. It is
// optional because MD L81-84 says review-existing lets the backend derive it
// from the file itself (PDF: the real count; DOCX/TXT: 2 500 characters per
// page), and because MD L130 makes an absent page_count mean "behave exactly
// as before": no gate, straight to the pool.
//
// One reading of the box, used by the field AND by every submit handler that
// has to decide whether to send the number — because the two did not agree.
// The box has refused anything above MAX_REVIEW_PAGES in red since it was
// written, while all three send handlers tested only
// `Number.isInteger(n) && n > 0`: a client who typed 9999 (the box accepts
// four digits) saw the range warning and the request still went out carrying
// 9999 pages, i.e. a fee computed from a page count the form had already
// called impossible. `bad` is what a press must stop on; `count` is what may
// be sent, and is undefined for an empty box — which MD L130 defines as
// "behave exactly as before": no gate, straight to the pool.
export function readDocPages(value: string): { bad: boolean; count?: number } {
  if (!value) return { bad: false };
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= MAX_REVIEW_PAGES ? { bad: false, count: n } : { bad: true };
}

export function DocPagesField({
  value,
  onChange,
  id,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  // Given by a form that needs to move focus here when a press was refused;
  // without one the field generates its own, as it always has.
  id?: string;
  // Set by the form when a press could not go through because of this box, so
  // the mark is the same whether the client typed the bad value or found out
  // about it by pressing send.
  invalid?: boolean;
}) {
  const t = useTranslations("portal.client.documents");
  const uid = useId();
  const inputId = id || `pg-${uid}`;
  const policies = useResourceOne(getPlatformPolicies, []).data;
  const { bad, count } = readDocPages(value);
  const ok = count !== undefined;
  const pages = count ?? 0;
  const shown = bad || !!invalid;
  const included = includedPagesOf(policies);
  // MD L121-127: the fee must be on screen BEFORE the send. quoteDocReviewFee
  // reads the same table the backend charges from, so the number here is the
  // number the Telegram message will carry — it is never the first time the
  // client sees the price.
  const quote = ok && policies ? quoteDocReviewFee(policies, pages) : null;
  const extra = Math.max(0, pages - included);
  return (
    <div className="pgask">
      <label className="pgask__l" htmlFor={inputId}>{t("pagesLabel")}</label>
      <input
        id={inputId}
        className={`pgask__n${shown ? " is-bad" : ""}`}
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_REVIEW_PAGES}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        placeholder={t("pagesPlaceholder")}
        aria-invalid={shown || undefined}
      />
      {/* This line is the field's hint AND its error, which is why a refused
          press adds no sentence of its own beside it: rendering a
          `cform__bad` paragraph here as well put the identical sentence on
          screen twice, 8px apart (seen on the live review box at 400px). It
          carries role="alert" only while it is the error, so the reason a
          press did nothing is announced and not merely coloured. */}
      <small className={`pgask__h${shown ? " pgask__h--bad" : ""}`} role={shown ? "alert" : undefined}>
        {shown ? t("pagesRange", { max: MAX_REVIEW_PAGES }) : t("pagesHint")}
      </small>
      {ok && quote && quote.amount ? (
        extra === 0 ? (
          <p className="pgask__free">{t("pagesFree", { n: included })}</p>
        ) : (
          <div className="pgquote">
            <div className="pgquote__r">
              <span>{t("quotePages", { n: pages })}</span>
              <b>{fmtUzs(quote.amount)} {t("som")}</b>
            </div>
            <div className="pgquote__r pgquote__r--sub">
              <span>{t("gateIncluded", { n: included })}</span>
              <span>{t("gateExtra", { n: extra })}</span>
            </div>
            <p className="pgquote__lead">{t("quoteLead")}</p>
          </div>
        )
      ) : null}
    </div>
  );
}

// What the gate answer said, shown wherever the client is waiting on it.
// MD L93-111 is the whole of what the frontend is ever told about a gate:
// amount, page_count / included_pages / extra_pages, and telegram_sent.
export function DocGateFacts({ gate, telegram = true }: { gate: DocPaymentGate; telegram?: boolean }) {
  const t = useTranslations("portal.client.documents");
  return (
    <>
      {gate.amount ? (
        <b className="pgate__amt">{fmtUzs(gate.amount)} {gate.currency && gate.currency !== "UZS" ? gate.currency : t("som")}</b>
      ) : null}
      <div className="pgate__meta">
        {gate.pageCount ? <span>{t("gatePages", { n: gate.pageCount })}</span> : null}
        {gate.includedPages ? <span>{t("gateIncluded", { n: gate.includedPages })}</span> : null}
        {gate.extraPages ? <span className="pgate__meta--x">{t("gateExtra", { n: gate.extraPages })}</span> : null}
      </div>
      {/* telegram_sent false means the client is waiting on an approval
          request that was never delivered — the one thing they cannot find
          out for themselves, and the one that makes the wait pointless.
          Off once the gate is closed: "press To'landi in Telegram" is
          instructions for a message that has already been answered. */}
      {telegram ? (
        <p className={`pgate__tg${gate.telegramSent ? "" : " pgate__tg--bad"}`}>
          {gate.telegramSent ? t("gateTelegramOk") : t("gateTelegramFail")}
        </p>
      ) : null}
    </>
  );
}

type Stage = "answers" | "pay" | "generating" | "lawyerReview" | "claimed" | "pending" | "payGate" | "payCancelled" | "done";

// Map a request's backend status to the modal stage. Shared by every entry
// point (standalone template list, service "Create document" button, and
// now the AI/lawyer-assist flows) so the pay/generate/download lifecycle
// behaves identically everywhere.
//
// LEXGO_FRONTEND_DOCUMENT_PAYMENT_SKIP_AND_LAWYER_INBOX_2026-09-22.md: the
// payment provider isn't really connected, so these requests are paid
// server-side automatically — isDocPaymentSkipped() must be checked BEFORE
// falling back to a payment screen, and "lawyer_review" (client's request
// sent to a lawyer, no file yet, nothing to pay) needs its own screen
// rather than either the generic pay-pending or "processing your payment"
// copy, which would be actively wrong here (there is no payment).
// The one control that turns the wait screen from a dead end back into a
// choice. The backend keeps the whole answer on the record — constructor_action
// says whether the client may still fill the document themselves, and
// prompt_required says whether to ask first — so this only has to carry the
// press somewhere useful. A caller with its own constructor route passes
// onOpenConstructor; everyone else lands on the documents list with ?doc=<id>,
// which already answers that parameter with the same two-button prompt.
// Whether this client has already been asked about THIS request. The backend
// sends prompt_required for the whole life of the hold, so without
// remembering the answer a client who chose "Yo'q, advokatni kutaman" would
// be asked again on every visit. Keyed by request id, in the same browser
// storage the draft already uses.
const ASK_KEY = "lexgo_doc_ctor_ask";
function alreadyAsked(id: string): boolean {
  if (typeof window === "undefined" || !id) return true;
  try { return localStorage.getItem(`${ASK_KEY}_${id}`) === "1"; } catch { return true; }
}
function markAsked(id: string): void {
  if (typeof window === "undefined" || !id) return;
  try { localStorage.setItem(`${ASK_KEY}_${id}`, "1"); } catch { /* private mode */ }
}

function ConstructorEscape({ req, onOpenConstructor }: { req: DocumentRequest; onOpenConstructor?: () => void }) {
  const t = useTranslations("portal.client.documents");
  const ca = req.constructorAction;
  if (!ca?.available) return null;
  const label = t("constructorContinue");
  if (onOpenConstructor) {
    return (
      <button type="button" className="btn btn--line btn--full" onClick={onOpenConstructor}>
        <IconEdit />
        {label}
      </button>
    );
  }
  return (
    <Link href={`/portal/client/documents?doc=${encodeURIComponent(req.id)}`} className="btn btn--line btn--full">
      <IconEdit />
      {label}
    </Link>
  );
}
function stageFor(r: DocumentRequest): Stage {
  if (r.status === "file_ready") return "done";
  if (!r.status || r.status === "questionnaire" || r.status === "draft") return "answers";
  // LEXGO_FRONTEND_DOC_ANALYSIS_PAYMENT_GATE_2026-09-28.md L112-117: an open
  // gate puts the document request in `payment_required` and the lawyer
  // request nested in it in `pending_payment` (DOC_PAYMENT_WAIT holds both,
  // because a panel can be handed either record). Neither is the ordinary
  // "your payment is being processed" wait below — no payment has been made
  // yet and none can be made here; the client is waiting on a Telegram
  // approval. Note this is NOT the constructor's own `payment_pending`
  // (2 live rows on the test account on 2026-09-29), which keeps falling
  // through to "pending" exactly as it did.
  if (DOC_PAYMENT_WAIT.has(r.status)) return "payGate";
  // MD L158-162: the fee was refused over Telegram, so both records end in
  // `payment_cancelled` and nothing was sent to anybody. Terminal — there is
  // nothing left to poll for.
  if (r.status === DOC_PAYMENT_CANCELLED) return "payCancelled";
  // MD L136-138: after the approval the document request becomes
  // `lawyer_review_requested` and the lawyer request `open_pool` — i.e. the
  // work has finally reached the advocates and the client is back on the
  // ordinary "waiting for somebody to claim it" screen. Without this line it
  // fell to the generic "pending" card, which talks about a payment being
  // processed and would be exactly wrong at the moment the payment cleared.
  if (r.status === "lawyer_review_requested") return "lawyerReview";
  // LEXGO_FRONTEND_DOCUMENT_CALLCENTER_EDITOR_FLOW.md: the call-center pool
  // flow splits the wait in two, and the client is told different things at
  // each point — "open_pool" is nobody-has-it-yet ("Callcenter advokat
  // kutilyapti", MD's client step 7), while "claimed"/"lawyer_review" means
  // an advocate took the work and is preparing the document (step 8, the
  // realtime `document_request.claimed` event). One shared "a human is on
  // this" screen would hide that transition entirely.
  if (r.status === "open_pool") return "lawyerReview";
  if (r.status === "claimed" || r.status === "lawyer_review") return "claimed";
  if (r.status === "awaiting_payment" && !isDocPaymentSkipped(r)) return "pay";
  if (r.status === "ready_to_generate" || isDocPaymentSkipped(r)) return "generating";
  return "pending";
}

// The generated file — PDF or DOCX, whichever the template produces — either
// opened in the pre-opened tab or saved straight to disk.
function deliverFile(blob: Blob, fileName: string, download: boolean, win: Window | null) {
  if (download) {
    closeTab(win);
    saveBlob(blob, fileName);
  } else {
    showBlob(blob, fileName, win);
  }
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// No browser has a native DOCX viewer — pointing a tab's location at a
// blob: URL of one just forces a save dialog despite the "open" intent,
// indistinguishable from a download to whoever clicked it. A PDF renders
// fine the same way, so only DOCX needs the inline-viewer detour.
function isDocxFile(blob: Blob, fileName: string): boolean {
  return blob.type === DOCX_MIME || /\.docx$/i.test(fileName);
}

// Older requests may still carry the file inline as base64.
const inlineBlob = (f: DocumentRequest["contractFile"]) => base64Blob(f?.fileBase64, f?.mimeType || mimeFromName(f?.fileName || ""));

const statusOf = (e: unknown) => (e instanceof ApiError ? e.status : 0);

// The full answers → live document → pay → generate → download lifecycle for
// one document request, as a self-contained panel — used by a catalog
// service that has a document_template_id (ServiceDocumentRequest).
function answersFrom(r: DocumentRequest): Record<string, string> {
  const saved: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.answers || {})) if (v != null && v !== "") saved[k] = String(v);
  return { ...saved, ...(loadDraft(r.id) || {}) };
}

export default function DocumentRequestPanel({
  initialReq,
  initialGate,
  fields,
  templateText,
  sourceFile,
  onBump,
  onStartNew,
  onRetry,
  lawyerHeldNote,
  onOpenConstructor,
}: {
  initialReq: DocumentRequest;
  // The payment gate as the POST that opened it described it — passed in by
  // whichever form sent the request. It cannot be re-read: verified against
  // production on 2026-09-29, GET /document-requests/{id} answers 26 fields
  // and not one of them is payment_gate, payment_required or page_count, and
  // the list rows are thinner still. So this is the only moment the gate's
  // amount and page breakdown exist on the client, and after a reload the
  // panel can only show the status without them.
  initialGate?: DocPaymentGate | null;
  // The template's own questions and text. The request normally echoes the
  // questions back, but only the template carries the document body the live
  // pane renders — without it there is nothing to fill in as you type.
  fields?: TemplateQuestion[];
  templateText?: string;
  // The template's own source DOCX (service-scoped flow only — the standalone
  // template list has no equivalent endpoint), so the client can look at the
  // blank template itself alongside the live filled-in preview.
  sourceFile?: ServiceDocumentFields | null;
  onBump?: () => void;
  // "Resume the existing request" (below) means a template you've already
  // finished once always reopens that same finished copy — good for not
  // re-charging a paid document, but it also means there was previously no
  // way to fill the same template again with different facts (a different
  // case, a different counterparty). This lets the "done" screen start over.
  onStartNew?: () => void;
  // Opens the constructor on a row an advocate is already holding. Optional:
  // a caller that has its own way in (ServiceDocumentRequest does) passes it,
  // and everyone else falls back to the documents list, which answers
  // ?doc=<id> with the same two-button prompt.
  onOpenConstructor?: () => void;
  // MD L167: after a refused fee the client "may" be offered a re-send. There
  // is no endpoint that restarts a cancelled payment, so the only honest
  // re-send is the form that sent it — the two order forms hand this in and
  // it takes the client back to their own filled-in form.
  onRetry?: () => void;
  // Non-empty when a request for this same document is already with an
  // advocate (ServiceDocumentRequest composes it). Both ways out of this
  // panel towards an advocate — the builder's "Advokatdan yordam" and the
  // finished document's "Advokat tekshiruviga yuborish" — then carry the
  // refusal instead, since the backend accepts duplicate rows happily.
  lawyerHeldNote?: string;
}) {
  const t = useTranslations("portal.client.documents");
  const tcommon = useTranslations("common");

  const [req, setReq] = useState(initialReq);
  const [answers, setAnswers] = useState<Record<string, string>>(() => answersFrom(initialReq));
  const [stage, setStage] = useState<Stage>(stageFor(initialReq));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  // The ask the product owner described: the moment the work reaches an
  // advocate, say so and offer the constructor anyway. Raised here rather
  // than in each of the three forms that mount this panel, so every one of
  // them gets it — and only once per request, see alreadyAsked above.
  const [askCtor, setAskCtor] = useState(false);
  const router = useRouter();
  const [pdfBusy, setPdfBusy] = useState(false);
  // MD §"Error states": 403 ("User bu requestga kira olmaydi") and 404
  // ("Request topilmadi") are terminal — there is nothing left to wait for,
  // so polling stops and the client is told, instead of a wait screen that
  // quietly retries for an hour.
  const [fatal, setFatal] = useState<"" | "noAccess" | "notFound">("");
  // lexgo_frontend_doc_chat_update.md §7: a document the client built
  // themselves can be handed to the same call-center pool for a lawyer to
  // check. Open the box, say what to look at, send.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNeed, setReviewNeed] = useState("");
  const [reviewType, setReviewType] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewSent, setReviewSent] = useState(false);
  // The page count the client typed for THIS review (empty = not known, not
  // sent), and what the answer to the send said.
  const [reviewPages, setReviewPages] = useState("");
  // Which control in the review box stopped the last press, "" when none did.
  // Same shape as DocumentLawyerAssist's `missing`: the send button is never
  // disabled for it, because a disabled button that is pressed answers
  // nothing at all — the press happens, this is set, and the offending
  // control is marked and focused.
  const [reviewMissing, setReviewMissing] = useState<"" | "pages">("");
  const [gate, setGate] = useState<DocPaymentGate | null>(initialGate ?? null);
  // Set from the answer's own `already_exists` (the constructor endpoint can
  // refuse a repeat instead of gating it) so the refusal is shown in the
  // backend's own words rather than as "something went wrong".
  const [reviewRefused, setReviewRefused] = useState("");
  // Set instead of opening a tab whenever the generated file is a DOCX (see
  // deliver() inside getFile below) — DocTemplateViewer then renders it
  // inline the same way it already does for template previews.
  const [viewerFile, setViewerFile] = useState<{ blob: Blob; name: string } | null>(null);

  // Whichever field list is actually populated. The service-scoped create
  // relies on the backend echoing the questionnaire onto the request; the
  // template's own list is the fallback so an empty echo can never present
  // the client with a document that has nothing to fill in.
  const qs = useMemo(
    () => (req.questionnaire.length ? req.questionnaire : fields || []),
    [req.questionnaire, fields],
  );

  // Reset local state whenever a different request is opened — adjusted
  // during render (not an effect) so it lands before the first paint of the
  // new request instead of flashing the previous one's stage.
  const [prevReqId, setPrevReqId] = useState(initialReq.id);
  if (initialReq.id !== prevReqId) {
    setPrevReqId(initialReq.id);
    setReq(initialReq);
    setAnswers(answersFrom(initialReq));
    setStage(stageFor(initialReq));
    setNote(null);
    setFatal("");
    // A different request means a different gate — including none.
    setGate(initialGate ?? null);
    setReviewSent(false);
    setReviewRefused("");
    setReviewMissing("");
  }

  // 3 free downloads a month (S-35), for the pay-step reminder text.
  const reqs = useResource(listDocumentRequests, [req.status]);
  const policies = useResourceOne(getPlatformPolicies, []).data;
  const monthDownloads = useMemo(() => {
    const now = new Date();
    return reqs.data.filter((r) => r.status === "file_ready" && r.createdAt && new Date(r.createdAt).getMonth() === now.getMonth() && new Date(r.createdAt).getFullYear() === now.getFullYear()).length;
  }, [reqs.data]);

  const bump = () => onBump?.();

  async function saveAnswers() {
    if (busy) return;
    setBusy(true);
    try {
      // Canonical values, matching character for character what the live
      // document pane showed — the backend interpolates this straight into
      // the template, so anything else would generate a file that differs
      // from the preview the client just approved.
      const r = await updateDocumentAnswers(req.id, normalizeAnswers(qs, answers));
      clearDraft(req.id);
      setReq(r);
      // A backend echo that still looks like "answers" (e.g. a draft-ish
      // status) shouldn't bounce the client right back to the form they
      // just submitted — move forward regardless, to "generating" now that
      // payment is normally pre-confirmed, "pay" only in the rare case it
      // genuinely isn't.
      setStage(stageFor(r) === "answers" ? (isDocPaymentSkipped(r) ? "generating" : "pay") : stageFor(r));
      bump();
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  // Back from the checkout page may restore this page from the bfcache with the
  // button still busy (it stays busy while the browser navigates away).
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // One generate at a time. The poll below and the manual "check status"
  // button both run unlock(), and POST …/generate is not idempotent — two
  // overlapping calls would build the document twice for one payment.
  const generating = useRef(false);

  // Payment confirmed (unlock-policy) → build the PDF (POST …/generate).
  async function unlock(r: DocumentRequest): Promise<DocumentRequest | null> {
    if (r.status === "file_ready") return r;
    // Claimed before the first await, not after it: the poll and the manual
    // "check status" button can both be inside the unlock-policy request at
    // the same moment, and both would then pass a check made after it.
    if (generating.current) return null;
    generating.current = true;
    try {
      const policy = await getDocumentUnlockPolicy(r.id);
      if (!policy.canGenerate) return null;
      return await generateDocumentRequest(r.id);
    } catch (e) {
      if (statusOf(e) === 402) return null; // payment not settled yet
      throw e;
    } finally {
      generating.current = false;
    }
  }

  async function pay() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    let leaving = false;
    try {
      let r = await payDocumentRequest(req.id, "payme", req.price);
      if (r.paymentUrl) {
        leaving = true;
        window.location.assign(r.paymentUrl);
        return;
      }
      r = (await unlock(r).catch(() => null)) ?? r;
      setReq(r);
      setStage(r.status === "file_ready" ? "done" : "pending");
      bump();
    } catch (e) {
      setNote({ ok: false, msg: isProviderUnavailable(e) ? tcommon("paymentUnavailable") : t("error") });
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      let r = await getDocumentRequest(req.id);
      r = (await unlock(r)) ?? r;
      setReq(r);
      bump();
      if (r.status === "file_ready") {
        setStage("done");
        setNote({ ok: true, msg: t("readyToast") });
      } else {
        const next = stageFor(r);
        if (next !== stage) setStage(next);
        else if (stage === "pending" || stage === "generating") setNote({ ok: false, msg: t("stillPending") });
      }
    } catch (e) {
      const s = statusOf(e);
      if (s === 403 || s === 404) {
        setFatal(s === 403 ? "noAccess" : "notFound");
        setNote(null);
      } else {
        // MD: a 500 is "qisqa toast + console/network log saqlasin", not a
        // modal — the detail goes to the console for whoever debugs it.
        if (s >= 500) logApiError("document-request refresh", e);
        setNote({ ok: false, msg: t("error") });
      }
    } finally {
      setBusy(false);
    }
  }

  // Poll so the file is generated and opens automatically once it's ready —
  // "generating" (payment pre-confirmed, just needs the backend to build the
  // file), "lawyerReview" (waiting on a person, not a payment), and the
  // generic "pending" fallback all resolve the same way: keep re-fetching
  // the request until status flips to file_ready. First check right away.
  // LEXGO_FRONTEND_DOCUMENT_CALLCENTER_EDITOR_FLOW.md: lawyerReview/claimed
  // cover the call-center pool flow — an advocate claiming the request,
  // meeting the client and preparing the document can easily run well past
  // the original ~10-minute budget (calibrated for the backend just
  // generating a file), so they wait longer and check less often instead of
  // showing "stillPending" while a real consultation is still in progress.
  // generating/pending keep the original tight budget — those really should
  // resolve in seconds. The socket below is the fast path; this poll is the
  // safety net for a dropped connection.
  // The gate joins the human-paced waits: MD step 4-6 has a person opening
  // Telegram and pressing a button, which is an hour-scale wait, not the
  // seconds a file generation takes. "payCancelled" is deliberately absent —
  // it is terminal (MD L158-162), so polling it would be polling forever.
  const humanWait = stage === "lawyerReview" || stage === "claimed" || stage === "payGate";
  const pendingId = !fatal && (stage === "pending" || stage === "generating" || humanWait) ? req.id : undefined;
  useEffect(() => {
    if (!pendingId) return;
    let alive = true;
    let running = false;
    let stopped = false;
    // Held in an object so stop() can clear an interval created further down
    // (a terminal 403/404 can land before the interval is even started).
    const h: { timer?: ReturnType<typeof setInterval> } = {};
    const stop = () => {
      stopped = true;
      if (h.timer) clearInterval(h.timer);
    };
    const intervalMs = humanWait ? 15000 : 4000;
    let left = humanWait ? 240 : 150; // human wait: 240×15s = 1h; others: 150×4s ≈ 10min
    const tick = async () => {
      if (running || stopped) return;
      running = true;
      try {
        const cur = await getDocumentRequest(pendingId);
        const r = (await unlock(cur)) ?? cur;
        if (!alive) return;
        setReq(r);
        if (r.status === "file_ready") {
          setStage("done");
          // MD §"Client tayyor file ko'rishi": "Hujjatingiz tayyor. Yuklab
          // olishingiz mumkin." — said right where the client was waiting.
          setNote({ ok: true, msg: t("readyToast") });
          bump();
        } else {
          // open_pool → claimed mid-wait moves the screen forward, and so do
          // both ways out of the payment gate: payment_required →
          // lawyer_review_requested on a Telegram approval (MD L136-138), or
          // → payment_cancelled on a refusal (MD L158-162).
          const next = stageFor(r);
          if (next === "lawyerReview" || next === "claimed" || next === "payGate" || next === "payCancelled") setStage(next);
        }
      } catch (e) {
        const s = statusOf(e);
        if (s === 403 || s === 404) {
          if (alive) {
            setFatal(s === 403 ? "noAccess" : "notFound");
            setNote(null);
          }
          stop();
        } else if (s >= 500) {
          logApiError("document-request poll", e);
        }
      } finally {
        running = false;
      }
    };
    void tick();
    // MD §"Realtime": the client's own socket carries the state changes this
    // screen is waiting for — react the moment one lands instead of sitting
    // out the rest of a 15s interval.
    // LEXGO_FRONTEND_DOC_ANALYSIS_PAYMENT_GATE_2026-09-28.md L126 says the
    // client waits on this socket rather than polling, and L140-154 names the
    // two events the gate resolves with: `document_request.pool_created`
    // (backend side) and `document_request.sent` (the client's own). They are
    // added to the filter so the approval lands here the moment it happens.
    //
    // Unverified, and the poll above stays for it: neither name occurs in this
    // account's history — 300 notifications on 2026-09-29 carry 15 distinct
    // data.event values (document_lawyer_request_sent/claimed/ready,
    // document_request_created/file_ready/meeting_created, the urgent_advokat
    // family…) and none of them is a gate event, under either spelling. So the
    // 15-second poll and the "Holatni tekshirish" button are what actually
    // move this screen today; these two names are a hope, not a measurement.
    const unsub = subscribeUserEvents((ev) => {
      if (!/^document_request\.(ready|claimed|completed|meeting_created|editor_saved|sent|pool_created|payment_cancelled)$/.test(ev.event)) return;
      const nested = ev.request && typeof ev.request === "object" ? (ev.request as Record<string, unknown>) : null;
      const id = String(ev.request_id ?? ev.document_request_id ?? nested?.id ?? "");
      if (id && id !== pendingId) return;
      if (ev.event === "document_request.meeting_created") setNote({ ok: true, msg: t("meetingStarted") });
      void tick();
    });
    // Give up after the budget rather than polling forever.
    h.timer = setInterval(() => {
      if (stopped) return;
      if (left-- > 0) {
        void tick();
        return;
      }
      stop();
      if (alive) setNote({ ok: false, msg: t("stillPending") });
    }, intervalMs);
    return () => {
      alive = false;
      stop();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId, humanWait]);

  // The document itself should be visible the moment it's ready, not only
  // after an extra "Ochish" click — fetch it once and show it inline.
  // A request that HAS questions but no answers was generated blank; one with
  // no questions at all is simply a fixed-text document and not stale.
  const isStale =
    stage === "done" && qs.length > 0 && !Object.values(req.answers || {}).some((v) => v != null && String(v).trim() !== "");

  // GET …/file returns the generated file itself — PDF or DOCX, whichever the
  // template produces; never assume one. 409 = not generated yet → generate
  // once and retry; 402 = unpaid → back to the pay step.
  async function getFile(download: boolean) {
    if (pdfBusy) return;
    const win = download ? null : preopenTab();
    setPdfBusy(true);
    setNote(null);
    function deliver(blob: Blob, name: string) {
      if (!download && isDocxFile(blob, name)) {
        closeTab(win);
        setViewerFile({ blob, name });
        return;
      }
      deliverFile(blob, name, download, win);
    }
    try {
      let blob: Blob;
      try {
        blob = await getDocumentRequestFile(req.id);
      } catch (e) {
        if (statusOf(e) !== 409) throw e;
        setReq(await generateDocumentRequest(req.id));
        blob = await getDocumentRequestFile(req.id);
      }
      const name = req.contractFile?.fileName || `lexgo-${req.id}.${extFromMime(blob.type) || "pdf"}`;
      deliver(blob, name);
    } catch (e) {
      const inline = inlineBlob(req.contractFile);
      if (inline && statusOf(e) !== 402) {
        const name = req.contractFile?.fileName || `lexgo-${req.id}.${extFromMime(inline.type) || "pdf"}`;
        deliver(inline, name);
      } else {
        closeTab(win);
        if (statusOf(e) === 402) {
          setStage("pay");
          setNote({ ok: false, msg: t("payFirst") });
        } else {
          setNote({ ok: false, msg: t("fileError") });
        }
      }
    } finally {
      setPdfBusy(false);
    }
  }

  async function sendToLawyerReview() {
    if (reviewBusy || lawyerHeldNote) return;
    // The one control here that can refuse a press. "Nimani tekshirish
    // kerak?" deliberately cannot: it has a default sentence
    // (reviewNeedDefault) that is sent when the client leaves it alone, so an
    // empty box is a complete answer and gating it would invent a
    // requirement the backend does not have. A page count the field has
    // already painted red is different — left to itself the send would drop
    // it and quote the advocate a different document than the price on
    // screen was computed from, with nothing said to anybody.
    const { bad, count } = readDocPages(reviewPages);
    if (bad) {
      setReviewMissing("pages");
      document.getElementById("doc-review-pages")?.focus();
      return;
    }
    setReviewMissing("");
    setReviewBusy(true);
    setNote(null);
    try {
      // MD §3 (POST /document-requests/{id}/lawyer-review): page_count rides
      // along when the client typed one, and is simply absent when they did
      // not — which MD L130 defines as the old behaviour, straight to the
      // pool. The gated twin is used because the answer, not the request row,
      // is what says whether this reached the advocates at all.
      const r = await requestDocumentLawyerReviewGated(
        req.id,
        reviewNeed.trim() || t("reviewNeedDefault"),
        reviewType || undefined,
        count,
      );
      setReviewOpen(false);
      if (!r.canSendLawyerRequest || r.alreadyExists) {
        // Nothing new was created; say what the backend said.
        setReviewRefused(r.message || t("lawyerPendingLead"));
        return;
      }
      setGate(r.gate);
      setReviewSent(true);
      // MD L124 "Advokatga yuborildi deb ko'rsatmaydi": when the gate is open
      // the sentence under the finished document becomes the wait for the
      // fee instead of "sent to the advocates". `req` is deliberately NOT
      // replaced with the answer's row — this screen's download buttons are
      // keyed on the client's own finished document, and the answer's
      // `request` is the record the gate put in `payment_required`, which on
      // this endpoint may not be the same row at all. The wait is rendered
      // beside the document rather than instead of it; "Holatni tekshirish"
      // in that block re-reads the request, and if the backend really did
      // move THIS row into payment_required, stageFor takes the panel to the
      // full gate screen from there.
    } catch (e) {
      if (statusOf(e) >= 500) logApiError("document-request lawyer-review", e);
      setNote({ ok: false, msg: t("error") });
    } finally {
      setReviewBusy(false);
    }
  }

  // A terminal 403/404 replaces whatever screen was showing — there is no
  // stage left to render once the request is gone or off-limits.
  const shown: Stage | "" = fatal ? "" : stage;

  // A one-shot, and it has to be an effect: the decision reads localStorage
  // and writes it, which is a side effect and must not happen during render —
  // and the ref-during-render alternative trips react-hooks/refs. The rule is
  // disabled for this one setState rather than worked around, because the
  // guard above it means it can fire at most once per request id.
  useEffect(() => {
    const ca = req.constructorAction;
    if (!ca?.promptRequired || !ca.available) return;
    if (stage !== "lawyerReview" && stage !== "claimed") return;
    if (alreadyAsked(req.id)) return;
    markAsked(req.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAskCtor(true);
  }, [req.id, req.constructorAction, stage]);

  return (
    <div className={`cform${shown === "answers" ? " cform--doc" : ""}`} style={{ maxWidth: "none" }}>
      {fatal ? <Notice ok={false} msg={t(fatal)} /> : null}
      {shown === "answers" ? (
        <>
          <DocFill
            req={req}
            fields={qs}
            templateText={templateText || ""}
            sourceFile={sourceFile}
            answers={answers}
            onChange={setAnswers}
            onSubmit={saveAnswers}
            busy={busy}
            submitLabel={t("generate")}
            lawyerHeldNote={lawyerHeldNote}
          />
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        </>
      ) : null}

      {shown === "pay" ? (
        <>
          <div className="oprice">
            <span>{t("price")}</span>
            <b>{req.price ? `${som(req.price)} ${t("som")}` : t("free")}</b>
          </div>
          <p className="advmuted">{t("payLead")}</p>
          <p className="dwiz__policy">{t("downloadPolicy", { n: monthDownloads, limit: 3 })}</p>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--grad btn--full btn--lg" type="button" onClick={pay} disabled={busy}>
            {busy ? t("processingShort") : t("pay")}
          </button>
          <button className="rf__link rf__link--muted" type="button" onClick={refresh} disabled={busy}>
            {t("checkStatus")}
          </button>
          {qs.length ? (
            <button className="rf__link" type="button" onClick={() => setStage("answers")} disabled={busy}>
              {t("backToAnswers")}
            </button>
          ) : null}
        </>
      ) : null}

      {/* The only wait on this panel where a machine is actually producing a
          file, so it is the only one that gets the sheet-stream loader (wp-
          fileloader). It takes the place of the static sparkle chip rather
          than joining it — the chip occupied the same 56px box, so the card
          keeps its height — and the badge drops its pulsing dot, because two
          unsynchronised loops in one small card read as a fault rather than as
          progress. The sheets are decoration around a status the title, the
          sub-line and the badge already state, hence aria-hidden on them and
          role="status" on the block that carries the words. */}
      {shown === "generating" ? (
        <div className="docpend" role="status">
          <span className="docfly" aria-hidden="true">
            <i className="docfly__s" />
            <i className="docfly__s" />
            <i className="docfly__s" />
            <i className="docfly__s" />
          </span>
          <b>{t("generatingTitle")}</b>
          <span className="docpend__sub">{t("generatingSub")}</span>
          <span className="docpend__badge docpend__badge--ai">{t("generatingStatus")}</span>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--soft btn--full" type="button" onClick={refresh} disabled={busy}>
            {busy ? t("processingShort") : t("checkStatus")}
          </button>
        </div>
      ) : null}

      {/* A person, not a process: nobody has picked the request up yet, and
          that can take the better part of an hour. A "your document is being
          produced" stream would be a lie here, so this and the two waits below
          keep the quiet pulsing dot they already had. */}
      {shown === "lawyerReview" ? (
        <div className="docpend" role="status">
          <span className="docpend__ic docpend__ic--lawyer"><IconHeadset /></span>
          <b>{t("lawyerReviewTitle")}</b>
          <span className="docpend__sub">{t("lawyerReviewSub")}</span>
          <span className="docpend__badge">
            <span className="docpend__dot" />
            {t("lawyerReviewStatus")}
          </span>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--soft btn--full" type="button" onClick={refresh} disabled={busy}>
            {busy ? t("processingShort") : t("checkStatus")}
          </button>
          {/* THE WAY OUT.
              Until now these two wait cards offered "Holatni tekshirish" and
              nothing else, so a client whose document had gone to an advocate
              was simply stuck: the constructor was unreachable and the screen
              never said why a second request was refused. Both facts were
              already on the record the backend sends — lawyer_request_block_reason
              and constructor_action — and normDocRequest was throwing them away.
              The reason is shown where the client is actually stuck, and when the
              backend says the constructor is still open, so is the door to it. */}
          {req.lawyerRequestBlockReason ? (
            <small className="docpend__why">{req.lawyerRequestBlockReason}</small>
          ) : null}
          {req.constructorAction?.available ? (
            <ConstructorEscape req={req} onOpenConstructor={onOpenConstructor} />
          ) : null}
        </div>
      ) : null}

      {/* MD client step 8-9: an advocate has taken the work. The client may
          now get a meeting invite from them, so this screen says so rather
          than repeating "waiting for someone to pick it up". */}
      {shown === "claimed" ? (
        <div className="docpend" role="status">
          <span className="docpend__ic docpend__ic--lawyer"><IconHeadset /></span>
          <b>{t("claimedTitle")}</b>
          <span className="docpend__sub">{t("claimedSub")}</span>
          <span className="docpend__badge">
            <span className="docpend__dot" />
            {t("claimedStatus")}
          </span>
          {req.assignedLawyerName ? <small className="advmuted">{t("assignedLawyer", { name: req.assignedLawyerName })}</small> : null}
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--soft btn--full" type="button" onClick={refresh} disabled={busy}>
            {busy ? t("processingShort") : t("checkStatus")}
          </button>
          {/* THE WAY OUT.
              Until now these two wait cards offered "Holatni tekshirish" and
              nothing else, so a client whose document had gone to an advocate
              was simply stuck: the constructor was unreachable and the screen
              never said why a second request was refused. Both facts were
              already on the record the backend sends — lawyer_request_block_reason
              and constructor_action — and normDocRequest was throwing them away.
              The reason is shown where the client is actually stuck, and when the
              backend says the constructor is still open, so is the door to it. */}
          {req.lawyerRequestBlockReason ? (
            <small className="docpend__why">{req.lawyerRequestBlockReason}</small>
          ) : null}
          {req.constructorAction?.available ? (
            <ConstructorEscape req={req} onOpenConstructor={onOpenConstructor} />
          ) : null}
        </div>
      ) : null}

      {/* MD L121-127. The one wait on this panel where nothing at all is
          happening yet: the request is NOT with the advocates, it is held
          until somebody presses "To'landi" in Telegram. Hence the lock, the
          amount, and the page breakdown that explains where the amount came
          from — and hence no "advokatlarga yuborildi" anywhere on it. */}
      {shown === "payGate" ? (
        <div className="docpend pgate" role="status">
          <span className="docpend__ic docpend__ic--pay"><IconCard /></span>
          <b>{t("gateTitle")}</b>
          <span className="docpend__sub">{t("gateSub")}</span>
          <span className="docpend__badge docpend__badge--pay">
            <span className="docpend__dot" />
            {t("gateStatus")}
          </span>
          {/* No GET returns a gate (production, 2026-09-29), so a panel that
              was reopened rather than handed the POST answer has the status
              and nothing else — say that, instead of showing a blank card or
              an amount that would be invented. */}
          {gate ? <DocGateFacts gate={gate} /> : <p className="pgate__none">{t("gateNoFacts")}</p>}
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--soft btn--full" type="button" onClick={refresh} disabled={busy}>
            {busy ? t("processingShort") : t("checkStatus")}
          </button>
          <small className="advmuted">{t("gateRefreshHint")}</small>
        </div>
      ) : null}

      {/* MD L156-167: "Bekor qilish" was pressed, the payment is `cancelled`
          and both records are `payment_cancelled`. Nothing is in flight, so
          this card has no pulse and no poll — only the fact and the way
          back. */}
      {shown === "payCancelled" ? (
        <div className="docpend pgate pgate--off">
          <span className="docpend__ic docpend__ic--off"><IconAlert /></span>
          <b>{t("cancelledTitle")}</b>
          <span className="docpend__sub">{t("cancelledSub")}</span>
          <span className="docpend__badge docpend__badge--off">{t("cancelledStatus")}</span>
          {gate ? <DocGateFacts gate={gate} telegram={false} /> : null}
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          {onRetry ? (
            <button className="btn btn--grad btn--full" type="button" onClick={onRetry}>
              {t("gateRetry")}
            </button>
          ) : null}
          <button className="btn btn--soft btn--full" type="button" onClick={refresh} disabled={busy}>
            {busy ? t("processingShort") : t("checkStatus")}
          </button>
        </div>
      ) : null}

      {shown === "pending" ? (
        <div className="docpend" role="status">
          <span className="docpend__ic"><IconClock /></span>
          <b>{t("pendingTitle")}</b>
          <span className="docpend__sub">{t("pendingSub")}</span>
          <span className="docpend__badge">
            <span className="docpend__dot" />
            {t("pendingStatus")}
          </span>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--soft btn--full" type="button" onClick={refresh} disabled={busy}>
            {busy ? t("processingShort") : t("checkStatus")}
          </button>
        </div>
      ) : null}

      {shown === "done" ? (
        <div className="docdone">
          {/* Reopening a request created before this template had any fields
              (or simply never filled in) shows the same blank contractFile it
              generated back then — nothing here re-checks that against the
              template's current fields. Flag it plainly instead of presenting
              an unfilled document as a finished result, and lead with "start
              over" rather than burying it under the download buttons. */}
          {isStale ? (
            <>
              <Notice ok={false} msg={t("staleNotice")} />
              {onStartNew ? (
                <button className="btn btn--pri btn--full" type="button" onClick={onStartNew}>
                  {t("startNew")}
                </button>
              ) : null}
            </>
          ) : null}
          <span className="docdone__i"><IconCheck /></span>
          <b>{t("ready")}</b>
          <span className="docdone__f">{req.contractFile?.fileName || t("fileGeneric")}</span>
          <div className="docdone__act">
            <button className="btn btn--pri" type="button" onClick={() => getFile(false)} disabled={pdfBusy}>
              <IconExternal />
              {t("open")}
            </button>
            <button className="btn btn--line" type="button" onClick={() => getFile(true)} disabled={pdfBusy}>
              <IconDownload />
              {pdfBusy ? t("fileLoading") : t("download")}
            </button>
          </div>
          <small className="advmuted">{t("keptInCabinet")}</small>
          {onStartNew && !isStale ? (
            <button className="rf__link" type="button" onClick={onStartNew}>
              {t("startNew")}
            </button>
          ) : null}
          {/* Hand this finished document to a call-center advocate to check
              — the same pool the from-scratch flows land in. */}
          {reviewRefused ? (
            <p className="dgate__note">{reviewRefused}</p>
          ) : reviewSent && gate ? (
            /* The gate is open: this document did NOT go to the advocates
               (MD L124), so the green "yuborildi" notice is replaced by the
               wait — with the amount, the page breakdown and whether the
               Telegram request was actually sent. */
            <div className="pgate pgate--inline">
              <b className="pgate__t">{t("gateTitle")}</b>
              <span className="pgate__sub">{t("gateSub")}</span>
              <DocGateFacts gate={gate} />
              <button className="btn btn--soft btn--sm" type="button" onClick={refresh} disabled={busy}>
                {busy ? t("processingShort") : t("checkStatus")}
              </button>
            </div>
          ) : reviewSent ? (
            <Notice ok msg={t("reviewSent")} />
          ) : reviewOpen ? (
            <div className="docreview">
              {/* GM 2026-09-29: "agar Hujjat turi mavjud bo'lsa, u hujjat
                  turi 1-chida turishi shart." Which kind of document this is
                  comes before what to look at inside it — it is also the
                  shortest answer on the form, and the advocate reads it first
                  when the request lands. It used to sit between the text box
                  and the page count. Degrading to absent costs nothing here:
                  DocTypePicker returns null on a backend that does not offer
                  the field, and .docreview is a flex column with a single 8px
                  gap, so the box closes up with no hole and no stranded
                  heading at the top — measured on the live panel 2026-09-29,
                  495px tall with the picker and 379px without it at 1440
                  (532 / 397 at 400), i.e. exactly the picker's own height
                  plus the one gap, with nothing left behind. */}
              <DocTypePicker flow="constructor_review" value={reviewType} onChange={setReviewType} />
              <label htmlFor="doc-review-need">{t("reviewNeedLabel")}</label>
              <textarea id="doc-review-need" rows={2} value={reviewNeed} onChange={(e) => setReviewNeed(e.target.value)} placeholder={t("reviewNeedDefault")} />
              {/* The price of the review, before the send. */}
              <DocPagesField
                id="doc-review-pages"
                value={reviewPages}
                onChange={(v) => { setReviewPages(v); setReviewMissing(""); }}
                invalid={reviewMissing === "pages"}
              />
              <div className="docreview__btns">
                <button className="btn btn--grad btn--sm" type="button" onClick={sendToLawyerReview} disabled={reviewBusy}>
                  {reviewBusy ? t("processingShort") : t("reviewSubmit")}
                </button>
                <button className="rf__link rf__link--muted" type="button" onClick={() => { setReviewOpen(false); setReviewMissing(""); }} disabled={reviewBusy}>
                  {t("reviewCancel")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button className="btn btn--line btn--sm" type="button" onClick={() => setReviewOpen(true)} disabled={!!lawyerHeldNote} title={lawyerHeldNote || undefined}>
                <IconHeadset />
                {t("reviewOpen")}
              </button>
              {lawyerHeldNote ? <p className="dgate__note">{lawyerHeldNote}</p> : null}
            </>
          )}
          <div className="docoffer">
            <b>{t("offerTitle")}</b>
            <span>{t("offerLead")}</span>
            <div className="docoffer__btns">
              <Link href={`/portal/client/doc-analysis?request=${encodeURIComponent(req.id)}`} className="btn btn--pri btn--sm">{t("offerReview", { price: fmtUzs(policies?.documentAnalysis.ranges[0]?.amount || 149000) })}</Link>
              <Link href="/portal/client/services?q=shablon" className="btn btn--line btn--sm">{t("offerHelp", { price: fmtUzs(399000) })}</Link>
            </div>
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          {/* T1-13: the generated document is a contract to sign with a Telegram code. */}
          {req.contractId ? <ContractSign contractId={req.contractId} /> : null}
        </div>
      ) : null}
      {/* One stable slot, outside every stage block: a live advocate call
          must survive the request flipping from "claimed" to "done". */}
      {shown === "claimed" || shown === "done" ? <DocumentRequestChat requestId={req.id} /> : null}

      <DocTemplateViewer
        open={!!viewerFile}
        onClose={() => setViewerFile(null)}
        title={viewerFile?.name || t("fileGeneric")}
        fetchBlob={viewerFile ? () => Promise.resolve(viewerFile.blob) : null}
        fileName={viewerFile?.name || t("fileGeneric")}
      />

      {/* "Ishingiz Navbatchi advokatga berildi — konstruktordan ham
          foydalanasizmi?" The backend writes both sentences itself
          (constructor_action.title / .message), so they are preferred over
          ours; ours are the fallback for a deployment that sends neither.
          "Yo'q" is not a refusal to record anywhere — the client simply waits
          for the advocate, and the wait card keeps the way in if they change
          their mind. */}
      <Modal open={askCtor} onClose={() => setAskCtor(false)} title={req.constructorAction?.title || t("ctorAskTitle")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p className="dexit__lead">
            <span className="dexit__i"><IconHeadset /></span>
            {req.constructorAction?.message || t("ctorAskLead")}
          </p>
          <div className="dexit__btns">
            <button type="button" className="btn btn--line btn--full" onClick={() => setAskCtor(false)}>
              {t("ctorAskWait")}
            </button>
            <button
              type="button"
              className="btn btn--grad btn--full"
              onClick={() => {
                setAskCtor(false);
                if (onOpenConstructor) onOpenConstructor();
                else router.push(`/portal/client/documents?doc=${encodeURIComponent(req.id)}`);
              }}
            >
              <IconEdit />
              {t("ctorAskOpen")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
