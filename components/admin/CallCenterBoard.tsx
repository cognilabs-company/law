"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { assigneeLabel, isLostStage, leadCategoryLabel, leadRegionLabel, leadScoreLabel, LOST_REASONS } from "@/lib/leadLabels";
import { moveCallCenterLead } from "@/lib/services/backend";
import {
  getCallCenterKanbanX,
  leadsOf,
  leadFilterable,
  leadMatches,
  patchLeadInColumns,
  withAssignment,
  assignLead,
  ccUpdateLead,
  detailsPatch,
  useOperators,
  EMPTY_LEAD_FILTER,
  filterActive,
  type KanbanColumnX,
  type LeadFilter,
  leadUserId,
  type LeadX,
} from "@/lib/services/leads";
import { operatorName } from "@/lib/services/users";
import { useAuth } from "@/lib/auth";
import Modal from "@/components/admin/Modal";
import LeadFilterBar from "@/components/admin/LeadFilterBar";
import { ApiError, isForbidden } from "@/lib/http";
import { notify } from "@/lib/toast";
import Select, { rankOptions } from "@/components/Select";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import { IconRefresh, IconPhone } from "@/components/icons";
import CcMeetingButton from "./CcMeetingButton";

type State = { status: "loading" | "ready" | "error" | "forbidden"; columns: KanbanColumnX[]; error?: unknown };

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
  const tn = useTranslations("common.notify");
  const { session } = useAuth();
  const meId = session?.id ?? "";
  const ops = useOperators();
  const [state, setState] = useState<State>({ status: "loading", columns: [] });
  const [busyId, setBusyId] = useState("");
  const [f, setF] = useState<LeadFilter>(EMPTY_LEAD_FILTER);
  const hasCols = useRef(false);
  const cols = useRef<KanbanColumnX[]>([]);
  const again = useRef<() => void>(() => undefined);

  const load = useCallback(
    () =>
      getCallCenterKanbanX()
        .then((columns) => {
          hasCols.current = columns.length > 0;
          setState({ status: "ready", columns });
        })
        .catch((e: unknown) => {
          const forbidden = e instanceof ApiError && (e.status === 403 || e.status === 401);
          if (!forbidden && hasCols.current) {
            notify.error(t("refreshFailed"), { id: "cc-board-refresh", error: e, action: { label: tn("retry"), onClick: () => again.current() } });
            return;
          }
          setState((s) => ({ status: forbidden ? "forbidden" : "error", columns: s.columns, error: e }));
        }),
    [t, tn],
  );

  // Lost reason is asked before the card lands in a "lost" column (T4-02 §7).
  const [lostAsk, setLostAsk] = useState<{ leadId: string; key: string } | null>(null);
  const [lostReason, setLostReason] = useState<string>("price");
  const [lostNote, setLostNote] = useState("");
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    again.current = () => void load();
  }, [load]);
  useEffect(() => {
    cols.current = state.columns;
  }, [state.columns]);

  const allLeads = useMemo(() => leadsOf(state.columns), [state.columns]);
  const opLoad = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of allLeads) if (l.assignedTo) m.set(l.assignedTo, (m.get(l.assignedTo) ?? 0) + 1);
    return m;
  }, [allLeads]);
  const filterItems = useMemo(() => state.columns.flatMap((c) => c.cards.map((x) => ({ lead: leadFilterable(x.lead), stage: c.key }))), [state.columns]);
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

  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  });
  if (state.status === "forbidden") return null;

  const colTitle = (c: KanbanColumnX) => (tq.has(`stages.${c.key}`) ? tq(`stages.${c.key}`) : c.title || c.key);
  const leadTitle = (lead: LeadX) => lead.name || lead.phone || leadCategoryLabel(tp, lead.category) || tp("untitledLead");
  const canAssign = ops.status === "ready" && ops.ops.length > 0;
  const opLabel = (o: { name: string; phone: string; lexgoId: string }) => operatorName(o) || tp("assign.unknown");
  const noneOpt = { value: "", label: tp("assign.none") };
  const rankedOps = rankOptions(
    ops.ops.map((o) => ({ value: o.id, label: o.id === meId ? `${opLabel(o)} (${tp("assign.me")})` : opLabel(o) })),
    opLoad,
    tp("assign.others"),
    (n) => tp("assign.leadCount", { n }),
  );
  const assigneeOpts = [noneOpt, ...rankedOps];
  const assigneeOptsFor = (lead: LeadX) =>
    lead.assignedTo && !ops.ops.some((o) => o.id === lead.assignedTo) ? [noneOpt, { value: lead.assignedTo, label: assigneeLabel(tp, ops.people, lead.assignedTo, meId, ops.status === "ready") }, ...rankedOps] : assigneeOpts;

  function lostSaveFailed(leadId: string, fields: Record<string, string>, fallback: Record<string, unknown>, e: unknown) {
    notify.warning(t("lostReasonFailed"), {
      id: "cc-lead-lost-reason",
      error: e,
      action: isForbidden(e)
        ? undefined
        : {
            label: tn("retry"),
            onClick: () => {
              const details = leadsOf(cols.current).find((l) => l.id === leadId)?.details ?? fallback;
              void ccUpdateLead(leadId, { details: detailsPatch(details, fields) }).then(
                () => {
                  notify.success(t("lostReasonSaved"), { id: "cc-lead-lost-reason" });
                  void load();
                },
                (err: unknown) => lostSaveFailed(leadId, fields, fallback, err),
              );
            },
          },
    });
  }

  // Optimistic: the card moves at once; the board is refetched in the
  // background (the fetch takes seconds) and a rejected move is reverted.
  async function move(leadId: string, key: string, lost?: { reason: string; note: string }) {
    if (busyId || !key) return;
    if (isLostStage(key, state.columns) && !lost) { setLostAsk({ leadId, key }); return; }
    const before = state.columns;
    const from = before.find((c) => c.cards.some((x) => x.lead.id === leadId));
    const card = from?.cards.find((x) => x.lead.id === leadId);
    const to = before.find((c) => c.key === key);
    if (!from || !card || from.key === key) return;
    const lostFields = lost ? { lost_reason: lost.reason, lost_note: lost.note, lost_at: new Date().toISOString() } : null;
    setBusyId(leadId);
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
      const lostFail = lostFields
        ? await ccUpdateLead(leadId, { details: detailsPatch(card.lead.details ?? {}, lostFields) }).then(
            () => null,
            (e: unknown) => ({ e }),
          )
        : null;
      await moveCallCenterLead(leadId, key, 0);
      notify.dismiss(`cc-lead-move:${leadId}`);
      notify.success(tp("notify.moved", { stage: to ? colTitle(to) : key }), { id: "cc-lead-move" });
      if (lostFail && lostFields) lostSaveFailed(leadId, lostFields, card.lead.details ?? {}, lostFail.e);
      void load();
    } catch (e) {
      setState((s) => ({ ...s, columns: before }));
      notify.error(tq("moveFailed"), {
        id: `cc-lead-move:${leadId}`,
        error: e,
        map: { 403: tq("noPermission") },
        action: isForbidden(e) ? undefined : { label: tn("retry"), onClick: () => void moveRef.current(leadId, key, lost) },
      });
    } finally {
      setBusyId("");
    }
  }

  // (Re)assign a card to an operator. PATCH /admin/leads/{id} needs
  // leads.manage — a call-center operator gets 403 and a clear notice.
  async function assign(lead: LeadX, userId: string) {
    if (busyId || userId === lead.assignedTo) return;
    const before = state.columns;
    const who = assigneeOpts.find((o) => o.value === userId)?.label ?? "";
    setBusyId(lead.id);
    setState((s) => ({ ...s, columns: patchLeadInColumns(s.columns, lead.id, (l) => withAssignment(l, userId)) }));
    try {
      await assignLead(lead, userId);
      notify.success(userId ? tp("notify.assigned") : tp("notify.unassigned"), { id: `cc-assign-${lead.id}`, body: userId ? `${leadTitle(lead)} → ${who}` : leadTitle(lead) });
    } catch (e) {
      setState((s) => ({ ...s, columns: before }));
      notify.error(t("assignFailed"), { id: `cc-assign-${lead.id}`, error: e, map: { 403: tp("assign.noPermission") } });
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="ppanel" data-ai-target="callcenter:board">
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
          items={filterItems}
          meId={meId}
          regions={regions}
          stages={state.columns.map((c) => ({ value: c.key, label: colTitle(c) }))}
          operators={ops.status === "ready" ? ops.ops : undefined}
          scores
          count={shown}
          aiId="call_center.board.filters"
        />
      ) : null}
      {state.status === "ready" && ops.status === "error" ? <ErrorState compact error={ops.error} onRetry={ops.retry} title={tp("assign.opsError")} /> : null}
      {state.status === "loading" ? (
        <Skeleton rows={3} />
      ) : state.status === "error" ? (
        <ErrorState error={state.error} onRetry={load} title={t("loadError")} compact />
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
                c.cards.map(({ lead }) => {
                  // The category label is already the card title when the lead
                  // has neither a name nor a phone — don't repeat it in the meta line.
                  const titledByCategory = !lead.name && !lead.phone;
                  return (
                  <div className="ccb__card" key={lead.id}>
                    <b>{leadTitle(lead)}</b>
                    <span className="ccb__meta">
                      {/* LEXGO_PUBLIC_WORK_IDS_FRONTEND.md: LEAD-DX36K — what
                          an operator reads out on the phone. */}
                      {lead.workId ? <em className="wid">{lead.workId}</em> : null}
                      {[titledByCategory ? "" : leadCategoryLabel(tp, lead.category), leadRegionLabel(te, lead.region)].filter(Boolean).join(" · ")}
                    </span>
                    <span className="pipe__tags">
                      {lead.scoreKey ? <span className={`lscore lscore--${lead.scoreKey}`}>{leadScoreLabel(tp, lead.scoreKey)}</span> : null}
                      <span className={`lasg${!lead.assignedTo ? " lasg--none" : lead.assignedTo === meId ? " lasg--me" : ""}`} title={tp("assign.title")}>
                        <span>{assigneeLabel(tp, ops.people, lead.assignedTo, meId, ops.status === "ready")}</span>
                      </span>
                    </span>
                    {lead.phone ? (
                      <span className="ccb__contact">
                        <a className="ccb__tel" href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}>
                          <IconPhone />
                          {lead.phone}
                        </a>
                        <CcMeetingButton clientUserId={leadUserId(lead)} phone={lead.phone} clientName={lead.name} className="ccmeet--sm" />
                      </span>
                    ) : null}
                    <div className="ccb__sels">
                      {canAssign ? (
                        <Select value={lead.assignedTo} onChange={(v) => void assign(lead, v)} options={assigneeOptsFor(lead)} ariaLabel={tp("assign.select")} placeholder={busyId === lead.id ? tq("working") : tp("assign.select")} />
                      ) : null}
                      <Select
                        value=""
                        onChange={(v) => move(lead.id, v)}
                        options={state.columns.filter((o) => o.key !== c.key).map((o) => ({ value: o.key, label: colTitle(o) }))}
                        ariaLabel={tq("moveTo")}
                        placeholder={busyId === lead.id ? tq("working") : tq("moveTo")}
                      />
                    </div>
                  </div>
                  );
                })
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
