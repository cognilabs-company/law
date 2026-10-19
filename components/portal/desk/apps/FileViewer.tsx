"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { docxToTree } from "@/lib/docxParse";
import type { DocTree } from "@/lib/docTemplate";
import { renderDocTree } from "@/lib/docTreeRender";
import { saveBlob } from "@/lib/download";
import { DocCloak, DocGuardNote, DocPrintNotice, DocWatermark, useDocGuard } from "@/components/portal/DocTemplateViewer";
import { IconDownload } from "@/components/icons";
import { Banner, Btn, Dialog, Spinner } from "../kit/kit";
import "./fileviewer.css";

// A document file at a glance — the Mac's Quick Look, Windows' preview
// pane as a dialog: the pages on a grey canvas, watermarked and guarded as
// on the web (DocTemplateViewer), and the file to save beside it.
export default function FileViewer({ open, onClose, title, fetchBlob, fileName, protect = true }: { open: boolean; onClose: () => void; title: string; fetchBlob: (() => Promise<Blob>) | null; fileName: string; protect?: boolean }) {
  const t = useTranslations("portal.client.documents");
  const d = useTranslations("portal.desk.client");
  const [tree, setTree] = useState<DocTree[] | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const guard = useDocGuard(protect && open && status === "ready");
  useEffect(() => {
    if (!open || !fetchBlob) return;
    let alive = true;
    (async () => {
      setStatus("loading");
      setTree(null);
      setBlob(null);
      try {
        const b = await fetchBlob();
        if (!alive) return;
        setBlob(b);
        const parsed = await docxToTree(await b.arrayBuffer());
        if (!alive) return;
        setTree(parsed);
        setStatus(parsed.length ? "ready" : "error");
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, fetchBlob]);
  if (!open) return null;
  return (
    <Dialog
      open
      title={title}
      width={860}
      onClose={onClose}
      actions={
        <>
          <Btn icon={<IconDownload />} disabled={!blob} onClick={() => blob && saveBlob(blob, fileName)}>
            {t("downloadSource")}
          </Btn>
          <Btn kind="primary" onClick={onClose}>
            {d("close")}
          </Btn>
        </>
      }
    >
      {status === "loading" ? (
        <Spinner />
      ) : status === "error" ? (
        <Banner tone="err">{t("sourceError")}</Banner>
      ) : (
        <div className="dxfv">
          {protect ? <DocGuardNote blocked={guard.blocked} /> : null}
          <div className={`dxfv-paper${protect ? ` docguard__paper${guard.cls}` : ""}`} {...(protect ? guard.surface : null)}>
            {protect ? <DocCloak reason={guard.cloak} /> : null}
            <article className="docpaper__sheet docpaper__sheet--doc">
              {protect ? <DocWatermark style={guard.wm} /> : null}
              {tree ? renderDocTree(tree) : null}
            </article>
          </div>
          {protect ? <DocPrintNotice /> : null}
        </div>
      )}
    </Dialog>
  );
}
