"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  createHrm,
  getHrm,
  getHrmSchema,
  getHrmSummary,
  hrmErrorOf,
  listHrm,
  moduleOf,
  patchHrm,
  statusesOf,
  transitionHrm,
  useHrmCatalog,
  validateHrm,
  type HrmCatalog,
  type HrmField,
  type HrmInput,
  type HrmModule,
  type HrmPage,
  type HrmRow,
  type HrmSummary,
  type HrmType,
} from "@/lib/services/hrm";
import DatePicker from "@/components/DatePicker";
import { humanize } from "@/lib/labels";
import "../handmade.css";
import Select from "@/components/Select";
import SearchSelect from "@/components/SearchSelect";
import InternalField from "@/components/internal/InternalField";
import HrmKanban from "@/components/internal/HrmKanban";
import HrmCalendar, { monthOf, type CalDay } from "@/components/internal/HrmCalendar";
import { HrmDonut } from "@/components/internal/HrmCharts";
import { IconArrowRight, IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconGrid, IconList, IconPlus, IconRefresh, IconSearch } from "@/components/icons";
import { EntitySelect, HrmDrawer, HrmEmpty, HrmError, HrmHead, HrmKv, HrmLoading, HrmPanel, HrmPerson, HrmSection, HrmStat, HrmStatus, useHrmFormat, useNow, useStatusLabel } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { ReasonModal, apiMessage } from "@/components/internal/live/bits";
import HrmFieldInput, { useHrmRefs } from "./HrmFieldInput";
import LeavePanel, { LeaveCheckNote, useLeaveCheck } from "@/components/internal/ops/LeaveOps";
import { ScheduleMatrixPanel, TimesheetsPanel } from "@/components/internal/ops/TimeOps";
import { useHrmText } from "./text";

type Dict = Record<string, unknown>;
type View = "list" | "board" | "calendar";
type Filters = { q: string; statuses: string[]; employeeId: string; unitId: string; dateFrom: string; dateTo: string };
const NO_FILTERS: Filters = { q: "", statuses: [], employeeId: "", unitId: "", dateFrom: "", dateTo: "" };
const PAGE_SIZES = [25, 50, 100];
const EDITABLE = ["draft", "returned"];
const LONG = new Set(["textarea", "richtext", "code", "list", "object", "files", "file", "references"]);
const TONES = ["#1668F0", "#19C3B1", "#F5A623", "#8B5CF6", "#E5484D", "#0EA5E9", "#64748B", "#22C55E"];
// Date fields a record's span is read from, for the month view.
const SPANS: [string, string][] = [["start_date", "end_date"], ["starts_at", "ends_at"], ["period_start", "period_end"], ["work_date", ""], ["scheduled_at", ""], ["occurred_at", ""], ["deadline_at", ""], ["due_at", ""], ["effective_date", ""], ["review_date", ""]];
const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
// Any stored value in words for a reader: nested keys named, lists joined,
// yes/no for booleans — never the JSON the backend keeps.
function plainOf(v: unknown, yes: string, no: string): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? yes : no;
  if (Array.isArray(v)) return v.map((x) => plainOf(x, yes, no)).filter(Boolean).join(", ");
  if (isDict(v)) return Object.entries(v).map(([k, x]) => [humanize(k), plainOf(x, yes, no)]).filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join(" · ");
  return String(v);
}
const empty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length) || (isDict(v) && !Object.keys(v).length);
const day = (iso: string) => iso.slice(0, 10);
// Modules whose daily work has its own screen (2026-10-14 contract): shown
// above the catalog's records, which stay below for everything else.
const OPS: Record<string, ComponentType> = { leave: LeavePanel, timesheet: TimesheetsPanel, scheduling: ScheduleMatrixPanel };

// The list's state lives in the address bar (MedControl's useListState):
// a view can be shared, and comes back on Back and on reload.
type ListQuery = { type: string; open: string; filters: Filters; view: View; offset: number; limit: number };
function readQuery(): ListQuery {
  const none: ListQuery = { type: "", open: "", filters: NO_FILTERS, view: "list", offset: 0, limit: 25 };
  if (typeof window === "undefined") return none;
  const q = new URLSearchParams(window.location.search);
  const view = q.get("view");
  const limit = Number(q.get("size"));
  return {
    type: q.get("type") ?? "",
    open: q.get("open") ?? "",
    filters: {
      q: q.get("q") ?? "",
      statuses: (q.get("status") ?? "").split(",").filter(Boolean),
      employeeId: q.get("employee") ?? "",
      unitId: q.get("unit") ?? "",
      dateFrom: q.get("from") ?? "",
      dateTo: q.get("to") ?? "",
    },
    view: view === "board" || view === "calendar" ? view : "list",
    offset: Math.max(0, Number(q.get("offset")) || 0),
    limit: PAGE_SIZES.includes(limit) ? limit : 25,
  };
}
function writeQuery(s: ListQuery) {
  const u = new URL(window.location.href);
  const put = (k: string, v: string) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  put("type", s.type);
  put("open", s.open);
  put("q", s.filters.q);
  put("status", s.filters.statuses.join(","));
  put("employee", s.filters.employeeId);
  put("unit", s.filters.unitId);
  put("from", s.filters.dateFrom);
  put("to", s.filters.dateTo);
  put("view", s.view === "list" ? "" : s.view);
  put("offset", s.offset ? String(s.offset) : "");
  put("size", s.limit === 25 ? "" : String(s.limit));
  if (u.toString() !== window.location.href) window.history.replaceState(window.history.state, "", u.toString());
}

// The value of a field as a person reads it.
function useFormatValue() {
  const f = useHrmFormat();
  const { option, t } = useHrmText();
  return useCallback(
    (field: HrmField, v: unknown, ref: (source: string, id: string) => string): string => {
      if (empty(v)) return "";
      switch (field.type) {
        case "reference":
          return ref(field.source, text(v));
        case "references":
          return (Array.isArray(v) ? v : []).map((x) => ref(field.source, text(x))).join(", ");
        case "select":
          return option(text(v));
        case "multiselect":
          return (Array.isArray(v) ? v : []).map((x) => option(text(x))).join(", ");
        case "boolean":
          return v === true ? t("form.yes") : t("form.no");
        case "date":
          return f.date(text(v));
        case "datetime":
          return f.dateTime(text(v));
        case "money":
          return `${f.money(Number(v))}${field.currency && field.currency !== "UZS" ? ` ${field.currency}` : ""}`;
        case "list":
          return (Array.isArray(v) ? v : []).map((x) => (isDict(x) ? text(x.title ?? x.name ?? x.label ?? x.key ?? x.code) || Object.values(x).filter((y) => typeof y === "string").join(" ") : text(x))).filter(Boolean).join(" · ");
        case "object":
          return isDict(v) ? plainOf(v, t("form.yes"), t("form.no")) : "";
        case "file":
        case "files":
          return (Array.isArray(v) ? v : [v]).map((x) => (isDict(x) ? text(x.name ?? x.file_id) : text(x))).join(", ");
        default:
          return plainOf(v, t("form.yes"), t("form.no"));
      }
    },
    [f, option, t],
  );
}

// One HRM module drawn from the catalog: its record types as tabs, the
// module's summary, a paginated list filtered on the server, a board by the
// workflow's statuses and a month view where records have dates; a form
// built from the record type's fields; only the moves the record allows.
export default function HrmModuleScreen({ domain }: { domain: string }) {
  const cat = useHrmCatalog();
  // The module's own schema is what its forms are built from (spec 10-13
  // §4); the catalog's copy shows until it arrives, and stays if it fails.
  const [schema, setSchema] = useState<{ domain: string; mod: HrmModule | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void getHrmSchema(domain).then((mod) => alive && setSchema({ domain, mod }));
    return () => {
      alive = false;
    };
  }, [domain]);
  const mod = (schema?.domain === domain ? schema.mod : null) ?? moduleOf(cat.data, domain);
  const { t } = useHrmText();
  if (!cat.data) {
    if (cat.state === "error") return <HrmError text={t("catalogError")} onRetry={() => void cat.reload()} retryLabel={t("retry")} />;
    return (
      <section className="hrm-page">
        <HrmPanel>
          <HrmLoading rows={6} />
        </HrmPanel>
      </section>
    );
  }
  if (!mod) return <HrmEmpty title={t("unknownModule")} text={domain} />;
  return (
    <Suspense fallback={<HrmPanel><HrmLoading rows={6} /></HrmPanel>}>
      <ModuleView key={domain} cat={cat.data} mod={mod} />
    </Suspense>
  );
}

function ModuleView({ cat, mod }: { cat: HrmCatalog; mod: HrmModule }) {
  const { t, module, moduleLead, type: typeName, field: fieldName } = useHrmText();
  const ts = useStatusLabel();
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const now = useNow();
  const fmt = useFormatValue();
  const validType = (q: string) => (mod.types.some((x) => x.key === q) ? q : "");
  const [typeKey, setTypeKey] = useState(() => validType(readQuery().type));
  // The menu links straight to a record type (?type=): a new one in the
  // address bar is the tab on screen.
  const urlType = useSearchParams().get("type") ?? "";
  const [seenType, setSeenType] = useState(urlType);
  if (urlType !== seenType) {
    setSeenType(urlType);
    if (validType(urlType) !== typeKey) setTypeKey(validType(urlType));
  }
  const type = mod.types.find((x) => x.key === typeKey) ?? null;
  const [start] = useState(readQuery);
  const [filters, setFilters] = useState<Filters>(start.filters);
  const [q, setQ] = useState(start.filters.q);
  const [paging, setPaging] = useState({ offset: start.offset, limit: start.limit });
  const [view, setView] = useState<View>(start.view);
  const [tick, setTick] = useState(0);
  const [page, setPage] = useState<{ key: string; data: HrmPage | null; err: string } | null>(null);
  const [summary, setSummary] = useState<HrmSummary | null>(null);
  const [openId, setOpenId] = useState(() => readQuery().open);
  const [form, setForm] = useState<{ row: HrmRow | null; type: HrmType | null; parentId: string } | null>(null);
  const [move, setMove] = useState<{ row: HrmRow; to: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [month, setMonth] = useState("");

  // Typing settles before the server is asked.
  useEffect(() => {
    const h = setTimeout(() => {
      setFilters((cur) => (cur.q === q.trim() ? cur : { ...cur, q: q.trim() }));
      setPaging((p) => ({ ...p, offset: 0 }));
    }, 350);
    return () => clearTimeout(h);
  }, [q]);
  useEffect(() => writeQuery({ type: typeKey, open: openId, filters, view, offset: paging.offset, limit: paging.limit }), [typeKey, openId, filters, view, paging]);

  // The board and the month show a whole set, not one page of it.
  const wide = view !== "list";
  const reqKey = JSON.stringify({ d: mod.key, typeKey, filters, paging: wide ? { offset: 0, limit: 200 } : paging, tick });
  useEffect(() => {
    const c = new AbortController();
    listHrm(mod.key, { type: typeKey || undefined, employeeId: filters.employeeId || undefined, unitId: filters.unitId || undefined, statuses: filters.statuses, q: filters.q || undefined, dateFrom: filters.dateFrom || undefined, dateTo: filters.dateTo || undefined, ...(wide ? { offset: 0, limit: 200 } : paging) }, c.signal)
      .then((data) => !c.signal.aborted && setPage({ key: reqKey, data, err: "" }))
      .catch((e) => !c.signal.aborted && setPage({ key: reqKey, data: null, err: apiMessage(e, t("loadError")) }));
    return () => c.abort();
    // reqKey carries every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);
  useEffect(() => {
    const c = new AbortController();
    getHrmSummary(mod.key, { employeeId: filters.employeeId || undefined, unitId: filters.unitId || undefined, dateFrom: filters.dateFrom || undefined, dateTo: filters.dateTo || undefined }, c.signal)
      .then((s) => !c.signal.aborted && setSummary(s))
      .catch(() => undefined);
    return () => c.abort();
  }, [mod.key, filters.employeeId, filters.unitId, filters.dateFrom, filters.dateTo, tick]);

  // A record of this module changed somewhere (spec §20): the current list
  // is read once more — never a poll of everything.
  useEffect(() => {
    let h: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeUserEvents((e) => {
      if (!e.event.startsWith("internal.hrm.record")) return;
      const data = isDict(e.data) ? e.data : {};
      const d = text(e.domain) || text(data.domain) || text(isDict(data.record) ? data.record.domain : "");
      if (d && d !== mod.key) return;
      if (h) clearTimeout(h);
      h = setTimeout(() => setTick((n) => n + 1), 400);
    });
    return () => {
      off();
      if (h) clearTimeout(h);
    };
  }, [mod.key]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const current = page?.key === reqKey ? page : null;
  const rows = useMemo(() => current?.data?.items ?? page?.data?.items ?? [], [current, page]);
  const loading = !current;
  const sources = useMemo(() => [...new Set(mod.types.flatMap((x) => x.fields.filter((fd) => fd.source).map((fd) => fd.source)))], [mod]);
  const ref = useHrmRefs(sources);
  const statuses = useMemo(() => (type ? statusesOf(cat, type) : [...new Set(mod.types.flatMap((x) => statusesOf(cat, x)))]), [cat, mod, type]);
  const keyFields = (type?.fields ?? []).filter((x) => !LONG.has(x.type) && !["employee_id", "org_unit_id"].includes(x.key)).slice(0, 3);
  const subjectOf = (r: HrmRow) => (r.employeeId ? dir.employeeName(r.employeeId) || ref("/internal/employees", r.employeeId) : r.unitId ? dir.unitName(r.unitId) || ref("/internal/org/units", r.unitId) : "");
  const typeOfRow = (r: HrmRow) => mod.types.find((x) => x.key === r.type) ?? null;
  const titleOf = (r: HrmRow) => r.title || [typeName(typeOfRow(r), mod.key, r.type), subjectOf(r)].filter(Boolean).join(" — ") || r.code;
  const filtered = Boolean(filters.q || filters.statuses.length || filters.employeeId || filters.unitId || filters.dateFrom || filters.dateTo);
  const setFilter = (patch: Partial<Filters>) => {
    setFilters((cur) => ({ ...cur, ...patch }));
    setPaging((p) => ({ ...p, offset: 0 }));
  };
  const pickType = (k: string) => {
    setTypeKey(k);
    setFilters((cur) => ({ ...cur, statuses: [] }));
    setPaging((p) => ({ ...p, offset: 0 }));
    if (!k && view !== "list") setView("list");
  };
  const span = type ? SPANS.find(([a]) => type.fields.some((x) => x.key === a)) : undefined;
  const views: View[] = type ? ["list", "board", ...(span ? (["calendar"] as View[]) : [])] : ["list"];
  const today = now ? `${monthOf(new Date(now))}-${String(new Date(now).getDate()).padStart(2, "0")}` : "";
  const shownMonth = month || today.slice(0, 7);

  const calDays = useMemo(() => {
    const out: Record<string, CalDay & { names: string[] }> = {};
    if (!span || !shownMonth) return out;
    for (const r of rows) {
      const a = text(r.payload[span[0]]);
      if (!a) continue;
      const b = span[1] ? text(r.payload[span[1]]) || a : a;
      for (let d = new Date(day(a)); day(d.toISOString()) <= day(b); d.setDate(d.getDate() + 1)) {
        const k = day(d.toISOString());
        if (!k.startsWith(shownMonth)) continue;
        const cur = out[k] ?? { tone: "info" as const, names: [] };
        cur.names.push(subjectOf(r) || titleOf(r));
        cur.tone = r.status === "pending" || cur.tone === "warn" ? "warn" : ["approved", "active", "completed", "effective"].includes(r.status) ? "ok" : cur.tone;
        out[k] = cur;
        if (cur.names.length > 40) break;
      }
    }
    for (const c of Object.values(out)) {
      c.label = c.names.length > 1 ? t("calendarCount", { n: c.names.length }) : c.names[0];
      c.sub = c.names.length > 1 ? c.names.slice(0, 2).join(", ") : undefined;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, span, shownMonth, dir]);

  const total = current?.data?.total ?? 0;
  const from = total ? paging.offset + 1 : 0;
  const to = Math.min(total, paging.offset + (current?.data?.items.length ?? 0));
  const pages = Math.max(1, Math.ceil(total / paging.limit));
  const pageNo = Math.floor(paging.offset / paging.limit) + 1;
  const open = openId ? (rows.find((r) => r.id === openId) ?? null) : null;
  const byStatus = Object.entries(summary?.byStatus ?? {}).sort((a, b) => b[1] - a[1]);
  const pendingCount = (summary?.byStatus.pending ?? 0) + (summary?.byStatus.review ?? 0);
  const Ops = OPS[mod.key];

  const onBoardMove = (r: HrmRow, toStatus: string) => {
    setNotice("");
    if (r.allowed.includes(toStatus)) setMove({ row: r, to: toStatus });
    else setNotice(t("moveNotAllowed", { from: ts(r.status), to: ts(toStatus) }));
  };

  return (
    <section className="hrm-page hrmc">
      <HrmHead
        title={module(mod)}
        lead={moduleLead(mod.key) || t("leadFallback", { n: mod.types.length })}
        actions={
          <>
            <button className="btn btn--line btn--sm" type="button" onClick={reload}>
              <IconRefresh />
              {t("refresh")}
            </button>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setForm({ row: null, type: type ?? mod.types[0], parentId: "" })}>
              <IconPlus />
              {type ? t("newOf", { type: typeName(type) }) : t("new")}
            </button>
          </>
        }
      />

      <div className="hrmc-top">
        <div className="hrm-stats hrmc-stats">
          <HrmStat icon={IconList} tone="blue" label={t("stat.total")} value={summary ? summary.total : "…"} hint={t("stat.types", { n: mod.types.length })} onClick={() => setFilter({ statuses: [] })} active={!filters.statuses.length} />
          <HrmStat icon={IconCalendar} tone="warn" label={t("stat.waiting")} value={summary ? pendingCount : "…"} onClick={() => setFilter({ statuses: filters.statuses.includes("pending") ? [] : ["pending"] })} active={filters.statuses.length === 1 && filters.statuses[0] === "pending"} />
          {byStatus.filter(([s]) => !["pending", "review"].includes(s)).slice(0, 2).map(([s, n]) => (
            <HrmStat key={s} icon={IconCheck} tone={["active", "approved", "completed", "effective", "paid", "hired"].includes(s) ? "ok" : s === "draft" ? "violet" : "cyan"} label={ts(s)} value={n} onClick={() => setFilter({ statuses: filters.statuses.length === 1 && filters.statuses[0] === s ? [] : [s] })} active={filters.statuses.length === 1 && filters.statuses[0] === s} />
          ))}
        </div>
        {summary && summary.total ? (
          <HrmPanel className="hrmc-donut">
            <HrmDonut
              slices={Object.entries(summary.byType).map(([k, n], i) => ({ label: typeName(mod.types.find((x) => x.key === k) ?? null, mod.key, k), value: n, color: TONES[i % TONES.length] }))}
              center={<b>{summary.total}</b>}
              caption={t("byType")}
            />
          </HrmPanel>
        ) : null}
      </div>

      {Ops && !typeKey ? <Ops /> : null}

      <div className="hrmc-types" role="tablist" aria-label={t("typesLabel")}>
        <button type="button" role="tab" aria-selected={!typeKey} className={!typeKey ? "on" : ""} onClick={() => pickType("")}>
          {t("allTypes")}
          <span>{summary?.total ?? "·"}</span>
        </button>
        {mod.types.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={typeKey === x.key} className={typeKey === x.key ? "on" : ""} onClick={() => pickType(x.key)}>
            {typeName(x)}
            <span>{summary?.byType[x.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="hrm-toolbar hrmc-filters">
        <div className="uf-search hrm-toolbar__q">
          <IconSearch aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} maxLength={80} />
        </div>
        <div className="hrmc-filters__st">
          <SearchSelect
            value={filters.statuses}
            onChange={(v) => setFilter({ statuses: v })}
            options={statuses.map((s) => ({ value: s, label: ts(s) }))}
            placeholder={t("allStatuses")}
            searchPlaceholder={t("search")}
            emptyText="—"
            ariaLabel={t("status")}
          />
        </div>
        {dir.employeeOptions.length ? (
          <div className="hrm-toolbar__sel">
            <EntitySelect value={filters.employeeId} onChange={(v) => setFilter({ employeeId: v })} options={dir.employeeOptions} placeholder={t("allEmployees")} ariaLabel={t("employee")} />
          </div>
        ) : null}
        {dir.unitOptions.length ? (
          <div className="hrm-toolbar__sel">
            <EntitySelect value={filters.unitId} onChange={(v) => setFilter({ unitId: v })} options={dir.unitOptions} placeholder={t("allUnits")} ariaLabel={t("unit")} />
          </div>
        ) : null}
        <div className="hrmc-filters__dates">
          <DatePicker value={filters.dateFrom} onChange={(v) => setFilter({ dateFrom: v })} placeholder={t("dateFrom")} ariaLabel={t("dateFrom")} max={filters.dateTo || undefined} clearLabel={t("form.clear")} />
          <DatePicker value={filters.dateTo} onChange={(v) => setFilter({ dateTo: v })} placeholder={t("dateTo")} ariaLabel={t("dateTo")} min={filters.dateFrom || undefined} clearLabel={t("form.clear")} />
        </div>
        {filtered ? (
          <button type="button" className="btn btn--line btn--sm" onClick={() => { setQ(""); setFilters(NO_FILTERS); setPaging((p) => ({ ...p, offset: 0 })); }}>
            <IconClose />
            {t("clearFilters")}
          </button>
        ) : null}
        {views.length > 1 ? (
          <div className="hrm-tabs" role="tablist" aria-label={t("views.label")}>
            {views.map((v) => {
              const I = v === "list" ? IconList : v === "board" ? IconGrid : IconCalendar;
              return (
                <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
                  <I />
                  {t(`views.${v}`)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {page?.err && current ? <HrmError text={page.err} onRetry={reload} retryLabel={t("retry")} /> : null}
      {notice ? <HrmError text={notice} /> : null}

      {loading && !page?.data ? (
        <HrmPanel>
          <HrmLoading rows={6} />
        </HrmPanel>
      ) : view === "board" && type ? (
        <HrmKanban
          columns={statuses.map((s) => ({ key: s, label: ts(s), tone: ["approved", "active", "completed", "effective", "paid", "hired", "closed"].includes(s) ? ("ok" as const) : ["rejected", "cancelled"].includes(s) ? ("err" as const) : ["pending", "review", "blocked", "returned"].includes(s) ? ("warn" as const) : s === "draft" ? ("gray" as const) : ("info" as const) }))}
          items={rows}
          columnOf={(r) => r.status}
          idOf={(r) => r.id}
          onMove={(r, s) => onBoardMove(r, s)}
          onOpen={(r) => setOpenId(r.id)}
          emptyText={t("boardEmpty")}
          renderCard={(r) => (
            <>
              <b>{titleOf(r)}</b>
              <small>{[r.code, ...keyFields.slice(0, 1).map((x) => fmt(x, r.payload[x.key], ref))].filter(Boolean).join(" · ")}</small>
              <span className="hrm-kb__meta">{subjectOf(r) ? <span>{subjectOf(r)}</span> : null}</span>
            </>
          )}
        />
      ) : view === "calendar" && span && shownMonth ? (
        <HrmPanel>
          <HrmCalendar month={shownMonth} onMonth={setMonth} days={calDays} today={today} legend={<><span><i className="hrm-cal__cell--ok" />{ts("approved")}</span><span><i className="hrm-cal__cell--warn" />{ts("pending")}</span><span><i className="hrm-cal__cell--info" />{ts("draft")}</span></>} />
        </HrmPanel>
      ) : (
        <HrmPanel flush>
          {rows.length ? (
            <div className="hrm-table-wrap">
              <table className="hrm-table hrmc-table">
                <thead>
                  <tr>
                    <th>{t("col.record")}</th>
                    {type ? null : <th>{t("col.type")}</th>}
                    <th>{t("col.subject")}</th>
                    {keyFields.map((x) => <th key={x.key}>{fieldName(x)}</th>)}
                    <th>{t("status")}</th>
                    <th>{t("col.updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="is-click" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(r.id)} data-code={r.code}>
                      <td>
                        <b>{titleOf(r)}</b>
                        <small className="hrmc-code">{r.code}</small>
                      </td>
                      {type ? null : <td className="hrm-muted">{typeName(typeOfRow(r), mod.key, r.type)}</td>}
                      <td>{r.employeeId ? <HrmPerson name={subjectOf(r)} sub={dir.employee(r.employeeId)?.code} size="sm" /> : subjectOf(r) || "—"}</td>
                      {keyFields.map((x) => (
                        <td key={x.key} className={x.type === "number" || x.type === "money" ? "hrm-num" : undefined}>{fmt(x, r.payload[x.key], ref) || "—"}</td>
                      ))}
                      <td><HrmStatus value={r.status} /></td>
                      <td className="hrm-muted">{r.updatedAt ? f.dateTime(r.updatedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <HrmEmpty
              icon={IconList}
              title={filtered ? t("noMatch") : t("empty")}
              text={filtered ? undefined : t("emptyText")}
              action={<button className="btn btn--pri btn--sm" type="button" onClick={() => setForm({ row: null, type: type ?? mod.types[0], parentId: "" })}><IconPlus />{t("new")}</button>}
            />
          )}
          {view === "list" && total > 0 ? (
            <div className="hrmc-pager">
              <span>{t("pager.range", { from, to, total })}</span>
              <div className="hrmc-pager__nav">
                <button type="button" className="btn btn--line btn--sm" disabled={paging.offset === 0} onClick={() => setPaging((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))} aria-label={t("pager.prev")}>
                  <IconChevronLeft />
                </button>
                <span>{t("pager.page", { n: pageNo, of: pages })}</span>
                <button type="button" className="btn btn--line btn--sm" disabled={!current?.data?.hasMore} onClick={() => setPaging((p) => ({ ...p, offset: p.offset + p.limit }))} aria-label={t("pager.next")}>
                  <IconChevronRight />
                </button>
              </div>
              <div className="hrmc-pager__size">
                <Select value={String(paging.limit)} onChange={(v) => setPaging({ offset: 0, limit: Number(v) })} options={PAGE_SIZES.map((n) => ({ value: String(n), label: t("pager.size", { n }) }))} ariaLabel={t("pager.sizeLabel")} />
              </div>
            </div>
          ) : null}
        </HrmPanel>
      )}

      {form && form.type ? (
        <RecordForm
          key={`${form.row?.id ?? "new"}-${form.type.key}-${form.parentId}`}
          mod={mod}
          type={form.type}
          row={form.row}
          parentId={form.parentId}
          onType={(next) => setForm({ ...form, type: next })}
          onClose={() => setForm(null)}
          onSaved={(r) => {
            setForm(null);
            reload();
            if (r?.id) setOpenId(r.id);
          }}
        />
      ) : null}
      {openId && !form && !move ? (
        <RecordDrawer
          key={`${openId}-${tick}`}
          mod={mod}
          id={openId}
          seed={open}
          titleOf={titleOf}
          ref_={ref}
          onClose={() => setOpenId("")}
          onEdit={(r) => setForm({ row: r, type: typeOfRow(r) ?? mod.types[0], parentId: r.parentId })}
          onChild={(r) => setForm({ row: null, type: typeOfRow(r) ?? mod.types[0], parentId: r.id })}
          onOpen={setOpenId}
          onMove={(r, s) => setMove({ row: r, to: s })}
        />
      ) : null}
      <ReasonModal
        open={!!move}
        title={t("moveTitle", { status: move ? ts(move.to) : "" })}
        lead={t("moveLead")}
        label={t("reason")}
        placeholder={t("reasonPh")}
        submitLabel={move ? (t.has(`move.${move.to}`) ? t(`move.${move.to}`) : ts(move.to)) : ""}
        onClose={() => setMove(null)}
        onSubmit={async (reason) => {
          if (!move) return;
          await transitionHrm(mod.key, move.row.id, move.to, reason);
          reload();
        }}
      />
    </section>
  );
}

// ── Form ────────────────────────────────────────────────────────────────────

function RecordForm({ mod, type, row, parentId, onType, onClose, onSaved }: { mod: HrmModule; type: HrmType; row: HrmRow | null; parentId: string; onType: (t: HrmType) => void; onClose: () => void; onSaved: (r: HrmRow | null) => void }) {
  const { t, type: typeName, field: fieldName, module } = useHrmText();
  const dir = useHrmDirectory();
  const [values, setValues] = useState<Dict>(() => {
    const out: Dict = {};
    for (const fd of type.fields) {
      const v = row ? (row.payload[fd.key] ?? (fd.key === "employee_id" ? row.employeeId || undefined : fd.key === "org_unit_id" ? row.unitId || undefined : undefined)) : fd.default ?? undefined;
      if (v !== undefined && v !== null) out[fd.key] = v;
    }
    return out;
  });
  const [title, setTitle] = useState(row?.title ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);
  // A new leave request is checked as it is filled (contract §10); a
  // blocking finding keeps it from being sent.
  const leaveForm = mod.key === "leave" && !row && ["leave_type_id", "start_date", "end_date"].every((k) => type.fields.some((fd) => fd.key === k));
  const leave = useLeaveCheck(leaveForm ? values : null);

  const set = (k: string, v: unknown) => {
    setValues((cur) => {
      const next = { ...cur };
      if (v === undefined) delete next[k];
      else next[k] = v;
      return next;
    });
    setErrors((cur) => {
      if (!cur[k]) return cur;
      const next = { ...cur };
      delete next[k];
      return next;
    });
  };

  function clientCheck(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const fd of type.fields) {
      const v = values[fd.key];
      if (empty(v)) {
        if (fd.required) out[fd.key] = t("err.required");
        continue;
      }
      if ((fd.type === "number" || fd.type === "money") && typeof v === "number") {
        if (fd.min !== null && v < fd.min) out[fd.key] = t("err.min", { n: fd.min });
        else if (fd.max !== null && v > fd.max) out[fd.key] = t("err.max", { n: fd.max });
      }
      if ((fd.type === "number" || fd.type === "money") && typeof v !== "number") out[fd.key] = t("err.number");
      if (fd.type === "select" && fd.options.length && !fd.options.includes(text(v))) out[fd.key] = t("err.option");
    }
    // An end that comes before its start (spec §17).
    for (const [a, b] of SPANS) {
      if (b && text(values[a]) && text(values[b]) && text(values[b]) < text(values[a])) out[b] = t("err.range");
    }
    return out;
  }

  function body(): HrmInput {
    const payload: Dict = {};
    for (const [k, v] of Object.entries(values)) if (!empty(v)) payload[k] = v;
    const employee = text(values.employee_id) || (row?.employeeId ?? "");
    // A person's record belongs to their unit unless the form says otherwise.
    const unit = text(values.org_unit_id) || text(values.team_org_unit_id) || (row?.unitId ?? "") || (employee ? (dir.employee(employee)?.unitId ?? "") : "");
    const subject = employee ? dir.employeeName(employee) : unit ? dir.unitName(unit) : "";
    return {
      record_type: type.key,
      employee_id: employee || null,
      org_unit_id: unit || null,
      parent_id: parentId || row?.parentId || null,
      title: title.trim() || [typeName(type), subject].filter(Boolean).join(" — "),
      effective_from: row?.from || null,
      effective_to: row?.to || null,
      payload,
    };
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setGeneral("");
    const own = clientCheck();
    if (Object.keys(own).length) {
      setErrors(own);
      return;
    }
    if (leave.blocked || leave.busy) {
      setGeneral(leave.busy ? t("leaveChecking") : t("leaveBlocked"));
      return;
    }
    setBusy(true);
    const b = body();
    try {
      // The backend's own check first (spec §13): errors under their fields.
      // Only for a new record: /validate has no way to be told which record
      // is being edited, so a period check finds the record itself and
      // refuses every edit. The PATCH runs the same checks, itself left out.
      const check = row
        ? null
        : await validateHrm(mod.key, b).catch((err: unknown) => {
            if (err instanceof ApiError && err.status !== 404 && err.status !== 405) {
              const he = hrmErrorOf(err);
              return { ok: false, errors: he.fields, message: he.message };
            }
            return null;
          });
      if (check && !check.ok) {
        setErrors(check.errors);
        setGeneral(check.message || (Object.keys(check.errors).some((k) => !type.fields.some((fd) => fd.key === k)) ? Object.entries(check.errors).filter(([k]) => !type.fields.some((fd) => fd.key === k)).map(([, v]) => v).join("; ") : ""));
        return;
      }
      const saved = row ? await patchHrm(mod.key, row.id, { record_type: b.record_type, title: b.title, employee_id: b.employee_id, org_unit_id: b.org_unit_id, payload: b.payload }) : await createHrm(mod.key, b);
      onSaved(saved);
    } catch (err) {
      const he = hrmErrorOf(err);
      setErrors(he.fields);
      const loose = Object.entries(he.fields).filter(([k]) => !type.fields.some((fd) => fd.key === k));
      setGeneral(he.message || loose.map(([, v]) => v).join("; ") || (Object.keys(he.fields).length ? "" : apiMessage(err, t("saveError"))));
    } finally {
      setBusy(false);
    }
  }

  const wide = (fd: HrmField) => LONG.has(fd.type) || fd.type === "textarea";
  return (
    <HrmDrawer open onClose={onClose} title={row ? t("editOf", { type: typeName(type) }) : t("newOf", { type: typeName(type) })} sub={`${module(mod)}${row?.code ? ` · ${row.code}` : ""}`}>
      <form className="hrm-form hrmc-form" onSubmit={save} noValidate>
        {general ? <HrmError text={general} /> : null}
        {!row && mod.types.length > 1 && !parentId ? (
          <InternalField label={t("form.type")}>
            <Select value={type.key} onChange={(k) => onType(mod.types.find((x) => x.key === k) ?? type)} options={mod.types.map((x) => ({ value: x.key, label: typeName(x) }))} ariaLabel={t("form.type")} />
          </InternalField>
        ) : null}
        <div className="hrm-form__grid">
          <div className="is-wide">
            <InternalField label={t("form.title")} hint={t("form.titleHint")}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </InternalField>
          </div>
          {type.fields.map((fd) => (
            <div key={fd.key} className={`${wide(fd) ? "is-wide" : ""}${errors[fd.key] ? " is-bad" : ""}`} data-field={fd.key}>
              <InternalField label={`${fieldName(fd)}${fd.required ? " *" : ""}`} hint={fd.min !== null || fd.max !== null ? [fd.min !== null ? `≥ ${fd.min}` : "", fd.max !== null ? `≤ ${fd.max}` : ""].filter(Boolean).join(" · ") : undefined}>
                <HrmFieldInput field={fd} value={values[fd.key]} onChange={(v) => set(fd.key, v)} invalid={Boolean(errors[fd.key])} />
              </InternalField>
              {errors[fd.key] ? <p className="stu-ferr" role="alert">{errors[fd.key]}</p> : null}
            </div>
          ))}
        </div>
        {leaveForm ? <LeaveCheckNote state={leave} /> : null}
        <p className="hrm-muted hrmc-form__note">{t("form.statusNote")}</p>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || leave.blocked}>
            <IconCheck />
            {busy ? t("form.saving") : row ? t("form.save") : t("form.create")}
          </button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>
            {t("form.cancel")}
          </button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// ── Detail ──────────────────────────────────────────────────────────────────

function RecordDrawer({
  mod,
  id,
  seed,
  titleOf,
  ref_,
  onClose,
  onEdit,
  onChild,
  onOpen,
  onMove,
}: {
  mod: HrmModule;
  id: string;
  seed: HrmRow | null;
  titleOf: (r: HrmRow) => string;
  ref_: (source: string, id: string) => string;
  onClose: () => void;
  onEdit: (r: HrmRow) => void;
  onChild: (r: HrmRow) => void;
  onOpen: (id: string) => void;
  onMove: (r: HrmRow, to: string) => void;
}) {
  const { t, type: typeName, field: fieldName } = useHrmText();
  const ts = useStatusLabel();
  const f = useHrmFormat();
  const fmt = useFormatValue();
  const [data, setData] = useState<{ row: HrmRow; children: HrmRow[] } | null>(seed ? { row: seed, children: [] } : null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const c = new AbortController();
    getHrm(mod.key, id, c.signal)
      .then((d) => !c.signal.aborted && setData(d))
      .catch((e) => !c.signal.aborted && setErr(apiMessage(e, t("loadError"))));
    return () => c.abort();
  }, [mod.key, id, t]);
  const r = data?.row ?? null;
  if (!r) {
    return (
      <HrmDrawer open onClose={onClose} title={t("loading")}>
        {err ? <HrmError text={err} /> : <HrmLoading rows={5} />}
      </HrmDrawer>
    );
  }
  const type = mod.types.find((x) => x.key === r.type) ?? null;
  const fields = type?.fields ?? [];
  const facts = fields.filter((x) => !LONG.has(x.type)).map((x) => ({ label: fieldName(x), value: fmt(x, r.payload[x.key] ?? (x.key === "employee_id" ? r.employeeId : x.key === "org_unit_id" ? r.unitId : undefined), ref_) })).filter((x) => x.value);
  const longs = fields.filter((x) => LONG.has(x.type) && !empty(r.payload[x.key]));
  const extra = Object.keys(r.payload).filter((k) => !fields.some((x) => x.key === k));
  const checklist = Array.isArray(r.payload.checklist) ? (r.payload.checklist as unknown[]).filter(isDict) : [];
  return (
    <HrmDrawer
      open
      onClose={onClose}
      title={titleOf(r)}
      sub={[r.code, typeName(type, mod.key, r.type)].filter(Boolean).join(" · ")}
      footer={
        <>
          {/* The backend takes an edit only while a record is a draft or
              was sent back; in any other state it is changed by moving it. */}
          {EDITABLE.includes(r.status) ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => onEdit(r)}>{t("edit")}</button>
          ) : (
            <small className="hrm-muted hrmc-noedit">{t("noEdit")}</small>
          )}
          {type?.allowChildren ? <button type="button" className="btn btn--line btn--sm" onClick={() => onChild(r)}><IconPlus />{t("addChild")}</button> : null}
        </>
      }
    >
      {err ? <HrmError text={err} /> : null}
      <div className="hrm-chips">
        <HrmStatus value={r.status} />
        <span className="hrmc-code">{r.code}</span>
        <span className="hrm-muted">{t("schemaVersion", { n: r.schemaVersion })}</span>
      </div>
      {r.allowed.length ? (
        <HrmSection label={t("moves")}>
          <div className="hr-moves">
            {r.allowed.map((m) => (
              <button key={m} type="button" className={`btn btn--sm ${["rejected", "returned", "cancelled", "archived", "draft", "blocked", "on_hold"].includes(m) ? "btn--line" : "btn--pri"}`} onClick={() => onMove(r, m)}>
                <IconArrowRight />
                {t.has(`move.${m}`) ? t(`move.${m}`) : ts(m)}
              </button>
            ))}
          </div>
        </HrmSection>
      ) : (
        <p className="hrm-muted">{t("noMoves")}</p>
      )}
      <HrmKv
        rows={[
          ...(r.employeeId && !fields.some((x) => x.key === "employee_id") ? [{ label: t("employee"), value: ref_("/internal/employees", r.employeeId) }] : []),
          ...(r.unitId && !fields.some((x) => x.key === "org_unit_id") ? [{ label: t("unit"), value: ref_("/internal/org/units", r.unitId) }] : []),
          ...facts,
          { label: t("created"), value: f.dateTime(r.createdAt) },
          ...(r.updatedAt && r.updatedAt !== r.createdAt ? [{ label: t("col.updated"), value: f.dateTime(r.updatedAt) }] : []),
          ...(r.approvedAt ? [{ label: t("approvedAt"), value: f.dateTime(r.approvedAt) }] : []),
        ]}
      />
      {longs.map((x) =>
        x.key === "checklist" && checklist.length ? (
          <HrmSection key={x.key} label={fieldName(x)} aside={<span className="hrm-count">{checklist.filter((c) => c.done === true).length}/{checklist.length}</span>}>
            <ul className="hrm-checks">
              {checklist.map((c, i) => (
                <li key={i}>
                  <div className={`hrm-checks__row${c.done === true ? " is-done" : ""}`}>
                    <span className={`hrm-checks__mark${c.done === true ? " on" : ""}`} aria-hidden="true"><IconCheck /></span>
                    <span>{text(c.title)}</span>
                    {c.done === true ? <span className="sr-only">{t("form.done")}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </HrmSection>
        ) : (
          <HrmSection key={x.key} label={fieldName(x)}>
            <p className="fb-text">{fmt(x, r.payload[x.key], ref_)}</p>
          </HrmSection>
        ),
      )}
      {extra.length ? (
        <HrmSection label={t("extraFields")}>
          <HrmKv rows={extra.map((k) => ({ label: humanize(k), value: plainOf(r.payload[k], t("form.yes"), t("form.no")) || "—" }))} />
        </HrmSection>
      ) : null}
      {data && data.children.length ? (
        <HrmSection label={t("children")} aside={<span className="hrm-count">{data.children.length}</span>}>
          <ul className="hrm-list">
            {data.children.map((c) => (
              <li key={c.id}>
                <button type="button" className="org-row" onClick={() => onOpen(c.id)}>
                  <span className="hrm-list__t"><b>{titleOf(c)}</b><small>{[c.code, ts(c.status)].join(" · ")}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </HrmSection>
      ) : null}
    </HrmDrawer>
  );
}
