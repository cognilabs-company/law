"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { moveLeadKanban, adminCreateLead, adminDeleteLead, adminUpdateLead, saveLeadKanbanColumns, deleteLeadKanbanColumn } from "@/lib/services/backend";
import {
  getLeadKanbanX,
  leadsOf,
  leadFilterable,
  leadMatches,
  patchLeadInColumns,
  withAssignment,
  assignLead,
  autoAssign,
  applyAssignments,
  useOperators,
  EMPTY_LEAD_FILTER,
  filterActive,
  type AssignStrategy,
  detailsPatch,
  type KanbanColumnX,
  type LeadFilter,
  type LeadX,
} from "@/lib/services/leads";
import { operatorName } from "@/lib/services/users";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/toast";
import { assigneeLabel, isLostStage, kanbanColumnTitle, leadCategoryLabel, leadRegionLabel, leadScoreLabel, leadSourceLabel, LOST_REASONS, personLabel } from "@/lib/leadLabels";
import { useResource } from "@/lib/useResource";
import { AdminForm, Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import FieldError from "@/components/ui/FieldError";
import Select from "@/components/Select";
import LeadDrawer from "@/components/admin/LeadDrawer";
import LeadFilterBar from "@/components/admin/LeadFilterBar";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { IconTrendingUp, IconChevronLeft, IconChevronRight, IconUsers, IconGrid, IconDocLines, IconPlus, IconEdit, IconTrash, IconUser, IconBolt, IconPhone, IconMapPin } from "@/components/icons";
import { initials } from "@/lib/lawyers";

type Lost = { reason: string; note: string };
type MoveOpts = { lost?: Lost; undo?: boolean };

// Whole minutes since the epoch, refreshed once a minute, for the card ages.
function subscribeMinute(cb: () => void) {
  const id = window.setInterval(cb, 60000);
  return () => window.clearInterval(id);
}
const readMinute = () => Math.floor(Date.now() / 60000);

const STATUS_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#6b7280"];

export default function AdminPipeline() {
  const t = useTranslations("admin.pipeline");
  const tStages = useTranslations("admin.callCenter.queue");
  const te = useTranslations("enums");
  const colName = (c: { key: string; title: string }) => kanbanColumnTitle(tStages, c);
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const tn = useTranslations("common.notify");
  const { session } = useAuth();
  const meId = session?.id ?? "";
  // Call-center operators for assignment (GET /admin/users — users.manage).
  const ops = useOperators();
  // The board is big (hundreds of leads, several seconds per fetch), so every
  // action updates it in place and refreshes in the background — never back
  // to a skeleton, which read as a page reload.
  const res = useResource<KanbanColumnX>(getLeadKanbanX, []);
  const cols = res.data;
  const refresh = res.refresh;
  const moveRef = useRef<(leadId: string, columnKey: string, position: number, opts?: MoveOpts) => Promise<void>>(async () => {});
  const autoRef = useRef<() => Promise<void>>(async () => {});
  // Lost reason is asked before the card lands in a "lost" column (T4-02 §7).
  const [lostAsk, setLostAsk] = useState<{ leadId: string; columnKey: string; position: number } | null>(null);
  const [lostReason, setLostReason] = useState<string>("price");
  const [lostNote, setLostNote] = useState("");
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // Where in overCol the card would land — the placeholder renders exactly
  // here (between the two cards it'd sit between, or at the end), instead of
  // always at the top of the column regardless of where the cursor actually
  // is. Defaults to "append at the end"; each card's own onDragOver narrows
  // it to before/after itself based on which half of the card the cursor is
  // over, and stops the column's own handler from then overwriting that with
  // the append default.
  const [overIndex, setOverIndex] = useState(0);
  // The slot above eases its height in on hover, which looks nice — but a
  // real drop re-sorts/repositions cards in the very same render, so if the
  // slot eased itself back out over its usual 200ms it would visibly lag
  // behind cards that have already snapped to their new spot. Collapsing it
  // instantly on an actual drop (not on a plain drag-away) avoids that race —
  // same fix already applied to the Vazifalar kanban (TaskBoard.tsx).
  const [dropInstant, setDropInstant] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const minute = useSyncExternalStore(subscribeMinute, readMinute, () => 0);

  // Add / rename a kanban status (column).
  const [statusModal, setStatusModal] = useState<{ mode: "add" | "rename"; col?: KanbanColumnX } | null>(null);
  const [sName, setSName] = useState("");
  const [sColor, setSColor] = useState("#2563eb");
  const [sBusy, setSBusy] = useState(false);
  const [sTouched, setSTouched] = useState(false);
  const sNameId = useId();
  const sNameErr = sTouched && !sName.trim() ? tc("required") : "";

  // Delete a status (column), reassigning its leads if any.
  const [delCol, setDelCol] = useState<KanbanColumnX | null>(null);
  const [delReassign, setDelReassign] = useState("");
  const [delColBusy, setDelColBusy] = useState(false);

  // Auto-assignment of unassigned leads (client-side plan, saved lead by lead).
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoStrategy, setAutoStrategy] = useState<AssignStrategy>("round_robin");
  const [autoRun, setAutoRun] = useState<{ done: number; total: number } | null>(null);

  const total = useMemo(() => cols.reduce((n, c) => n + c.count, 0), [cols]);
  const allCards = useMemo(
    () => cols.flatMap((c) => c.cards.map((x) => ({ lead: x.lead, colKey: c.key }))),
    [cols],
  );
  const allLeads = useMemo(() => leadsOf(cols), [cols]);
  const unassigned = useMemo(() => allLeads.filter((l) => !l.assignedTo), [allLeads]);
  const selected = allCards.find((x) => x.lead.id === selId) || null;
  const colTitle = (k: string) => {
    const c = cols.find((x) => x.key === k);
    return c ? colName(c) : k;
  };
  const colColor = (k: string) => cols.find((c) => c.key === k)?.color || "";
  const orderOf = (k: string) => cols.findIndex((c) => c.key === k);
  const nameOf = (l: LeadX) => l.name || l.phone || leadCategoryLabel(t, l.category) || t("untitledLead");

  // Filters (client-side over the loaded board).
  const [f, setF] = useState<LeadFilter>(EMPTY_LEAD_FILTER);
  const filterItems = useMemo(() => allCards.map((x) => ({ lead: leadFilterable(x.lead), stage: x.colKey })), [allCards]);
  const sources = useMemo(() => [...new Set(allLeads.map((l) => l.source).filter(Boolean))], [allLeads]);
  const regions = useMemo(() => [...new Set(allLeads.map((l) => l.region).filter(Boolean))], [allLeads]);
  const urgencies = useMemo(() => [...new Set(allLeads.map((l) => l.urgency.trim().toLowerCase()).filter(Boolean))], [allLeads]);
  const viewCols = useMemo(() => cols.map((c) => ({ ...c, cards: c.cards.filter((x) => leadMatches(leadFilterable(x.lead), f, meId)) })), [cols, f, meId]);
  const filtered = filterActive(f);
  const shown = viewCols.reduce((n, c) => n + c.cards.length, 0);
  const rows = allCards.filter((x) => leadMatches(leadFilterable(x.lead), f, meId) && (!f.stage || x.colKey === f.stage));

  // KPI (from the full board, not the filtered view).
  const finalTotal = cols.filter((c) => c.isFinal).reduce((n, c) => n + c.count, 0);
  const wonCount = (cols.find((c) => c.key === "won") ?? cols.filter((c) => c.isFinal)[0])?.count ?? 0;
  const active = total - finalTotal;
  const conv = total ? Math.round((wonCount / total) * 100) : 0;

  // Optimistic: the card jumps at once, the server call follows, then the
  // board is refetched silently. A rejected move puts the card back.
  async function moveTo(leadId: string, columnKey: string, position: number, opts: MoveOpts = {}) {
    if (busy) return;
    const { lost, undo } = opts;
    const from = cols.find((c) => c.cards.some((x) => x.lead.id === leadId));
    if (!from) return;
    const sameColumn = from.key === columnKey;
    // The lost-reason prompt is for a card newly entering a lost column, not
    // for reordering cards that are already sitting in one.
    if (!sameColumn && isLostStage(columnKey, cols) && !lost && !undo) { setLostAsk({ leadId, columnKey, position }); return; }
    const card = from.cards.find((x) => x.lead.id === leadId);
    if (!card) return;
    const curIdx = from.cards.findIndex((x) => x.lead.id === leadId);
    // Reordering within one column: lifting the dragged card out shifts every
    // later index down by one, so a target position after its own current
    // slot needs that same adjustment — otherwise the card lands one place
    // further than where it was actually dropped.
    const finalPosition = !undo && sameColumn && position > curIdx ? position - 1 : position;
    if (sameColumn && finalPosition === curIdx) return; // dropped back where it started
    const before = cols;
    const body = nameOf(card.lead);
    const retry = { label: tn("retry"), onClick: () => void moveRef.current(leadId, columnKey, position, opts) };
    const failId = `lead-move:${leadId}`;
    setBusy(leadId);
    res.setData((cur) =>
      cur.map((c) => {
        if (sameColumn) {
          if (c.key !== from.key) return c;
          const cardsArr = c.cards.filter((x) => x.lead.id !== leadId);
          cardsArr.splice(Math.min(finalPosition, cardsArr.length), 0, card);
          return { ...c, cards: cardsArr };
        }
        if (c.key === from.key) return { ...c, count: Math.max(0, c.count - 1), cards: c.cards.filter((x) => x.lead.id !== leadId) };
        if (c.key === columnKey) {
          const cardsArr = c.cards.slice();
          cardsArr.splice(Math.min(finalPosition, cardsArr.length), 0, card);
          return { ...c, count: c.count + 1, cards: cardsArr };
        }
        return c;
      }),
    );
    if (lost) {
      try {
        await adminUpdateLead(leadId, { details: detailsPatch(card.lead.details ?? {}, { lost_reason: lost.reason, lost_note: lost.note, lost_at: new Date().toISOString() }) });
      } catch (e) {
        res.setData(before);
        setBusy(null);
        notify.error(t("notify.lostFailed"), { id: failId, error: e, action: retry });
        return;
      }
    }
    try {
      await moveLeadKanban(leadId, columnKey, finalPosition);
      void refresh();
      notify.dismiss(failId);
      if (undo) notify.success(t("notify.moveUndone"), { id: "lead-move", body });
      else
        notify.success(sameColumn ? t("notify.reordered") : t("notify.moved", { stage: colTitle(columnKey) }), {
          id: "lead-move",
          body,
          action: { label: tn("undo"), onClick: () => void moveRef.current(leadId, from.key, curIdx, { undo: true }) },
        });
    } catch (e) {
      res.setData(before);
      notify.error(t("notify.moveFailed"), { id: failId, error: e, action: retry });
    } finally {
      setBusy(null);
    }
  }
  function shift(leadId: string, fromKey: string, dir: number) {
    const i = orderOf(fromKey);
    const next = cols[i + dir];
    if (next) moveTo(leadId, next.key, next.cards.length);
  }
  // (Re)assign one lead to an operator ("" = unassign). The card updates at
  // once; a rejected write (403 without leads.manage) puts it back and the
  // drawer shows the reason.
  async function assign(lead: LeadX, userId: string) {
    res.setData((cur) => patchLeadInColumns(cur, lead.id, (l) => withAssignment(l, userId)));
    try {
      await assignLead(lead, userId);
    } catch (e) {
      res.setData((cur) => patchLeadInColumns(cur, lead.id, () => lead));
      throw e;
    }
  }
  function openAuto() {
    setAutoRun(null);
    setAutoOpen(true);
  }
  async function runAuto() {
    if (autoRun) return;
    const plan = autoAssign(allLeads, ops.ops, autoStrategy);
    if (!plan.length) { setAutoOpen(false); return; }
    setAutoRun({ done: 0, total: plan.length });
    const retry = { label: tn("retry"), onClick: () => { setAutoOpen(true); void autoRef.current(); } };
    try {
      const r = await applyAssignments(plan, (a) => {
        res.setData((cur) => patchLeadInColumns(cur, a.lead.id, (l) => withAssignment(l, a.operator.id)));
        setAutoRun((cur) => (cur ? { ...cur, done: cur.done + 1 } : cur));
      });
      const failed = plan.length - r.done;
      if (!r.done) notify.error(t("notify.autoFailed"), { id: "lead-auto", body: r.forbidden ? t("assign.noPermission") : undefined, error: r.lastError, action: r.forbidden ? undefined : retry });
      else if (failed) notify.warning(t("notify.autoPartial"), { id: "lead-auto", body: t("auto.partial", { n: r.done, failed }), action: r.forbidden ? undefined : retry });
      else notify.success(t("notify.autoDone", { n: r.done }), { id: "lead-auto" });
    } catch (e) {
      notify.error(t("notify.autoFailed"), { id: "lead-auto", error: e, action: retry });
    } finally {
      setAutoRun(null);
      setAutoOpen(false);
      void refresh();
    }
  }
  function openAddStatus() {
    setSName("");
    setSColor(STATUS_COLORS[0]);
    setSTouched(false);
    setStatusModal({ mode: "add" });
  }
  function openRenameStatus(col: KanbanColumnX) {
    setSName(colName(col));
    setSColor(col.color || "#6b7280");
    setSTouched(false);
    setStatusModal({ mode: "rename", col });
  }
  // Build a unique column key from the typed name (falls back for non-latin).
  function statusKey(name: string): string {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const seed = base || `col_${Date.now().toString(36)}`;
    const taken = new Set(cols.map((c) => c.key));
    let k = seed;
    let i = 2;
    while (taken.has(k)) k = `${seed}_${i++}`;
    return k;
  }
  async function submitStatus() {
    const name = sName.trim();
    if (!name || sBusy || !statusModal) return;
    const adding = statusModal.mode === "add";
    setSBusy(true);
    try {
      if (adding) {
        const order = cols.reduce((m, c) => Math.max(m, c.order), 0) + 10;
        await saveLeadKanbanColumns([{ key: statusKey(name), title: name, color: sColor, order }]);
      } else if (statusModal.col) {
        const c = statusModal.col;
        await saveLeadKanbanColumns([{ key: c.key, title: name === colName(c) ? c.title : name, color: sColor, order: c.order, isFinal: c.isFinal }]);
      }
      setStatusModal(null);
      void refresh();
      notify.success(adding ? t("notify.stageAdded") : t("notify.stageSaved"), { body: name });
    } catch (e) {
      notify.error(adding ? t("notify.stageAddFailed") : t("notify.stageSaveFailed"), { error: e });
    } finally {
      setSBusy(false);
    }
  }
  function openDeleteStatus(col: KanbanColumnX) {
    setDelCol(col);
    // Default reassignment target: the first other column.
    setDelReassign(cols.find((c) => c.key !== col.key)?.key ?? "");
  }
  async function confirmDeleteStatus() {
    if (!delCol || delColBusy) return;
    const col = delCol;
    const target = col.count > 0 ? cols.find((c) => c.key === delReassign) : undefined;
    setDelColBusy(true);
    try {
      await deleteLeadKanbanColumn(col.key, col.count > 0 ? delReassign || undefined : undefined);
      setDelCol(null);
      void refresh();
      notify.success(t("notify.stageDeleted"), { body: target ? t("notify.stageLeadsMoved", { n: col.count, stage: colName(target) }) : colName(col) });
    } catch (e) {
      notify.error(t("notify.stageDeleteFailed"), { error: e, map: { 409: t("notify.stageDeleteConflict") } });
    } finally {
      setDelColBusy(false);
    }
  }
  async function remove(leadId: string, confirmed = false) {
    const lead = allLeads.find((l) => l.id === leadId);
    const name = lead ? nameOf(lead) : t("untitledLead");
    if (!confirmed && !(await confirmDialog({ tone: "danger", title: t("notify.deleteAsk", { name }), text: ta("form.deleteConfirmText"), confirmLabel: ta("form.delete") }))) return;
    setBusy(leadId);
    try {
      await adminDeleteLead(leadId);
      setSelId((cur) => (cur === leadId ? null : cur));
      res.setData((cur) => cur.map((c) => (c.cards.some((x) => x.lead.id === leadId) ? { ...c, count: Math.max(0, c.count - 1), cards: c.cards.filter((x) => x.lead.id !== leadId) } : c)));
      void refresh();
      notify.dismiss(`lead-delete:${leadId}`);
      notify.success(t("notify.deleted"), { body: name });
    } catch (e) {
      notify.error(t("notify.deleteFailed"), { id: `lead-delete:${leadId}`, error: e, action: { label: tn("retry"), onClick: () => void remove(leadId, true) } });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    moveRef.current = moveTo;
    autoRef.current = runAuto;
  });

  // Auto-assign preview (only while the modal is open — the plan is pure).
  const autoPlan = autoOpen ? autoAssign(allLeads, ops.ops, autoStrategy) : [];
  const autoPerOp = autoPlan.reduce<Map<string, number>>((m, a) => m.set(a.operator.id, (m.get(a.operator.id) ?? 0) + 1), new Map());

  const jump = (key: string) => {
    if (view === "table") {
      setF((cur) => ({ ...cur, stage: cur.stage === key ? "" : key }));
      return;
    }
    document.getElementById(`lpipe-col-${key}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };
  const ageOf = (iso: string) => {
    const at = Date.parse(iso);
    if (!minute || !Number.isFinite(at)) return "";
    const mins = Math.max(0, minute - Math.floor(at / 60000));
    if (mins < 2) return t("age.now");
    if (mins < 60) return t("age.min", { n: mins });
    if (mins < 60 * 24) return t("age.hour", { n: Math.floor(mins / 60) });
    return t("age.day", { n: Math.floor(mins / 1440) });
  };
  const who = (l: LeadX) => assigneeLabel(t, ops.people, l.assignedTo, meId, ops.status === "ready");
  const whoName = (l: LeadX) => (l.assignedTo ? personLabel(ops.people.get(l.assignedTo)) : "");

  return (
    <div className="lpipe">
      <header className="lpipe-top">
        <div className="lpipe-top__t">
          <h2>{t("title")}</h2>
          <p>{t("lead")}</p>
        </div>
        <div className="lpipe-top__act">
          {cols.length ? (
            <span className="lpipe-views" role="group" aria-label={t("title")} data-ai-target="pipeline:view-toggle">
              <button type="button" aria-pressed={view === "kanban"} onClick={() => setView("kanban")}><IconGrid />{t("viewKanban")}</button>
              <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}><IconDocLines />{t("viewTable")}</button>
            </span>
          ) : null}
          <button className="btn btn--soft btn--sm" type="button" onClick={openAuto} disabled={!cols.length} data-ai-target="button:auto-assign"><IconBolt />{t("auto.btn")}{unassigned.length ? ` · ${unassigned.length}` : ""}</button>
          <button className="btn btn--line btn--sm" type="button" onClick={openAddStatus} data-ai-target="button:add-status"><IconPlus />{t("addStatus")}</button>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setAddOpen(true)} data-ai-target="button:new-lead"><IconPlus />{ta("form.add")}</button>
        </div>
      </header>

      {cols.length ? (
        <section className="lpipe-strip" aria-label={t("kpi.total")} data-ai-target="pipeline:kpis">
          <ol className="lpipe-strip__bar">
            {cols.map((c) => (
              <li key={c.key} style={{ flexGrow: c.count + Math.max(1, total * 0.2), "--c": c.color || "#6b7280" } as CSSProperties}>
                <button type="button" onClick={() => jump(c.key)} aria-pressed={view === "table" ? f.stage === c.key : undefined} title={colName(c)}>
                  <span className="lpipe-strip__n">{c.count}</span>
                  <span className="lpipe-strip__l">{colName(c)}</span>
                </button>
              </li>
            ))}
          </ol>
          <dl className="lpipe-strip__sum">
            <div><dt>{t("kpi.total")}</dt><dd>{total}</dd></div>
            <div><dt>{t("kpi.active")}</dt><dd>{active}</dd></div>
            <div><dt>{t("kpi.won")}</dt><dd>{wonCount}</dd></div>
            <div className="is-conv"><dt>{t("kpi.conv")}</dt><dd>{conv}%</dd></div>
          </dl>
        </section>
      ) : null}

      {cols.length ? (
        <>
          <LeadFilterBar
            className="uf--fold"
            value={f}
            onChange={setF}
            items={filterItems}
            meId={meId}
            regions={regions}
            sources={sources}
            stages={view === "table" ? cols.map((c) => ({ value: c.key, label: colName(c) })) : undefined}
            operators={ops.status === "ready" ? ops.ops : undefined}
            scores
            urgencies={urgencies}
            count={view === "table" ? rows.length : shown}
            aiId="admin.pipeline.filters"
          />
          {ops.status === "forbidden" ? <p className="lpipe-note">{t("assign.opsForbidden")}</p> : null}
        </>
      ) : null}

      {res.status === "loading" ? (
        <div className="lpipe-skel" aria-busy="true">{[0, 1, 2, 3].map((i) => <span key={i} />)}</div>
      ) : res.status === "error" ? (
        <ErrorState error={res.error} onRetry={refresh} />
      ) : !cols.length ? (
        <EmptyState icon={<IconTrendingUp />} title={t("empty")} text={t("emptyText")} />
      ) : view === "kanban" ? (
        <div className="lpipe-board" data-ai-target="pipeline:board" data-ai-label={t("title")}>
          {viewCols.map((col, ci) => (
            <section
              id={`lpipe-col-${col.key}`}
              className={`lpipe-col${overCol === col.key ? " is-over" : ""}`}
              key={col.key}
              aria-label={colName(col)}
              style={{ "--c": col.color || "#6b7280" } as CSSProperties}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropInstant(false); setOverCol(col.key); setOverIndex(col.cards.length); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol((cur) => (cur === col.key ? null : cur)); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) moveTo(dragId, col.key, overIndex); setDragId(null); setDropInstant(true); setOverCol(null); }}
            >
              <header className="lpipe-col__h">
                <i aria-hidden="true" />
                <h3>{colName(col)}</h3>
                <span className="lpipe-col__n">{filtered ? `${col.cards.length}/${col.count}` : col.count}</span>
                <span className="lpipe-col__tools">
                  <button type="button" aria-label={`${t("renameStatus")}: ${colName(col)}`} title={t("renameStatus")} onClick={() => openRenameStatus(col)}>
                    <IconEdit />
                  </button>
                  {!col.isFinal ? (
                    <button type="button" className="is-danger" aria-label={`${t("deleteStatus")}: ${colName(col)}`} title={t("deleteStatus")} onClick={() => openDeleteStatus(col)}>
                      <IconTrash />
                    </button>
                  ) : null}
                </span>
              </header>
              <div className="lpipe-col__body">
                {col.cards.length === 0 ? (
                  <>
                    <div className={`pipe__slot${overCol === col.key && dragId ? " on" : ""}${dropInstant ? " pipe__slot--instant" : ""}`} aria-hidden />
                    <p className="lpipe-col__empty">{filtered ? t("f.noMatch") : t("noneHere")}</p>
                  </>
                ) : (
                  col.cards.map(({ lead: l }, ii) => (
                    <Fragment key={l.id}>
                      {overCol === col.key && dragId && overIndex === ii ? <div className={`pipe__slot on${dropInstant ? " pipe__slot--instant" : ""}`} aria-hidden /> : null}
                      <article
                        className={`lpipe-card${dragId === l.id ? " is-drag" : ""}${busy === l.id ? " is-busy" : ""}`}
                        draggable
                        tabIndex={0}
                        aria-label={nameOf(l)}
                        onClick={() => setSelId(l.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(l.id); } }}
                        onDragStart={(e) => { setDragId(l.id); e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => { setDragId(null); setOverCol(null); }}
                        onDragOver={(e) => {
                          if (!dragId) return;
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = "move";
                          const r = e.currentTarget.getBoundingClientRect();
                          setDropInstant(false);
                          setOverCol(col.key);
                          setOverIndex(e.clientY < r.top + r.height / 2 ? ii : ii + 1);
                        }}
                      >
                        <div className="lpipe-card__top">
                          <b>{nameOf(l)}</b>
                          {l.scoreKey ? <span className={`lpipe-score lpipe-score--${l.scoreKey}`}>{leadScoreLabel(t, l.scoreKey)}</span> : null}
                        </div>
                        {l.phone && l.phone !== nameOf(l) ? <span className="lpipe-card__phone"><IconPhone aria-hidden="true" />{l.phone}</span> : null}
                        {l.category || l.region ? (
                          <span className="lpipe-card__tags">
                            {l.category ? <span>{leadCategoryLabel(t, l.category)}</span> : null}
                            {l.region ? <span><IconMapPin aria-hidden="true" />{leadRegionLabel(te, l.region)}</span> : null}
                          </span>
                        ) : null}
                        {l.note ? <p className="lpipe-card__note">{l.note}</p> : null}
                        <footer className="lpipe-card__f">
                          <span className={`lpipe-who${!l.assignedTo ? " is-none" : l.assignedTo === meId ? " is-me" : ""}`} title={t("assign.title")}>
                            <span className="lpipe-who__av" aria-hidden="true">{whoName(l) ? initials(whoName(l)) : <IconUser />}</span>
                            <span className="lpipe-who__n">{who(l)}</span>
                          </span>
                          <span className="lpipe-card__meta">
                            {l.source ? <span>{leadSourceLabel(t, l.source)}</span> : null}
                            {ageOf(l.createdAt) ? <time dateTime={l.createdAt}>{ageOf(l.createdAt)}</time> : null}
                          </span>
                        </footer>
                        <div className="lpipe-card__mv" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <button type="button" disabled={ci === 0 || busy === l.id} onClick={() => shift(l.id, col.key, -1)} aria-label={t("moveBack")} title={t("moveBack")}><IconChevronLeft /></button>
                          <button type="button" disabled={ci === cols.length - 1 || busy === l.id} onClick={() => shift(l.id, col.key, 1)} aria-label={t("moveFwd")} title={t("moveFwd")}><IconChevronRight /></button>
                        </div>
                      </article>
                    </Fragment>
                  ))
                )}
                {overCol === col.key && dragId && overIndex === col.cards.length && col.cards.length > 0 ? <div className={`pipe__slot on${dropInstant ? " pipe__slot--instant" : ""}`} aria-hidden /> : null}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="lpipe-table" data-ai-target="pipeline:board" data-ai-label={t("title")}>
          {rows.length === 0 ? (
            <EmptyState icon={<IconUsers />} title={filtered ? t("f.noMatch") : t("empty")} text={filtered ? "" : t("emptyText")} />
          ) : (
            rows.map(({ lead: l, colKey }) => (
              <button type="button" className="lpipe-row" key={l.id} onClick={() => setSelId(l.id)} style={{ "--c": colColor(colKey) || "#6b7280" } as CSSProperties}>
                <span className="lpipe-row__stage">{colTitle(colKey)}</span>
                <span className="lpipe-row__m">
                  <b>{nameOf(l)}</b>
                  <small>{[l.phone !== nameOf(l) ? l.phone : "", leadCategoryLabel(t, l.category), leadRegionLabel(te, l.region)].filter(Boolean).join(" · ")}</small>
                </span>
                {l.scoreKey ? <span className={`lpipe-score lpipe-score--${l.scoreKey}`}>{leadScoreLabel(t, l.scoreKey)}</span> : <span />}
                <span className={`lpipe-who${!l.assignedTo ? " is-none" : l.assignedTo === meId ? " is-me" : ""}`}>
                  <span className="lpipe-who__av" aria-hidden="true">{whoName(l) ? initials(whoName(l)) : <IconUser />}</span>
                  <span className="lpipe-who__n">{who(l)}</span>
                </span>
                <time className="lpipe-row__age" dateTime={l.createdAt}>{ageOf(l.createdAt)}</time>
              </button>
            ))
          )}
        </div>
      )}

      {selected ? (
        <LeadDrawer
          lead={selected.lead}
          colKey={selected.colKey}
          columns={cols}
          busy={busy === selected.lead.id}
          ops={ops}
          meId={meId}
          onAssign={(userId) => assign(selected.lead, userId)}
          onMove={(ck) => moveTo(selected.lead.id, ck, 0)}
          onDelete={() => remove(selected.lead.id)}
          onClose={() => setSelId(null)}
        />
      ) : null}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={ta("leads.create")}>
        <AdminForm
          fields={[
            { name: "name", label: ta("leads.name"), required: true },
            { name: "phone", label: ta("leads.phone"), required: true, placeholder: "+998 __ ___ __ __" },
            { name: "category", label: ta("form.category") },
            { name: "region", label: ta("leads.region") },
            { name: "note", label: ta("leads.note"), type: "textarea" },
            {
              name: "assignedOperatorUserId",
              label: ta("leads.operator"),
              type: "select",
              placeholder: ta("leads.operatorAuto"),
              options: ops.ops.map((o) => ({ value: o.id, label: operatorName(o) || t("assign.unknown") })),
            },
          ]}
          onSubmit={async (v) =>
            void (await adminCreateLead({
              name: String(v.name),
              phone: String(v.phone),
              category: String(v.category),
              region: String(v.region),
              note: String(v.note),
              source: "manual",
              assignedOperatorUserId: String(v.assignedOperatorUserId || "") || undefined,
            }))
          }
          submitLabel={ta("form.save")}
          busyLabel={ta("form.saving")}
          okMsg={t("notify.added")}
          errMsg={t("notify.addFailed")}
          onDone={() => { void refresh(); setAddOpen(false); }}
        />
      </Modal>

      {/* Auto-assign unassigned leads to call-center operators */}
      <Modal open={autoOpen} onClose={() => { if (!autoRun) setAutoOpen(false); }} title={t("auto.title")}>
        <div className="lauto">
          <div className="lauto__stats">
            <div className="lauto__stat"><b>{unassigned.length}</b><span>{t("f.unassigned")}</span></div>
            <div className="lauto__stat"><b>{ops.ops.length}</b><span>{t("assign.title")}</span></div>
          </div>
          {ops.status === "loading" ? (
            <Skeleton rows={2} />
          ) : ops.status === "forbidden" ? (
            <Notice ok={false} msg={t("assign.opsForbidden")} />
          ) : ops.status === "error" ? (
            <ErrorState compact error={ops.error} onRetry={ops.retry} title={t("assign.opsError")} />
          ) : !ops.ops.length ? (
            <Notice ok={false} msg={t("auto.noOps")} />
          ) : !unassigned.length ? (
            <Notice ok msg={t("auto.nothing")} />
          ) : (
            <>
              <p className="advmuted" style={{ margin: 0 }}>{t("auto.text", { n: unassigned.length, m: ops.ops.length })}</p>
              <div className="cform" style={{ maxWidth: "none" }}>
                <div>
                  <label>{t("auto.strategy")}</label>
                  <Select
                    value={autoStrategy}
                    onChange={(v) => setAutoStrategy(v === "least_loaded" ? "least_loaded" : "round_robin")}
                    ariaLabel={t("auto.strategy")}
                    options={[
                      { value: "round_robin", label: t("auto.roundRobin") },
                      { value: "least_loaded", label: t("auto.leastLoaded") },
                    ]}
                  />
                </div>
              </div>
              <div>
                <span className="ldrw__lbl">{t("auto.preview")}</span>
                <ul className="lauto__list" style={{ marginTop: 8 }}>
                  {ops.ops.filter((o) => autoPerOp.has(o.id)).map((o) => (
                    <li key={o.id}>
                      <span>{operatorName(o) || t("assign.unknown")}{o.region ? ` · ${leadRegionLabel(te, o.region)}` : ""}</span>
                      <b>+{autoPerOp.get(o.id) ?? 0}</b>
                    </li>
                  ))}
                </ul>
              </div>
              {autoRun ? (
                <div>
                  <p className="advmuted" style={{ marginBottom: 6 }}>{t("auto.running", { done: autoRun.done, total: autoRun.total })}</p>
                  <div className="lauto__bar"><i style={{ width: `${Math.round((autoRun.done / Math.max(1, autoRun.total)) * 100)}%` }} /></div>
                </div>
              ) : null}
            </>
          )}
          <p className="lauto__note">{t("auto.backendPending")}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn--ghost" type="button" onClick={() => setAutoOpen(false)} disabled={!!autoRun}>{ta("form.cancel")}</button>
            <button className="btn btn--pri" type="button" onClick={runAuto} disabled={!!autoRun || ops.status !== "ready" || !ops.ops.length || !unassigned.length}>
              {autoRun ? t("auto.running", { done: autoRun.done, total: autoRun.total }) : t("auto.confirm")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Lost reason before a card lands in a "lost" column */}
      <Modal open={!!lostAsk} onClose={() => setLostAsk(null)} title={t("lost.title")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p className="advmuted">{t("lost.lead")}</p>
          <div>
            <label>{t("lost.reason")}</label>
            <Select value={lostReason} onChange={setLostReason} options={LOST_REASONS.map((r) => ({ value: r, label: t(`lost.reasons.${r}`) }))} ariaLabel={t("lost.reason")} />
          </div>
          <div>
            <label>{t("lost.note")}</label>
            <textarea rows={2} value={lostNote} onChange={(e) => setLostNote(e.target.value)} />
          </div>
          <button className="btn btn--pri btn--full" type="button" onClick={() => { const a = lostAsk; setLostAsk(null); if (a) void moveTo(a.leadId, a.columnKey, a.position, { lost: { reason: lostReason, note: lostNote.trim() } }); setLostNote(""); }}>{t("lost.confirm")}</button>
        </div>
      </Modal>

      {/* Add / rename a status (kanban column) */}
      <Modal open={statusModal !== null} onClose={() => setStatusModal(null)} title={statusModal?.mode === "rename" ? t("renameStatus") : t("addStatus")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <div>
            <label htmlFor={sNameId}>{t("statusName")}</label>
            <input
              id={sNameId}
              value={sName}
              onChange={(e) => { setSName(e.target.value); setSTouched(true); }}
              placeholder={t("statusNamePh")}
              autoFocus
              aria-required
              aria-invalid={sNameErr ? true : undefined}
              aria-describedby={sNameErr ? `${sNameId}-err` : undefined}
            />
            <FieldError id={`${sNameId}-err`} msg={sNameErr} />
          </div>
          <div>
            <label>{t("statusColor")}</label>
            <div className="clrpick">
              {STATUS_COLORS.map((c) => (
                <button key={c} type="button" className={`clrpick__sw${sColor === c ? " on" : ""}`} style={{ background: c }} onClick={() => setSColor(c)} aria-label={c} />
              ))}
              <input type="color" className="clrpick__native" value={sColor} onChange={(e) => setSColor(e.target.value)} aria-label={t("statusColor")} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn--ghost" type="button" onClick={() => setStatusModal(null)}>{ta("form.cancel")}</button>
            <button className="btn btn--pri" type="button" onClick={submitStatus} disabled={sBusy || !sName.trim()}>{sBusy ? ta("form.saving") : ta("form.save")}</button>
          </div>
        </div>
      </Modal>

      {/* Delete a status (column) */}
      <Modal open={delCol !== null} onClose={() => setDelCol(null)} title={t("deleteStatus")}>
        {delCol ? (
          <div className="cform" style={{ maxWidth: "none" }}>
            <p style={{ margin: 0 }}><b>{colName(delCol)}</b></p>
            {delCol.count > 0 ? (
              <div>
                <label>{t("reassignLeads", { count: delCol.count })}</label>
                <Select
                  value={delReassign}
                  onChange={setDelReassign}
                  ariaLabel={t("reassignLeads", { count: delCol.count })}
                  options={cols.filter((c) => c.key !== delCol.key).map((c) => ({ value: c.key, label: colName(c) }))}
                />
              </div>
            ) : (
              <p className="advmuted" style={{ margin: 0 }}>{t("deleteStatusText")}</p>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn--ghost" type="button" onClick={() => setDelCol(null)}>{ta("form.cancel")}</button>
              <button className="btn btn--danger" type="button" onClick={confirmDeleteStatus} disabled={delColBusy || (delCol.count > 0 && !delReassign)}>
                {delColBusy ? ta("form.saving") : delCol.count > 0 ? t("moveAndDelete") : ta("form.delete")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
