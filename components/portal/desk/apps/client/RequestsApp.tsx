"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createCaseDocument,
  createRefundRequest,
  createReplacementRequest,
  demoConfirmPayment,
  getBusinessHours,
  getOrderStatusHistory,
  getReplacementHistory,
  listCaseDocuments,
  listCases,
  listMyReplacementRequests,
  listOrderMilestones,
  listOrders,
  payOrderMilestone,
  releaseOrderMilestone,
  updateOrderStatus,
  DEFAULT_BUSINESS_HOURS,
  type BackendCase,
  type BackendOrder,
  type ModuleRecord,
  type OrderMilestone,
  type OrderStatusEntry,
} from "@/lib/services/backend";
import { isDemoCheckout } from "@/lib/services/checkout";
import { isConflict, isForbidden } from "@/lib/http";
import { CLIENT_STAGES, clientStageOf, nextStatusesFor, useOrderStatusLabel } from "@/lib/orderStatus";
import { deadlineLabel, responseDeadline } from "@/lib/businessHours";
import { statusLabel } from "@/lib/labels";
import { humanizeSlug } from "@/lib/lawyers";
import { fmtUzs } from "@/lib/money";
import { dateTimeFull } from "@/lib/date";
import { IconArrowRight, IconCard, IconCheck, IconClock, IconDocLines, IconFileText, IconRefresh, IconSend } from "@/components/icons";
import { App, Btn, Dialog, Empty, Field, Input, Loading, Select, Spinner, Tag, TextArea, Tool, Toolbar, Table, useToast, type Col } from "../../kit/kit";
import { toneOf } from "./bits";
import "./client.css";

// The client's requests as a desktop program — legal cases and the orders
// behind them in one table (Finder's list / File Explorer's details), the
// chosen one on the right: its five steps, the seller's answer window,
// what to do next, the payment stages to pay or release, the status
// history and the next step the client may take, the case's documents,
// and a refund or replacement request.

const WAITING = new Set(["new", "seller_selection", "sent_to_seller", "waiting_info"]);
const REPLACEMENT_KEY = (caseId: string) => `lexgo_replacement_${caseId}`;
function storedReplacement(caseId: string): string {
  try {
    return localStorage.getItem(REPLACEMENT_KEY(caseId)) || "";
  } catch {
    return "";
  }
}

type Item = { key: string; case?: BackendCase; order?: BackendOrder };

export default function RequestsApp() {
  const t = useTranslations("portal.client.cases");
  const tc = useTranslations("portal.common");
  const d = useTranslations("portal.desk.client");
  const tw = useTranslations("portal.client.works");
  const orderLabel = useOrderStatusLabel();
  const [cases, setCases] = useState<BackendCase[] | null>(null);
  const [orders, setOrders] = useState<BackendOrder[]>([]);
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState("");
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    Promise.allSettled([listCases(), listOrders()]).then(([c, o]) => {
      if (!alive) return;
      setCases(c.status === "fulfilled" ? c.value : []);
      setOrders(o.status === "fulfilled" ? o.value : []);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  const items = useMemo<Item[]>(() => {
    const byId = new Map(orders.map((o) => [o.id, o]));
    const linked = new Set<string>();
    const rows: Item[] = (cases ?? []).map((c) => {
      if (c.orderId) linked.add(c.orderId);
      return { key: `c:${c.id}`, case: c, order: c.orderId ? byId.get(c.orderId) : undefined };
    });
    for (const o of orders) if (!linked.has(o.id)) rows.push({ key: `o:${o.id}`, order: o });
    return rows;
  }, [cases, orders]);
  const cur = items.find((i) => i.key === sel) ?? null;

  const nameOf = (it: Item) => (it.case ? it.case.caseType || it.case.title || t("title") : it.order?.serviceName || it.order?.title || t("orderItem"));
  const statusOf = (it: Item) => it.order?.status || it.case?.status || "";
  const cols: Col<Item>[] = [
    {
      id: "name",
      label: t("title"),
      sort: (a, b) => nameOf(a).localeCompare(nameOf(b)),
      cell: (it) => (
        <span className="dxcw-name">
          <span className={`dxcw-ic is-${toneOf(statusOf(it))}`} aria-hidden>
            {it.case ? <IconFileText /> : <IconCard />}
          </span>
          <span>
            <b>{nameOf(it)}</b>
            <small>
              <code>{it.case?.caseNumber || it.order?.workId || it.case?.workId || "—"}</code>
              {it.case?.nextAction ? <span>{it.case.nextAction}</span> : null}
            </small>
          </span>
        </span>
      ),
    },
    {
      id: "stage",
      label: t("orderStatus"),
      width: "220px",
      cell: (it) => {
        const st = it.order?.status ? clientStageOf(it.order.status) : null;
        return st ? <Stage stage={st} small /> : <span className="dxcs-lead">{it.case?.stage ? statusLabel(tc, it.case.stage) : "—"}</span>;
      },
    },
    {
      id: "status",
      label: tw("fStatus"),
      width: "160px",
      cell: (it) => {
        const s = statusOf(it);
        return s ? <Tag tone={toneOf(s)}>{it.order?.status ? orderLabel(it.order.status) : statusLabel(tc, s)}</Tag> : null;
      },
    },
  ];

  return (
    <App name="creqs" inspector={cur ? <Info key={cur.key} it={cur} name={nameOf(cur)} onChanged={(m) => (setTick((n) => n + 1), m && say(m))} onError={(m) => say(m, "err")} /> : undefined}>
      <Toolbar title={t("title")} subtitle={cases ? t("count", { n: items.length }) : undefined}>
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      <div className="dxcw-body">
        {cases === null ? (
          <Loading label={t("title")} />
        ) : !items.length ? (
          <Empty icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <Table label={t("title")} cols={cols} rows={items} rowKey={(r) => r.key} selected={sel} onSelect={(r) => setSel(r.key)} />
        )}
      </div>
      {toast}
    </App>
  );
}

function Stage({ stage, small }: { stage: string; small?: boolean }) {
  const t = useTranslations("portal.common.orderStage");
  const tc = useTranslations("portal.client.cases");
  if (stage === "closed") return <span className="dxcs-lead">{t("closed")}</span>;
  const idx = CLIENT_STAGES.indexOf(stage as (typeof CLIENT_STAGES)[number]);
  if (small)
    return (
      <span className="dxco-stage">
        <span className="dxco-dots" aria-hidden>
          {CLIENT_STAGES.map((s, i) => (
            <i key={s} className={i < idx ? "is-done" : i === idx ? "is-now" : ""} />
          ))}
        </span>
        <span>{t(stage)}</span>
      </span>
    );
  return (
    <ol className="dxco-steps" aria-label={tc("stageOf", { n: idx + 1, total: CLIENT_STAGES.length })}>
      {CLIENT_STAGES.map((s, i) => (
        <li key={s} className={i < idx ? "is-done" : i === idx ? "is-now" : ""}>
          <i>{i < idx ? <IconCheck /> : i + 1}</i>
          <span>{t(s)}</span>
        </li>
      ))}
    </ol>
  );
}

// The chosen request.
function Info({ it, name, onChanged, onError }: { it: Item; name: string; onChanged: (msg: string) => void; onError: (msg: string) => void }) {
  const t = useTranslations("portal.client.cases");
  const tc = useTranslations("portal.common");
  const d = useTranslations("portal.desk.client");
  const orderLabel = useOrderStatusLabel();
  const c = it.case;
  const o = it.order;
  const orderId = c?.orderId || o?.id || "";
  const status = o?.status || "";
  const stage = status ? clientStageOf(status) : null;
  const [ask, setAsk] = useState(false);
  const [docs, setDocs] = useState(false);
  // The seller's answer window counts working time only (a night order
  // reads "tomorrow 09:30"); "now" is read after the first paint.
  const [deadline, setDeadline] = useState<{ overdue: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!o || !WAITING.has(o.status) || !o.createdAt) return;
    const from = new Date(o.createdAt).getTime();
    if (Number.isNaN(from)) return;
    let alive = true;
    const run = (hours: typeof DEFAULT_BUSINESS_HOURS) => {
      const now = Date.now();
      const at = responseDeadline(hours, from, 30);
      if (alive) setDeadline({ overdue: at < now, text: deadlineLabel(at, now, { today: t("deadlineToday"), tomorrow: t("deadlineTomorrow") }) });
    };
    getBusinessHours()
      .then(run)
      .catch(() => run(DEFAULT_BUSINESS_HOURS));
    return () => {
      alive = false;
    };
  }, [o, t]);

  return (
    <aside className="dxcw-insp" aria-label={name}>
      <header>
        <span className={`dxcw-ic is-big is-${toneOf(status || c?.status || "")}`} aria-hidden>
          {c ? <IconFileText /> : <IconCard />}
        </span>
        <h2>{name}</h2>
        <span className="dxcw-tags">
          {c?.caseNumber || o?.workId ? <code className="dxcw-code">{c?.caseNumber || o?.workId}</code> : null}
          {status ? <Tag tone={toneOf(status)}>{orderLabel(status)}</Tag> : c?.status ? <Tag tone={toneOf(c.status)}>{statusLabel(tc, c.status)}</Tag> : null}
        </span>
      </header>
      {stage ? <Stage stage={stage} /> : null}
      {deadline ? (
        <p className={`dxcw-next${deadline.overdue ? " dxcr-late" : ""}`}>
          <IconClock aria-hidden /> {deadline.overdue ? t("deadlineOverdue") : t("deadlineText", { when: deadline.text })}
        </p>
      ) : null}
      {c?.nextAction ? (
        <p className="dxcw-next">
          <IconArrowRight aria-hidden /> {c.nextAction}
        </p>
      ) : null}
      <dl>
        {c?.stage ? (
          <div>
            <dt>{t("orderStatus")}</dt>
            <dd>{statusLabel(tc, c.stage)}</dd>
          </div>
        ) : null}
        {o?.lawyerName ? (
          <div>
            <dt>{tc("lawyer")}</dt>
            <dd>{o.lawyerName}</dd>
          </div>
        ) : null}
        {c?.description ? (
          <div>
            <dt>{d("description")}</dt>
            <dd>{c.description}</dd>
          </div>
        ) : null}
      </dl>
      {c ? <Replacement caseId={c.id} /> : null}
      {c ? (
        <div className="dxcw-acts">
          <Btn icon={<IconDocLines />} onClick={() => setDocs(true)}>
            {t("docsCta")}
          </Btn>
          <Btn onClick={() => setAsk(true)}>{t("requestCta")}</Btn>
        </div>
      ) : null}
      {orderId ? <Milestones orderId={orderId} onError={onError} onDone={onChanged} /> : null}
      {orderId ? <History orderId={orderId} status={status} onChanged={onChanged} onError={onError} /> : null}
      {c && ask ? <AskDialog c={c} onClose={() => setAsk(false)} onSent={(m) => (setAsk(false), onChanged(m))} onError={onError} /> : null}
      {c && docs ? <DocsDialog c={c} onClose={() => setDocs(false)} onError={onError} /> : null}
    </aside>
  );
}

// The latest step of this case's replacement request.
function Replacement({ caseId }: { caseId: string }) {
  const t = useTranslations("portal.client.cases");
  const [line, setLine] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      let rid = storedReplacement(caseId);
      try {
        const hit = (await listMyReplacementRequests()).find((r) => String(r.payload.case_id ?? "") === caseId);
        if (hit) rid = hit.id;
      } catch {
        /* the stored id */
      }
      const events = rid ? await getReplacementHistory(rid).catch(() => []) : [];
      const last = events[events.length - 1];
      if (!alive || !last) return;
      const st = (last.status || "").toLowerCase();
      const label = t.has(`replacementStates.${st}`) ? t(`replacementStates.${st}`) : humanizeSlug(st);
      const at = new Date(last.createdAt);
      setLine(t("replacementStatus", { status: label }) + (Number.isNaN(at.getTime()) ? "" : ` · ${at.toLocaleDateString()}`));
    })();
    return () => {
      alive = false;
    };
  }, [caseId, t]);
  return line ? <Tag tone="info">{line}</Tag> : null;
}

// The payment stages (30/40/30): pay the next, release a paid one when the
// work is done.
function Milestones({ orderId, onError, onDone }: { orderId: string; onError: (m: string) => void; onDone: (m: string) => void }) {
  const t = useTranslations("portal.payment.milestones");
  const tp = useTranslations("portal.payment");
  const [rows, setRows] = useState<OrderMilestone[]>([]);
  const [key, setKey] = useState(0);
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState("");
  const [payUrl, setPayUrl] = useState("");
  useEffect(() => {
    let alive = true;
    listOrderMilestones(orderId)
      .then((r) => alive && setRows(r))
      .catch((e) => {
        if (!alive) return;
        setRows([]);
        if (isForbidden(e)) setReadOnly(true);
      });
    return () => {
      alive = false;
    };
  }, [orderId, key]);
  const fail = (e: unknown) => {
    if (isForbidden(e)) setReadOnly(true);
    if (isConflict(e)) setKey((k) => k + 1);
    onError(t(isForbidden(e) ? "forbidden" : isConflict(e) ? "conflict" : "error"));
  };
  async function pay(m: OrderMilestone) {
    setBusy(m.id);
    setPayUrl("");
    try {
      const r = await payOrderMilestone(orderId, m.id);
      if (isDemoCheckout() && r.paymentId) {
        await demoConfirmPayment(r.paymentId).catch(() => null);
        setKey((k) => k + 1);
        onDone(t("paidDemo"));
      } else if (!r.paymentId) setKey((k) => k + 1);
      else setPayUrl(r.paymentUrl || "");
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }
  async function release(m: OrderMilestone) {
    setBusy(m.id);
    try {
      const next = await releaseOrderMilestone(orderId, m.id);
      setRows((list) => list.map((x) => (x.id === m.id ? { ...x, ...next, id: x.id } : x)));
      setConfirm("");
      onDone(t("releasedMsg"));
    } catch (e) {
      setConfirm("");
      fail(e);
    } finally {
      setBusy("");
    }
  }
  if (!rows.length) return null;
  const firstUnpaid = rows.findIndex((m) => m.status === "waiting_payment" || m.status === "payment_pending" || m.status === "pending");
  const label = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : humanizeSlug(s));
  return (
    <section>
      <h3>{t("title")}</h3>
      <ol className="dxcr-miles">
        {rows.map((m, i) => {
          const done = m.status === "released";
          const payable = !readOnly && i === firstUnpaid;
          const releasable = !readOnly && (m.status === "paid" || m.status === "held");
          return (
            <li key={m.id} className={done ? "is-done" : payable ? "is-now" : ""}>
              <i>{done ? <IconCheck /> : m.index || i + 1}</i>
              <span>
                <b>{m.title || t("stage", { n: m.index || i + 1 })}</b>
                <small>{[m.percent ? `${m.percent}%` : "", `${fmtUzs(m.amount)} ${tp("som")}`, label(m.status)].filter(Boolean).join(" · ")}</small>
              </span>
              {payable ? (
                <Btn small kind="primary" busy={busy === m.id} disabled={!!busy} onClick={() => void pay(m)}>
                  {t("pay")}
                </Btn>
              ) : releasable ? (
                confirm === m.id ? (
                  <Btn small kind="primary" busy={busy === m.id} onClick={() => void release(m)}>
                    {t("releaseYes")}
                  </Btn>
                ) : (
                  <Btn small disabled={!!busy} onClick={() => setConfirm(m.id)}>
                    {t("release")}
                  </Btn>
                )
              ) : null}
            </li>
          );
        })}
      </ol>
      {confirm ? <small className="dx-field__h">{t("releaseConfirm")}</small> : null}
      {payUrl ? (
        <Btn kind="primary" icon={<IconCard />} onClick={() => (window.open(payUrl, "_blank", "noopener"), setPayUrl(""), setKey((k) => k + 1))}>
          {tp("proceed")}
        </Btn>
      ) : null}
    </section>
  );
}

// The status history, newest first, and the next step the client may take.
function History({ orderId, status, onChanged, onError }: { orderId: string; status: string; onChanged: (m: string) => void; onError: (m: string) => void }) {
  const t = useTranslations("portal.orderFlow");
  const locale = useLocale();
  const label = useOrderStatusLabel();
  const [rows, setRows] = useState<OrderStatusEntry[] | null>(null);
  const [key, setKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(() => getOrderStatusHistory(orderId), [orderId]);
  useEffect(() => {
    let alive = true;
    load()
      .then((r) => alive && setRows([...r].sort((a, b) => (a.at < b.at ? 1 : -1))))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [load, key]);
  const current = (status || rows?.[0]?.status || "").toLowerCase();
  const next = nextStatusesFor("client", current);
  async function move(to: string) {
    setBusy(to);
    try {
      await updateOrderStatus(orderId, to, note.trim() || undefined);
      setNote("");
      setKey((k) => k + 1);
      onChanged(t("moved", { status: label(to) }));
    } catch (e) {
      onError(isConflict(e) ? t("conflict") : isForbidden(e) ? t("forbidden") : t("error"));
    } finally {
      setBusy("");
    }
  }
  return (
    <section>
      <h3>{t("title")}</h3>
      {rows === null ? (
        <Spinner small />
      ) : !rows.length ? (
        <p className="dxcs-lead">{t("empty")}</p>
      ) : (
        <ol className="dxcr-hist">
          {rows.map((r, i) => (
            <li key={`${r.at}-${i}`} className={i === 0 ? "is-now" : ""}>
              <b>{label(r.status)}</b>
              <small>
                {Number.isNaN(new Date(r.at).getTime()) ? r.at : dateTimeFull(r.at, locale)}
                {r.note ? ` · ${r.note}` : ""}
              </small>
            </li>
          ))}
        </ol>
      )}
      {next.length ? (
        <>
          <Field label={t("nextStep")}>
            <Input value={note} onChange={setNote} placeholder={t("notePh")} maxLength={300} />
          </Field>
          <span className="dxcw-tags">
            {next.map((s) => (
              <Btn key={s} small kind={s === "cancelled" || s === "declined" ? "default" : "primary"} busy={busy === s} disabled={!!busy} onClick={() => void move(s)}>
                {t.has(`actions.${s}`) ? t(`actions.${s}`) : label(s)}
              </Btn>
            ))}
          </span>
        </>
      ) : null}
    </section>
  );
}

function AskDialog({ c, onClose, onSent, onError }: { c: BackendCase; onClose: () => void; onSent: (m: string) => void; onError: (m: string) => void }) {
  const t = useTranslations("portal.client.cases");
  const d = useTranslations("portal.desk.client");
  const [kind, setKind] = useState<"refund" | "replacement">("refund");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      const payload = { case_id: c.id, order_id: c.orderId, reason: reason.trim() };
      const title = `${c.caseType || c.caseNumber} — ${kind}`;
      if (kind === "refund") await createRefundRequest({ title, payload });
      else {
        const rec = await createReplacementRequest({ title, record_type: "replacement", status: "pending", payload });
        try {
          if (rec.id) localStorage.setItem(REPLACEMENT_KEY(c.id), rec.id);
        } catch {
          /* storage blocked: the request is still sent */
        }
      }
      onSent(t("requestSent"));
    } catch {
      onError(t("requestError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("requestTitle")}
      onClose={onClose}
      onSubmit={() => void send()}
      actions={
        <>
          <Btn onClick={onClose}>{d("cancel")}</Btn>
          <Btn kind="primary" type="submit" icon={<IconSend />} busy={busy}>
            {t("requestSubmit")}
          </Btn>
        </>
      }
    >
      <p className="dx-dlg__text">{t("requestLead")}</p>
      <Field label={t("requestKind")}>
        <Select value={kind} onChange={setKind} ariaLabel={t("requestKind")} options={[{ value: "refund", label: t("refund") }, { value: "replacement", label: t("replacement") }]} />
      </Field>
      <Field label={t("requestReason")} hint={t("requestNote")}>
        <TextArea value={reason} onChange={setReason} placeholder={t("requestReasonPh")} rows={3} />
      </Field>
    </Dialog>
  );
}

function DocsDialog({ c, onClose, onError }: { c: BackendCase; onClose: () => void; onError: (m: string) => void }) {
  const t = useTranslations("portal.client.cases");
  const tc = useTranslations("portal.common");
  const d = useTranslations("portal.desk.client");
  const [docs, setDocs] = useState<ModuleRecord[] | null>(null);
  const [key, setKey] = useState(0);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    listCaseDocuments()
      .then((all) => alive && setDocs(all.filter((d) => String(d.payload.case_id ?? "") === c.id)))
      .catch(() => alive && setDocs([]));
    return () => {
      alive = false;
    };
  }, [c.id, key]);
  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await createCaseDocument({ title: title.trim(), payload: { case_id: c.id } });
      setTitle("");
      setKey((k) => k + 1);
    } catch {
      onError(t("requestError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("docsTitle")}
      onClose={onClose}
      onSubmit={() => void add()}
      actions={
        <>
          <Btn onClick={onClose}>{d("close")}</Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!title.trim()}>
            {t("docsAdd")}
          </Btn>
        </>
      }
    >
      {docs === null ? (
        <Spinner small />
      ) : docs.length ? (
        <ul className="dxco-opts">
          {docs.map((d) => (
            <li key={d.id}>
              <span>{d.title}</span>
              {d.status ? <Tag tone={toneOf(d.status)}>{statusLabel(tc, d.status)}</Tag> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dx-dlg__text">{t("docsEmptyText")}</p>
      )}
      <Field label={t("docsAdd")}>
        <Input value={title} onChange={setTitle} placeholder={t("docsAddPh")} />
      </Field>
    </Dialog>
  );
}
