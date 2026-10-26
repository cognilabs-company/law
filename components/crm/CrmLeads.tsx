"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { IconAlert, IconCheck, IconDownload, IconLayers, IconPlus, IconRefresh, IconSearch } from "@/components/icons";
import { IconBookmark, IconX } from "./icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { CRM_STATUSES, claimCrmLead, crmCan, isClaimRace, leadCan, listCrmLeads, listCrmOperators, type CrmLead, type CrmMeta, type CrmOperator, type LeadQuery } from "@/lib/services/crm";
import { useCrmEvents, useNow } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Avatar, Empty, ScoreChip, StageDots, StatusPill, WhenChip, useCrmError } from "./bits";

type Tab = "queue" | "mine" | "all";
type Filters = { status: string; score: string; source: string; category: string; region: string; q: string; operator: string; due: string; createdFrom: string; createdTo: string };
const EMPTY: Filters = { status: "", score: "", source: "", category: "", region: "", q: "", operator: "", due: "", createdFrom: "", createdTo: "" };
const LIMIT = 50;
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

// Backend filters only: the due chips become next_action_from/to.
export function queryOf(tab: Tab, f: Filters, offset: number, now: number): LeadQuery {
  const day = new Date(now || Date.now());
  const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59).toISOString();
  return {
    queueOnly: tab === "queue",
    mineOnly: tab === "mine",
    status: f.status,
    score: f.score,
    source: f.source,
    category: f.category,
    region: f.region,
    q: f.q,
    operator: tab === "all" ? f.operator : "",
    nextTo: f.due === "overdue" ? new Date(now || Date.now()).toISOString() : f.due === "today" ? endOfDay : "",
    createdFrom: f.createdFrom ? new Date(f.createdFrom).toISOString() : "",
    createdTo: f.createdTo ? new Date(`${f.createdTo}T23:59:59`).toISOString() : "",
    limit: LIMIT,
    offset,
  };
}

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
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);
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
      if (!rows?.length && e.key !== "/") return;
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
  const activeFilters = useMemo(() => Object.entries(f).filter(([k, v]) => v && k !== "q"), [f]);
  const saveView = () => {
    const name = window.prompt(t("viewName"))?.trim();
    if (!name) return;
    const next = [{ name, tab, f }, ...views.filter((v) => v.name !== name)];
    setViews(next);
    writeViews(next);
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
        <span className="crm-hint" style={{ marginLeft: "auto" }}>
          {t.rich("keys", { k: (c) => <kbd>{c}</kbd> })}
        </span>
      </div>

      <div className="crm-filters">
        <label className="crm-search">
          <IconSearch aria-hidden="true" />
          <input ref={searchRef} value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        </label>
        <select className="crm-select" value={f.status} onChange={(e) => setFilter({ status: e.target.value })} aria-label={t("f.status")}>
          <option value="">{t("f.anyStatus")}</option>
          {(meta.statuses.length ? meta.statuses : [...CRM_STATUSES]).map((s) => (
            <option key={s} value={s}>
              {ts.has(s) ? ts(s) : s}
            </option>
          ))}
        </select>
        <select className="crm-select" value={f.score} onChange={(e) => setFilter({ score: e.target.value })} aria-label={t("f.score")}>
          <option value="">{t("f.anyScore")}</option>
          {meta.scores.map((s) => (
            <option key={s} value={s}>
              {tsc.has(s) ? tsc(s) : s}
            </option>
          ))}
        </select>
        <select className="crm-select" value={f.source} onChange={(e) => setFilter({ source: e.target.value })} aria-label={t("f.source")}>
          <option value="">{t("f.anySource")}</option>
          {meta.sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {tab === "all" && ops.length ? (
          <select className="crm-select" value={f.operator} onChange={(e) => setFilter({ operator: e.target.value })} aria-label={t("f.operator")}>
            <option value="">{t("f.anyOperator")}</option>
            {ops.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
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
        <label className="crm-chip" style={{ cursor: "default" }}>
          {t("f.created")}
          <input type="date" value={f.createdFrom} onChange={(e) => setFilter({ createdFrom: e.target.value })} aria-label={t("f.createdFrom")} style={{ border: 0, background: "transparent", color: "inherit", font: "inherit" }} />
          –
          <input type="date" value={f.createdTo} onChange={(e) => setFilter({ createdTo: e.target.value })} aria-label={t("f.createdTo")} style={{ border: 0, background: "transparent", color: "inherit", font: "inherit" }} />
        </label>
        {activeFilters.length ? (
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setFilter({ ...EMPTY, q: f.q })}>
            <IconX aria-hidden="true" />
            {t("f.clear")}
          </button>
        ) : null}
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--sm" onClick={saveView}>
          <IconBookmark aria-hidden="true" />
          {t("saveView")}
        </button>
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

      {rows === null ? (
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
      {rows && total > LIMIT ? (
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
