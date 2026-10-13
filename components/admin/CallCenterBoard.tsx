"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isLostStage, kanbanColumnTitle, leadCategoryLabel } from "@/lib/leadLabels";
import { leadLoadOf } from "@/lib/leadOperators";
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
  type LeadX,
} from "@/lib/services/leads";
import { operatorName } from "@/lib/services/users";
import { useAuth } from "@/lib/auth";
import { aiId } from "@/lib/ai/ids";
import LostReasonDialog from "@/components/admin/LostReasonDialog";
import LeadFilterBar from "@/components/admin/LeadFilterBar";
import LeadCard from "@/components/admin/leads/LeadCard";
import StageTabs, { useLeadReveal, usePhoneBoard, useStageTab } from "@/components/admin/leads/StageTabs";
import { useLeadMeeting } from "@/components/admin/leads/useLeadMeeting";
import type { LeadCan, LeadStage } from "@/components/admin/leads/LeadMenu";
import { ApiError, isForbidden } from "@/lib/http";
import { notify } from "@/lib/toast";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import ListPager, { PAGE_STEP } from "@/components/ui/ListPager";
import ScrollArrows from "@/components/ui/ScrollArrows";
import { CountBadge } from "@/components/ui/Badge";
import IconButton from "@/components/ui/IconButton";
import { useScrollEdges } from "@/lib/useScrollEdges";
import { IconRefresh } from "@/components/icons";

type State = { status: "loading" | "ready" | "error" | "forbidden"; columns: KanbanColumnX[]; error?: unknown };
type Pages = { sig: string; n: Readonly<Record<string, number>> };

const WHEEL_LINE = 16;
const LEAD_AI = "call_center.board.lead";
const NO_PAGES: Readonly<Record<string, number>> = {};
const sigOf = (f: LeadFilter) => Object.values(f).join("|");
const EMPTY_SIG = sigOf(EMPTY_LEAD_FILTER);

function pageStuck(el: HTMLElement, dy: number): boolean {
  const pane = el.closest<HTMLElement>(".pbody");
  if (!pane) return true;
  return dy < 0 ? pane.scrollTop <= 1 : pane.scrollTop >= pane.scrollHeight - pane.clientHeight - 1;
}

function inHeadBand(el: HTMLElement, y: number): boolean {
  const head = el.querySelector<HTMLElement>(".ccb__h");
  return head ? y <= head.getBoundingClientRect().bottom + 10 : false;
}

function useSidewaysWheel(el: HTMLElement | null) {
  useEffect(() => {
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || !e.cancelable || e.ctrlKey || e.metaKey || e.shiftKey || !e.deltaY || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const room = el.scrollWidth - el.clientWidth;
      const at = e.target instanceof Element ? e.target : null;
      if (room <= 2 || !at) return;
      const dx = e.deltaMode === 1 ? e.deltaY * WHEEL_LINE : e.deltaMode === 2 ? e.deltaY * el.clientWidth : e.deltaY;
      const x = Math.abs(el.scrollLeft);
      if (dx < 0 ? x <= 1 : x >= room - 1) return;
      const head = Boolean(at.closest(".ccb__h"));
      const open = at === el || at.matches(".ccb__col,.ccb__none");
      if (!head && !(open && (inHeadBand(el, e.clientY) || pageStuck(el, dx)))) return;
      e.preventDefault();
      el.scrollLeft += dx;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [el]);
}

export default function CallCenterBoard() {
  const t = useTranslations("admin.callCenter.board");
  const tq = useTranslations("admin.callCenter.queue");
  const tp = useTranslations("admin.pipeline");
  const tn = useTranslations("common.notify");
  const { session } = useAuth();
  const meId = session?.id ?? "";
  const ops = useOperators();
  const meeting = useLeadMeeting();
  const phone = usePhoneBoard();
  const [state, setState] = useState<State>({ status: "loading", columns: [] });
  const [busyId, setBusyId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [f, setF] = useState<LeadFilter>(EMPTY_LEAD_FILTER);
  const [pages, setPages] = useState<Pages>({ sig: EMPTY_SIG, n: NO_PAGES });
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

  const [lostAsk, setLostAsk] = useState<{ leadId: string; key: string } | null>(null);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    again.current = () => void load();
  }, [load]);
  useEffect(() => {
    cols.current = state.columns;
  }, [state.columns]);

  const colTitle = (c: KanbanColumnX) => kanbanColumnTitle(tq, c);
  const allLeads = useMemo(() => leadsOf(state.columns), [state.columns]);
  const lostLead = lostAsk ? allLeads.find((l) => l.id === lostAsk.leadId) ?? null : null;
  const opLoad = useMemo(() => leadLoadOf(allLeads), [allLeads]);
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
  const pageSig = sigOf(f);
  const pageN = pages.sig === pageSig ? pages.n : NO_PAGES;
  const shownOf = (key: string) => Math.max(PAGE_STEP, pageN[key] ?? 0);
  const setShown = (key: string, n: number, sig: string = pageSig) => setPages((p) => ({ sig, n: { ...(p.sig === sig ? p.n : NO_PAGES), [key]: n } }));

  const stageTabs = viewCols.map((c) => ({ key: c.key, label: colTitle(c), count: filtered ? c.cards.length : c.count || c.cards.length }));
  const [stageKey, setStageKey] = useStageTab("callcenter", stageTabs);
  const phoneCol = viewCols.find((c) => c.key === stageKey) ?? viewCols[0];

  const hiddenIds: string[] = [];
  const inView = new Set<string>();
  for (const c of viewCols) {
    const lim = phone && c.key !== phoneCol?.key ? 0 : shownOf(c.key);
    c.cards.forEach((x, i) => {
      inView.add(x.lead.id);
      if (i >= lim) hiddenIds.push(x.lead.id);
    });
  }
  for (const l of allLeads) if (!inView.has(l.id)) hiddenIds.push(l.id);

  useLeadReveal(LEAD_AI, hiddenIds, (leadId) => {
    const here = viewCols.some((c) => c.cards.some((x) => x.lead.id === leadId));
    const list = here ? viewCols : state.columns;
    const sig = here ? pageSig : EMPTY_SIG;
    if (!here) setF(EMPTY_LEAD_FILTER);
    const col = list.find((c) => c.cards.some((x) => x.lead.id === leadId));
    if (!col) return;
    const at = col.cards.findIndex((x) => x.lead.id === leadId);
    if (phone) setStageKey(col.key);
    const have = here ? shownOf(col.key) : PAGE_STEP;
    if (at >= have) setShown(col.key, Math.ceil((at + 1) / PAGE_STEP) * PAGE_STEP, sig);
  });

  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardEl, setBoardEl] = useState<HTMLDivElement | null>(null);
  const bindBoard = useCallback((el: HTMLDivElement | null) => {
    boardRef.current = el;
    setBoardEl(el);
  }, []);
  const edges = useScrollEdges(boardEl);
  useSidewaysWheel(boardEl);

  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  });
  if (state.status === "forbidden") return null;

  function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }

  const leadTitle = (lead: LeadX) => lead.name || lead.phone || leadCategoryLabel(tp, lead.category) || tp("untitledLead");
  const stageList: LeadStage[] = state.columns.map((c) => ({ key: c.key, label: colTitle(c), color: c.color, lost: isLostStage(c.key, state.columns) }));
  const canPickOp: LeadCan =
    ops.status === "forbidden" ? tp("assign.noPermission") : ops.status === "error" ? tp("assign.opsError") : ops.status === "loading" || ops.ops.length > 0;

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

  async function move(leadId: string, key: string, lost?: { reason: string; note: string }) {
    if (busyId || !key) return;
    if (isLostStage(key, state.columns) && !lost) {
      setLostAsk({ leadId, key });
      return;
    }
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

  async function assign(lead: LeadX, userId: string) {
    if (busyId || userId === lead.assignedTo) return;
    const before = state.columns;
    const op = ops.ops.find((o) => o.id === userId);
    const name = op ? operatorName(op) || tp("assign.unknown") : "";
    const who = name && userId === meId ? `${name} (${tp("assign.me")})` : name;
    setBusyId(lead.id);
    setState((s) => ({ ...s, columns: patchLeadInColumns(s.columns, lead.id, (l) => withAssignment(l, userId)) }));
    try {
      await assignLead(lead, userId);
      notify.success(userId ? tp("notify.assigned") : tp("notify.unassigned"), { id: `cc-assign-${lead.id}`, body: userId && who ? `${leadTitle(lead)} → ${who}` : leadTitle(lead) });
    } catch (e) {
      setState((s) => ({ ...s, columns: before }));
      notify.error(t("assignFailed"), { id: `cc-assign-${lead.id}`, error: e, map: { 403: tp("assign.noPermission") } });
    } finally {
      setBusyId("");
    }
  }

  const pagerFor = (key: string, total: number) => {
    const count = Math.min(total, shownOf(key));
    return {
      count,
      total,
      step: PAGE_STEP,
      next: Math.min(PAGE_STEP, Math.max(0, total - count)),
      onMore: () => setShown(key, count + PAGE_STEP),
      onLess: () => setShown(key, PAGE_STEP),
    };
  };

  const card = (lead: LeadX, colKey: string) => (
    <LeadCard
      key={lead.id}
      variant="callcenter"
      lead={lead}
      stage={colKey}
      stages={stageList}
      ops={ops}
      load={opLoad}
      meId={meId}
      busy={busyId === lead.id}
      onMove={(l, k) => void move(l.id, k)}
      onLost={(l, k) => setLostAsk({ leadId: l.id, key: k })}
      onAssign={(l, u) => void assign(l, u)}
      canAssign={canPickOp}
      onVideo={meeting.start}
      canVideo={meeting.can(lead)}
      aiId={aiId(LEAD_AI, lead.id)}
    />
  );

  const emptyText = filtered ? tp("f.noMatch") : t("noneHere");

  return (
    <div className="ppanel" data-ai-target="callcenter:board">
      <LostReasonDialog
        open={!!lostAsk}
        leadName={lostLead ? leadTitle(lostLead) : ""}
        onCancel={() => setLostAsk(null)}
        onConfirm={(reason, note) => {
          const a = lostAsk;
          setLostAsk(null);
          if (a) void move(a.leadId, a.key, { reason, note });
        }}
      />
      <div className="ppanel__h cch">
        <h2 className="cch__t"><span className="cch__tt">{t("title")}</span></h2>
        <div className="cch__a">
          {state.status === "ready" && state.columns.length ? <CountBadge n={shown} /> : null}
          <IconButton label={tq("refresh")} icon={<IconRefresh />} onClick={refreshNow} busy={refreshing} tipAlign="end" aiId="call_center.board.refresh" />
        </div>
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
      ) : phone ? (
        <div className="ccb-phone">
          <StageTabs stages={stageTabs} value={phoneCol?.key} onChange={setStageKey} level={2} className="ccb-stages" aiId="call_center.board.stages" />
          {phoneCol && phoneCol.cards.length ? (
            <>
              <div className="ldc-list ccb-list">{phoneCol.cards.slice(0, shownOf(phoneCol.key)).map(({ lead }) => card(lead, phoneCol.key))}</div>
              <ListPager {...pagerFor(phoneCol.key, phoneCol.cards.length)} aiId="call_center.board.more" />
            </>
          ) : (
            <p className="ccb__none ccb-phone__none">{emptyText}</p>
          )}
        </div>
      ) : (
        <ScrollArrows target={boardRef} edges={edges} className="ccb-host">
          <div ref={bindBoard} className="ccb scue-x">
            {viewCols.map((c) => (
              <div className="ccb__col" key={c.key}>
                <div className="ccb__h">
                  <span className="ccb__dot" style={{ background: c.color || "#94a3b8" }} />
                  <b>{colTitle(c)}</b>
                  <span className="advmuted">{filtered ? c.cards.length : c.count || c.cards.length}</span>
                </div>
                {c.cards.length ? (
                  <>
                    {c.cards.slice(0, shownOf(c.key)).map(({ lead }) => card(lead, c.key))}
                    <ListPager {...pagerFor(c.key, c.cards.length)} className="ccb__pager" />
                  </>
                ) : (
                  <p className="ccb__none">{emptyText}</p>
                )}
              </div>
            ))}
          </div>
        </ScrollArrows>
      )}
      {meeting.node}
    </div>
  );
}
