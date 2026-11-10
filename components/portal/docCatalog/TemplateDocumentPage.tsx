"use client";

import "./docCatalog.css";
import "./catalog1920.css";
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import DocumentRequestPanel from "@/components/portal/DocumentRequestPanel";
import ManualDocPlanGate from "@/components/portal/ManualDocPlanGate";
import { constructorView } from "@/components/portal/ServiceDocumentRequest";
import { EmptyState, ErrorState } from "@/components/portal/DataState";
import { useLxHeader } from "@/components/portal/shell/lxHeader";
import { IconCheck, IconChevronLeft, IconFileText, IconUsers } from "@/components/icons";
import { ApiError, errDetail, http } from "@/lib/http";
import { notify } from "@/lib/toast";
import { saveBlob } from "@/lib/download";
import { statusLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import {
  createDocumentRequest,
  getDocumentRequest,
  isLawyerHeld,
  listDocumentRequests,
  normTemplate,
  requestDocumentLawyerReviewGated,
  type BackendTemplate,
  type DocPaymentGate,
  type DocumentRequest,
} from "@/lib/services/backend";
import { getDocumentTemplateCleanFile, normTemplateCard, renderDocumentTemplate, type TemplateCard } from "@/lib/services/docTemplates";
import { templateImage } from "./images";

// A ready template on its own page (§3.2): the document as the backend
// renders it, and the three ways to get it — fill it in yourself, hand it to
// the duty lawyer, or take the clean DOCX. No linked service is needed: the
// request goes through the generic /document-requests flow (§7, §11.4), and
// the existing DocumentRequestPanel carries it from answers to the file.

type Loaded = { status: "loading" | "ready" | "missing" | "error"; tpl?: BackendTemplate; card?: TemplateCard; error?: unknown };
type View = { kind: "detail" } | { kind: "lawyer" } | { kind: "work"; req: DocumentRequest; gate?: DocPaymentGate | null };

// The dashboard's pictures: a family-D drawing on the light plate for the
// document, the black line drawings (public/img/xizmatlar) in white circles
// for the ways to get it (catalog1920.css).
const plate = (src: string) => ({ "--img": `url(${src})` }) as CSSProperties;
const art = (name: string) => ({ "--art": `url(/img/xizmatlar/${name}.webp)` }) as CSSProperties;
// The resume pill's tone, by the request's status.
const pillTone = (status: string) =>
  /ready|complete|done|generated/.test(status) ? "cx-pill--ok" : /payment|pending|wait/.test(status) ? "cx-pill--warn" : "cx-pill--blue";
const DONE =new Set(["cancelled", "canceled", "payment_cancelled", "payment_rejected"]);

// Blanks the client will fill — "{Field name}" markers and long underscores —
// marked so the page shows what the constructor asks for.
function withBlanks(text: string): ReactNode[] {
  return text.split(/(\{[^{}\n]{1,160}\}|_{5,})/g).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="tdoc__blank">
        {part.startsWith("{") ? part.slice(1, -1) : "…"}
      </mark>
    ) : (
      part
    ),
  );
}

export default function TemplateDocumentPage({ templateId }: { templateId: string }) {
  const t = useTranslations("portal.client.services.tpl");
  const ts = useTranslations("portal.client.services");
  const tl = useTranslations("lxCatalog");
  const tc = useTranslations("portal.common");
  const uid = useId();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  // The shell's big title is the document's own name (the breadcrumb keeps
  // "Huquqiy hujjatlar"), so the page does not draw a second one.
  useLxHeader(loaded.status === "ready" ? loaded.card?.title || undefined : undefined);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{ status: "loading" | "ready" | "error"; text: string }>({ status: "loading", text: "" });
  const [existing, setExisting] = useState<DocumentRequest | null>(null);
  const [view, setView] = useState<View>({ kind: "detail" });
  const [busy, setBusy] = useState<"" | "fill" | "lawyer" | "download" | "resume">("");
  const [gate, setGate] = useState<string | null>(null);
  const [need, setNeed] = useState("");
  const [docType, setDocType] = useState("");
  const [needErr, setNeedErr] = useState(false);

  // ?request=<id> (from "My documents"): that request opens in the builder
  // straight away. A row an advocate holds is shown as its constructor, the
  // same unwrapping the service builder applies.
  const requested = useSearchParams().get("request") ?? "";
  useEffect(() => {
    if (!requested) return;
    let alive = true;
    getDocumentRequest(requested).then(
      (r) => {
        if (!alive) return;
        setView({ kind: "work", req: isLawyerHeld(r) ? constructorView(r) : r });
        const url = new URL(window.location.href);
        url.searchParams.delete("request");
        window.history.replaceState(window.history.state, "", url.toString());
      },
      (e) => alive && notify.error(t("startError"), { error: e }),
    );
    return () => {
      alive = false;
    };
  }, [requested, t]);

  // §5.3: the template's own record is the source of truth once opened.
  useEffect(() => {
    const ctl = new AbortController();
    http(`/document-templates/${encodeURIComponent(templateId)}`, { signal: ctl.signal }).then(
      (raw) => {
        if (ctl.signal.aborted) return;
        const card = normTemplateCard(raw);
        setLoaded({ status: "ready", tpl: normTemplate(raw), card });
        setDocType((cur) => cur || card.title);
      },
      (error) => !ctl.signal.aborted && setLoaded({ status: error instanceof ApiError && error.status === 404 ? "missing" : "error", error }),
    );
    return () => ctl.abort();
  }, [templateId, attempt]);

  // §6: the backend's rendering; the template text itself if that fails.
  const tpl = loaded.tpl;
  useEffect(() => {
    if (!tpl) return;
    const ctl = new AbortController();
    renderDocumentTemplate(templateId, {}, ctl.signal).then(
      (r) => !ctl.signal.aborted && setPreview({ status: "ready", text: r.text || tpl.templateText }),
      () => !ctl.signal.aborted && setPreview({ status: tpl.templateText ? "ready" : "error", text: tpl.templateText }),
    );
    return () => ctl.abort();
  }, [templateId, tpl]);

  // §11.5: one live request per document — an open one is continued, never
  // duplicated.
  useEffect(() => {
    let alive = true;
    listDocumentRequests().then(
      (list) => {
        if (!alive) return;
        const mine = list.filter((r) => r.templateId === templateId && !DONE.has(r.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setExisting(mine[0] ?? null);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [templateId]);

  const planGate = (e: unknown): boolean => {
    if (e instanceof ApiError && e.status === 402) {
      setGate(errDetail(e) || t("planRequired"));
      return true;
    }
    return false;
  };

  const newRequest = () =>
    createDocumentRequest({ template_id: templateId, document_type: "document", title: tpl?.name || loaded.card?.title || "", questionnaire: [], answers: {}, price: 0 });

  async function startFill() {
    if (busy) return;
    setBusy("fill");
    try {
      setView({ kind: "work", req: existing ?? (await newRequest()) });
    } catch (e) {
      if (!planGate(e)) notify.error(t("startError"), { error: e });
    } finally {
      setBusy("");
    }
  }

  async function resume() {
    if (!existing || busy) return;
    setBusy("resume");
    try {
      setView({ kind: "work", req: await getDocumentRequest(existing.id) });
    } catch (e) {
      notify.error(t("startError"), { error: e });
    } finally {
      setBusy("");
    }
  }

  async function sendToLawyer() {
    if (busy) return;
    if (!need.trim()) {
      setNeedErr(true);
      document.getElementById(`${uid}-need`)?.focus();
      return;
    }
    setBusy("lawyer");
    try {
      const base = existing ?? (await newRequest());
      const r = await requestDocumentLawyerReviewGated(base.id, need.trim(), docType.trim() || undefined);
      if (r.alreadyExists || !r.canSendLawyerRequest) notify.info(r.message || t("alreadySent"));
      else notify.success(t("sent"));
      setExisting(r.request);
      setView({ kind: "work", req: r.request, gate: r.gate });
    } catch (e) {
      if (planGate(e)) return;
      if (e instanceof ApiError && e.status === 409) {
        notify.info(errDetail(e) || t("alreadySent"));
        if (existing) void resume();
        return;
      }
      notify.error(t("sendError"), { error: e });
    } finally {
      setBusy("");
    }
  }

  async function download() {
    if (busy || !loaded.card) return;
    setBusy("download");
    try {
      const { blob, name } = await getDocumentTemplateCleanFile(templateId);
      saveBlob(blob, name || `${loaded.card.title}.docx`);
    } catch (e) {
      if (!planGate(e)) notify.error(t("downloadError"), { error: e });
    } finally {
      setBusy("");
    }
  }

  const catalogHref = `/portal/client/services${loaded.card?.category ? `?cat=${encodeURIComponent(loaded.card.category)}` : ""}`;
  const back = (
    <Link href={catalogHref} className="tdp__back cx-link" data-ai-id="documents.template.back">
      <IconChevronLeft aria-hidden="true" />
      {t("back")}
    </Link>
  );

  if (loaded.status === "loading") {
    return (
      <div className="tdp" aria-busy="true">
        {back}
        <div className="tdp__hero tdp__sum">
          <span className="tcard__img lxc-plate tdp__art cx-skel" aria-hidden="true" />
          <span className="tdp__hero-t">
            <b>{t("loadingOne")}</b>
          </span>
        </div>
      </div>
    );
  }
  if (loaded.status === "missing") {
    return (
      <div className="tdp">
        {back}
        <div className="tdp__state lx-card">
          <EmptyState
            icon={<IconFileText />}
            title={t("missing")}
            text={t("missingText")}
            action={
              <Link href="/portal/client/services" className="btn btn--pri btn--sm">
                {tl("toCatalog")}
              </Link>
            }
          />
        </div>
      </div>
    );
  }
  if (loaded.status === "error" || !tpl || !loaded.card) {
    return (
      <div className="tdp">
        {back}
        <div className="tdp__state lx-card">
          <ErrorState error={loaded.error} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      </div>
    );
  }

  const card = loaded.card;
  const catName = t.has(`cat.${card.category}`) ? t(`cat.${card.category}`) : card.category;
  const langName = t.has(`lang.${card.language}`) ? t(`lang.${card.language}`) : card.language;
  const img = templateImage(card.title, card.category);
  const nFields = tpl.questionnaire.length;

  // The document in one quiet card: its picture on the light plate, the
  // facts as grey chips, what it is, and the price. Its name is the shell's
  // title above, so it is not repeated here.
  const hero = (
    <header className="tdp__hero tdp__sum">
      <span className={`tcard__img lxc-plate tdp__art${img.square === img.wide ? " lxc-plate--wide" : ""}`} style={plate(img.square)} aria-hidden="true" />
      <span className="tdp__hero-t">
        <span className="tcard__meta">
          <span className="tchip cx-tag">{catName}</span>
          {card.language ? <span className="tchip tchip--soft cx-tag">{langName}</span> : null}
          {card.hasSourceFile ? <span className="tchip tchip--ok cx-tag">DOCX</span> : null}
        </span>
        {card.description ? <p>{card.description}</p> : null}
      </span>
      <span className="tdp__price">
        {card.price > 0 ? (
          <>
            <small>{ts("price")}</small>
            <b>
              {fmtUzs(card.price)} {ts("som")}
            </b>
          </>
        ) : (
          <span className="cx-pill cx-pill--ok">{t("freeView")}</span>
        )}
      </span>
    </header>
  );

  const toDetail = (
    <button type="button" className="tdp__back cx-link" onClick={() => setView({ kind: "detail" })} data-ai-id="documents.template.to-detail">
      <IconChevronLeft aria-hidden="true" />
      {t("toDetail")}
    </button>
  );

  return (
    <div className="tdp" data-ai-id="documents.template" data-ai-type="section" data-ai-entity-type="document_template" data-ai-entity-id={templateId}>
      {view.kind === "detail" ? back : toDetail}
      {hero}

      {view.kind === "work" ? (
        <DocumentRequestPanel
          key={view.req.id}
          initialReq={view.req}
          initialGate={view.gate ?? null}
          fields={tpl.questionnaire}
          templateText={tpl.templateText}
          onStartNew={() => {
            setExisting(null);
            setView({ kind: "detail" });
          }}
        />
      ) : view.kind === "lawyer" ? (
        <section className="tlaw lx-card" aria-labelledby={`${uid}-lh`}>
          <div className="tlaw__head">
            <span className="tlaw__art" style={art("Tezkor_Advokat")} aria-hidden="true" />
            <span className="tlaw__headt">
              <h2 id={`${uid}-lh`}>{t("lawyer")}</h2>
              <span className="lx-sub">{t("lawyerSub")}</span>
            </span>
          </div>
          <p className="tlaw__pool">
            <IconUsers aria-hidden="true" />
            <span>{t("pool")}</span>
          </p>
          <label>
            {t("needLabel")}
            <textarea
              id={`${uid}-need`}
              value={need}
              maxLength={4000}
              placeholder={t("needPh")}
              aria-invalid={needErr || undefined}
              aria-describedby={`${uid}-guide`}
              onChange={(e) => {
                setNeed(e.target.value);
                if (needErr) setNeedErr(false);
              }}
              data-ai-id="documents.template.lawyer.need"
            />
            <p id={`${uid}-guide`} className="tlaw__guide">
              {t("guide")}
            </p>
            {needErr ? <span className="tlaw__err">{t("needRequired")}</span> : null}
          </label>
          <label>
            {t("typeLabel")}
            <input value={docType} maxLength={200} onChange={(e) => setDocType(e.target.value)} data-ai-id="documents.template.lawyer.type" />
          </label>
          <div className="tlaw__acts">
            <button type="button" className="btn btn--line" onClick={() => setView({ kind: "detail" })} disabled={busy === "lawyer"}>
              {t("cancel")}
            </button>
            <button type="button" className="btn btn--pri" onClick={() => void sendToLawyer()} disabled={busy === "lawyer"} data-ai-id="documents.template.lawyer.send">
              {busy === "lawyer" ? t("sending") : t("send")}
            </button>
          </div>
        </section>
      ) : (
        <div className="tdp__grid">
          <section className="tdp__sec lx-card" aria-labelledby={`${uid}-ph`}>
            <div className="tdp__sec-h">
              <h2 id={`${uid}-ph`} className="cx-h3">
                {t("preview")}
              </h2>
              <small>{nFields ? t("previewLead", { n: nFields }) : t("previewLeadNone")}</small>
            </div>
            {preview.status === "loading" ? (
              <div className="tdoc tdoc--ghost" aria-busy="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
            ) : preview.status === "error" ? (
              <EmptyState icon={<IconFileText />} title={t("previewError")} />
            ) : (
              <article className="tdoc" aria-label={card.title} data-ai-id="documents.template.preview">
                {withBlanks(preview.text)}
              </article>
            )}
          </section>
          <aside className="tdp__aside">
            {/* One white card: the open work on this document (if any), as the
                dashboard's in-progress item, then the three ways to get it,
                each with its picture in a white circle. */}
            <div className="tact lx-card">
              {existing ? (
                <div className="tact--resume cx-work">
                  <b className="cx-work__t">{t("resumeTitle")}</b>
                  <span className="tact__st">
                    <span className={`cx-pill ${pillTone(existing.status)}`}>{statusLabel(tc, existing.status, "docStatus")}</span>
                    {existing.workId ? <small className="cx-work__meta">{existing.workId}</small> : null}
                  </span>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => void resume()} disabled={!!busy} data-ai-id="documents.template.resume">
                    {t("resume")}
                  </button>
                </div>
              ) : null}
              <h2 className="cx-h3">{t("how")}</h2>
              <div className="tact__opts">
                <button type="button" className="tact__opt" data-k="fill" onClick={() => void startFill()} disabled={!!busy} data-ai-id="documents.template.fill">
                  <span className="tact__art" style={art("Huquqiy_hujjatlar")} aria-hidden="true" />
                  <span className="tact__t">
                    <b>{busy === "fill" ? t("starting") : t("fill")}</b>
                    <small>{nFields ? t("fillSub", { n: nFields }) : t("fillSubNone")}</small>
                  </span>
                </button>
                <button type="button" className="tact__opt" data-k="lawyer" onClick={() => setView({ kind: "lawyer" })} disabled={!!busy} data-ai-id="documents.template.lawyer">
                  <span className="tact__art" style={art("Tezkor_Advokat")} aria-hidden="true" />
                  <span className="tact__t">
                    <b>{t("lawyer")}</b>
                    <small>{t("lawyerSub")}</small>
                  </span>
                </button>
                {card.hasSourceFile ? (
                  <button type="button" className="tact__opt" data-k="download" onClick={() => void download()} disabled={!!busy} data-ai-id="documents.template.download">
                    <span className="tact__art" style={art("Hujjat_tayyor")} aria-hidden="true" />
                    <span className="tact__t">
                      <b>{busy === "download" ? t("downloading") : t("download")}</b>
                      <small>{t("downloadSub")}</small>
                    </span>
                  </button>
                ) : null}
              </div>
              <p className="tact__note">
                <IconCheck aria-hidden="true" />
                {t("freeNote")}
              </p>
            </div>
          </aside>
        </div>
      )}

      <ManualDocPlanGate open={gate !== null} onClose={() => setGate(null)} message={gate ?? ""} />
    </div>
  );
}
