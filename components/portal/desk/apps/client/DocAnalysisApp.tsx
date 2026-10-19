"use client";

import { useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { analyzeDocument, analyzeDocumentFile, quoteDocumentAnalysis, requestExistingDocumentReviewGated, type DocAnalysis, type DocAnalysisQuote, type DocQuoteInput } from "@/lib/services/backend";
import { fmtUzs } from "@/lib/money";
import { ApiError, errDetail, logApiError } from "@/lib/http";
import { IconAlert, IconArrowRight, IconCheck, IconClose, IconDocSearch, IconFileText, IconShieldCheck, IconSparkle, IconUpload } from "@/components/icons";
import { App, Banner, Btn, Check, Empty, Field, Input, Loading, Tag, Toolbar, useOs, type Tone } from "../../kit/kit";
import type { NativeProps } from "../../native";
import "./client.css";

// Document analysis as a desktop program — the document on the left (a
// file dropped in, or the text pasted), with its pages and the extras
// (OCR, urgent, an advocate's check, a written opinion) and the price
// for them; the AI's reading on the right: the summary, the risks by
// level, what to do, and — since an AI is not an advocate — the offer to
// hand the same file to one. The rules are the web page's.

const MAX_PAGES = 500;
const pagesFor = (text: string) => Math.min(MAX_PAGES, Math.max(1, Math.ceil(text.trim().length / 2500)));
const INCLUDED_PAGES = 10;
const keyOf = (o: DocQuoteInput) => `${o.pageCount}|${o.ocr}|${o.lawyerReview}|${o.urgent}|${Boolean(o.writtenOpinion)}`;
const MAX_FILE_MB = 20;
const FILE_TYPES = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
const RISK_TONE: Record<string, Tone> = { high: "err", critical: "err", medium: "warn", low: "info" };

export default function DocAnalysisApp({ openLink }: NativeProps) {
  const t = useTranslations("portal.client.docAnalysis");
  const tc = useTranslations("common");
  const os = useOs();
  const pick = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pagesInput, setPagesInput] = useState("");
  const [ocr, setOcr] = useState(false);
  const [lawyerReview, setLawyerReview] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [writtenOpinion, setWrittenOpinion] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState("");
  const [drag, setDrag] = useState(false);
  const [quote, setQuote] = useState<{ key: string; q: DocAnalysisQuote } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DocAnalysis | null>(null);
  const [failed, setFailed] = useState(false);
  const [handOff, setHandOff] = useState<"" | "busy" | "sent" | "failed">("");
  const [handOffNote, setHandOffNote] = useState("");

  const typedPages = Number(pagesInput);
  const pageCount = pagesInput && Number.isInteger(typedPages) ? typedPages : pagesFor(text);
  const pagesOk = pageCount >= 1 && pageCount <= MAX_PAGES;
  const opts: DocQuoteInput = { pageCount, ocr, lawyerReview, urgent, writtenOpinion };
  const fresh = quote && quote.key === keyOf(opts) ? quote.q : null;
  const canRun = (!!file || text.trim().length >= 20) && pagesOk;
  const som = (n: number) => `${fmtUzs(n)} ${t("som")}`;

  function pickFile(f: File | null) {
    setFileErr("");
    if (!f) return setFile(null);
    if (f.size > MAX_FILE_MB * 1024 * 1024) return (setFile(null), setFileErr(t("fileTooBig", { mb: MAX_FILE_MB })));
    if (!/\.(pdf|docx|txt)$/i.test(f.name)) return (setFile(null), setFileErr(t("fileType")));
    setFile(f);
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  };

  async function getQuote(input: DocQuoteInput = opts) {
    setQuoting(true);
    setQuoteFailed(false);
    try {
      const q = await quoteDocumentAnalysis(input);
      setQuote({ key: keyOf(input), q });
    } catch {
      setQuoteFailed(true);
    } finally {
      setQuoting(false);
    }
  }
  // The price first, then the analysis.
  async function run() {
    if (busy || !canRun) return;
    setBusy(true);
    setFailed(false);
    setRes(null);
    try {
      if (!fresh) await getQuote();
      setRes(file ? await analyzeDocumentFile(file) : await analyzeDocument(text.trim()));
    } catch (e) {
      if (file && e instanceof ApiError && [413, 415, 422].includes(e.status)) setFileErr(errDetail(e) || t("fileUnreadable"));
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  // The very file that was analysed, to a duty advocate.
  async function sendToLawyer() {
    if (!file || handOff === "busy" || handOff === "sent") return;
    setHandOff("busy");
    setHandOffNote("");
    try {
      const r = await requestExistingDocumentReviewGated({ need: t("handOffNeed"), mainFile: file, pageCount: res?.pageCount || pageCount });
      // A gate or an existing request means the work has not started.
      if (r.paymentRequired || r.alreadyExists) {
        setHandOff("");
        setHandOffNote(r.message || t(r.paymentRequired ? "handOffGate" : "handOffAlready"));
      } else setHandOff("sent");
    } catch (e) {
      logApiError("doc-analysis hand-off", e);
      setHandOff("failed");
    }
  }

  const bill: [string, string, string?][] = fresh
    ? ([
        fresh.aiIncluded ? [t("quoteAiIncluded", { n: fresh.pageCount || pageCount }), t("quoteIncluded")] : [t("quoteBase", { n: fresh.pageCount || pageCount }), som(fresh.baseAmount)],
        fresh.includedPages ? [t("quoteIncludedPages", { n: fresh.includedPages }), fresh.extraPages ? t("quoteExtraPages", { n: fresh.extraPages }) : t("quoteNoExtra"), "sub"] : null,
        fresh.ocrAmount ? [t("quoteOcr"), som(fresh.ocrAmount)] : null,
        fresh.lawyerReviewAmount ? [t("quoteLawyer"), som(fresh.lawyerReviewAmount)] : null,
        fresh.urgencyAmount ? [t("quoteUrgent"), som(fresh.urgencyAmount)] : null,
        fresh.writtenOpinionAmount ? [t("quoteWritten"), som(fresh.writtenOpinionAmount)] : null,
      ].filter(Boolean) as [string, string, string?][])
    : [];

  return (
    <App name="cdoca">
      <Toolbar title={t("title")} subtitle={os === "mac" ? t("subtitle") : undefined} />
      <div className="dxci">
        <form
          className="dxci-note dxca-in dx-scroll"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <div
            className={`dxca-drop${drag ? " is-drag" : ""}${file ? " is-file" : ""}`}
            onDragOver={(e) => (e.preventDefault(), setDrag(true))}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            {file ? (
              <>
                <IconFileText aria-hidden />
                <span>
                  <b>{file.name}</b>
                  <small>
                    {Math.max(1, Math.round(file.size / 1024))} {tc("kb")}
                  </small>
                </span>
                <Btn small onClick={() => pick.current?.click()}>
                  {t("fileChange")}
                </Btn>
                <Btn small kind="plain" icon={<IconClose />} title={t("fileRemove")} onClick={() => pickFile(null)} />
              </>
            ) : (
              <>
                <IconUpload aria-hidden />
                <b>{t("fileUpload")}</b>
                <small>{t("fileHint", { mb: MAX_FILE_MB })}</small>
                <Btn small onClick={() => pick.current?.click()}>
                  {t("fileUpload")}
                </Btn>
              </>
            )}
            <input ref={pick} type="file" hidden accept={FILE_TYPES} onChange={(e) => (pickFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
          </div>
          {fileErr ? <small className="dx-field__e">{fileErr}</small> : null}
          {file ? null : (
            <label className="dxci-pad dxca-pad">
              <span>{t("label")}</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} />
            </label>
          )}
          <div className="dxca-opts">
            <Field label={t("pages")} error={pagesOk ? undefined : t("pagesRange", { max: MAX_PAGES })} hint={pagesOk && pageCount > INCLUDED_PAGES ? t("extraPagesHint", { n: INCLUDED_PAGES }) : undefined}>
              <Input type="number" min="1" max={String(MAX_PAGES)} value={pagesInput || String(pageCount)} onChange={(v) => setPagesInput(v.replace(/[^\d]/g, ""))} />
            </Field>
            <Check checked={ocr} onChange={setOcr} label={t("ocr")}>
              {t("ocr")}
            </Check>
            <Check checked={urgent} onChange={setUrgent} label={t("urgent")}>
              {t("urgent")}
            </Check>
            <Check checked={lawyerReview} onChange={setLawyerReview} label={t("lawyerReview")}>
              {t("lawyerReview")}
            </Check>
            <Check checked={writtenOpinion} onChange={setWrittenOpinion} label={t("writtenOpinion")}>
              {t("writtenOpinion")}
            </Check>
          </div>
          {fresh ? (
            <dl className="dxcp-bill">
              {bill.map(([k, v, sub]) => (
                <div key={k} className={sub ? "is-sub" : undefined}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
              <div className="is-total">
                <dt>{t("quoteTotal")}</dt>
                <dd>{som(fresh.totalAmount)}</dd>
              </div>
            </dl>
          ) : (
            <Btn busy={quoting} disabled={!pagesOk} onClick={() => void getQuote()}>
              {quoting ? t("quoting") : t("getQuote")}
            </Btn>
          )}
          {quoteFailed ? <small className="dx-field__e">{t("quoteError")}</small> : null}
          <span className="dxci-bar">
            <small>{t("hint")}</small>
            <Btn kind="primary" type="submit" icon={<IconSparkle />} busy={busy} disabled={!canRun}>
              {busy ? t("analyzing") : t("analyze")}
            </Btn>
          </span>
        </form>

        <div className="dxci-out dx-scroll">
          {busy ? (
            <Loading label={t("analyzing")} />
          ) : failed ? (
            <Empty icon={<IconAlert />} title={t("failedTitle")} text={t("failedText")} />
          ) : res ? (
            <>
              <section className="dxcs-box">
                <h2>
                  {t("summary")}
                  {res.pageCount ? <Tag>{t("pagesN", { n: res.pageCount })}</Tag> : null}
                </h2>
                <p className="dxcs-bio">{res.summary || t("noSummary")}</p>
              </section>
              <section className="dxcs-box">
                <h2>{t("risks")}</h2>
                {res.risks.length ? (
                  <ul className="dxca-risks">
                    {res.risks.map((r, i) => (
                      <li key={i} className={`is-${RISK_TONE[r.level] ?? "neutral"}`}>
                        <Tag tone={RISK_TONE[r.level] ?? "neutral"}>{t.has(`level.${r.level}`) ? t(`level.${r.level}`) : r.level}</Tag>
                        <span>{r.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dxcs-lead">{t("noRisks")}</p>
                )}
              </section>
              {res.recommendations.length ? (
                <section className="dxcs-box">
                  <h2>{t("recommendations")}</h2>
                  <ul className="dxcl-why dxca-recs">
                    {res.recommendations.map((r, i) => (
                      <li key={i}>
                        <IconCheck aria-hidden /> {r}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {res.analysisText ? (
                <section className="dxcs-box">
                  <h2>{t("aiText")}</h2>
                  <p className="dxcs-bio">{res.analysisText.replace(/^#+\s*/gm, "").replace(/\*\*/g, "")}</p>
                </section>
              ) : null}
              {res.upsell ? (
                <section className="dxcs-box dxca-up">
                  <span className="dxca-up__ic" aria-hidden>
                    <IconShieldCheck />
                  </span>
                  <b>{res.upsell.title || t("upsellTitle")}</b>
                  <p className="dxcs-lead">{res.upsell.reason || t("upsellText")}</p>
                  {fresh?.lawyerReviewAmount ? <small>{t("upsellPrice", { price: som(fresh.lawyerReviewAmount) })}</small> : null}
                  <span className="dxca-up__acts">
                    {file ? (
                      <Btn kind="primary" icon={handOff === "sent" ? <IconCheck /> : <IconShieldCheck />} busy={handOff === "busy"} disabled={handOff === "sent"} onClick={() => void sendToLawyer()}>
                        {handOff === "sent" ? t("handOffSent") : t("handOff")}
                      </Btn>
                    ) : null}
                    {lawyerReview ? null : (
                      <Btn onClick={() => (setLawyerReview(true), void getQuote({ ...opts, lawyerReview: true }))}>{t("upsellAdd")}</Btn>
                    )}
                    <Btn kind="plain" icon={<IconArrowRight />} onClick={() => openLink({ appId: "", route: "/portal/client/lawyers" })}>
                      {t("upsellLawyers")}
                    </Btn>
                  </span>
                  {handOffNote ? <Banner tone="info">{handOffNote}</Banner> : null}
                  {handOff === "failed" ? <Banner tone="err">{t("handOffError")}</Banner> : null}
                </section>
              ) : null}
            </>
          ) : (
            <div className="dxci-hello">
              <span className="dxci-hello__ic is-teal" aria-hidden>
                <IconDocSearch />
              </span>
              <h2>{t("title")}</h2>
              <p>{t("subtitle")}</p>
            </div>
          )}
        </div>
      </div>
    </App>
  );
}
