"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getServiceDocumentAiQuestions,
  generateServiceDocumentAi,
  getServiceTemplateSourceFile,
  type DocAiFlow,
  type DocumentRequest,
  type ServiceDocumentFields,
  type TemplateQuestion,
} from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { preopenTab, showBlob, closeTab } from "@/lib/download";
import { Notice } from "@/components/admin/AdminBits";
import DocumentRequestPanel from "./DocumentRequestPanel";
import { IconChevronLeft, IconEye, IconSparkle } from "@/components/icons";

type Step = "need" | "questions" | "result";

// LEXGO_SERVICE_DOCUMENT_ASSIST_FLOW.md: describe the need in free text,
// answer whatever the backend asks back (template-driven, not a live
// dynamic Q&A — one round trip), generate. The result is a normal
// DocumentRequest — DocumentRequestPanel owns everything past that point
// (pay/pending/done/download/contract-sign), including its existing
// 402-not-yet-paid fallback, so this component never touches payment itself.
export default function DocumentAiAssist({
  aiFlow,
  sourceFile,
  onBack,
}: {
  aiFlow: DocAiFlow;
  sourceFile: ServiceDocumentFields | null;
  onBack: () => void;
}) {
  const t = useTranslations("portal.client.documents");
  const locale = useLocale();
  const [step, setStep] = useState<Step>("need");
  const [need, setNeed] = useState("");
  const [questions, setQuestions] = useState<TemplateQuestion[]>([]);
  const [generateUrl, setGenerateUrl] = useState(aiFlow.generateUrl);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<DocumentRequest | null>(null);
  const [srcBusy, setSrcBusy] = useState(false);

  const errMsg = (e: unknown) => (e instanceof ApiError && e.status === 422 ? t("aiNeedRequired") : t("error"));

  async function fetchQuestions() {
    if (busy || !need.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = await getServiceDocumentAiQuestions(aiFlow.questionsUrl, need.trim(), locale);
      setQuestions(r.questions);
      if (r.generateUrl) setGenerateUrl(r.generateUrl);
      setStep("questions");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await generateServiceDocumentAi(generateUrl, { need: need.trim(), answers, language: locale });
      setResult(r);
      setStep("result");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function viewClean() {
    const url = sourceFile?.cleanSourceFileInlineUrl || sourceFile?.cleanSourceFileUrl;
    if (!url || srcBusy) return;
    const win = preopenTab();
    setSrcBusy(true);
    try {
      const blob = await getServiceTemplateSourceFile(url);
      showBlob(blob, sourceFile?.sourceFileName || t("fileGeneric"), win);
    } catch {
      closeTab(win);
    } finally {
      setSrcBusy(false);
    }
  }

  if (step === "result" && result)
    return (
      <DocumentRequestPanel
        key={result.id}
        initialReq={result}
        fields={[]}
        sourceFile={sourceFile}
        onStartNew={() => {
          setStep("need");
          setResult(null);
          setAnswers({});
        }}
      />
    );

  const cleanUrl = sourceFile?.cleanSourceFileInlineUrl || sourceFile?.cleanSourceFileUrl;

  return (
    <div className="cform" style={{ maxWidth: "none" }}>
      <button type="button" className="rf__link" onClick={onBack}>
        <IconChevronLeft />
        {t("backToChoices")}
      </button>
      <div className="docassist__head">
        <span className="docassist__i"><IconSparkle /></span>
        <div>
          <b>{t("chooseAi")}</b>
          <p className="advmuted">{t("aiLead")}</p>
        </div>
      </div>
      {cleanUrl ? (
        <button type="button" className="btn btn--line btn--sm" onClick={viewClean} disabled={srcBusy} style={{ justifySelf: "start" }}>
          <IconEye />
          {srcBusy ? t("processingShort") : t("viewSource")}
        </button>
      ) : null}

      <div>
        <label>{t("aiNeedLabel")}</label>
        <textarea rows={4} value={need} onChange={(e) => setNeed(e.target.value)} placeholder={t("aiNeedPlaceholder")} disabled={step === "questions"} />
      </div>

      {step === "questions"
        ? questions.map((q) => (
            <div key={q.name}>
              <label htmlFor={`ai-${q.name}`}>
                {q.label}
                {q.required ? <i aria-hidden> *</i> : null}
              </label>
              {q.type === "textarea" ? (
                <textarea
                  id={`ai-${q.name}`}
                  rows={3}
                  value={answers[q.name] || ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.name]: e.target.value }))}
                />
              ) : (
                <input
                  id={`ai-${q.name}`}
                  type="text"
                  value={answers[q.name] || ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.name]: e.target.value }))}
                />
              )}
            </div>
          ))
        : null}

      {err ? <Notice ok={false} msg={err} /> : null}

      {step === "need" ? (
        <button className="btn btn--grad btn--full btn--lg" type="button" onClick={fetchQuestions} disabled={busy || !need.trim()}>
          {busy ? t("processingShort") : t("aiGetQuestions")}
        </button>
      ) : (
        <button className="btn btn--grad btn--full btn--lg" type="button" onClick={generate} disabled={busy}>
          {busy ? t("processingShort") : t("aiGenerate")}
        </button>
      )}
    </div>
  );
}
