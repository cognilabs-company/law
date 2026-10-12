"use client";

import { useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getLeadTimeline, reengageLead, logCcCall, createTask, type KanbanColumn } from "@/lib/services/backend";
import { isForbiddenErr, leadUserId, type LeadX, type OpsStatus } from "@/lib/services/leads";
import type { AdminUser } from "@/lib/services/users";
import { useResource } from "@/lib/useResource";
import { notify } from "@/lib/toast";
import { useReload } from "@/components/admin/AdminBits";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import { fmtDate, shortDateTime } from "@/lib/date";
import { assigneeLabel, kanbanColumnTitle, leadCategoryLabel, leadRegionLabel, leadScoreLabel, leadUrgencyLabel } from "@/lib/leadLabels";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import { IconClose, IconClock, IconPhone, IconSend } from "@/components/icons";
import CcMeetingButton from "./CcMeetingButton";

// Lead detail drawer for the sales workspace: client info, stage switch,
// operator assignment and a timeline of everything that happened to the lead.
export default function LeadDrawer({
  lead,
  colKey,
  columns,
  busy,
  operators = [],
  opsStatus = "ready",
  meId = "",
  onAssign,
  onMove,
  onDelete,
  onClose,
}: {
  lead: LeadX;
  colKey: string;
  columns: KanbanColumn[];
  busy: boolean;
  // Call-center operators for the "Operator" select; opsStatus "forbidden"
  // (no users.manage) shows the current assignee read-only.
  operators?: AdminUser[];
  opsStatus?: OpsStatus;
  meId?: string;
  // (Re)assign the lead ("" = unassign); rejects with ApiError on failure.
  onAssign?: (userId: string) => Promise<void>;
  onMove: (columnKey: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.pipeline");
  const te = useTranslations("enums");
  // Same translator AdminPipeline's board uses for column titles — a stage
  // still carrying the backend's default English name ("New") gets
  // localized; a stage an admin renamed keeps its custom title either way.
  const tStages = useTranslations("admin.callCenter.queue");
  const tn = useTranslations("common.notify");
  const locale = useLocale();
  const [tlKey, bumpTl] = useReload();
  const tl = useResource(() => getLeadTimeline(lead.id), [lead.id, tlKey]);
  const [note, setNote] = useState("");
  const [remind, setRemind] = useState("");
  const [act, setAct] = useState<string | null>(null);
  const leadName = lead.name || lead.phone;
  const opName = (id: string) => {
    const o = operators.find((x) => x.id === id);
    return o ? o.name || o.phone || o.lexgoId : assigneeLabel(t, operators, id, meId);
  };

  async function addNote(text = note.trim()) {
    if (!text || act) return;
    setAct("note");
    try { await reengageLead(lead.id, text); setNote((cur) => (cur.trim() === text ? "" : cur)); notify.dismiss(`lead-note:${lead.id}`); notify.success(t("notify.noteSaved"), { body: leadName }); bumpTl(); }
    catch (e) { notify.error(t("notify.noteFailed"), { id: `lead-note:${lead.id}`, error: e, action: { label: tn("retry"), onClick: () => void addNote(text) } }); }
    finally { setAct(null); }
  }
  async function logCall() {
    if (act || !lead.phone) return;
    setAct("call");
    try { await logCcCall({ phone: lead.phone, note: `Lead: ${lead.name || lead.phone}` }); notify.dismiss(`lead-call:${lead.id}`); notify.success(t("d.callLogged"), { body: leadName }); bumpTl(); }
    catch (e) { notify.error(t("notify.callFailed"), { id: `lead-call:${lead.id}`, error: e, action: { label: tn("retry"), onClick: () => void logCall() } }); }
    finally { setAct(null); }
  }
  async function setReminder(due = remind) {
    if (!due || act) return;
    setAct("rem");
    try { await createTask({ title: `${t("d.reminderTitle")}: ${lead.name || lead.phone}`, priority: "medium", due_date: due }); setRemind((cur) => (cur === due ? "" : cur)); notify.dismiss(`lead-reminder:${lead.id}`); notify.success(t("d.reminderSet"), { body: [fmtDate(due, locale), leadName].filter(Boolean).join(" · ") }); }
    catch (e) { notify.error(t("notify.reminderFailed"), { id: `lead-reminder:${lead.id}`, error: e, action: { label: tn("retry"), onClick: () => void setReminder(due) } }); }
    finally { setAct(null); }
  }
  // Operators without leads.manage get a 403 from PATCH /admin/leads/{id}.
  async function assign(userId: string) {
    if (!onAssign || act || userId === lead.assignedTo) return;
    const prev = lead.assignedTo;
    setAct("assign");
    try { await onAssign(userId); notify.dismiss(`lead-assign:${lead.id}`); notify.success(userId ? t("notify.assigned") : t("notify.unassigned"), { id: "lead-assign", body: opName(userId || prev) }); }
    catch (e) { notify.error(userId ? t("notify.assignFailed") : t("notify.unassignFailed"), { id: `lead-assign:${lead.id}`, error: e, map: { 403: t("assign.noPermission") }, action: isForbiddenErr(e) ? undefined : { label: tn("retry"), onClick: () => void assign(userId) } }); }
    finally { setAct(null); }
  }

  const info: [string, string][] = [
    // LEXGO_PUBLIC_WORK_IDS_FRONTEND.md: LEAD-DX36K. First, because it is what
    // an operator quotes when the same lead comes up on another channel.
    [t("d.workId"), lead.workId],
    [t("d.phone"), lead.phone],
    // The board card beside this drawer resolves the very same slug through
    // leadCategoryLabel; d.cat.* was never written, so the drawer showed the
    // raw backend value while the card showed the translated one.
    [t("d.category"), leadCategoryLabel(t, lead.category)],
    [t("d.region"), leadRegionLabel(te, lead.region)],
    [t("d.source"), lead.source && (t.has(`source.${lead.source}`) ? t(`source.${lead.source}`) : lead.source)],
    [t("d.urgency"), leadUrgencyLabel(t, lead.urgency)],
    [t("d.score"), lead.scoreKey ? leadScoreLabel(t, lead.scoreKey) : lead.score ? String(lead.score) : ""],
    [t("d.created"), lead.createdAt ? fmtDate(lead.createdAt.slice(0, 10), locale) : ""],
    [t("assign.at"), lead.assignedTo && lead.assignedAt ? shortDateTime(lead.assignedAt, locale) : ""],
  ];
  const canPick = !!onAssign && opsStatus === "ready";
  const assigneeOpts = [
    { value: "", label: t("assign.none") },
    ...operators.map((o) => ({ value: o.id, label: o.id === meId ? `${o.name || o.phone} (${t("assign.me")})` : o.name || o.phone || o.lexgoId })),
  ];
  // An assignee that is no longer in the directory still shows up as chosen.
  if (lead.assignedTo && !operators.some((o) => o.id === lead.assignedTo)) assigneeOpts.push({ value: lead.assignedTo, label: assigneeLabel(t, operators, lead.assignedTo, meId) });

  return (
    <>
      <div className="ldrw__scrim" onClick={onClose} />
      <aside className="ldrw" role="dialog" aria-label={lead.name || lead.phone}>
        <div className="ldrw__head">
          <div>
            <b className="ldrw__name">{lead.name || lead.phone || "—"}</b>
            {lead.phone ? <a className="ldrw__tel" href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}>{lead.phone}</a> : null}
          </div>
          <button className="ldrw__x" type="button" onClick={onClose} aria-label={t("d.close")}><IconClose /></button>
        </div>

        <div className="ldrw__body">
          {/* Stage switcher */}
          <div className="ldrw__sec">
            <span className="ldrw__lbl">{t("d.stage")}</span>
            <div className="ldrw__stages">
              {columns.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`ldrw__stage${c.key === colKey ? " on" : ""}`}
                  style={c.color ? ({ "--c": c.color } as CSSProperties) : undefined}
                  disabled={busy || c.key === colKey}
                  onClick={() => onMove(c.key)}
                >
                  {kanbanColumnTitle(tStages, c)}
                </button>
              ))}
            </div>
          </div>

          {/* Operator assignment (kept in lead.details until the backend has a column) */}
          <div className="ldrw__sec lasgn">
            <span className="ldrw__lbl">{t("assign.title")}</span>
            <div className="lasgn__row">
              <span className={`lasg${!lead.assignedTo ? " lasg--none" : lead.assignedTo === meId ? " lasg--me" : ""}`}>
                <span>{assigneeLabel(t, operators, lead.assignedTo, meId)}</span>
              </span>
              {canPick ? (
                <Select value={lead.assignedTo} onChange={(v) => void assign(v)} options={assigneeOpts} ariaLabel={t("assign.select")} placeholder={act === "assign" ? t("d.saving") : t("assign.select")} />
              ) : null}
            </div>
            {opsStatus === "forbidden" ? <p className="lasgn__hint">{t("assign.opsForbidden")}</p> : null}
            {opsStatus === "ready" && !operators.length ? <p className="lasgn__hint">{t("assign.noOps")}</p> : null}
            <p className="lasgn__hint">{t("assign.localNote")}</p>
          </div>

          {/* Client info */}
          <div className="ldrw__sec">
            <span className="ldrw__lbl">{t("d.info")}</span>
            <div className="ldrw__kv">
              {info.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><span>{k}</span><b>{v}</b></div>
              ))}
            </div>
            {lead.note ? <p className="ldrw__note">{lead.note}</p> : null}
          </div>

          {/* Quick actions */}
          <div className="ldrw__sec">
            <span className="ldrw__lbl">{t("d.actions")}</span>
            <div className="ldrw__acts">
              <a className="btn btn--soft btn--sm" href={`tel:${(lead.phone || "").replace(/[^+\d]/g, "")}`}><IconPhone />{t("d.call")}</a>
              {lead.phone ? <CcMeetingButton clientUserId={leadUserId(lead)} phone={lead.phone} clientName={lead.name} /> : null}
              <button className="btn btn--soft btn--sm" type="button" disabled={act === "call" || !lead.phone} onClick={logCall}>{act === "call" ? t("d.saving") : t("d.logCall")}</button>
            </div>
            <div className="ldrw__noteadd">
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("d.notePh")} />
              <button className="btn btn--pri btn--sm" type="button" disabled={!note.trim() || act === "note"} onClick={() => void addNote()}><IconSend />{act === "note" ? t("d.saving") : t("d.addNote")}</button>
            </div>
            <div className="ldrw__remind">
              <DatePicker value={remind} onChange={setRemind} placeholder={t("d.reminder")} ariaLabel={t("d.reminder")} />
              <button className="btn btn--line btn--sm" type="button" disabled={!remind || act === "rem"} onClick={() => void setReminder()}>{act === "rem" ? t("d.saving") : t("d.setReminder")}</button>
            </div>
          </div>

          {/* Timeline */}
          <div className="ldrw__sec">
            <span className="ldrw__lbl">{t("d.timeline")}</span>
            {tl.status === "loading" ? (
              <Skeleton rows={3} />
            ) : tl.status === "error" ? (
              <ErrorState compact error={tl.error} onRetry={tl.refresh} />
            ) : !tl.data.length ? (
              <p className="ldrw__empty"><IconClock />{t("d.noTimeline")}</p>
            ) : (
              <ol className="ldrw__tl">
                {tl.data.map((a) => (
                  <li key={a.id}>
                    <span className="ldrw__dot" />
                    <div>
                      <b>{a.action || a.detail || "—"}</b>
                      {a.detail && a.action ? <span>{a.detail}</span> : null}
                      <em>{a.createdAt ? fmtDate(a.createdAt.slice(0, 10), locale) : ""}</em>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="ldrw__foot">
          <button className="btn btn--line btn--sm" type="button" disabled={busy} onClick={onDelete}>{t("d.delete")}</button>
        </div>
      </aside>
    </>
  );
}
