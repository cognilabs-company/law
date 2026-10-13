"use client";

import { useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { reengageLead, logCcCall, createTask, type KanbanColumn } from "@/lib/services/backend";
import { isForbiddenErr, type LeadX, type OperatorsState } from "@/lib/services/leads";
import { dayKeyOf, getLeadHistory, groupLeadEvents, prevDayKey, type LeadEvent, type LeadEventRun } from "@/lib/services/leadTimeline";
import type { AdminUser } from "@/lib/services/users";
import { useResource } from "@/lib/useResource";
import { notify } from "@/lib/toast";
import { useReload } from "@/components/admin/AdminBits";
import DatePicker from "@/components/DatePicker";
import { fmtDate, fmtDateTime, timeOnly } from "@/lib/date";
import { parseServerTime } from "@/lib/http";
import { humanizeSlug } from "@/lib/lawyers";
import { assigneeLabel, isLostStage, kanbanColumnTitle, leadCategoryLabel, leadRegionLabel, leadSourceInfo, leadUrgencyLabel, personLabel } from "@/lib/leadLabels";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import { ScoreChip, WorkId } from "@/components/ui/Badge";
import InlineAlert from "@/components/ui/InlineAlert";
import { IconClock, IconPhone, IconSend, IconTrash, IconVideo } from "@/components/icons";
import { LeadOperatorMenu, LeadStageMenu, leadPhoneText, type LeadStage } from "./leads/LeadMenu";
import Modal from "./Modal";

const NO_OPS: OperatorsState = { ops: [], people: new Map<string, AdminUser>(), status: "ready", retry: () => Promise.resolve() };
const NO_LOAD: ReadonlyMap<string, number> = new Map();

function subscribeMinute(cb: () => void) {
  const id = window.setInterval(cb, 60000);
  return () => window.clearInterval(id);
}
const readToday = () => dayKeyOf(Date.now());
const GENERATED_STAGE = /^col_[a-z0-9]+(?:_\d+)?$/;
const QUICK_DAYS = [
  { days: 1, key: "d.remTomorrow" },
  { days: 3, key: "d.remIn3" },
] as const;

function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return "";
  return dayKeyOf(new Date(y, m - 1, d + days).getTime());
}

// Lead detail drawer for the sales workspace: client info, stage switch,
// operator assignment and a timeline of everything that happened to the lead.
export default function LeadDrawer({
  lead,
  colKey,
  columns,
  busy,
  ops = NO_OPS,
  load = NO_LOAD,
  meId = "",
  onAssign,
  onMove,
  onDelete,
  onVideo,
  canVideo = false,
  videoBusy = false,
  onClose,
}: {
  lead: LeadX;
  colKey: string;
  columns: KanbanColumn[];
  busy: boolean;
  // Call-center operators for the "Operator" select; opsStatus "forbidden"
  // (no users.manage) shows the current assignee read-only.
  ops?: OperatorsState;
  load?: ReadonlyMap<string, number>;
  meId?: string;
  // (Re)assign the lead ("" = unassign); rejects with ApiError on failure.
  onAssign?: (userId: string) => Promise<void>;
  onMove: (columnKey: string) => void;
  onDelete: () => void;
  onVideo?: () => void;
  canVideo?: boolean;
  videoBusy?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("admin.pipeline");
  const tc = useTranslations("admin.leadCard");
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
  const noPhoneId = useId();
  const leadName = lead.name || lead.phone;
  const scoreKey = lead.scoreKey;
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
    try { await logCcCall({ phone: lead.phone, note: t("d.callLogNote", { name: lead.name || lead.phone }) }); notify.dismiss(`lead-call:${lead.id}`); notify.success(t("d.callLogged"), { body: leadName }); bumpTl(); }
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

  const when = (value: string) => {
    const at = parseServerTime(value);
    return Number.isFinite(at) ? fmtDateTime(at, locale) : "";
  };
  const source = leadSourceInfo(te, lead.source);
  const info: [string, ReactNode, string?][] = [
    // LEXGO_PUBLIC_WORK_IDS_FRONTEND.md: LEAD-DX36K. First, because it is what
    // an operator quotes when the same lead comes up on another channel.
    [t("d.workId"), lead.workId ? <WorkId id={lead.workId} copy /> : ""],
    // The board card beside this drawer resolves the very same slug through
    // leadCategoryLabel; d.cat.* was never written, so the drawer showed the
    // raw backend value while the card showed the translated one.
    [t("d.category"), leadCategoryLabel(t, lead.category)],
    [t("d.region"), leadRegionLabel(te, lead.region)],
    [t("d.source"), source.label, source.title],
    [t("d.urgency"), leadUrgencyLabel(t, lead.urgency)],
    [t("d.score"), lead.scoreKey ? <ScoreChip score={lead.scoreKey} /> : lead.score ? String(lead.score) : ""],
    [t("d.created"), when(lead.createdAt)],
  ];
  const assignedAt = lead.assignedTo && lead.assignedAt ? when(lead.assignedAt) : "";
  const tel = (lead.phone || "").replace(/[^+\d]/g, "");
  const quick = today ? QUICK_DAYS.map((q) => ({ day: shiftDay(today, q.days), label: t(q.key) })) : [];
  const canPick = !!onAssign && ops.status !== "forbidden";
  const assignee = assigneeLabel(t, ops.people, lead.assignedTo, meId, ops.status === "ready");
  const stages: LeadStage[] = columns.map((c) => ({ key: c.key, label: kanbanColumnTitle(tStages, c), color: c.color || undefined, lost: isLostStage(c.key, columns) }));

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
  const dayLabel = (day: string) => {
    if (today && day === today) return t("history.today");
    if (today && day === prevDayKey(today)) return t("history.yesterday");
    return fmtDate(day, locale);
  };

  return (
    <Modal
      open
      variant="drawer"
      onClose={onClose}
      title={lead.name || lead.phone || "—"}
      description={
        scoreKey || (lead.name && lead.phone) ? (
          <>
            {scoreKey ? <ScoreChip score={scoreKey} className="ldrw__sc" /> : null}
            {lead.name && lead.phone ? <span className="ldrw__ph">{leadPhoneText(lead.phone)}</span> : null}
          </>
        ) : undefined
      }
      closeLabel={t("d.close")}
      dirty={!!note.trim()}
      footer={
        <button className="btn btn--sm btn--danger-ghost ldrw__del" type="button" disabled={busy} onClick={onDelete}>
          <IconTrash aria-hidden="true" />
          {t("d.delete")}
        </button>
      }
    >
        <div className="ldrw__body">
          <div className="ldrw__sec lasgn">
            <div className="lasgn__row ldrw__menus">
              <LeadStageMenu lead={lead} stage={colKey} stages={stages} onMove={(_, k) => onMove(k)} busy={busy} aiId="admin.pipeline.drawer.stage" />
              {canPick ? (
                <LeadOperatorMenu lead={lead} ops={ops} load={load} meId={meId} onAssign={(_, u) => void assign(u)} busy={act === "assign"} aiId="admin.pipeline.drawer.operator" />
              ) : (
                <span className={`lasg ldrw__opro${!lead.assignedTo ? " lasg--none" : lead.assignedTo === meId ? " lasg--me" : ""}`}>
                  <span>{tc("operatorButton", { name: assignee })}</span>
                </span>
              )}
            </div>
            {assignedAt ? <p className="lasgn__hint">{t("assign.at")}: {assignedAt}</p> : null}
            {ops.status === "error" ? <ErrorState compact error={ops.error} onRetry={ops.retry} title={t("assign.opsError")} /> : null}
            {ops.status === "forbidden" ? <InlineAlert tone="locked" compact>{t("assign.opsForbidden")}</InlineAlert> : null}
            {ops.status === "ready" && !ops.ops.length ? <InlineAlert tone="warn" compact>{t("assign.noOps")}</InlineAlert> : null}
          </div>

          {/* Client info */}
          <div className="ldrw__sec">
            <span className="ldrw__lbl">{t("d.info")}</span>
            <div className="ldrw__kv">
              {info.filter(([, v]) => v).map(([k, v, title]) => (
                <div key={k}><span>{k}</span><b title={title || undefined}>{v}</b></div>
              ))}
            </div>
            {lead.note ? <p className="ldrw__note">{lead.note}</p> : null}
          </div>

          {/* Quick actions */}
          <div className="ldrw__sec">
            <span className="ldrw__lbl">{t("d.actions")}</span>
            <div className="ldrw__acts">
              {tel ? (
                <a className="btn btn--line btn--sm" href={`tel:${tel}`} data-ai-id="admin.pipeline.drawer.call" data-ai-type="call_button"><IconPhone />{t("d.call")}</a>
              ) : (
                <button className="btn btn--line btn--sm" type="button" disabled aria-describedby={noPhoneId}><IconPhone />{t("d.call")}</button>
              )}
              {onVideo && canVideo ? (
                <button className="btn btn--line btn--sm" type="button" onClick={onVideo} disabled={videoBusy} aria-busy={videoBusy || undefined} data-ai-id="admin.pipeline.drawer.video" data-ai-type="call_button">
                  <IconVideo />
                  {tc("video")}
                </button>
              ) : null}
              <button className="btn btn--line btn--sm" type="button" disabled={act === "call" || !lead.phone} onClick={logCall}>{act === "call" ? t("d.saving") : t("d.logCall")}</button>
            </div>
            {!tel ? <p className="lasgn__hint" id={noPhoneId}>{t("d.noPhone")}</p> : null}
            <div className="ldrw__noteadd">
              <textarea
                className="ldrw__notefield"
                rows={2}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void addNote();
                  }
                }}
                placeholder={t("d.notePh")}
                aria-label={t("d.addNote")}
              />
              <button className="btn btn--pri btn--sm" type="button" disabled={!note.trim() || act === "note"} onClick={() => void addNote()}><IconSend />{act === "note" ? t("d.saving") : t("d.addNote")}</button>
            </div>
            {quick.length ? (
              <div className="ldrw__quick" role="group" aria-label={t("d.quickPicks")}>
                {quick.map((q) => (
                  <button key={q.day} type="button" className={`ldrw__qp${remind === q.day ? " on" : ""}`} aria-pressed={remind === q.day} disabled={act === "rem"} onClick={() => setRemind(q.day)}>
                    {q.label}
                    <span>{fmtDateTime(q.day, locale, false)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="ldrw__remind">
              <DatePicker value={remind} onChange={setRemind} min={today || undefined} placeholder={t("d.reminder")} ariaLabel={t("d.reminder")} />
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
                    {g.day ? <p className="lhist__date">{dayLabel(g.day)}</p> : null}
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
    </Modal>
  );
}
