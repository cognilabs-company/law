"use client";

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { reengageLead, logCcCall, createTask, type KanbanColumn } from "@/lib/services/backend";
import { isForbiddenErr, leadUserId, type LeadX, type OperatorsState } from "@/lib/services/leads";
import { dayKeyOf, getLeadHistory, groupLeadEvents, prevDayKey, type LeadEvent, type LeadEventRun } from "@/lib/services/leadTimeline";
import { operatorName, type AdminUser } from "@/lib/services/users";
import { useResource } from "@/lib/useResource";
import { notify } from "@/lib/toast";
import { useReload } from "@/components/admin/AdminBits";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import { dateOnly, fmtDate, shortDateTime, timeOnly } from "@/lib/date";
import { humanizeSlug } from "@/lib/lawyers";
import { assigneeLabel, kanbanColumnTitle, leadCategoryLabel, leadRegionLabel, leadScoreLabel, leadUrgencyLabel, personLabel } from "@/lib/leadLabels";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import { IconClose, IconClock, IconPhone, IconSend } from "@/components/icons";
import CcMeetingButton from "./CcMeetingButton";

const NO_OPS: OperatorsState = { ops: [], people: new Map<string, AdminUser>(), status: "ready", retry: () => Promise.resolve() };

function subscribeMinute(cb: () => void) {
  const id = window.setInterval(cb, 60000);
  return () => window.clearInterval(id);
}
const readToday = () => dayKeyOf(Date.now());
const GENERATED_STAGE = /^col_[a-z0-9]+(?:_\d+)?$/;

// Lead detail drawer for the sales workspace: client info, stage switch,
// operator assignment and a timeline of everything that happened to the lead.
export default function LeadDrawer({
  lead,
  colKey,
  columns,
  busy,
  ops = NO_OPS,
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
  ops?: OperatorsState;
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
  const tl = useResource(() => getLeadHistory(lead.id), [lead.id, tlKey]);
  const history = useMemo(() => groupLeadEvents(tl.data), [tl.data]);
  const today = useSyncExternalStore(subscribeMinute, readToday, () => "");
  const [note, setNote] = useState("");
  const [remind, setRemind] = useState("");
  const [act, setAct] = useState<string | null>(null);
  const leadName = lead.name || lead.phone;
  const opName = (id: string) => personLabel(ops.people.get(id)) || assigneeLabel(t, ops.people, id, meId, ops.status === "ready");

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
  const canPick = !!onAssign && ops.status === "ready";
  const opLabel = (o: AdminUser) => operatorName(o) || t("assign.unknown");
  const assigneeOpts = [
    { value: "", label: t("assign.none") },
    ...ops.ops.map((o) => ({ value: o.id, label: o.id === meId ? `${opLabel(o)} (${t("assign.me")})` : opLabel(o) })),
  ];
  // An assignee that is no longer in the directory still shows up as chosen.
  if (lead.assignedTo && !ops.ops.some((o) => o.id === lead.assignedTo)) assigneeOpts.push({ value: lead.assignedTo, label: assigneeLabel(t, ops.people, lead.assignedTo, meId, ops.status === "ready") });

  const stageName = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (col) return kanbanColumnTitle(tStages, col);
    if (tStages.has(`stages.${key}`)) return tStages(`stages.${key}`);
    return GENERATED_STAGE.test(key) ? t("history.stageRemoved") : humanizeSlug(key);
  };
  const eventTitle = (e: LeadEvent) => {
    if (e.kind === "created") return e.duplicate ? t("history.createdDuplicate") : t("history.created");
    if (e.kind === "stage") return e.from ? t("history.stage", { from: stageName(e.from), to: stageName(e.to) }) : t("history.stageTo", { to: stageName(e.to) });
    if (e.kind === "reorder") return t("history.reorder", { stage: stageName(e.to) });
    if (e.kind === "updated") return t("history.updated");
    if (e.kind === "reengage") return t("history.reengage");
    if (e.kind === "cleanup") return t("history.cleanup");
    return t("history.other");
  };
  const personOf = (id: string) => (!id ? "" : id === meId ? t("history.you") : personLabel(ops.people.get(id)));
  const eventDetail = (e: LeadEvent) => {
    if (e.kind === "reengage") return e.reason;
    const who = e.kind === "created" ? personOf(e.operatorId) : "";
    return who ? `${t("assign.title")}: ${who}` : "";
  };
  const runTime = (r: LeadEventRun) => {
    const last = timeOnly(r.newest.at, locale);
    const first = r.count > 1 ? timeOnly(r.oldest.at, locale) : last;
    return first && first !== last ? `${first}–${last}` : last;
  };
  const dayLabel = (day: string, at: string) => {
    if (today && day === today) return t("history.today");
    if (today && day === prevDayKey(today)) return t("history.yesterday");
    return dateOnly(at, locale);
  };

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
                <span>{assigneeLabel(t, ops.people, lead.assignedTo, meId, ops.status === "ready")}</span>
              </span>
              {canPick ? (
                <Select value={lead.assignedTo} onChange={(v) => void assign(v)} options={assigneeOpts} ariaLabel={t("assign.select")} placeholder={act === "assign" ? t("d.saving") : t("assign.select")} />
              ) : null}
            </div>
            {ops.status === "error" ? <ErrorState compact error={ops.error} onRetry={ops.retry} title={t("assign.opsError")} /> : null}
            {ops.status === "forbidden" ? <p className="lasgn__hint">{t("assign.opsForbidden")}</p> : null}
            {ops.status === "ready" && !ops.ops.length ? <p className="lasgn__hint">{t("assign.noOps")}</p> : null}
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
              <ErrorState compact error={tl.error} onRetry={tl.refresh} title={t("history.loadError")} />
            ) : !history.length ? (
              <p className="ldrw__empty"><IconClock />{t("d.noTimeline")}</p>
            ) : (
              <div className="lhist">
                {history.map((g) => (
                  <div className="lhist__day" key={g.day || "undated"}>
                    {g.day ? <p className="lhist__date">{dayLabel(g.day, g.at)}</p> : null}
                    <ol className="ldrw__tl">
                      {g.runs.map((r) => {
                        const detail = eventDetail(r.newest);
                        const meta = [runTime(r), personOf(r.newest.by)].filter(Boolean).join(" · ");
                        return (
                          <li key={r.key}>
                            <span className="ldrw__dot" />
                            <div>
                              <b>
                                {eventTitle(r.newest)}
                                {r.count > 1 ? <small className="lhist__x">×{r.count}</small> : null}
                              </b>
                              {detail ? <span>{detail}</span> : null}
                              {meta ? <em>{meta}</em> : null}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
              </div>
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
