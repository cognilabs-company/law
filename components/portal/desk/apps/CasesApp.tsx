"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getLawyerClients, getMyCases, getOrderStatusHistory, runCaseAiTool, updateCase, updateOrderStatus, type BackendCase, type CaseAiTool, type OrderStatusEntry } from "@/lib/services/backend";
import { nextStatusesFor, useOrderStatusLabel } from "@/lib/orderStatus";
import { dateOnly, dateTimeFull } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import { IconAlert, IconBriefcase, IconCheck, IconClock, IconFileText, IconGavel, IconRefresh, IconScale, IconSparkle, IconUser } from "@/components/icons";
import { App, Btn, Empty, Field, Input, Loading, Search, Seg, Select, Sidebar, Tag, TextArea, Tool, Toolbar, useHost, useOs, useToast, type NavSection, type Tone } from "../kit/kit";
import type { NativeProps } from "../native";
import "./cases.css";

// Cases as a desktop program, a case manager: the statuses on the side,
// the cases in a list, the chosen one's sheet on the right — its status,
// stage and next step saved in place, the linked order's history with the
// steps it can take next, and the AI tools over the case's own materials.

const STATUSES = ["new", "active", "investigation", "court", "appeal", "completed", "archived"] as const;
const TOOLS: CaseAiTool[] = ["summary", "chronology", "missing_docs", "questions", "compare_versions"];
const TONE: Record<string, Tone> = { new: "info", active: "accent", investigation: "warn", court: "err", appeal: "warn", completed: "ok", archived: "neutral" };

export default function CasesApp({ openApp }: NativeProps) {
  const t = useTranslations("portal.advocate.cases");
  const tc = useTranslations("portal.common");
  const d = useTranslations("portal.desk.cases");
  const locale = useLocale();
  const os = useOs();
  const { menu } = useHost();
  const [cases, setCases] = useState<BackendCase[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [group, setGroup] = useState("open");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [tick, setTick] = useState(0);
  const [today, setToday] = useState(0);
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => setToday(Date.parse(new Date().toDateString())), 0);
    getMyCases()
      .then((l) => alive && setCases(l))
      .catch(() => alive && setFailed(true));
    getLawyerClients()
      .then((l) => alive && setNames(new Map(l.map((c) => [c.id, c.name]))))
      .catch(() => undefined);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [tick]);

  const all = useMemo(() => cases ?? [], [cases]);
  const client = (c: BackendCase) => (c.clientUserId ? names.get(c.clientUserId) ?? "" : "");
  const open = (c: BackendCase) => !/^(completed|archived|closed)$/.test(c.status);
  const inGroup = (c: BackendCase, g: string) => (g === "all" ? true : g === "open" ? open(c) : c.status === g);
  const needle = q.trim().toLowerCase();
  const shown = all.filter((c) => inGroup(c, group) && (!needle || `${c.caseType} ${c.title} ${c.caseNumber} ${client(c)} ${c.nextAction}`.toLowerCase().includes(needle))).sort((a, b) => (a.deadlineAt ?? "9").localeCompare(b.deadlineAt ?? "9"));
  const current = all.find((c) => c.id === sel) ?? null;
  const label = (s: string) => (tc.has(`status.${s}`) ? tc(`status.${s}`) : statusLabel(tc, s));

  const sections: NavSection[] = [
    {
      id: "views",
      title: os === "mac" ? d("views") : undefined,
      items: [
        { id: "open", label: d("open"), icon: <IconBriefcase />, count: all.filter(open).length },
        { id: "all", label: d("all"), icon: <IconFileText />, count: all.length },
      ],
    },
    { id: "st", title: d("byStatus"), items: STATUSES.map((s) => ({ id: s, label: label(s), icon: <IconScale />, count: all.filter((c) => c.status === s).length || undefined })) },
  ];
  const rowMenu = (e: MouseEvent, c: BackendCase) =>
    menu?.(e, c.caseType || c.title, [
      { heading: d("setStatus"), id: "h" },
      ...STATUSES.map((s) => ({ id: s, label: label(s), checked: c.status === s, onSelect: () => void save(c, { status: s }) })),
      ...(c.orderId ? [{ sep: true as const, id: "s" }, { id: "ord", label: d("openOrder"), icon: <IconFileText />, onSelect: () => openApp("marketplaceOrders") }] : []),
    ]);
  async function save(c: BackendCase, p: { status?: string; stage?: string; next_action?: string }) {
    const before = c;
    setCases((l) => (l ?? []).map((x) => (x.id === c.id ? { ...x, ...(p.status ? { status: p.status } : {}), ...(p.stage !== undefined ? { stage: p.stage } : {}), ...(p.next_action !== undefined ? { nextAction: p.next_action } : {}) } : x)));
    try {
      await updateCase(c.id, p);
      say(d("saved"));
    } catch {
      setCases((l) => (l ?? []).map((x) => (x.id === c.id ? before : x)));
      say(d("saveFailed"), "err");
    }
  }

  return (
    <App name="cases" sidebar={<Sidebar label={t("title")} sections={sections} value={group} onChange={setGroup} header={os === "win" ? <Search value={q} onChange={setQ} placeholder={d("search")} wide /> : undefined} />}>
      <Toolbar title={group === "open" ? d("open") : group === "all" ? d("all") : label(group)} subtitle={cases ? t("count", { n: shown.length }) : undefined} end={os === "mac" ? <Search value={q} onChange={setQ} placeholder={d("search")} /> : undefined}>
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      <div className="dxs-body">
        <section className="dxs-list" aria-label={t("title")}>
          {cases === null ? (
            failed ? (
              <Empty icon={<IconAlert />} title={d("loadError")} />
            ) : (
              <Loading label={d("loading")} />
            )
          ) : !shown.length ? (
            <Empty icon={<IconBriefcase />} title={needle ? d("noResults") : t("emptyTitle")} text={needle ? undefined : t("emptyText")} />
          ) : (
            <div className="dxs-scroll" role="listbox" aria-label={t("title")}>
              {shown.map((c) => {
                const late = !!c.deadlineAt && open(c) && !!today && new Date(c.deadlineAt).getTime() < today;
                return (
                  <div key={c.id} role="option" tabIndex={sel === c.id ? 0 : -1} aria-selected={sel === c.id} className={`dxs-row${sel === c.id ? " is-on" : ""}`} onClick={() => setSel(c.id)} onContextMenu={(e) => (e.preventDefault(), setSel(c.id), rowMenu(e, c))}>
                    <span className="dxs-row__top">
                      <b>{client(c) || c.caseType || c.title || "—"}</b>
                      <Tag tone={TONE[c.status] ?? "neutral"}>{label(c.status)}</Tag>
                    </span>
                    <small>{[client(c) ? c.caseType || c.title : "", c.caseNumber].filter(Boolean).join(" · ")}</small>
                    {c.nextAction || c.deadlineAt ? (
                      <span className="dxs-row__next">
                        {c.nextAction ? <span>{c.nextAction}</span> : null}
                        {c.deadlineAt ? (
                          <span className={late ? "is-late" : ""}>
                            <IconClock aria-hidden />
                            {dateOnly(c.deadlineAt, locale)}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        {current ? <Sheet key={current.id} c={current} client={client(current)} label={label} onSave={(p) => void save(current, p)} onChanged={() => setTick((n) => n + 1)} /> : <div className="dxs-none"><Empty icon={<IconGavel />} title={d("pick")} /></div>}
      </div>
      {toast}
    </App>
  );
}

function Sheet({ c, client, label, onSave, onChanged }: { c: BackendCase; client: string; label: (s: string) => string; onSave: (p: { status?: string; stage?: string; next_action?: string }) => void; onChanged: () => void }) {
  const tm = useTranslations("portal.caseManage");
  const d = useTranslations("portal.desk.cases");
  const locale = useLocale();
  const [stage, setStage] = useState(c.stage);
  const [next, setNext] = useState(c.nextAction);
  const dirty = stage !== c.stage || next !== c.nextAction;
  return (
    <article className="dxs-sheet" aria-label={c.caseType || c.title}>
      <header>
        <span className="dxs-sheet__ic" aria-hidden>
          <IconScale />
        </span>
        <div>
          <h2>{c.caseType || c.title || "—"}</h2>
          <p>
            {client ? (
              <span>
                <IconUser aria-hidden />
                {client}
              </span>
            ) : null}
            {c.caseNumber ? <span>{c.caseNumber}</span> : null}
            {c.deadlineAt ? (
              <span>
                <IconClock aria-hidden />
                {dateOnly(c.deadlineAt, locale)}
              </span>
            ) : null}
          </p>
        </div>
      </header>
      {c.description ? <p className="dxs-desc">{c.description}</p> : null}
      <section className="dxs-box">
        <h3>{tm("title")}</h3>
        <div className="dxs-form">
          <Field label={tm("status")}>
            <Select ariaLabel={tm("status")} value={c.status} onChange={(s) => onSave({ status: s })} options={STATUSES.map((s) => ({ value: s, label: label(s) }))} />
          </Field>
          <Field label={tm("stage")}>
            <Input value={stage} onChange={setStage} placeholder={tm("stagePh")} maxLength={120} />
          </Field>
          <Field label={tm("nextAction")}>
            <Input value={next} onChange={setNext} placeholder={tm("nextActionPh")} maxLength={300} />
          </Field>
        </div>
        {dirty ? (
          <div className="dxs-save">
            <Btn kind="primary" small onClick={() => onSave({ stage: stage.trim(), next_action: next.trim() })}>
              {tm("save")}
            </Btn>
            <Btn small onClick={() => (setStage(c.stage), setNext(c.nextAction))}>
              {d("revert")}
            </Btn>
          </div>
        ) : null}
      </section>
      {c.orderId ? <OrderFlow orderId={c.orderId} onChanged={onChanged} /> : null}
      <AiTools caseId={c.id} />
    </article>
  );
}

function OrderFlow({ orderId, onChanged }: { orderId: string; onChanged: () => void }) {
  const t = useTranslations("portal.orderFlow");
  const locale = useLocale();
  const label = useOrderStatusLabel();
  const [rows, setRows] = useState<OrderStatusEntry[] | null>(null);
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    getOrderStatusHistory(orderId)
      .then((l) => alive && setRows([...l].sort((a, b) => (a.at < b.at ? 1 : -1))))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [orderId, tick]);
  const current = (rows?.[0]?.status ?? "").toLowerCase();
  const next = nextStatusesFor("seller", current);
  async function move(to: string) {
    if (busy) return;
    setBusy(to);
    setErr("");
    try {
      await updateOrderStatus(orderId, to, note.trim() || undefined);
      setNote("");
      setTick((n) => n + 1);
      onChanged();
    } catch {
      setErr(t("error"));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="dxs-box">
      <h3>
        {t("title")}
        {current ? <Tag tone="accent">{label(current)}</Tag> : null}
      </h3>
      {rows === null ? (
        <Loading label={t("title")} />
      ) : !rows.length ? (
        <p className="dxs-muted">{t("empty")}</p>
      ) : (
        <ol className="dxs-tl">
          {rows.map((r, i) => (
            <li key={`${r.at}-${i}`} className={i === 0 ? "is-now" : ""}>
              <i>{i === 0 ? <IconClock /> : <IconCheck />}</i>
              <span>
                <b>{label(r.status)}</b>
                <small>
                  {dateTimeFull(r.at, locale)}
                  {r.note ? ` · ${r.note}` : ""}
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}
      {next.length ? (
        <div className="dxs-next">
          <Input value={note} onChange={setNote} placeholder={t("notePh")} maxLength={300} ariaLabel={t("notePh")} />
          <div>
            {next.map((s) => (
              <Btn key={s} small kind={s === "cancelled" || s === "declined" ? "default" : "primary"} busy={busy === s} disabled={!!busy && busy !== s} onClick={() => void move(s)}>
                {t.has(`actions.${s}`) ? t(`actions.${s}`) : label(s)}
              </Btn>
            ))}
          </div>
          {err ? <p className="dxs-err">{err}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

const DRAFT = (caseId: string, tool: string) => `lexgo_case_ai_${caseId}_${tool}`;
function AiTools({ caseId }: { caseId: string }) {
  const t = useTranslations("portal.caseAi");
  const d = useTranslations("portal.desk.cases");
  const [tool, setTool] = useState<CaseAiTool>("summary");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      setText((await runCaseAiTool(caseId, tool)).result);
    } catch {
      setMsg(t("error"));
    } finally {
      setBusy(false);
    }
  }
  const approve = () => {
    try {
      localStorage.setItem(DRAFT(caseId, tool), text);
      setMsg(t("saved"));
    } catch {
      /* storage blocked */
    }
  };
  return (
    <section className="dxs-box dxs-ai">
      <h3>
        <IconSparkle aria-hidden />
        {t("title")}
      </h3>
      <p className="dxs-muted">{t("lead")}</p>
      <Seg label={t("title")} small value={tool} onChange={(v) => (setTool(v), setText(""), setMsg(""))} items={TOOLS.map((k) => ({ id: k, label: t(`tools.${k}`) }))} />
      <div className="dxs-ai__run">
        <Btn kind="primary" icon={<IconSparkle />} busy={busy} onClick={() => void run()}>
          {busy ? t("running") : d("run", { tool: t(`tools.${tool}`) })}
        </Btn>
      </div>
      {text ? (
        <>
          <TextArea value={text} onChange={setText} rows={8} ariaLabel={t(`tools.${tool}`)} />
          <p className="dxs-muted">{t("editHint")}</p>
          <div>
            <Btn icon={<IconCheck />} onClick={approve}>
              {t("approve")}
            </Btn>
          </div>
        </>
      ) : null}
      {msg ? <p className="dxs-muted">{msg}</p> : null}
    </section>
  );
}
