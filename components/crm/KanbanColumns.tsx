"use client";

import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { IconArrowDown, IconArrowUp, IconCheck, IconGrid, IconLock } from "@/components/icons";
import { toast } from "@/lib/toast";
import { loadCrmMeta } from "@/lib/crm/useCrm";
import { saveKanbanColumns, type CrmMeta } from "@/lib/services/crm";
import { StatusIcon, useCrmError, useStatusLabel } from "./bits";

// The board's settings (contract 13cb257 §6): the six fixed statuses keep
// their keys and can't be added or removed; only their title, colour and
// order change (drag, or the arrows on touch and keyboard). Saving sends
// all six to PUT /crm/kanban/columns (crm.automation.manage). No key or
// number is ever shown.

export const SWATCHES = ["#2563eb", "#0891b2", "#059669", "#16a34a", "#65a30d", "#d97706", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#4f46e5", "#6b7280"];

type Row = { key: string; title: string; color: string };

export function KanbanColumns({ meta, counts, onClose }: { meta: CrmMeta; counts: Record<string, number>; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.columns");
  const label = useStatusLabel();
  const crmErr = useCrmError();
  const [rows, setRows] = useState<Row[]>(() => meta.statusInfo.map((c, i) => ({ key: c.key, title: label(c.key), color: c.color || SWATCHES[i % SWATCHES.length] })));
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragKey, setDragKey] = useState("");

  const edit = (key: string, patch: Partial<Row>) => {
    setDirty(true);
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const shift = (key: string, dir: -1 | 1) => {
    setDirty(true);
    setRows((cur) => {
      const i = cur.findIndex((r) => r.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const dropOn = (key: string) => {
    if (!dragKey || dragKey === key) return;
    setDirty(true);
    setRows((cur) => {
      const from = cur.findIndex((r) => r.key === dragKey);
      const to = cur.findIndex((r) => r.key === key);
      if (from < 0 || to < 0) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const issues = rows.map((r, i, all) => {
    const name = r.title.trim().toLowerCase();
    if (!name) return t("needTitle");
    if (all.some((x, j) => j !== i && x.title.trim().toLowerCase() === name)) return t("sameTitle");
    return "";
  });
  const save = async () => {
    setTried(true);
    if (busy || issues.some(Boolean)) return;
    setBusy(true);
    try {
      await saveKanbanColumns(rows);
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
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void save()} disabled={busy || !dirty} aria-busy={busy || undefined}>
            <IconCheck aria-hidden="true" />
            {t("save")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <p className="crm-note">
          <IconLock aria-hidden="true" />
          {t("fixed")}
        </p>
        <ol className="crm-colmgr" aria-label={t("order")}>
          {rows.map((r, i) => (
            <li
              key={r.key}
              className="crm-colmgr__row"
              style={{ ["--sc" as string]: r.color }}
              data-dragging={dragKey === r.key || undefined}
              data-bad={tried && issues[i] ? "" : undefined}
              draggable
              onDragStart={(e) => {
                setDragKey(r.key);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", r.key);
              }}
              onDragEnd={() => setDragKey("")}
              onDragOver={(e) => {
                if (!dragKey) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(r.key);
                setDragKey("");
              }}
            >
              <span className="crm-colmgr__grip" aria-hidden="true">
                <IconGrid />
              </span>
              <span className="crm-colmgr__main">
                <span className="crm-colmgr__name">
                  <i aria-hidden="true">
                    <StatusIcon status={r.key} />
                  </i>
                  <input
                    className="crm-input"
                    value={r.title}
                    onChange={(e) => edit(r.key, { title: e.target.value })}
                    placeholder={t("titlePh")}
                    aria-label={t("titleOf", { n: i + 1 })}
                    aria-invalid={tried && !!issues[i]}
                    maxLength={80}
                    onDragStart={(e) => e.preventDefault()}
                    draggable={false}
                  />
                </span>
                {tried && issues[i] ? <em>{issues[i]}</em> : null}
                <span className="crm-colmgr__swatches" role="radiogroup" aria-label={t("color")}>
                  {SWATCHES.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={r.color.toLowerCase() === c} aria-label={t("colorN", { n: SWATCHES.indexOf(c) + 1 })} style={{ background: c }} onClick={() => edit(r.key, { color: c })} />
                  ))}
                </span>
                <span className="crm-colmgr__meta">
                  <small>{t("leadsN", { n: counts[r.key] ?? 0 })}</small>
                </span>
              </span>
              <span className="crm-colmgr__acts">
                <button type="button" className="crm-btn crm-btn--sm crm-btn--icon crm-btn--ghost" onClick={() => shift(r.key, -1)} disabled={i === 0} aria-label={t("up", { name: r.title })}>
                  <IconArrowUp aria-hidden="true" />
                </button>
                <button type="button" className="crm-btn crm-btn--sm crm-btn--icon crm-btn--ghost" onClick={() => shift(r.key, 1)} disabled={i === rows.length - 1} aria-label={t("down", { name: r.title })}>
                  <IconArrowDown aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
