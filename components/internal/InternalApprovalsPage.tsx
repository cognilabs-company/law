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

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("title")} lead={t("lead")} actions={<button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button>} />
      {error && !open ? <HrmError text={t("error")} onRetry={() => void load()} retryLabel={t("refresh")} /> : null}
      {done ? <div className="hrm-ok"><IconCheck />{done === "approved" ? t("approvedNote") : t("rejectedNote")}</div> : null}
      <HrmPanel flush title={t("pending")} icon={IconShieldCheck} count={page.total}>
        {loading ? <div style={{ padding: 16 }}><HrmLoading /></div> : page.items.length ? (
          <div className="hrm-table-wrap">
            <table className="hrm-table">
              <thead><tr><th>{t("columns.item")}</th><th>{t("columns.requester")}</th><th>{t("columns.date")}</th><th className="hrm-num">{t("columns.amount")}</th><th>{t("columns.status")}</th></tr></thead>
              <tbody>
                {page.items.map((a) => (
                  <tr key={a.id} className="is-click" tabIndex={0} onClick={() => { setOpenId(a.id); setDone(""); }} onKeyDown={(e) => { if (e.key === "Enter") { setOpenId(a.id); setDone(""); } }}>
                    <td><b>{a.title || humanize(a.type) || "—"}</b>{a.type ? <small>{humanize(a.type)}</small> : null}</td>
                    <td>{who(a) ? <HrmPerson name={who(a)} size="sm" /> : "—"}</td>
                    <td className="hrm-muted">{f.dateTime(a.createdAt)}</td>
                    <td className="hrm-num">{a.amount !== null ? f.money(a.amount) : "—"}</td>
                    <td><HrmStatus value={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <HrmEmpty icon={IconShieldCheck} title={t("empty")} text={t("emptyLead")} />}
        <InternalPagination page={page} onChange={setOffset} />
      </HrmPanel>

      <HrmDrawer
        open={!!open}
        onClose={() => { setOpenId(""); setComment(""); setError(false); }}
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
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("commentPlaceholder")} maxLength={2000} rows={3} />
            </InternalField>
          </>
        ) : null}
      </HrmDrawer>
    </section>
  );
}
