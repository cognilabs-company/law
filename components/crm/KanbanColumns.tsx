"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import CheckBox from "@/components/CheckBox";
import { IconArrowDown, IconArrowUp, IconCheck, IconGrid, IconPlus, IconTrash } from "@/components/icons";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { loadCrmMeta } from "@/lib/crm/useCrm";
import { archiveKanbanColumn, columnKeyOf, kanbanCounts, listKanbanColumns, saveKanbanColumns, type CrmMeta } from "@/lib/services/crm";
import { useCrmError, useStatusLabel } from "./bits";
import { CrmSelect } from "./fields";

// The board's columns, managed by an operator with leads.manage (dynamic
// kanban contract 2026-10-28): add, rename, recolour, reorder by dragging
// (or the arrows on touch and keyboard), mark as final, archive. Saving
// sends the whole ordered list (PUT); a new column's key is made once from
// its title and never changes. No key or number is ever shown.

export const SWATCHES = ["#2563eb", "#0891b2", "#059669", "#16a34a", "#65a30d", "#d97706", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#4f46e5", "#6b7280"];

type Row = { key: string; title: string; color: string; isFinal: boolean; fresh: boolean; uid: string };

export function KanbanColumns({ meta, counts: viewCounts, onClose }: { meta: CrmMeta; counts: Record<string, number>; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.columns");
  const label = useStatusLabel();
  const crmErr = useCrmError();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [archive, setArchive] = useState<Row | null>(null);
  const [dragUid, setDragUid] = useState("");
  const uidSeq = useRef(0);
  // Whole-column counts (the board on screen may be filtered to a tab).
  const [counts, setCounts] = useState<Record<string, number>>(viewCounts);
  useEffect(() => {
    const ctl = new AbortController();
    kanbanCounts(ctl.signal).then(setCounts, (e) => {
      if (!isAborted(e)) logApiError("crm.columns.counts", e);
    });
    return () => ctl.abort();
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    listKanbanColumns(ctl.signal).then(
      (cols) => setRows(cols.map((c) => ({ key: c.key, title: label(c.key), color: c.color || SWATCHES[0], isFinal: c.isFinal, fresh: false, uid: c.key }))),
      (e) => {
        if (isAborted(e)) return;
        logApiError("crm.columns", e);
        // The meta has the same columns: work from it rather than fail.
        setRows(meta.statusInfo.map((c) => ({ key: c.key, title: label(c.key), color: c.color || SWATCHES[0], isFinal: c.isFinal, fresh: false, uid: c.key })));
      },
    );
    return () => ctl.abort();
    // Read once when the manager opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (uid: string, patch: Partial<Row>) => {
    setDirty(true);
    setRows((cur) => (cur ? cur.map((r) => (r.uid === uid ? { ...r, ...patch } : r)) : cur));
  };
  const shift = (uid: string, dir: -1 | 1) => {
    setDirty(true);
    setRows((cur) => {
      if (!cur) return cur;
      const i = cur.findIndex((r) => r.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const dropOn = (uid: string) => {
    if (!dragUid || dragUid === uid) return;
    setDirty(true);
    setRows((cur) => {
      if (!cur) return cur;
      const from = cur.findIndex((r) => r.uid === dragUid);
      const to = cur.findIndex((r) => r.uid === uid);
      if (from < 0 || to < 0) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const add = () => {
    setDirty(true);
    uidSeq.current += 1;
    setRows((cur) => [...(cur ?? []), { key: "", title: "", color: SWATCHES[(cur?.length ?? 0) % SWATCHES.length], isFinal: false, fresh: true, uid: `new-${uidSeq.current}` }]);
  };

  const issues = (rows ?? []).map((r, i, all) => {
    const name = r.title.trim().toLowerCase();
    if (!name) return t("needTitle");
    if (all.some((x, j) => j !== i && x.title.trim().toLowerCase() === name)) return t("sameTitle");
    return "";
  });
  const save = async () => {
    setTried(true);
    if (!rows || busy || issues.some(Boolean)) return;
    setBusy(true);
    try {
      const taken = rows.filter((r) => !r.fresh).map((r) => r.key);
      const payload = rows.map((r) => {
        if (!r.fresh) return { key: r.key, title: r.title, color: r.color, order: 0, isFinal: r.isFinal };
        const key = columnKeyOf(r.title, taken);
        taken.push(key);
        return { key, title: r.title, color: r.color, order: 0, isFinal: r.isFinal };
      });
      await saveKanbanColumns(payload);
      await loadCrmMeta(true);
      toast(t("saved"), { tone: "ok" });
      onClose();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        variant="drawer"
        title={t("title")}
        description={t("lead")}
        busy={busy}
        dirty={dirty}
        footer={
          <>
            <button type="button" className="crm-btn" onClick={onClose} disabled={busy}>
              {t("cancel")}
            </button>
            <button type="button" className="crm-btn crm-btn--pri" onClick={() => void save()} disabled={busy || !rows || !dirty} aria-busy={busy || undefined}>
              <IconCheck aria-hidden="true" />
              {t("save")}
            </button>
          </>
        }
      >
        <div className="crm-pop">
          {!rows ? (
            [0, 1, 2, 3].map((i) => <span key={i} className="crm-sk crm-sk--block" style={{ height: 58 }} />)
          ) : (
            <ol className="crm-colmgr" aria-label={t("order")}>
              {rows.map((r, i) => (
                <li
                  key={r.uid}
                  className="crm-colmgr__row"
                  style={{ ["--sc" as string]: r.color }}
                  data-dragging={dragUid === r.uid || undefined}
                  data-bad={tried && issues[i] ? "" : undefined}
                  draggable
                  onDragStart={(e) => {
                    setDragUid(r.uid);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", r.uid);
                  }}
                  onDragEnd={() => setDragUid("")}
                  onDragOver={(e) => {
                    if (!dragUid) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropOn(r.uid);
                    setDragUid("");
                  }}
                >
                  <span className="crm-colmgr__grip" aria-hidden="true">
                    <IconGrid />
                  </span>
                  <span className="crm-colmgr__main">
                    <input
                      className="crm-input"
                      value={r.title}
                      onChange={(e) => edit(r.uid, { title: e.target.value })}
                      placeholder={t("titlePh")}
                      aria-label={t("titleOf", { n: i + 1 })}
                      aria-invalid={tried && !!issues[i]}
                      maxLength={60}
                      autoFocus={r.fresh && !r.title}
                      onDragStart={(e) => e.preventDefault()}
                      draggable={false}
                    />
                    {tried && issues[i] ? <em>{issues[i]}</em> : null}
                    <span className="crm-colmgr__swatches" role="radiogroup" aria-label={t("color")}>
                      {SWATCHES.map((c) => (
                        <button key={c} type="button" role="radio" aria-checked={r.color.toLowerCase() === c} aria-label={t("colorN", { n: SWATCHES.indexOf(c) + 1 })} style={{ background: c }} onClick={() => edit(r.uid, { color: c })} />
                      ))}
                    </span>
                    <span className="crm-colmgr__meta">
                      <CheckBox checked={r.isFinal} onChange={(on) => edit(r.uid, { isFinal: on })} className="crm-colmgr__final">
                        {t("final")}
                      </CheckBox>
                      {!r.fresh ? <small>{t("leadsN", { n: counts[r.key] ?? 0 })}</small> : <small className="crm-colmgr__new">{t("new")}</small>}
                    </span>
                  </span>
                  <span className="crm-colmgr__acts">
                    <button type="button" className="crm-btn crm-btn--sm crm-btn--icon crm-btn--ghost" onClick={() => shift(r.uid, -1)} disabled={i === 0} aria-label={t("up", { name: r.title || t("untitled") })}>
                      <IconArrowUp aria-hidden="true" />
                    </button>
                    <button type="button" className="crm-btn crm-btn--sm crm-btn--icon crm-btn--ghost" onClick={() => shift(r.uid, 1)} disabled={i === rows.length - 1} aria-label={t("down", { name: r.title || t("untitled") })}>
                      <IconArrowDown aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="crm-btn crm-btn--sm crm-btn--icon crm-btn--ghost"
                      onClick={() => (r.fresh ? setRows((cur) => (cur ? cur.filter((x) => x.uid !== r.uid) : cur)) : setArchive(r))}
                      disabled={!r.fresh && rows.filter((x) => !x.fresh).length <= 1}
                      aria-label={r.fresh ? t("remove", { name: r.title || t("untitled") }) : t("archive", { name: r.title })}
                    >
                      <IconTrash aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className="crm-btn crm-colmgr__add" onClick={add} disabled={!rows || busy}>
            <IconPlus aria-hidden="true" />
            {t("add")}
          </button>
          <p className="crm-sub">{t("note")}</p>
        </div>
      </Modal>
      {archive && rows ? (
        <ArchiveColumn
          row={archive}
          others={rows.filter((x) => !x.fresh && x.uid !== archive.uid)}
          count={counts[archive.key] ?? 0}
          onClose={() => setArchive(null)}
          onDone={() => {
            setRows((cur) => (cur ? cur.filter((x) => x.uid !== archive.uid) : cur));
            setArchive(null);
            void loadCrmMeta(true);
          }}
        />
      ) : null}
    </>
  );
}

// Archiving a column: its leads go to the chosen column. A protected or
// final column the backend refuses (409) stays, with the backend's reason.
function ArchiveColumn({ row, others, count, onClose, onDone }: { row: Row; others: Row[]; count: number; onClose: () => void; onDone: () => void }): ReactElement {
  const t = useTranslations("crm.columns");
  const crmErr = useCrmError();
  const [to, setTo] = useState(others.find((o) => !o.isFinal)?.key ?? others[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const ok = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await archiveKanbanColumn(row.key, to);
      toast(t("archived", { name: row.title }), { tone: "ok" });
      onDone();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t("archiveTitle", { name: row.title })}
      description={count ? t("archiveLeads", { n: count }) : t("archiveEmpty")}
      busy={busy}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--danger" onClick={() => void ok()} disabled={busy || !to} aria-busy={busy || undefined}>
            <IconTrash aria-hidden="true" />
            {t("archiveOk")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <div className="crm-field">
          <span>{t("moveLeadsTo")}</span>
          <CrmSelect value={to} onChange={setTo} label={t("moveLeadsTo")} options={others.map((o) => ({ value: o.key, label: o.title }))} />
          <small>{t("archiveHint")}</small>
        </div>
      </div>
    </Modal>
  );
}
