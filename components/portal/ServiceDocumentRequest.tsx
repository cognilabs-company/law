"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getServiceDocumentTemplate,
  getServiceDocumentFields,
  createServiceDocumentRequest,
  listDocumentRequests,
  getDocumentRequest,
  type BackendTemplate,
  type DocumentRequest,
  type ServiceDocumentFields,
} from "@/lib/services/backend";
import DocumentRequestPanel from "./DocumentRequestPanel";
import DocumentLawyerAssist from "./DocumentLawyerAssist";
import ManualDocPlanGate from "./ManualDocPlanGate";
import { Skeleton } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import { ApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { IconList, IconHeadset, IconChevronLeft, IconLock } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

type Mode = "choose" | "manual" | "lawyer";

// FRONTEND_DOCUMENT_GENERATION.md "Asosiy Flow": a catalog service with a
// document_template_id runs the answers → pay → generate → download
// lifecycle (DocumentRequestPanel), with the request created through the
// service — GET /services/{id}/document-template, POST /services/{id}/document-requests.
export default function ServiceDocumentRequest({ serviceId, onTitle }: { serviceId: string; onTitle?: (title: string) => void }) {
  const t = useTranslations("portal.client.documents");
  const [tpl, setTpl] = useState<BackendTemplate | null>(null);
  const [sourceFile, setSourceFile] = useState<ServiceDocumentFields | null>(null);
  const [req, setReq] = useState<DocumentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  // "Has the resume lookup finished?" — auto-start must wait for it, or a
  // template with no questions creates a second, separately-payable request
  // on every visit while the existing one is still being fetched.
  const [resumed, setResumed] = useState(false);
  // "choose" only ever applies once document-fields answers with a
  // lawyer_flow — the compat gate (2026-09-22 backend): a service it isn't
  // wired for goes straight to "manual", i.e. today's exact pre-existing
  // behavior, unchanged. The AI-assisted option was removed from this
  // chooser on request — sourceFile.aiFlow may still come back from the
  // backend, it's just never offered here any more.
  const [mode, setMode] = useState<Mode>("manual");
  const starting = useRef(false);
  // LEXGO_MANUAL_DOCUMENT_PLAN_FRONTEND.md: "" = not gated; a non-empty
  // string is the backend's own 402 message, and switches the whole screen
  // to the plan-purchase prompt instead of the normal template/fill flow.
  const [planRequired, setPlanRequired] = useState("");
  const [planGateOpen, setPlanGateOpen] = useState(false);

  // Reset when a different service is opened — during render, not an effect
  // (see DocumentRequestPanel for why), so the new fetch below starts clean.
  const [prevServiceId, setPrevServiceId] = useState(serviceId);
  if (serviceId !== prevServiceId) {
    setPrevServiceId(serviceId);
    setTpl(null);
    setSourceFile(null);
    setReq(null);
    setLoading(true);
    setErr(false);
    setResumed(false);
    setMode("manual");
    setPlanRequired("");
    setPlanGateOpen(false);
  }

  useEffect(() => {
    let alive = true;
    starting.current = false;
    // GET .../document-fields is the doc's stated source of truth for
    // building the form ("frontend shu fields bo'yicha form quradi") — always
    // fetched, in parallel, and preferred outright whenever it comes back
    // non-empty; document-template only supplies price/description/name and
    // the template text the live document pane renders (a 404 on the fields
    // endpoint is expected for a service without one, not an error).
    Promise.all([
      getServiceDocumentTemplate(serviceId),
      getServiceDocumentFields(serviceId).catch((e) => {
        console.warn(`[document-fields] ${serviceId}:`, e);
        return null;
      }),
    ])
      .then(([r, f]) => {
        if (!alive) return;
        if (f?.fields.length) r = { ...r, questionnaire: f.fields };
        setTpl(r);
        // Kept whenever fetched (not just when hasSourceFile) — DocFill/
        // DocumentRequestPanel already gate their own use of it on
        // hasSourceFile; the AI/lawyer flow URLs need it regardless.
        setSourceFile(f);
        if (f?.lawyerFlow) setMode("choose");
        onTitle?.(r.name);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 402 && e.code === "manual_document_plan_required") setPlanRequired(e.detail || t("planRequired"));
        else setErr(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  // Resume an existing request for this template rather than creating a new
  // (re-payable) one, same as the standalone template list.
  useEffect(() => {
    if (!tpl) return;
    let alive = true;
    listDocumentRequests()
      .then((rows) => {
        const existing = rows.find((r) => r.templateId === tpl.id);
        if (!existing) return null;
        return getDocumentRequest(existing.id).then((r) => {
          // A request created while this lookup was in flight wins.
          if (alive && !starting.current) setReq((cur) => cur ?? r);
        });
      })
      .catch(() => {})
      .finally(() => alive && setResumed(true));
    return () => {
      alive = false;
    };
  }, [tpl]);

  async function start() {
    if (!tpl || busy || starting.current) return;
    starting.current = true;
    setBusy(true);
    setErr(false);
    try {
      // No `questionnaire` in the body: this endpoint derives it from the
      // service's own template and has never accepted one, so sending it
      // could only overwrite the authoritative list with ours. The template's
      // fields are passed to the panel below as a local fallback instead.
      setReq(await createServiceDocumentRequest(serviceId, { title: tpl.name, document_type: tpl.category || undefined }));
    } catch {
      setErr(true);
      starting.current = false;
    } finally {
      setBusy(false);
    }
  }

  // A template with nothing to fill in has no "questionnaire" step to show —
  // skip the extra "Davom etish" tap and go straight to the document instead
  // of stopping at a screen whose only job was to lead to this same click.
  // Gated to mode === "manual" so a service with ai/lawyer flows still stops
  // at the choice screen first, even when its manual questionnaire is empty.
  useEffect(() => {
    if (!(tpl && resumed && tpl.questionnaire.length === 0 && !req && !busy && !err && mode === "manual")) return;
    const h = setTimeout(() => void start(), 0);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, resumed, req, busy, err, mode]);

  if (loading || (tpl && mode === "manual" && tpl.questionnaire.length === 0 && !req && !err)) return <Skeleton rows={3} />;

  if (planRequired)
    return (
      <div className="cform" style={{ maxWidth: "none" }}>
        <div className="docassist__head">
          <span className="docassist__i docassist__i--lawyer"><IconLock /></span>
          <div>
            <b>{t("planGateTitle")}</b>
            <p className="advmuted">{planRequired}</p>
          </div>
        </div>
        <button className="btn btn--grad btn--full btn--lg" type="button" onClick={() => setPlanGateOpen(true)}>
          {t("choosePlan")}
        </button>
        <ManualDocPlanGate open={planGateOpen} onClose={() => setPlanGateOpen(false)} message={planRequired} />
      </div>
    );

  if (!tpl) return <Notice ok={false} msg={t("error")} />;

  if (mode === "choose")
    return (
      <div className="cform" style={{ maxWidth: "none" }}>
        {tpl.description ? <p className="advmuted">{tpl.description}</p> : null}
        <div className="oprice">
          <span>{t("price")}</span>
          <b>{tpl.price ? `${som(tpl.price)} ${t("som")}` : t("free")}</b>
        </div>
        <div className="docchoose">
          <button type="button" className="docchoose__c" onClick={() => setMode("manual")}>
            <span className="docchoose__i"><IconList /></span>
            <b>{t("chooseManual")}</b>
            <span>{t("chooseManualSub")}</span>
          </button>
          <button type="button" className="docchoose__c" onClick={() => setMode("lawyer")}>
            <span className="docchoose__i"><IconHeadset /></span>
            <b>{t("chooseLawyer")}</b>
            <span>{t("chooseLawyerSub")}</span>
          </button>
        </div>
      </div>
    );

  if (mode === "lawyer" && sourceFile?.lawyerFlow)
    return <DocumentLawyerAssist lawyerFlow={sourceFile.lawyerFlow} sourceFile={sourceFile} onBack={() => setMode("choose")} />;

  // key={req.id} so DocumentRequestPanel's own state (stage, answers) resets
  // when "start over" swaps in a brand new request id.
  if (req)
    return (
      <DocumentRequestPanel
        key={req.id}
        initialReq={req}
        fields={tpl.questionnaire}
        templateText={tpl.templateText}
        sourceFile={sourceFile}
        onStartNew={
          tpl.questionnaire.length
            ? () => {
                starting.current = false;
                void start();
              }
            : undefined
        }
      />
    );

  return (
    <div className="cform" style={{ maxWidth: "none" }}>
      {mode !== "manual" || !sourceFile?.lawyerFlow ? null : (
        <button type="button" className="rf__link" onClick={() => setMode("choose")}>
          <IconChevronLeft />
          {t("backToChoices")}
        </button>
      )}
      {tpl.description ? <p className="advmuted">{tpl.description}</p> : null}
      <div className="oprice">
        <span>{t("price")}</span>
        <b>{tpl.price ? `${som(tpl.price)} ${t("som")}` : t("free")}</b>
      </div>
      {err ? <Notice ok={false} msg={t("error")} /> : null}
      {/* Live only once the resume lookup has answered: clicking before then
          creates a second, separately-payable request for a template this
          client had already started. */}
      <button className="btn btn--grad btn--full btn--lg" type="button" onClick={start} disabled={busy || !resumed}>
        {busy || !resumed ? t("processingShort") : t("continue")}
      </button>
    </div>
  );
}
