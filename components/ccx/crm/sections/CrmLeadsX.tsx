"use client";

import "../../panel/panel.css";
import "../leads/leads.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { useCcxPrefs } from "@/lib/ccx/prefs";
import { loadCrmMeta, useCrmEvents, useNow } from "@/lib/crm/useCrm";
import { claimCrmLead, crmCan, isClaimRace, leadCan, listCrmLeads, listCrmOperators, type CrmLead, type CrmOperator } from "@/lib/services/crm";
import { EMPTY, LIMIT, queryOf, type Filters, type Tab } from "@/components/crm/leadQuery";
import { plainKey } from "../../now/feed";
import { IcCheck, IcClock, IcClose, IcFlag, IcLayers, IcRefresh, IcSearch } from "../../icons";
import { leadHref, type CrmSectionProps } from "../nav";
import { IcBoard, IcBookmark, IcFilter, IcList } from "../leads/icons";
import LeadBoardX from "../leads/LeadBoardX";
import LeadTableX, { type Hold } from "../leads/LeadTableX";
import { NewLeadButton } from "../leads/NewLeadSheet";
import { stageVars, useCrmErr, useStageLabel } from "../leads/util";

type Layout = "list" | "board";
type Scope = "queue" | "mine" | "overdue" | "all";
type Saved = { name: string; tab: Tab; f: Filters };
type Counts = Record<Scope, number | null>;

const VIEWS_KEY = "lexgo.crm.views";
const VIEW_KEY = "lexgo.crm.view";
const TABS: Tab[] = ["queue", "mine", "all"];
const SCOPES: Scope[] = ["queue", "mine", "overdue", "all"];

const readViews = (): Saved[] => {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, 8) : [];
  } catch {
    return [];
  }
};

const writeViews = (v: Saved[]) => {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(v.slice(0, 8)));
  } catch {}
};

const readLayout = (): Layout => {
  try {
    return localStorage.getItem(VIEW_KEY) === "table" ? "list" : "board";
  } catch {
    return "board";
  }
};

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <span className="opx-ld-sel" data-on={value ? "" : undefined}>
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} />
    </span>
  );
}

export default function CrmLeadsX({ meta }: CrmSectionProps) {
  const t = useTranslations("crm.leads");
  const tb = useTranslations("crm.board");
  const tsrc = useTranslations("crm.source");
  const tsc = useTranslations("crm.score");
  const tx = useTranslations("admin.ccx.crmLeads");
  const label = useStageLabel(meta);
  const router = useRouter();
  const params = useSearchParams();
  const crmErr = useCrmErr();
  const now = useNow();
  const prefs = useCcxPrefs();
  const canAssign = crmCan(meta, "crm.leads.assign");

  const [boot] = useState(() => {
    const asked = (params.get("scope") ?? params.get("tab")) as Tab | null;
    const tab0 = asked && TABS.includes(asked) ? asked : null;
    const status = params.get("status") ?? "";
    const due = params.get("due") ?? "";
    const want = params.get("layout");
    const layout: Layout = tab0 === "queue" || due ? "list" : want === "list" || want === "board" ? want : readLayout();
    const tab: Tab = tab0 ?? (layout === "board" ? "all" : "queue");
    return { layout, tab, status, due };
  });
  const [layout, setLayout] = useState<Layout>(boot.layout);
  const [tab, setTab] = useState<Tab>(boot.tab);
  const [f, setF] = useState<Filters>(() => ({ ...EMPTY, status: boot.status, due: boot.due }));
  const [qInput, setQInput] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<CrmLead[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts>({ queue: null, mine: null, overdue: null, all: null });
  const [err, setErr] = useState("");
  const [active, setActive] = useState(0);
  const [holding, setHolding] = useState<Record<string, Hold>>({});
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [ops, setOps] = useState<CrmOperator[]>([]);
  const [views, setViews] = useState<Saved[]>(readViews);
  const [naming, setNaming] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [boardTick, setBoardTick] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const seq = useRef(0);
  const refreshTimer = useRef(0);
  const refreshNow = useRef<() => void>(() => {});

  useEffect(() => {
    if (!canAssign) return;
    const ctl = new AbortController();
    listCrmOperators("", ctl.signal).then(setOps, (e) => {
      if (!isAborted(e)) logApiError("crm.operators", e);
    });
    return () => ctl.abort();
  }, [canAssign]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setF((cur) => (cur.q === qInput.trim() ? cur : { ...cur, q: qInput.trim() }));
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(id);
  }, [qInput]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const n = ++seq.current;
      try {
        const page = await listCrmLeads(queryOf(tab, f, offset, Date.now()), signal);
        if (n !== seq.current) return;
        setRows(page.items);
        setTotal(page.total);
        setErr("");
        setActive((a) => Math.min(a, Math.max(0, page.items.length - 1)));
      } catch (e) {
        if (isAborted(e) || n !== seq.current) return;
        logApiError("crm.leads", e);
        setErr(crmErr(e));
        setRows((cur) => cur ?? []);
      }
    },
    [tab, f, offset, crmErr],
  );

  const loadCounts = useCallback(async (signal?: AbortSignal) => {
    try {
      const at = new Date().toISOString();
      const [q, m, o, a] = await Promise.all([
        listCrmLeads({ queueOnly: true, limit: 1 }, signal),
        listCrmLeads({ mineOnly: true, limit: 1 }, signal),
        listCrmLeads({ mineOnly: true, nextTo: at, limit: 1 }, signal),
        listCrmLeads({ limit: 1 }, signal),
      ]);
      setCounts({ queue: q.total, mine: m.total, overdue: o.total, all: a.total });
    } catch (e) {
      if (!isAborted(e)) logApiError("crm.leads.counts", e);
    }
  }, []);

  useEffect(() => {
    if (layout === "board") return;
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load, layout]);

  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void loadCounts(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [loadCounts]);

  useEffect(() => {
    refreshNow.current = () => {
      if (layout === "board") setBoardTick((n) => n + 1);
      else void load();
      void loadCounts();
    };
  });
  const refresh = useCallback((wait = 350) => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => refreshNow.current(), wait);
  }, []);
  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);

  useCrmEvents((ev) => {
    if (ev.invalidate.includes("meta") || ev.invalidate.includes("all")) void loadCrmMeta(true);
    if (!ev.invalidate.some((k) => k === "all" || k === "lists" || k === "queue" || k === "counts" || k === "lead")) return;
    if (ev.leadId && layout === "list") setFlash((cur) => ({ ...cur, [ev.leadId]: Date.now() }));
    if (layout === "board") {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void loadCounts(), 350);
    } else refresh();
  });

  useEffect(() => {
    if (!Object.keys(flash).length) return;
    const id = window.setTimeout(() => setFlash({}), 1800);
    return () => window.clearTimeout(id);
  }, [flash]);

  const release = (id: string) =>
    setHolding((h) => {
      const n = { ...h };
      delete n[id];
      return n;
    });

  const claim = async (lead: CrmLead) => {
    if (!leadCan(lead, "claim") || holding[lead.id]) return;
    setHolding((h) => ({ ...h, [lead.id]: "hold" }));
    try {
      await claimCrmLead(lead.id);
      setHolding((h) => ({ ...h, [lead.id]: "done" }));
      toast(t("claimed", { title: lead.title || lead.workId }), { tone: "ok" });
      window.setTimeout(() => {
        release(lead.id);
        refresh(0);
      }, 650);
    } catch (e) {
      if (isClaimRace(e)) {
        setHolding((h) => ({ ...h, [lead.id]: "lost" }));
        toast(t("claimLost"), { tone: "err" });
        window.setTimeout(() => {
          release(lead.id);
          refresh(0);
        }, 950);
      } else {
        release(lead.id);
        toast(crmErr(e), { tone: "err" });
      }
    }
  };

  const claimRef = useRef(claim);
  useEffect(() => {
    claimRef.current = claim;
  });
  const onBoardClaim = useCallback((l: CrmLead) => void claimRef.current(l), []);
  const open = useCallback((l: CrmLead) => router.push(leadHref(l.id)), [router]);

  useEffect(() => {
    if (!prefs.keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (!plainKey(e)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (layout !== "list" || !rows?.length) return;
      if (e.key === "Enter" && e.target instanceof Element && e.target.closest("button, a, [tabindex]")) return;
      if (e.key === "j") setActive((a) => Math.min(rows.length - 1, a + 1));
      else if (e.key === "k") setActive((a) => Math.max(0, a - 1));
      else if (e.key === "Enter" && rows[active]) router.push(leadHref(rows[active].id));
      else if (e.key === "c" && rows[active]) void claim(rows[active]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    document.querySelector<HTMLElement>(`.opx-ld-table [data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const setFilter = (patch: Partial<Filters>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setOffset(0);
  };

  const scope: Scope = tab === "mine" && f.due === "overdue" ? "overdue" : tab;
  const shown: Scope = layout === "board" ? (tab === "mine" ? "mine" : "all") : scope;

  const pickScope = (s: Scope) => {
    setOffset(0);
    if (s === "overdue") {
      setTab("mine");
      setF((cur) => ({ ...cur, due: "overdue", nextFrom: "", nextTo: "" }));
    } else {
      setTab(s);
      if (scope === "overdue") setF((cur) => ({ ...cur, due: "" }));
    }
    if ((s === "queue" || s === "overdue") && layout === "board") setLayout("list");
  };

  const pickLayout = (v: Layout) => {
    setLayout(v);
    if (v === "board" && tab === "queue") setTab("all");
    try {
      localStorage.setItem(VIEW_KEY, v === "board" ? "board" : "table");
    } catch {}
  };

  const activeFilters = useMemo(() => Object.entries(f).filter(([k, v]) => v && k !== "q"), [f]);
  const extraOn = [f.region, f.createdFrom, f.createdTo, f.nextFrom, f.nextTo].filter(Boolean).length;

  const saveView = () => {
    const name = (naming ?? "").trim();
    if (!name) return;
    const next = [{ name, tab, f }, ...views.filter((v) => v.name !== name)];
    setViews(next);
    writeViews(next);
    setNaming(null);
  };
  const applyView = (v: Saved) => {
    setTab(TABS.includes(v.tab) ? v.tab : "all");
    setF({ ...EMPTY, ...v.f });
    setQInput(v.f?.q ?? "");
    setOffset(0);
  };
  const removeView = (name: string) => {
    const next = views.filter((x) => x.name !== name);
    setViews(next);
    writeViews(next);
  };

  const scopeLabel = (s: Scope) => (s === "queue" ? t("unassigned") : s === "mine" ? tx("mine") : s === "overdue" ? t("f.overdue") : t("tab.all"));

  return (
    <div className="opx-ld" style={stageVars(meta)} data-ai-target="callcenter:crm-leads">
      <div className="opx-ld-top">
        <div className="opx-ld-tabs" role="group" aria-label={t("tabs")}>
          {SCOPES.map((s) => {
            const n = counts[s];
            return (
              <button key={s} type="button" className="opx-ld-tab" data-scope={s} data-tone={s === "overdue" && (n ?? 0) > 0 ? "hot" : undefined} aria-pressed={shown === s} onClick={() => pickScope(s)}>
                {scopeLabel(s)}
                <b className="opx-num">{n ?? "·"}</b>
              </button>
            );
          })}
        </div>
        <label className="opx-search opx-ld-bar__search">
          <IcSearch size={18} />
          <input ref={searchRef} type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        </label>
        {layout === "list" ? (
          <button type="button" className="opx-pbtn opx-ld-filterbtn" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
            <IcFilter size={16} />
            {t("filter")}
            {activeFilters.length ? <b className="opx-num">{activeFilters.length}</b> : null}
          </button>
        ) : null}
        <div className="opx-ld-seg" role="group" aria-label={t("view")}>
          <button type="button" className={layout === "board" ? "is-on" : undefined} aria-pressed={layout === "board"} aria-label={t("viewBoard")} title={t("viewBoard")} onClick={() => pickLayout("board")}>
            <IcBoard size={17} />
          </button>
          <button type="button" className={layout === "list" ? "is-on" : undefined} aria-pressed={layout === "list"} aria-label={t("viewTable")} title={t("viewTable")} onClick={() => pickLayout("list")}>
            <IcList size={17} />
          </button>
        </div>
        <NewLeadButton meta={meta} quiet={crmCan(meta, "crm.leads.claim") && counts.queue !== 0} />
      </div>

      {layout === "list" && filtersOpen ? (
        <div className="opx-ld-filters">
          <Sel label={t("f.status")} value={f.status} onChange={(v) => setFilter({ status: v })} options={[{ value: "", label: t("f.anyStatus") }, ...meta.statuses.map((s) => ({ value: s, label: label(s) }))]} />
          <Sel label={t("f.score")} value={f.score} onChange={(v) => setFilter({ score: v })} options={[{ value: "", label: t("f.anyScore") }, ...meta.scores.map((s) => ({ value: s, label: tsc.has(s) ? tsc(s) : s }))]} />
          <Sel label={t("f.source")} value={f.source} onChange={(v) => setFilter({ source: v })} options={[{ value: "", label: t("f.anySource") }, ...meta.sources.map((s) => ({ value: s, label: tsrc.has(s) ? tsrc(s) : tsrc("other") }))]} />
          {tab === "all" && ops.length ? (
            <Sel label={t("f.operator")} value={f.operator} onChange={(v) => setFilter({ operator: v })} options={[{ value: "", label: t("f.anyOperator") }, ...ops.map((o) => ({ value: o.id, label: o.name }))]} />
          ) : null}
          <button type="button" className="opx-ld-chip" data-tone="hot" aria-pressed={f.due === "overdue"} onClick={() => setFilter({ due: f.due === "overdue" ? "" : "overdue", nextFrom: "", nextTo: "" })}>
            <IcFlag size={15} />
            {t("f.overdue")}
          </button>
          <button type="button" className="opx-ld-chip" aria-pressed={f.due === "today"} onClick={() => setFilter({ due: f.due === "today" ? "" : "today", nextFrom: "", nextTo: "" })}>
            <IcClock size={15} />
            {t("f.today")}
          </button>
          <button type="button" className="opx-ld-chip" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
            <IcFilter size={15} />
            {tx("moreFilters")}
            {extraOn ? <b className="opx-num">{extraOn}</b> : null}
          </button>
          {activeFilters.length ? (
            <button type="button" className="opx-ld-chip is-ghost" onClick={() => setFilter({ ...EMPTY, q: f.q })}>
              <IcClose size={14} />
              {t("f.clear")}
            </button>
          ) : null}
          {naming === null ? (
            <button type="button" className="opx-ld-chip is-ghost" onClick={() => setNaming("")}>
              <IcBookmark size={15} />
              {t("saveView")}
            </button>
          ) : (
            <span className="opx-ld-naming">
              <input
                autoFocus
                value={naming}
                onChange={(e) => setNaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveView();
                  if (e.key === "Escape") setNaming(null);
                }}
                placeholder={t("viewName")}
                aria-label={t("viewName")}
                maxLength={40}
              />
              <button type="button" onClick={saveView} disabled={!naming.trim()} aria-label={t("saveView")}>
                <IcCheck size={15} />
              </button>
              <button type="button" onClick={() => setNaming(null)} aria-label={tb("cancel")}>
                <IcClose size={14} />
              </button>
            </span>
          )}
        </div>
      ) : null}

      {layout === "list" && filtersOpen && moreOpen ? (
        <div className="opx-ld-more">
          <label className="opx-ld-in">
            <span>{t("f.region")}</span>
            <input value={f.region} onChange={(e) => setFilter({ region: e.target.value })} placeholder={t("f.region")} />
          </label>
          <fieldset className="opx-ld-range">
            <legend>{t("f.created")}</legend>
            <DatePicker value={f.createdFrom} max={f.createdTo || undefined} placeholder={t("f.createdFrom")} ariaLabel={t("f.createdFrom")} clearLabel={t("f.clear")} onChange={(v) => setFilter({ createdFrom: v })} />
            <span aria-hidden="true">–</span>
            <DatePicker value={f.createdTo} min={f.createdFrom || undefined} placeholder={t("f.createdTo")} ariaLabel={t("f.createdTo")} clearLabel={t("f.clear")} onChange={(v) => setFilter({ createdTo: v })} />
          </fieldset>
          <fieldset className="opx-ld-range">
            <legend>{t("f.next")}</legend>
            <DatePicker value={f.nextFrom} max={f.nextTo || undefined} placeholder={t("f.nextFrom")} ariaLabel={t("f.nextFrom")} clearLabel={t("f.clear")} onChange={(v) => setFilter({ nextFrom: v, due: "" })} />
            <span aria-hidden="true">–</span>
            <DatePicker value={f.nextTo} min={f.nextFrom || undefined} placeholder={t("f.nextTo")} ariaLabel={t("f.nextTo")} clearLabel={t("f.clear")} onChange={(v) => setFilter({ nextTo: v, due: "" })} />
          </fieldset>
        </div>
      ) : null}

      {views.length ? (
        <div className="opx-ld-views" role="group" aria-label={t("views")}>
          <IcBookmark size={15} />
          {views.map((v) => (
            <span key={v.name} className="opx-ld-view">
              <button type="button" onClick={() => applyView(v)}>
                {v.name}
              </button>
              <button type="button" className="opx-ld-view__x" aria-label={t("removeView", { name: v.name })} onClick={() => removeView(v.name)}>
                <IcClose size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {err && layout === "list" ? (
        <p className="opx-ld-warn" role="alert">
          {err}
          <button type="button" onClick={() => void load()}>
            <IcRefresh size={15} />
            {t("retry")}
          </button>
        </p>
      ) : null}

      {layout === "board" ? (
        <LeadBoardX meta={meta} mineOnly={tab === "mine"} q={f.q} focus={boot.status} onClaim={onBoardClaim} claiming={holding} refreshKey={boardTick} />
      ) : rows === null ? (
        <div className="opx-ld-tablewrap" aria-busy="true">
          {Array.from({ length: 7 }, (_, i) => (
            <i key={i} className="opx-shim opx-ld-sk-row" />
          ))}
        </div>
      ) : !rows.length ? (
        <div className="opx-ld-empty">
          <span className="opx-ld-empty__ic" aria-hidden="true">
            {tab === "queue" ? <IcCheck size={26} /> : <IcLayers size={26} />}
          </span>
          <b>{t(`empty.${tab}`)}</b>
        </div>
      ) : (
        <LeadTableX rows={rows} total={total} tab={tab} now={now} active={active} flash={flash} holding={holding} stageLabel={label} onOpen={open} onHover={setActive} onClaim={(l) => void claim(l)} />
      )}

      {layout === "list" && rows && total > LIMIT ? (
        <div className="opx-ld-pager">
          <span className="opx-num">{t("range", { from: offset + 1, to: Math.min(total, offset + LIMIT), total })}</span>
          <span>
            <button type="button" className="opx-pbtn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
              {t("prev")}
            </button>
            <button type="button" className="opx-pbtn" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
              {t("next")}
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
