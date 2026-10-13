"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError } from "@/lib/http";
import { humanize } from "@/lib/labels";
import { decideApproval, getMyApprovals, normApproval, type HrmApproval, type InternalPage } from "@/lib/services/internalHrm";
import { IconCheck, IconClose, IconRefresh, IconShieldCheck } from "@/components/icons";
import InternalPagination from "@/components/internal/InternalPagination";
import InternalField from "@/components/internal/InternalField";
import { HrmDrawer, HrmEmpty, HrmError, HrmHead, HrmKv, HrmLoading, HrmPanel, HrmPerson, HrmSection, HrmStatus, useHrmFormat } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";

// payload keys that are bookkeeping, not something to decide on.
const HIDDEN_PAYLOAD = new Set(["marker", "id"]);

const EMPTY_PAGE = { items: [], total: 0, offset: 0, limit: 25, hasMore: false };

export default function InternalApprovalsPage() {
  const t = useTranslations("internal.approvals");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const who = (a: HrmApproval) => a.requesterName || dir.userName(a.requesterUserId);
  const [page, setPage] = useState<InternalPage<HrmApproval>>(EMPTY_PAGE);
  const [openId, setOpenId] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState<"" | "approved" | "rejected">("");
  const [offset, setOffset] = useState(0);
  const [proc, setProc] = useState("");
  const [needComment, setNeedComment] = useState(false);
  const [quick, setQuick] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const res = await getMyApprovals({ status: "pending", limit: 25, offset }, signal);
      setPage({ ...res, items: res.items.map(normApproval) });
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) void load(); }), [load]);

  const open = page.items.find((a) => a.id === openId) ?? null;

  async function decide(decision: "approved" | "rejected") {
    if (!open || saving) return;
    // Turning a request down says why (MedControl's inbox): the requester
    // reads it.
    if (decision === "rejected" && !comment.trim()) {
      setNeedComment(true);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      await decideApproval(open.id, { decision, comment: comment.trim() });
      setOpenId("");
      setComment("");
      setDone(decision);
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  // Approve straight from the card; anything else opens it.
  async function approveQuick(a: HrmApproval) {
    if (quick) return;
    setQuick(a.id);
    setError(false);
    try {
      await decideApproval(a.id, { decision: "approved", comment: "" });
      setDone("approved");
      await load();
    } catch {
      setError(true);
    } finally {
      setQuick("");
    }
  }
  const procs = [...new Set(page.items.map((a) => a.type).filter(Boolean))];
  const shown = proc ? page.items.filter((a) => a.type === proc) : page.items;
  const facts = (a: HrmApproval) =>
    Object.entries(a.payload)
      .filter(([k, v]) => !HIDDEN_PAYLOAD.has(k) && (typeof v === "string" || typeof v === "number") && String(v).length < 40)
      .slice(0, 3);

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("title")} lead={t("lead")} actions={<button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button>} />
      {error && !open ? <HrmError text={t("error")} onRetry={() => void load()} retryLabel={t("refresh")} /> : null}
      {done ? <div className="hrm-ok"><IconCheck />{done === "approved" ? t("approvedNote") : t("rejectedNote")}</div> : null}
      {procs.length > 1 ? (
        <div className="hrm-chips" role="tablist" aria-label={t("process")}>
          <button type="button" role="tab" aria-selected={!proc} className={!proc ? "on" : ""} onClick={() => setProc("")}>{t("allProcesses")}<span>{page.items.length}</span></button>
          {procs.map((p) => (
            <button key={p} type="button" role="tab" aria-selected={proc === p} className={proc === p ? "on" : ""} onClick={() => setProc(p)}>{humanize(p)}<span>{page.items.filter((a) => a.type === p).length}</span></button>
          ))}
        </div>
      ) : null}
      {loading ? <HrmPanel><HrmLoading /></HrmPanel> : shown.length ? (
        <ul className="hrm-inbox" aria-label={t("pending")}>
          {shown.map((a) => (
            <li key={a.id} className="hrm-inbox__card">
              <button type="button" className="hrm-inbox__main" onClick={() => { setOpenId(a.id); setDone(""); setNeedComment(false); }}>
                <span className="hrm-inbox__top">
                  <span className="hrm-inbox__proc">{humanize(a.type) || t("title")}</span>
                  <small>{f.dateTime(a.createdAt)}</small>
                </span>
                <b>{a.title || humanize(a.type) || "—"}</b>
                {a.description ? <p>{a.description}</p> : null}
                <span className="hrm-inbox__facts">
                  {who(a) ? <HrmPerson name={who(a)} size="sm" /> : null}
                  {a.amount !== null ? <span className="hrm-inbox__amt">{f.money(a.amount)}</span> : null}
                  {facts(a).map(([k, v]) => <span key={k} className="hrm-inbox__fact">{humanize(k)}: {typeof v === "string" ? humanize(v) : String(v)}</span>)}
                </span>
              </button>
              <span className="hrm-inbox__acts">
                <button type="button" className="btn btn--pri btn--sm" onClick={() => void approveQuick(a)} disabled={!!quick}>{quick === a.id ? <span className="stu-spin" aria-hidden /> : <IconCheck />}{t("approve")}</button>
                <button type="button" className="btn btn--line btn--sm" onClick={() => { setOpenId(a.id); setDone(""); setNeedComment(false); }}>{t("openDecide")}</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <HrmPanel><HrmEmpty icon={IconShieldCheck} title={t("empty")} text={t("emptyLead")} /></HrmPanel>}
      <InternalPagination page={page} onChange={setOffset} />

      <HrmDrawer
        open={!!open}
        onClose={() => { setOpenId(""); setComment(""); setError(false); setNeedComment(false); }}
        title={open?.title || humanize(open?.type ?? "") || t("title")}
        sub={open ? humanize(open.type) : undefined}
        footer={
          <>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => void decide("approved")} disabled={saving}><IconCheck />{t("approve")}</button>
            <button className="btn btn--line btn--sm" type="button" onClick={() => void decide("rejected")} disabled={saving}><IconClose />{t("reject")}</button>
          </>
        }
      >
        {open ? (
          <>
            {error ? <HrmError text={t("error")} /> : null}
            <HrmSection label={t("details")}>
              <HrmKv
                rows={[
                  { label: t("columns.requester"), value: who(open) || "—" },
                  { label: t("columns.date"), value: f.dateTime(open.createdAt) },
                  ...(open.amount !== null ? [{ label: t("columns.amount"), value: f.money(open.amount) }] : []),
                  { label: t("columns.status"), value: <HrmStatus value={open.status} /> },
                ]}
              />
            </HrmSection>
            {open.description ? <HrmSection label={t("reason")}><p className="hrm-text">{open.description}</p></HrmSection> : null}
            {Object.keys(open.payload).some((k) => !HIDDEN_PAYLOAD.has(k)) ? (
              <HrmSection label={t("payload")}>
                <HrmKv
                  rows={Object.entries(open.payload)
                    .filter(([k, v]) => !HIDDEN_PAYLOAD.has(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
                    .map(([k, v]) => ({ label: humanize(k), value: typeof v === "string" ? humanize(v) : String(v) }))}
                />
              </HrmSection>
            ) : null}
            <InternalField label={t("comment")}>
              <textarea value={comment} onChange={(e) => { setComment(e.target.value); if (e.target.value.trim()) setNeedComment(false); }} placeholder={t("commentPlaceholder")} maxLength={2000} rows={3} aria-invalid={needComment || undefined} />
            </InternalField>
            {needComment ? <p className="hrm-ferr" role="alert">{t("commentRequired")}</p> : null}
          </>
        ) : null}
      </HrmDrawer>
    </section>
  );
}
