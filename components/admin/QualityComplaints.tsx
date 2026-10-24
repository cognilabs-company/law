"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  listQualityComplaints,
  getQualityComplaint,
  resolveQualityComplaint,
  isQualityComplaintEvent,
  QC_ACTIONS,
  type QualityComplaintRow,
  type QcAction,
} from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError, asDict, asNum, asStr, logApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { shortDateTime } from "@/lib/date";
import { humanize, labelOf, statusLabel, statusMap, type StatusMap, type StatusToneRule } from "@/lib/labels";
import Modal from "@/components/admin/Modal";
import FilterBar from "@/components/filters/FilterBar";
import FieldError from "@/components/ui/FieldError";
import ListPager, { PAGE_STEP, usePaged } from "@/components/ui/ListPager";
import { useAiSelection } from "@/lib/ai/registry";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { CountBadge, StatusBadge } from "@/components/ui/Badge";
import IconButton from "@/components/ui/IconButton";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUrgentStatuses } from "./UrgentAdvocateQueue";
import { IconAlert, IconUser, IconScale, IconClock, IconStarRate, IconFileText, IconBolt, IconClipboardCheck, IconPhone, IconRefresh } from "@/components/icons";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

// LEXGO_FRONTEND_CLIENT_WORKS_QUALITY_EDITOR_2026-09-29.md §5.
//
// The operator's queue of quality complaints. Nobody files one of these by
// hand: the backend opens it when a client rates a piece of work one or two
// stars (see rateDocumentRequest), so every row here already carries the
// rating, the complaint text, the advocate and the document behind it.
//
// Three rulings, and only one of them costs the advocate anything:
// rework_required reopens the work for the SAME advocate, free; rejected
// closes it with a note the client receives; resolved just closes it.
//
// The status vocabulary and the realtime event names are the backend's, read
// off the list response (`statuses`, `realtime.events`) rather than hardcoded
// — live they are new / under_review / rework_required / rejected / resolved.

const SETTLED = new Set(["resolved", "rejected", "rework_required"]);

const QC_TONES: Readonly<Record<string, StatusToneRule>> = {
  new: { tone: "err", dot: true },
  under_review: "warn",
  rework_required: "info",
  rejected: "neutral",
  resolved: "ok",
};

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function QualityComplaints({ onCount }: { onCount?: (n: number) => void }) {
  const t = useTranslations("admin.qualityComplaints");
  const tcm = useTranslations("portal.common");
  const tn = useTranslations("common.notify");
  const locale = useLocale();

  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<QualityComplaintRow[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [failure, setFailure] = useState<unknown>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const [openId, setOpenId] = useState("");
  const listed = useRef(false);

  useEffect(() => {
    let alive = true;
    listQualityComplaints()
      .then((q) => {
        if (!alive) return;
        listed.current = q.items.length > 0;
        setRows(q.items);
        if (q.statuses.length) setStatuses(q.statuses);
        setState("ready");
        setRefreshing(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setRefreshing(false);
        logApiError("quality complaints", e);
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          listed.current = false;
          setState("forbidden");
          return;
        }
        if (listed.current) {
          setState("ready");
          notify.error(t("refreshFailed"), { id: "cc-complaints-refresh", error: e, action: { label: tn("retry"), onClick: refresh } });
          return;
        }
        setFailure(e);
        setState("error");
      });
    return () => { alive = false; };
  }, [reloadKey, refresh, t, tn]);

  // §6: the operator must see a new complaint arrive without reloading.
  useEffect(() => subscribeUserEvents((ev) => { if (isQualityComplaintEvent(ev.event)) refresh(); }), [refresh]);

  const countRef = useRef(onCount);
  useEffect(() => {
    countRef.current = onCount;
  });
  const unresolved = state === "ready" ? rows.filter((r) => !SETTLED.has(r.status)).length : null;
  useEffect(() => {
    if (unresolved !== null) countRef.current?.(unresolved);
  }, [unresolved]);

  const shown = useMemo(() => (status ? rows.filter((r) => r.status === status) : rows), [rows, status]);
  const pager = usePaged(shown, PAGE_STEP, status);
  const openRow = useMemo(() => rows.find((r) => r.id === openId) ?? null, [rows, openId]);
  const qcMap: StatusMap = useMemo(() => statusMap(t, "status", QC_TONES), [t]);
  const label = (s: string, fallback?: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : statusLabel(tcm, s, undefined, fallback));
  const tally = (s: string) => (state === "ready" ? ` (${rows.filter((r) => r.status === s).length})` : "");
  useAiSelection("quality_complaints_status", status);

  if (state === "forbidden") return null;

  function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    refresh();
  }

  return (
    <section className="ppanel" data-ai-target="callcenter:complaints">
      <div className="ppanel__h cch">
        <h2 className="ppanel__t cch__t"><span className="pico"><IconAlert /></span><span className="cch__tt">{t("title")}</span></h2>
        <div className="cch__a">
          {state === "ready" ? <CountBadge n={shown.length} /> : null}
          <IconButton label={t("refresh")} icon={<IconRefresh />} onClick={refreshNow} busy={refreshing} tipAlign="end" aiId="call_center.complaints.refresh" />
        </div>
      </div>
      <p className="ppanel__note">{t("lead")}</p>

      <FilterBar
        className="uf--tray uf--solo"
        fields={[
          {
            key: "status",
            label: t("fStatus"),
            icon: IconClipboardCheck,
            value: status,
            onChange: setStatus,
            options: [{ value: "", label: `${t("all")}${state === "ready" ? ` (${rows.length})` : ""}` }, ...statuses.map((s) => ({ value: s, label: `${label(s)}${tally(s)}` }))],
            chip: null,
            aiId: "call_center.complaints.filters.status",
          },
        ]}
        aiId="call_center.complaints.filters"
      />

      {state === "loading" ? (
        <Skeleton rows={3} />
      ) : state === "error" ? (
        <ErrorState error={failure} onRetry={() => { setState("loading"); refresh(); }} title={t("loadError")} />
      ) : !shown.length ? (
        <EmptyState icon={<IconAlert />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <>
          <div className="alist alist--flow">
            {pager.visible.map((r) => (
              <button type="button" className="qcrow" key={r.id} onClick={() => setOpenId(r.id)}>
                <span className={`qcrow__st qcrow__st--${r.status}`} aria-hidden />
                <span className="qcrow__m">
                  <b>{r.title || r.workId || t("title")}</b>
                  <span className="qcrow__meta">
                    {r.workId ? <small className="qcrow__wid">{r.workId}</small> : null}
                    {r.rating ? <small className="qcrow__rate"><IconStarRate />{r.rating}</small> : null}
                    {r.clientName ? <small><IconUser />{r.clientName}</small> : null}
                    {r.lawyerName ? <small><IconScale />{r.lawyerName}</small> : null}
                    {r.createdAt ? <small><IconClock />{shortDateTime(r.createdAt, locale)}</small> : null}
                  </span>
                  {r.complaint ? <span className="qcrow__txt">{r.complaint}</span> : null}
                </span>
                <StatusBadge status={r.status} map={qcMap} fallback={label(r.status, r.statusLabel)} size="sm" className="qcrow__badge" />
              </button>
            ))}
          </div>
          <ListPager {...pager.bind} less aiId="call_center.complaints.more" />
        </>
      )}

      {openRow ? (
        <QcDetail key={openRow.id} row={openRow} label={label} statuses={qcMap} onClose={() => setOpenId("")} onDone={() => { setOpenId(""); refresh(); }} />
      ) : null}
    </section>
  );
}

// One complaint, with everything the MD says the operator has to see before
// ruling: the complaint text, the client, the advocate, the document behind
// it and the rating the client left.
function QcDetail({
  row,
  label,
  statuses,
  onClose,
  onDone,
}: {
  row: QualityComplaintRow;
  label: (s: string, fallback?: string) => string;
  statuses: StatusMap;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("admin.qualityComplaints");
  const tcm = useTranslations("portal.common");
  const tc = useTranslations("common.confirm");
  const tu = useTranslations("admin.urgent");
  const tk = useTranslations("portal.client.urgent");
  const urgMap = useUrgentStatuses();
  const locale = useLocale();
  const uid = useId();
  const noteId = `${uid}-note`;
  const noteErrId = `${uid}-note-err`;
  const actLblId = `${uid}-act`;
  const actErrId = `${uid}-act-err`;
  const noteBox = useRef<HTMLTextAreaElement>(null);
  const pickBox = useRef<HTMLDivElement>(null);
  const [blocks, setBlocks] = useState<Record<string, unknown>>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [failure, setFailure] = useState<unknown>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [action, setAction] = useState<QcAction | "">("");
  const [actionErr, setActionErr] = useState("");
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState("");
  const [busy, setBusy] = useState(false);
  const once = useSameTickGuard();

  useEffect(() => {
    let alive = true;
    getQualityComplaint(row.id)
      .then((d) => { if (alive) { setBlocks(d.blocks); setState("ready"); } })
      .catch((e: unknown) => { if (alive) { setFailure(e); setState("error"); } });
    return () => { alive = false; };
  }, [row.id, attempt]);

  const doc = asDict(blocks.document ?? blocks.document_request);
  const lr = asDict(blocks.lawyer_request);
  const review = asDict(blocks.review ?? blocks.rating);
  const cmp = asDict(asDict(blocks.complaint).payload);
  const clientName = row.clientName || asStr(cmp.client_name).trim();
  const clientPhone = asStr(cmp.client_phone).trim();
  const rating = row.rating || asNum(cmp.rating) || asNum(review.rating);
  const priority = asStr(cmp.priority).trim();
  const reason = asStr(cmp.reason).trim();
  const comment = row.complaint || asStr(cmp.comment).trim();
  const reviewText = asStr(review.comment ?? review.text).trim();
  const fileUrl = asStr(doc.file_url ?? doc.download_url ?? lr.fulfill_file_url ?? lr.source_file_url);
  // The other half of the queue. A complaint is opened by a 1-2 star rating
  // on a document request OR on a Tezkor advocate record, and the detail
  // carries `document` for the first and `urgent_request` for the second
  // (LEXGO_RATING_COMPLAINT_WINDOW_2026-09-29.md, "Callcenter uchun"). Only
  // the document block was read here, so an operator opening a Tezkor
  // complaint saw the client's words and nothing about the work they were
  // about — no service, no request, nothing to rule on.
  const urg = asDict(blocks.urgent_request ?? blocks.urgent_advokat_request);
  const urgPayload = asDict(urg.payload);
  const urgPick = (k: string) => asStr(urg[k] === undefined || urg[k] === null ? urgPayload[k] : urg[k]);
  const urgKind = urgPick("service_kind");
  const urgTitle = (urgKind && tk.has(`kinds.${urgKind}`) ? tk(`kinds.${urgKind}`) : "") || urgPick("title") || urgPick("service_title") || (urgKind ? humanize(urgKind) : "");
  const urgNeed = urgPick("need") || urgPick("description");
  const urgRaw = urgPick("status");
  const urgStatus = urgRaw ? urgMap[urgRaw]?.label ?? labelOf(tu, "st", urgRaw, urgPick("status_label")) : urgPick("status_label");
  const urgWorkId = urgPick("work_id") || (UUID_LIKE.test(row.urgentRequestId) ? "" : row.urgentRequestId);
  // A ruling is only final once: the form disappears rather than inviting a
  // second POST the backend would refuse.
  const settled = row.status === "resolved" || row.status === "rejected" || row.status === "rework_required";

  async function submit() {
    if (busy || !once()) return;
    const noNote = !note.trim();
    setActionErr(action ? "" : t("actionRequired"));
    setNoteErr(noNote ? t("noteRequired") : "");
    if (!action) {
      const first = pickBox.current?.querySelector<HTMLInputElement>("input[type=radio]");
      first?.focus({ preventScroll: true });
      requestAnimationFrame(() => document.getElementById(actErrId)?.scrollIntoView({ block: "nearest" }));
      return;
    }
    if (noNote) {
      noteBox.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await resolveQualityComplaint(row.id, action, note.trim());
      notify.success(t("resolved"), { id: `qc-resolve-${row.id}`, body: [label(action), row.workId || row.title].filter(Boolean).join(" · ") });
      onDone();
    } catch (e) {
      logApiError("quality complaint resolve", e);
      notify.error(t("resolveFailed"), { id: `qc-resolve-${row.id}`, error: e });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={row.title || t("title")}
      size="lg"
      initialFocus="title"
      busy={busy}
      dirty={!settled && (!!action || !!note.trim())}
      footer={
        settled ? undefined : (
          <>
            <button type="button" className="btn btn--line" disabled={busy} onClick={onClose}>
              {tc("cancel")}
            </button>
            <button type="button" className="btn btn--pri" onClick={() => void submit()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
              {busy ? tcm("processingShort") : t("resolveSubmit")}
            </button>
          </>
        )
      }
    >
      <div className="qcdet">
        <dl className="qcdet__facts" data-ai-private>
          {row.workId ? (<><dt>{t("fWorkId")}</dt><dd className="qcdet__wid">{row.workId}</dd></>) : null}
          <dt>{t("fStatus")}</dt><dd><StatusBadge status={row.status} map={statuses} fallback={label(row.status, row.statusLabel)} size="sm" /></dd>
          {rating ? (<><dt>{t("fRating")}</dt><dd><span className="qcdet__chip qcdet__chip--rate"><IconStarRate aria-hidden="true" />{rating}</span></dd></>) : null}
          {priority ? (
            <>
              <dt>{t("fPriority")}</dt>
              <dd><span className={`qcdet__chip qcdet__chip--${priority === "high" || priority === "urgent" ? "hot" : "calm"}`}>{t.has(`priority.${priority}`) ? t(`priority.${priority}`) : humanize(priority)}</span></dd>
            </>
          ) : null}
          {reason ? (<><dt>{t("fReason")}</dt><dd>{t.has(`reason.${reason}`) ? t(`reason.${reason}`) : humanize(reason)}</dd></>) : null}
          {clientName ? (<><dt>{t("fClient")}</dt><dd>{clientName}</dd></>) : null}
          {clientPhone ? (<><dt>{t("fPhone")}</dt><dd><a className="qcdet__tel" href={`tel:${clientPhone.replace(/[^+\d]/g, "")}`}><IconPhone aria-hidden="true" />{clientPhone}</a></dd></>) : null}
          {row.lawyerName ? (<><dt>{t("fLawyer")}</dt><dd>{row.lawyerName}</dd></>) : null}
          {row.createdAt ? (<><dt>{t("fCreated")}</dt><dd>{shortDateTime(row.createdAt, locale)}</dd></>) : null}
        </dl>

        {comment ? (
          <section className="qcdet__b qcdet__b--err">
            <b><IconAlert />{t("bComplaint")}</b>
            <p>{comment}</p>
          </section>
        ) : null}

        {state === "loading" ? <Skeleton rows={2} /> : null}
        {state === "error" ? <ErrorState error={failure} onRetry={() => { setState("loading"); setAttempt((n) => n + 1); }} title={t("detailLoadError")} compact /> : null}

        {state === "ready" && reviewText && reviewText !== comment ? (
          <section className="qcdet__b">
            <b><IconStarRate />{t("bReview")}</b>
            <p>{reviewText}</p>
          </section>
        ) : null}

        {state === "ready" && (asStr(doc.title) || fileUrl) ? (
          <section className="qcdet__b">
            <b><IconFileText />{t("bDocument")}</b>
            {asStr(doc.title) ? <p>{asStr(doc.title)}</p> : null}
            {fileUrl ? (
              <a className="btn btn--line btn--sm" href={fileUrl} target="_blank" rel="noopener noreferrer">
                {t("openFile")}
              </a>
            ) : null}
          </section>
        ) : null}

        {state === "ready" && (urgTitle || urgNeed) ? (
          <section className="qcdet__b">
            <b><IconBolt />{t("bUrgent")}</b>
            {urgTitle ? <p>{urgTitle}</p> : null}
            {urgNeed ? <p className="advmuted">{urgNeed}</p> : null}
            {urgWorkId || urgStatus ? (
              <p className="qcdet__urgmeta">
                {urgWorkId ? <em className="qcdet__wid">{urgWorkId}</em> : null}
                {urgStatus ? <span>{urgStatus}</span> : null}
              </p>
            ) : null}
          </section>
        ) : null}

        {settled ? (
          <InlineAlert tone="success">{t("alreadySettled", { action: label(row.status, row.statusLabel) })}</InlineAlert>
        ) : (
          <section className="qcdet__resolve" aria-labelledby={actLblId}>
            <b id={actLblId}>{t("resolveTitle")}</b>
            {/* Says what the chosen action actually does before it is done —
                rework_required is free work for the advocate, so it must not be
                a blind pick. */}
            <div
              ref={pickBox}
              className="ccpick"
              role="radiogroup"
              aria-labelledby={actLblId}
              aria-required="true"
              aria-invalid={actionErr ? true : undefined}
              aria-describedby={actionErr ? actErrId : undefined}
            >
              {QC_ACTIONS.map((a) => (
                <label key={a} className={`ccpick__o${action === a ? " on" : ""}`}>
                  <input
                    className="ccpick__in"
                    type="radio"
                    name={`${uid}-action`}
                    value={a}
                    checked={action === a}
                    disabled={busy}
                    onChange={() => {
                      setAction(a);
                      setActionErr("");
                    }}
                  />
                  <span className="ccpick__dot" aria-hidden="true" />
                  <span className="ccpick__m">
                    <b>{t(`action.${a}`)}</b>
                    <small>{t(`actionHint.${a}`)}</small>
                  </span>
                </label>
              ))}
            </div>
            <FieldError id={actErrId} msg={actionErr} />
            <label className="qcdet__lbl" htmlFor={noteId}>{t("noteLabel")}</label>
            <textarea
              id={noteId}
              ref={noteBox}
              rows={3}
              className="qcdet__note"
              value={note}
              onChange={(e) => { setNote(e.target.value); setNoteErr(""); }}
              placeholder={t("notePh")}
              aria-required="true"
              aria-invalid={noteErr ? true : undefined}
              aria-describedby={noteErr ? noteErrId : undefined}
              maxLength={2000}
            />
            <FieldError id={noteErrId} msg={noteErr} />
          </section>
        )}
      </div>
    </Modal>
  );
}
