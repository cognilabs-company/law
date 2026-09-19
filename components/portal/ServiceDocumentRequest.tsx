"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getServiceDocumentTemplate,
  createServiceDocumentRequest,
  listDocumentRequests,
  getDocumentRequest,
  type BackendTemplate,
  type DocumentRequest,
} from "@/lib/services/backend";
import DocumentRequestPanel from "./DocumentRequestPanel";
import { Skeleton } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import { fmtUzs } from "@/lib/money";

const som = (n?: number) => (n ? fmtUzs(n) : "");

// FRONTEND_DOCUMENT_GENERATION.md "Asosiy Flow": a catalog service with a
// document_template_id starts the same answers → pay → generate → download
// lifecycle as the standalone template list (components/portal/DocumentFlow),
// but the request is created through the service, not the template picker —
// GET /services/{id}/document-template, POST /services/{id}/document-requests.
export default function ServiceDocumentRequest({ serviceId, onTitle }: { serviceId: string; onTitle?: (title: string) => void }) {
  const t = useTranslations("portal.client.documents");
  const [tpl, setTpl] = useState<BackendTemplate | null>(null);
  const [req, setReq] = useState<DocumentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  // Reset when a different service is opened — during render, not an effect
  // (see DocumentRequestPanel for why), so the new fetch below starts clean.
  const [prevServiceId, setPrevServiceId] = useState(serviceId);
  if (serviceId !== prevServiceId) {
    setPrevServiceId(serviceId);
    setTpl(null);
    setReq(null);
    setLoading(true);
    setErr(false);
  }

  useEffect(() => {
    let alive = true;
    getServiceDocumentTemplate(serviceId)
      .then((r) => {
        if (!alive) return;
        setTpl(r);
        onTitle?.(r.name);
      })
      .catch(() => alive && setErr(true))
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
        if (existing) getDocumentRequest(existing.id).then((r) => alive && setReq(r)).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tpl]);

  async function start() {
    if (!tpl || busy) return;
    setBusy(true);
    setErr(false);
    try {
      setReq(await createServiceDocumentRequest(serviceId, { title: tpl.name, document_type: tpl.category || undefined }));
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  // A template with nothing to fill in has no "questionnaire" step to show —
  // skip the extra "Davom etish" tap and go straight to the document instead
  // of stopping at a screen whose only job was to lead to this same click.
  useEffect(() => {
    if (!(tpl && tpl.questionnaire.length === 0 && !req && !busy && !err)) return;
    const h = setTimeout(() => void start(), 0);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, req]);

  if (loading || (tpl && tpl.questionnaire.length === 0 && !req && !err)) return <Skeleton rows={3} />;
  if (!tpl) return <Notice ok={false} msg={t("error")} />;
  if (req) return <DocumentRequestPanel initialReq={req} />;

  return (
    <div className="cform" style={{ maxWidth: "none" }}>
      {tpl.description ? <p className="advmuted">{tpl.description}</p> : null}
      <div className="oprice">
        <span>{t("price")}</span>
        <b>{tpl.price ? `${som(tpl.price)} ${t("som")}` : t("free")}</b>
      </div>
      {err ? <Notice ok={false} msg={t("error")} /> : null}
      <button className="btn btn--grad btn--full btn--lg" type="button" onClick={start} disabled={busy}>
        {busy ? t("processingShort") : t("continue")}
      </button>
    </div>
  );
}
