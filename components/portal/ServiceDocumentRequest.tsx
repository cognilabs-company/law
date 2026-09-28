"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getServiceDocumentTemplate,
  getServiceDocumentFields,
  createServiceDocumentRequest,
  listDocumentRequests,
  getDocumentRequest,
  isLawyerHeld,
  type BackendTemplate,
  type DocumentRequest,
  type ServiceDocumentFields,
} from "@/lib/services/backend";
import DocumentRequestPanel from "./DocumentRequestPanel";
import DocumentLawyerAssist from "./DocumentLawyerAssist";
import ManualDocPlanGate from "./ManualDocPlanGate";
import { lawyerPendingNote } from "./DocFill";
import { Skeleton } from "./DataState";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { ApiError, errDetail } from "@/lib/http";
import { statusLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { IconList, IconHeadset, IconChevronLeft, IconLock } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

type Mode = "choose" | "manual" | "lawyer";

// FRONTEND_DOCUMENT_GENERATION.md "Asosiy Flow": a catalog service with a
// document_template_id runs the answers → pay → generate → download
// lifecycle (DocumentRequestPanel), with the request created through the
// service — GET /services/{id}/document-template, POST /services/{id}/document-requests.
export default function ServiceDocumentRequest({
  serviceId,
  onTitle,
  onDraftId,
  initialMode,
}: {
  serviceId: string;
  onTitle?: (title: string) => void;
  // The id the builder's localStorage draft is keyed on, reported upwards so
  // the page chrome can clear it when the client chooses to leave.
  onDraftId?: (id: string) => void;
  // The services card's "Advokatga yo'llash" button lands here already
  // decided — it is the same journey as picking "Advokat bilan tayyorlash"
  // on the chooser, so it skips the chooser instead of opening a second,
  // unrelated advocate-marketplace order.
  initialMode?: "lawyer";
}) {
  const t = useTranslations("portal.client.documents");
  const tc = useTranslations("portal.common");
  const [tpl, setTpl] = useState<BackendTemplate | null>(null);
  const [sourceFile, setSourceFile] = useState<ServiceDocumentFields | null>(null);
  const [req, setReq] = useState<DocumentRequest | null>(null);
  // The client's separate advocate request for this same template, when one
  // is still in flight. Deliberately not `req`: it is not the row the
  // constructor fills in, and treating it as one is what made the
  // constructor unreachable (see the resume lookup below).
  const [lawyerHeld, setLawyerHeld] = useState<DocumentRequest | null>(null);
  // "Ishingiz Navbatchi advokatga berildi — baribir konstruktorni ochamizmi?"
  const [gateOpen, setGateOpen] = useState(false);
  // Reported upwards rather than read from a ref during render, so the page
  // chrome always has the id of the draft currently on screen.
  const onDraftIdRef = useRef(onDraftId);
  useEffect(() => { onDraftIdRef.current = onDraftId; }, [onDraftId]);
  useEffect(() => { onDraftIdRef.current?.(req?.id ?? ""); }, [req?.id]);
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
  const [mode, setMode] = useState<Mode>(initialMode ?? "manual");
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
    setLawyerHeld(null);
    setGateOpen(false);
    setLoading(true);
    setErr(false);
    setResumed(false);
    setMode(initialMode ?? "manual");
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
        // A caller that asked for the lawyer flow keeps it; the chooser is
        // only for someone who arrived without having decided.
        if (f?.lawyerFlow) setMode(initialMode ?? "choose");
        onTitle?.(r.name);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 402 && e.code === "manual_document_plan_required") setPlanRequired(errDetail(e) || t("planRequired"));
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
  //
  // One template can carry two of this client's rows at once: the row the
  // constructor fills in, and a separate row created by the advocate flow
  // (document_type "lawyer_assisted_service_document" — it never converts
  // the constructor's row). The list is newest-first, so a single find()
  // resumed whichever was created last, and once that was the advocate row
  // the panel below rendered its "Advokat ishni oldi" wait screen for every
  // visit — the constructor became unreachable, which is what the GM
  // reported. The list rows carry no document_type, so the two are told
  // apart by status (isLawyerHeld) and kept in separate state from here on.
  useEffect(() => {
    if (!tpl) return;
    let alive = true;
    listDocumentRequests()
      .then((rows) => {
        const mine = rows.filter((r) => r.templateId === tpl.id);
        const own = mine.find((r) => !isLawyerHeld(r));
        const held = mine.find((r) => isLawyerHeld(r));
        return Promise.all([
          own ? getDocumentRequest(own.id) : null,
          // Fetched in full because only the detail response carries the
          // work_id the block quotes back at the client; a detail fetch that
          // fails falls back to the thin list row rather than silently
          // lifting the block.
          held ? getDocumentRequest(held.id).catch(() => held) : null,
        ]).then(([ownReq, heldReq]) => {
          if (!alive) return;
          setLawyerHeld(heldReq);
          // A request created while this lookup was in flight wins.
          if (ownReq && !starting.current) setReq((cur) => cur ?? ownReq);
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

  // "Ha, konstruktorni ochaman" on the gate below. Their own constructor row
  // reopens when the resume lookup found one, otherwise this creates it —
  // which is why the gate's confirm waits for `resumed`, exactly as the
  // "Davom etish" button further down does. The advocate's row is never
  // touched: that work carries on whatever the client decides here.
  function openConstructor() {
    setGateOpen(false);
    setMode("manual");
    if (!req) void start();
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

  // What the advocate's row is doing right now, in the client's language, and
  // the one sentence every blocked advocate control shows.
  const heldStatus = lawyerHeld ? statusLabel(tc, lawyerHeld.status, "docStatus") : "";
  const heldNote = lawyerHeld ? lawyerPendingNote(t, heldStatus, lawyerHeld.workId) : "";

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
          {/* An advocate holding the document does not take the constructor
              away — it asks first, because filling it in here means starting
              the document from scratch while that advocate is already
              working on the same thing. */}
          <button type="button" className="docchoose__c" onClick={() => (lawyerHeld ? setGateOpen(true) : setMode("manual"))}>
            <span className="docchoose__i"><IconList /></span>
            <b>{t("chooseManual")}</b>
            <span>{t("chooseManualSub")}</span>
          </button>
          {/* Still opens, but on to the wait screen for the request they
              already sent rather than a form that would send a second one. */}
          <button type="button" className={`docchoose__c${lawyerHeld ? " docchoose__c--held" : ""}`} onClick={() => setMode("lawyer")}>
            <span className="docchoose__i"><IconHeadset /></span>
            <b>{t("chooseLawyer")}</b>
            <span>{lawyerHeld ? t("lawyerPendingStatus", { status: heldStatus }) : t("chooseLawyerSub")}</span>
          </button>
        </div>

        <Modal open={gateOpen} onClose={() => setGateOpen(false)} title={t("lawyerGateTitle")}>
          <div className="cform" style={{ maxWidth: "none" }}>
            <p className="dexit__lead">
              <span className="dexit__i"><IconHeadset /></span>
              {t("lawyerGateLead")}
            </p>
            <p className="dgate__meta">
              <span>{t("lawyerPendingStatus", { status: heldStatus })}</span>
              {lawyerHeld?.workId ? <span>{t("lawyerPendingWork", { id: lawyerHeld.workId })}</span> : null}
            </p>
            <div className="dexit__btns">
              <button type="button" className="btn btn--line btn--full" onClick={() => { setGateOpen(false); setMode("lawyer"); }}>
                {t("lawyerGateWait")}
              </button>
              {/* Same rule as "Davom etish" below: confirming before the
                  resume lookup has answered would create a second,
                  separately-payable constructor row. */}
              <button type="button" className="btn btn--grad btn--full" onClick={openConstructor} disabled={!resumed}>
                {resumed ? t("lawyerGateOpen") : t("processingShort")}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );

  // An advocate is already handling a request for this document, so the
  // request form is replaced by the refusal and by the wait screen for the
  // request they already have. Nothing on the backend would stop a second
  // row being created here — two live lawyer_review rows on one template
  // were found in production on 2026-09-28.
  if (lawyerHeld && mode === "lawyer")
    return (
      <>
        <div className="cform" style={{ maxWidth: "none" }}>
          {initialMode ? null : (
            <button type="button" className="rf__link" onClick={() => setMode("choose")}>
              <IconChevronLeft />
              {t("backToChoices")}
            </button>
          )}
          <div className="docassist__head">
            <span className="docassist__i docassist__i--lawyer"><IconHeadset /></span>
            <div>
              <b>{t("lawyerPendingTitle")}</b>
              <p className="advmuted">{t("lawyerPendingLead")}</p>
              <p className="dgate__meta">
                <span>{t("lawyerPendingStatus", { status: heldStatus })}</span>
                {lawyerHeld.workId ? <span>{t("lawyerPendingWork", { id: lawyerHeld.workId })}</span> : null}
              </p>
            </div>
          </div>
        </div>
        {/* The same wait screen the advocate flow itself ends on, so the
            client keeps the status, the chat and the finished file here. */}
        <DocumentRequestPanel key={lawyerHeld.id} initialReq={lawyerHeld} fields={[]} sourceFile={sourceFile} />
      </>
    );

  if (mode === "lawyer" && sourceFile?.lawyerFlow)
    return <DocumentLawyerAssist lawyerFlow={sourceFile.lawyerFlow} sourceFile={sourceFile} onBack={() => setMode("choose")} />;

  if (initialMode === "lawyer" && !sourceFile?.lawyerFlow)
    return (
      <div className="cform" style={{ maxWidth: "none" }}>
        <Notice ok={false} msg={t("lawyerNotAvailable")} />
      </div>
    );

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
        lawyerHeldNote={heldNote}
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
