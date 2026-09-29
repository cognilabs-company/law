"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { getServiceDocumentFields, getServiceTemplateSourceFile, type ServiceDocumentFields } from "@/lib/services/backend";
import { docxToTree } from "@/lib/docxParse";
import type { DocTree } from "@/lib/docTemplate";
import { renderDocTree } from "@/lib/docTreeRender";
import { useCatalogBackHref } from "@/lib/catalogNav";
import ManualDocPlanGate from "./ManualDocPlanGate";
import { Skeleton } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import { ApiError, errDetail } from "@/lib/http";
// The preview guard lives next to the other viewer rather than in a file of
// its own so there is exactly one implementation of it: both screens render
// the same sheet from the same DOCX pipeline, and two copies of a security
// rule is how one of them quietly stops matching the other.
import { DocCloak, DocGuardNote, DocPrintNotice, DocWatermark, useDocGuard } from "./DocTemplateViewer";
import { IconChevronLeft, IconEye, IconLock } from "@/components/icons";

// A dedicated full page for "Hujjatni ko'rish" on the services catalog — the
// clean template rendered read-only, with no download/save action anywhere
// on the page (unlike DocTemplateViewer's modal, which is a deliberately
// different, download-capable surface used elsewhere). Filling and
// downloading a real document still costs money; looking at a blank sample
// doesn't, so this exists purely to show what the service produces before a
// client commits to it.
//
// Because nothing on this page hands the file over, it is the screen the
// preview guard matters most on: the only way off it is to copy what is
// drawn. See DocTemplateViewer's header comment for what that guard can and
// cannot honestly do.
export default function ServiceDocumentView({ serviceId }: { serviceId: string }) {
  const t = useTranslations("portal.client.services");
  const td = useTranslations("portal.client.documents");
  const router = useRouter();
  const backHref = useCatalogBackHref();
  const [fields, setFields] = useState<ServiceDocumentFields | null>(null);
  const [tree, setTree] = useState<DocTree[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [planRequired, setPlanRequired] = useState("");
  const [planGateOpen, setPlanGateOpen] = useState(false);
  // Only while a document is actually on screen: the plan gate below is a
  // form, and swallowing Ctrl+A there would break choosing a tariff.
  const guard = useDocGuard(status === "ready");

  useEffect(() => {
    let alive = true;
    (async () => {
      setStatus("loading");
      setPlanRequired("");
      try {
        const f = await getServiceDocumentFields(serviceId);
        if (!alive) return;
        setFields(f);
        const src = f.cleanSourceFileUrl || f.cleanSourceFileInlineUrl || f.sourceFileUrl || f.sourceFileInlineUrl;
        if (!f.hasSourceFile || !src) {
          setStatus("empty");
          return;
        }
        const blob = await getServiceTemplateSourceFile(src);
        if (!alive) return;
        const buf = await blob.arrayBuffer();
        const parsed = await docxToTree(buf);
        if (!alive) return;
        if (parsed.length) {
          setTree(parsed);
          setStatus("ready");
        } else {
          setStatus("empty");
        }
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 402 && e.code === "manual_document_plan_required") {
          setPlanRequired(errDetail(e) || td("planRequired"));
          setStatus("error");
        } else {
          setStatus("error");
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  return (
    <div className="docbuild docbuild--full">
      <div className="docbuild__top">
        <button type="button" className="docbuild__back" onClick={() => (backHref ? router.push(backHref) : router.back())}>
          <IconChevronLeft />
          {t("back")}
        </button>
        <b className="docbuild__title">{fields?.title || t("docViewTitle")}</b>
      </div>

      {status === "loading" ? (
        <Skeleton rows={8} />
      ) : planRequired ? (
        <div className="cform" style={{ maxWidth: "none" }}>
          <div className="docassist__head">
            <span className="docassist__i docassist__i--lawyer"><IconLock /></span>
            <div>
              <b>{td("planGateTitle")}</b>
              <p className="advmuted">{planRequired}</p>
            </div>
          </div>
          <button className="btn btn--grad btn--full btn--lg" type="button" onClick={() => setPlanGateOpen(true)}>
            {td("choosePlan")}
          </button>
          <ManualDocPlanGate open={planGateOpen} onClose={() => setPlanGateOpen(false)} message={planRequired} />
        </div>
      ) : status === "error" ? (
        <Notice ok={false} msg={t("docViewError")} />
      ) : status === "empty" ? (
        <Notice ok={false} msg={t("docViewNoFile")} />
      ) : (
        <>
          <p className="docview__hint">
            <IconEye />
            {t("docViewHint")}
          </p>
          <DocGuardNote blocked={guard.blocked} />
          <div className={`docpaper__scroll docguard__paper${guard.cls}`} style={{ maxHeight: "none" }} {...guard.surface}>
            <DocCloak reason={guard.cloak} />
            <article className="docpaper__sheet docpaper__sheet--doc">
              <DocWatermark style={guard.wm} />
              {tree ? renderDocTree(tree) : null}
            </article>
          </div>
          <DocPrintNotice />
        </>
      )}
    </div>
  );
}
