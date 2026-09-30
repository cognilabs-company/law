"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  listClientDocumentFlowPage,
  getDocumentRequestFile,
  getDocumentRequest,
  searchServices,
  requestDocumentLawyerReviewGated,
  DOC_FLOW_PAGE,
  type ClientDocFlowItem,
  type ClientDocFlowMode,
} from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import { useDocChatRooms } from "@/lib/useDocChatRooms";
import { useDocRatings } from "@/lib/useDocRatings";
import { ctorPromptAsked, markCtorPromptAsked } from "@/lib/docCtorPrompt";
import DocRatingBox, { DocRatedStars } from "./DocRatingBox";
import { fetchAndDeliver } from "@/lib/download";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { Skeleton, EmptyState } from "./DataState";
import { shortDateTime } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import { Link, useRouter } from "@/i18n/navigation";
import { IconFileText, IconDownload, IconUser, IconClock, IconVideo, IconChat, IconSparkle, IconScale, IconEdit, IconArrowRight, IconTag, IconCheck, IconSearch } from "@/components/icons";

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
  const router = useRouter();
  const params = useSearchParams();
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
  // The status filter, "" for all of them. Sent to the endpoint, not applied
  // here: ?status= filters server-side (measured — ?status=file_ready answers
  // 47 rows with total 47 out of 121), so a filtered view pages correctly
  // instead of filtering one page of twenty.
  const [pick, setPick] = useState("");
  // Every status this client's documents have actually been in, learnt from
  // the unfiltered answers only — a filtered one would collapse the menu to
  // the single status just chosen.
  const [seen, setSeen] = useState<string[]>([]);

  // Back to "loading" the moment the query changes — during render, not in the
  // effect, so there is no extra cascading render (same pattern as useResource).
  const query = `${tab}|${pick}`;
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) { setPrevQuery(query); setStatus("loading"); }

  useEffect(() => {
    let alive = true;
    listClientDocumentFlowPage({ mode: tab === "all" ? undefined : tab, status: pick || undefined, limit: DOC_FLOW_PAGE, offset: 0 })
      .then((p) => {
        if (!alive) return;
        setRows(p.items);
        setMore(p.hasMore);
        if (!pick) {
          setSeen((cur) => {
            const next = new Set(cur);
            p.items.forEach((x) => x.status && next.add(x.status));
            return next.size === cur.length ? cur : [...next];
          });
        }
        setStatus("ready");
      })
      .catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, [tab, pick, reloadKey]);

  async function loadMore() {
    if (moreBusy || !more) return;
    setMoreBusy(true);
    try {
      const p = await listClientDocumentFlowPage({ mode: tab === "all" ? undefined : tab, status: pick || undefined, limit: DOC_FLOW_PAGE, offset: rows.length });
      setRows((cur) => {
        const have = new Set(cur.map((x) => x.id));
        return [...cur, ...p.items.filter((x) => !have.has(x.id))];
      });
      setMore(p.hasMore);
    } catch {
      setMore(false);
    } finally {
      setMoreBusy(false);
    }
  }
  // The four counts at the top. They are about the whole archive, so they
  // cannot come from `rows` — that is one page of twenty, and narrowed by
  // whichever tab is open. Each is the `total` of a one-row query instead:
  // cheap, and exact for the bucket it names. The unfiltered call gives the
  // grand total (service-flow's `total` ignores ?mode — a backend defect the
  // asks list already carries, and the one place where it happens to be the
  // number wanted), and the three status calls are filtered properly, which
  // is measured: ?status=file_ready answers total 47 out of 121.
  //
  // Only the three statuses that can be asked for exactly are shown. A
  // bucket like "everything still in progress" spans half a dozen statuses
  // and would need a request each, so it is not offered rather than
  // estimated.
  const [stats, setStats] = useState<{ total: number; filling: number; ready: number; lawyer: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const count = (status?: string) => listClientDocumentFlowPage({ status, limit: 1, offset: 0 }).then((p) => p.total);
    Promise.all([count(), count("questionnaire"), count("file_ready"), count("lawyer_review")])
      .then(([total, filling, ready, lawyer]) => { if (alive) setStats({ total, filling, ready, lawyer }); })
      // A failed count hides the row; it must never block the list itself.
      .catch(() => { if (alive) setStats(null); });
    return () => { alive = false; };
  }, [reloadKey]);
  // Filters what is loaded. There is no query parameter on this endpoint.
  const [q, setQ] = useState("");
  const [dlBusy, setDlBusy] = useState("");
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  // LEXGO_DOCUMENT_TITLE_CONSTRUCTOR_PROMPT_UPDATE_2026-09-29.md §3 L74 /
  // §6 L158: the row whose "Ishingiz Navbatchi advokatga berildi" prompt is
  // open. `?doc=<document_request_id>` opens it straight away — that is the
  // link lib/notifications.ts builds for the
  // `document_constructor_continue_prompt` notification when the payload
  // carries no service_id to go to the constructor with directly.
  // …once. The backend keeps `prompt_required` true for the whole life of the
  // hold, and the ?doc= parameter stays in the URL after the dialog is
  // answered, so this used to re-ask on every visit, every refresh and every
  // back-navigation — the "juda ko'p chiqyapti" report. Two things stop it:
  // the shared per-request memory below (the same one the wait screen uses,
  // so answering in either place counts), and dropping ?doc= from the URL as
  // soon as it has been read.
  const [promptId, setPromptId] = useState(() => {
    const id = params.get("doc") ?? "";
    return id && !ctorPromptAsked(id) ? id : "";
  });
  // Asked, and remembered, the moment the dialog is put on screen — not when
  // it is answered. Closing it with the × or the scrim is an answer too
  // ("not now"), and the one thing that must not happen is being asked again
  // on the next render. The ?doc= parameter goes with it, so a refresh or a
  // Back into this page lands on a plain list.
  useEffect(() => {
    if (!promptId) return;
    markCtorPromptAsked(promptId);
    if (typeof window === "undefined" || !params.get("doc")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("doc");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [promptId, params]);

  // The row whose constructor is being resolved (see openConstructor), and
  // the row whose "Advokat tekshiruviga yuborish" box is open.
  const [openBusy, setOpenBusy] = useState("");
  const [sendId, setSendId] = useState("");
  const [sendNeed, setSendNeed] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  // §3 L64 + §5 L117-122: "Ha" opens the held document's OWN constructor.
  // The backend points at it with an API path
  // (actions.constructor_continue_url = "/document-requests/{id}"), while the
  // page that renders the constructor is keyed on the SERVICE
  // (/portal/client/services/document/{serviceId}, which resumes exactly this
  // request — see ServiceDocumentRequest). The row names that service itself
  // (`service.id`, on 39 of the 50 live rows), so this is a straight
  // navigation with nothing to look up and nothing to fail.
  //
  // It used to find the service by searching the catalogue for the request's
  // title, and that is the button the client reported as dead: catalogue
  // titles run to 133 characters, /services/search refuses a q longer than
  // 120 with a 422, so every long-titled document landed in the catch below
  // and the constructor never opened. The search survives only as the
  // fallback for a row that names no service, and searchServices trims q now.
  async function openConstructor(item: ClientDocFlowItem) {
    if (openBusy) return;
    if (item.service?.id) {
      setPromptId("");
      setNote(null);
      router.push(`/portal/client/services/document/${item.service.id}`);
      return;
    }
    setOpenBusy(item.id);
    setNote(null);
    try {
      const req = await getDocumentRequest(item.id);
      const hits = await searchServices(item.title || req.title, { limit: 50 }, locale);
      const svc = hits.map((h) => h.service).find((s) => !!s.documentTemplateId && s.documentTemplateId === req.templateId);
      if (!svc) {
        setNote({ ok: false, msg: t("constructorOpenError") });
        setPromptId("");
        return;
      }
      setPromptId("");
      router.push(`/portal/client/services/document/${svc.id}`);
    } catch {
      // The notice lives at the top of the list, which is behind this
      // dialog — leaving it open would have shown the client nothing at all.
      setNote({ ok: false, msg: t("constructorOpenError") });
      setPromptId("");
    } finally {
      setOpenBusy("");
    }
  }

  // §4 L99-100: a second advocate request for a document that already has a
  // live one is refused, not queued — the answer comes back
  // already_exists=true with can_send_lawyer_request=false and the backend's
  // own sentence. Telling the client "so'rovingiz yuborildi" there would be a
  // straight lie, so nothing is claimed unless the answer says a request was
  // really created, and what is shown instead is the backend's `message`.
  async function sendToLawyer(item: ClientDocFlowItem) {
    if (sendBusy) return;
    setSendBusy(true);
    setNote(null);
    try {
      const r = await requestDocumentLawyerReviewGated(item.id, sendNeed.trim() || tcommon("reviewNeedDefault"));
      setSendId("");
      if (r.alreadyExists || !r.canSendLawyerRequest) setNote({ ok: false, msg: r.message || item.lawyerRequestBlockReason || tcommon("lawyerPendingLead") });
      // The fee gate of the lawyer-review endpoint: the request exists but it
      // has not reached the advocates, so it is not reported as sent either.
      else if (r.paymentRequired) setNote({ ok: false, msg: r.message || t("lawyerPayRequired") });
      else setNote({ ok: true, msg: r.message || tcommon("reviewSent") });
      refresh();
    } catch {
      setNote({ ok: false, msg: tcommon("error") });
    } finally {
      setSendBusy(false);
    }
  }

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

  // The rows the two modals below are about. Looked up rather than copied
  // into state so a refresh (a socket event, a send) keeps the open modal on
  // the row's current server truth; `?doc=` can name a row that is not on
  // this page yet, and then nothing opens rather than an empty prompt.
  // What the list actually renders: the loaded rows, narrowed by the search
  // box. Matched against the things a client would type — the document title,
  // its public work id, and the service it came from.
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => `${r.title} ${r.workId} ${r.service?.name ?? ""}`.toLowerCase().includes(needle))
    : rows;

  const promptRow = rows.find((r) => r.id === promptId) ?? null;
  const sendRow = rows.find((r) => r.id === sendId) ?? null;

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
        <div className="mydocs__ttl">
          <b>{t("title")}</b>
          <span>{t("lead")}</span>
        </div>
        <span className="advmuted">{stats ? stats.total : rows.length}</span>
      </div>

      {/* Four counts over the whole archive, not over the page on screen —
          see `stats` above for where each number comes from. The tiles are
          the platform's existing KPI row (.pk, shared with the meetings
          screen), so this screen gains the summary without inventing a
          second visual language for it. */}
      {stats ? (
        <div className="pk mydocs__stats">
          <div className="pk__i pk__i--ic pk__i--neutral">
            <span className="pk__ico"><IconFileText /></span>
            <b>{stats.total}</b>
            <span>{t("statTotal")}</span>
          </div>
          <div className="pk__i pk__i--ic pk__i--warn">
            <span className="pk__ico"><IconEdit /></span>
            <b>{stats.filling}</b>
            <span>{t("statFilling")}</span>
          </div>
          <div className="pk__i pk__i--ic pk__i--ok">
            <span className="pk__ico"><IconCheck /></span>
            <b>{stats.ready}</b>
            <span>{t("statReady")}</span>
          </div>
          <div className="pk__i pk__i--ic pk__i--active">
            <span className="pk__ico"><IconScale /></span>
            <b>{stats.lawyer}</b>
            <span>{t("statLawyer")}</span>
          </div>
        </div>
      ) : null}

      <div className="cwork__bar mydocs__bar">
        <div className="chiprow chiprow--tabs">
          {TABS.map((tb) => (
            <button key={tb} type="button" className="fchip" aria-pressed={tab === tb} onClick={() => setTab(tb)}>
              {t(`tab_${tb}`)}
            </button>
          ))}
        </div>
        {/* Searches the rows that are loaded, which is the page plus whatever
            "Yana yuklash" has added — the endpoint takes no query parameter,
            so there is nothing to ask the server. Said out loud under the
            list when a search comes up empty and there are still pages left. */}
        <div className="lsearch mydocs__srch">
          <IconSearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("searchPh")} />
        </div>
        {/* How the document was made is a tab; where it has got to is a
            select. Only statuses this client's own documents have actually
            been in are offered — the endpoint knows a dozen and most of them
            would filter to nothing here. Same control, same place, as
            "Mening ishlarim". */}
        {seen.length > 1 ? (
          <label className="cwork__filt">
            <span>{tcm("filterStatus")}</span>
            <Select
              value={pick}
              onChange={setPick}
              ariaLabel={tcm("filterStatus")}
              options={[{ value: "", label: tcm("filterAllStatuses") }, ...seen.map((s) => ({ value: s, label: statusLabel(tcm, s, "docStatus") || s }))]}
            />
          </label>
        ) : null}
      </div>

      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}

      {status === "loading" ? (
        <Skeleton rows={3} />
      ) : status === "error" ? (
        // A failed fetch used to render as "you have no documents" — the one
        // message that must never be guessed at on this page.
        <Notice ok={false} msg={t("loadError")} />
      ) : !shown.length ? (
        rows.length ? (
          // Searched, and nothing on the rows we hold matched. Says so, and
          // says the archive may still have more — the search cannot reach
          // pages that have not been fetched.
          <EmptyState icon={<IconSearch />} title={t("searchEmpty")} text={more ? t("searchEmptyMore") : t("searchEmptyText")} />
        ) : (
          <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
        )
      ) : (
        <div className="mydocs">
          {shown.map((item) => {
            const ModeIcon = MODE_ICON[item.mode as keyof typeof MODE_ICON] ?? IconFileText;
            const room = item.secureChatRoomId || rooms[item.id];
            const ready = item.file.ready;
            const tone = statusTone(item.status);
            // §5 L116-122: the constructor half of a document an advocate is
            // holding. Offered strictly on the backend's word —
            // constructor_action.available with a constructor_continue_url —
            // which on 2026-09-29 was true for 10 of the 50 live rows and
            // false for the 9 held rows that have no template behind them.
            const canContinue = !!item.constructorAction?.available && !!(item.constructorUrls.continueUrl || item.constructorAction?.continueUrl);
            // §5 L114-115. can_send_lawyer_request defaults to true when the
            // field is absent, so an older deployment is not locked out.
            const blocked = !item.canSendLawyerRequest;
            // Handing the client's own document to the call-center pool is
            // what POST /document-requests/{id}/lawyer-review is for, so the
            // control belongs on the rows the client filled in themselves —
            // plus, disabled, on any row the backend has blocked, because a
            // refusal with nothing to refuse explains nothing.
            const canSend = (item.mode === "manual" && tone !== "closed") || blocked;
            const info = rated[item.id];
            // A complaint is offered on exactly the rows a rating is offered
            // on — the finished ones — but unlike the rating it does not
            // expire with the 15-minute window, so it is gated on the row
            // being finished rather than on the window still being open.
            const acts = !!room || ready || canContinue || canSend;
            // The work id the client and the advocate quote at each other.
            const workId = item.workId || info?.workId || "";
            return (
              <article className={`mydoc mydoc--${item.mode}${ready ? " mydoc--ready" : ""}${tone === "closed" ? " mydoc--closed" : ""}${promptId === item.id ? " mydoc--flag" : ""}`} key={item.id}>
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
                    {/* The score takes the corner the status pill had, and
                        the pill moves under it. On a rated document the
                        stars are the thing worth seeing first — "Baholangan"
                        only repeats what five filled stars already say. */}
                    <span className="mydoc__corner">
                      {info?.rating.submitted && info.rating.value ? <DocRatedStars value={info.rating.value} /> : null}
                      <em className={`mydoc__st mydoc__st--${tone}`}>
                        {statusLabel(tcm, item.status, "docStatus") || item.statusLabel}
                      </em>
                    </span>
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
                      {/* The prompt comes first when the backend asks for one
                          (prompt_required is true only while an advocate is
                          actually holding the row); otherwise the constructor
                          opens straight away, as §3 L74 reads. */}
                      {canContinue ? (
                        <button
                          type="button"
                          className="btn btn--line btn--sm"
                          disabled={!!openBusy}
                          onClick={() => (item.constructorAction?.promptRequired ? setPromptId(item.id) : void openConstructor(item))}
                        >
                          <IconEdit />
                          {openBusy === item.id ? tcommon("processingShort") : t("constructorContinue")}
                        </button>
                      ) : null}
                      {canSend ? (
                        <button
                          type="button"
                          className="btn btn--line btn--sm"
                          disabled={blocked || sendBusy}
                          title={blocked ? item.lawyerRequestBlockReason || undefined : undefined}
                          onClick={() => { setSendId(item.id); setSendNeed(""); }}
                        >
                          <IconScale />
                          {tcommon("reviewOpen")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {/* Why that button is dead, in the backend's own words
                      (§5 L115) rather than a tooltip nobody on a phone can
                      reach. */}
                  {blocked && item.lawyerRequestBlockReason ? <p className="mydoc__block">{item.lawyerRequestBlockReason}</p> : null}
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

      {/* §3 L74 + §5 L116: the two-button prompt, in the backend's own title
          and message. Measured on 2026-09-29: its title is byte-identical to
          portal.client.documents.lawyerGateTitle, while its message is one
          short question where the local lead still promised a document filled
          in "0 dan" — which stopped being true when the backend started
          handing back the held row's own constructor. The server's text wins;
          the local strings are the fallback for a deployment that sends none,
          and the button labels stay local because the backend names the two
          actions ("open_constructor" / "wait_for_lawyer") without wording
          them. */}
      <Modal open={!!promptRow} onClose={() => setPromptId("")} title={promptRow?.constructorAction?.title || tcommon("lawyerGateTitle")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p className="dexit__lead">
            <span className="dexit__i"><IconScale /></span>
            {promptRow?.constructorAction?.message || tcommon("lawyerGateLead")}
          </p>
          {promptRow?.lawyerRequestBlockReason ? <p className="dgate__note">{promptRow.lawyerRequestBlockReason}</p> : null}
          <div className="dexit__btns">
            <button type="button" className="btn btn--line btn--full" onClick={() => setPromptId("")}>
              {tcommon("lawyerGateWait")}
            </button>
            <button type="button" className="btn btn--grad btn--full" disabled={!!openBusy} onClick={() => promptRow && void openConstructor(promptRow)}>
              {openBusy ? tcommon("processingShort") : tcommon("lawyerGateOpen")}
            </button>
          </div>
        </div>
      </Modal>

      {/* "Advokat tekshiruviga yuborish" from the list. Same endpoint and the
          same wording as the one inside the builder, so a client who meets
          both is not told two different things. */}
      <Modal open={!!sendRow} onClose={() => setSendId("")} title={tcommon("reviewOpen")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <div className="docreview">
            <label htmlFor="mydoc-review-need">{tcommon("reviewNeedLabel")}</label>
            <textarea id="mydoc-review-need" rows={3} value={sendNeed} onChange={(e) => setSendNeed(e.target.value)} placeholder={tcommon("reviewNeedDefault")} />
          </div>
          <div className="dexit__btns">
            <button type="button" className="btn btn--line btn--full" onClick={() => setSendId("")} disabled={sendBusy}>
              {tcommon("reviewCancel")}
            </button>
            <button type="button" className="btn btn--grad btn--full" disabled={sendBusy} onClick={() => sendRow && void sendToLawyer(sendRow)}>
              {sendBusy ? tcommon("processingShort") : tcommon("reviewSubmit")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
