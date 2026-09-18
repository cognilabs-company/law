"use client";

import { useMemo, useState, type CSSProperties } from "react";
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
  type KanbanColumnX,
  type LeadFilter,
  type LeadX,
} from "@/lib/services/leads";

const LOST_REASONS = ["price", "solved_self", "competitor", "no_answer", "no_service", "spam"] as const;
const isLostKey = (k: string) => /lost|rejected|yoqotil|rad/i.test(k);
import { ApiError } from "@/lib/http";
import { useAuth } from "@/lib/auth";
import { assigneeLabel, kanbanColumnTitle, leadCategoryLabel, leadRegionLabel, leadScoreLabel, leadSourceLabel } from "@/lib/leadLabels";
import { useResource } from "@/lib/useResource";
import { AdminForm, Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import LeadDrawer from "@/components/admin/LeadDrawer";
import LeadFilterBar from "@/components/admin/LeadFilterBar";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconTrendingUp, IconChevronLeft, IconChevronRight, IconUsers, IconGrid, IconDocLines, IconPlus, IconEdit, IconTrash, IconUser, IconBolt } from "@/components/icons";

const STATUS_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#6b7280"];

export default function AdminPipeline() {
  const t = useTranslations("admin.pipeline");
  const tStages = useTranslations("admin.callCenter.queue");
  const te = useTranslations("enums");
  const colName = (c: { key: string; title: string }) => kanbanColumnTitle(tStages, c);
  const ta = useTranslations("admin");
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
  const [moveErr, setMoveErr] = useState(false);
  // Lost reason is asked before the card lands in a "lost" column (T4-02 §7).
  const [lostAsk, setLostAsk] = useState<{ leadId: string; columnKey: string; position: number } | null>(null);
  const [lostReason, setLostReason] = useState<string>("price");
  const [lostNote, setLostNote] = useState("");
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Add / rename a kanban status (column).
  const [statusModal, setStatusModal] = useState<{ mode: "add" | "rename"; col?: KanbanColumnX } | null>(null);
  const [sName, setSName] = useState("");
  const [sColor, setSColor] = useState("#2563eb");
  const [sBusy, setSBusy] = useState(false);
  const [sErr, setSErr] = useState(false);

  // Delete a status (column), reassigning its leads if any.
  const [delCol, setDelCol] = useState<KanbanColumnX | null>(null);
  const [delReassign, setDelReassign] = useState("");
  const [delColBusy, setDelColBusy] = useState(false);
  const [delColErr, setDelColErr] = useState<string | null>(null);

  // Auto-assignment of unassigned leads (client-side plan, saved lead by lead).
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoStrategy, setAutoStrategy] = useState<AssignStrategy>("round_robin");
  const [autoRun, setAutoRun] = useState<{ done: number; total: number } | null>(null);
  const [autoMsg, setAutoMsg] = useState<{ ok: boolean; msg: string } | null>(null);

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

  // Filters (client-side over the loaded board).
  const [f, setF] = useState<LeadFilter>(EMPTY_LEAD_FILTER);
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
  async function moveTo(leadId: string, columnKey: string, position: number, lost?: { reason: string; note: string }) {
    if (busy) return;
    if (isLostKey(columnKey) && !lost) { setLostAsk({ leadId, columnKey, position }); return; }
    const before = cols;
    const from = cols.find((c) => c.cards.some((x) => x.lead.id === leadId));
    const card = from?.cards.find((x) => x.lead.id === leadId);
    if (!card || !from) return;
    if (from.key === columnKey) return;
    setBusy(leadId);
    setMoveErr(false);
    res.setData((cur) =>
      cur.map((c) => {
        if (c.key === from.key) return { ...c, count: Math.max(0, c.count - 1), cards: c.cards.filter((x) => x.lead.id !== leadId) };
        if (c.key === columnKey) {
          const cards = c.cards.slice();
          cards.splice(Math.min(position, cards.length), 0, card);
          return { ...c, count: c.count + 1, cards };
        }
        return c;
      }),
    );
    try {
      if (lost) await adminUpdateLead(leadId, { details: { ...(card.lead.details ?? {}), lost_reason: lost.reason, lost_note: lost.note, lost_at: new Date().toISOString() } }).catch(() => {});
      await moveLeadKanban(leadId, columnKey, position);
      void refresh();
    } catch {
      res.setData(before);
      setMoveErr(true);
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
    const before = cols;
    const at = new Date().toISOString();
    res.setData((cur) => patchLeadInColumns(cur, lead.id, (l) => withAssignment(l, userId, meId, at)));
    try {
      await assignLead(lead, userId, meId);
    } catch (e) {
      res.setData(before);
      throw e;
    }
  }
  function openAuto() {
    setAutoMsg(null);
    setAutoRun(null);
    setAutoOpen(true);
  }
  async function runAuto() {
    if (autoRun) return;
    const plan = autoAssign(allLeads, ops.ops, autoStrategy);
    if (!plan.length) { setAutoOpen(false); return; }
    setAutoMsg(null);
    setAutoRun({ done: 0, total: plan.length });
    const r = await applyAssignments(plan, meId, (a, at) => {
      res.setData((cur) => patchLeadInColumns(cur, a.lead.id, (l) => withAssignment(l, a.operator.id, meId, at)));
      setAutoRun((cur) => (cur ? { ...cur, done: cur.done + 1 } : cur));
    });
    setAutoRun(null);
    setAutoOpen(false);
    if (r.forbidden && !r.done) setAutoMsg({ ok: false, msg: t("assign.noPermission") });
    else if (r.failed || r.forbidden) setAutoMsg({ ok: r.done > 0, msg: t("auto.partial", { n: r.done, failed: r.failed + (r.forbidden ? plan.length - r.done - r.failed : 0) }) });
    else setAutoMsg({ ok: true, msg: t("auto.done", { n: r.done }) });
    void refresh();
  }
  function openAddStatus() {
    setSName("");
    setSColor(STATUS_COLORS[0]);
    setSErr(false);
    setStatusModal({ mode: "add" });
  }
  function openRenameStatus(col: KanbanColumnX) {
    setSName(col.title);
    setSColor(col.color || "#6b7280");
    setSErr(false);
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
    setSBusy(true);
    setSErr(false);
    try {
      if (statusModal.mode === "add") {
        const order = cols.reduce((m, c) => Math.max(m, c.order), 0) + 10;
        await saveLeadKanbanColumns([{ key: statusKey(name), title: name, color: sColor, order }]);
      } else if (statusModal.col) {
        const c = statusModal.col;
        await saveLeadKanbanColumns([{ key: c.key, title: name, color: sColor, order: c.order, isFinal: c.isFinal }]);
      }
      setStatusModal(null);
      void refresh();
    } catch {
      setSErr(true);
    } finally {
      setSBusy(false);
    }
  }
  function openDeleteStatus(col: KanbanColumnX) {
    setDelCol(col);
    setDelColErr(null);
    // Default reassignment target: the first other column.
    setDelReassign(cols.find((c) => c.key !== col.key)?.key ?? "");
  }
  async function confirmDeleteStatus() {
    if (!delCol || delColBusy) return;
    setDelColBusy(true);
    setDelColErr(null);
    try {
      await deleteLeadKanbanColumn(delCol.key, delCol.count > 0 ? delReassign || undefined : undefined);
      setDelCol(null);
      void refresh();
    } catch (e) {
      const detail = e instanceof ApiError ? e.detail : "";
      setDelColErr(detail || ta("form.deleteError"));
    } finally {
      setDelColBusy(false);
    }
  }
  async function remove(leadId: string) {
    if (typeof window !== "undefined" && !window.confirm(t("d.deleteConfirm"))) return;
    setBusy(leadId);
    try {
      await adminDeleteLead(leadId);
      setSelId(null);
      res.setData((cur) => cur.map((c) => (c.cards.some((x) => x.lead.id === leadId) ? { ...c, count: Math.max(0, c.count - 1), cards: c.cards.filter((x) => x.lead.id !== leadId) } : c)));
      void refresh();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  // Assignee chip shown on every card / row.
  const assigneeChip = (lead: LeadX) => (
    <span className={`lasg${!lead.assignedTo ? " lasg--none" : lead.assignedTo === meId ? " lasg--me" : ""}`} title={t("assign.title")}>
      <IconUser />
      <span>{assigneeLabel(t, ops.ops, lead.assignedTo, meId)}</span>
    </span>
  );

  // Auto-assign preview (only while the modal is open — the plan is pure).
  const autoPlan = autoOpen ? autoAssign(allLeads, ops.ops, autoStrategy) : [];
  const autoPerOp = autoPlan.reduce<Map<string, number>>((m, a) => m.set(a.operator.id, (m.get(a.operator.id) ?? 0) + 1), new Map());

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="ahdr">
          <span className="advmuted">{total}</span>
          <span className="segtab">
            <button type="button" className={view === "kanban" ? "on" : ""} onClick={() => setView("kanban")} aria-label={t("viewKanban")}><IconGrid />{t("viewKanban")}</button>
            <button type="button" className={view === "table" ? "on" : ""} onClick={() => setView("table")} aria-label={t("viewTable")}><IconDocLines />{t("viewTable")}</button>
          </span>
          <button className="btn btn--soft btn--sm" type="button" onClick={openAuto} disabled={!cols.length}><IconBolt />{t("auto.btn")}{unassigned.length ? ` · ${unassigned.length}` : ""}</button>
          <button className="btn btn--line btn--sm" type="button" onClick={openAddStatus}><IconPlus />{t("addStatus")}</button>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setAddOpen(true)}><IconPlus />{ta("form.add")}</button>
        </span>
      </div>
      <p className="advmuted" style={{ marginBottom: 14 }}>{t("lead")}</p>

      {cols.length ? (
        <>
          <div className="lkpi">
            <div className="lkpi__c"><b>{total}</b><span>{t("kpi.total")}</span></div>
            <div className="lkpi__c"><b>{active}</b><span>{t("kpi.active")}</span></div>
            <div className="lkpi__c"><b>{wonCount}</b><span>{t("kpi.won")}</span></div>
            <div className="lkpi__c"><b>{conv}%</b><span>{t("kpi.conv")}</span></div>
          </div>
          <LeadFilterBar
            value={f}
            onChange={setF}
            regions={regions}
            sources={sources}
            stages={view === "table" ? cols.map((c) => ({ value: c.key, label: colName(c) })) : undefined}
            operators={ops.status === "ready" ? ops.ops : []}
            scores
            urgencies={urgencies}
            summary={filtered ? { shown: view === "table" ? rows.length : shown, total: allCards.length } : undefined}
          />
          {ops.status === "forbidden" ? <p className="advmuted" style={{ marginTop: -8, marginBottom: 12 }}>{t("assign.opsForbidden")}</p> : null}
        </>
      ) : null}

      {moveErr ? <Notice ok={false} msg={t("moveError")} /> : null}
      {autoMsg ? <Notice ok={autoMsg.ok} msg={autoMsg.msg} /> : null}
      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !cols.length ? (
        <EmptyState icon={<IconTrendingUp />} title={t("empty")} text={t("emptyText")} />
      ) : view === "kanban" ? (
        <div className="pipe">
          {viewCols.map((col, ci) => (
            <div
              className={`pipe__col${overCol === col.key ? " pipe__col--over" : ""}`}
              key={col.key}
              style={col.color ? ({ "--pipe-col": col.color } as CSSProperties) : undefined}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverCol(col.key); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol((cur) => (cur === col.key ? null : cur)); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) moveTo(dragId, col.key, col.cards.length); setDragId(null); setOverCol(null); }}
            >
              <div className="pipe__head">
                <span className="pipe__dot" style={col.color ? { background: col.color } : undefined} />
                <b>{colName(col)}</b>
                <span className="pipe__count">{filtered ? col.cards.length : col.count}</span>
                <button type="button" className="pipe__edit" aria-label={t("editStatus")} title={t("renameStatus")} onClick={() => openRenameStatus(col)}>
                  <IconEdit />
                </button>
                {!col.isFinal ? (
                  <button type="button" className="pipe__edit pipe__edit--danger" aria-label={t("deleteStatus")} title={t("deleteStatus")} onClick={() => openDeleteStatus(col)}>
                    <IconTrash />
                  </button>
                ) : null}
              </div>
              <div className="pipe__cards">
                <div className={`pipe__slot${overCol === col.key && dragId ? " on" : ""}`} aria-hidden />
                {col.cards.length === 0 ? (
                  <div className="pipe__empty">{filtered ? t("f.noMatch") : t("noneHere")}</div>
                ) : (
                  col.cards.map(({ lead: l }) => (
                    <div
                      className={`pipe__card${dragId === l.id ? " pipe__card--drag" : ""}`}
                      key={l.id}
                      draggable
                      onClick={() => setSelId(l.id)}
                      onDragStart={(e) => { setDragId(l.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    >
                      <div className="pipe__ctop">
                        <b>{l.name || l.phone || leadCategoryLabel(t, l.category) || t("untitledLead")}</b>
                        {l.scoreKey ? <span className={`lscore lscore--${l.scoreKey}`}>{leadScoreLabel(t, l.scoreKey)}</span> : null}
                      </div>
                      <span className="pipe__meta">{[l.phone, leadCategoryLabel(t, l.category), leadRegionLabel(te, l.region)].filter(Boolean).join(" · ") || t("noInfo")}</span>
                      {l.note ? <span className="pipe__note">{l.note}</span> : null}
                      {assigneeChip(l)}
                      <div className="pipe__actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="pipe__mv" disabled={ci === 0 || busy === l.id} onClick={() => shift(l.id, col.key, -1)} aria-label={t("moveBack")}><IconChevronLeft /></button>
                        <span className="pipe__src">{l.source ? leadSourceLabel(t, l.source) : <IconUsers />}</span>
                        <button type="button" className="pipe__mv" disabled={ci === cols.length - 1 || busy === l.id} onClick={() => shift(l.id, col.key, 1)} aria-label={t("moveFwd")}><IconChevronRight /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="alist">
          {rows.length === 0 ? (
            <EmptyState icon={<IconUsers />} title={filtered ? t("f.noMatch") : t("empty")} text={filtered ? "" : t("emptyText")} />
          ) : (
            rows.map(({ lead: l, colKey }, i) => (
              <button type="button" className="aitem aitem--link" key={l.id} onClick={() => setSelId(l.id)}>
                <span className="aitem__n">{i + 1}</span>
                <div className="aitem__m">
                  <b>{l.name || l.phone || leadCategoryLabel(t, l.category) || t("untitledLead")}</b>
                  <span className="aitem__meta">{[l.phone, leadCategoryLabel(t, l.category), leadRegionLabel(te, l.region)].filter(Boolean).join(" · ")}</span>
                  <span className="pipe__tags">
                    {l.scoreKey ? <span className={`lscore lscore--${l.scoreKey}`}>{leadScoreLabel(t, l.scoreKey)}</span> : null}
                    {assigneeChip(l)}
                  </span>
                </div>
                <span className="lstage" style={colColor(colKey) ? ({ "--c": colColor(colKey) } as CSSProperties) : undefined}>{colTitle(colKey)}</span>
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
          operators={ops.ops}
          opsStatus={ops.status}
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
          ]}
          onSubmit={async (v) => void (await adminCreateLead({ name: String(v.name), phone: String(v.phone), category: String(v.category), region: String(v.region), note: String(v.note), source: "manual" }))}
          submitLabel={ta("form.save")}
          busyLabel={ta("form.saving")}
          okMsg={ta("form.created")}
          errMsg={ta("form.error")}
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
                      <span>{o.name || o.phone || o.lexgoId}{o.region ? ` · ${leadRegionLabel(te, o.region)}` : ""}</span>
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
          <button className="btn btn--pri btn--full" type="button" onClick={() => { const a = lostAsk; setLostAsk(null); if (a) void moveTo(a.leadId, a.columnKey, a.position, { reason: lostReason, note: lostNote.trim() }); setLostNote(""); }}>{t("lost.confirm")}</button>
        </div>
      </Modal>

      {/* Add / rename a status (kanban column) */}
      <Modal open={statusModal !== null} onClose={() => setStatusModal(null)} title={statusModal?.mode === "rename" ? t("renameStatus") : t("addStatus")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <div>
            <label>{t("statusName")}</label>
            <input value={sName} onChange={(e) => setSName(e.target.value)} placeholder={t("statusNamePh")} autoFocus />
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
          {sErr ? <Notice ok={false} msg={ta("form.error")} /> : null}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn--ghost" type="button" onClick={() => setStatusModal(null)}>{ta("form.cancel")}</button>
            <button className="btn btn--pri" type="button" onClick={submitStatus} disabled={sBusy}>{sBusy ? ta("form.saving") : ta("form.save")}</button>
          </div>
        </div>
      </Modal>

      {/* Delete a status (column) */}
      <Modal open={delCol !== null} onClose={() => setDelCol(null)} title={t("deleteStatus")}>
        {delCol ? (
          <div className="cform" style={{ maxWidth: "none" }}>
            <p style={{ margin: 0 }}><b>{delCol.title}</b></p>
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
            {delColErr ? <Notice ok={false} msg={delColErr} /> : null}
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
