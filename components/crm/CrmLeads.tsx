"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { IconAlert, IconCheck, IconDownload, IconGrid, IconLayers, IconList, IconPlus, IconRefresh, IconSearch } from "@/components/icons";
import { IconBookmark, IconX } from "./icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { CRM_STATUSES, claimCrmLead, crmCan, isClaimRace, leadCan, listCrmLeads, listCrmOperators, type CrmLead, type CrmMeta, type CrmOperator } from "@/lib/services/crm";
import { useCrmEvents, useNow } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { LeadBoard } from "./LeadBoard";
import { EMPTY, LIMIT, queryOf, type Filters, type Tab } from "./leadQuery";
import { Avatar, Empty, ScoreChip, StageDots, StatusPill, WhenChip, useCrmError } from "./bits";
import { CrmDate, CrmSelect } from "./fields";

const VIEWS_KEY = "lexgo.crm.views";
type View = { name: string; tab: Tab; f: Filters };

const readViews = (): View[] => {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, 8) : [];
  } catch {
    return [];
  }
};
const writeViews = (v: View[]) => {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(v.slice(0, 8)));
  } catch {
    /* storage off: views stay for this visit */
  }
};

export default function CrmLeads(): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame
      title={t("leads.title")}
      tools={(api) => (
        <>
          {crmCan(api.meta, "crm.exports.create") ? (
            <button type="button" className="crm-btn crm-btn--icon" onClick={() => api.open("export")} aria-label={t("export.title")} title={t("export.title")}>
              <IconDownload aria-hidden="true" />
            </button>
          ) : null}
          {crmCan(api.meta, "crm.leads.manage") ? (
            <button type="button" className="crm-btn crm-btn--pri" onClick={() => api.open("lead")}>
              <IconPlus aria-hidden="true" />
              {t("newLead.title")}
            </button>
          ) : null}
        </>
      )}
    >
      {(api) => <LeadTable meta={api.meta} />}
    </CrmFrame>
  );
}

function LeadTable({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("crm.leads");
  const ts = useTranslations("crm.status");
  const tsc = useTranslations("crm.score");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const crmErr = useCrmError();
  const now = useNow();
  const initialTab = (["queue", "mine", "all"] as Tab[]).includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "queue";
  const [tab, setTab] = useState<Tab>(initialTab);
  // Table or board: the URL first, then the operator's last choice.
  const [view, setView] = useState<"table" | "board">(params.get("view") === "board" ? "board" : "table");
  useEffect(() => {
    if (params.get("view")) return;
    const id = window.setTimeout(() => {
      try {
        if (localStorage.getItem("lexgo.crm.view") === "board") setView("board");
      } catch {
        /* storage off */
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [params]);
  const pickView = (v: "table" | "board") => {
    setView(v);
    try {
      localStorage.setItem("lexgo.crm.view", v);
    } catch {
      /* storage off */
    }
  };
  const [f, setF] = useState<Filters>({ ...EMPTY, status: params.get("status") ?? "", due: params.get("due") ?? "" });
  const [qInput, setQInput] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<CrmLead[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tabCounts, setTabCounts] = useState<Record<Tab, number | null>>({ queue: null, mine: null, all: null });
  const [err, setErr] = useState("");
  const [active, setActive] = useState(0);
  const [holding, setHolding] = useState<Record<string, "hold" | "done" | "lost">>({});
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [ops, setOps] = useState<CrmOperator[]>([]);
  const [views, setViews] = useState<View[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const seq = useRef(0);
  const canAssignView = crmCan(meta, "crm.leads.assign");

  useEffect(() => {
    const id = window.setTimeout(() => setViews(readViews()), 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!canAssignView) return;
    const ctl = new AbortController();
    listCrmOperators("", ctl.signal).then(setOps, (e) => !isAborted(e) && logApiError("crm.operators", e));
    return () => ctl.abort();
  }, [canAssignView]);
  // Debounced search into the backend's `q`.
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
      const [q, m, a] = await Promise.all([listCrmLeads({ queueOnly: true, limit: 1 }, signal), listCrmLeads({ mineOnly: true, limit: 1 }, signal), listCrmLeads({ limit: 1 }, signal)]);
      setTabCounts({ queue: q.total, mine: m.total, all: a.total });
    } catch (e) {
      if (!isAborted(e)) logApiError("crm.leads.counts", e);
    }
  }, []);
  useEffect(() => {
    if (view === "board") return;
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load, view]);
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void loadCounts(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [loadCounts]);

  // Realtime: refetch, never append; a touched row flashes once it is back.
  useCrmEvents((ev) => {
    if (!ev.invalidate.some((k) => k === "all" || k === "lists" || k === "queue" || k === "counts" || k === "lead")) return;
    if (ev.leadId) setFlash((cur) => ({ ...cur, [ev.leadId]: Date.now() }));
    void load();
    void loadCounts();
  });
  useEffect(() => {
    const keys = Object.keys(flash);
    if (!keys.length) return;
    const id = window.setTimeout(() => setFlash({}), 1800);
    return () => window.clearTimeout(id);
  }, [flash]);

  const claim = async (lead: CrmLead) => {
    if (!leadCan(lead, "claim") || holding[lead.id]) return;
    setHolding((h) => ({ ...h, [lead.id]: "hold" }));
    try {
      await claimCrmLead(lead.id);
      setHolding((h) => ({ ...h, [lead.id]: "done" }));
      toast(t("claimed", { title: lead.title || lead.workId }), { tone: "ok" });
      window.setTimeout(() => {
        setHolding((h) => {
          const n = { ...h };
          delete n[lead.id];
          return n;
        });
        void load();
        void loadCounts();
      }, 650);
    } catch (e) {
      // Someone else was faster: never shown as ours; the row leaves (§4.5).
      if (isClaimRace(e)) {
        setHolding((h) => ({ ...h, [lead.id]: "lost" }));
        toast(t("claimLost"), { tone: "err" });
        window.setTimeout(() => {
          setHolding((h) => {
            const n = { ...h };
            delete n[lead.id];
            return n;
          });
          void load();
          void loadCounts();
        }, 950);
      } else {
        setHolding((h) => {
          const n = { ...h };
          delete n[lead.id];
          return n;
        });
        toast(crmErr(e), { tone: "err" });
      }
    }
  };

  // j/k move, Enter opens, c claims (only when allowed), / searches.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target as HTMLElement | null)?.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (view !== "table" || (!rows?.length && e.key !== "/")) return;
      if (e.key === "j") setActive((a) => Math.min((rows?.length ?? 1) - 1, a + 1));
      else if (e.key === "k") setActive((a) => Math.max(0, a - 1));
      else if (e.key === "Enter" && rows?.[active]) router.push(`/admin/crm/leads/${encodeURIComponent(rows[active].id)}`);
      else if (e.key === "c" && rows?.[active]) void claim(rows[active]);
      else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    document.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const setFilter = (patch: Partial<Filters>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setOffset(0);
  };
  // The board's columns are the statuses, so its filters leave status out.
  const boardFilters = useMemo(() => ({ ...f, status: "" }), [f]);
  const activeFilters = useMemo(() => Object.entries(f).filter(([k, v]) => v && k !== "q"), [f]);
  const [naming, setNaming] = useState<string | null>(null);
  const saveView = () => {
    const name = (naming ?? "").trim();
    if (!name) return;
    const next = [{ name, tab, f }, ...views.filter((v) => v.name !== name)];
    setViews(next);
    writeViews(next);
    setNaming(null);
  };

  const tabs: Tab[] = ["queue", "mine", "all"];
  return (
    <>
      <div className="crm-tabs" role="tablist" aria-label={t("tabs")}>
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            className="crm-tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              setOffset(0);
            }}
          >
            {t(`tab.${k}`)}
            <em>{tabCounts[k] ?? "·"}</em>
          </button>
        ))}
        <span className="crm-seg" role="group" aria-label={t("view")} style={{ marginLeft: "auto" }}>
          <button type="button" aria-pressed={view === "table"} onClick={() => pickView("table")}>
            <IconList aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 4 }} />
            {t("viewTable")}
          </button>
          <button type="button" aria-pressed={view === "board"} onClick={() => pickView("board")}>
            <IconGrid aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 4 }} />
            {t("viewBoard")}
          </button>
        </span>
        {view === "table" ? <span className="crm-hint crm-hide-sm">{t.rich("keys", { k: (c) => <kbd>{c}</kbd> })}</span> : null}
      </div>

      <div className="crm-filters">
        <label className="crm-search">
          <IconSearch aria-hidden="true" />
          <input ref={searchRef} value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        </label>
        {view === "table" ? <CrmSelect value={f.status} onChange={(v) => setFilter({ status: v })} label={t("f.status")} options={[{ value: "", label: t("f.anyStatus") }, ...(meta.statuses.length ? meta.statuses : [...CRM_STATUSES]).map((s) => ({ value: s, label: ts.has(s) ? ts(s) : s }))]} /> : null}
        <CrmSelect value={f.score} onChange={(v) => setFilter({ score: v })} label={t("f.score")} options={[{ value: "", label: t("f.anyScore") }, ...meta.scores.map((s) => ({ value: s, label: tsc.has(s) ? tsc(s) : s }))]} />
        <CrmSelect value={f.source} onChange={(v) => setFilter({ source: v })} label={t("f.source")} options={[{ value: "", label: t("f.anySource") }, ...meta.sources.map((s) => ({ value: s, label: s }))]} />
        {tab === "all" && ops.length ? (
          <CrmSelect value={f.operator} onChange={(v) => setFilter({ operator: v })} label={t("f.operator")} options={[{ value: "", label: t("f.anyOperator") }, ...ops.map((o) => ({ value: o.id, label: o.name }))]} />
        ) : null}
        <input className="crm-input" style={{ width: 140 }} value={f.category} onChange={(e) => setFilter({ category: e.target.value })} placeholder={t("f.category")} aria-label={t("f.category")} />
        <input className="crm-input" style={{ width: 130 }} value={f.region} onChange={(e) => setFilter({ region: e.target.value })} placeholder={t("f.region")} aria-label={t("f.region")} />
        <button type="button" className="crm-chip" aria-pressed={f.due === "overdue"} onClick={() => setFilter({ due: f.due === "overdue" ? "" : "overdue" })}>
          <IconAlert aria-hidden="true" />
          {t("f.overdue")}
        </button>
        <button type="button" className="crm-chip" aria-pressed={f.due === "today"} onClick={() => setFilter({ due: f.due === "today" ? "" : "today" })}>
          {t("f.today")}
        </button>
        <span className="crm-range" role="group" aria-label={t("f.created")}>
          <CrmDate value={f.createdFrom} onChange={(v) => setFilter({ createdFrom: v })} label={t("f.createdFrom")} max={f.createdTo || undefined} />
          <CrmDate value={f.createdTo} onChange={(v) => setFilter({ createdTo: v })} label={t("f.createdTo")} min={f.createdFrom || undefined} />
        </span>
        {activeFilters.length ? (
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setFilter({ ...EMPTY, q: f.q })}>
            <IconX aria-hidden="true" />
            {t("f.clear")}
          </button>
        ) : null}
        {naming === null ? (
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setNaming("")}>
            <IconBookmark aria-hidden="true" />
            {t("saveView")}
          </button>
        ) : (
          <span className="crm-viewname">
            <input
              className="crm-input"
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
            <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" onClick={saveView} disabled={!naming.trim()}>
              <IconCheck aria-hidden="true" />
            </button>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setNaming(null)} aria-label={t("f.clear")}>
              <IconX aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
      {views.length ? (
        <div className="crm-filters" aria-label={t("views")}>
          {views.map((v) => (
            <span key={v.name} className="crm-chip" style={{ paddingRight: 4 }}>
              <button
                type="button"
                className="crm-link"
                onClick={() => {
                  setTab(v.tab);
                  setF(v.f);
                  setQInput(v.f.q);
                  setOffset(0);
                }}
              >
                {v.name}
              </button>
              <button
                type="button"
                className="crm-icobtn"
                aria-label={t("removeView", { name: v.name })}
                onClick={() => {
                  const next = views.filter((x) => x.name !== v.name);
                  setViews(next);
                  writeViews(next);
                }}
              >
                <IconX aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {err ? (
        <div className="crm-err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{err}</span>
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => void load()}>
            <IconRefresh aria-hidden="true" />
            {t("retry")}
          </button>
        </div>
      ) : null}

      {view === "board" ? (
        <LeadBoard meta={meta} tab={tab} filters={boardFilters} onClaim={(l) => void claim(l)} claiming={holding} />
      ) : rows === null ? (
        <div className="crm-card" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="crm-sk" style={{ height: 22, width: `${96 - ((i * 11) % 30)}%` }} />
          ))}
        </div>
      ) : !rows.length ? (
        <div className="crm-card">
          <Empty icon={tab === "queue" ? <IconCheck /> : <IconLayers />} title={t(`empty.${tab}`)} text={t(`emptyText.${tab}`)} />
        </div>
      ) : (
        <div className="crm-tablewrap">
          <table className="crm-table" aria-rowcount={total}>
            <thead>
              <tr>
                <th scope="col">{t("col.lead")}</th>
                <th scope="col">{t("col.status")}</th>
                <th scope="col">{t("col.score")}</th>
                <th scope="col">{t("col.next")}</th>
                <th scope="col">{t("col.owner")}</th>
                <th scope="col" className="crm-hide-sm">
                  {t("col.created")}
                </th>
                <th scope="col">
                  <span className="crm-vh">{t("col.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => {
                const h = holding[l.id];
                return (
                  <tr
                    key={l.id}
                    data-row={i}
                    data-active={i === active || undefined}
                    data-urgency={l.urgency || "normal"}
                    data-flash={flash[l.id] ? "" : undefined}
                    data-holding={h === "hold" || undefined}
                    data-shake={h === "lost" || undefined}
                    data-gone={h === "lost" || (h === "done" && tab === "queue") || undefined}
                    onClick={() => router.push(`/admin/crm/leads/${encodeURIComponent(l.id)}`)}
                    onMouseEnter={() => setActive(i)}
                  >
                    <td>
                      <span className="crm-lead">
                        <b>{l.title || l.workId}</b>
                        <small>
                          <span className="crm-code">{l.workId}</span> · {l.customer?.name || "—"}
                          {l.category ? ` · ${l.category}` : ""}
                        </small>
                      </span>
                    </td>
                    <td>
                      <StatusPill status={l.status} />
                      <br />
                      <StageDots status={l.status} />
                    </td>
                    <td>
                      <ScoreChip score={l.score} />
                    </td>
                    <td>{l.nextActionAt ? <WhenChip at={l.nextActionAt} now={now} /> : <span className="crm-muted">—</span>}</td>
                    <td>
                      {l.operator ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Avatar name={l.operator.name} />
                          <span className="crm-hide-sm">{l.operator.name}</span>
                        </span>
                      ) : (
                        <span className="crm-muted">{t("unassigned")}</span>
                      )}
                    </td>
                    <td className="crm-hide-sm crm-muted">{l.createdAt ? shortDateTime(l.createdAt, locale) : ""}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {leadCan(l, "claim") && !l.operatorId ? (
                        <button type="button" className="crm-btn crm-btn--pri crm-btn--sm crm-claim" data-done={h === "done" || undefined} onClick={() => void claim(l)} disabled={!!h} aria-busy={h === "hold" || undefined}>
                          {h === "done" ? <IconCheck aria-hidden="true" /> : null}
                          {h === "done" ? t("claimDone") : t("claim")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {view === "table" && rows && total > LIMIT ? (
        <div className="crm-pager">
          <span>{t("range", { from: offset + 1, to: Math.min(total, offset + LIMIT), total })}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="crm-btn crm-btn--sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
              {t("prev")}
            </button>
            <button type="button" className="crm-btn crm-btn--sm" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
              {t("next")}
            </button>
          </span>
        </div>
      ) : null}
    </>
  );
}
