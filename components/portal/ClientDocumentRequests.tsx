"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listClientDocumentFlowPage, getDocumentRequestFile, DOC_FLOW_PAGE, type ClientDocFlowItem, type ClientDocFlowMode } from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import { useDocChatRooms } from "@/lib/useDocChatRooms";
import { useDocRatings } from "@/lib/useDocRatings";
import DocRatingBox from "./DocRatingBox";
import { fetchAndDeliver } from "@/lib/download";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState } from "./DataState";
import { shortDateTime } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import { Link } from "@/i18n/navigation";
import { IconFileText, IconDownload, IconUser, IconClock, IconVideo, IconChat, IconSparkle, IconScale, IconEdit, IconArrowRight, IconTag } from "@/components/icons";

// Which way this document is being produced — the client filled it in, the
// AI drafted it, or an advocate is writing it. It changes what the card
// means, so it leads the card rather than hiding in a filter chip.
const MODE_ICON = { manual: IconEdit, ai: IconSparkle, lawyer: IconScale } as const;

// Where a request has got to, as one of four states rather than six slugs.
// The pill is coloured by this, so the list can be read down its right edge:
// green is finished, blue is being worked on, amber is waiting on the client.
// Every status the endpoint sends today is covered (verified against
// production: questionnaire, lawyer_review, file_ready, ready_to_generate,
// open_pool, payment_pending); an unknown one lands on "working", which
// claims nothing.
function statusTone(status: string): "done" | "waiting" | "you" | "closed" | "working" {
  if (status === "file_ready" || status === "rated") return "done";
  if (status === "open_pool" || status === "lawyer_review") return "waiting";
  if (status === "questionnaire" || status === "ready_to_generate" || status === "payment_pending") return "you";
  // The case is over: nothing more will happen on this document.
  if (status === "closed" || status === "cancelled" || status === "rejected") return "closed";
  return "working";
}
// Which rows could carry a rating window, and therefore are worth one detail
// request each. Anything still being worked on cannot have one.
const RATEABLE = new Set(["file_ready", "rated", "closed"]);

// LEXGO_CLIENT_DOCUMENT_REQUESTS_PAGE_FRONTEND.md: one place for the client
// to see every document request they've ever started — however it was
// filled in (self, AI, lawyer) — with its current status/next step, and
// download the finished file the moment it's ready, without having to
// re-open the service it came from to find out.
type TabKey = "all" | ClientDocFlowMode;
const TABS: TabKey[] = ["all", "manual", "ai", "lawyer"];

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

  // The chat room is not on the list row — see useDocChatRooms. Only rows
  // that could have one are asked about; a document the client fills in
  // themselves never does.
  const chatIds = rows.filter((r) => r.mode === "lawyer" || r.assignedLawyer).map((r) => r.id);
  const rooms = useDocChatRooms(chatIds, reloadKey);
  // The 15-minute rating window, and the work id, per finished row — see
  // useDocRatings for why they are not simply read off this list.
  const rated = useDocRatings(rows.filter((r) => RATEABLE.has(r.status)).map((r) => r.id), reloadKey);

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
        <div className="mydocs">
          {rows.map((item) => {
            const ModeIcon = MODE_ICON[item.mode as keyof typeof MODE_ICON] ?? IconFileText;
            const room = item.secureChatRoomId || rooms[item.id];
            const ready = item.file.ready;
            const tone = statusTone(item.status);
            const acts = !!room || ready;
            const info = rated[item.id];
            // The work id the client and the advocate quote at each other.
            const workId = item.workId || info?.workId || "";
            return (
              <article className={`mydoc mydoc--${item.mode}${ready ? " mydoc--ready" : ""}${tone === "closed" ? " mydoc--closed" : ""}`} key={item.id}>
                <span className={`mydoc__i mydoc__i--${item.mode}`} aria-hidden><ModeIcon /></span>
                {/* One column of content, not two: the status pill used to sit
                    in a flex row of its own while the buttons occupied a third
                    grid column, and on a long title the two overlapped. */}
                <div className="mydoc__m">
                  <div className="mydoc__top">
                    <b className="mydoc__t">{item.title || t("title")}</b>
                    {/* The slug resolves against portal.common.docStatus, which
                        is translated; item.statusLabel is the server's own
                        wording, itself sometimes only the slug. */}
                    <em className={`mydoc__st mydoc__st--${tone}`}>
                      {statusLabel(tcm, item.status, "docStatus") || item.statusLabel}
                    </em>
                  </div>
                  <div className="mydoc__row">
                    {workId ? <small className="mydoc__wid" title={t("workId")}>{workId}</small> : null}
                    <small className="mydoc__mode"><ModeIcon />{t.has(`tab_${item.mode}`) ? t(`tab_${item.mode}`) : item.mode}</small>
                    {/* The kind of document asked for, when one was given. */}
                    {item.requestedDocumentType ? (
                      <small className="mydoc__kind"><IconTag />{item.requestedDocumentType}</small>
                    ) : null}
                    {item.assignedLawyer?.name ? <small><IconUser />{item.assignedLawyer.name}</small> : null}
                    {/* MD §"Client: o'z requestlari va tayyor file" lists the
                        meeting status alongside status / assigned lawyer. */}
                    {item.meeting ? (
                      <small className={item.meeting.active ? "mydoc__live" : undefined}>
                        <IconVideo />
                        {item.meeting.active ? t("meetingActive") : item.meeting.status || t("meetingLabel")}
                      </small>
                    ) : null}
                    {item.createdAt ? <small><IconClock />{shortDateTime(item.createdAt, locale)}</small> : null}
                  </div>
                  {/* What to do next, as a sentence — it was a full-width grey
                      box that read as an empty input. */}
                  {item.nextAction ? <p className="mydoc__next"><IconArrowRight />{item.nextAction}</p> : null}
                  {/* Two things the client could not reach once the order modal
                      was closed: the private chat with the advocate handling
                      the document, and the finished file. */}
                  {/* The 15-minute window the backend opens when the advocate
                      finalises the document. Renders nothing once it has
                      passed, which is what closes the block. */}
                  {info ? <DocRatingBox id={item.id} rating={info.rating} onRated={refresh} /> : null}
                  {acts ? (
                    <div className="mydoc__acts">
                      {room ? (
                        <Link href={`/portal/chat/${room}`} className="btn btn--line btn--sm">
                          <IconChat />
                          {t("openChat")}
                        </Link>
                      ) : null}
                      {ready ? (
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
                  ) : null}
                </div>
              </article>
            );
          })}
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
