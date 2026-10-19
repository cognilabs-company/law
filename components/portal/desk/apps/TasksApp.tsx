"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createTask, deleteTask, listMyTasks, updateTask, type TaskCheckItem, type WorkTask } from "@/lib/services/backend";
import { dateOnly } from "@/lib/date";
import { IconAlert, IconCalendar, IconCheck, IconClipboardList, IconClose, IconFileText, IconFlag, IconGrid, IconList, IconPlus, IconStarRate, IconSun, IconTrash } from "@/components/icons";
import { App, Btn, Check, Empty, Field, Loading, Search, Seg, Select, Sidebar, TextArea, Toggle, Tool, Toolbar, useConfirm, useHost, useOs, useToast, type NavSection } from "../kit/kit";
import { DateField } from "../kit/pickers";
import type { NativeProps } from "../native";
import "./tasks.css";

// Tasks as a desktop program: Microsoft To Do on Windows, Reminders on the
// Mac. Smart lists (today, planned, important, overdue, everything) and the
// four stages on the side; the list, or the stages as a board, in the
// middle; the chosen task's details on the right, saved as they change.
// The same backend as the cabinet's board: stages todo · doing · review ·
// done, "blocked" as a flag.

const STAGES = ["todo", "doing", "review", "done"] as const;
type Stage = (typeof STAGES)[number];
const LEGACY: Record<string, Stage> = { todo: "todo", new: "todo", open: "todo", pending: "todo", blocked: "todo", doing: "doing", in_progress: "doing", active: "doing", review: "review", quality_check: "review", done: "done", completed: "done", closed: "done" };
const stageOf = (s: string): Stage => LEGACY[(s || "").toLowerCase()] ?? "todo";
const PRIOS = ["low", "medium", "high"] as const;
const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SMART = ["today", "planned", "important", "overdue", "all"] as const;
type ListId = (typeof SMART)[number] | Stage | "blocked";
const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const STAGE_TONE: Record<Stage, string> = { todo: "#8e8e93", doing: "#0a84ff", review: "#ff9f0a", done: "#30d158" };

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the desktop's props; this app needs none of them
export default function TasksApp(_props: NativeProps) {
  const t = useTranslations("portal.tasks");
  const d = useTranslations("portal.desk.tasks");
  const locale = useLocale();
  const os = useOs();
  const { menu } = useHost();
  const [tasks, setTasks] = useState<WorkTask[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [list, setList] = useState<ListId>("today");
  const [view, setView] = useState<"list" | "board">("list");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [today, setToday] = useState("");
  const [confirmNode, confirm] = useConfirm();
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => setToday(dayOf(new Date())), 0);
    listMyTasks()
      .then((l) => alive && setTasks(l))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, []);

  const all = useMemo(() => tasks ?? [], [tasks]);
  const open = (x: WorkTask) => stageOf(x.status) !== "done";
  const due = (x: WorkTask) => (x.dueDate ?? "").slice(0, 10);
  const overdue = (x: WorkTask) => !!due(x) && !!today && due(x) < today && open(x);
  const inList = (x: WorkTask, l: ListId): boolean => {
    switch (l) {
      case "today":
        return open(x) && !!due(x) && due(x) <= today;
      case "planned":
        return open(x) && !!due(x);
      case "important":
        return open(x) && x.priority === "high";
      case "overdue":
        return overdue(x);
      case "all":
        return open(x);
      case "blocked":
        return x.status === "blocked";
      default:
        return stageOf(x.status) === l;
    }
  };
  const needle = q.trim().toLowerCase();
  const matches = (x: WorkTask) => !needle || `${x.title} ${x.description ?? ""} ${x.caseTitle ?? ""}`.toLowerCase().includes(needle);
  const sorted = (l: WorkTask[]) => [...l].sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1) || (due(a) || "9").localeCompare(due(b) || "9"));
  const shown = sorted(all.filter((x) => (needle ? true : inList(x, list)) && matches(x)));
  const count = (l: ListId) => all.filter((x) => inList(x, l)).length;
  const current = all.find((x) => x.id === sel) ?? null;
  const listName = (l: ListId) => (needle ? d("results") : (SMART as readonly string[]).includes(l) ? d(`smart.${l}`) : l === "blocked" ? t("blocked") : t(`stages.${l}`));

  // ── changes, saved as they are made ─────────────────────────────────────
  const patchLocal = (id: string, p: Partial<WorkTask>) => setTasks((l) => (l ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)));
  async function save(x: WorkTask, p: Partial<WorkTask>) {
    const before = x;
    patchLocal(x.id, p);
    try {
      const body = {
        ...(p.title !== undefined ? { title: p.title } : {}),
        ...(p.status !== undefined ? { status: p.status } : {}),
        ...(p.priority !== undefined ? { priority: p.priority } : {}),
        ...(p.dueDate !== undefined ? { due_date: p.dueDate || undefined } : {}),
        ...(p.description !== undefined ? { description: p.description } : {}),
        ...(p.caseTitle !== undefined ? { case_title: p.caseTitle } : {}),
        ...(p.checklist !== undefined ? { checklist: p.checklist } : {}),
      };
      const saved = await updateTask(x.id, body);
      patchLocal(x.id, { ...saved, ...p });
    } catch {
      patchLocal(x.id, before);
      say(t("saveFailed"), "err");
    }
  }
  const setStage = (x: WorkTask, s: Stage) => save(x, { status: s });
  const toggleDone = (x: WorkTask) => setStage(x, open(x) ? "done" : "todo");
  async function add(title: string, stage?: Stage) {
    const name = title.trim();
    if (!name) return;
    const inherits: { due_date?: string; priority?: string; status?: string } = {};
    if (!stage && (list === "today" || list === "overdue")) inherits.due_date = today;
    if (!stage && list === "important") inherits.priority = "high";
    if (stage) inherits.status = stage;
    else if ((STAGES as readonly string[]).includes(list)) inherits.status = list;
    try {
      const x = await createTask({ title: name, priority: inherits.priority ?? "medium", ...inherits });
      setTasks((l) => [x, ...(l ?? [])]);
      setSel(x.id);
    } catch {
      say(t("createFailed"), "err");
    }
  }
  async function remove(x: WorkTask) {
    const ok = await confirm({ title: t("deleteTitle"), text: t("deleteText", { title: x.title || "" }), ok: t("delete"), cancel: t("cancel"), danger: true });
    if (!ok) return;
    try {
      await deleteTask(x.id);
      setTasks((l) => (l ?? []).filter((y) => y.id !== x.id));
      if (sel === x.id) setSel("");
      say(t("deleted"));
    } catch {
      say(t("deleteFailed"), "err");
    }
  }

  const rowMenu = (e: MouseEvent, x: WorkTask) =>
    menu?.(e, x.title, [
      { id: "done", label: open(x) ? d("markDone") : d("markOpen"), icon: <IconCheck />, onSelect: () => void toggleDone(x) },
      { sep: true, id: "s1" },
      { heading: d("moveTo"), id: "h-st" },
      ...STAGES.map((s) => ({ id: `st-${s}`, label: t(`stages.${s}`), checked: stageOf(x.status) === s, onSelect: () => void setStage(x, s) })),
      { sep: true, id: "s2" },
      { heading: t("priorityLabel"), id: "h-pr" },
      ...PRIOS.map((p) => ({ id: `pr-${p}`, label: t(`priority.${p}`), checked: x.priority === p, onSelect: () => void save(x, { priority: p }) })),
      { sep: true, id: "s3" },
      { id: "blk", label: t("blocked"), checked: x.status === "blocked", onSelect: () => void save(x, { status: x.status === "blocked" ? "todo" : "blocked" }) },
      { id: "del", label: t("delete"), icon: <IconTrash />, danger: true, onSelect: () => void remove(x) },
    ]);
  const onListKey = (e: KeyboardEvent) => {
    if (!current || (e.target as HTMLElement).closest("input,textarea")) return;
    if (e.key === "Delete" || e.key === "Backspace") void remove(current);
    if (e.key === " ") {
      e.preventDefault();
      void toggleDone(current);
    }
  };

  const smartIcon: Record<string, ReactNode> = { today: <IconSun />, planned: <IconCalendar />, important: <IconStarRate />, overdue: <IconAlert />, all: <IconClipboardList /> };
  const sections: NavSection[] = [
    { id: "smart", items: SMART.map((s) => ({ id: s, label: d(`smart.${s}`), icon: smartIcon[s], count: count(s) })) },
    { id: "stages", title: d("stagesTitle"), items: [...STAGES.map((s) => ({ id: s, label: t(`stages.${s}`), dot: STAGE_TONE[s], count: count(s) })), { id: "blocked", label: t("blocked"), dot: "#ff453a", count: count("blocked") }] },
  ];
  // The Mac's Reminders: the smart lists as coloured tiles on top.
  const tiles =
    os === "mac" ? (
      <div className="dxt-tiles">
        {SMART.slice(0, 4).map((s) => (
          <button key={s} type="button" className={`dxt-tile dxt-tile--${s}${list === s && !needle ? " is-on" : ""}`} onClick={() => setList(s)}>
            <i>{smartIcon[s]}</i>
            <b>{count(s)}</b>
            <span>{d(`smart.${s}`)}</span>
          </button>
        ))}
      </div>
    ) : null;
  const sideSections = os === "mac" ? [{ ...sections[0], items: sections[0].items.slice(4) }, sections[1]] : sections;

  const body =
    tasks === null ? (
      failed ? (
        <Empty icon={<IconAlert />} title={t("loadError")} />
      ) : (
        <Loading label={d("loading")} />
      )
    ) : view === "board" && !needle ? (
      <Board tasks={sorted(all.filter(matches))} selected={sel} onSelect={setSel} onMove={(x, s) => void setStage(x, s)} onMenu={rowMenu} overdue={overdue} onAdd={(title, s) => void add(title, s)} />
    ) : (
      <div className="dxt-list" onKeyDown={onListKey}>
        {shown.length ? (
          <div className="dx-list" role="listbox" aria-label={listName(list)}>
            {shown.map((x) => (
              <TaskRow key={x.id} x={x} selected={sel === x.id} overdue={overdue(x)} onSelect={() => setSel(x.id)} onToggle={() => void toggleDone(x)} onStar={() => void save(x, { priority: x.priority === "high" ? "medium" : "high" })} onMenu={(e) => rowMenu(e, x)} />
            ))}
          </div>
        ) : (
          <Empty icon={<IconCheck />} title={needle ? d("noResults") : d(`empty.${list}`)} text={needle ? undefined : d("emptyHint")} />
        )}
        <QuickAdd placeholder={os === "mac" ? d("newMac") : d("newWin")} onAdd={(v) => void add(v)} />
      </div>
    );

  return (
    <App
      name="tasks"
      sidebar={<Sidebar label={t("title")} header={tiles ?? <Search value={q} onChange={setQ} placeholder={d("search")} wide />} sections={sideSections} value={needle ? "" : list} onChange={(id) => (setQ(""), setList(id as ListId))} />}
      inspector={current ? <Details key={current.id} x={current} onSave={(p) => void save(current, p)} onClose={() => setSel("")} onDelete={() => void remove(current)} locale={locale} /> : undefined}
    >
      <Toolbar
        title={listName(list)}
        subtitle={tasks ? d("countOpen", { n: shown.length }) : undefined}
        end={os === "mac" ? <Search value={q} onChange={setQ} placeholder={d("search")} /> : undefined}
      >
        <Tool icon={<IconPlus />} label={t("add")} primary onClick={() => document.querySelector<HTMLInputElement>(".dx-app--tasks .dxt-add input")?.focus()} />
        {os === "win" ? <span className="dx-sep" aria-hidden /> : null}
        <Seg
          label={d("view")}
          small
          value={view}
          onChange={setView}
          items={[
            { id: "list", label: d("viewList"), icon: <IconList /> },
            { id: "board", label: d("viewBoard"), icon: <IconGrid /> },
          ]}
        />
      </Toolbar>
      {body}
      {confirmNode}
      {toast}
    </App>
  );
}

// One task in the list: done circle, title, its date (red when late), stage,
// case and steps; the Mac marks it important with !!!, Windows with a star.
function TaskRow({ x, selected, overdue: late, onSelect, onToggle, onStar, onMenu }: { x: WorkTask; selected: boolean; overdue: boolean; onSelect: () => void; onToggle: () => void; onStar: () => void; onMenu: (e: MouseEvent) => void }) {
  const t = useTranslations("portal.tasks");
  const d = useTranslations("portal.desk.tasks");
  const locale = useLocale();
  const os = useOs();
  const done = stageOf(x.status) === "done";
  const steps = x.checklist ?? [];
  const sub = [x.caseTitle, steps.length ? t("checklistCount", { done: steps.filter((c) => c.done).length, total: steps.length }) : ""].filter(Boolean);
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={`dx-row dxt-row${selected ? " is-on" : ""}${done ? " is-done" : ""}`}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect();
        onMenu(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const sib = (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null;
          sib?.click();
          sib?.focus();
        }
      }}
    >
      <Check round checked={done} onChange={onToggle} label={done ? d("markOpen") : d("markDone")} />
      <span className="dx-row__t">
        <b>{x.title || "—"}</b>
        <small>
          {x.dueDate ? (
            <span className={late ? "dxt-late" : ""}>
              <IconCalendar aria-hidden />
              {late ? d("overdueOn", { date: dateOnly(x.dueDate, locale) }) : dateOnly(x.dueDate, locale)}
            </span>
          ) : null}
          {x.status === "blocked" ? <span className="dxt-blk">{t("blocked")}</span> : null}
          {stageOf(x.status) === "doing" || stageOf(x.status) === "review" ? <span className="dxt-stage" style={{ color: STAGE_TONE[stageOf(x.status)] }}>{t(`stages.${stageOf(x.status)}`)}</span> : null}
          {sub.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </small>
      </span>
      {os === "mac" ? (
        x.priority === "high" ? (
          <span className="dxt-prio" title={t("priority.high")}>
            !!!
          </span>
        ) : null
      ) : (
        <button type="button" className={`dxt-star${x.priority === "high" ? " is-on" : ""}`} onClick={(e) => (e.stopPropagation(), onStar())} aria-pressed={x.priority === "high"} aria-label={d("important")} title={d("important")}>
          <IconStarRate />
        </button>
      )}
    </div>
  );
}

// Type and press Enter: a new task in the list in view.
function QuickAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="dxt-add"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(v);
        setV("");
      }}
    >
      <IconPlus aria-hidden />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={200} />
    </form>
  );
}

// A new card at the foot of a column: "+ Add task", then a field.
function ColumnAdd({ label, onAdd }: { label: string; onAdd: (v: string) => void }) {
  const d = useTranslations("portal.desk.tasks");
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open)
    return (
      <button type="button" className="dxt-coladd" onClick={() => setOpen(true)}>
        <IconPlus aria-hidden />
        {d("newWin")}
      </button>
    );
  return (
    <form
      className="dxt-colform"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onAdd(v);
        setV("");
      }}
    >
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
          if (e.key === "Escape") {
            setOpen(false);
            setV("");
          }
        }}
        onBlur={() => !v.trim() && setOpen(false)}
        placeholder={label}
        aria-label={label}
        rows={2}
        maxLength={200}
        autoFocus
      />
      <span>
        <Btn kind="primary" small type="submit" disabled={!v.trim()}>
          {d("add")}
        </Btn>
        <Btn kind="plain" small icon={<IconClose />} title={d("cancel")} onClick={() => (setOpen(false), setV(""))} />
      </span>
    </form>
  );
}

// The stages side by side; a card is dragged from one to another.
function Board({ tasks, selected, onSelect, onMove, onMenu, overdue, onAdd }: { tasks: WorkTask[]; selected: string; onSelect: (id: string) => void; onMove: (x: WorkTask, s: Stage) => void; onMenu: (e: MouseEvent, x: WorkTask) => void; overdue: (x: WorkTask) => boolean; onAdd: (title: string, s: Stage) => void }) {
  const t = useTranslations("portal.tasks");
  const d = useTranslations("portal.desk.tasks");
  const locale = useLocale();
  const [over, setOver] = useState<Stage | null>(null);
  const drag = useRef<string>("");
  const drop = (e: DragEvent, s: Stage) => {
    e.preventDefault();
    const x = tasks.find((y) => y.id === drag.current);
    if (x && stageOf(x.status) !== s) onMove(x, s);
    setOver(null);
  };
  return (
    <div className="dxt-board">
      {STAGES.map((s) => {
        const col = tasks.filter((x) => stageOf(x.status) === s);
        return (
          <section
            key={s}
            className={`dxt-col${over === s ? " is-over" : ""}`}
            aria-label={t(`stages.${s}`)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s);
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
            onDrop={(e) => drop(e, s)}
          >
            <header>
              <i style={{ background: STAGE_TONE[s] }} aria-hidden />
              <b>{t(`stages.${s}`)}</b>
              <small>{col.length}</small>
            </header>
            <div className="dxt-col__cards">
              {col.map((x) => (
                <article
                  key={x.id}
                  className={`dxt-card${selected === x.id ? " is-on" : ""}${overdue(x) ? " is-late" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    drag.current = x.id;
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onSelect(x.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSelect(x.id);
                    onMenu(e, x);
                  }}
                >
                  <b>{x.title || "—"}</b>
                  {x.caseTitle ? <small>{x.caseTitle}</small> : null}
                  <footer>
                    <span className={`dxt-pr dxt-pr--${x.priority}`}>{t.has(`priority.${x.priority}`) ? t(`priority.${x.priority}`) : x.priority}</span>
                    {x.dueDate ? (
                      <span className={overdue(x) ? "dxt-late" : ""}>
                        <IconCalendar aria-hidden />
                        {dateOnly(x.dueDate, locale)}
                      </span>
                    ) : null}
                    {x.status === "blocked" ? <IconFlag className="dxt-blkic" aria-label={t("blocked")} /> : null}
                  </footer>
                </article>
              ))}
              <ColumnAdd label={d("addTo", { stage: t(`stages.${s}`) })} onAdd={(v) => onAdd(v, s)} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

// The chosen task, every field of it, each saved when it is left.
function Details({ x, onSave, onClose, onDelete, locale }: { x: WorkTask; onSave: (p: Partial<WorkTask>) => void; onClose: () => void; onDelete: () => void; locale: string }) {
  const t = useTranslations("portal.tasks");
  const d = useTranslations("portal.desk.tasks");
  const [title, setTitle] = useState(x.title);
  const [notes, setNotes] = useState(x.description ?? "");
  const [caseTitle, setCaseTitle] = useState(x.caseTitle ?? "");
  const [step, setStep] = useState("");
  const steps: TaskCheckItem[] = x.checklist ?? [];
  const commit = <K extends keyof WorkTask>(k: K, v: WorkTask[K], was: WorkTask[K]) => v !== was && onSave({ [k]: v } as Partial<WorkTask>);
  const setSteps = (next: TaskCheckItem[]) => onSave({ checklist: next });
  return (
    <aside className="dxt-insp" aria-label={d("details")}>
      <header className="dxt-insp__h">
        <b>{d("details")}</b>
        <Btn kind="plain" small icon={<IconClose />} title={d("closeDetails")} onClick={onClose} />
      </header>
      <div className="dxt-insp__b">
        <div className="dxt-insp__title">
          <Check round checked={stageOf(x.status) === "done"} onChange={(v) => onSave({ status: v ? "done" : "todo" })} label={d("markDone")} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && commit("title", title.trim(), x.title)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label={t("taskTitle")} maxLength={200} />
        </div>

        <div className="dxt-steps">
          {steps.map((c, i) => (
            <div key={i} className="dxt-step">
              <Check round checked={c.done} onChange={(v) => setSteps(steps.map((y, k) => (k === i ? { ...y, done: v } : y)))} label={c.text} />
              <span className={c.done ? "is-done" : ""}>{c.text}</span>
              <button type="button" onClick={() => setSteps(steps.filter((_, k) => k !== i))} aria-label={t("delete")} title={t("delete")}>
                <IconClose />
              </button>
            </div>
          ))}
          <form
            className="dxt-step dxt-step--new"
            onSubmit={(e) => {
              e.preventDefault();
              if (!step.trim()) return;
              setSteps([...steps, { text: step.trim(), done: false }]);
              setStep("");
            }}
          >
            <IconPlus aria-hidden />
            <input value={step} onChange={(e) => setStep(e.target.value)} placeholder={d("addStep")} aria-label={d("addStep")} maxLength={200} />
          </form>
        </div>

        <div className="dxt-insp__fields">
          <Field label={d("stage")}>
            <Select ariaLabel={d("stage")} value={stageOf(x.status)} onChange={(s) => onSave({ status: s })} options={STAGES.map((s) => ({ value: s, label: t(`stages.${s}`) }))} />
          </Field>
          <Field label={t("priorityLabel")}>
            <Seg label={t("priorityLabel")} small value={(PRIOS as readonly string[]).includes(x.priority) ? (x.priority as (typeof PRIOS)[number]) : "medium"} onChange={(p) => onSave({ priority: p })} items={PRIOS.map((p) => ({ id: p, label: t(`priority.${p}`) }))} />
          </Field>
          <Field label={t("due")}>
            <DateField value={(x.dueDate ?? "").slice(0, 10)} onChange={(v) => onSave({ dueDate: v })} ariaLabel={t("due")} placeholder={d("noDueYet")} clearable />
          </Field>
          <Field label={t("caseTitle")}>
            <span className="dxt-case">
              <IconFileText aria-hidden />
              <input className="dx-in" value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} onBlur={() => commit("caseTitle", caseTitle.trim(), x.caseTitle ?? "")} placeholder={t("caseTitlePh")} aria-label={t("caseTitle")} />
            </span>
          </Field>
          <div className="dxt-blkrow">
            <span>
              <b>{t("blocked")}</b>
              <small>{d("blockedHint")}</small>
            </span>
            <Toggle checked={x.status === "blocked"} onChange={(v) => onSave({ status: v ? "blocked" : "todo" })} label={t("blocked")} onText={d("on")} offText={d("off")} />
          </div>
          <Field label={t("description")}>
            <span onBlur={() => commit("description", notes, x.description ?? "")}>
              <TextArea value={notes} onChange={setNotes} rows={5} maxLength={2000} placeholder={d("notesPh")} ariaLabel={t("description")} />
            </span>
          </Field>
        </div>
      </div>
      <footer className="dxt-insp__f">
        <small>{x.createdAt ? d("created", { date: dateOnly(x.createdAt, locale) }) : null}</small>
        <Btn kind="plain" small icon={<IconTrash />} title={t("delete")} onClick={onDelete} />
      </footer>
    </aside>
  );
}
