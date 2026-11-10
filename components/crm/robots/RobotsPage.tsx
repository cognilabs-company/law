"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Activity, Archive, ArrowDown, ArrowUp, Bot, CalendarClock, CircleCheckBig, Copy, FlaskConical, Hourglass, Layers, ListChecks, Pause, Pencil, Play, Plus, Search, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { fmtDateTime, fmtNum } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { notify, toast } from "@/lib/toast";
import { matchesSearch } from "@/lib/searchText";
import type { CrmLead, CrmMeta } from "@/lib/services/crm";
import {
  cloneAutomationRule,
  dryRunAutomationRule,
  getAutomationMetrics,
  getAutomationRule,
  instantiateSmartScript,
  isRuleConflict,
  listAutomationRulesX,
  listSmartScripts,
  reorderAutomationRules,
  updateAutomationRuleX,
  type AutomationCatalog,
  type AutomationMetrics,
  type AutomationRule,
  type RulePreview,
  type SmartScript,
} from "@/lib/services/crmAutomation";
import { useCrmEvents } from "@/lib/crm/useCrm";
import Modal from "@/components/admin/Modal";
import CrmFrame from "../CrmFrame";
import { useCrmError } from "../bits";
import RobotBuilder from "./RobotBuilder";
import { ApprovalBadge, LeadPicker, actionLabel, actionOf, loadCatalog, statusTone, triggerLabel, useCatalog, useRuleStatus } from "./shared";

// CRM robots (ROP contract §16–§19): the rules with their four states, the
// smart scripts, robot health, and the builder (?rule=<id> or ?rule=new).

const FILTERS = ["all", "active", "draft", "paused", "archived"] as const;
type Filter = (typeof FILTERS)[number];

export default function RobotsPage(): ReactElement {
  const t = useTranslations("rop");
  return (
    <CrmFrame section="automation" title={t("nav.robots")} noTray>
      {(api) => <Robots meta={api.meta} />}
    </CrmFrame>
  );
}

function Robots({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("rop.robots");
  const locale = useLocale();
  const crmErr = useCrmError();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const editing = params.get("rule") ?? "";
  const { data: catalog, error: catErr } = useCatalog();
  const [rules, setRules] = useState<AutomationRule[] | null>(null);
  const [scripts, setScripts] = useState<SmartScript[]>([]);
  const [metrics, setMetrics] = useState<AutomationMetrics | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"rules" | "scripts">("rules");
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);
  const [dry, setDry] = useState<AutomationRule | null>(null);
  const [cloning, setCloning] = useState<AutomationRule | null>(null);
  const [making, setMaking] = useState<SmartScript | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const ctl = new AbortController();
    Promise.allSettled([listAutomationRulesX({}, ctl.signal), listSmartScripts(ctl.signal), getAutomationMetrics({}, ctl.signal)]).then(([r, s, m]) => {
      if (r.status === "fulfilled") {
        setRules(r.value.items);
        setErr("");
      } else if (!isAborted(r.reason)) {
        logApiError("crm.automation.rules", r.reason);
        setErr(crmErr(r.reason));
        setRules((cur) => cur ?? []);
      }
      if (s.status === "fulfilled") setScripts(s.value);
      if (m.status === "fulfilled") setMetrics(m.value);
    });
    return () => ctl.abort();
  }, [tick, crmErr]);
  useCrmEvents((ev) => {
    if (!ev.invalidate.some((x) => x === "all" || x === "automation")) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTick((n) => n + 1), 900);
  });

  // The builder's rule: the one in the list, or read fresh by id.
  const [fetched, setFetched] = useState<AutomationRule | null>(null);
  const known = !editing || editing === "new" ? null : (rules?.find((r) => r.id === editing) ?? null);
  const editRule = known ?? (fetched?.id === editing ? fetched : null);
  useEffect(() => {
    if (!editing || editing === "new" || known || !rules) return;
    const ctl = new AbortController();
    getAutomationRule(editing, ctl.signal).then(setFetched, (e) => {
      if (isAborted(e)) return;
      toast(crmErr(e), { tone: "err" });
      router.replace(path);
    });
    return () => ctl.abort();
  }, [editing, known, rules, crmErr, router, path]);

  const shown = useMemo(
    () => (rules ?? []).filter((r) => (filter === "all" ? r.status !== "archived" : r.status === filter) && (!q.trim() || matchesSearch(`${r.name} ${r.description}`, q))).sort((a, b) => a.priority - b.priority),
    [rules, filter, q],
  );

  const setStatus = async (r: AutomationRule, status: string) => {
    if (busy) return;
    setBusy(r.id);
    try {
      const saved = await updateAutomationRuleX(r, { status });
      setRules((cur) => (cur ?? []).map((x) => (x.id === saved.id ? saved : x)));
      notify.success(t(`statusDone.${status}`));
    } catch (e) {
      if (isRuleConflict(e)) {
        toast(t("conflict"), { tone: "info" });
        setTick((n) => n + 1);
      } else toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy("");
    }
  };
  // Up/down in the run order: the whole visible order goes to /rules/reorder.
  const shift = async (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= shown.length || busy) return;
    const order = shown.map((r) => r.id);
    [order[i], order[j]] = [order[j], order[i]];
    setBusy("order");
    try {
      await reorderAutomationRules(order);
      setTick((n) => n + 1);
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy("");
    }
  };

  if (editing && catalog) {
    if (editing !== "new" && !editRule) return <div className="rop-sk" style={{ height: 320 }} aria-busy="true" />;
    return (
      <RobotBuilder
        key={editRule?.id ?? "new"}
        catalog={catalog}
        meta={meta}
        rule={editing === "new" ? null : editRule}
        onClose={() => router.push(path)}
        onSaved={(saved) => {
          setRules((cur) => [saved, ...(cur ?? []).filter((x) => x.id !== saved.id)]);
          router.push(path);
        }}
      />
    );
  }

  return (
    <div className="rop-page" data-rop-robots="">
      {metrics ? <MetricsStrip m={metrics} /> : null}
      {catErr && !catalog ? (
        <div className="rop-card">
          <div className="rop-empty">
            <b>{crmErr(catErr)}</b>
            <button type="button" className="crm-btn" onClick={() => void loadCatalog(true)}>{t("retry")}</button>
          </div>
        </div>
      ) : null}
      <div className="rop-toolbar">
        <span className="rop-seg" role="tablist" aria-label={t("tabs")}>
          <button type="button" role="tab" aria-selected={tab === "rules"} onClick={() => setTab("rules")}>{t("tabRules")}</button>
          <button type="button" role="tab" aria-selected={tab === "scripts"} onClick={() => setTab("scripts")}>{t("tabScripts", { n: scripts.length })}</button>
        </span>
        <div className="rop-toolbar__sp">
          <Link href="/admin/crm/automation/runs" className="crm-btn"><ListChecks aria-hidden="true" />{t("runsLink")}</Link>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => router.push(`${path}?rule=new`)} disabled={!catalog} data-rop-new-robot="">
            <Plus aria-hidden="true" />
            {t("newRobot")}
          </button>
        </div>
      </div>

      {tab === "rules" ? (
        <section className="rop-card" aria-label={t("tabRules")}>
          <div className="rop-card__h">
            <span className="rop-seg" role="group" aria-label={t("filter")}>
              {FILTERS.map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {t(`filters.${f}`)}
                  <em className="rb-count">{f === "all" ? (rules ?? []).filter((r) => r.status !== "archived").length : (rules ?? []).filter((r) => r.status === f).length}</em>
                </button>
              ))}
            </span>
            <label className="lx-search" style={{ width: "min(300px, 100%)" }}>
              <Search aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchRules")} aria-label={t("searchRules")} />
            </label>
          </div>
          {err ? <p className="rop-pill rop-pill--bad">{err}</p> : null}
          {!rules ? (
            <div className="rop-list" aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <span key={i} className="rop-sk" style={{ height: 92 }} />)}</div>
          ) : !shown.length ? (
            <div className="rop-empty">
              <span className="rop-empty__ic"><Bot /></span>
              <b>{rules.length ? t("noMatch") : t("empty")}</b>
              <p>{t("emptyText")}</p>
              {scripts.length ? <button type="button" className="crm-btn" onClick={() => setTab("scripts")}><Wand2 aria-hidden="true" />{t("fromScript")}</button> : null}
            </div>
          ) : (
            <ol className="rb-rules">
              {shown.map((r, i) => (
                <RuleRow
                  key={r.id}
                  r={r}
                  i={i}
                  last={i === shown.length - 1}
                  catalog={catalog}
                  busy={busy}
                  locale={locale}
                  onEdit={() => router.push(`${path}?rule=${encodeURIComponent(r.id)}`)}
                  onStatus={(s) => void setStatus(r, s)}
                  onClone={() => setCloning(r)}
                  onDry={() => setDry(r)}
                  onShift={(d) => void shift(i, d)}
                />
              ))}
            </ol>
          )}
        </section>
      ) : (
        <section className="rop-card" aria-label={t("tabScripts", { n: scripts.length })}>
          <p className="rop-muted">{t("scriptsLead")}</p>
          {scripts.length ? (
            <ul className="rb-scripts">
              {scripts.map((s) => (
                <li key={s.key} className="rb-script">
                  <span className="rop-ic"><Sparkles /></span>
                  <div className="rop-row__b">
                    <b>{s.title || s.key}</b>
                    {s.description ? <small style={{ whiteSpace: "normal" }}>{s.description}</small> : null}
                    <span className="rb-script__meta">
                      {s.trigger ? <span className="rop-pill rop-pill--blue">{triggerLabel(catalog, s.trigger)}</span> : null}
                      {s.actions.slice(0, 4).map((a) => <span key={a} className="rop-pill">{actionLabel(catalog, a)}</span>)}
                    </span>
                  </div>
                  <button type="button" className="crm-btn crm-btn--pri" onClick={() => setMaking(s)} data-rop-script={s.key}>
                    <Wand2 aria-hidden="true" />
                    {t("useScript")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rop-empty"><span className="rop-empty__ic"><Wand2 /></span><b>{t("noScripts")}</b></div>
          )}
        </section>
      )}

      {dry ? <DryRunDialog rule={dry} onClose={() => setDry(null)} /> : null}
      {cloning ? (
        <NameDialog
          title={t("cloneTitle")}
          initial={t("copyOf", { name: cloning.name })}
          cta={t("clone")}
          onClose={() => setCloning(null)}
          run={async (name) => {
            const r = await cloneAutomationRule(cloning.id, name);
            setRules((cur) => [r, ...(cur ?? [])]);
            notify.success(t("cloned"));
          }}
        />
      ) : null}
      {making ? (
        <NameDialog
          title={t("scriptTitle", { name: making.title || making.key })}
          initial={making.title}
          cta={t("useScript")}
          withStatus
          onClose={() => setMaking(null)}
          run={async (name, status) => {
            const r = await instantiateSmartScript(making.key, { name, status });
            setRules((cur) => [r, ...(cur ?? [])]);
            setTab("rules");
            notify.success(t("scriptMade"));
            router.push(`${path}?rule=${encodeURIComponent(r.id)}`);
          }}
        />
      ) : null}
    </div>
  );
}

function RuleRow({ r, i, last, catalog, busy, locale, onEdit, onStatus, onClone, onDry, onShift }: { r: AutomationRule; i: number; last: boolean; catalog: AutomationCatalog | null; busy: string; locale: string; onEdit: () => void; onStatus: (s: string) => void; onClone: () => void; onDry: () => void; onShift: (d: -1 | 1) => void }): ReactElement {
  const t = useTranslations("rop.robots");
  const st = useRuleStatus();
  const tone = statusTone(r.status);
  const approval = r.actions.map((a) => actionOf(catalog, a.type)).find((x) => x?.approvalRequired);
  return (
    <li className="rb-rule" data-status={r.status} data-rule={r.id}>
      <div className="rb-rule__order">
        <button type="button" className="crm-btn crm-btn--icon" onClick={() => onShift(-1)} disabled={!i || !!busy} aria-label={t("moveUpRule", { name: r.name })}><ArrowUp aria-hidden="true" /></button>
        <b>{i + 1}</b>
        <button type="button" className="crm-btn crm-btn--icon" onClick={() => onShift(1)} disabled={last || !!busy} aria-label={t("moveDownRule", { name: r.name })}><ArrowDown aria-hidden="true" /></button>
      </div>
      <div className="rb-rule__b">
        <div className="rb-rule__h">
          <b>{r.name}</b>
          <span className={`rop-pill${tone ? ` rop-pill--${tone}` : ""}`}>{st(r.status)}</span>
          <ApprovalBadge action={approval} />
        </div>
        {r.description ? <p className="rop-muted">{r.description}</p> : null}
        <div className="rb-flow" aria-label={t("flow")}>
          <span className="rop-pill rop-pill--blue">{triggerLabel(catalog, r.trigger)}</span>
          {r.delaySec ? <span className="rop-pill">{t("after", { n: fmtNum(Math.round(r.delaySec / 60), locale) })}</span> : null}
          {r.actions.map((a) => <span key={a.id} className="rop-pill">{actionLabel(catalog, a.type)}</span>)}
        </div>
        {r.lastRunAt || r.runCount ? <small className="rop-muted">{t("runsInfo", { n: r.runCount, failed: r.failureCount, at: r.lastRunAt ? fmtDateTime(r.lastRunAt, locale) : "—" })}</small> : null}
      </div>
      <div className="rb-rule__act">
        <button type="button" className="crm-btn" onClick={onEdit} disabled={!catalog}><Pencil aria-hidden="true" />{t("edit")}</button>
        <button type="button" className="crm-btn" onClick={onDry}><FlaskConical aria-hidden="true" />{t("dryRun")}</button>
        <button type="button" className="crm-btn crm-btn--icon" onClick={onClone} aria-label={t("clone")} title={t("clone")}><Copy aria-hidden="true" /></button>
        {r.status === "active" ? (
          <button type="button" className="crm-btn" onClick={() => onStatus("paused")} disabled={!!busy}><Pause aria-hidden="true" />{t("pause")}</button>
        ) : r.status !== "archived" ? (
          <button type="button" className="crm-btn" onClick={() => onStatus("active")} disabled={!!busy}><Play aria-hidden="true" />{t("activate")}</button>
        ) : (
          <button type="button" className="crm-btn" onClick={() => onStatus("draft")} disabled={!!busy}><Pencil aria-hidden="true" />{t("restore")}</button>
        )}
        {r.status !== "archived" ? <button type="button" className="crm-btn crm-btn--icon" onClick={() => onStatus("archived")} disabled={!!busy} aria-label={t("archive")} title={t("archive")}><Archive aria-hidden="true" /></button> : null}
      </div>
    </li>
  );
}

function MetricsStrip({ m }: { m: AutomationMetrics }): ReactElement {
  const t = useTranslations("rop.ov");
  const locale = useLocale();
  const failed = (m.byStatus.failed ?? 0) + (m.byStatus.partially_failed ?? 0);
  return (
    <div className="rb-metrics" data-rb-metrics="">
      <div><i aria-hidden="true"><Activity /></i><small>{t("runsTotal")}</small><b>{fmtNum(m.total, locale)}</b></div>
      <div data-ok=""><i aria-hidden="true"><CircleCheckBig /></i><small>{t("successRate")}</small><b>{m.successRate === null ? "—" : `${fmtNum(m.successRate, locale, 1)}%`}</b></div>
      <div data-bad={failed > 0 || undefined}><i aria-hidden="true"><TriangleAlert /></i><small>{t("failures")}</small><b>{fmtNum(failed, locale)}</b></div>
      <div><i aria-hidden="true"><Layers /></i><small>{t("queueSize")}</small><b>{fmtNum(m.queueSize, locale)}</b></div>
      <div><i aria-hidden="true"><Hourglass /></i><small>{t("queueLag")}</small><b>{m.queueLagSec === null ? "—" : t("min", { n: Math.round(m.queueLagSec / 60) })}</b></div>
      <div><i aria-hidden="true"><CalendarClock /></i><small>{t("oldest")}</small><b title={m.oldestScheduledAt ? fmtDateTime(m.oldestScheduledAt, locale) : undefined}>{m.oldestScheduledAt ? fmtDateTime(m.oldestScheduledAt, locale) : "—"}</b></div>
    </div>
  );
}

// A dry run against a lead chosen from a searchable list (§16): never writes.
function DryRunDialog({ rule, onClose }: { rule: AutomationRule; onClose: () => void }): ReactElement {
  const t = useTranslations("rop.robots");
  const crmErr = useCrmError();
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [res, setRes] = useState<RulePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    if (!lead || busy) return;
    setBusy(true);
    try {
      setRes(await dryRunAutomationRule(rule.id, lead.id));
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  }, [lead, busy, rule.id, crmErr]);
  return (
    <Modal open onClose={onClose} title={t("dryTitle", { name: rule.name })}>
      <div className="rop-form" data-rb-dry="">
        <p className="rop-muted">{t("dryLead")}</p>
        <div className="rop-label">{t("previewLead")}<LeadPicker value={lead} onChange={(l) => { setLead(l); setRes(null); }} /></div>
        <button type="button" className="crm-btn crm-btn--pri" onClick={() => void run()} disabled={!lead || busy} aria-busy={busy || undefined}>
          <FlaskConical aria-hidden="true" />
          {busy ? t("previewing") : t("runDry")}
        </button>
        {res ? (
          <div className="rb-pv" data-rb-dryres="">
            {res.summary ? <p className="rb-pv__sum">{res.summary}</p> : null}
            {res.matched !== null ? <span className={`rop-pill ${res.matched ? "rop-pill--ok" : "rop-pill--warn"}`}>{res.matched ? t("wouldMatch") : t("wouldNotMatch")}</span> : null}
            {res.steps.length ? <ol className="rb-pv__steps">{res.steps.map((s, i) => <li key={`${i}${s}`}>{s}</li>)}</ol> : null}
            {res.trace.length ? (
              <ul className="rb-pv__trace">
                {res.trace.map((r, i) => (
                  <li key={`${i}${r.label}`} data-ok={r.matched || undefined}><b>{r.matched ? "✓" : "✕"}</b><span>{r.label}</span>{r.detail ? <small>{r.detail}</small> : null}</li>
                ))}
              </ul>
            ) : null}
            {res.warnings.length ? <ul className="rb-pv__warn">{res.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
            <small className="rop-muted">{res.writesPerformed ? t("writesYes") : t("writesNo")}</small>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function NameDialog({ title, initial, cta, withStatus, onClose, run }: { title: string; initial: string; cta: string; withStatus?: boolean; onClose: () => void; run: (name: string, status: "draft" | "active") => Promise<void> }): ReactElement {
  const t = useTranslations("rop.robots");
  const crmErr = useCrmError();
  const [name, setName] = useState(initial);
  const [status, setStatus] = useState<"draft" | "active">("draft");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={title}>
      <form
        className="rop-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            await run(name.trim(), status);
            onClose();
          } catch (e2) {
            toast(crmErr(e2), { tone: "err" });
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="rop-label">
          {t("name")}
          <input className="rop-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        {withStatus ? (
          <div className="rop-label">
            {t("startAs")}
            <span className="rop-seg" role="group" aria-label={t("startAs")}>
              <button type="button" aria-pressed={status === "draft"} onClick={() => setStatus("draft")}>{t("status.draft")}</button>
              <button type="button" aria-pressed={status === "active"} onClick={() => setStatus("active")}>{t("status.active")}</button>
            </span>
            {status === "active" ? <small>{t("scriptActiveHint")}</small> : null}
          </div>
        ) : null}
        <button type="submit" className="crm-btn crm-btn--pri" disabled={busy} aria-busy={busy || undefined}>{cta}</button>
      </form>
    </Modal>
  );
}
