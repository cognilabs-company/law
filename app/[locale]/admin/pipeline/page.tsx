"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { getLeadKanban, moveLeadKanban, adminCreateLead, adminDeleteLead, saveLeadKanbanColumns, deleteLeadKanbanColumn, type KanbanColumn, type Lead } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { kanbanColumnTitle, leadCategoryLabel, leadSourceLabel } from "@/lib/leadLabels";
import { useResource } from "@/lib/useResource";
import { AdminForm, Notice, useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import LeadDrawer from "@/components/admin/LeadDrawer";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconTrendingUp, IconChevronLeft, IconChevronRight, IconUsers, IconGrid, IconDocLines, IconPlus, IconSearch, IconEdit, IconTrash } from "@/components/icons";

const STATUS_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#6b7280"];

export default function AdminPipeline() {
  const t = useTranslations("admin.pipeline");
  const tStages = useTranslations("admin.callCenter.queue");
  const colName = (c: { key: string; title: string }) => kanbanColumnTitle(tStages, c);
  const ta = useTranslations("admin");
  const [key, reload] = useReload();
  const res = useResource<KanbanColumn>(getLeadKanban, [key]);
  const cols = res.data;
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Add / rename a kanban status (column).
  const [statusModal, setStatusModal] = useState<{ mode: "add" | "rename"; col?: KanbanColumn } | null>(null);
  const [sName, setSName] = useState("");
  const [sColor, setSColor] = useState("#2563eb");
  const [sBusy, setSBusy] = useState(false);
  const [sErr, setSErr] = useState(false);

  // Delete a status (column), reassigning its leads if any.
  const [delCol, setDelCol] = useState<KanbanColumn | null>(null);
  const [delReassign, setDelReassign] = useState("");
  const [delColBusy, setDelColBusy] = useState(false);
  const [delColErr, setDelColErr] = useState<string | null>(null);

  const total = useMemo(() => cols.reduce((n, c) => n + c.count, 0), [cols]);
  const allCards = useMemo(
    () => cols.flatMap((c) => c.cards.map((x) => ({ lead: x.lead, colKey: c.key }))),
    [cols],
  );
  const selected = allCards.find((x) => x.lead.id === selId) || null;
  const colTitle = (k: string) => {
    const c = cols.find((x) => x.key === k);
    return c ? colName(c) : k;
  };
  const colColor = (k: string) => cols.find((c) => c.key === k)?.color || "";
  const orderOf = (k: string) => cols.findIndex((c) => c.key === k);

  // Filters (client-side over the loaded board).
  const [q, setQ] = useState("");
  const [fSource, setFSource] = useState("");
  const [fRegion, setFRegion] = useState("");
  const [fStage, setFStage] = useState("");
  const query = q.trim().toLowerCase();
  const matchLead = (l: Lead) =>
    (!query || `${l.name} ${l.phone} ${l.category}`.toLowerCase().includes(query)) &&
    (!fSource || l.source === fSource) &&
    (!fRegion || l.region === fRegion);
  const sources = useMemo(() => [...new Set(allCards.map((x) => x.lead.source).filter(Boolean))], [allCards]);
  const regions = useMemo(() => [...new Set(allCards.map((x) => x.lead.region).filter(Boolean))], [allCards]);
  const viewCols = useMemo(() => cols.map((c) => ({ ...c, cards: c.cards.filter((x) => matchLead(x.lead)) })), [cols, query, fSource, fRegion]);
  const rows = allCards.filter((x) => matchLead(x.lead) && (!fStage || x.colKey === fStage));

  // KPI (from the full board, not the filtered view).
  const finalTotal = cols.filter((c) => c.isFinal).reduce((n, c) => n + c.count, 0);
  const wonCount = (cols.find((c) => c.key === "won") ?? cols.filter((c) => c.isFinal)[0])?.count ?? 0;
  const active = total - finalTotal;
  const conv = total ? Math.round((wonCount / total) * 100) : 0;

  async function moveTo(leadId: string, columnKey: string, position: number) {
    setBusy(leadId);
    try {
      await moveLeadKanban(leadId, columnKey, position);
      reload();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }
  function shift(leadId: string, fromKey: string, dir: number) {
    const i = orderOf(fromKey);
    const next = cols[i + dir];
    if (next) moveTo(leadId, next.key, next.cards.length);
  }
  function openAddStatus() {
    setSName("");
    setSColor(STATUS_COLORS[0]);
    setSErr(false);
    setStatusModal({ mode: "add" });
  }
  function openRenameStatus(col: KanbanColumn) {
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
      reload();
    } catch {
      setSErr(true);
    } finally {
      setSBusy(false);
    }
  }
  function openDeleteStatus(col: KanbanColumn) {
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
      reload();
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
      reload();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

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
          <div className="lfilters">
            <span className="svsel__search"><IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("f.search")} aria-label={t("f.search")} /></span>
            <Select value={fSource} onChange={setFSource} ariaLabel={t("d.source")} options={[{ value: "", label: t("f.allSource") }, ...sources.map((s) => ({ value: s, label: t.has(`source.${s}`) ? t(`source.${s}`) : s }))]} />
            <Select value={fRegion} onChange={setFRegion} ariaLabel={t("d.region")} options={[{ value: "", label: t("f.allRegion") }, ...regions.map((r) => ({ value: r, label: r }))]} />
            {view === "table" ? (
              <Select value={fStage} onChange={setFStage} ariaLabel={t("d.stage")} options={[{ value: "", label: t("f.allStage") }, ...cols.map((c) => ({ value: c.key, label: colName(c) }))]} />
            ) : null}
          </div>
        </>
      ) : null}

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
                <span className="pipe__count">{query || fSource || fRegion ? col.cards.length : col.count}</span>
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
                  <div className="pipe__empty">{t("noneHere")}</div>
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
                        {l.score ? <span className="pipe__score">{l.score}</span> : null}
                      </div>
                      <span className="pipe__meta">{[l.phone, leadCategoryLabel(t, l.category), l.region].filter(Boolean).join(" · ") || t("noInfo")}</span>
                      {l.note ? <span className="pipe__note">{l.note}</span> : null}
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
            <EmptyState icon={<IconUsers />} title={t("empty")} text={t("emptyText")} />
          ) : (
            rows.map(({ lead: l, colKey }, i) => (
              <button type="button" className="aitem aitem--link" key={l.id} onClick={() => setSelId(l.id)}>
                <span className="aitem__n">{i + 1}</span>
                <div className="aitem__m">
                  <b>{l.name || l.phone || leadCategoryLabel(t, l.category) || t("untitledLead")}</b>
                  <span className="aitem__meta">{[l.phone, leadCategoryLabel(t, l.category), l.region].filter(Boolean).join(" · ")}</span>
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
          onDone={() => { reload(); setAddOpen(false); }}
        />
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
