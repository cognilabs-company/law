"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listClientDocumentFlowPage, getDocumentRequestFile, DOC_FLOW_PAGE, type ClientDocFlowItem, type ClientDocFlowMode } from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import { fetchAndDeliver } from "@/lib/download";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState } from "./DataState";
import { shortDateTime } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import { Link } from "@/i18n/navigation";
import { IconFileText, IconDownload, IconUser, IconClock, IconVideo, IconChat } from "@/components/icons";

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
  const tcm = useTranslations("portal.common");
  const locale = useLocale();
  const [tab, setTab] = useState<TabKey>("all");
  // LEXGO_REALTIME_AND_LIGHT_API_FRONTEND.md: /document-requests/service-flow
  // is paged now (the unpaged call was ~2MB for an account with a long
  // history, and it silently capped the list once the backend added a default
  // limit). Explicit state rather than useResource: a paged list owns both
  // "which page am I on" and "is there another", which a single-shot resource
  // hook has nowhere to put.
  const [rows, setRows] = useState<ClientDocFlowItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Back to "loading" the moment the tab changes — during render, not in the
  // effect, so there is no extra cascading render (same pattern as useResource).
  const [prevTab, setPrevTab] = useState(tab);
  if (prevTab !== tab) { setPrevTab(tab); setStatus("loading"); }

  useEffect(() => {
    let alive = true;
    listClientDocumentFlowPage({ mode: tab === "all" ? undefined : tab, limit: DOC_FLOW_PAGE, offset: 0 })
      .then((p) => {
        if (!alive) return;
        setRows(p.items);
        setMore(p.hasMore);
        setStatus("ready");
      })
      .catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, [tab, reloadKey]);

  async function loadMore() {
    if (moreBusy || !more) return;
    setMoreBusy(true);
    try {
      const p = await listClientDocumentFlowPage({ mode: tab === "all" ? undefined : tab, limit: DOC_FLOW_PAGE, offset: rows.length });
      setRows((cur) => {
        const seen = new Set(cur.map((x) => x.id));
        return [...cur, ...p.items.filter((x) => !seen.has(x.id))];
      });
      setMore(p.hasMore);
    } catch {
      setMore(false);
    } finally {
      setMoreBusy(false);
    }
  }
  const [dlBusy, setDlBusy] = useState("");
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  // LEXGO_FRONTEND_DOCUMENT_CALLCENTER_EDITOR_FLOW.md §"Realtime": this is
  // the page the client is told to come back to, so it must not need a
  // manual reload to show that an advocate claimed the work, started a
  // meeting, or sent the finished file. `refresh()` keeps what is on screen
  // while it refetches, so an event never flashes the list back to a skeleton.
  useEffect(() => {
    return subscribeUserEvents((ev) => {
      if (!ev.event.startsWith("document_request.")) return;
      // MD §"Client tayyor file ko'rishi" — the exact notice the client gets.
      if (ev.event === "document_request.ready" || ev.event === "document_request.completed") setNote({ ok: true, msg: t("readyToast") });
      refresh();
    });
  }, [refresh, t]);

  async function download(item: ClientDocFlowItem) {
    if (!item.file.ready || dlBusy) return;
    setDlBusy(item.id);
    setNote(null);
    const ok = await fetchAndDeliver(() => getDocumentRequestFile(item.id), `${item.title || t("title")}.${item.file.format || "docx"}`, true);
    if (!ok) setNote({ ok: false, msg: t("downloadError") });
    setDlBusy("");
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{rows.length}</span>
      </div>

      <div className="chiprow" style={{ marginBottom: 14 }}>
        {TABS.map((tb) => (
          <button key={tb} type="button" className="fchip" aria-pressed={tab === tb} onClick={() => setTab(tb)}>
            {t(`tab_${tb}`)}
          </button>
        ))}
      </div>

      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}

      {status === "loading" ? (
        <Skeleton rows={3} />
      ) : status === "error" ? (
        // A failed fetch used to render as "you have no documents" — the one
        // message that must never be guessed at on this page.
        <Notice ok={false} msg={t("loadError")} />
      ) : !rows.length ? (
        <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="pcards">
          {rows.map((item) => (
            <div className="pcase" key={item.id}>
              <div className="pcase__h">
                <span className="pcase__client">
                  <IconFileText />
                  {item.title || t("title")}
                </span>
                {/* The slug resolves against portal.common.docStatus, which is
                    translated; item.statusLabel is the server's Uzbek wording. */}
                <span className="advmuted">{statusLabel(tcm, item.status) || item.statusLabel}</span>
              </div>
              {item.nextAction ? <p>{item.nextAction}</p> : null}
              <div className="pcase__row">
                {item.assignedLawyer?.name ? (
                  <small>
                    <IconUser />
                    {item.assignedLawyer.name}
                  </small>
                ) : null}
                {/* MD §"Client: o'z requestlari va tayyor file" lists the
                    meeting status alongside status / assigned lawyer. */}
                {item.meeting ? (
                  <small className={item.meeting.active ? "pcase__live" : undefined}>
                    <IconVideo />
                    {item.meeting.active ? t("meetingActive") : item.meeting.status || t("meetingLabel")}
                  </small>
                ) : null}
                {item.createdAt ? (
                  <small>
                    <IconClock />
                    {shortDateTime(item.createdAt, locale)}
                  </small>
                ) : null}
              </div>
              {/* Two things the client could not reach once the order modal
                  was closed: the private chat with the advocate handling the
                  document, and the finished file. Both live on the row now. */}
              <div className="pcase__acts">
                {item.secureChatRoomId ? (
                  <Link href={`/portal/chat/${item.secureChatRoomId}`} className="btn btn--line btn--sm">
                    <IconChat />
                    {t("openChat")}
                  </Link>
                ) : null}
                {item.file.ready ? (
                  <button
                    type="button"
                    className="btn btn--grad btn--sm"
                    disabled={dlBusy === item.id}
                    onClick={() => download(item)}
                  >
                    <IconDownload />
                    {dlBusy === item.id ? tcommon("processingShort") : t("download")}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {more ? (
            <button type="button" className="btn btn--line btn--full ntmore" onClick={() => void loadMore()} disabled={moreBusy}>
              {moreBusy ? tcm("loadingMore") : tcm("loadMore")}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
