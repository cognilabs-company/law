"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getServiceDocumentFields, getServiceTemplateSourceFile, type ServiceDocumentFields } from "@/lib/services/backend";
import { docxToTree } from "@/lib/docxParse";
import type { DocTree } from "@/lib/docTemplate";
import { renderDocTree } from "@/lib/docTreeRender";
import { ApiError, errDetail } from "@/lib/http";
import { DocCloak, DocGuardNote, DocPrintNotice, DocWatermark, useDocGuard } from "@/components/portal/DocTemplateViewer";
import { IconAlert, IconEdit, IconEye, IconFileText, IconLock, IconRefresh } from "@/components/icons";
import { App, Btn, Empty, Loading, Tool, Toolbar, useOs } from "../../kit/kit";
import type { NativeProps } from "../../native";

// A template read before it is filled — the Mac's Preview, Word's reading
// view: the document on a sheet in a grey canvas, watermarked and guarded
// against copying as on the web, with "Fill in" in the toolbar.

export default function DocPreview({ serviceId, base, openApp, back }: Pick<NativeProps, "base" | "openApp"> & { serviceId: string; back: () => void }) {
  const t = useTranslations("portal.client.services");
  const td = useTranslations("portal.client.documents");
  const d = useTranslations("portal.desk.client");
  const os = useOs();
  const [fields, setFields] = useState<ServiceDocumentFields | null>(null);
  const [tree, setTree] = useState<DocTree[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error" | "plan">("loading");
  const [plan, setPlan] = useState("");
  const [key, setKey] = useState(0);
  const guard = useDocGuard(status === "ready");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const f = await getServiceDocumentFields(serviceId);
        if (!alive) return;
        setFields(f);
        const src = f.cleanSourceFileUrl || f.cleanSourceFileInlineUrl || f.sourceFileUrl || f.sourceFileInlineUrl;
        if (!f.hasSourceFile || !src) return setStatus("empty");
        const parsed = await docxToTree(await (await getServiceTemplateSourceFile(src)).arrayBuffer());
        if (!alive) return;
        setTree(parsed);
        setStatus(parsed.length ? "ready" : "empty");
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 402 && e.code === "manual_document_plan_required") {
          setPlan(errDetail(e) || td("planRequired"));
          setStatus("plan");
        } else setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [serviceId, key, td]);

  const fill = () => openApp("services", `${base}/services/document/${encodeURIComponent(serviceId)}`);
  const title = fields?.title || t("docViewTitle");

  return (
    <App name="cpreview">
      <Toolbar title={title} subtitle={os === "mac" ? t("docViewHint") : undefined} back={{ label: d("back"), onClick: back }}>
        <Tool icon={<IconEdit />} label={t("fillDoc")} onClick={fill} primary />
      </Toolbar>
      <div className="dxcg-canvas dx-scroll">
        {status === "loading" ? (
          <Loading label={title} />
        ) : status === "plan" ? (
          <Empty icon={<IconLock />} title={td("planGateTitle")} text={plan} action={<Btn kind="primary" onClick={() => openApp("subscription")}>{td("choosePlan")}</Btn>} />
        ) : status === "error" ? (
          <Empty
            icon={<IconAlert />}
            title={t("docViewError")}
            action={
              <Btn icon={<IconRefresh />} onClick={() => (setStatus("loading"), setKey((k) => k + 1))}>
                {d("refresh")}
              </Btn>
            }
          />
        ) : status === "empty" ? (
          <Empty icon={<IconFileText />} title={t("docViewNoFile")} action={<Btn kind="primary" icon={<IconEdit />} onClick={fill}>{t("fillDoc")}</Btn>} />
        ) : (
          <>
            {os === "win" ? (
              <p className="dxcg-hint">
                <IconEye aria-hidden /> {t("docViewHint")}
              </p>
            ) : null}
            <DocGuardNote blocked={guard.blocked} />
            <div className={`dxcg-paper docguard__paper${guard.cls}`} {...guard.surface}>
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
    </App>
  );
}
