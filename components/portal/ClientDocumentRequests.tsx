"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listClientDocumentFlow, getDocumentRequestFile, type ClientDocFlowItem, type ClientDocFlowMode } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { fetchAndDeliver } from "@/lib/download";
import { Skeleton, EmptyState } from "./DataState";
import { shortDateTime } from "@/lib/date";
import { IconFileText, IconDownload, IconUser, IconClock } from "@/components/icons";

// LEXGO_CLIENT_DOCUMENT_REQUESTS_PAGE_FRONTEND.md: one place for the client
// to see every document request they've ever started — however it was
// filled in (self, AI, lawyer) — with its current status/next step, and
// download the finished file the moment it's ready, without having to
// re-open the service it came from to find out.
type TabKey = "all" | ClientDocFlowMode;
const TABS: TabKey[] = ["all", "self", "ai", "lawyer"];

export default function ClientDocumentRequests() {
  const t = useTranslations("portal.client.documentRequests");
  const tcommon = useTranslations("portal.client.documents");
  const locale = useLocale();
  const [tab, setTab] = useState<TabKey>("all");
  const list = useResource<ClientDocFlowItem>(() => listClientDocumentFlow(tab === "all" ? undefined : { mode: tab }), [tab]);
  const [dlBusy, setDlBusy] = useState("");

  async function download(item: ClientDocFlowItem) {
    if (!item.file.ready || dlBusy) return;
    setDlBusy(item.id);
    await fetchAndDeliver(() => getDocumentRequestFile(item.id), `${item.title || t("title")}.${item.file.format || "docx"}`, true);
    setDlBusy("");
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{list.data.length}</span>
      </div>

      <div className="chiprow" style={{ marginBottom: 14 }}>
        {TABS.map((tb) => (
          <button key={tb} type="button" className="fchip" aria-pressed={tab === tb} onClick={() => setTab(tb)}>
            {t(`tab_${tb}`)}
          </button>
        ))}
      </div>

      {list.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !list.data.length ? (
        <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="pcards">
          {list.data.map((item) => (
            <div className="pcase" key={item.id}>
              <div className="pcase__h">
                <span className="pcase__client">
                  <IconFileText />
                  {item.title || t("title")}
                </span>
                <span className="advmuted">{item.statusLabel}</span>
              </div>
              {item.nextAction ? <p>{item.nextAction}</p> : null}
              <div className="pcase__row">
                {item.assignedLawyer?.name ? (
                  <small>
                    <IconUser />
                    {item.assignedLawyer.name}
                  </small>
                ) : null}
                {item.createdAt ? (
                  <small>
                    <IconClock />
                    {shortDateTime(item.createdAt, locale)}
                  </small>
                ) : null}
              </div>
              {item.file.ready ? (
                <button
                  type="button"
                  className="btn btn--grad btn--sm"
                  style={{ marginTop: 8, alignSelf: "flex-start" }}
                  disabled={dlBusy === item.id}
                  onClick={() => download(item)}
                >
                  <IconDownload />
                  {dlBusy === item.id ? tcommon("processingShort") : t("download")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
