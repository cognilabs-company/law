"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Contract } from "@/lib/api";
import { getContractFile } from "@/lib/services/backend";
import { base64Blob, closeTab, preopenTab, saveBlob, showBlob } from "@/lib/download";
import { IconFileText, IconDownload, IconExternal } from "./icons";

// Renders a contract PDF as an attachment. Prefers the inlined base64 payload;
// otherwise fetches GET /contracts/{id}/file with the bearer token as a blob
// (the authed file route is never used as a plain link).
export default function ContractCard({ c }: { c: Contract }) {
  const t = useTranslations("chatPage");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const name =
    c.fileName || (c.contractType ? `${c.contractType}.pdf` : "contract.pdf");
  const hasFile = Boolean(c.fileBase64 || c.downloadUrl || c.inlineUrl);

  async function deliver(download: boolean) {
    if (busy) return;
    setFailed(false);
    const inline = base64Blob(c.fileBase64, c.mimeType || "application/pdf");
    if (inline) {
      if (download) saveBlob(inline, name);
      else showBlob(inline, name, preopenTab());
      return;
    }
    if (!c.id) return;
    const win = download ? null : preopenTab();
    setBusy(true);
    try {
      const blob = await getContractFile(c.id);
      if (download) saveBlob(blob, name);
      else showBlob(blob, name, win);
    } catch {
      closeTab(win);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="aifile">
      <span className="aifile__i">
        <IconFileText />
      </span>
      <div className="aifile__t">
        <b>{c.contractType || name}</b>
        <span>{failed ? t("fileError") : `PDF${c.status ? ` · ${c.status}` : ""}`}</span>
      </div>
      <div className="aifile__act">
        {hasFile ? (
          <>
            <button
              type="button"
              className="aifile__btn"
              onClick={() => deliver(false)}
              disabled={busy}
              aria-label={t("open")}
              title={t("open")}
            >
              <IconExternal />
            </button>
            <button
              type="button"
              className="aifile__btn"
              onClick={() => deliver(true)}
              disabled={busy}
              aria-label={t("downloadPdf")}
              title={t("downloadPdf")}
            >
              <IconDownload />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
