"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  listClientWorks,
  getClientWork,
  isQualityComplaintEvent,
  isUrgentEvent,
  WORKS_PAGE,
  type ClientWork,
  type ClientWorkTab,
  type ClientWorkDetail,
} from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import { asDict, asStr } from "@/lib/http";
import { statusLabel } from "@/lib/labels";
import { shortDateTime } from "@/lib/date";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { Skeleton, EmptyState } from "./DataState";
import {
  IconBriefcase,
  IconFileText,
  IconBolt,
  IconAlert,
  IconScale,
  IconUser,
  IconClock,
  IconChat,
  IconArrowRight,
  IconVideo,
} from "@/components/icons";

// LEXGO_FRONTEND_CLIENT_WORKS_QUALITY_EDITOR_2026-09-29.md §1 and §9.
//
// "Mening hujjatlarim" is the document archive and nothing else; this is
// every legal PROCESS the client has running — work an advocate is doing,
// Tezkor services, orders, cases and complaints. The two screens used to
// show each other's rows, and GET /clients/me/works exists to stop that: it
// is the one list that knows what a "work" is, and it names the separation
// rule in its own response.
//
// The tab strip is the backend's (`tabs`), not ours. A sixth type it adds
// later appears here with its own title and needs no frontend release —
// which also means the type labels below come from that same list rather
// than from a map this file would have to keep in step.

const TYPE_ICON: Record<string, typeof IconBriefcase> = {
  document_lawyer_work: IconFileText,
  urgent_advokat: IconBolt,
  quality_complaint: IconAlert,
  complaint: IconAlert,
  service_order: IconScale,
  legal_case: IconBriefcase,
};

// Where a work of each type is actually worked on. The row links there
// rather than this screen re-implementing five detail views.
const TYPE_HREF: Record<string, string> = {
  document_lawyer_work: "/portal/client/documents",
  urgent_advokat: "/portal/client/urgent",
  quality_complaint: "/portal/client/complaints",
  complaint: "/portal/client/complaints",
  service_order: "/portal/client/payments",
  legal_case: "/portal/client/cases",
};

// Green when it is finished, amber while someone else has it, blue while it
// is moving. Unknown statuses land on "working", which claims nothing.
function tone(status: string): "done" | "waiting" | "closed" | "working" {
  if (/^(completed|resolved|closed|file_ready|rated|done|paid)$/.test(status)) return "done";
  if (/^(new|open_pool|pending|under_review|lawyer_review|questionnaire|payment_pending)$/.test(status)) return "waiting";
  if (/^(cancelled|rejected|expired|failed)$/.test(status)) return "closed";
  return "working";
}

export default function ClientWorks() {
  const t = useTranslations("portal.client.works");
  const tcm = useTranslations("portal.common");
  const locale = useLocale();

  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState<ClientWork[]>([]);
  const [tabs, setTabs] = useState<ClientWorkTab[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [moreBusy, setMoreBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Back to the skeleton during render when the tab changes, not in the
  // effect — one render instead of a cascade (the house pattern, see
  // ClientDocumentRequests).
  const [prevTab, setPrevTab] = useState(tab);
  if (prevTab !== tab) { setPrevTab(tab); setStatus("loading"); }

  useEffect(() => {
    let alive = true;
    listClientWorks({ type: tab, limit: WORKS_PAGE, offset: 0 })
      .then((p) => {
        if (!alive) return;
        setRows(p.items);
        setTotal(p.total);
        // Only ever grows from the "all" answer: a filtered call returns the
        // same tab list, but taking it from every answer would let a slow
        // filtered response overwrite the strip mid-click.
        if (p.tabs.length) setTabs(p.tabs);
        setStatus("ready");
      })
      .catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, [tab, reloadKey]);

  // §6 plus the modules this list aggregates: a complaint opening, an urgent
  // record moving or a document request changing all change a row here.
  useEffect(() => {
    return subscribeUserEvents((ev) => {
      if (isQualityComplaintEvent(ev.event) || isUrgentEvent(ev.event) || ev.event.startsWith("document_request.")) refresh();
    });
  }, [refresh]);

  async function loadMore() {
    if (moreBusy || rows.length >= total) return;
    setMoreBusy(true);
    try {
      const p = await listClientWorks({ type: tab, limit: WORKS_PAGE, offset: rows.length });
      setRows((cur) => {
        const seen = new Set(cur.map((x) => x.id));
        return [...cur, ...p.items.filter((x) => !seen.has(x.id))];
      });
      setTotal(p.total);
    } catch {
      // Leave what is on screen; the count already says there is more.
    } finally {
      setMoreBusy(false);
    }
  }

  // What to call a type.
  //
  // Our own translation first, then the backend's tab title, then the slug
  // humanised. Ours leads because the two do not line up: the tab strip
  // offers `quality_complaint` while every complaint row the endpoint returns
  // carries type `complaint` (measured 2026-09-29: 9 rows of `complaint`,
  // and ?type=quality_complaint answers 0). Reading the label off the tabs
  // alone therefore printed a raw humanised "Complaint" on an Uzbek page.
  // The mismatch itself is the backend's to fix — filtering by that tab
  // really does return nothing — and is filed as an ask.
  const typeName = useMemo(() => {
    const m = new Map(tabs.map((x) => [x.key, x.title]));
    return (k: string) => (t.has(`type.${k}`) ? t(`type.${k}`) : m.get(k) || statusLabel(tcm, k) || k);
  }, [tabs, tcm, t]);

  const [openId, setOpenId] = useState("");
  const openRow = useMemo(() => rows.find((r) => r.workId === openId) ?? null, [rows, openId]);

  const strip: ClientWorkTab[] = tabs.length ? tabs : [{ key: "all", title: t("tabAll") }];

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconBriefcase /></span>{t("title")}</b>
        <span className="advmuted">{total}</span>
      </div>
      {/* §9's separation, said once where a client might otherwise wonder why
          their documents are not here. */}
      <p className="ppanel__note">
        {t("lead")}{" "}
        <Link href="/portal/client/documents" className="cwork__sep">
          {t("documentsLink")}
          <IconArrowRight />
        </Link>
      </p>

      <div className="chiprow cwork__tabs">
        {strip.map((x) => (
          <button
            key={x.key}
            type="button"
            className={`chip${tab === x.key ? " on" : ""}`}
            aria-pressed={tab === x.key}
            onClick={() => setTab(x.key)}
          >
            {x.title}
          </button>
        ))}
      </div>

      {status === "loading" ? (
        <Skeleton rows={4} />
      ) : status === "error" ? (
        <EmptyState icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} />
      ) : !rows.length ? (
        <EmptyState icon={<IconBriefcase />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <>
          <div className="cworks">
            {rows.map((r) => {
              const Icon = TYPE_ICON[r.type] ?? IconBriefcase;
              const tn = tone(r.status);
              return (
                <button type="button" className="cwork" key={r.id} onClick={() => setOpenId(r.workId)}>
                  <span className={`cwork__i cwork__i--${r.type.replace(/[^a-z_]/g, "")}`} aria-hidden><Icon /></span>
                  <span className="cwork__m">
                    <span className="cwork__top">
                      <b className="cwork__t">{r.title || typeName(r.type)}</b>
                      <em className={`cwork__st cwork__st--${tn}`}>
                        {r.statusLabel || statusLabel(tcm, r.status)}
                      </em>
                    </span>
                    <span className="cwork__row">
                      {r.workId ? <small className="cwork__wid">{r.workId}</small> : null}
                      <small className="cwork__type">{typeName(r.type)}</small>
                      {r.assignedLawyer?.name ? <small><IconUser />{r.assignedLawyer.name}</small> : null}
                      {r.hasChat ? <small><IconChat />{t("hasChat")}</small> : null}
                      {r.hasMeeting ? <small><IconVideo />{t("hasMeeting")}</small> : null}
                      {r.createdAt ? <small><IconClock />{shortDateTime(r.createdAt, locale)}</small> : null}
                    </span>
                    {r.nextAction ? <span className="cwork__next"><IconArrowRight />{r.nextAction}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
          {rows.length < total ? (
            <button type="button" className="btn btn--line btn--full" onClick={() => void loadMore()} disabled={moreBusy}>
              {moreBusy ? tcm("processingShort") : t("more", { n: total - rows.length })}
            </button>
          ) : null}
        </>
      )}

      <Modal
        open={!!openRow}
        onClose={() => setOpenId("")}
        title={openRow ? openRow.title || typeName(openRow.type) : ""}
      >
        {openRow ? <WorkDetail row={openRow} typeName={typeName} /> : null}
      </Modal>
    </div>
  );
}

// One work, opened out.
//
// The detail endpoint answers a different set of blocks per type — verified
// against production, one record of each: document_lawyer_work carries
// lawyer_request / document / chat / meeting / rating / complaints, a
// complaint carries complaint / document / lawyer_request / review, urgent
// carries urgent_request, a case carries case / timeline, an order carries
// order / status_history. Rather than five hand-written views that would
// drift, this shows the facts every type has and then the ONE thing its own
// blocks add that the summary does not already say — and sends the client to
// the screen that actually works on it.
function WorkDetail({ row, typeName }: { row: ClientWork; typeName: (k: string) => string }) {
  const t = useTranslations("portal.client.works");
  const tcm = useTranslations("portal.common");
  const locale = useLocale();
  const [detail, setDetail] = useState<ClientWorkDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // Reset during render, not in the effect: the modal reuses this component
  // when the client opens a second work, and a setState in the effect body is
  // a cascading render (and a lint error in this repo).
  const [prevId, setPrevId] = useState(row.workId);
  if (prevId !== row.workId) { setPrevId(row.workId); setState("loading"); setDetail(null); }

  useEffect(() => {
    let alive = true;
    getClientWork(row.workId)
      .then((d) => { if (alive) { setDetail(d); setState("ready"); } })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [row.workId]);

  // The complaint's own text, wherever the block keeps it. A complaint made
  // from a low rating and one made standalone are the same record type but
  // are not filled in the same way, so both spellings are read.
  const complaintText = (() => {
    if (!detail) return "";
    const c = asDict(detail.blocks.complaint);
    const p = asDict(c.payload);
    return asStr(c.complaint ?? c.description ?? c.text ?? p.description ?? p.complaint);
  })();
  // What the operator ruled, once they have.
  const review = (() => {
    if (!detail) return { action: "", note: "" };
    const r = asDict(detail.blocks.review ?? detail.blocks.resolution);
    return { action: asStr(r.action ?? r.status), note: asStr(r.note ?? r.comment ?? r.text) };
  })();
  const roomId = (() => {
    if (!detail) return "";
    const c = asDict(detail.blocks.chat);
    return asStr(c.room_id) || asStr(asDict(detail.blocks.lawyer_request).secure_chat_room_id);
  })();

  const href = TYPE_HREF[row.type] || "";

  return (
    <div className="cwdet">
      <dl className="cwdet__facts">
        {row.workId ? (<><dt>{t("fWorkId")}</dt><dd className="cwdet__wid">{row.workId}</dd></>) : null}
        <dt>{t("fType")}</dt><dd>{typeName(row.type)}</dd>
        <dt>{t("fStatus")}</dt><dd>{row.statusLabel || statusLabel(tcm, row.status)}</dd>
        {row.assignedLawyer?.name ? (<><dt>{t("fLawyer")}</dt><dd>{row.assignedLawyer.name}</dd></>) : null}
        {row.operator?.name ? (<><dt>{t("fOperator")}</dt><dd>{row.operator.name}</dd></>) : null}
        {row.createdAt ? (<><dt>{t("fCreated")}</dt><dd>{shortDateTime(row.createdAt, locale)}</dd></>) : null}
      </dl>

      {row.nextAction ? (
        <p className="cwdet__next"><IconArrowRight />{row.nextAction}</p>
      ) : null}

      {state === "loading" ? (
        <Skeleton rows={2} />
      ) : state === "error" ? (
        <p className="advmuted">{tcm("loadErrorText")}</p>
      ) : (
        <>
          {complaintText ? (
            <section className="cwdet__b">
              <b><IconAlert />{t("bComplaint")}</b>
              <p>{complaintText}</p>
            </section>
          ) : null}
          {review.action || review.note ? (
            <section className="cwdet__b cwdet__b--ok">
              <b><IconScale />{t("bReview")}</b>
              {review.action ? <span className="advmuted">{t.has(`qcAction.${review.action}`) ? t(`qcAction.${review.action}`) : review.action}</span> : null}
              {review.note ? <p>{review.note}</p> : null}
            </section>
          ) : null}
        </>
      )}

      <div className="cwdet__acts">
        {roomId ? (
          <Link href={`/portal/chat/${roomId}`} className="btn btn--line btn--sm">
            <IconChat />{t("openChat")}
          </Link>
        ) : null}
        {href ? (
          <Link href={href} className="btn btn--grad btn--sm">
            {t("openWork")}<IconArrowRight />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
