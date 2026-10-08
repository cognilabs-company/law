"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError, asStr, type Dict } from "@/lib/http";
import { decideApproval, getMyApprovals, recordName, recordStatus, type InternalPage, type InternalRecord } from "@/lib/services/internalHrm";
import { IconCheck, IconClose, IconRefresh, IconShieldCheck } from "@/components/icons";
import InternalPagination from "@/components/internal/InternalPagination";

function field(row: Dict, ...keys: string[]): string {
  for (const key of keys) {
    const value = asStr(row[key]).trim();
    if (value) return value;
  }
  return "—";
}

export default function InternalApprovalsPage() {
  const t = useTranslations("internal.approvals");
  const [page, setPage] = useState<InternalPage<InternalRecord>>({ items: [], total: 0, offset: 0, limit: 25, hasMore: false });
  const [selected, setSelected] = useState<InternalRecord | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      setPage(await getMyApprovals({ status: "pending", limit: 25, offset }, signal));
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

  async function decide(event: FormEvent<HTMLFormElement> | null, decision: "approved" | "rejected") {
    event?.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError(false);
    try {
      await decideApproval(String(selected.id ?? selected.approval_id), { decision, comment: comment.trim() });
      setSelected(null);
      setComment("");
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return <section className="internal-page">
    <div className="internal-section-head">
      <div><span className="internal-kicker">{t("kicker")}</span><h2>{t("title")}</h2><p>{t("lead")}</p></div>
      <button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button>
      <InternalPagination page={page} onChange={setOffset} />
    </div>
    {error ? <div className="internal-notice internal-notice--error" role="alert">{t("error")}</div> : null}
    <div className="internal-panel">
      {loading ? <div className="internal-loading" aria-busy="true" /> : page.items.length ? (
        <div className="internal-table-wrap"><table className="internal-table"><thead><tr><th>{t("columns.item")}</th><th>{t("columns.requester")}</th><th>{t("columns.status")}</th><th>{t("columns.action")}</th></tr></thead><tbody>
          {page.items.map((row, index) => {
            const id = String(row.id ?? row.approval_id ?? index);
            return <tr key={id}><td><b>{recordName(row)}</b><small>{field(row, "title", "type", "approval_type", "description")}</small></td><td>{field(row, "requester_name", "employee_name", "created_by")}</td><td><span className="pill pill--gray">{recordStatus(row)}</span></td><td><button className="btn btn--line btn--sm" type="button" onClick={() => setSelected(row)}><IconShieldCheck />{t("review")}</button></td></tr>;
          })}
        </tbody></table></div>
      ) : <p className="internal-empty">{t("empty")}</p>}
    </div>
    {selected ? <div className="internal-panel internal-approval-review"><div className="internal-panel__head"><h3>{recordName(selected)}</h3><button className="btn btn--line btn--sm" type="button" onClick={() => setSelected(null)}><IconClose />{t("close")}</button></div><p>{field(selected, "description", "note", "body", "reason")}</p><form className="internal-form" onSubmit={(event) => void decide(event, "approved")}><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("comment")} aria-label={t("comment")} maxLength={2000} rows={3} /><div className="internal-action-row"><button className="btn btn--pri btn--sm" type="submit" disabled={saving}><IconCheck />{t("approve")}</button><button className="btn btn--line btn--sm" type="button" onClick={() => void decide(null, "rejected")} disabled={saving}><IconClose />{t("reject")}</button></div></form></div> : null}
  </section>;
}
