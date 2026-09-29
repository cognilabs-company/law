"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { asDict, asStr, errDetail, logApiError } from "@/lib/http";
import { shortDateTime } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconAlert, IconUser, IconScale, IconClock, IconStarRate, IconFileText } from "@/components/icons";

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

export default function QualityComplaints() {
  const t = useTranslations("admin.qualityComplaints");
  const tcm = useTranslations("portal.common");
  const locale = useLocale();

  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<QualityComplaintRow[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const [openId, setOpenId] = useState("");

  const [prevStatus, setPrevStatus] = useState(status);
  if (prevStatus !== status) { setPrevStatus(status); setState("loading"); }

  useEffect(() => {
    let alive = true;
    listQualityComplaints(status || undefined)
      .then((q) => {
        if (!alive) return;
        setRows(q.items);
        setCount(q.count);
        if (q.statuses.length) setStatuses(q.statuses);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [status, reloadKey]);

  // §6: the operator must see a new complaint arrive without reloading.
  useEffect(() => subscribeUserEvents((ev) => { if (isQualityComplaintEvent(ev.event)) refresh(); }), [refresh]);

  const openRow = useMemo(() => rows.find((r) => r.id === openId) ?? null, [rows, openId]);
  const label = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : statusLabel(tcm, s));

  return (
    <section className="ppanel">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconAlert /></span>{t("title")}</b>
        <span className="advmuted">{count}</span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>

      <div className="chiprow">
        <button type="button" className={`chip${status === "" ? " on" : ""}`} aria-pressed={status === ""} onClick={() => setStatus("")}>
          {t("all")}
        </button>
        {statuses.map((s) => (
          <button key={s} type="button" className={`chip${status === s ? " on" : ""}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {label(s)}
          </button>
        ))}
      </div>

      {state === "loading" ? (
        <Skeleton rows={3} />
      ) : state === "error" ? (
        <EmptyState icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} />
      ) : !rows.length ? (
        <EmptyState icon={<IconAlert />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist">
          {rows.map((r) => (
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
              <span className="qcrow__badge">{r.statusLabel || label(r.status)}</span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!openRow} onClose={() => setOpenId("")} title={openRow ? openRow.title || t("title") : ""} wide>
        {openRow ? <QcDetail row={openRow} label={label} onDone={() => { setOpenId(""); refresh(); }} /> : null}
      </Modal>
    </section>
  );
}

// One complaint, with everything the MD says the operator has to see before
// ruling: the complaint text, the client, the advocate, the document behind
// it and the rating the client left.
function QcDetail({ row, label, onDone }: { row: QualityComplaintRow; label: (s: string) => string; onDone: () => void }) {
  const t = useTranslations("admin.qualityComplaints");
  const tcm = useTranslations("portal.common");
  const locale = useLocale();
  const [blocks, setBlocks] = useState<Record<string, unknown>>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [action, setAction] = useState<QcAction>("rework_required");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    getQualityComplaint(row.id)
      .then((d) => { if (alive) { setBlocks(d.blocks); setState("ready"); } })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [row.id]);

  const doc = asDict(blocks.document ?? blocks.document_request);
  const lr = asDict(blocks.lawyer_request);
  const review = asDict(blocks.review ?? blocks.rating);
  const fileUrl = asStr(doc.file_url ?? doc.download_url ?? lr.fulfill_file_url ?? lr.source_file_url);
  // A ruling is only final once: the form disappears rather than inviting a
  // second POST the backend would refuse.
  const settled = row.status === "resolved" || row.status === "rejected" || row.status === "rework_required";

  async function submit() {
    if (busy) return;
    if (!note.trim()) { setMsg({ ok: false, text: t("noteRequired") }); return; }
    setBusy(true);
    setMsg(null);
    try {
      await resolveQualityComplaint(row.id, action, note.trim());
      setMsg({ ok: true, text: t("resolved") });
      setTimeout(onDone, 800);
    } catch (e) {
      logApiError("quality complaint resolve", e);
      setMsg({ ok: false, text: errDetail(e) || tcm("loadErrorText") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qcdet">
      <dl className="qcdet__facts">
        {row.workId ? (<><dt>{t("fWorkId")}</dt><dd className="qcdet__wid">{row.workId}</dd></>) : null}
        <dt>{t("fStatus")}</dt><dd>{row.statusLabel || label(row.status)}</dd>
        {row.rating ? (<><dt>{t("fRating")}</dt><dd className="qcdet__rate"><IconStarRate />{row.rating}</dd></>) : null}
        {row.clientName ? (<><dt>{t("fClient")}</dt><dd>{row.clientName}</dd></>) : null}
        {row.lawyerName ? (<><dt>{t("fLawyer")}</dt><dd>{row.lawyerName}</dd></>) : null}
        {row.createdAt ? (<><dt>{t("fCreated")}</dt><dd>{shortDateTime(row.createdAt, locale)}</dd></>) : null}
      </dl>

      {row.complaint ? (
        <section className="qcdet__b qcdet__b--err">
          <b><IconAlert />{t("bComplaint")}</b>
          <p>{row.complaint}</p>
        </section>
      ) : null}

      {state === "loading" ? <Skeleton rows={2} /> : null}

      {state === "ready" && asStr(review.comment ?? review.text) ? (
        <section className="qcdet__b">
          <b><IconStarRate />{t("bReview")}</b>
          <p>{asStr(review.comment ?? review.text)}</p>
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

      {settled ? (
        <Notice ok msg={t("alreadySettled", { action: t.has(`status.${row.status}`) ? t(`status.${row.status}`) : row.status })} />
      ) : (
        <section className="qcdet__resolve">
          <b>{t("resolveTitle")}</b>
          <Select
            value={action}
            onChange={(v) => setAction((QC_ACTIONS as string[]).includes(v) ? (v as QcAction) : "rework_required")}
            options={QC_ACTIONS.map((a) => ({ value: a, label: t(`action.${a}`) }))}
            ariaLabel={t("resolveTitle")}
          />
          {/* Says what the chosen action actually does before it is done —
              rework_required is free work for the advocate, so it must not be
              a blind pick. */}
          <p className="advmuted">{t(`actionHint.${action}`)}</p>
          <textarea
            rows={3}
            className="qcdet__note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePh")}
            aria-label={t("noteLabel")}
            maxLength={2000}
            disabled={busy}
          />
          {msg ? <Notice ok={msg.ok} msg={msg.text} /> : null}
          <button type="button" className="btn btn--pri btn--sm" onClick={() => void submit()} disabled={busy}>
            {busy ? tcm("processingShort") : t("resolveSubmit")}
          </button>
        </section>
      )}
    </div>
  );
}
