"use client";

import { useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getLeadTimeline, reengageLead, logCcCall, createTask, type KanbanColumn } from "@/lib/services/backend";
import { isForbiddenErr, type LeadX, type OpsStatus } from "@/lib/services/leads";
import type { AdminUser } from "@/lib/services/users";
import { useResource } from "@/lib/useResource";
import { Notice, useReload } from "@/components/admin/AdminBits";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import { fmtDate, shortDateTime } from "@/lib/date";
import { assigneeLabel, leadRegionLabel, leadScoreLabel, leadUrgencyLabel } from "@/lib/leadLabels";
import { Skeleton } from "@/components/portal/DataState";
import { IconClose, IconClock, IconPhone, IconSend, IconUser } from "@/components/icons";

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
  const locale = useLocale();
  const [tlKey, bumpTl] = useReload();
  const tl = useResource(() => getLeadTimeline(lead.id), [lead.id, tlKey]);
  const [note, setNote] = useState("");
  const [remind, setRemind] = useState("");
  const [act, setAct] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [asgMsg, setAsgMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  async function addNote() {
    if (!note.trim() || act) return;
    setAct("note"); setMsg(null);
    try { await reengageLead(lead.id, note.trim()); setNote(""); setMsg({ ok: true, msg: t("d.done") }); bumpTl(); }
    catch { setMsg({ ok: false, msg: t("d.err") }); }
    finally { setAct(null); }
  }
  async function logCall() {
    if (act || !lead.phone) return;
    setAct("call"); setMsg(null);
    try { await logCcCall({ phone: lead.phone, note: `Lead: ${lead.name || lead.phone}` }); setMsg({ ok: true, msg: t("d.callLogged") }); bumpTl(); }
    catch { setMsg({ ok: false, msg: t("d.err") }); }
    finally { setAct(null); }
  }
  async function setReminder() {
    if (!remind || act) return;
    setAct("rem"); setMsg(null);
    try { await createTask({ title: `${t("d.reminderTitle")}: ${lead.name || lead.phone}`, priority: "medium", due_date: remind }); setRemind(""); setMsg({ ok: true, msg: t("d.reminderSet") }); }
    catch { setMsg({ ok: false, msg: t("d.err") }); }
    finally { setAct(null); }
  }
  // Operators without leads.manage get a 403 from PATCH /admin/leads/{id}.
  async function assign(userId: string) {
    if (!onAssign || act || userId === lead.assignedTo) return;
    setAct("assign"); setAsgMsg(null);
    try { await onAssign(userId); setAsgMsg({ ok: true, msg: userId ? t("assign.done") : t("assign.removed") }); }
    catch (e) { setAsgMsg({ ok: false, msg: isForbiddenErr(e) ? t("assign.noPermission") : t("assign.err") }); }
    finally { setAct(null); }
  }

  const info: [string, string][] = [
    [t("d.phone"), lead.phone],
    [t("d.category"), lead.category && (t.has(`d.cat.${lead.category}`) ? t(`d.cat.${lead.category}`) : lead.category)],
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
                  {c.title}
                </button>
              ))}
            </div>
          </div>

          {/* Operator assignment (kept in lead.details until the backend has a column) */}
          <div className="ldrw__sec lasgn">
            <span className="ldrw__lbl">{t("assign.title")}</span>
            <div className="lasgn__row">
              <span className={`lasg${!lead.assignedTo ? " lasg--none" : lead.assignedTo === meId ? " lasg--me" : ""}`}>
                <IconUser />
                <span>{assigneeLabel(t, operators, lead.assignedTo, meId)}</span>
              </span>
              {canPick ? (
                <Select value={lead.assignedTo} onChange={(v) => void assign(v)} options={assigneeOpts} ariaLabel={t("assign.select")} placeholder={act === "assign" ? t("d.saving") : t("assign.select")} />
              ) : null}
            </div>
            {opsStatus === "forbidden" ? <p className="lasgn__hint">{t("assign.opsForbidden")}</p> : null}
            {opsStatus === "ready" && !operators.length ? <p className="lasgn__hint">{t("assign.noOps")}</p> : null}
            <p className="lasgn__hint">{t("assign.localNote")}</p>
            {asgMsg ? <Notice ok={asgMsg.ok} msg={asgMsg.msg} /> : null}
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
              <button className="btn btn--soft btn--sm" type="button" disabled={act === "call" || !lead.phone} onClick={logCall}>{act === "call" ? t("d.saving") : t("d.logCall")}</button>
            </div>
            <div className="ldrw__noteadd">
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("d.notePh")} />
              <button className="btn btn--pri btn--sm" type="button" disabled={!note.trim() || act === "note"} onClick={addNote}><IconSend />{act === "note" ? t("d.saving") : t("d.addNote")}</button>
            </div>
            <div className="ldrw__remind">
              <DatePicker value={remind} onChange={setRemind} placeholder={t("d.reminder")} ariaLabel={t("d.reminder")} />
              <button className="btn btn--line btn--sm" type="button" disabled={!remind || act === "rem"} onClick={setReminder}>{act === "rem" ? t("d.saving") : t("d.setReminder")}</button>
            </div>
            {msg ? <Notice ok={msg.ok} msg={msg.msg} /> : null}
          </div>

          {/* Timeline */}
          <div className="ldrw__sec">
            <span className="ldrw__lbl">{t("d.timeline")}</span>
            {tl.status === "loading" ? (
              <Skeleton rows={3} />
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
