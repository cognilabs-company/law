"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import DatePicker from "@/components/DatePicker";
import ListPager from "@/components/ui/ListPager";
import { Archive, CalendarRange, ClipboardList, Inbox, Plus, RotateCcw, User, X } from "lucide-react";
import { isAborted } from "@/lib/http";
import { notify } from "@/lib/toast";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import {
  TASK_EVENT_PREFIX,
  TASK_PERIOD_FIELDS,
  TASK_STATUSES,
  changeTaskStatus,
  simpleFlowAllows,
  simpleFlowView,
  usesSimpleTaskFlow,
  deleteTask,
  getTask,
  getTaskMeta,
  isReturn,
  listTasksInPeriod,
  searchTaskUsers,
  taskErrorOf,
  type Task,
  type TaskCounts,
  type TaskError,
  type TaskMeta,
  type TaskPeriodField,
  type TaskStatus,
} from "@/lib/services/taskManagement";
import { Deadline, Handoff, STATUS_ICON, STROKE, StatusActions, StatusPill, TodayDate, useTaskText } from "./parts";
import { TaskKpis, TaskProgress, useTaskStats } from "./TaskStats";
import TaskDetail from "./TaskDetail";
import TaskForm, { type TaskFormMode } from "./TaskForm";
import ReasonDialog from "./ReasonDialog";
import { useAuth } from "@/lib/auth";
import "./tasks.css";

const PAGE = 30;
const ZERO: TaskCounts = { new: 0, in_progress: 0, testing: 0, ready: 0 };

type ListState = { items: Task[]; total: number; counts: TaskCounts; hasMore: boolean; loading: boolean; error: string; ready: boolean };
type Reason = { kind: "return"; task: Task } | { kind: "delete"; task: Task } | { kind: "approve"; task: Task };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Quick ranges for the period bar, as local calendar days.
function presetRange(key: "today" | "week" | "month"): { from: string; to: string } {
  const now = new Date();
  if (key === "today") return { from: ymd(now), to: ymd(now) };
  if (key === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}
const PRESETS = ["today", "week", "month"] as const;

function readTaskParam(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("task") ?? "";
}

function writeTaskParam(id: string) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("task", id);
  else url.searchParams.delete("task");
  window.history.replaceState(window.history.state, "", url);
}

export default function TeamTasksPage() {
  const { t, status: statusLabel, when } = useTaskText();
  const simple = usesSimpleTaskFlow(useAuth().session?.id);
  const shown = (task: Task) => (simple ? simpleFlowView(task) : task);
  const [meta, setMeta] = useState<TaskMeta | null>(null);
  const [denied, setDenied] = useState("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [assignee, setAssignee] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Which date the period applies to (deadline, created, completed).
  const [periodField, setPeriodField] = useState<TaskPeriodField>("deadline");
  const [people, setPeople] = useState<{ value: string; label: string }[]>([]);
  const [list, setList] = useState<ListState>({ items: [], total: 0, counts: ZERO, hasMore: false, loading: true, error: "", ready: false });
  const [openId, setOpenId] = useState("");
  const [statsTick, setStatsTick] = useState(0);
  // One period for the whole page, sent as inclusive days with the date it
  // applies to: the list and its status counts keep the tasks whose
  // deadline / creation / completion falls in it; the stats cards count the
  // activity inside it. Both endpoints want both ends, so an open end
  // becomes the other one.
  const period = from || to ? { from: from || to, to: to || from } : null;
  const stats = useTaskStats(statsTick, period);
  const [detail, setDetail] = useState<Task | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [form, setForm] = useState<TaskFormMode | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const seq = useRef(0);
  // The backend has no period contract yet: only the deadline range works,
  // so the date-field switch is not offered.
  const legacyRef = useRef(false);
  const [legacyPeriod, setLegacyPeriod] = useState(false);
  const loaded = useRef(0);
  const openRef = useRef("");
  const detailSeq = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(id);
  }, [qInput]);

  useEffect(() => {
    const c = new AbortController();
    getTaskMeta(c.signal).then(setMeta, (e) => {
      if (isAborted(e)) return;
      const te = taskErrorOf(e);
      if (te.kind === "forbidden") setDenied(te.message || t("denied"));
    });
    searchTaskUsers("", c.signal).then(
      (us) => setPeople(us.map((u) => ({ value: u.id, label: u.name || u.lexgoId }))),
      () => undefined,
    );
    return () => c.abort();
  }, [t]);

  const filters = useMemo(
    () => ({ status, assignee, q, dateFrom: period?.from ?? "", dateTo: period?.to ?? "", periodField }),
    // period is derived from from/to
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, assignee, q, from, to, periodField],
  );

  // The list's status_counts apply every active filter except status itself
  // (period, period field, search, assignee), so one request gives the
  // sidebar and the period cards their totals — no per-status calls.
  const scopedCounts = period ? list.counts : null;

  const load = useCallback(
    async (mode: "reset" | "more" | "refresh") => {
      const n = ++seq.current;
      if (mode === "refresh") setStatsTick((k) => k + 1);
      const offset = mode === "more" ? loaded.current : 0;
      const limit = mode === "refresh" ? Math.min(100, Math.max(PAGE, loaded.current)) : PAGE;
      setList((s) => ({ ...s, loading: true, error: mode === "more" ? s.error : "", ...(mode === "reset" ? { items: [], ready: false } : {}) }));
      try {
        const page = await listTasksInPeriod({ ...filters, periodField: legacyRef.current ? "deadline" : filters.periodField, limit, offset });
        if (n === seq.current) {
          legacyRef.current = !!page.legacyPeriod;
          setLegacyPeriod(!!page.legacyPeriod);
        }
        if (n !== seq.current) return;
        setList((s) => {
          const items = mode === "more" ? [...s.items, ...page.items.filter((x) => !s.items.some((y) => y.id === x.id))] : page.items;
          loaded.current = items.length;
          return { items, total: page.total, counts: page.counts, hasMore: page.hasMore, loading: false, error: "", ready: true };
        });
      } catch (e) {
        if (n !== seq.current || isAborted(e)) return;
        const te = taskErrorOf(e);
        if (te.kind === "forbidden") setDenied(te.message || t("denied"));
        setList((s) => ({ ...s, loading: false, ready: true, error: te.kind === "unavailable" ? t("err.unavailable") : te.kind === "network" ? t("err.network") : te.message || t("err.load") }));
      }
    },
    [filters, t],
  );

  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (live) void load("reset");
    });
    return () => {
      live = false;
    };
  }, [load]);

  const loadDetail = useCallback(
    async (id: string) => {
      const n = ++detailSeq.current;
      setDetailLoading(true);
      setDetailErr("");
      try {
        const task = await getTask(id);
        if (n !== detailSeq.current || openRef.current !== id) return;
        setDetail(task);
      } catch (e) {
        if (n !== detailSeq.current || openRef.current !== id) return;
        const te = taskErrorOf(e);
        if (te.kind === "missing") {
          setDetail(null);
          setDetailErr(t("err.missing"));
          setList((s) => ({ ...s, items: s.items.filter((x) => x.id !== id) }));
        } else setDetailErr(te.message || t("err.load"));
      } finally {
        if (n === detailSeq.current) setDetailLoading(false);
      }
    },
    [t],
  );

  const open = useCallback(
    (id: string, seed?: Task) => {
      openRef.current = id;
      setOpenId(id);
      setNotice("");
      setDetail(seed ?? null);
      writeTaskParam(id);
      void loadDetail(id);
    },
    [loadDetail],
  );

  const close = useCallback(() => {
    openRef.current = "";
    detailSeq.current++;
    setOpenId("");
    setDetail(null);
    setDetailErr("");
    setNotice("");
    writeTaskParam("");
  }, []);

  useEffect(() => {
    const id = readTaskParam();
    if (!id) return;
    let live = true;
    queueMicrotask(() => {
      if (live) open(id);
    });
    return () => {
      live = false;
    };
  }, [open]);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(
    (taskId = "") => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void load("refresh");
        if (openRef.current && (!taskId || taskId === openRef.current)) void loadDetail(openRef.current);
      }, 250);
    },
    [load, loadDetail],
  );

  useEffect(() => {
    const off1 = subscribeUserEvents((e) => {
      if (typeof e.event !== "string" || !e.event.startsWith(TASK_EVENT_PREFIX)) return;
      refresh(typeof e.task_id === "string" ? e.task_id : "");
    });
    const off2 = onUserSocketResync(() => refresh());
    return () => {
      off1();
      off2();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh]);

  const handleError = useCallback(
    (te: TaskError, task: Task | null): boolean => {
      if (te.kind === "conflict") {
        notify.warning(t("err.conflict"));
        if (task) {
          if (openRef.current !== task.id) open(task.id, task);
          else void loadDetail(task.id);
          setNotice(t("err.conflictNotice"));
        }
        void load("refresh");
        return true;
      }
      if (te.kind === "forbidden") {
        notify.error(te.message || t("err.forbidden"));
        refresh(task?.id);
        return true;
      }
      if (te.kind === "missing") {
        notify.error(t("err.missing"));
        if (task) setList((s) => ({ ...s, items: s.items.filter((x) => x.id !== task.id) }));
        if (task && openRef.current === task.id) close();
        void load("refresh");
        return true;
      }
      return false;
    },
    [close, load, loadDetail, open, refresh, t],
  );

  const applied = (task: Task) => {
    setList((s) => ({ ...s, items: s.items.map((x) => (x.id === task.id ? { ...task, history: x.history } : x)) }));
    if (openRef.current === task.id) void loadDetail(task.id);
    void load("refresh");
  };

  const move = async (task: Task, toStatus: TaskStatus) => {
    if (simple && !simpleFlowAllows(task.status, toStatus)) return;
    if (isReturn(task.status, toStatus)) {
      setReason({ kind: "return", task });
      return;
    }
    setBusyId(task.id);
    try {
      const next = await changeTaskStatus(task, toStatus);
      notify.success(t("moved", { code: task.code, status: statusLabel(toStatus) }));
      applied(next);
    } catch (e) {
      const te = taskErrorOf(e);
      if (!handleError(te, task)) notify.error(te.kind === "unavailable" ? t("err.unavailable") : te.kind === "network" ? t("err.network") : te.message || t("err.save"));
    } finally {
      setBusyId("");
    }
  };

  const submitReason = async (text: string): Promise<string | null> => {
    if (!reason) return null;
    const task = reason.task;
    try {
      if (reason.kind === "return") {
        applied(await changeTaskStatus(task, "in_progress", text));
        notify.success(t("returned", { code: task.code }));
      } else {
        await deleteTask(task, reason.kind === "approve" ? t("approveReason", { note: text.trim() }) : text);
        notify.success(reason.kind === "approve" ? t("approvedOk", { code: task.code }) : t("deletedOk", { code: task.code }));
        setList((s) => ({ ...s, items: s.items.filter((x) => x.id !== task.id) }));
        if (openRef.current === task.id) close();
        void load("refresh");
      }
      setReason(null);
      return null;
    } catch (e) {
      const te = taskErrorOf(e);
      if (handleError(te, task)) {
        setReason(null);
        return null;
      }
      return te.kind === "unavailable" ? t("err.unavailable") : te.kind === "network" ? t("err.network") : te.message || t("err.save");
    }
  };

  const saved = (task: Task | null) => {
    const wasCreate = form?.kind === "create";
    setForm(null);
    if (!task) return;
    notify.success(wasCreate ? t("created", { code: task.code }) : t("saved", { code: task.code }));
    if (wasCreate) {
      void load("refresh");
      open(task.id, task);
    } else applied(task);
  };

  const resetFilters = () => {
    setStatus("");
    setAssignee("");
    setQInput("");
    setQ("");
    setFrom("");
    setTo("");
    setPeriodField("deadline");
  };

  const counts = scopedCounts ?? list.counts;
  const all = TASK_STATUSES.reduce((n, s) => n + counts[s], 0);
  const statusRows: { value: TaskStatus | ""; label: string; n: number }[] = [{ value: "", label: t("allStatuses"), n: all }, ...TASK_STATUSES.map((s) => ({ value: s, label: statusLabel(s), n: counts[s] }))];

  const fields: FilterField[] = [
    {
      key: "assignee",
      label: t("filter.assignee"),
      icon: User,
      value: assignee,
      onChange: setAssignee,
      options: [
        { value: "", label: t("filter.anyone") },
        { value: "me", label: t("filter.me") },
        { value: "unassigned", label: t("filter.unassigned") },
        ...people,
      ],
    },
  ];

  if (denied) {
    return (
      <div className="ttk">
        <div className="ttk-empty ttk-empty--page">
          <span className="ttk-empty__i">
            <ClipboardList aria-hidden strokeWidth={STROKE} />
          </span>
          <h1>{t("title")}</h1>
          <p>{denied}</p>
        </div>
      </div>
    );
  }

  const createBtn = meta?.canCreate ? (
    <button type="button" className="ttk-btn ttk-btn--pri ttk-btn--lg" onClick={() => setForm({ kind: "create" })}>
      <Plus aria-hidden strokeWidth={2} />
      {t("create")}
    </button>
  ) : null;

  const filtered = Boolean(status || assignee || q || from || to);

  return (
    <div className="ttk">
      <header className="ttk-top">
        <div className="ttk-top__t">
          <h1>{t("title")}</h1>
          <p>{t("lead")}</p>
        </div>
        <div className="ttk-top__acts">
          <TodayDate />
          {createBtn}
        </div>
      </header>

      <section className="ttk-period" aria-labelledby="ttk-period-h">
        <span className="ttk-period__ic" aria-hidden>
          <CalendarRange strokeWidth={STROKE} />
        </span>
        <div className="ttk-period__t">
          <p id="ttk-period-h" className="ttk-period__h">
            {t("period.label")}
          </p>
          <p className="ttk-period__hint">{from || to ? t(`period.hintBy.${legacyPeriod ? "deadline" : periodField}`) : t("period.hintOff")}</p>
        </div>
        <div className="ttk-period__chips" role="group" aria-label={t("period.quick")}>
          <button type="button" className={!from && !to ? "ttk-preset is-on" : "ttk-preset"} onClick={() => (setFrom(""), setTo(""))}>
            {t("period.all")}
          </button>
          {PRESETS.map((k) => {
            const r = presetRange(k);
            const on = from === r.from && to === r.to;
            return (
              <button key={k} type="button" className={on ? "ttk-preset is-on" : "ttk-preset"} onClick={() => (setFrom(r.from), setTo(r.to))}>
                {t(`period.${k}`)}
              </button>
            );
          })}
        </div>
        {(from || to) && !legacyPeriod ? (
          <div className="ttk-period__field" role="radiogroup" aria-label={t("period.field.label")}>
            <span className="ttk-period__flbl">{t("period.field.label")}</span>
            {TASK_PERIOD_FIELDS.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={periodField === f} className={periodField === f ? "ttk-preset is-on" : "ttk-preset"} onClick={() => setPeriodField(f)}>
                {t(`period.field.${f}`)}
              </button>
            ))}
          </div>
        ) : null}
        <div className="ttk-period__pick ttk-range">
          <DatePicker value={from} onChange={setFrom} placeholder={t("filter.from")} ariaLabel={t("filter.from")} max={to || undefined} />
          <DatePicker value={to} onChange={setTo} placeholder={t("filter.to")} ariaLabel={t("filter.to")} min={from || undefined} />
          {from || to ? (
            <button type="button" className="ttk-period__x" onClick={() => (setFrom(""), setTo(""))} aria-label={t("period.clear")} title={t("period.clear")}>
              <X aria-hidden strokeWidth={STROKE} />
            </button>
          ) : null}
        </div>
      </section>

      <TaskKpis
        stats={stats.stats}
        hidden={stats.hidden}
        // With a period, a card's detail is the list on the same date the
        // card counts: created in it, or moved to Ready in it.
        onCreated={period && !legacyPeriod ? () => (setPeriodField("created"), setStatus("")) : undefined}
        onReady={() => (period && !legacyPeriod ? (setPeriodField("completed"), setStatus("")) : setStatus("ready"))}
        onUnassigned={() => setAssignee("unassigned")}
        scoped={scopedCounts}
        periodField={legacyPeriod ? "deadline" : periodField}
      />

      <FilterBar fields={fields} search={{ value: qInput, onChange: setQInput, placeholder: t("filter.search"), maxLength: 200 }} count={list.total} onReset={filtered ? resetFilters : undefined} />

      <div className="ttk-body">
        <aside className="ttk-side" aria-label={t("filter.status")}>
          <p className="ttk-side__h">{t("filter.status")}</p>
          <div className="ttk-seg" role="radiogroup" aria-label={t("filter.status")}>
            {statusRows.map((r) => {
              const I = r.value ? STATUS_ICON[r.value] : ClipboardList;
              return (
                <button key={r.value || "all"} type="button" role="radio" aria-checked={status === r.value} className={`ttk-seg__b ttk-seg__b--${r.value || "all"}${status === r.value ? " is-on" : ""}`} onClick={() => setStatus(r.value)}>
                  <span className="ttk-seg__i">
                    <I aria-hidden strokeWidth={STROKE} />
                  </span>
                  <span className="ttk-seg__l">{r.label}</span>
                  <span className="ttk-seg__n">{r.n}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="ttk-aside2">
          <TaskProgress stats={stats.stats} scoped={scopedCounts} periodField={legacyPeriod ? "deadline" : periodField} />
        </div>

        <section className="ttk-list" aria-busy={list.loading} aria-label={t("title")}>
          {list.error && !list.items.length ? (
            <div className="ttk-empty">
              <span className="ttk-empty__i ttk-empty__i--bad">
                <RotateCcw aria-hidden strokeWidth={STROKE} />
              </span>
              <p>{list.error}</p>
              <button type="button" className="ttk-btn ttk-btn--line" onClick={() => void load("reset")}>
                <RotateCcw aria-hidden strokeWidth={STROKE} />
                {t("retry")}
              </button>
            </div>
          ) : !list.ready ? (
            <ul className="ttk-rows" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="ttk-row ttk-row--sk" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </ul>
          ) : !list.items.length ? (
            <div className="ttk-empty">
              <span className="ttk-empty__i">
                <Inbox aria-hidden strokeWidth={STROKE} />
              </span>
              <p className="ttk-empty__t">{filtered ? t("emptyFiltered") : t("empty")}</p>
              {filtered ? (
                <button type="button" className="ttk-btn ttk-btn--line" onClick={resetFilters}>
                  <X aria-hidden strokeWidth={STROKE} />
                  {t("clearFilters")}
                </button>
              ) : (
                createBtn
              )}
            </div>
          ) : (
            <>
              <ul className={list.loading ? "ttk-rows is-dim" : "ttk-rows"}>
                {list.items.map((task, i) => {
                  const late = task.isOverdue && task.status !== "ready";
                  const I = STATUS_ICON[task.status];
                  return (
                    <li key={task.id} className={`ttk-row ttk-row--${task.status}${openId === task.id ? " is-open" : ""}${late ? " is-late" : ""}`} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                      <button type="button" className="ttk-row__open" onClick={() => open(task.id, task)} aria-label={t("openTask", { code: task.code, title: task.title })} />
                      <span className="ttk-row__ico" aria-hidden>
                        <I strokeWidth={STROKE} />
                      </span>
                      <div className="ttk-row__main">
                        <p className="ttk-row__top">
                          <span className="ttk-row__code">{task.code}</span>
                          <StatusPill status={task.status} size="sm" />
                        </p>
                        <p className="ttk-row__title">{task.title}</p>
                        <p className="ttk-row__meta">
                          <Deadline task={task} />
                          <Handoff creator={task.creator} people={task.assignees} />
                          <span className="ttk-row__upd">{t("updated", { when: when(task.updatedAt) })}</span>
                        </p>
                      </div>
                      <div className="ttk-row__act">
                        <span className="ttk-acts">
                          <StatusActions task={shown(task)} busy={busyId === task.id} onPick={(to) => void move(task, to)} />
                          {/* Ulugbek's final action, one click from the list. */}
                          {simple && task.actions.canDelete && !task.deletedAt ? (
                            <button
                              type="button"
                              className="ttk-btn ttk-btn--ok ttk-btn--sm"
                              disabled={busyId === task.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setReason({ kind: "approve", task });
                              }}
                            >
                              <Archive aria-hidden strokeWidth={STROKE} />
                              {t("approveArchive")}
                            </button>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {list.error ? <p className="cform__bad">{list.error}</p> : null}
              <ListPager count={list.items.length} total={list.hasMore ? Math.max(list.total, list.items.length + 1) : list.items.length} step={PAGE} onMore={() => void load("more")} loading={list.loading} />
            </>
          )}
        </section>
      </div>

      {openId ? (
        <TaskDetail
          task={detail && shown(detail)}
          approveArchive={simple}
          loading={detailLoading}
          failed={detailErr}
          busy={busyId === openId}
          notice={notice}
          onClose={close}
          onRetry={() => void loadDetail(openId)}
          onStatus={(task, toStatus) => void move(task, toStatus)}
          onEdit={(task) => setForm({ kind: "edit", task })}
          onAssign={(task) => setForm({ kind: "assign", task })}
          onDelete={(task) => setReason({ kind: simple ? "approve" : "delete", task })}
        />
      ) : null}

      {form ? <TaskForm mode={form} limits={meta?.attachments} onClose={() => setForm(null)} onSaved={saved} onError={(te, task) => (handleError(te, task) ? (setForm(null), true) : false)} /> : null}

      {reason ? (
        <ReasonDialog
          title={t(`${reason.kind}Title`, { code: reason.task.code })}
          lead={t(`${reason.kind}Lead`)}
          label={t(`${reason.kind}Label`)}
          confirm={reason.kind === "return" ? t("act.return") : reason.kind === "approve" ? t("approve") : t("delete")}
          danger={reason.kind === "delete"}
          approve={reason.kind === "approve"}
          onClose={() => setReason(null)}
          onSubmit={submitReason}
        />
      ) : null}
    </div>
  );
}
