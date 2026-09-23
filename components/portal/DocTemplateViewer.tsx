"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Skeleton } from "./DataState";
import { docxToTree } from "@/lib/docxParse";
import type { DocTree } from "@/lib/docTemplate";
import { renderDocTree } from "@/lib/docTreeRender";
import { saveBlob } from "@/lib/download";
import { IconDownload } from "@/components/icons";

// A browser has no built-in DOCX viewer — the previous "view" buttons (both
// here and in DocumentRequestsInbox) opened the file in a new tab, which for
// a DOCX just flashes a blank tab and silently forces a download instead of
// showing anything. This actually renders the document, inline, in a modal —
// reusing the exact XML→DocTree pipeline DocFill's own live pane already
// uses (lib/docxParse.ts). "Download" stays one tap away underneath, for
// whoever actually wants the file saved (unlike the no-download full-page
// viewer at services/document/[serviceId]/view, which never offers this).

export default function DocTemplateViewer({
  open,
  onClose,
  title,
  fetchBlob,
  fileName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  // A function, not a URL — the caller already knows how to fetch this
  // specific file through the authed proxy (getServiceTemplateSourceFile);
  // null while that URL isn't known yet keeps this a no-op rather than a
  // broken button.
  fetchBlob: (() => Promise<Blob>) | null;
  fileName: string;
}) {
  const t = useTranslations("portal.client.documents");
  const [tree, setTree] = useState<DocTree[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [blob, setBlob] = useState<Blob | null>(null);

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
        const buf = await b.arrayBuffer();
        const parsed = await docxToTree(buf);
        if (!alive) return;
        if (parsed.length) {
          setTree(parsed);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, fetchBlob]);

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      {status === "loading" ? (
        <Skeleton rows={8} />
      ) : status === "error" ? (
        <p className="advmuted">{t("sourceError")}</p>
      ) : (
        <>
          <div className="docpaper__scroll" style={{ maxHeight: "60vh" }}>
            <article className="docpaper__sheet docpaper__sheet--doc">{tree ? renderDocTree(tree) : null}</article>
          </div>
          <button
            type="button"
            className="btn btn--line btn--full"
            style={{ marginTop: 14 }}
            onClick={() => blob && saveBlob(blob, fileName)}
            disabled={!blob}
          >
            <IconDownload />
            {t("downloadSource")}
          </button>
        </>
      )}
    </Modal>
  );
}
