"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { asDict, asNum, asStr, errDetail, isForbidden, logApiError, type Dict } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { labelOf, statusLabel } from "@/lib/labels";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import { QC_ACTIONS, getQualityComplaint, resolveQualityComplaint, type QcAction, type QualityComplaintRow } from "@/lib/services/backend";
import { getAdminMarketplaceOrder, type MkmOrder } from "@/lib/services/adminMarketplace";
import { getOrderFinancials } from "@/lib/services/marketplace";
import { CaseBox, Choice, FactStrip, Field, Loading, Note, PanelFoot, PartyCard, Section, type Fact } from "../../panel/bits";
import { IcArrowRight, IcAward, IcBolt, IcClock, IcDoc, IcFlag, IcRefresh, IcScale, IcShield, IcStore } from "../../icons";
import { focusFirstError } from "./focus";
import type { DecideProps } from "./types";

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTLED = new Set(["resolved", "rejected", "rework_required", "refund_required"]);
const NO_BLOCKS: Dict = {};
const NOTE_MAX = 2000;
const STACK: CSSProperties = { display: "grid", gap: 12, alignContent: "start", minWidth: 0 };
const ROW: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 };
const START: CSSProperties = { justifySelf: "start" };
const STATUS_TONE: Record<string, string> = { new: "hot", under_review: "warn", rework_required: "info", refund_required: "warn", rejected: "mute", resolved: "ok" };

function Stars({ value }: { value: number }) {
  const n = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="opx-stars" role="img" aria-label={`${n}/5`}>
      {"★".repeat(n)}
      <i>{"★".repeat(5 - n)}</i>
    </span>
  );
}

export default function QualityDecide({ job, item, onDone, onClose, onDirty }: DecideProps<QualityComplaintRow>) {
  const t = useTranslations("admin.qualityComplaints");
  const tp = useTranslations("marketplace.orderDetail.pricing");
  const tcm = useTranslations("portal.common");
  const tu = useTranslations("admin.urgent");
  const tk = useTranslations("portal.client.urgent");
  const tx = useTranslations("admin.ccx.panel");
  const tc = useTranslations("admin.ccx.cases");
  const tn = useTranslations("common.notify");
  const tcom = useTranslations("common");
  const none = tcom("none");
  const locale = useLocale();
  const once = useSameTickGuard();
  const box = useRef<HTMLDivElement>(null);
  // A 403 on the ruling: this account may not rule here — the form leaves.
  const [denied, setDenied] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [got, setGot] = useState<{ key: string; blocks: Dict | null } | null>(null);
  const [mpOrder, setMpOrder] = useState<{ id: string; order: MkmOrder } | null>(null);
  const [mpSettle, setMpSettle] = useState<{ id: string; status: string } | null>(null);
  const [action, setAction] = useState<QcAction | "">("");
  const [actionErr, setActionErr] = useState("");
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const key = `${item.id}:${attempt}`;
  useEffect(() => {
    const ctl = new AbortController();
    const k = `${item.id}:${attempt}`;
    getQualityComplaint(item.id).then(
      (d) => {
        if (!ctl.signal.aborted) setGot({ key: k, blocks: d.blocks });
      },
      (e: unknown) => {
        if (ctl.signal.aborted) return;
        logApiError("quality complaint detail", e);
        setGot({ key: k, blocks: null });
      },
    );
    return () => ctl.abort();
  }, [item.id, attempt]);

  const cur = got && got.key === key ? got : null;
  const state: "loading" | "ready" | "error" = !cur ? "loading" : cur.blocks ? "ready" : "error";
  const blocks = cur?.blocks ?? NO_BLOCKS;
  const doc = asDict(blocks.document ?? blocks.document_request);
  const lr = asDict(blocks.lawyer_request);
  const review = asDict(blocks.review ?? blocks.rating);
  const cmp = asDict(asDict(blocks.complaint).payload);
  const mpOrderId = asStr(asDict(blocks.complaint).record_type) === "marketplace_order" ? asStr(cmp.order_id) : "";

  useEffect(() => {
    if (!mpOrderId) return;
    const ctl = new AbortController();
    getAdminMarketplaceOrder(mpOrderId).then(
      (d) => {
        if (!ctl.signal.aborted) setMpOrder({ id: mpOrderId, order: d.order });
      },
      () => undefined,
    );
    getOrderFinancials(mpOrderId, ctl.signal).then(
      (f) => {
        if (!ctl.signal.aborted) setMpSettle({ id: mpOrderId, status: f.settlement });
      },
      () => undefined,
    );
    return () => ctl.abort();
  }, [mpOrderId]);

  const order = mpOrder && mpOrder.id === mpOrderId ? mpOrder.order : null;
  const settlement = mpSettle && mpSettle.id === mpOrderId ? mpSettle.status : "";
  const label = (s: string, fallback?: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : statusLabel(tcm, s, undefined, fallback || tc("other")));
  const clientName = item.clientName || asStr(cmp.client_name).trim();
  const clientPhone = asStr(cmp.client_phone).trim();
  const rating = item.rating || asNum(cmp.rating) || asNum(review.rating);
  const priority = asStr(cmp.priority).trim();
  const reason = asStr(cmp.reason).trim();
  const comment = item.complaint || asStr(cmp.comment).trim();
  const reviewText = asStr(review.comment ?? review.text).trim();
  const docTitle = asStr(doc.title);
  const fileUrl = asStr(doc.file_url ?? doc.download_url ?? lr.fulfill_file_url ?? lr.source_file_url);
  const urg = asDict(blocks.urgent_request ?? blocks.urgent_advokat_request);
  const urgPayload = asDict(urg.payload);
  const urgPick = (k: string) => asStr(urg[k] === undefined || urg[k] === null ? urgPayload[k] : urg[k]);
  const urgKind = urgPick("service_kind");
  const urgTitle = (urgKind && tk.has(`kinds.${urgKind}`) ? tk(`kinds.${urgKind}`) : "") || urgPick("title") || urgPick("service_title");
  const urgNeed = urgPick("need") || urgPick("description");
  const urgRaw = urgPick("status");
  const urgStatus = urgRaw ? labelOf(tu, "st", urgRaw, urgPick("status_label")) : urgPick("status_label");
  const urgWorkRaw = urgPick("work_id") || (UUID_LIKE.test(item.urgentRequestId) ? "" : item.urgentRequestId);
  const urgWorkId = urgWorkRaw === job.code ? "" : urgWorkRaw;
  const settled = SETTLED.has(item.status);
  const formOpen = state === "ready" && !mpOrderId && !settled && !denied;
  const showReview = state === "ready" && Boolean(reviewText) && reviewText !== comment;
  const showDoc = state === "ready" && Boolean(docTitle || fileUrl);
  const showUrgent = state === "ready" && Boolean(urgTitle || urgNeed);
  const hasMaterial = showReview || showDoc || showUrgent || Boolean(mpOrderId);
  const payLabel = order?.paymentStatus ? (t.has(`payment.${order.paymentStatus}`) ? t(`payment.${order.paymentStatus}`) : statusLabel(tcm, order.paymentStatus, "paymentStatus", tc("other"))) : "";

  const pick = (v: string) => {
    if (busy) return;
    const next = QC_ACTIONS.find((a) => a === v);
    if (!next) return;
    setAction(next);
    setActionErr("");
    onDirty(true);
  };

  const editNote = (v: string) => {
    setNote(v);
    setNoteErr("");
    onDirty(true);
  };

  const submit = async () => {
    if (busy || !formOpen || !once()) return;
    const noNote = !note.trim();
    setActionErr(action ? "" : t("actionRequired"));
    setNoteErr(noNote ? t("noteRequired") : "");
    if (!action || noNote) {
      focusFirstError(box.current);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await resolveQualityComplaint(item.id, action, note.trim());
      onDone(t("resolved"));
    } catch (e) {
      logApiError("quality complaint resolve", e);
      if (isForbidden(e)) {
        setDenied(errDetail(e) || tcom("forbidden"));
        onDirty(false);
        return;
      }
      setErr(errDetail(e));
    } finally {
      setBusy(false);
    }
  };

  const facts: Fact[] = [
    ...(item.workId && item.workId !== job.code ? [{ icon: <IcDoc size={17} />, label: t("fWorkId"), value: item.workId }] : []),
    {
      icon: <IcShield size={17} />,
      label: t("fStatus"),
      value: (
        <i className="opx-pill opx-fpill" data-tone={STATUS_TONE[item.status] ?? "mute"}>
          {label(item.status, item.statusLabel)}
        </i>
      ),
    },
    ...(priority && t.has(`priority.${priority}`)
      ? [
          {
            icon: <IcBolt size={17} />,
            label: t("fPriority"),
            value: (
              <i className="opx-pill opx-fpill" data-tone={priority === "high" || priority === "urgent" ? "hot" : "mute"}>
                {t(`priority.${priority}`)}
              </i>
            ),
          },
        ]
      : []),
    ...(reason ? [{ icon: <IcFlag size={17} />, label: t("fReason"), value: t.has(`reason.${reason}`) ? t(`reason.${reason}`) : tc("other") }] : []),
    ...(item.createdAt ? [{ icon: <IcClock size={17} />, label: t("fCreated"), value: shortDateTime(item.createdAt, locale) }] : []),
  ];

  const decision = mpOrderId ? (
    <Section icon={<IcScale size={17} />} title={t("resolveTitle")}>
      <Note tone="info">{t("mpElsewhere")}</Note>
      <Link className="opx-pbtn opx-pbtn--blue" style={START} href="/admin/call-center?view=queues" onClick={onClose}>
        {t("mpOpen")}
        <IcArrowRight size={16} />
      </Link>
    </Section>
  ) : denied ? (
    <Note tone="bad">{denied}</Note>
  ) : settled ? (
    <Note tone="ok">{t("alreadySettled", { action: label(item.status, item.statusLabel) })}</Note>
  ) : (
    <Section icon={<IcScale size={17} />} title={t("resolveTitle")}>
      <Choice label={tc("pick")} options={QC_ACTIONS.map((a) => ({ value: a, label: t(`action.${a}`), hint: t(`actionHint.${a}`), disabled: busy && a !== action }))} value={action} onChange={pick} error={actionErr} />
      <Field label={t("noteLabel")} value={note} onChange={editNote} max={NOTE_MAX} required multiline rows={4} placeholder={t("notePh")} error={noteErr} readOnly={busy} />
      {err !== null ? (
        <Note tone="bad">
          <b>{t("resolveFailed")}</b>
          {err ? (
            <>
              <br />
              {err}
            </>
          ) : null}
        </Note>
      ) : null}
    </Section>
  );

  return (
    <>
      <div className="opx-pscroll" ref={box}>
        <div className="opx-pgrid2">
          <PartyCard role={t("fClient")} name={clientName || none} phone={clientPhone || undefined} />
          <PartyCard role={t("fLawyer")} name={item.lawyerName || none} />
        </div>
        <FactStrip facts={facts} />
        {comment || item.title || rating ? (
          <CaseBox
            icon={<IcFlag size={18} />}
            label={t("bComplaint")}
            title={item.title || undefined}
            aside={
              rating ? (
                <>
                  <small>{t("fRating")}</small>
                  <Stars value={rating} />
                  <b className="opx-num">{`${rating}/5`}</b>
                </>
              ) : undefined
            }
          >
            {comment ? <p>{comment}</p> : null}
          </CaseBox>
        ) : null}
        {state === "loading" ? <Loading label={t("title")} /> : null}
        {state === "error" ? (
          <>
            <Note tone="bad">{t("detailLoadError")}</Note>
            <button type="button" className="opx-pbtn" style={START} onClick={() => setAttempt((n) => n + 1)}>
              <IcRefresh size={16} />
              {tn("retry")}
            </button>
          </>
        ) : null}
        {state === "ready" ? (
          hasMaterial ? (
            <div className="opx-pcols">
              <div style={STACK}>
                {showReview ? (
                  <CaseBox icon={<IcAward size={18} />} label={t("bReview")}>
                    <p>{reviewText}</p>
                  </CaseBox>
                ) : null}
                {showDoc ? (
                  <CaseBox icon={<IcDoc size={18} />} label={t("bDocument")} title={docTitle || undefined}>
                    {fileUrl ? (
                      <div className="opx-files">
                        <a className="opx-file" href={fileUrl} target="_blank" rel="noopener noreferrer">
                          <IcDoc size={16} />
                          <span>{t("openFile")}</span>
                          <IcArrowRight size={14} />
                        </a>
                      </div>
                    ) : null}
                  </CaseBox>
                ) : null}
                {showUrgent ? (
                  <CaseBox icon={<IcBolt size={18} />} label={t("bUrgent")} title={urgTitle || undefined}>
                    {urgNeed ? <p>{urgNeed}</p> : null}
                    {urgWorkId || urgStatus ? (
                      <span style={ROW}>
                        {urgWorkId ? <b className="opx-num">{urgWorkId}</b> : null}
                        {urgStatus ? (
                          <i className="opx-pill" data-tone="info">
                            {urgStatus}
                          </i>
                        ) : null}
                      </span>
                    ) : null}
                  </CaseBox>
                ) : null}
                {mpOrderId ? (
                  <>
                    <CaseBox icon={<IcStore size={18} />} label={t("bMarketplace")} title={order ? [order.workId, order.serviceTitle].filter(Boolean).join(" · ") || undefined : asStr(cmp.work_id) || undefined}>
                      {order && (order.price || payLabel) ? <p>{[order.price ? `${fmtUzs(order.price)} ${t("som")}` : "", payLabel].filter(Boolean).join(" · ")}</p> : null}
                      {settlement ? (
                        <p>
                          {t("settlement")}: <b>{tp.has(`settle.${settlement}`) ? tp(`settle.${settlement}`) : tc("other")}</b>
                        </p>
                      ) : null}
                    </CaseBox>
                    <Note tone={settled ? "info" : "warn"}>{settled ? t("holdDecided") : t("holdOpen")}</Note>
                  </>
                ) : null}
              </div>
              {decision}
            </div>
          ) : (
            decision
          )
        ) : null}
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={formOpen ? undefined : tx("close")} primary={formOpen ? () => void submit() : undefined} primaryLabel={t("resolveSubmit")} busy={busy} />
    </>
  );
}
