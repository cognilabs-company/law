"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { listMyTasks, updateTaskStatus, createTask, updateTask, deleteTask, type WorkTask } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import { ApiError } from "@/lib/http";
import { Skeleton, EmptyState } from "./DataState";
import { IconClipboardCheck, IconChevronLeft, IconChevronRight, IconPlus, IconEdit, IconTrash, IconSearch, IconCheck, IconAlert } from "@/components/icons";

// Backend task statuses: todo · doing · review · done (+ blocked as a flag, deleted).
const STAGES = ["todo", "doing", "review", "done"] as const;
type Stage = (typeof STAGES)[number];
const LEGACY: Record<string, Stage> = {
  todo: "todo", new: "todo", open: "todo", pending: "todo", blocked: "todo",
  doing: "doing", in_progress: "doing", active: "doing",
  review: "review", quality_check: "review",
  done: "done", completed: "done", closed: "done",
};
const stageOf = (s: string): Stage => LEGACY[(s || "").toLowerCase()] ?? "todo";
const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const today = () => new Date().toISOString().slice(0, 10);
const fmtDue = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU"); };

type Form = { title: string; priority: string; due: string; description: string; caseTitle: string; checklist: string };
const EMPTY: Form = { title: "", priority: "medium", due: "", description: "", caseTitle: "", checklist: "" };

// Seller task board: four stages, drag-and-drop or arrows, create / edit /
// delete, description and checklist, overdue and blocked markers, search.
// Moves are optimistic (the list is patched first, then synced).
export default function TaskBoard() {
  const t = useTranslations("portal.tasks");
  const res = useResource(() => listMyTasks(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  // The drop-preview slot (below) eases its height in on hover — nice while
  // dragging over a column. But on an actual drop the task list re-sorts
  // (overdue/priority/due-date) in the very same render, so the card that
  // was dropped can land somewhere else in the column while that 200ms ease
  // is still mid-flight, reading as a stutter: cards already resettled,
  // placeholder still shrinking. Set right before the drop-triggered
  // `setOverStage(null)` so that render removes the slot with no transition
  // at all, instead of racing the reflow; a plain drag-away (no drop) still
  // gets the smooth retreat.
  const [dropInstant, setDropInstant] = useState(false);
  const [q, setQ] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const [editing, setEditing] = useState<WorkTask | null | "new">(null);
  const [del, setDel] = useState<WorkTask | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const cols = useMemo(() => {
    const by: Record<Stage, WorkTask[]> = { todo: [], doing: [], review: [], done: [] };
    const needle = q.trim().toLowerCase();
    for (const x of res.data) {
      if (needle && !`${x.title} ${x.description ?? ""} ${x.caseTitle ?? ""}`.toLowerCase().includes(needle)) continue;
      by[stageOf(x.status)].push(x);
    }
    // Overdue first, then priority, then due date.
    const tod = today();
    for (const s of STAGES) by[s].sort((a, b) => {
      const ao = a.dueDate && a.dueDate.slice(0, 10) < tod && s !== "done" ? 0 : 1;
      const bo = b.dueDate && b.dueDate.slice(0, 10) < tod && s !== "done" ? 0 : 1;
      return ao - bo || (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1) || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9");
    });
    return by;
  }, [res.data, q]);
  const shownStages = hideDone ? STAGES.filter((s) => s !== "done") : STAGES;
  const failMsg = (e: unknown) => (e instanceof ApiError && e.status === 403 ? t("forbidden") : e instanceof ApiError && e.detail ? e.detail : t("errorCreate"));

  async function moveTo(x: WorkTask, stage: Stage) {
    if (stageOf(x.status) === stage || busy) return;
    const before = res.data;
    setBusy(x.id);
    setErr(null);
    res.setData((cur) => cur.map((y) => (y.id === x.id ? { ...y, status: stage } : y)));
    try {
      await updateTaskStatus(x.id, stage);
      void res.refresh();
    } catch (e) {
      res.setData(before);
      setErr(failMsg(e));
    } finally {
      setBusy(null);
    }
  }
  function move(x: WorkTask, dir: number) {
    const i = STAGES.indexOf(stageOf(x.status));
    const next = STAGES[Math.min(STAGES.length - 1, Math.max(0, i + dir))];
    void moveTo(x, next);
  }
  async function toggleBlocked(x: WorkTask) {
    if (busy) return;
    setBusy(x.id);
    setErr(null);
    const next = x.status === "blocked" ? "todo" : "blocked";
    try {
      await updateTaskStatus(x.id, next);
      res.setData((cur) => cur.map((y) => (y.id === x.id ? { ...y, status: next } : y)));
    } catch (e) {
      setErr(failMsg(e));
    } finally {
      setBusy(null);
    }
  }
  async function confirmDelete() {
    if (!del || busy) return;
    setBusy(del.id);
    setErr(null);
    try {
      await deleteTask(del.id);
      res.setData((cur) => cur.filter((y) => y.id !== del.id));
      setDel(null);
    } catch (e) {
      setErr(failMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="ahdr">
          <span className="advmuted">{t("count", { n: res.data.length, open: res.data.filter((x) => stageOf(x.status) !== "done").length })}</span>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setEditing("new")}><IconPlus />{t("add")}</button>
        </span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      <div className="lfilters">
        <div className="lsearch"><IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("searchPh")} /></div>
        <label className={`vac${hideDone ? " on" : ""}`}><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /><IconCheck />{t("hideDone")}</label>
      </div>
      {err ? <Notice ok={false} msg={err} /> : null}

      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : res.status === "error" ? (
        <Notice ok={false} msg={t("loadError")} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconClipboardCheck />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="pipe pipe--tasks">
          {shownStages.map((s) => {
            const si = STAGES.indexOf(s);
            return (
              <div
                className={`pipe__col pipe__col--${s === "todo" ? "new" : s === "doing" ? "contacted" : s === "review" ? "proposal" : "won"}${overStage === s ? " pipe__col--over" : ""}`}
                key={s}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropInstant(false); setOverStage(s); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage((cur) => (cur === s ? null : cur)); }}
                onDrop={(e) => { e.preventDefault(); const x = res.data.find((z) => z.id === dragId); if (x) void moveTo(x, s); setDragId(null); setDropInstant(true); setOverStage(null); }}
              >
                <div className="pipe__head">
                  <span className="pipe__dot" />
                  <b>{t(`stages.${s}`)}</b>
                  <span className="pipe__count">{cols[s].length}</span>
                </div>
                <div className="pipe__cards">
                  <div className={`pipe__slot${overStage === s && dragId ? " on" : ""}${dropInstant ? " pipe__slot--instant" : ""}`} aria-hidden />
                  {cols[s].length === 0 ? (
                    <div className="pipe__empty">{t("noneHere")}</div>
                  ) : (
                    cols[s].map((x) => {
                      const overdue = !!x.dueDate && x.dueDate.slice(0, 10) < today() && s !== "done";
                      const blocked = x.status === "blocked";
                      const done = x.checklist?.filter((c) => c.done).length ?? 0;
                      return (
                        <div
                          className={`pipe__card task${dragId === x.id ? " pipe__card--drag" : ""}${overdue ? " task--overdue" : ""}${blocked ? " task--blocked" : ""}`}
                          key={x.id}
                          draggable
                          onDragStart={(e) => { setDragId(x.id); e.dataTransfer.effectAllowed = "move"; }}
                          onDragEnd={() => { setDragId(null); setOverStage(null); }}
                        >
                          <div className="pipe__ctop">
                            <b>{x.title || "—"}</b>
                            <span className={`tprio tprio--${x.priority}`}>{t.has(`priority.${x.priority}`) ? t(`priority.${x.priority}`) : x.priority}</span>
                          </div>
                          {x.description ? <p className="task__desc">{x.description}</p> : null}
                          <div className="task__meta">
                            {x.caseTitle ? <span className="pipe__meta">{x.caseTitle}</span> : null}
                            {x.dueDate ? <span className={`pipe__meta${overdue ? " task__due--over" : ""}`}>{overdue ? <IconAlert /> : null}{t("due")}: {fmtDue(x.dueDate)}</span> : null}
                            {x.checklist?.length ? <span className="pipe__meta">{t("checklistCount", { done, total: x.checklist.length })}</span> : null}
                            {blocked ? <span className="pipe__meta task__blocked">{t("blocked")}</span> : null}
                          </div>
                          <div className="pipe__actions">
                            <button className="pipe__mv" disabled={si === 0 || busy === x.id} onClick={() => move(x, -1)} aria-label={t("back")}><IconChevronLeft /></button>
                            <span className="task__tools">
                              <button type="button" className="aitem__act" onClick={() => setEditing(x)} aria-label={t("edit")} title={t("edit")}><IconEdit /></button>
                              <button type="button" className={`aitem__act${blocked ? " on" : ""}`} onClick={() => void toggleBlocked(x)} aria-label={t("toggleBlocked")} title={t("toggleBlocked")} disabled={busy === x.id}><IconAlert /></button>
                              <button type="button" className="aitem__act aitem__act--danger" onClick={() => setDel(x)} aria-label={t("delete")} title={t("delete")}><IconTrash /></button>
                            </span>
                            <button className="pipe__mv" disabled={si === STAGES.length - 1 || busy === x.id} onClick={() => move(x, 1)} aria-label={t("fwd")}><IconChevronRight /></button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskModal
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(x, isNew) => {
          res.setData((cur) => (isNew ? [x, ...cur] : cur.map((y) => (y.id === x.id ? x : y))));
          setEditing(null);
          void res.refresh();
        }}
      />
      <Modal open={!!del} onClose={() => setDel(null)} title={t("deleteTitle")}>
        <p className="advmuted">{t("deleteText", { title: del?.title ?? "" })}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setDel(null)}>{t("cancel")}</button>
          <button type="button" className="btn btn--pri btn--sm" style={{ background: "#e5484d", boxShadow: "none" }} onClick={() => void confirmDelete()} disabled={!!busy}>{t("delete")}</button>
        </div>
      </Modal>
    </div>
  );
}

function TaskModal({ target, onClose, onSaved }: { target: WorkTask | "new" | null; onClose: () => void; onSaved: (x: WorkTask, isNew: boolean) => void }) {
  const t = useTranslations("portal.tasks");
  const isNew = target === "new";
  const [form, setForm] = useState<Form & { key: string }>({ ...EMPTY, key: "" });
  // Re-seed the form when another task opens (compared during render).
  const key = target === null ? "" : isNew ? "new" : target.id;
  if (target !== null && form.key !== key) {
    setForm(isNew ? { ...EMPTY, key } : { key, title: target.title, priority: target.priority || "medium", due: (target.dueDate ?? "").slice(0, 10), description: target.description ?? "", caseTitle: target.caseTitle ?? "", checklist: (target.checklist ?? []).map((c) => `${c.done ? "[x] " : ""}${c.text}`).join("\n") });
  }
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const checklist = form.checklist.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ text: l.replace(/^\[(x| )\]\s*/i, ""), done: /^\[x\]/i.test(l) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || !form.title.trim()) return;
    setSaving(true);
    setNote(null);
    try {
      const body = { title: form.title.trim(), priority: form.priority, due_date: form.due || undefined, description: form.description.trim() || undefined, case_title: form.caseTitle.trim() || undefined, checklist };
      const x = isNew ? await createTask(body) : await updateTask((target as WorkTask).id, body);
      onSaved(x, isNew);
    } catch (err) {
      setNote({ ok: false, msg: err instanceof ApiError && err.detail ? err.detail : t("errorCreate") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={target !== null} onClose={onClose} title={isNew ? t("add") : t("editTitle")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
        <div>
          <label>{t("taskTitle")}</label>
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder={t("taskTitlePh")} required maxLength={200} />
        </div>
        <div className="cform__row2">
          <div>
            <label>{t("priorityLabel")}</label>
            <Select value={form.priority} onChange={(v) => set({ priority: v })} options={["low", "medium", "high"].map((p) => ({ value: p, label: t(`priority.${p}`) }))} ariaLabel={t("priorityLabel")} />
          </div>
          <div>
            <label>{t("due")}</label>
            <DatePicker value={form.due} onChange={(v) => set({ due: v })} placeholder={t("due")} ariaLabel={t("due")} />
          </div>
        </div>
        <div>
          <label>{t("caseTitle")}</label>
          <input value={form.caseTitle} onChange={(e) => set({ caseTitle: e.target.value })} placeholder={t("caseTitlePh")} />
        </div>
        <div>
          <label>{t("description")}</label>
          <textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={2000} />
        </div>
        <div>
          <label>{t("checklist")}</label>
          <textarea rows={3} value={form.checklist} onChange={(e) => set({ checklist: e.target.value })} placeholder={t("checklistPh")} />
          <p className="rf__hint">{t("checklistHint")}</p>
        </div>
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button className="btn btn--pri btn--full" type="submit" disabled={saving || !form.title.trim()}>{saving ? t("saving") : t("save")}</button>
      </form>
    </Modal>
  );
}
