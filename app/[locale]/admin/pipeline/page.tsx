"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
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
  isForbiddenErr,
  type AssignStrategy,
  detailsPatch,
  type KanbanColumnX,
  type LeadFilter,
  type LeadFilterable,
  type LeadX,
} from "@/lib/services/leads";
import { operatorName } from "@/lib/services/users";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/toast";
import { ApiError, parseServerTime } from "@/lib/http";
import { formatUzPhone, isValidUzPhone, normUzPhone, uzSubscriber } from "@/lib/phone";
import { REGION_KEYS, initials } from "@/lib/lawyers";
import { fmtDateTime } from "@/lib/date";
import { assigneeLabel, isLostStage, kanbanColumnTitle, leadCategoryLabel, leadRegionLabel, leadSourceInfo, leadStageIcon, personLabel } from "@/lib/leadLabels";
import { assignOptions } from "@/lib/leadOperators";
import { aiId as aiPath } from "@/lib/ai/ids";
import { useResource } from "@/lib/useResource";
import { AdminForm } from "@/components/admin/AdminBits";
import { CountBadge, ScoreChip } from "@/components/ui/Badge";
import IconButton from "@/components/ui/IconButton";
import InlineAlert from "@/components/ui/InlineAlert";
import ListPager, { PAGE_STEP, usePaged } from "@/components/ui/ListPager";
import Menu, { menuSeparator, type MenuEntry } from "@/components/ui/Menu";
import Segmented from "@/components/ui/Segmented";
import { useTabMemory } from "@/components/ui/Tabs";
import Modal from "@/components/admin/Modal";
import LostReasonDialog from "@/components/admin/LostReasonDialog";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import FieldError from "@/components/ui/FieldError";
import ScrollArrows from "@/components/ui/ScrollArrows";
import { useScrollEdges } from "@/lib/useScrollEdges";
import Select from "@/components/Select";
import LeadDrawer from "@/components/admin/LeadDrawer";
import LeadFilterBar from "@/components/admin/LeadFilterBar";
import LeadCard, { leadAgeText, useLeadMinute } from "@/components/admin/leads/LeadCard";
import { leadPhoneText, type LeadStage } from "@/components/admin/leads/LeadMenu";
import StageTabs, { stageTabId, useLeadReveal, usePhoneBoard, useStageTab } from "@/components/admin/leads/StageTabs";
import { useLeadMeeting } from "@/components/admin/leads/useLeadMeeting";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { IconTrendingUp, IconUsers, IconGrid, IconDocLines, IconPlus, IconEdit, IconTrash, IconUser, IconBolt, IconInfo, IconMoreHorizontal } from "@/components/icons";

type Lost = { reason: string; note: string };
type MoveOpts = { lost?: Lost; undo?: boolean };

const VIEWS = ["kanban", "table"] as const;
type View = (typeof VIEWS)[number];
type SortKey = "stage" | "name" | "operator" | "created";
type Sort = { key: SortKey; dir: 1 | -1 };
type Row = { lead: LeadX; colKey: string };
const LEAD_AI = "admin.pipeline.lead";
const TABLE_STEP = 50;

const STATUS_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#6b7280"];
const COLOR_NAMES = ["blue", "violet", "cyan", "green", "amber", "red", "pink", "gray"] as const;
const LEAD_CATEGORIES = ["family", "contract", "court", "criminal", "administrative", "housing", "tax", "labor", "business", "debt", "documents", "general"] as const;
const LOST_BATCH = 6;
const PHONE_PREFIX = /^\s*(?:\+\d{0,3}|998)\s+/;
const PHONE_PARTIAL = /^\s*\+(?:9(?:98?)?)?\s*$/;

function phoneSub(raw: string): string {
  const m = raw.match(PHONE_PREFIX);
  return uzSubscriber(m ? raw.slice(m[0].length).replace(/\D/g, "") : raw);
}

function maskPhone(e: FormEvent<HTMLDivElement>) {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || !el.closest('[data-field="phone"]')) return;
  const raw = el.value;
  if (PHONE_PARTIAL.test(raw)) return;
  const sub = phoneSub(raw);
  const next = sub ? formatUzPhone(`+998${sub}`) : "";
  if (next === raw) return;
  const before = Math.min(sub.length, phoneSub(raw.slice(0, el.selectionStart ?? raw.length)).length);
  el.value = next;
  let pos = next.length;
  if (before < sub.length) {
    pos = 5;
    let seen = 0;
    for (let i = 5; i < next.length && seen < before; i++) {
      if (next[i] >= "0" && next[i] <= "9") {
        seen++;
        pos = i + 1;
      }
    }
  }
  el.setSelectionRange(pos, pos);
}

function phoneKeyboard(box: HTMLDivElement | null) {
  const el = box?.querySelector<HTMLInputElement>('[data-field="phone"] input');
  if (!el) return;
  el.inputMode = "tel";
  el.autocomplete = "tel";
}

const sameColor = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

type SourceTr = Parameters<typeof leadSourceInfo>[0];

function sourceFacet(te: SourceTr, source: string): string {
  const s = leadSourceInfo(te, source);
  return s.known ? s.key : s.key ? "other" : "";
}

function filterableOf(te: SourceTr, lead: LeadX): LeadFilterable {
  return { ...leadFilterable(lead), source: sourceFacet(te, lead.source) };
}

function sidewaysWheel(board: HTMLElement): () => void {
  const host = board.parentElement ?? board;
  const page = board.closest<HTMLElement>(".pbody");
  const onWheel = (e: WheelEvent) => {
    if (e.defaultPrevented || !e.cancelable || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const dy = e.deltaY;
    if (!dy || Math.abs(e.deltaX) >= Math.abs(dy)) return;
    const max = board.scrollWidth - board.clientWidth;
    if (max <= 2) return;
    const list = e.target instanceof Element ? e.target.closest(".lpipe-col__body") : null;
    if (list && board.contains(list) && list.scrollHeight - list.clientHeight > 2) return;
    if (dy > 0 && page && page.scrollTop < page.scrollHeight - page.clientHeight - 1) return;
    const x = board.scrollLeft;
    if ((dy < 0 && x <= 1) || (dy > 0 && x >= max - 1)) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? board.clientWidth : 1;
    board.scrollBy({ left: dy * unit, behavior: "auto" });
  };
  host.addEventListener("wheel", onWheel, { passive: false });
  return () => host.removeEventListener("wheel", onWheel);
}

function followStages(board: HTMLElement, bar: HTMLElement): () => void {
  const cols = Array.from(board.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains("lpipe-col"));
  const tiles = Array.from(bar.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
  const keys = tiles.map((li) => li.dataset.key ?? "");
  const seen = new Set<number>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        const i = keys.indexOf((en.target as HTMLElement).dataset.key ?? "");
        if (i < 0) continue;
        if (en.isIntersecting && en.intersectionRatio >= 0.5) seen.add(i);
        else seen.delete(i);
      }
      tiles.forEach((li, i) => li.toggleAttribute("data-inview", seen.has(i)));
      if (!seen.size || bar.scrollWidth - bar.clientWidth <= 2) return;
      const first = tiles[Math.min(...seen)];
      const last = tiles[Math.max(...seen)];
      if (!first || !last) return;
      const box = bar.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
      const lead = first.getBoundingClientRect().left - (box.left + pad);
      const tail = last.getBoundingClientRect().right - (box.right - pad);
      const by = lead < 0 ? lead - 28 : tail > 0 ? Math.min(tail + 28, lead) : 0;
      if (Math.abs(by) < 2) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      bar.scrollBy({ left: by, behavior: reduce ? "auto" : "smooth" });
    },
    { root: board, threshold: [0, 0.5, 1] },
  );
  cols.forEach((c) => io.observe(c));
  return () => {
    io.disconnect();
    tiles.forEach((li) => li.removeAttribute("data-inview"));
  };
}

function ColList({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollEdges(ref, { silent: true });
  return (
    <div ref={ref} className="lpipe-col__body scue-y">
      {children}
    </div>
  );
}

export default function AdminPipeline() {
  const t = useTranslations("admin.pipeline");
  const tStages = useTranslations("admin.callCenter.queue");
  const te = useTranslations("enums");
  const colName = (c: { key: string; title: string }) => kanbanColumnTitle(tStages, c);
  const ta = useTranslations("admin");
  const tl = useTranslations("admin.leadCard");
  const tc = useTranslations("common");
  const tn = useTranslations("common.notify");
  const tm = useTranslations("common.modal");
  const locale = useLocale();
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
  const lostRef = useRef<(leadId: string, columnKey: string, position: number, lost: Lost) => Promise<boolean>>(async () => false);
  const lostInflight = useRef(false);
  // Lost reason is asked before the card lands in a "lost" column (T4-02 §7).
  const [lostAsk, setLostAsk] = useState<{ leadId: string; columnKey: string; position: number } | null>(null);
  const [lostSaving, setLostSaving] = useState(false);
  const [addDirty, setAddDirty] = useState(false);
  const [viewPick, pickView] = useTabMemory<View>("view:pipeline", VIEWS, "kanban");
  const view: View = viewPick ?? "kanban";
  const phone = usePhoneBoard();
  const meeting = useLeadMeeting();
  const [sort, setSort] = useState<Sort>({ key: "created", dir: -1 });
  const [rateHelp, setRateHelp] = useState(false);
  const rateId = useId();
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
  const minute = useLeadMinute();
  const boardRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLOListElement>(null);
  const boardEdges = useScrollEdges(boardRef);
  const stripEdges = useScrollEdges(stripRef);

  // Add / rename a kanban status (column).
  const [statusModal, setStatusModal] = useState<{ mode: "add" | "rename"; col?: KanbanColumnX; name0: string; color0: string; focus?: "color" } | null>(null);
  const [sName, setSName] = useState("");
  const [sColor, setSColor] = useState("#2563eb");
  const [sBusy, setSBusy] = useState(false);
  const [sTouched, setSTouched] = useState(false);
  const sNameId = useId();
  const sColorId = useId();
  const sNameErr = sTouched && !sName.trim() ? tc("required") : "";

  // Delete a status (column), reassigning its leads if any.
  const [delCol, setDelCol] = useState<KanbanColumnX | null>(null);
  const [delReassign, setDelReassign] = useState("");
  const [delColBusy, setDelColBusy] = useState(false);
  const [delLost, setDelLost] = useState(false);
  const delTargetId = useId();

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
  const opLoad = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of allLeads) if (l.assignedTo) m.set(l.assignedTo, (m.get(l.assignedTo) ?? 0) + 1);
    return m;
  }, [allLeads]);
  const selected = allCards.find((x) => x.lead.id === selId) || null;
  const colTitle = (k: string) => {
    const c = cols.find((x) => x.key === k);
    return c ? colName(c) : k;
  };
  const colColor = (k: string) => cols.find((c) => c.key === k)?.color || "";
  const orderOf = (k: string) => cols.findIndex((c) => c.key === k);
  const nameOf = (l: LeadX) => l.name || l.phone || leadCategoryLabel(t, l.category) || t("untitledLead");
  const opLabel = (id: string) => (id ? personLabel(ops.people.get(id)) || assigneeLabel(t, ops.people, id, meId, ops.status === "ready") : "");

  // Filters (client-side over the loaded board).
  const [f, setF] = useState<LeadFilter>(EMPTY_LEAD_FILTER);
  const filterItems = useMemo(() => allCards.map((x) => ({ lead: filterableOf(te, x.lead), stage: x.colKey })), [allCards, te]);
  const sources = useMemo(
    () => [...new Set(allLeads.map((l) => sourceFacet(te, l.source)).filter(Boolean))].sort((a, b) => Number(a === "other") - Number(b === "other")),
    [allLeads, te],
  );
  const regions = useMemo(() => [...new Set(allLeads.map((l) => l.region).filter(Boolean))], [allLeads]);
  const urgencies = useMemo(() => [...new Set(allLeads.map((l) => l.urgency.trim().toLowerCase()).filter(Boolean))], [allLeads]);
  const viewCols = useMemo(() => cols.map((c) => ({ ...c, cards: c.cards.filter((x) => leadMatches(filterableOf(te, x.lead), f, meId)) })), [cols, f, meId, te]);
  const filtered = filterActive(f);
  const narrowed = filterActive({ ...f, stage: "" });
  const stageOn = !!f.stage && viewCols.some((c) => c.key === f.stage);
  const boardCols = stageOn ? viewCols.filter((c) => c.key === f.stage) : viewCols;
  const boardOn = res.status === "ready" && cols.length > 0 && view === "kanban" && !phone;
  const colKeys = boardCols.map((c) => c.key).join("|");
  const shown = boardCols.reduce((n, c) => n + c.cards.length, 0);
  const rows: Row[] = view === "table" ? allCards.filter((x) => leadMatches(filterableOf(te, x.lead), f, meId) && (!f.stage || x.colKey === f.stage)) : [];
  const fsig = Object.values(f).join("|");

  // KPI (from the full board, not the filtered view).
  const finalTotal = cols.filter((c) => c.isFinal).reduce((n, c) => n + c.count, 0);
  const wonCount = (cols.find((c) => c.key === "won") ?? cols.find((c) => c.isFinal && c.key !== "duplicate" && !isLostStage(c.key, cols)))?.count ?? 0;
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
  async function markLost(leadId: string, columnKey: string, position: number, lost: Lost): Promise<boolean> {
    const lead = allLeads.find((l) => l.id === leadId);
    if (!lead) {
      setLostAsk(null);
      return false;
    }
    if (lostInflight.current) return false;
    lostInflight.current = true;
    setLostSaving(true);
    const failId = `lead-move:${leadId}`;
    try {
      await adminUpdateLead(leadId, { details: detailsPatch(lead.details ?? {}, { lost_reason: lost.reason, lost_note: lost.note, lost_at: new Date().toISOString() }) });
    } catch (e) {
      notify.error(t("notify.lostFailed"), { id: failId, error: e, action: { label: tn("retry"), onClick: () => void lostRef.current(leadId, columnKey, position, lost) } });
      return false;
    } finally {
      lostInflight.current = false;
      setLostSaving(false);
    }
    notify.dismiss(failId);
    setLostAsk((cur) => (cur?.leadId === leadId ? null : cur));
    void moveRef.current(leadId, columnKey, position, { lost });
    return true;
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
  async function assignFromCard(lead: LeadX, userId: string) {
    if (userId === lead.assignedTo) return;
    const prev = lead.assignedTo;
    const failId = `lead-assign:${lead.id}`;
    try {
      await assign(lead, userId);
      notify.dismiss(failId);
      notify.success(userId ? t("notify.assigned") : t("notify.unassigned"), { id: "lead-assign", body: [nameOf(lead), opLabel(userId || prev)].filter(Boolean).join(" · ") });
    } catch (e) {
      notify.error(userId ? t("notify.assignFailed") : t("notify.unassignFailed"), {
        id: failId,
        error: e,
        map: { 403: t("assign.noPermission") },
        action: isForbiddenErr(e) ? undefined : { label: tn("retry"), onClick: () => void assignFromCard(lead, userId) },
      });
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
    setStatusModal({ mode: "add", name0: "", color0: STATUS_COLORS[0] });
  }
  function openRenameStatus(col: KanbanColumnX, focus?: "color") {
    const name0 = colName(col);
    const color0 = col.color || "#6b7280";
    setSName(name0);
    setSColor(color0);
    setSTouched(false);
    setStatusModal({ mode: "rename", col, name0, color0, focus });
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
    if (!name) setSTouched(true);
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
  const delTargets = (col: KanbanColumnX) => cols.filter((c) => c.key !== col.key && (!c.isFinal || isLostStage(c.key, cols)));
  function openDeleteStatus(shownCol: KanbanColumnX) {
    const col = cols.find((c) => c.key === shownCol.key) ?? shownCol;
    setDelCol(col);
    setDelLost(false);
    // Default reassignment target: the first other column.
    const targets = delTargets(col);
    setDelReassign((targets.find((c) => !isLostStage(c.key, cols)) ?? targets[0])?.key ?? "");
  }
  async function saveLostAll(cards: KanbanColumnX["cards"], lost: Lost): Promise<boolean> {
    const at = new Date().toISOString();
    for (let i = 0; i < cards.length; i += LOST_BATCH) {
      const part = await Promise.allSettled(
        cards.slice(i, i + LOST_BATCH).map((x) => adminUpdateLead(x.lead.id, { details: detailsPatch(x.lead.details ?? {}, { lost_reason: lost.reason, lost_note: lost.note, lost_at: at }) })),
      );
      const bad = part.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (bad) {
        notify.error(t("notify.lostFailed"), { id: "lead-stage-lost", error: bad.reason });
        return false;
      }
    }
    notify.dismiss("lead-stage-lost");
    return true;
  }
  async function confirmDeleteStatus(lost?: Lost) {
    if (!delCol || delColBusy) return;
    const col = delCol;
    const target = col.count > 0 ? cols.find((c) => c.key === delReassign) : undefined;
    if (target && !lost && isLostStage(target.key, cols)) {
      setDelLost(true);
      return;
    }
    setDelColBusy(true);
    try {
      if (target && lost) {
        if (!(await saveLostAll(col.cards, lost))) return;
        setDelLost(false);
      }
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
  async function remove(leadId: string) {
    const lead = allLeads.find((l) => l.id === leadId);
    const name = lead ? nameOf(lead) : t("untitledLead");
    const failId = `lead-delete:${leadId}`;
    await confirmDialog({
      tone: "danger",
      title: t("notify.deleteAsk", { name }),
      text: ta("form.deleteConfirmText"),
      confirmLabel: ta("form.delete"),
      busyLabel: t("d.deleting"),
      onConfirm: async () => {
        setBusy(leadId);
        try {
          await adminDeleteLead(leadId);
        } catch (e) {
          notify.error(t("notify.deleteFailed"), { id: failId, error: e });
          return false;
        } finally {
          setBusy(null);
        }
        setSelId((cur) => (cur === leadId ? null : cur));
        res.setData((cur) => cur.map((c) => (c.cards.some((x) => x.lead.id === leadId) ? { ...c, count: Math.max(0, c.count - 1), cards: c.cards.filter((x) => x.lead.id !== leadId) } : c)));
        void refresh();
        notify.dismiss(failId);
        notify.success(t("notify.deleted"), { body: name });
        return true;
      },
    });
  }

  useEffect(() => {
    moveRef.current = moveTo;
    autoRef.current = runAuto;
    lostRef.current = markLost;
  });

  useEffect(() => {
    const board = boardRef.current;
    if (!boardOn || !board) return;
    return sidewaysWheel(board);
  }, [boardOn]);

  useEffect(() => {
    const board = boardRef.current;
    const bar = stripRef.current;
    if (!boardOn || !board || !bar || !colKeys || typeof IntersectionObserver === "undefined") return;
    return followStages(board, bar);
  }, [boardOn, colKeys]);

  // Auto-assign preview (only while the modal is open — the plan is pure).
  const autoPlan = autoOpen ? autoAssign(allLeads, ops.ops, autoStrategy) : [];
  const autoPerOp = autoPlan.reduce<Map<string, number>>((m, a) => m.set(a.operator.id, (m.get(a.operator.id) ?? 0) + 1), new Map());
  const autoOps = ops.ops.filter((o) => autoPerOp.has(o.id)).sort((a, b) => (autoPerOp.get(b.id) ?? 0) - (autoPerOp.get(a.id) ?? 0));
  const autoRestLeads = autoOps.slice(5).reduce((n, o) => n + (autoPerOp.get(o.id) ?? 0), 0);
  const autoReady = ops.status === "ready" && ops.ops.length > 0 && unassigned.length > 0;

  const closeAdd = () => {
    setAddOpen(false);
    setAddDirty(false);
  };
  const cancelAdd = async () => {
    if (addDirty && !(await confirmDialog({ tone: "danger", title: tm("discardTitle"), text: tm("discardText"), confirmLabel: tm("discardConfirm"), cancelLabel: tm("discardCancel") }))) return;
    closeAdd();
  };
  const lostLead = lostAsk ? allLeads.find((l) => l.id === lostAsk.leadId) : undefined;
  const delOptions = delCol ? delTargets(delCol) : [];
  const delToLost = !!delCol && delCol.count > 0 && !!delReassign && isLostStage(delReassign, cols);
  const swatches = STATUS_COLORS.map((hex, i) => ({ hex, name: t(`colors.${COLOR_NAMES[i]}`) }));
  const palette = statusModal && !STATUS_COLORS.some((c) => sameColor(c, statusModal.color0)) ? [{ hex: statusModal.color0, name: t("colors.current") }, ...swatches] : swatches;
  const pickedColor = palette.find((c) => sameColor(c.hex, sColor));
  const statusDirty = !!statusModal && (sName !== statusModal.name0 || !sameColor(sColor, statusModal.color0));

  const createdOf = (iso: string) => {
    const at = parseServerTime(iso);
    return Number.isFinite(at) ? fmtDateTime(at, locale) : "";
  };
  const ageOf = (iso: string) => leadAgeText(iso, minute, locale, t);
  const who = (l: LeadX) => assigneeLabel(t, ops.people, l.assignedTo, meId, ops.status === "ready");
  const whoName = (l: LeadX) => (l.assignedTo ? personLabel(ops.people.get(l.assignedTo)) : "");
  const createdMs = (l: LeadX) => {
    const at = parseServerTime(l.createdAt);
    return Number.isFinite(at) ? at : 0;
  };

  const compareRows = (a: Row, b: Row): number => {
    if (sort.key === "stage") return orderOf(a.colKey) - orderOf(b.colKey);
    if (sort.key === "name") return nameOf(a.lead).localeCompare(nameOf(b.lead), locale);
    if (sort.key === "operator") {
      const x = a.lead.assignedTo ? who(a.lead) : "";
      const y = b.lead.assignedTo ? who(b.lead) : "";
      if (!x || !y) return (x ? -1 : y ? 1 : 0) * sort.dir;
      return x.localeCompare(y, locale);
    }
    return createdMs(a.lead) - createdMs(b.lead);
  };
  const sortedRows = rows.slice().sort((a, b) => compareRows(a, b) * sort.dir || createdMs(b.lead) - createdMs(a.lead));
  const tablePager = usePaged(sortedRows, phone ? PAGE_STEP : TABLE_STEP, `${sort.key}|${sort.dir}|${fsig}|${phone ? "p" : "d"}`);
  const sortBy = (key: SortKey) => setSort((cur) => ({ key, dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : key === "created" ? -1 : 1 }));

  const stageTabs = boardCols.map((c) => ({ key: c.key, label: colName(c), count: narrowed ? c.cards.length : c.count }));
  const [stageKey, setStageKey] = useStageTab("pipeline", stageTabs);
  const phoneCol = boardCols.find((c) => c.key === stageKey) ?? boardCols[0];
  const pageKey = (k: string) => `${k}|${fsig}`;
  const phonePager = usePaged(phoneCol?.cards ?? [], PAGE_STEP, pageKey(phoneCol?.key ?? ""));
  const tableOn = new Set(tablePager.visible.map((x) => x.lead.id));
  const phoneOn = new Set(phonePager.visible.map((x) => x.lead.id));
  const hiddenLeads =
    res.status !== "ready"
      ? []
      : view === "table"
        ? sortedRows.filter((x) => !tableOn.has(x.lead.id)).map((x) => x.lead.id)
        : phone
          ? boardCols.flatMap((c) => c.cards).filter((x) => !phoneOn.has(x.lead.id)).map((x) => x.lead.id)
          : [];
  useLeadReveal(LEAD_AI, hiddenLeads, (id) => {
    if (view === "table") {
      tablePager.revealIndex(sortedRows.findIndex((x) => x.lead.id === id));
      return;
    }
    const col = boardCols.find((c) => c.cards.some((x) => x.lead.id === id));
    if (!col) return;
    setStageKey(col.key);
    phonePager.revealIndex(col.cards.findIndex((x) => x.lead.id === id), pageKey(col.key));
  });

  const stageList: LeadStage[] = cols.map((c) => ({ key: c.key, label: colName(c), color: c.color || undefined, lost: isLostStage(c.key, cols) }));
  const openLead = (l: LeadX) => setSelId(l.id);
  const moveFromMenu = (l: LeadX, key: string) => {
    void moveTo(l.id, key, 0);
    window.requestAnimationFrame(() => {
      const at = document.activeElement;
      if (at && at !== document.body) return;
      document.querySelector<HTMLElement>(`.ldc[data-lead="${CSS.escape(l.id)}"]`)?.focus({ preventScroll: true });
    });
  };
  const lostFromMenu = (l: LeadX, key: string) => setLostAsk({ leadId: l.id, columnKey: key, position: 0 });
  const assignFromMenu = (l: LeadX, userId: string) => void assignFromCard(l, userId);
  const removeFromMenu = (l: LeadX) => void remove(l.id);
  const canAssignCards = ops.status === "forbidden" ? t("assign.opsForbidden") : true;
  const cardProps = (l: LeadX, colKey: string) => ({
    lead: l,
    stage: colKey,
    stages: stageList,
    ops,
    load: opLoad,
    meId,
    busy: busy === l.id,
    onOpen: openLead,
    onMove: moveFromMenu,
    onLost: lostFromMenu,
    onAssign: assignFromMenu,
    canAssign: canAssignCards,
    onDelete: removeFromMenu,
    onVideo: meeting.start,
    canVideo: meeting.can(l),
    aiId: aiPath(LEAD_AI, l.id),
  });

  const jump = (key: string) => {
    if (view === "table" || stageOn) {
      setF((cur) => ({ ...cur, stage: cur.stage === key ? "" : key }));
      return;
    }
    document.getElementById(`lpipe-col-${key}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };
  const pressedOf = (key: string) => (view === "table" || stageOn ? f.stage === key : undefined);

  const unassignedN = unassigned.length;
  const manageLabel = unassignedN ? t("manageCount", { n: unassignedN }) : t("manage");
  const manageItems: MenuEntry[] = [
    { key: "add-stage", label: t("addStatus"), icon: <IconPlus />, onSelect: openAddStatus, aiId: "admin.pipeline.manage.add-stage" },
    {
      key: "auto",
      label: t("auto.btn"),
      icon: <IconBolt />,
      hint: unassignedN ? t("auto.badge", { n: unassignedN }) : undefined,
      disabled: res.status !== "ready" ? true : cols.length ? false : t("auto.nothing"),
      onSelect: openAuto,
      aiId: "admin.pipeline.manage.auto",
    },
  ];

  const colMenu = (col: KanbanColumnX, size: "sm" | "md") => {
    const base = aiPath("admin.pipeline.column", col.key);
    return (
      <Menu
        label={`${colName(col)}: ${t("col.menu")}`}
        title={colName(col)}
        size={size}
        align="end"
        tipSide="bottom"
        tipAlign="end"
        triggerClassName="lpipe-col__more"
        aiId={`${base}.menu`}
        items={[
          { key: "rename", label: t("col.rename"), icon: <IconEdit />, onSelect: () => openRenameStatus(col), aiId: `${base}.rename` },
          { key: "color", label: t("col.color"), icon: <i className="umenu__dot" style={{ "--c": col.color || "#6b7280" } as CSSProperties} />, onSelect: () => openRenameStatus(col, "color"), aiId: `${base}.color` },
          menuSeparator("sep"),
          { key: "delete", label: t("col.delete"), icon: <IconTrash />, danger: true, disabled: col.isFinal ? t("col.finalReason") : false, onSelect: () => openDeleteStatus(col), aiId: `${base}.delete` },
        ]}
      />
    );
  };

  const whoNode = (l: LeadX) => (
    <span className={`lpipe-who${!l.assignedTo ? " is-none" : l.assignedTo === meId ? " is-me" : ""}`}>
      <span className="lpipe-who__av" aria-hidden="true">{whoName(l) ? initials(whoName(l)) : <IconUser />}</span>
      <span className="lpipe-who__n">{who(l)}</span>
    </span>
  );

  const sortHead = (key: SortKey, label: string) => {
    const on = sort.key === key;
    return (
      <th scope="col" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" className="lpipe-tbl__sort" onClick={() => sortBy(key)} data-ai-id={`admin.pipeline.table.sort.${key}`} data-ai-type="button" data-ai-label={label}>
          {label}
          <span className="lpipe-tbl__sic" aria-hidden="true">{on ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  };

  const summary = (
    <div className="lpipe-sum" data-ai-id="admin.pipeline.summary" data-ai-type="section" data-ai-target="pipeline:kpis">
      <span className="lpipe-sum__t">{t.rich("sum.line", { n: total, active, rate: conv, b: (chunks) => <b>{chunks}</b> })}</span>
      <IconButton
        label={t("sum.rateInfo")}
        tip={t("sum.rateHint")}
        tipSide="bottom"
        icon={<IconInfo />}
        size="sm"
        className="lpipe-sum__i"
        aria-expanded={rateHelp}
        aria-controls={rateHelp ? rateId : undefined}
        onClick={() => setRateHelp((v) => !v)}
      />
      {rateHelp ? (
        <span id={rateId} className="lpipe-sum__help">
          {t("sum.rateHelp", { won: wonCount, total })}
        </span>
      ) : null}
    </div>
  );

  const viewToggle = (
    <Segmented
      className="lpipe-view"
      look="soft"
      value={view}
      onChange={pickView}
      label={t("view")}
      aiId="admin.pipeline.view"
      aiTarget="pipeline:view-toggle"
      options={[
        { value: "kanban", label: phone ? <span className="sr-only">{t("viewKanban")}</span> : t("viewKanban"), icon: <IconGrid />, aiId: "admin.pipeline.view.kanban", aiLabel: t("viewKanban") },
        { value: "table", label: phone ? <span className="sr-only">{t("viewTable")}</span> : t("viewTable"), icon: <IconDocLines />, aiId: "admin.pipeline.view.table", aiLabel: t("viewTable") },
      ]}
    />
  );

  const strip = phone ? null : (
    <section className="lpipe-strip" aria-label={tl("stages")}>
      <div className="lpipe-strip__nav sarr-host">
        <ol ref={stripRef} className="lpipe-strip__bar scue-x">
          {cols.map((c) => {
            const icon = leadStageIcon(c.key);
            return (
              <li key={c.key} data-key={c.key} style={{ "--c": c.color || "#6b7280" } as CSSProperties}>
                <button type="button" onClick={() => jump(c.key)} aria-pressed={pressedOf(c.key)}>
                  {icon ? <Image className="lpipe-strip__ic" src={icon} alt="" width={20} height={20} /> : null}
                  <span className="lpipe-strip__n">{c.count}</span>
                  <span className="lpipe-strip__l">{colName(c)}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <ScrollArrows target={stripRef} edges={stripEdges} />
      </div>
    </section>
  );

  return (
    <div className="lpipe">
      <header className="lpipe-top">
        <div className="lpipe-top__t">
          <p>{t("lead")}</p>
          {!phone && cols.length ? summary : null}
        </div>
        <div className="lpipe-top__act">
          <button className="btn btn--pri btn--sm lpipe-add" type="button" onClick={() => setAddOpen(true)} data-ai-target="button:new-lead">
            <IconPlus />
            {ta("leads.create")}
          </button>
          <Menu
            items={manageItems}
            label={t("manage")}
            triggerLabel={phone || unassignedN ? manageLabel : undefined}
            text={
              phone ? undefined : (
                <>
                  <IconMoreHorizontal aria-hidden="true" />
                  <span>{t("manage")}</span>
                  {unassignedN ? <CountBadge n={unassignedN} label={String(unassignedN)} tone="info" className="lpipe-mgr__n" /> : null}
                </>
              )
            }
            icon={
              phone ? (
                <span className="lpipe-mgr__ic">
                  <IconMoreHorizontal />
                  {unassignedN ? <b className="lpipe-mgr__dot">{unassignedN}</b> : null}
                </span>
              ) : undefined
            }
            caret={false}
            variant="line"
            align="end"
            tipAlign="end"
            triggerClassName={phone ? "lpipe-mgr" : "btn btn--line btn--sm lpipe-mgr"}
            aiId="admin.pipeline.manage"
            aiLabel={t("manage")}
          />
        </div>
      </header>

      {cols.length ? (
        <>
          <div className="lpipe-tools">
            <LeadFilterBar
              className="uf--fold"
              value={f}
              onChange={setF}
              items={filterItems}
              meId={meId}
              regions={regions}
              sources={sources}
              stages={cols.map((c) => ({ value: c.key, label: colName(c) }))}
              operators={ops.status === "ready" ? ops.ops : undefined}
              scores
              urgencies={urgencies}
              count={view === "table" ? rows.length : shown}
              aiId="admin.pipeline.filters"
            />
            {strip}
            {phone ? null : viewToggle}
          </div>
          {phone ? (
            <div className="lpipe-meta">
              {summary}
              {viewToggle}
            </div>
          ) : null}
          {ops.status === "forbidden" ? <InlineAlert tone="locked" compact className="lpipe-lock">{t("assign.opsForbidden")}</InlineAlert> : null}
        </>
      ) : null}

      {res.status === "loading" ? (
        <div className="lpipe-skel" aria-busy="true">{[0, 1, 2, 3].map((i) => <span key={i} />)}</div>
      ) : res.status === "error" ? (
        <ErrorState error={res.error} onRetry={refresh} />
      ) : !cols.length ? (
        <EmptyState icon={<IconTrendingUp />} title={t("empty")} text={t("emptyText")} />
      ) : view === "table" ? (
        <div className={`lpipe-table${phone ? " lpipe-table--ph" : ""}`} data-ai-target="pipeline:board" data-ai-label={t("title")}>
          {sortedRows.length === 0 ? (
            <EmptyState icon={<IconUsers />} title={filtered ? t("f.noMatch") : t("empty")} text={filtered ? "" : t("emptyText")} />
          ) : phone ? (
            <ul className="lpipe-mrows">
              {tablePager.visible.map(({ lead: l, colKey }) => {
                const age = ageOf(l.createdAt);
                return (
                  <li key={l.id} style={{ "--c": colColor(colKey) || "#6b7280" } as CSSProperties}>
                    <button
                      type="button"
                      className="lpipe-mrow"
                      onClick={() => setSelId(l.id)}
                      data-ai-id={aiPath(LEAD_AI, l.id)}
                      data-ai-type="list_item"
                      data-ai-label={nameOf(l)}
                      data-ai-entity-type="lead"
                      data-ai-entity-id={l.id}
                    >
                      <span className="lpipe-mrow__top">
                        <span className="lpipe-stg">{colTitle(colKey)}</span>
                        <b className="lpipe-mrow__n">{nameOf(l)}</b>
                        <ScoreChip score={l.scoreKey} />
                      </span>
                      <span className="lpipe-mrow__ft">
                        {whoNode(l)}
                        {age ? (
                          <time className="lpipe-mrow__age" dateTime={l.createdAt}>
                            {age}
                          </time>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <table className="lpipe-tbl" aria-label={t("title")}>
              <colgroup>
                <col className="lpipe-tbl__c-stage" />
                <col />
                <col className="lpipe-tbl__c-score" />
                <col className="lpipe-tbl__c-op" />
                <col className="lpipe-tbl__c-age" />
              </colgroup>
              <thead>
                <tr>
                  {sortHead("stage", t("d.stage"))}
                  {sortHead("name", t("table.client"))}
                  <th scope="col">{t("table.score")}</th>
                  {sortHead("operator", t("assign.title"))}
                  {sortHead("created", t("d.created"))}
                </tr>
              </thead>
              <tbody>
                {tablePager.visible.map(({ lead: l, colKey }) => {
                  const age = ageOf(l.createdAt);
                  return (
                    <tr key={l.id} style={{ "--c": colColor(colKey) || "#6b7280" } as CSSProperties}>
                      <td>
                        <span className="lpipe-stg">{colTitle(colKey)}</span>
                      </td>
                      <th scope="row">
                        <button
                          type="button"
                          className="lpipe-tbl__open"
                          onClick={() => setSelId(l.id)}
                          data-ai-id={aiPath(LEAD_AI, l.id)}
                          data-ai-type="list_item"
                          data-ai-label={nameOf(l)}
                          data-ai-entity-type="lead"
                          data-ai-entity-id={l.id}
                        >
                          {nameOf(l)}
                        </button>
                        {l.phone && l.phone !== nameOf(l) ? <small>{leadPhoneText(l.phone)}</small> : null}
                      </th>
                      <td>{l.scoreKey ? <ScoreChip score={l.scoreKey} /> : null}</td>
                      <td>{whoNode(l)}</td>
                      <td>
                        {age ? (
                          <time dateTime={l.createdAt} title={createdOf(l.createdAt) || undefined}>
                            {age}
                          </time>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <ListPager {...tablePager.bind} aiId="admin.pipeline.table.more" />
        </div>
      ) : phone ? (
        phoneCol ? (
          <div className="lpipe-ph" data-ai-target="pipeline:board" data-ai-label={t("title")}>
            <div className="lpipe-ph__tabs">
              <StageTabs stages={stageTabs} value={phoneCol.key} onChange={setStageKey} idPrefix="lpst" controls="lpst-list" aiId="admin.pipeline.stages" />
              {colMenu(phoneCol, "md")}
            </div>
            <div id="lpst-list" role="tabpanel" aria-labelledby={stageTabId("lpst", phoneCol.key)} className="ldc-list">
              {phonePager.visible.length ? (
                phonePager.visible.map(({ lead: l }) => <LeadCard key={l.id} {...cardProps(l, phoneCol.key)} />)
              ) : (
                <p className="lpipe-col__empty">{narrowed ? t("f.noMatch") : t("noneHere")}</p>
              )}
            </div>
            <ListPager {...phonePager.bind} aiId="admin.pipeline.more" />
          </div>
        ) : null
      ) : (
        <div className="lpipe-boardhost sarr-host">
          <div ref={boardRef} className={`lpipe-board scue-x${stageOn ? " is-one" : ""}`} data-ai-target="pipeline:board" data-ai-label={t("title")}>
            {boardCols.map((col) => (
              <section
                id={`lpipe-col-${col.key}`}
                data-key={col.key}
                className={`lpipe-col${overCol === col.key ? " is-over" : ""}${stageOn ? " is-hit" : ""}`}
                key={col.key}
                aria-label={colName(col)}
                style={{ "--c": col.color || "#6b7280" } as CSSProperties}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overCol === col.key && e.target instanceof Element && e.target.closest(".pipe__slot")) return;
                  setDropInstant(false);
                  setOverCol(col.key);
                  setOverIndex(col.cards.length);
                }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol((cur) => (cur === col.key ? null : cur)); }}
                onDrop={(e) => { e.preventDefault(); if (dragId) moveTo(dragId, col.key, overIndex); setDragId(null); setDropInstant(true); setOverCol(null); }}
              >
                <header className="lpipe-col__h">
                  <span className="lpipe-col__dot" aria-hidden="true" />
                  <h3>{colName(col)}</h3>
                  <span className="lpipe-col__n">{narrowed ? `${col.cards.length}/${col.count}` : col.count}</span>
                  {colMenu(col, "sm")}
                </header>
                <ColList>
                  {col.cards.length === 0 ? (
                    <>
                      <div className={`pipe__slot${overCol === col.key && dragId ? " on" : ""}${dropInstant ? " pipe__slot--instant" : ""}`} aria-hidden />
                      <p className="lpipe-col__empty">{narrowed ? t("f.noMatch") : t("noneHere")}</p>
                    </>
                  ) : (
                    col.cards.map(({ lead: l }, ii) => (
                      <Fragment key={l.id}>
                        {overCol === col.key && dragId && overIndex === ii ? <div className={`pipe__slot on${dropInstant ? " pipe__slot--instant" : ""}`} aria-hidden /> : null}
                        <LeadCard
                          {...cardProps(l, col.key)}
                          draggable
                          dragging={dragId === l.id}
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
                        />
                      </Fragment>
                    ))
                  )}
                  {overCol === col.key && dragId && overIndex === col.cards.length && col.cards.length > 0 ? <div className={`pipe__slot on${dropInstant ? " pipe__slot--instant" : ""}`} aria-hidden /> : null}
                </ColList>
              </section>
            ))}
          </div>
          <ScrollArrows target={boardRef} edges={boardEdges} />
        </div>
      )}

      {selected ? (
        <LeadDrawer
          lead={selected.lead}
          colKey={selected.colKey}
          columns={cols}
          busy={busy === selected.lead.id}
          ops={ops}
          load={opLoad}
          meId={meId}
          onAssign={(userId) => assign(selected.lead, userId)}
          onMove={(ck) => moveTo(selected.lead.id, ck, 0)}
          onDelete={() => remove(selected.lead.id)}
          onVideo={() => meeting.start(selected.lead)}
          canVideo={meeting.can(selected.lead)}
          videoBusy={meeting.busyId === selected.lead.id}
          onClose={() => setSelId(null)}
        />
      ) : null}
      {meeting.node}

      <Modal open={addOpen} onClose={closeAdd} title={ta("leads.create")} size="lg" dirty={addDirty}>
        <div className="lpadd" ref={phoneKeyboard} onChangeCapture={maskPhone}>
          <AdminForm
            fields={[
              { name: "name", label: ta("leads.name"), required: true },
              { name: "phone", label: ta("leads.phone"), required: true, placeholder: "+998 __ ___ __ __" },
              {
                name: "category",
                label: t("d.category"),
                type: "select",
                options: [{ value: "", label: t("add.notSet") }, ...LEAD_CATEGORIES.map((k) => ({ value: k, label: leadCategoryLabel(t, k) }))],
              },
              {
                name: "region",
                label: t("d.region"),
                type: "select",
                options: [{ value: "", label: t("add.notSet") }, ...REGION_KEYS.map((k) => ({ value: k, label: leadRegionLabel(te, k) }))],
              },
              {
                name: "assignedOperatorUserId",
                label: ta("leads.operator"),
                type: "select",
                options: [
                  { value: "", label: ta("leads.operatorAuto") },
                  ...assignOptions(ops.ops, opLoad, { unknown: t("assign.unknown"), count: (n) => t("assign.leadCount", { n }), idle: tl("idle"), me: t("assign.me") }, meId),
                ],
              },
              { name: "note", label: ta("leads.note"), type: "textarea" },
            ]}
            onSubmit={async (v) => {
              const phone = String(v.phone ?? "");
              if (!isValidUzPhone(phone)) {
                const msg = t("add.phoneInvalid");
                throw new ApiError(422, msg, undefined, { fieldErrors: { phone: msg } });
              }
              await adminCreateLead({
                name: String(v.name).trim(),
                phone: normUzPhone(phone),
                category: String(v.category),
                region: String(v.region),
                note: String(v.note).trim(),
                source: "manual",
                assignedOperatorUserId: String(v.assignedOperatorUserId || "") || undefined,
              });
            }}
            submitLabel={ta("leads.create")}
            busyLabel={ta("form.saving")}
            okMsg={t("notify.added")}
            errMsg={t("notify.addFailed")}
            onDone={() => { void refresh(); closeAdd(); }}
            onCancel={() => void cancelAdd()}
            onDirtyChange={setAddDirty}
          />
        </div>
      </Modal>

      {/* Auto-assign unassigned leads to call-center operators */}
      <Modal
        open={autoOpen}
        onClose={() => { if (!autoRun) setAutoOpen(false); }}
        title={t("auto.title")}
        description={t("auto.lead")}
        busy={!!autoRun}
        footer={
          <>
            <button className="btn btn--line" type="button" onClick={() => setAutoOpen(false)} disabled={!!autoRun}>{ta("form.cancel")}</button>
            <button className="btn btn--pri" type="button" onClick={runAuto} disabled={!!autoRun || !autoReady} aria-busy={autoRun ? true : undefined}>
              {autoRun ? t("auto.busy") : t("auto.confirm")}
            </button>
          </>
        }
      >
        <div className="lauto">
          <div className="lauto__stats">
            <div className="lauto__stat"><b>{unassigned.length}</b><span>{t("f.unassigned")}</span></div>
            <div className="lauto__stat"><b>{ops.ops.length}</b><span>{t("assign.title")}</span></div>
          </div>
          {autoRun ? (
            <div className="lauto__run" role="status">
              <p className="advmuted">{t("auto.running", { done: autoRun.done, total: autoRun.total })}</p>
              <div className="lauto__bar"><i style={{ width: `${Math.round((autoRun.done / Math.max(1, autoRun.total)) * 100)}%` }} /></div>
            </div>
          ) : ops.status === "loading" ? (
            <Skeleton rows={2} />
          ) : ops.status === "forbidden" ? (
            <InlineAlert tone="locked">{t("assign.opsForbidden")}</InlineAlert>
          ) : ops.status === "error" ? (
            <ErrorState compact error={ops.error} onRetry={ops.retry} title={t("assign.opsError")} />
          ) : !ops.ops.length ? (
            <InlineAlert tone="warn">{t("auto.noOps")}</InlineAlert>
          ) : !unassigned.length ? (
            <InlineAlert tone="success">{t("auto.nothing")}</InlineAlert>
          ) : (
            <>
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
                  {autoOps.slice(0, 5).map((o) => (
                    <li key={o.id}>
                      <span>{operatorName(o) || t("assign.unknown")}{o.region ? ` · ${leadRegionLabel(te, o.region)}` : ""}</span>
                      <b>+{autoPerOp.get(o.id) ?? 0}</b>
                    </li>
                  ))}
                  {autoOps.length > 5 ? (
                    <li className="lauto__more">
                      <span>{t("auto.moreOps", { n: autoOps.length - 5 })}</span>
                      <b>+{autoRestLeads}</b>
                    </li>
                  ) : null}
                </ul>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Lost reason before a card lands in a "lost" column */}
      <LostReasonDialog
        open={!!lostAsk}
        leadName={lostLead ? nameOf(lostLead) : ""}
        busy={lostSaving}
        onCancel={() => {
          if (lostAsk) notify.dismiss(`lead-move:${lostAsk.leadId}`);
          setLostAsk(null);
        }}
        onConfirm={(reason, note) => {
          const a = lostAsk;
          if (a) void markLost(a.leadId, a.columnKey, a.position, { reason, note });
        }}
      />

      {/* Add / rename a status (kanban column) */}
      <Modal
        open={statusModal !== null}
        onClose={() => setStatusModal(null)}
        title={statusModal?.mode === "rename" ? t("renameStatus") : t("addStatus")}
        size="sm"
        busy={sBusy}
        dirty={statusDirty}
        initialFocus={statusModal?.focus === "color" ? ".lstg-clr input:checked" : undefined}
        footer={
          <>
            <button className="btn btn--line" type="button" onClick={() => setStatusModal(null)} disabled={sBusy}>{ta("form.cancel")}</button>
            <button className="btn btn--pri" type="button" onClick={() => void submitStatus()} disabled={sBusy || !sName.trim()} aria-busy={sBusy || undefined}>
              {sBusy ? ta("form.saving") : ta("form.save")}
            </button>
          </>
        }
      >
        <div className="cform lstg" style={{ maxWidth: "none" }}>
          <div>
            <label htmlFor={sNameId}>{t("statusName")}</label>
            <input
              id={sNameId}
              value={sName}
              onChange={(e) => { setSName(e.target.value); setSTouched(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submitStatus();
                }
              }}
              placeholder={t("statusNamePh")}
              maxLength={60}
              disabled={sBusy}
              aria-required
              aria-invalid={sNameErr ? true : undefined}
              aria-describedby={sNameErr ? `${sNameId}-err` : undefined}
            />
            <FieldError id={`${sNameId}-err`} msg={sNameErr} />
          </div>
          <div>
            <span className="lstg-clr__lbl" id={sColorId}>
              {t("statusColor")}
              {pickedColor ? <em>{pickedColor.name}</em> : null}
            </span>
            <div className="lstg-clr" role="radiogroup" aria-labelledby={sColorId}>
              {palette.map((c) => (
                <span key={c.hex} className={`lstg-clr__sw${sameColor(c.hex, sColor) ? " on" : ""}`} style={{ "--sw": c.hex } as CSSProperties}>
                  <input type="radio" name={sColorId} value={c.hex} checked={sameColor(c.hex, sColor)} disabled={sBusy} onChange={() => setSColor(c.hex)} aria-label={c.name} />
                </span>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete a status (column) */}
      <Modal
        open={delCol !== null}
        onClose={() => setDelCol(null)}
        title={delCol ? t("del.titleFor", { stage: colName(delCol) }) : t("deleteStatus")}
        size="sm"
        busy={delColBusy}
        footer={
          delCol ? (
            <>
              <button className="btn btn--line" type="button" onClick={() => setDelCol(null)} disabled={delColBusy}>{ta("form.cancel")}</button>
              <button className="btn btn--danger" type="button" onClick={() => void confirmDeleteStatus()} disabled={delColBusy || (delCol.count > 0 && !delReassign)} aria-busy={delColBusy || undefined}>
                {delColBusy ? ta("form.saving") : delCol.count > 0 ? t("moveAndDelete") : ta("form.delete")}
              </button>
            </>
          ) : undefined
        }
      >
        {delCol ? (
          <div className="cform lstg" style={{ maxWidth: "none" }}>
            {delCol.count > 0 ? (
              <>
                <p className="lstg-hint">{t("del.leadsText", { n: delCol.count })}</p>
                <div>
                  <label id={delTargetId}>{t("del.target")}</label>
                  <Select
                    value={delReassign}
                    onChange={setDelReassign}
                    ariaLabel={t("del.target")}
                    labelId={delTargetId}
                    options={delOptions.map((c) => ({ value: c.key, label: colName(c) }))}
                  />
                  {delToLost ? <p className="lstg-hint lstg-hint--sub">{t("del.lostHint")}</p> : null}
                </div>
              </>
            ) : (
              <p className="lstg-hint">{t("deleteStatusText")}</p>
            )}
          </div>
        ) : null}
      </Modal>
      <LostReasonDialog
        open={delLost && delCol !== null}
        leadName={delCol ? t("del.lostName", { stage: colName(delCol), n: delCol.count }) : ""}
        busy={delColBusy}
        onCancel={() => setDelLost(false)}
        onConfirm={(reason, note) => void confirmDeleteStatus({ reason, note })}
      />
    </div>
  );
}
