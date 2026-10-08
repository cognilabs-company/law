"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError, asDict, asStr, type Dict } from "@/lib/http";
import {
  getMyAttendance,
  getMyKpis,
  getMyMessages,
  getMyProfile,
  getMyTasks,
  sendInternalMessage,
  recordLabel,
  recordName,
  recordStatus,
  type InternalPage,
  type InternalRecord,
} from "@/lib/services/internalHrm";
import { IconCheck, IconRefresh, IconSearch, IconSend, IconUser, IconUsers } from "@/components/icons";
import InternalPagination from "@/components/internal/InternalPagination";

type Mode = "me" | "tasks" | "attendance" | "messages";

function value(row: Dict, ...keys: string[]): string {
  for (const key of keys) {
    const v = asStr(row[key]).trim();
    if (v) return v;
  }
  return "—";
}

function SelfTable({ rows, mode, empty }: { rows: InternalRecord[]; mode: Exclude<Mode, "me">; empty: string }) {
  const t = useTranslations("internal.pages");
  const columns = mode === "tasks"
    ? [t("columns.task"), t("columns.status"), t("columns.due")]
    : mode === "attendance"
      ? [t("columns.date"), t("columns.status"), t("columns.checkIn"), t("columns.checkOut")]
      : [t("columns.subject"), t("columns.date"), t("columns.status")];
  return rows.length ? <div className="internal-table-wrap"><table className="internal-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={asStr(row.id, `${recordLabel(row)}-${index}`)}>
    {mode === "tasks" && <><td><b>{recordName(row)}</b><small>{value(row, "description", "assignee_name")}</small></td><td><span className="pill pill--gray">{recordStatus(row)}</span></td><td>{value(row, "due_at", "due_date")}</td></>}
    {mode === "attendance" && <><td><b>{value(row, "date", "day")}</b></td><td><span className="pill pill--gray">{recordStatus(row)}</span></td><td>{value(row, "check_in", "started_at")}</td><td>{value(row, "check_out", "ended_at")}</td></>}
    {mode === "messages" && <><td><b>{recordName(row)}</b><small>{value(row, "body", "preview")}</small></td><td>{value(row, "created_at", "date")}</td><td><span className="pill pill--gray">{value(row, "status", "unread")}</span></td></>}
  </tr>)}</tbody></table></div> : <p className="internal-empty">{empty}</p>;
}

export default function InternalSelfPages({ mode }: { mode: Mode }) {
  const t = useTranslations("internal.pages");
  const [profile, setProfile] = useState<InternalRecord | null>(null);
  const [page, setPage] = useState<InternalPage<InternalRecord>>({ items: [], total: 0, offset: 0, limit: 25, hasMore: false });
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState({ subject: "", body: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(false);
    try {
      if (mode === "me") {
        const [raw, kpis] = await Promise.all([getMyProfile(signal), getMyKpis({ limit: 6 }, signal)]);
        setProfile({ ...asDict(raw), kpis: kpis.items });
      } else if (mode === "tasks") setPage(await getMyTasks({ q: query, limit: 25, offset }, signal));
      else if (mode === "attendance") setPage(await getMyAttendance({ limit: 25, offset }, signal));
      else setPage(await getMyMessages({ limit: 25, offset }, signal));
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [mode, query, offset]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) void load(); }), [load]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.subject.trim() || !message.body.trim() || saving) return;
    setSaving(true); setError(false);
    try { await sendInternalMessage(message); setMessage({ subject: "", body: "" }); await load(); }
    catch { setError(true); }
    finally { setSaving(false); }
  }

  const title = t(`titles.${mode}`);
  const subtitle = t(`subtitles.${mode}`);
  const rows = useMemo(() => page.items as InternalRecord[], [page.items]);

  return <section className="internal-page">
    <div className="internal-section-head"><div><span className="internal-kicker">{t("kicker")}</span><h2>{title}</h2><p>{subtitle}</p></div><button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button></div>
    {error && <div className="internal-notice internal-notice--error" role="alert">{t("error")}</div>}
    {mode === "me" ? <div className="internal-profile-grid">
      <div className="internal-panel internal-profile-card"><span className="internal-profile-avatar"><IconUser /></span><div><h3>{recordName(profile ?? {})}</h3><p>{value(profile ?? {}, "position_name", "position", "job_title")}</p><small>{value(profile ?? {}, "employee_code", "work_code")}</small></div></div>
      <div className="internal-panel"><div className="internal-panel__head"><h3>{t("today")}</h3><span className="pill pill--ok"><IconCheck />{value(profile ?? {}, "today_status", "attendance_status")}</span></div><div className="internal-kv"><span>{t("department")}</span><b>{value(profile ?? {}, "unit_name", "department")}</b></div><div className="internal-kv"><span>{t("manager")}</span><b>{value(profile ?? {}, "manager_name", "manager")}</b></div></div>
      <div className="internal-panel internal-profile-kpis"><div className="internal-panel__head"><h3>{t("myKpis")}</h3><IconUsers /></div>{Array.isArray(profile?.kpis) && profile.kpis.length ? profile.kpis.map((kpi, index) => <div className="internal-kv" key={asStr(asDict(kpi).id, String(index))}><span>{recordName(asDict(kpi))}</span><b>{value(asDict(kpi), "value", "score", "target")}</b></div>) : <p className="internal-empty">{t("noKpis")}</p>}</div>
    </div> : <>
      {mode === "tasks" && <div className="internal-toolbar"><label className="internal-search"><IconSearch /><input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder={t("searchTasks")} aria-label={t("searchTasks")} maxLength={120} /></label><span className="pill pill--gray">{page.total} {t("total")}</span></div>}
      <div className="internal-panel">{loading ? <div className="internal-loading" aria-busy="true" /> : <SelfTable rows={rows} mode={mode} empty={t(`empty.${mode}`)} />}<InternalPagination page={page} onChange={setOffset} /></div>
      {mode === "messages" && <form className="internal-panel internal-message-form" onSubmit={submitMessage}><div className="internal-panel__head"><h3>{t("newMessage")}</h3><IconSend /></div><input value={message.subject} onChange={(event) => setMessage((current) => ({ ...current, subject: event.target.value }))} placeholder={t("subject")} aria-label={t("subject")} maxLength={160} required /><textarea value={message.body} onChange={(event) => setMessage((current) => ({ ...current, body: event.target.value }))} placeholder={t("messageBody")} aria-label={t("messageBody")} maxLength={4000} rows={4} required /><button className="btn btn--pri btn--sm" type="submit" disabled={saving}><IconSend />{saving ? t("sending") : t("send")}</button></form>}
    </>}
  </section>;
}
