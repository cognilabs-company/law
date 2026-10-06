"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getServiceDocumentTemplate,
  getServiceDocumentFields,
  createServiceDocumentRequest,
  listDocumentRequests,
  listClientDocumentFlowPage,
  getDocumentRequest,
  isLawyerHeld,
  type BackendTemplate,
  type ClientDocFlowItem,
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
import { aiId } from "@/lib/ai/ids";

const som = (n?: number) => (n ? fmtUzs(n) : "");

type Mode = "choose" | "manual" | "lawyer";

// LEXGO_DOCUMENT_TITLE_CONSTRUCTOR_PROMPT_UPDATE_2026-09-29.md §5 L117-122
// hands back the constructor's four URLs as API paths
// ("/document-requests/{request_id}", "…/answers", "…/preview",
// "…/generate"). The id is read out of the URL rather than assumed to be the
// row we were looking at, so a backend that ever points the constructor at a
// different row is followed instead of second-guessed. Measured on
// 2026-09-29: on all 10 live rows that carry them, the id is the row's own.
function docRequestIdOf(url: string): string {
  const m = /\/document-requests\/([^/?#]+)/i.exec(url);
  return m ? m[1] : "";
}

// The advocate-held row as the CONSTRUCTOR has to see it, for §3 L64 ("Ha"
// opens that document's own constructor).
//
// Two things about the live row get in the way, both measured on 2026-09-29
// against GET /document-requests/{held id}:
//   • `status` is "lawyer_review" — that is the ADVOCATE's half of the work,
//     and DocumentRequestPanel keys its stage off it, so handing the row over
//     untouched would answer "Ha" with the advocate's wait screen. §3 L50
//     ("konstruktor butunlay bloklanmaydi") makes constructor_action, not
//     status, the authority on the client's half, and the row really is
//     fillable: it came back with all 26 questionnaire fields.
//   • `answers` is the advocate request's envelope
//     ({mode:"lawyer_pool", need:"…", answers:{}, language:"uz"}), not a
//     field map. The panel reads answers as "field name → value" and PATCHes
//     back what it read, so the envelope is unwrapped (its nested `answers`
//     is the real map) and anything that is not one of this row's own fields
//     is dropped — otherwise the first save would write `need` and `mode`
//     back as answers and `answers` itself as the string "[object Object]".
// Only the copy handed to the panel is changed; the server's row keeps its
// own status, and the panel's PATCH still goes to this row's own
// constructor_answers_url.
function constructorView(r: DocumentRequest): DocumentRequest {
  const env = (r.answers || {}) as Record<string, unknown>;
  const inner = env.answers;
  const src = inner && typeof inner === "object" && !Array.isArray(inner) ? (inner as Record<string, unknown>) : env;
  const names = new Set(r.questionnaire.map((q) => q.name));
  const answers: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) if (names.has(k)) answers[k] = v;
  return { ...r, status: "questionnaire", answers };
}

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
  // The backend's own answer about that same row, from §5 L113-122:
  // lawyer_request_active / can_send_lawyer_request /
  // lawyer_request_block_reason / constructor_action / actions.constructor_*.
  // Null when the join below found nothing for it — a deployment that sends
  // none of it, or a row past the first filtered page — and only then does
  // the old status guess (isLawyerHeld) decide what this screen shows.
  const [heldGate, setHeldGate] = useState<ClientDocFlowItem | null>(null);
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
    setHeldGate(null);
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
  //
  // Since 2026-09-29 that guess is only the fallback: the constructor-prompt
  // MD §5 L113-115 has the backend answering the question outright with
  // lawyer_request_active / can_send_lawyer_request /
  // lawyer_request_block_reason. It answers it on ONE endpoint, though —
  // measured against production on 2026-09-29, all 50 rows of GET
  // /document-requests/service-flow carry the new block, while GET
  // /document-requests (114 rows of {id, template_id, title, status, price,
  // currency, created_at}) and GET /document-requests/{id} carry none of it.
  // The thin list is still what says which rows belong to THIS template —
  // service-flow keeps the template id inside `document_request`, which
  // ClientDocFlowItem does not expose — so the two are fetched separately and
  // joined by request id.
  useEffect(() => {
    if (!tpl) return;
    let alive = true;
    listDocumentRequests()
      .then(async (rows) => {
        const mine = rows.filter((r) => r.templateId === tpl.id);
        // Only the statuses that could be holding this template are asked
        // for, and only when one of them is actually present: every one of
        // the 19 rows with lawyer_request_active=true on this account sits in
        // lawyer_review or open_pool, and a status-filtered page is 45KB /
        // 25KB against 270KB for an unfiltered 100-row page.
        const gate = new Map<string, ClientDocFlowItem>();
        const statuses = [...new Set(mine.filter((r) => isLawyerHeld(r)).map((r) => r.status))];
        if (statuses.length) {
          const pages = await Promise.all(
            statuses.map((status) => listClientDocumentFlowPage({ status, limit: 100, offset: 0 }).catch(() => null)),
          );
          for (const p of pages) for (const it of p?.items ?? []) gate.set(it.id, it);
        }
        // Authoritative: the server's lawyer_request_active. isLawyerHeld is
        // consulted only for a row the join never saw.
        const held = mine.find((r) => gate.get(r.id)?.lawyerRequestActive ?? isLawyerHeld(r)) ?? null;
        // The constructor's own row is still told apart by status, because
        // the thin list carries nothing else: a row whose status says an
        // advocate has it must not be opened as the client's own even after
        // the hold is released (1 of the 50 live rows is exactly that — status
        // lawyer_review, lawyer_request_active false).
        const own = mine.find((r) => r !== held && !isLawyerHeld(r)) ?? null;
        const [ownReq, heldReq] = await Promise.all([
          own ? getDocumentRequest(own.id) : null,
          // Fetched in full because only the detail response carries the
          // work_id the block quotes back at the client — and, for the held
          // row, the questionnaire the constructor fills in; a detail fetch
          // that fails falls back to the thin list row rather than silently
          // lifting the block.
          held ? getDocumentRequest(held.id).catch(() => held) : null,
        ]);
        if (!alive) return;
        setLawyerHeld(heldReq);
        setHeldGate(held ? gate.get(held.id) ?? null : null);
        // A request created while this lookup was in flight wins.
        if (ownReq && !starting.current) setReq((cur) => cur ?? ownReq);
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

  // §3 L74 + §5 L116: whether the constructor asks before it opens is the
  // backend's call now, not ours. constructor_action.prompt_required is true
  // on exactly the rows an advocate is actively holding (10 of the 50 live
  // rows on 2026-09-29) and false everywhere else, while
  // constructor_action.available is independent of the hold — so the prompt
  // flag is what the two-button modal hangs on, and the old "is there a held
  // row at all" guess is the fallback for a deployment that sends nothing.
  const ca = heldGate?.constructorAction ?? null;
  const askFirst = ca ? ca.promptRequired : !!lawyerHeld;
  // The modal's words, from the server. Checked character by character on
  // 2026-09-29: `title` IS byte-identical to portal.client.documents
  // .lawyerGateTitle, but `message` is not the local lead at all — the server
  // asks one question ("Konstruktor orqali hujjatni o'zingiz ham to'ldirishni
  // davom ettirasizmi?") where ours still promised a document filled in "0
  // dan", which stopped being true the moment the backend started handing
  // back the held row's own constructor (§3 L64). The server's wins; the
  // local strings stay as the fallback.
  const gateTitle = ca?.title || t("lawyerGateTitle");
  const gateMessage = ca?.message || t("lawyerGateLead");
  // §5 L114-115: may another advocate request be sent for this document, and
  // in the backend's own words, why not. Its sentence differs from the local
  // one too ("Ish yakunlangandan keyin qayta yuborish mumkin" against our
  // "Ish yakunlanmaguncha yangi so'rov yubora olmaysiz"), so the server's is
  // the one every blocked advocate control on this screen shows.
  const canSendLawyer = heldGate ? heldGate.canSendLawyerRequest : !lawyerHeld;
  const blockReason = canSendLawyer ? "" : heldGate?.lawyerRequestBlockReason || "";

  // "Ha, konstruktorni ochaman" on the gate below. §3 L64 + §5 L117-122: the
  // backend hands back the HELD document's own constructor —
  // actions.constructor_continue_url is /document-requests/{that row's id} on
  // every live row that carries it — so this reopens that row instead of
  // creating the second, separately payable request it used to create. The
  // advocate's work is not touched: it carries on in the same row whatever
  // the client fills in here.
  function openConstructor() {
    setGateOpen(false);
    setMode("manual");
    const continueId = docRequestIdOf(heldGate?.constructorUrls.continueUrl || ca?.continueUrl || "");
    if (continueId && lawyerHeld && continueId === lawyerHeld.id) {
      setReq(constructorView(lawyerHeld));
      return;
    }
    // Nothing came back to continue (older deployment, or a row the backend
    // does not offer a constructor for): their own row if the resume lookup
    // found one, otherwise a fresh request — the pre-2026-09-29 behaviour,
    // unchanged. This is why the gate's confirm waits for `resumed`, exactly
    // as the "Davom etish" button further down does.
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
  // the one sentence every blocked advocate control shows — the backend's own
  // refusal when it sent one (§5 L115), with the locally composed note as the
  // fallback, so the facts it adds (status, work id) survive either way.
  const heldStatus = lawyerHeld ? statusLabel(tc, lawyerHeld.status, "docStatus") : "";
  const heldFacts = [blockReason, heldStatus ? t("lawyerPendingStatus", { status: heldStatus }) : "", lawyerHeld?.workId ? t("lawyerPendingWork", { id: lawyerHeld.workId }) : ""].filter(Boolean);
  const heldNote = blockReason ? heldFacts.join(" · ") : lawyerHeld ? lawyerPendingNote(t, heldStatus, lawyerHeld.workId) : "";

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

  const tplKey = sourceFile?.templateId || tpl.id;
  const tplAi = tplKey ? aiId("documents.template", tplKey) : "";

  if (mode === "choose")
    return (
      <div className="cform" style={{ maxWidth: "none" }}>
        {tpl.description ? <p className="advmuted">{tpl.description}</p> : null}
        <div className="oprice">
          <span>{t("price")}</span>
          <b>{tpl.price ? `${som(tpl.price)} ${t("som")}` : t("free")}</b>
        </div>
        <div className="docchoose" data-ai-id="documents.constructor.mode" data-ai-type="section" data-ai-entity-type="service" data-ai-entity-id={serviceId}>
          {/* An advocate holding the document does not take the constructor
              away — §3 L50 is explicit about that, and §3 L74 says it asks
              first only while constructor_action.prompt_required is true. */}
          <button
            type="button"
            className="docchoose__c"
            onClick={() => (askFirst ? setGateOpen(true) : setMode("manual"))}
            data-ai-id={tplAi ? aiId(tplAi, "manual") : undefined}
          >
            <span className="docchoose__i"><IconList /></span>
            <b>{t("chooseManual")}</b>
            <span>{t("chooseManualSub")}</span>
          </button>
          {/* Still opens, but on to the wait screen for the request they
              already sent rather than a form that would send a second one.
              The sub-line is the backend's own refusal (§5 L115) once
              can_send_lawyer_request is false, so the card says why before it
              is pressed rather than only after. */}
          <button
            type="button"
            className={`docchoose__c${canSendLawyer ? "" : " docchoose__c--held"}`}
            onClick={() => setMode("lawyer")}
            data-ai-id={tplAi ? aiId(tplAi, "lawyer") : undefined}
          >
            <span className="docchoose__i"><IconHeadset /></span>
            <b>{t("chooseLawyer")}</b>
            <span>{canSendLawyer ? t("chooseLawyerSub") : blockReason || t("lawyerPendingStatus", { status: heldStatus })}</span>
          </button>
        </div>

        {/* §3 L74 + §5 L116: title and message are the server's, the two
            button labels stay local — the backend names the two actions
            ("open_constructor" / "wait_for_lawyer") but sends no wording for
            them. */}
        <Modal open={gateOpen} onClose={() => setGateOpen(false)} title={gateTitle}>
          <div className="cform" style={{ maxWidth: "none" }} data-ai-id="documents.constructor.lawyer-gate" data-ai-type="modal" data-ai-label={gateTitle}>
            <p className="dexit__lead">
              <span className="dexit__i"><IconHeadset /></span>
              {gateMessage}
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
  // were found in production on 2026-09-28. §4 L80 has the backend refusing
  // the repeat itself now, and §5 L115 sends the sentence it refuses with,
  // which is the one shown below.
  if (lawyerHeld && mode === "lawyer")
    return (
      <>
        <div className="cform" style={{ maxWidth: "none" }} data-ai-id="documents.lawyer.pending" data-ai-type="section" data-ai-entity-type="document_request" data-ai-entity-id={lawyerHeld.id}>
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
              <p className="advmuted">{blockReason || t("lawyerPendingLead")}</p>
              <p className="dgate__meta">
                <span>{t("lawyerPendingStatus", { status: heldStatus })}</span>
                {lawyerHeld.workId ? <span>{t("lawyerPendingWork", { id: lawyerHeld.workId })}</span> : null}
              </p>
            </div>
          </div>
          {/* §3 L50: being with an advocate no longer blocks the constructor
              outright, so the way back into it is offered here too — this
              screen is where a client who arrived with initialMode="lawyer"
              lands, and they never see the chooser that carries the other
              one. Shown only while the backend actually offers the
              constructor for this row (constructor_action.available: true on
              10 of the 50 live rows, false on the 9 held rows that have no
              template behind them). */}
          {ca?.available && (heldGate?.constructorUrls.continueUrl || ca.continueUrl) ? (
            <button type="button" className="btn btn--line btn--full" onClick={openConstructor} disabled={!resumed}>
              <IconList />
              {resumed ? t("lawyerGateOpen") : t("processingShort")}
            </button>
          ) : null}
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
    <div className="cform" style={{ maxWidth: "none" }} data-ai-target="documents:constructor" data-ai-id="documents.constructor.intro" data-ai-type="section" data-ai-entity-type="service" data-ai-entity-id={serviceId}>
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
      <button className="btn btn--grad btn--full btn--lg" type="button" onClick={start} disabled={busy || !resumed} data-ai-id="documents.constructor.start">
        {busy || !resumed ? t("processingShort") : t("continue")}
      </button>
    </div>
  );
}
