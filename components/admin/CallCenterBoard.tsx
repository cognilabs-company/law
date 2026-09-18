"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { assigneeLabel, leadCategoryLabel, leadRegionLabel, leadScoreLabel } from "@/lib/leadLabels";
import { moveCallCenterLead, adminUpdateLead } from "@/lib/services/backend";
import {
  getCallCenterKanbanX,
  leadsOf,
  leadFilterable,
  leadMatches,
  patchLeadInColumns,
  withAssignment,
  assignLead,
  isForbiddenErr,
  useOperators,
  EMPTY_LEAD_FILTER,
  filterActive,
  type KanbanColumnX,
  type LeadFilter,
  type LeadX,
} from "@/lib/services/leads";
import { useAuth } from "@/lib/auth";
import Modal from "@/components/admin/Modal";
import LeadFilterBar from "@/components/admin/LeadFilterBar";

const LOST_REASONS = ["price", "solved_self", "competitor", "no_answer", "no_service", "spam"] as const;
const isLostKey = (k: string) => /lost|rejected|yoqotil|rad/i.test(k);
import { ApiError } from "@/lib/http";
import Select from "@/components/Select";
import { Skeleton } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import { IconRefresh, IconPhone, IconUser } from "@/components/icons";

type State = { status: "loading" | "ready" | "error" | "forbidden"; columns: KanbanColumnX[] };

// T1A-05 call-center lead board (GET /call-center/leads/kanban, PATCH …/move).
// Compact columns with counts; each card moves through a select, which also
// works on phones where drag and drop doesn't. Hidden on 403. Filters (search,
// region, stage, date range, "my leads", score) are client-side; the assignee
// lives in lead.details (see lib/services/leads.ts).
export default function CallCenterBoard() {
  const t = useTranslations("admin.callCenter.board");
  const tq = useTranslations("admin.callCenter.queue");
  const te = useTranslations("enums");
  const tp = useTranslations("admin.pipeline");
  const { session } = useAuth();
  const meId = session?.id ?? "";
  const ops = useOperators();
  const [state, setState] = useState<State>({ status: "loading", columns: [] });
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [f, setF] = useState<LeadFilter>(EMPTY_LEAD_FILTER);

  const load = useCallback(
    () =>
      getCallCenterKanbanX()
        .then((columns) => setState({ status: "ready", columns }))
        .catch((e) => {
          const forbidden = e instanceof ApiError && (e.status === 403 || e.status === 401);
          setState((s) => ({ status: forbidden ? "forbidden" : "error", columns: s.columns }));
        }),
    [],
  );

  // Lost reason is asked before the card lands in a "lost" column (T4-02 §7).
  const [lostAsk, setLostAsk] = useState<{ leadId: string; key: string } | null>(null);
  const [lostReason, setLostReason] = useState<string>("price");
  const [lostNote, setLostNote] = useState("");
  useEffect(() => {
    void load();
  }, [load]);

  const allLeads = useMemo(() => leadsOf(state.columns), [state.columns]);
  const regions = useMemo(() => [...new Set(allLeads.map((l) => l.region).filter(Boolean))], [allLeads]);
  const filtered = filterActive(f);
  const viewCols = useMemo(
    () =>
      state.columns
        .filter((c) => !f.stage || c.key === f.stage)
        .map((c) => ({ ...c, cards: c.cards.filter((x) => leadMatches(leadFilterable(x.lead), f, meId)) })),
    [state.columns, f, meId],
  );
  const shown = viewCols.reduce((n, c) => n + c.cards.length, 0);

  if (state.status === "forbidden") return null;

  const colTitle = (c: KanbanColumnX) => (tq.has(`stages.${c.key}`) ? tq(`stages.${c.key}`) : c.title || c.key);

  // Optimistic: the card moves at once; the board is refetched in the
  // background (the fetch takes seconds) and a rejected move is reverted.
  async function move(leadId: string, key: string, lost?: { reason: string; note: string }) {
    if (busyId || !key) return;
    if (isLostKey(key) && !lost) { setLostAsk({ leadId, key }); return; }
    const before = state.columns;
    const from = before.find((c) => c.cards.some((x) => x.lead.id === leadId));
    const card = from?.cards.find((x) => x.lead.id === leadId);
    if (!from || !card || from.key === key) return;
    setBusyId(leadId);
    setNote(null);
    setState((s) => ({
      ...s,
      columns: s.columns.map((c) => {
        if (c.key === from.key) return { ...c, count: Math.max(0, c.count - 1), cards: c.cards.filter((x) => x.lead.id !== leadId) };
        if (c.key === key) return { ...c, count: c.count + 1, cards: [card, ...c.cards] };
        return c;
      }),
    }));
    try {
      // Details are replaced by the PATCH, so the existing ones are merged in. Best effort: a
      // call-center account without leads.manage still moves the card.
      if (lost) await adminUpdateLead(leadId, { details: { ...(card.lead.details ?? {}), lost_reason: lost.reason, lost_note: lost.note, lost_at: new Date().toISOString() } }).catch(() => {});
      await moveCallCenterLead(leadId, key, 0);
      void load();
    } catch (e) {
      setState((s) => ({ ...s, columns: before }));
      setNote({ ok: false, msg: e instanceof ApiError && e.status === 403 ? tq("noPermission") : tq("actionError") });
    } finally {
      setBusyId("");
    }
  }

  // (Re)assign a card to an operator. PATCH /admin/leads/{id} needs
  // leads.manage — a call-center operator gets 403 and a clear notice.
  async function assign(lead: LeadX, userId: string) {
    if (busyId || userId === lead.assignedTo) return;
    const before = state.columns;
    const at = new Date().toISOString();
    setBusyId(lead.id);
    setNote(null);
    setState((s) => ({ ...s, columns: patchLeadInColumns(s.columns, lead.id, (l) => withAssignment(l, userId, meId, at)) }));
    try {
      await assignLead(lead, userId, meId);
      setNote({ ok: true, msg: userId ? tp("assign.done") : tp("assign.removed") });
    } catch (e) {
      setState((s) => ({ ...s, columns: before }));
      setNote({ ok: false, msg: isForbiddenErr(e) ? tp("assign.noPermission") : tp("assign.err") });
    } finally {
      setBusyId("");
    }
  }

  const canAssign = ops.status === "ready" && ops.ops.length > 0;
  const assigneeOpts = [{ value: "", label: tp("assign.none") }, ...ops.ops.map((o) => ({ value: o.id, label: o.id === meId ? `${o.name || o.phone} (${tp("assign.me")})` : o.name || o.phone || o.lexgoId }))];

  return (
    <div className="ppanel">
      <Modal open={!!lostAsk} onClose={() => setLostAsk(null)} title={tp("lost.title")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p className="advmuted">{tp("lost.lead")}</p>
          <div>
            <label>{tp("lost.reason")}</label>
            <Select value={lostReason} onChange={setLostReason} options={LOST_REASONS.map((r) => ({ value: r, label: tp(`lost.reasons.${r}`) }))} ariaLabel={tp("lost.reason")} />
          </div>
          <div>
            <label>{tp("lost.note")}</label>
            <textarea rows={2} value={lostNote} onChange={(e) => setLostNote(e.target.value)} />
          </div>
          <button className="btn btn--pri btn--full" type="button" onClick={() => { const a = lostAsk; setLostAsk(null); if (a) void move(a.leadId, a.key, { reason: lostReason, note: lostNote.trim() }); setLostNote(""); }}>{tp("lost.confirm")}</button>
        </div>
      </Modal>
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <button type="button" className="btn btn--line btn--sm" onClick={() => void load()} aria-label={tq("refresh")}>
          <IconRefresh />
        </button>
      </div>
      {state.columns.length ? (
        <LeadFilterBar
          value={f}
          onChange={setF}
          regions={regions}
          stages={state.columns.map((c) => ({ value: c.key, label: colTitle(c) }))}
          operators={ops.status === "ready" ? ops.ops : undefined}
          mine
          scores
          summary={filtered ? { shown, total: allLeads.length } : undefined}
        />
      ) : null}
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {state.status === "loading" ? (
        <Skeleton rows={3} />
      ) : state.status === "error" ? (
        <p className="advmuted">{tq("loadError")}</p>
      ) : !state.columns.length ? (
        <p className="advmuted">{t("empty")}</p>
      ) : (
        <div className="ccb">
          {viewCols.map((c) => (
            <div className="ccb__col" key={c.key}>
              <div className="ccb__h">
                <span className="ccb__dot" style={{ background: c.color || "#94a3b8" }} />
                <b>{colTitle(c)}</b>
                <span className="advmuted">{filtered ? c.cards.length : c.count || c.cards.length}</span>
              </div>
              {c.cards.length ? (
                c.cards.map(({ lead }) => (
                  <div className="ccb__card" key={lead.id}>
                    <b>{lead.name || lead.phone || leadCategoryLabel(tp, lead.category) || tp("untitledLead")}</b>
                    <span className="ccb__meta">
                      {[leadCategoryLabel(tp, lead.category), leadRegionLabel(te, lead.region)].filter(Boolean).join(" · ")}
                    </span>
                    <span className="pipe__tags">
                      {lead.scoreKey ? <span className={`lscore lscore--${lead.scoreKey}`}>{leadScoreLabel(tp, lead.scoreKey)}</span> : null}
                      <span className={`lasg${!lead.assignedTo ? " lasg--none" : lead.assignedTo === meId ? " lasg--me" : ""}`} title={tp("assign.title")}>
                        <IconUser />
                        <span>{assigneeLabel(tp, ops.ops, lead.assignedTo, meId)}</span>
                      </span>
                    </span>
                    {lead.phone ? (
                      <a className="ccb__tel" href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}>
                        <IconPhone />
                        {lead.phone}
                      </a>
                    ) : null}
                    {canAssign ? (
                      <div className="lasgn__row">
                        <Select value={lead.assignedTo} onChange={(v) => void assign(lead, v)} options={assigneeOpts} ariaLabel={tp("assign.select")} placeholder={busyId === lead.id ? tq("working") : tp("assign.select")} />
                      </div>
                    ) : null}
                    <Select
                      value=""
                      onChange={(v) => move(lead.id, v)}
                      options={state.columns.filter((o) => o.key !== c.key).map((o) => ({ value: o.key, label: colTitle(o) }))}
                      ariaLabel={tq("moveTo")}
                      placeholder={busyId === lead.id ? tq("working") : tq("moveTo")}
                    />
                  </div>
                ))
              ) : (
                <p className="ccb__none">{filtered ? tp("f.noMatch") : t("noneHere")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
