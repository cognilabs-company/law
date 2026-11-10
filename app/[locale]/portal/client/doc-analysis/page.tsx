"use client";

import "@/components/chat/aiPage1920.css";
import PlanGateCard from "@/components/ui/PlanGateCard";
import { docAccessGate, planGateOf, type PlanGate } from "@/lib/planGate";
import { useEffect, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Info } from "lucide-react";
import AiLabel from "@/components/ui/AiLabel";
import { useRouter } from "@/i18n/navigation";
import {
  analyzeDocument,
  analyzeDocumentFile,
  quoteDocumentAnalysis,
  requestExistingDocumentReviewGated,
  type DocAnalysis,
  type DocAnalysisQuote,
  type DocQuoteInput,
} from "@/lib/services/backend";
import { fmtUzs } from "@/lib/money";
import { acceptFor, docModeAccess, docRuntimeSettings, type DocAccess } from "@/lib/services/documentSettings";
import { ApiError, errDetail, logApiError } from "@/lib/http";
import { IconFileText, IconCheck, IconSparkle, IconShieldCheck, IconArrowRight } from "@/components/icons";
import CheckBox from "@/components/CheckBox";

const MAX_PAGES = 500;
// The backend counts one page per 2 500 characters of text.
const pagesFor = (text: string) => Math.min(MAX_PAGES, Math.max(1, Math.ceil(text.trim().length / 2500)));
// Backend default (quote.included_pages confirms it per request); used only
// for the hint shown before the first quote comes back.
const INCLUDED_PAGES = 10;
const keyOf = (o: DocQuoteInput) => `${o.pageCount}|${o.ocr}|${o.lawyerReview}|${o.urgent}|${Boolean(o.writtenOpinion)}`;
// Used until the runtime settings (GET /document-service-settings/runtime)
// arrive; those are what the checks below follow.
const MAX_FILE_MB = 20;
const FORMATS = ["pdf", "docx", "txt"];
// A black line drawing (public/img/xizmatlar), shown in a white circle.
const artStyle = (name: string) => ({ "--art": `url(/img/xizmatlar/${name}.webp)` }) as CSSProperties;

export default function ClientDocAnalysis() {
  const t = useTranslations("portal.client.docAnalysis");
  const tx = useTranslations("lxAi.doca");
  const tcommon = useTranslations("common");
  const router = useRouter();
  const [text, setText] = useState("");
  const [pagesInput, setPagesInput] = useState(""); // "" = counted from the text
  const [ocr, setOcr] = useState(false);
  const [lawyerReview, setLawyerReview] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [writtenOpinion, setWrittenOpinion] = useState(false);
  // A PDF/DOCX/TXT file analysed on the server instead of pasted text.
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState("");
  const [quote, setQuote] = useState<{ key: string; q: DocAnalysisQuote } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DocAnalysis | null>(null);
  const [gate, setGate] = useState<PlanGate | null>(null);
  const [failed, setFailed] = useState(false);
  // LEXGO_FRONTEND_DOC_ANALYSIS_PAYMENT_GATE_2026-09-28.md §Flow step 3:
  // "Mijoz 'Advokat tekshirsin' desa" — after the AI has read the document the
  // client must be able to hand THAT document to an advocate. The page had two
  // actions and neither did it: "upsellAdd" only re-quotes the analysis with
  // the lawyer-review line ticked, and "upsellLawyers" walks off to the
  // advocate directory, where the document does not follow. This sends the
  // very file that was analysed, with the page count the analysis measured.
  const [handOff, setHandOff] = useState<"" | "busy" | "sent" | "failed">("");
  const [handOffNote, setHandOffNote] = useState("");
  const [limits, setLimits] = useState({ maxMb: MAX_FILE_MB, formats: FORMATS, included: INCLUDED_PAGES });
  // Whether analysis is open to this user (runtime access, contract 2026-10-26 §4).
  const [access, setAccess] = useState<DocAccess | null>(null);
  useEffect(() => {
    let alive = true;
    void docRuntimeSettings().then((s) => {
      if (alive && s) setLimits({ maxMb: s.maxFileMb || MAX_FILE_MB, formats: s.allowedFormats.length ? s.allowedFormats : FORMATS, included: s.includedPages || INCLUDED_PAGES });
    });
    void docModeAccess("analysis").then((a) => {
      if (alive) setAccess(a);
    });
    return () => {
      alive = false;
    };
  }, []);

  const typedPages = Number(pagesInput);
  const pageCount = pagesInput && Number.isInteger(typedPages) ? typedPages : pagesFor(text);
  const pagesOk = pageCount >= 1 && pageCount <= MAX_PAGES;
  const opts: DocQuoteInput = { pageCount, ocr, lawyerReview, urgent, writtenOpinion };
  const fresh = quote && quote.key === keyOf(opts) ? quote.q : null;
  const canRun = (!!file || text.trim().length >= 20) && pagesOk;

  function pickFile(f: File | null) {
    setFileErr("");
    if (!f) { setFile(null); return; }
    if (f.size > limits.maxMb * 1024 * 1024) { setFile(null); setFileErr(t("fileTooBig", { mb: limits.maxMb })); return; }
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!limits.formats.includes(ext)) { setFile(null); setFileErr(t("fileTypeOf", { list: limits.formats.map((x) => x.toUpperCase()).join(", ") })); return; }
    setFile(f);
  }

  async function getQuote(input: DocQuoteInput = opts): Promise<DocAnalysisQuote | null> {
    setQuoting(true);
    setQuoteFailed(false);
    try {
      const q = await quoteDocumentAnalysis(input);
      setQuote({ key: keyOf(input), q });
      return q;
    } catch {
      setQuoteFailed(true);
      return null;
    } finally {
      setQuoting(false);
    }
  }

  // Price first (POST …/quote), then the analysis itself.
  async function run() {
    if (busy || !canRun) return;
    setBusy(true);
    setFailed(false);
    setGate(null);
    setRes(null);
    try {
      if (!fresh) await getQuote();
      setRes(file ? await analyzeDocumentFile(file) : await analyzeDocument(text.trim()));
    } catch (e) {
      // 415 = unsupported type, 413 = too large, 422 = no readable text in the file.
      // A plan refusal (402) says what was reached and leads to the plans.
      const g = planGateOf(e);
      if (g) setGate(g);
      else if (file && e instanceof ApiError && [413, 415, 422].includes(e.status)) setFileErr(errDetail(e) || t("fileUnreadable"));
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function addLawyerReview() {
    setLawyerReview(true);
    void getQuote({ ...opts, lawyerReview: true });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Only offered when the analysis ran on a FILE: the review endpoint takes a
  // document, and pasted text is not one. The page count the analysis reported
  // is preferred over the typed estimate — the backend measured it.
  async function sendToLawyer() {
    if (!file || handOff === "busy" || handOff === "sent") return;
    setHandOff("busy");
    setHandOffNote("");
    try {
      const r = await requestExistingDocumentReviewGated({
        need: t("handOffNeed"),
        mainFile: file,
        pageCount: res?.pageCount || pageCount,
      });
      // A gate means the work has NOT started, so this must not read as sent.
      if (r.paymentRequired) {
        setHandOff("");
        setHandOffNote(r.message || t("handOffGate"));
      } else if (r.alreadyExists) {
        setHandOff("");
        setHandOffNote(r.message || t("handOffAlready"));
      } else {
        setHandOff("sent");
      }
    } catch (e) {
      logApiError("doc-analysis hand-off", e);
      setHandOff("failed");
    }
  }

  const som = (n: number) => `${fmtUzs(n)} ${t("som")}`;
  // The review banner leads with the one step that does the most: sending
  // the analysed file itself, else adding the review to the quote, else
  // choosing an advocate.
  const upCta = file ? "handOff" : lawyerReview ? "lawyers" : "add";
  const accessGate = !gate ? docAccessGate(access, "ai_document_analysis") : null;
  const modeOff = !!access && !access.allowed && access.code === "document_mode_disabled";

  return (
    <div className="doca">
      {/* The page's name is the shell's title; the banner says what the page
          does, with the dashboard's drawing for it. */}
      <section className="doca__hero" aria-labelledby="doca-hero-t">
        <span className="doca__art" style={artStyle("Hujjat_tahlili")} aria-hidden />
        <div className="doca__heromain">
          <h2 id="doca-hero-t" className="doca__title">{tx("heroTitle")}</h2>
          <p className="doca__sub">{t("subtitle")}</p>
        </div>
        <dl className="doca__meta">
          <div>
            <dt>{tx("formats")}</dt>
            <dd>{limits.formats.map((x) => x.toUpperCase()).join(", ")}</dd>
          </div>
          <div>
            <dt>{tx("size")}</dt>
            <dd>{tx("sizeVal", { mb: limits.maxMb })}</dd>
          </div>
          <div>
            <dt>{tx("included")}</dt>
            <dd>{t("pagesN", { n: limits.included })}</dd>
          </div>
        </dl>
      </section>

      {/* When the analysis is closed to this user, that is said before the
          form, not under it. */}
      {accessGate ? <PlanGateCard gate={accessGate} /> : null}
      {modeOff ? (
        <div className="ppanel doca__state doca__state--off" role="status">
          <span className="intake__failicon" aria-hidden><AlertTriangle /></span>
          <b>{t("modeOff")}</b>
          <p className="advmuted">{t("modeOffText")}</p>
        </div>
      ) : null}

      <div className="ppanel">
        <label className="intake__lbl">{t("label")}</label>
        {file ? null : <textarea className="intake__ta" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} data-ai-target="doc-analysis:text" data-ai-label={t("label")} />}
        <div className="docf" data-ai-target="doc-analysis:file">
          {file ? (
            <span className="docf__name"><IconFileText />{file.name} · {Math.max(1, Math.round(file.size / 1024))} {tcommon("kb")}</span>
          ) : null}
          <label className="btn btn--line btn--sm docf__pick">
            {file ? t("fileChange") : t("fileUpload")}
            <input type="file" hidden accept={acceptFor(limits.formats)} onChange={(e) => { pickFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
          {file ? <button type="button" className="rf__link rf__link--muted" onClick={() => pickFile(null)}>{t("fileRemove")}</button> : <small className="advmuted">{t("fileHint", { mb: limits.maxMb })}</small>}
        </div>
        {fileErr ? <p className="docq__err">{fileErr}</p> : null}

        <div className="docq" data-ai-target="doc-analysis:options">
          <label className="docq__pages">
            <span>{t("pages")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_PAGES}
              value={pagesInput || String(pageCount)}
              onChange={(e) => setPagesInput(e.target.value.replace(/[^\d]/g, ""))}
              aria-invalid={!pagesOk}
            />
          </label>
          <CheckBox className="docq__opt" checked={ocr} onChange={setOcr}>{t("ocr")}</CheckBox>
          <CheckBox className="docq__opt" checked={urgent} onChange={setUrgent}>{t("urgent")}</CheckBox>
          <CheckBox className="docq__opt" checked={lawyerReview} onChange={setLawyerReview}>{t("lawyerReview")}</CheckBox>
          <CheckBox className="docq__opt" checked={writtenOpinion} onChange={setWrittenOpinion}>{t("writtenOpinion")}</CheckBox>
        </div>
        {!pagesOk ? <p className="docq__err">{t("pagesRange", { max: MAX_PAGES })}</p> : null}
        {/* Said before the quote is fetched, not after: the page count is the
            one input the client can still change cheaply. */}
        {pagesOk && pageCount > limits.included ? <p className="docq__hint">{t("extraPagesHint", { n: limits.included })}</p> : null}

        {fresh ? (
          <div className="oquote" style={{ marginBottom: 12 }} data-ai-target="doc-analysis:quote">
            {fresh.aiIncluded ? (
              <div className="oquote__row oquote__row--disc"><span>{t("quoteAiIncluded", { n: fresh.pageCount || pageCount })}</span><span>{t("quoteIncluded")}</span></div>
            ) : (
              <div className="oquote__row oquote__row--mod"><span>{t("quoteBase", { n: fresh.pageCount || pageCount })}</span><span>{som(fresh.baseAmount)}</span></div>
            )}
            {fresh.includedPages ? (
              <div className="oquote__row oquote__row--sub">
                <span>{t("quoteIncludedPages", { n: fresh.includedPages })}</span>
                <span>{fresh.extraPages ? t("quoteExtraPages", { n: fresh.extraPages }) : t("quoteNoExtra")}</span>
              </div>
            ) : null}
            {fresh.ocrAmount ? <div className="oquote__row oquote__row--mod"><span>{t("quoteOcr")}</span><span>{som(fresh.ocrAmount)}</span></div> : null}
            {fresh.lawyerReviewAmount ? <div className="oquote__row oquote__row--mod"><span>{t("quoteLawyer")}</span><span>{som(fresh.lawyerReviewAmount)}</span></div> : null}
            {fresh.urgencyAmount ? <div className="oquote__row oquote__row--mod"><span>{t("quoteUrgent")}</span><span>{som(fresh.urgencyAmount)}</span></div> : null}
            {fresh.writtenOpinionAmount ? <div className="oquote__row oquote__row--mod"><span>{t("quoteWritten")}</span><span>{som(fresh.writtenOpinionAmount)}</span></div> : null}
            <div className="oquote__row oquote__row--total"><span>{t("quoteTotal")}</span><b>{som(fresh.totalAmount)}</b></div>
          </div>
        ) : (
          <button className="btn btn--line btn--full" type="button" style={{ marginBottom: 10 }} onClick={() => getQuote()} disabled={quoting || !pagesOk} data-ai-target="doc-analysis:quote">
            {quoting ? t("quoting") : t("getQuote")}
          </button>
        )}
        {quoteFailed ? <p className="docq__err">{t("quoteError")}</p> : null}

        <button className="btn btn--pri btn--full" type="button" onClick={run} disabled={busy || !canRun} data-ai-target="button:doc-analysis-run">
          <IconSparkle />
          {busy ? t("analyzing") : t("analyze")}
        </button>
        <p className="intake__hint">{t("hint")}</p>
      </div>

      {res ? (
        <>
          <div className="ppanel" data-ai-target="doc-analysis:result">
            <div className="ppanel__h">
              <b>{t("summary")}</b>
              {res.pageCount ? <span className="creq__badge">{t("pagesN", { n: res.pageCount })}</span> : null}
            </div>
            <p className="doca__summary">{res.summary || t("noSummary")}</p>
            <AiLabel />
          </div>
          {res.analysisText ? (
            <div className="ppanel">
              <div className="ppanel__h"><b>{t("aiText")}</b></div>
              <p className="doca__summary doca__long">{res.analysisText.replace(/^#+\s*/gm, "").replace(/\*\*/g, "")}</p>
            </div>
          ) : null}
          <div className="ppanel">
            <div className="ppanel__h"><b>{t("risks")}</b></div>
            {res.risks.length ? (
              <div className="doca__risks">
                {res.risks.map((r, i) => (
                  <div className={`doca__risk doca__risk--${r.level}`} key={i}>
                    <span className="doca__rl">
                      {r.level === "high" || r.level === "medium" ? <AlertTriangle aria-hidden /> : <Info aria-hidden />}
                      {t.has(`level.${r.level}`) ? t(`level.${r.level}`) : r.level}
                    </span>
                    <span>{r.text}</span>
                  </div>
                ))}
              </div>
            ) : <p className="advmuted">{t("noRisks")}</p>}
          </div>
          {res.recommendations.length ? (
            <div className="ppanel">
              <div className="ppanel__h"><b>{t("recommendations")}</b></div>
              <ul className="doca__recs">
                {res.recommendations.map((r, i) => (
                  <li key={i}><IconCheck />{r}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Permanent upsell after an AI analysis. */}
          {res.upsell ? (
            <div className="ppanel docup">
              <span className="docup__i docup__art" style={artStyle("Advokat_tekshiruvi")} aria-hidden />
              <div className="docup__t">
                <b>{res.upsell.title || t("upsellTitle")}</b>
                <span>{res.upsell.reason || t("upsellText")}</span>
                {fresh?.lawyerReviewAmount ? <span className="docup__price">{t("upsellPrice", { price: som(fresh.lawyerReviewAmount) })}</span> : null}
              </div>
              <div className="docup__act">
                {/* The document itself goes to a Navbatchi advokat. Offered
                    only for a file, because a pasted paragraph is not a
                    document the review endpoint can take. */}
                {file ? (
                  <button
                    className={`btn btn--grad btn--sm ${upCta === "handOff" ? "docup__cta" : "docup__ghost"}`}
                    type="button"
                    onClick={() => void sendToLawyer()}
                    disabled={handOff === "busy" || handOff === "sent"}
                  >
                    {handOff === "sent" ? <IconCheck /> : <IconShieldCheck />}
                    {handOff === "sent" ? t("handOffSent") : handOff === "busy" ? t("handOffSending") : t("handOff")}
                  </button>
                ) : null}
                {lawyerReview ? null : (
                  <button className={`btn btn--pri btn--sm ${upCta === "add" ? "docup__cta" : "docup__ghost"}`} type="button" onClick={addLawyerReview}>{t("upsellAdd")}</button>
                )}
                <button className={`btn btn--line btn--sm ${upCta === "lawyers" ? "docup__cta" : "docup__ghost"}`} type="button" onClick={() => router.push("/portal/client/lawyers")}>
                  {t("upsellLawyers")}
                  <IconArrowRight />
                </button>
              </div>
              {handOffNote ? <p className="dgate__note docup__note">{handOffNote}</p> : null}
              {handOff === "failed" ? <p className="svc__err docup__note">{t("handOffError")}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* A 402 is shown where the analysis was asked for. */}
      {gate ? <PlanGateCard gate={gate} onClose={() => setGate(null)} /> : null}

      {failed ? (
        <div className="ppanel doca__state" role="alert">
          <span className="intake__failicon" aria-hidden><AlertTriangle /></span>
          <b>{t("failedTitle")}</b>
          <p className="advmuted">{t("failedText")}</p>
        </div>
      ) : null}
    </div>
  );
}
