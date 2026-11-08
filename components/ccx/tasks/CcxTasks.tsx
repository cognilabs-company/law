"use client";

import "../panel/panel.css";
import "./tasks.css";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { isAborted } from "@/lib/http";
import { notify } from "@/lib/toast";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import {
  TASK_EVENT_PREFIX,
  TASK_PERIOD_FIELDS,
  TASK_STATUSES,
  changeTaskStatus,
  deleteTask,
  getTask,
  getTaskMeta,
  isReturn,
  listTasksInPeriod,
  searchTaskUsers,
  simpleFlowAllows,
  simpleFlowView,
  taskErrorOf,
  usesSimpleTaskFlow,
  type Task,
  type TaskError,
  type TaskMeta,
  type TaskPeriodField,
  type TaskStatus,
} from "@/lib/services/taskManagement";
import { useClock } from "../useLive";
import { IcClose, IcInbox, IcSearch, IcTasks } from "../icons";
import Board from "./Board";
import Drawer from "./Drawer";
import { IcAlert, IcPlus } from "./icons";
import { EMPTY_BOARD, EMPTY_COLS, NO_PERIOD, PAGE, PERIODS, POLL_MS, ZERO, appendCol, colsOf, dropTask, errText, isScope, loadedOf, mapCols, placeTask, presetRange, readScope, saveScope, setColBusy, type BoardState, type Period, type PeriodKey } from "./model";
import PickField from "./PickField";
import ReasonSheet, { type ReasonKind } from "./ReasonSheet";
import TaskSheet, { type FormMode } from "./TaskSheet";
import Tiles from "./Tiles";
import { useStats } from "./useStats";
import { useTx } from "./text";
import Select from "@/components/Select";

const NARROW = "(max-width: 960px)";
const subNarrow = (cb: () => void) => {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const readNarrow = () => window.matchMedia(NARROW).matches;
const serverNarrow = () => false;

type Det = { id: string; key: number; task: Task | null; err: string };
const NO_DET: Det = { id: "", key: -1, task: null, err: "" };
type Reason = { kind: ReasonKind; task: Task };

export default function CcxTasks() {
  const { t, x, status } = useTx();
  const tc = useTranslations("admin.ccx");
  const { session } = useAuth();
  const simple = usesSimpleTaskFlow(session?.id);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlTask = params.get("task") ?? "";
  const narrow = useSyncExternalStore(subNarrow, readNarrow, serverNarrow);

  const [meta, setMeta] = useState<TaskMeta | null>(null);
  const [denied, setDenied] = useState("");
  const [scope, setScopeState] = useState(readScope);
  const [people, setPeople] = useState<{ value: string; label: string }[]>([]);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>(NO_PERIOD);
  const [periodField, setPeriodField] = useState<TaskPeriodField>("deadline");
  const [lateOnly, setLateOnly] = useState(false);
  const [board, setBoard] = useState<BoardState>(EMPTY_BOARD);
  const [now, setNow] = useState(0);
  const [statsTick, setStatsTick] = useState(0);
  const [openId, setOpenId] = useState(urlTask);
  const [urlSeen, setUrlSeen] = useState(urlTask);
  const [det, setDet] = useState<Det>(NO_DET);
  const [detKey, setDetKey] = useState(0);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [form, setForm] = useState<FormMode | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [flash, setFlash] = useState<TaskStatus | "">("");
  const seq = useRef(0);
  const legacyRef = useRef(false);
  const loadedRef = useRef(ZERO);
  const openRef = useRef(urlTask);
  const refreshTimer = useRef(0);
  const boardBox = useRef<HTMLDivElement>(null);

  if (urlSeen !== urlTask) {
    setUrlSeen(urlTask);
    if (urlTask !== openId) {
      setOpenId(urlTask);
      setNotice("");
    }
  }

  const dateFrom = period.from || period.to;
  const dateTo = period.to || period.from;
  const ranged = Boolean(dateFrom && dateTo);
  const field: TaskPeriodField = board.legacy ? "deadline" : periodField;
  const statsAssignee = isScope(scope) && scope !== "me" ? "" : scope;
  const stats = useStats(statsTick, dateFrom, dateTo, statsAssignee);
  const filters = useMemo(() => ({ assignee: scope, q, dateFrom, dateTo, periodField }), [scope, q, dateFrom, dateTo, periodField]);

  useEffect(() => {
    const id = window.setTimeout(() => setQ(qInput.trim()), 350);
    return () => window.clearTimeout(id);
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

  const load = useCallback(
    async (mode: "reset" | "refresh") => {
      const n = ++seq.current;
      if (mode === "refresh") setStatsTick((k) => k + 1);
      else setBoard((s) => ({ ...s, loading: true, error: "" }));
      try {
        const pf = legacyRef.current ? "deadline" : filters.periodField;
        const pages = await Promise.all(
          TASK_STATUSES.map((st) => listTasksInPeriod({ ...filters, periodField: pf, status: st, limit: mode === "refresh" ? Math.min(100, Math.max(PAGE, loadedRef.current[st])) : PAGE, offset: 0 })),
        );
        if (n !== seq.current) return;
        const legacy = pages.some((p) => !!p.legacyPeriod);
        legacyRef.current = legacy;
        setNow(Date.now());
        setBoard({ cols: colsOf(pages), counts: pages[0]?.counts ?? ZERO, ready: true, loading: false, error: "", legacy });
      } catch (e) {
        if (n !== seq.current || isAborted(e)) return;
        const te = taskErrorOf(e);
        if (te.kind === "forbidden") setDenied(te.message || t("denied"));
        const error = te.kind === "unavailable" ? t("err.unavailable") : te.kind === "network" ? t("err.network") : te.kind === "other" || !te.message ? t("err.load") : te.message;
        setBoard((s) => ({ ...s, cols: mode === "reset" ? EMPTY_COLS : s.cols, counts: mode === "reset" ? ZERO : s.counts, loading: false, ready: true, error }));
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

  useEffect(() => {
    loadedRef.current = loadedOf(board.cols);
  }, [board.cols]);

  useEffect(() => {
    openRef.current = openId;
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    const c = new AbortController();
    const id = openId;
    const key = detKey;
    getTask(id, c.signal).then(
      (task) => setDet({ id, key, task, err: "" }),
      (e) => {
        if (isAborted(e)) return;
        const te = taskErrorOf(e);
        if (te.kind === "missing") {
          setDet({ id, key, task: null, err: t("err.missing") });
          setBoard((s) => dropTask(s, id));
        } else setDet((s) => ({ id, key, task: s.id === id ? s.task : null, err: te.kind === "network" ? t("err.network") : te.kind === "other" || !te.message ? t("err.load") : te.message }));
      },
    );
    return () => c.abort();
  }, [openId, detKey, t]);

  const refresh = useCallback(
    (taskId = "") => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        void load("refresh");
        if (openRef.current && (!taskId || taskId === openRef.current)) setDetKey((k) => k + 1);
      }, 250);
    },
    [load],
  );

  useEffect(() => {
    const off1 = subscribeUserEvents((e) => {
      if (typeof e.event !== "string" || !e.event.startsWith(TASK_EVENT_PREFIX)) return;
      refresh(typeof e.task_id === "string" ? e.task_id : "");
    });
    const off2 = onUserSocketResync(() => refresh());
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const poll = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      off1();
      off2();
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", tick);
      window.clearTimeout(refreshTimer.current);
    };
  }, [refresh]);

  useClock(setNow, 60_000);

  useEffect(() => {
    if (!flash) return;
    boardBox.current?.querySelector(`[data-col="${flash}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    const id = window.setTimeout(() => setFlash(""), 1600);
    return () => window.clearTimeout(id);
  }, [flash]);

  const writeUrl = (id: string) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("task", id);
    else next.delete("task");
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const setScope = (v: string) => {
    setScopeState(v);
    saveScope(v);
  };

  const open = (id: string, seed?: Task) => {
    const same = openRef.current === id && openId === id;
    openRef.current = id;
    setNotice("");
    if (same) {
      setDetKey((k) => k + 1);
      return;
    }
    setOpenId(id);
    setDet(seed ? { id, key: -1, task: seed, err: "" } : NO_DET);
    writeUrl(id);
  };

  const close = () => {
    const was = openRef.current;
    openRef.current = "";
    setOpenId("");
    setDet(NO_DET);
    setNotice("");
    writeUrl("");
    if (was) boardBox.current?.querySelector<HTMLButtonElement>(`[data-task="${CSS.escape(was)}"] .opx-tk-card__hit`)?.focus({ preventScroll: true });
  };

  const handleError = (te: TaskError, task: Task | null): boolean => {
    if (te.kind === "conflict") {
      notify.warning(t("err.conflict"));
      if (task) {
        if (openRef.current !== task.id) open(task.id, task);
        else setDetKey((k) => k + 1);
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
      if (task) setBoard((s) => dropTask(s, task.id));
      if (task && openRef.current === task.id) close();
      void load("refresh");
      return true;
    }
    return false;
  };

  const applied = (task: Task) => {
    setBoard((s) => placeTask(s, task));
    if (openRef.current === task.id) setDetKey((k) => k + 1);
    void load("refresh");
  };

  const move = async (task: Task, to: TaskStatus) => {
    if (simple && !simpleFlowAllows(task.status, to)) return;
    if (isReturn(task.status, to)) {
      setReason({ kind: "return", task });
      return;
    }
    setBusyId(task.id);
    try {
      const next = await changeTaskStatus(task, to);
      notify.success(t("moved", { code: task.code, status: status(to) }));
      applied(next);
    } catch (e) {
      const te = taskErrorOf(e);
      if (!handleError(te, task)) notify.error(errText(t, te));
    } finally {
      setBusyId("");
    }
  };

  const more = async (st: TaskStatus) => {
    const n = seq.current;
    const offset = loadedRef.current[st];
    setBoard((s) => setColBusy(s, st, true));
    try {
      const page = await listTasksInPeriod({ ...filters, periodField: legacyRef.current ? "deadline" : filters.periodField, status: st, limit: PAGE, offset });
      const fresh = n === seq.current;
      setBoard((s) => (fresh ? appendCol(s, st, page) : setColBusy(s, st, false)));
    } catch (e) {
      const fresh = n === seq.current;
      setBoard((s) => setColBusy(s, st, false));
      if (fresh && !isAborted(e)) notify.error(errText(t, taskErrorOf(e)));
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
        setBoard((s) => dropTask(s, task.id));
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
      return errText(t, te);
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

  const pickPeriod = (k: PeriodKey) => {
    const r = presetRange(k);
    setPeriod({ key: k, from: r.from, to: r.to });
  };

  const isPerson = !isScope(scope);
  const filtered = Boolean(qInput.trim() || q || dateFrom || lateOnly || isPerson);

  const resetFilters = () => {
    if (isPerson) setScope("");
    setQInput("");
    setQ("");
    setPeriod(NO_PERIOD);
    setPeriodField("deadline");
    setLateOnly(false);
  };

  if (denied) {
    return (
      <div className="opx-tk">
        <div className="opx-tk-fail opx-tk-fail--page">
          <span className="opx-tk-fail__orb" aria-hidden="true">
            <IcTasks size={30} />
          </span>
          <h2>{tc("nav.teamTasks")}</h2>
          <p>{denied}</p>
        </div>
      </div>
    );
  }

  const view = (task: Task) => (simple ? simpleFlowView(task) : task);
  const cols = simple ? mapCols(board.cols, simpleFlowView) : board.cols;
  const total = TASK_STATUSES.reduce((n, st) => n + board.counts[st], 0);
  const detTask = det.id === openId ? det.task : null;
  const detLoading = !!openId && (det.id !== openId || det.key !== detKey);
  const detErr = det.id === openId ? det.err : "";
  const unassignedN = !statsAssignee && stats.stats ? stats.stats.unassigned : 0;
  const scopes = [
    { value: "me", label: t("filter.me"), n: 0 },
    { value: "", label: t("filter.anyone"), n: 0 },
    { value: "unassigned", label: t("filter.unassigned"), n: unassignedN },
  ];

  const createBtn = meta?.canCreate ? (
    <button type="button" className="opx-pbtn opx-pbtn--main opx-tk-new" onClick={() => setForm({ kind: "create" })}>
      <IcPlus size={18} />
      {t("create")}
    </button>
  ) : null;

  const drawer = (full: boolean) => (
    <Drawer
      key={openId}
      task={detTask ? view(detTask) : null}
      loading={detLoading}
      failed={detErr}
      busy={busyId === openId}
      notice={notice}
      now={now}
      approveArchive={simple}
      full={full}
      onClose={close}
      onRetry={() => setDetKey((k) => k + 1)}
      onStatus={(task, to) => void move(task, to)}
      onEdit={(task) => setForm({ kind: "edit", task })}
      onAssign={(task) => setForm({ kind: "assign", task })}
      onDelete={(task) => setReason({ kind: simple ? "approve" : "delete", task })}
    />
  );

  const side = !!openId && !narrow;

  return (
    <div className="opx-tk" data-side={side || undefined} data-ai-target="callcenter:team-tasks">
      <div className="opx-tk-main">
        <header className="opx-tk-head">
          <h2 className="opx-tk-head__t">
            {tc("nav.teamTasks")}
            {board.ready && !board.error ? <b className="opx-num">{total}</b> : null}
          </h2>
          <div className="opx-tk-scope" role="radiogroup" aria-label={x("scope")}>
            {scopes.map((s) => (
              <button key={s.value || "all"} type="button" role="radio" aria-checked={scope === s.value} className={scope === s.value ? "is-on" : undefined} onClick={() => setScope(s.value)}>
                {s.label}
                {s.n ? <b className="opx-num">{s.n}</b> : null}
              </button>
            ))}
          </div>
          <label className="opx-tk-search">
            <IcSearch size={18} />
            <span className="opx-sr">{t("filter.search")}</span>
            <input type="search" value={qInput} maxLength={200} onChange={(e) => setQInput(e.target.value)} placeholder={t("filter.search")} autoComplete="off" spellCheck={false} enterKeyHint="search" />
          </label>
          <div className="opx-tk-head__tools">
            <button type="button" className="opx-tk-fchip" data-tone="hot" aria-pressed={lateOnly} onClick={() => setLateOnly((v) => !v)}>
              <IcAlert size={15} />
              {x("overdue")}
              {stats.stats?.overdue ? <b className="opx-num">{stats.stats.overdue}</b> : null}
            </button>
            {createBtn}
          </div>
        </header>

        <div className="opx-tk-filters" role="group" aria-label={x("filters")}>
          <div className="opx-tk-fgroup" role="group" aria-label={t("period.quick")}>
            <button type="button" className="opx-tk-fchip" aria-pressed={!dateFrom} onClick={() => setPeriod(NO_PERIOD)}>
              {t("period.all")}
            </button>
            {PERIODS.map((k) => (
              <button key={k} type="button" className="opx-tk-fchip" aria-pressed={period.key === k} onClick={() => pickPeriod(k)}>
                {t(`period.${k}`)}
              </button>
            ))}
          </div>
          <span className="opx-tk-range" role="group" aria-label={t("period.label")}>
            <PickField value={period.from} max={period.to || undefined} label={x("dateFrom")} placeholder={x("dateFrom")} onChange={(v) => setPeriod((p) => ({ key: "custom", from: v, to: p.to }))} />
            <span aria-hidden="true">–</span>
            <PickField value={period.to} min={period.from || undefined} label={x("dateTo")} placeholder={x("dateTo")} onChange={(v) => setPeriod((p) => ({ key: "custom", from: p.from, to: v }))} />
            {dateFrom ? (
              <button type="button" className="opx-tk-ibtn" onClick={() => setPeriod(NO_PERIOD)} aria-label={t("period.clear")} title={t("period.clear")}>
                <IcClose size={15} />
              </button>
            ) : null}
          </span>
          {ranged && !board.legacy ? (
            <div className="opx-tk-fgroup" role="radiogroup" aria-label={t("period.field.label")}>
              <span className="opx-tk-fgroup__l">{t("period.field.label")}</span>
              {TASK_PERIOD_FIELDS.map((f) => (
                <button key={f} type="button" role="radio" aria-checked={periodField === f} className="opx-tk-fchip" onClick={() => setPeriodField(f)}>
                  {t(`period.field.${f}`)}
                </button>
              ))}
            </div>
          ) : null}
          <span className="opx-tk-sel" data-on={isPerson || undefined}>
            <Select value={isPerson ? scope : ""} onChange={setScope} ariaLabel={t("filter.assignee")} options={[{ value: "", label: t("filter.assignee") }, ...people]} />
          </span>
          {filtered ? (
            <button type="button" className="opx-tk-reset" onClick={resetFilters}>
              <IcClose size={14} />
              {t("clearFilters")}
            </button>
          ) : null}
        </div>
        {ranged ? <p className="opx-tk-hint">{t(`period.hintBy.${field}`)}</p> : null}

        <Tiles
          stats={stats.stats}
          hidden={stats.hidden}
          stale={stats.stale}
          scoped={ranged ? board.counts : null}
          periodField={field}
          lateOnly={lateOnly}
          onCreated={ranged && !board.legacy ? () => setPeriodField("created") : undefined}
          onDone={() => (ranged && !board.legacy ? setPeriodField("completed") : setFlash("ready"))}
          onLate={() => setLateOnly((v) => !v)}
        />

        {board.ready && !board.error && total === 0 ? (
          <div className="opx-tk-empty">
            <span className="opx-tk-empty__orb" aria-hidden="true">
              <IcInbox size={22} />
            </span>
            <p>{filtered || scope !== "" ? t("emptyFiltered") : t("empty")}</p>
            {filtered ? (
              <button type="button" className="opx-pbtn" onClick={resetFilters}>
                <IcClose size={15} />
                {t("clearFilters")}
              </button>
            ) : scope !== "" ? (
              <button type="button" className="opx-pbtn" onClick={() => setScope("")}>
                {t("filter.anyone")}
              </button>
            ) : (
              createBtn
            )}
          </div>
        ) : null}

        <Board
          cols={cols}
          counts={board.counts}
          ready={board.ready}
          loading={board.loading}
          error={board.error}
          openId={openId}
          busyId={busyId}
          now={now}
          simple={simple}
          lateOnly={lateOnly}
          flash={flash}
          boxRef={boardBox}
          onRetry={() => void load("reset")}
          onOpen={(task) => open(task.id, task)}
          onMove={(task, to) => void move(task, to)}
          onApprove={(task) => setReason({ kind: "approve", task })}
          onMore={(st) => void more(st)}
        />
      </div>

      {side ? drawer(false) : null}

      {openId && narrow ? createPortal(<div className="opx-tk-full">{drawer(true)}</div>, document.body) : null}

      {form ? (
        <TaskSheet
          mode={form}
          limits={meta?.attachments}
          canAssign={meta?.canAssign === true}
          onClose={() => setForm(null)}
          onSaved={saved}
          onError={(te, task) => {
            if (!handleError(te, task)) return false;
            setForm(null);
            return true;
          }}
        />
      ) : null}

      {reason ? <ReasonSheet key={`${reason.kind}:${reason.task.id}`} kind={reason.kind} task={reason.task} onClose={() => setReason(null)} onSubmit={submitReason} /> : null}
    </div>
  );
}
