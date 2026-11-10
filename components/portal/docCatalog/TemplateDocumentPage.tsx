"use client";

import "./docCatalog.css";
import { useEffect, useId, useState, type ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import DocumentRequestPanel from "@/components/portal/DocumentRequestPanel";
import ManualDocPlanGate from "@/components/portal/ManualDocPlanGate";
import { constructorView } from "@/components/portal/ServiceDocumentRequest";
import { EmptyState, ErrorState } from "@/components/portal/DataState";
import { IconCheck, IconChevronLeft, IconDownload, IconEdit, IconFileText, IconHeadset, IconUsers } from "@/components/icons";
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
import { generalCategoryImage, subcategoryImage } from "./images";

// A ready template on its own page (§3.2): the document as the backend
// renders it, and the three ways to get it — fill it in yourself, hand it to
// the duty lawyer, or take the clean DOCX. No linked service is needed: the
// request goes through the generic /document-requests flow (§7, §11.4), and
// the existing DocumentRequestPanel carries it from answers to the file.

type Loaded = { status: "loading" | "ready" | "missing" | "error"; tpl?: BackendTemplate; card?: TemplateCard; error?: unknown };
type View = { kind: "detail" } | { kind: "lawyer" } | { kind: "work"; req: DocumentRequest; gate?: DocPaymentGate | null };

const CATEGORY_IMAGE_NAME: Record<string, string> = {
  "legal-doc-civil": "fuqarolik",
  "legal-doc-criminal": "jinoiy",
  "legal-doc-administrative": "mamuriy",
  "legal-doc-economic": "iqtisodiy",
};
const DONE = new Set(["cancelled", "canceled", "payment_cancelled", "payment_rejected"]);

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
  const tc = useTranslations("portal.common");
  const uid = useId();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
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

  const back = (
    <Link href={`/portal/client/services${loaded.card?.category ? `?cat=${encodeURIComponent(loaded.card.category)}` : ""}`} className="tdp__back" data-ai-id="documents.template.back">
      <IconChevronLeft aria-hidden="true" />
      {t("back")}
    </Link>
  );

  if (loaded.status === "loading") {
    return (
      <div className="tdp" aria-busy="true">
        {back}
        <div className="tdp__hero">
          <span className="tcard__img" />
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
        <EmptyState icon={<IconFileText />} title={t("missing")} text={t("missingText")} />
      </div>
    );
  }
  if (loaded.status === "error" || !tpl || !loaded.card) {
    return (
      <div className="tdp">
        {back}
        <ErrorState error={loaded.error} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  }

  const card = loaded.card;
  const catName = t.has(`cat.${card.category}`) ? t(`cat.${card.category}`) : card.category;
  const langName = t.has(`lang.${card.language}`) ? t(`lang.${card.language}`) : card.language;
  const img = subcategoryImage(card.title) ?? generalCategoryImage(CATEGORY_IMAGE_NAME[card.category] ?? "");
  const nFields = tpl.questionnaire.length;

  const hero = (
    <header className="tdp__hero">
      <span className="tcard__img" aria-hidden="true">
        {img ? <Image src={img} alt="" fill sizes="68px" style={{ objectFit: "contain" }} /> : <IconFileText />}
      </span>
      <span className="tdp__hero-t">
        <span className="tcard__meta">
          <span className="tchip">{catName}</span>
          {card.language ? <span className="tchip tchip--soft">{langName}</span> : null}
          {card.hasSourceFile ? <span className="tchip tchip--ok">DOCX</span> : null}
          <span className="tchip tchip--ok">{card.price > 0 ? fmtUzs(card.price) : t("freeView")}</span>
        </span>
        <h1>{card.title}</h1>
        {card.description ? <p>{card.description}</p> : null}
      </span>
    </header>
  );

  const toDetail = (
    <button type="button" className="tdp__back" onClick={() => setView({ kind: "detail" })} data-ai-id="documents.template.to-detail">
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
        <section className="tlaw" aria-labelledby={`${uid}-lh`}>
          <h2 id={`${uid}-lh`}>
            <IconHeadset aria-hidden="true" />
            {t("lawyer")}
          </h2>
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
            <button type="button" className="btn btn--grad" onClick={() => void sendToLawyer()} disabled={busy === "lawyer"} data-ai-id="documents.template.lawyer.send">
              {busy === "lawyer" ? t("sending") : t("send")}
            </button>
          </div>
        </section>
      ) : (
        <div className="tdp__grid">
          <section className="tdp__sec" aria-labelledby={`${uid}-ph`}>
            <div className="tdp__sec-h">
              <b id={`${uid}-ph`}>{t("preview")}</b>
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
            {existing ? (
              <div className="tact tact--resume">
                <b>{t("resumeTitle")}</b>
                <small>
                  {statusLabel(tc, existing.status, "docStatus")}
                  {existing.workId ? ` · ${existing.workId}` : ""}
                </small>
                <button type="button" className="btn btn--line btn--sm" onClick={() => void resume()} disabled={!!busy} data-ai-id="documents.template.resume">
                  {t("resume")}
                </button>
              </div>
            ) : null}
            <div className="tact">
              <b>{t("how")}</b>
              <button type="button" className="tact__opt" data-k="fill" onClick={() => void startFill()} disabled={!!busy} data-ai-id="documents.template.fill">
                <span className="tact__ic" aria-hidden="true">
                  <IconEdit />
                </span>
                <span className="tact__t">
                  <b>{busy === "fill" ? t("starting") : t("fill")}</b>
                  <small>{nFields ? t("fillSub", { n: nFields }) : t("fillSubNone")}</small>
                </span>
              </button>
              <button type="button" className="tact__opt" data-k="lawyer" onClick={() => setView({ kind: "lawyer" })} disabled={!!busy} data-ai-id="documents.template.lawyer">
                <span className="tact__ic" aria-hidden="true">
                  <IconHeadset />
                </span>
                <span className="tact__t">
                  <b>{t("lawyer")}</b>
                  <small>{t("lawyerSub")}</small>
                </span>
              </button>
              {card.hasSourceFile ? (
                <button type="button" className="tact__opt" data-k="download" onClick={() => void download()} disabled={!!busy} data-ai-id="documents.template.download">
                  <span className="tact__ic" aria-hidden="true">
                    <IconDownload />
                  </span>
                  <span className="tact__t">
                    <b>{busy === "download" ? t("downloading") : t("download")}</b>
                    <small>{t("downloadSub")}</small>
                  </span>
                </button>
              ) : null}
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
