"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getDocumentTemplates, downloadTemplateFile } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconFileText, IconDownload } from "@/components/icons";

function DownloadBtn({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      await downloadTemplateFile(id, `${name || "template"}.pdf`);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className="btn btn--line btn--sm" type="button" onClick={go} disabled={busy} aria-busy={busy}>
      <IconDownload style={{ width: 15, height: 15 }} />
    </button>
  );
}

export default function LawyerDocuments() {
  const t = useTranslations("portal.lawyer.documents");
  const res = useResource(getDocumentTemplates, []);

  return (
    <div className="ppanel" data-ai-target={res.data.length ? undefined : "doc-templates:list"}>
      <div className="ppanel__h">
        <b>{t("title")}</b>
      </div>
      <p style={{ margin: "0 0 16px", color: "var(--gray)", fontSize: ".9rem" }}>
        {t("lead")}
      </p>
      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div data-ai-target="doc-templates:list" data-ai-label={t("title")}>
          {res.data.map((d) => (
            <div className="prow" key={d.id}>
              <span className="prow__i" style={{ background: "var(--grad)", color: "#fff" }}>
                <IconFileText />
              </span>
              <div className="prow__m">
                <b>{d.name}</b>
                <span>{[d.category, d.language].filter(Boolean).join(" · ")}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flex: "none" }}>
                <DownloadBtn id={d.id} name={d.name} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
