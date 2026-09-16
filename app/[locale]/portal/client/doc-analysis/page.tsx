"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  analyzeDocument,
  analyzeDocumentFile,
  quoteDocumentAnalysis,
  type DocAnalysis,
  type DocAnalysisQuote,
  type DocQuoteInput,
} from "@/lib/services/backend";
import { fmtUzs } from "@/lib/money";
import { ApiError } from "@/lib/http";
import { IconFileText, IconAlert, IconCheck, IconSparkle, IconShieldCheck, IconArrowRight } from "@/components/icons";

const MAX_PAGES = 500;
// The backend counts one page per 2 500 characters of text.
const pagesFor = (text: string) => Math.min(MAX_PAGES, Math.max(1, Math.ceil(text.trim().length / 2500)));
const keyOf = (o: DocQuoteInput) => `${o.pageCount}|${o.ocr}|${o.lawyerReview}|${o.urgent}|${Boolean(o.writtenOpinion)}`;
const MAX_FILE_MB = 20;
const FILE_TYPES = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export default function ClientDocAnalysis() {
  const t = useTranslations("portal.client.docAnalysis");
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
  const [failed, setFailed] = useState(false);

  const typedPages = Number(pagesInput);
  const pageCount = pagesInput && Number.isInteger(typedPages) ? typedPages : pagesFor(text);
  const pagesOk = pageCount >= 1 && pageCount <= MAX_PAGES;
  const opts: DocQuoteInput = { pageCount, ocr, lawyerReview, urgent, writtenOpinion };
  const fresh = quote && quote.key === keyOf(opts) ? quote.q : null;
  const canRun = (!!file || text.trim().length >= 20) && pagesOk;

  function pickFile(f: File | null) {
    setFileErr("");
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_MB * 1024 * 1024) { setFile(null); setFileErr(t("fileTooBig", { mb: MAX_FILE_MB })); return; }
    if (!/\.(pdf|docx|txt)$/i.test(f.name)) { setFile(null); setFileErr(t("fileType")); return; }
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
    setRes(null);
    try {
      if (!fresh) await getQuote();
      setRes(file ? await analyzeDocumentFile(file) : await analyzeDocument(text.trim()));
    } catch (e) {
      // 415 = unsupported type, 413 = too large, 422 = no readable text in the file.
      if (file && e instanceof ApiError && [413, 415, 422].includes(e.status)) setFileErr(e.detail || t("fileUnreadable"));
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

  const som = (n: number) => `${fmtUzs(n)} ${t("som")}`;

  return (
    <div className="doca">
      <div className="doca__hero">
        <span className="doca__ico"><IconFileText /></span>
        <div>
          <h1 className="doca__title">{t("title")}</h1>
          <p className="doca__sub">{t("subtitle")}</p>
        </div>
      </div>

      <div className="ppanel">
        <label className="intake__lbl">{t("label")}</label>
        {file ? null : <textarea className="intake__ta" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} />}
        <div className="docf">
          {file ? (
            <span className="docf__name"><IconFileText />{file.name} · {Math.max(1, Math.round(file.size / 1024))} KB</span>
          ) : null}
          <label className="btn btn--line btn--sm docf__pick">
            {file ? t("fileChange") : t("fileUpload")}
            <input type="file" hidden accept={FILE_TYPES} onChange={(e) => { pickFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
          {file ? <button type="button" className="rf__link rf__link--muted" onClick={() => pickFile(null)}>{t("fileRemove")}</button> : <small className="advmuted">{t("fileHint", { mb: MAX_FILE_MB })}</small>}
        </div>
        {fileErr ? <p className="docq__err">{fileErr}</p> : null}

        <div className="docq">
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
          <label className="docq__opt"><input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} />{t("ocr")}</label>
          <label className="docq__opt"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />{t("urgent")}</label>
          <label className="docq__opt"><input type="checkbox" checked={lawyerReview} onChange={(e) => setLawyerReview(e.target.checked)} />{t("lawyerReview")}</label>
          <label className="docq__opt"><input type="checkbox" checked={writtenOpinion} onChange={(e) => setWrittenOpinion(e.target.checked)} />{t("writtenOpinion")}</label>
        </div>
        {!pagesOk ? <p className="docq__err">{t("pagesRange", { max: MAX_PAGES })}</p> : null}

        {fresh ? (
          <div className="oquote" style={{ marginBottom: 12 }}>
            {fresh.aiIncluded ? (
              <div className="oquote__row oquote__row--disc"><span>{t("quoteAiIncluded", { n: fresh.pageCount || pageCount })}</span><span>{t("quoteIncluded")}</span></div>
            ) : (
              <div className="oquote__row oquote__row--mod"><span>{t("quoteBase", { n: fresh.pageCount || pageCount })}</span><span>{som(fresh.baseAmount)}</span></div>
            )}
            {fresh.ocrAmount ? <div className="oquote__row oquote__row--mod"><span>{t("quoteOcr")}</span><span>{som(fresh.ocrAmount)}</span></div> : null}
            {fresh.lawyerReviewAmount ? <div className="oquote__row oquote__row--mod"><span>{t("quoteLawyer")}</span><span>{som(fresh.lawyerReviewAmount)}</span></div> : null}
            {fresh.urgencyAmount ? <div className="oquote__row oquote__row--mod"><span>{t("quoteUrgent")}</span><span>{som(fresh.urgencyAmount)}</span></div> : null}
            {fresh.writtenOpinionAmount ? <div className="oquote__row oquote__row--mod"><span>{t("quoteWritten")}</span><span>{som(fresh.writtenOpinionAmount)}</span></div> : null}
            <div className="oquote__row oquote__row--total"><span>{t("quoteTotal")}</span><b>{som(fresh.totalAmount)}</b></div>
          </div>
        ) : (
          <button className="btn btn--line btn--full" type="button" style={{ marginBottom: 10 }} onClick={() => getQuote()} disabled={quoting || !pagesOk}>
            {quoting ? t("quoting") : t("getQuote")}
          </button>
        )}
        {quoteFailed ? <p className="docq__err">{t("quoteError")}</p> : null}

        <button className="btn btn--pri btn--full" type="button" onClick={run} disabled={busy || !canRun}>
          <IconSparkle />
          {busy ? t("analyzing") : t("analyze")}
        </button>
        <p className="intake__hint">{t("hint")}</p>
      </div>

      {res ? (
        <>
          <div className="ppanel">
            <div className="ppanel__h">
              <b>{t("summary")}</b>
              {res.pageCount ? <span className="creq__badge">{t("pagesN", { n: res.pageCount })}</span> : null}
            </div>
            <p className="doca__summary">{res.summary || t("noSummary")}</p>
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
                    <span className="doca__rl">{t.has(`level.${r.level}`) ? t(`level.${r.level}`) : r.level}</span>
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
              <span className="docup__i"><IconShieldCheck /></span>
              <div className="docup__t">
                <b>{res.upsell.title || t("upsellTitle")}</b>
                <span>{res.upsell.reason || t("upsellText")}</span>
                {fresh?.lawyerReviewAmount ? <span className="docup__price">{t("upsellPrice", { price: som(fresh.lawyerReviewAmount) })}</span> : null}
              </div>
              <div className="docup__act">
                {lawyerReview ? null : (
                  <button className="btn btn--pri btn--sm" type="button" onClick={addLawyerReview}>{t("upsellAdd")}</button>
                )}
                <button className="btn btn--line btn--sm" type="button" onClick={() => router.push("/portal/client/lawyers")}>
                  {t("upsellLawyers")}
                  <IconArrowRight />
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {failed ? (
        <div className="ppanel">
          <div className="ppanel__h"><span className="intake__failicon"><IconAlert /></span><b>{t("failedTitle")}</b></div>
          <p className="advmuted">{t("failedText")}</p>
        </div>
      ) : null}
    </div>
  );
}
