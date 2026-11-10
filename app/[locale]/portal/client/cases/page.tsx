"use client";

import "@/components/portal/ordersList1920.css";
import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, CircleCheck, CircleX, Clock, FileText, Loader, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { shortDateTime } from "@/lib/date";
import { initials } from "@/lib/lawyers";
import { personName } from "@/lib/labels";
import {
  listCases,
  listOrders,
  createRefundRequest,
  createReplacementRequest,
  getReplacementHistory,
  listMyReplacementRequests,
  listCaseDocuments,
  createCaseDocument,
  type BackendCase,
  type BackendOrder,
  type ModuleRecord,
  type ReplacementEvent,
} from "@/lib/services/backend";
import { useResource, useResourceOne } from "@/lib/useResource";
import { clientStageOf, useOrderStatusLabel } from "@/lib/orderStatus";
import { humanizeSlug } from "@/lib/lawyers";
import { deadlineLabel, responseDeadline } from "@/lib/businessHours";
import { getBusinessHours, DEFAULT_BUSINESS_HOURS } from "@/lib/services/backend";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import OrderMilestones from "@/components/portal/OrderMilestones";
import OrderStatusPanel from "@/components/portal/OrderStatusPanel";
import { notify } from "@/lib/toast";
import Modal from "@/components/admin/Modal";
import CopilotLauncher from "@/components/copilot/CopilotLauncher";
import { IconFileText, IconDocLines } from "@/components/icons";
import { statusLabel } from "@/lib/labels";
import OpenDocumentWork from "@/components/portal/OpenDocumentWork";
import { useAiReveal } from "@/lib/guide/targets";

// The client dashboard's four steps (components/portal/dash/ClientHome.tsx)
// and its status pill tones: payment amber, done green, closed grey, else blue.
const STEP: Record<string, number> = { request: 1, matching: 1, payment: 2, work: 3, done: 4 };
type Tone = "ok" | "warn" | "blue" | "mute";
function toneOf(stage: string | null, caseStatus: string): Tone {
  if (stage === "done") return "ok";
  if (stage === "payment") return "warn";
  if (stage === "closed") return "mute";
  if (stage) return "blue";
  if (/^(completed|resolved|closed|done)$/.test(caseStatus)) return "ok";
  if (/^(cancelled|canceled|rejected|archived)$/.test(caseStatus)) return "mute";
  return "blue";
}
function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "ok") return <CircleCheck aria-hidden />;
  if (tone === "warn") return <Loader aria-hidden />;
  if (tone === "mute") return <CircleX aria-hidden />;
  return <Sparkles aria-hidden />;
}
// The two requests, each with its picture (the dashboard's line drawings).
const KIND_ART: Record<string, string> = { refund: "/img/xizmatlar/Pul_qaytarish.webp", replacement: "/img/xizmatlar/Boshqa_mutaxassis.webp" };

// A replacement request can't be listed back by the client (the list needs
// replacements.manage), so its id is kept per case to read its history.
const REPLACEMENT_KEY = (caseId: string) => `lexgo_replacement_${caseId}`;
function storedReplacement(caseId: string): string {
  try {
    return localStorage.getItem(REPLACEMENT_KEY(caseId)) || "";
  } catch {
    return "";
  }
}

// One row of "My cases": a legal case (with its order, when linked) or an
// order that has no case yet.
type Item = { key: string; case?: BackendCase; order?: BackendOrder };

export default function ClientCases() {
  const t = useTranslations("portal.client.cases");
  const tcCommon = useTranslations("portal.common");
  const tcp = useTranslations("copilot");
  const tl = useTranslations("lxOrders");
  const locale = useLocale();
  const kindId = useId();
  const orderLabel = useOrderStatusLabel();
  const res = useResource(listCases, []);
  const orders = useResource(listOrders, []);
  // T0-20: the seller's 30-minute answer window counts working time only, so a
  // night/Sunday order shows "tomorrow 09:30" instead of a dead timer.
  const bh = useResourceOne(getBusinessHours, []);
  const hours = bh.data ?? DEFAULT_BUSINESS_HOURS;
  // "Now" is sampled once per render pass (not in render) — a ticking clock is not needed here.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => { const tick = () => setNowMs(Date.now()); const t0 = setTimeout(tick, 0); const iv = setInterval(tick, 60000); return () => { clearTimeout(t0); clearInterval(iv); }; }, []);
  const WAITING = new Set(["new", "seller_selection", "sent_to_seller", "waiting_info"]);
  const deadlineOf = (o: { status: string; createdAt: string } | undefined) => {
    if (!o || !WAITING.has(o.status) || !o.createdAt) return null;
    const from = new Date(o.createdAt).getTime();
    if (Number.isNaN(from)) return null;
    if (!nowMs) return null;
    const at = responseDeadline(hours, from, 30);
    const now = nowMs;
    return { at, overdue: at < now, text: deadlineLabel(at, now, { today: t("deadlineToday"), tomorrow: t("deadlineTomorrow") }) };
  };

  // Refund / replacement request modal
  const [target, setTarget] = useState<BackendCase | null>(null);
  const [kind, setKind] = useState("refund");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // Bumped after a replacement request so its status line re-reads the stored id.
  const [replVersion, setReplVersion] = useState(0);
  const [openMilestones, setOpenMilestones] = useState("");
  const [openHistory, setOpenHistory] = useState("");

  // Case-documents modal
  const [docCase, setDocCase] = useState<BackendCase | null>(null);

  const items = useMemo<Item[]>(() => {
    const byId = new Map(orders.data.map((o) => [o.id, o]));
    const linked = new Set<string>();
    const rows: Item[] = res.data.map((c) => {
      const order = c.orderId ? byId.get(c.orderId) : undefined;
      if (c.orderId) linked.add(c.orderId);
      return { key: `c:${c.id}`, case: c, order };
    });
    for (const o of orders.data) if (!linked.has(o.id)) rows.push({ key: `o:${o.id}`, order: o });
    return rows;
  }, [res.data, orders.data]);

  const firstOrderKey = items.find((it) => it.case?.orderId || it.order?.id)?.key ?? "";
  useAiReveal("order:status", () => {
    if (firstOrderKey) setOpenHistory(firstOrderKey);
  });
  useAiReveal("order:milestones", () => {
    if (firstOrderKey) setOpenMilestones(firstOrderKey);
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || busy) return;
    setBusy(true);
    const nid = `case-request-${target.id}`;
    try {
      const payload = { case_id: target.id, order_id: target.orderId, reason: reason.trim() };
      const title = `${target.caseType || target.caseNumber} — ${kind}`;
      if (kind === "refund") {
        await createRefundRequest({ title, payload });
      } else {
        const rec = await createReplacementRequest({ title, record_type: "replacement", status: "pending", payload });
        if (rec.id) {
          try {
            localStorage.setItem(REPLACEMENT_KEY(target.id), rec.id);
          } catch {
            /* storage blocked: the request is still sent */
          }
          setReplVersion((v) => v + 1);
        }
      }
      notify.success(t("requestSent"), { id: nid });
      setReason("");
      setTarget(null);
    } catch (err) {
      notify.error(t("requestError"), { id: nid, error: err });
    } finally {
      setBusy(false);
    }
  }

  const kindOpts = [
    { value: "refund", label: t("refund"), sub: tl("cases.refundSub") },
    { value: "replacement", label: t("replacement"), sub: tl("cases.replacementSub") },
  ];

  const caseStatus = (s: string) => statusLabel(tcCommon, s);
  const loading = res.status === "loading" || orders.status === "loading";

  return (
    <>
    {/* Document work that has been started and not come back yet. It lives on
        its own page too, but this is where a client looks for what is still
        open — and, until now, an unfinished request was invisible here. */}
    <OpenDocumentWork />
    <div className="ppanel ocases" data-ai-target="cases:list">
      {/* The dashboard's section head: a small title with its count — the
          page's own title ("So'rovlarim") is the shell's. */}
      <div className="ppanel__h">
        <h2 className="ppanel__t cx-h3">
          {tl("cases.listTitle")}
          {loading ? null : <span className="cx-count">{items.length}</span>}
        </h2>
        <span className="ppanel__hact">
          <CopilotLauncher surface="client_case_detail" title={t("title")} className="olx-ai" />
        </span>
      </div>
      {loading ? (
        <Skeleton rows={3} />
      ) : !items.length ? (
        <EmptyState
          icon={<IconFileText />}
          title={t("empty")}
          text={t("emptyText")}
          action={
            <Link href="/portal/client/lawyers" className="btn btn--pri btn--sm">
              {tl("emptyCta")}
              <ArrowRight aria-hidden />
            </Link>
          }
        />
      ) : (
        <div className="ocases__list">
        {items.map(({ key, case: c, order: o }) => {
          const orderId = c?.orderId || o?.id || "";
          const status = o?.status || "";
          const stage = status ? clientStageOf(status) : null;
          const rowTitle = c ? c.caseType || c.title || t("title") : o?.serviceName || o?.title || t("orderItem");
          const rowEntity = c?.id
            ? { type: "legal_case", id: c.id, code: c.caseNumber || undefined, title: c.caseType || c.title || undefined }
            : o?.id
              ? { type: "service_order", id: o.id, code: o.workId || undefined, title: o.serviceName || o.title || undefined }
              : null;
          const tone = toneOf(stage, c?.status || "");
          const pill = status ? orderLabel(status) : c?.status ? caseStatus(c.status) : "";
          const lawyer = personName(o?.lawyerName);
          // The order's own sentence (the client's question), when it has one.
          const question = !c && o?.title && o.title !== o.serviceName ? o.title : "";
          return (
            <article className="creq ocase cx-work" key={key} data-ai-target={c?.id ? `cases.item.${c.id}` : o?.id ? `orders.item.${o.id}` : undefined}>
              <div className="cx-work__h">
                <b className="cx-work__t ocase__t">{rowTitle}</b>
                {pill ? (
                  <span className={`creq__badge cx-pill cx-pill--${tone}`} title={status ? t("orderStatus") : undefined}>
                    <ToneIcon tone={tone} />
                    {pill}
                  </span>
                ) : null}
              </div>
              {/* LEXGO_PUBLIC_WORK_IDS_FRONTEND.md: CASE-XXXXX / ORD-XXXXX,
                  as the dashboard's grey meta line. */}
              <span className="cx-work__meta">
                {[c ? c.caseNumber || c.workId : o?.workId, c?.stage ? statusLabel(tcCommon, c.stage) : "", o?.createdAt ? shortDateTime(o.createdAt, locale) : ""].filter(Boolean).join(" · ")}
              </span>
              {question ? <span className="ocase__q">{question}</span> : null}
              {stage ? <StageTrack stage={stage} /> : null}
              {(() => { const dl = deadlineOf(o); return dl ? (
                <span className={`ocase__note ocase__dl${dl.overdue ? " overdue" : ""}`}>
                  <Clock aria-hidden />
                  {dl.overdue ? t("deadlineOverdue") : t("deadlineText", { when: dl.text })}
                </span>
              ) : null; })()}
              {c?.nextAction ? (
                <em className="creq__next">
                  <ArrowRight aria-hidden />
                  {c.nextAction}
                </em>
              ) : null}
              {c ? <ReplacementStatus key={`${c.id}:${replVersion}`} caseId={c.id} /> : null}
              {orderId && openMilestones === key ? <OrderMilestones orderId={orderId} /> : null}
              {orderId && openHistory === key ? <OrderStatusPanel orderId={orderId} side="client" status={status} onChanged={() => orders.refresh()} /> : null}
              <div className="cx-work__foot ocase__foot">
                <span className="cx-work__who">
                  {lawyer ? <span className="cx-av" aria-hidden>{initials(lawyer)}</span> : null}
                  {lawyer ? tl("who", { name: lawyer }) : null}
                </span>
                <div className="creq__side ocase__acts">
                {orderId ? (
                  <button className="btn btn--line btn--sm" type="button" aria-expanded={openMilestones === key} onClick={() => setOpenMilestones((k) => (k === key ? "" : key))}>
                    {openMilestones === key ? t("hideMilestones") : t("milestonesCta")}
                  </button>
                ) : null}
                {orderId ? (
                  <button className="btn btn--line btn--sm" type="button" aria-expanded={openHistory === key} onClick={() => setOpenHistory((k) => (k === key ? "" : key))}>
                    {openHistory === key ? t("hideHistory") : t("historyCta")}
                  </button>
                ) : null}
                {c ? (
                  <>
                    <button className="btn btn--line btn--sm" type="button" onClick={() => setDocCase(c)}>
                      {t("docsCta")}
                    </button>
                    <button
                      className="btn btn--line btn--sm"
                      type="button"
                      onClick={() => {
                        setTarget(c);
                        setKind("refund");
                        setReason("");
                      }}
                    >
                      {t("requestCta")}
                    </button>
                  </>
                ) : null}
                {/* the item's own AI question, as the dashboard's square icon button */}
                {rowEntity ? <CopilotLauncher variant="icon" surface="client_case_detail" entity={rowEntity} title={rowTitle} label={tcp("place.aboutItem", { title: rowTitle })} aiId={`cases.item.${rowEntity.id}.copilot`} className="olx-ai-ic" /> : null}
                </div>
              </div>
            </article>
          );
        })}
        </div>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title={t("requestTitle")}>
        <form className="cform olx-req" style={{ maxWidth: "none" }} onSubmit={submit}>
          <p className="advmuted">{t("requestLead")}</p>
          {/* the two requests as the dashboard's picture cards, one to choose */}
          <fieldset className="olx-req__kinds">
            <legend id={kindId}>{t("requestKind")}</legend>
            <div className="olx-req__grid">
              {kindOpts.map((k) => (
                <label key={k.value} className={`olx-opt${kind === k.value ? " is-on" : ""}`}>
                  <input type="radio" name={`${kindId}-kind`} value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} />
                  <span className="olx-opt__art" style={{ "--art": `url(${KIND_ART[k.value]})` } as CSSProperties} aria-hidden />
                  <span className="olx-opt__t">
                    <b>{k.label}</b>
                    <small>{k.sub}</small>
                  </span>
                  <span className="olx-opt__tick" aria-hidden>
                    <Check />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label>{t("requestReason")}</label>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("requestReasonPh")} />
          </div>
          <p className="rf__hint">{t("requestNote")}</p>
          <div className="olx-foot">
            <button className="btn btn--line" type="button" onClick={() => setTarget(null)} disabled={busy}>
              {tl("cancel")}
            </button>
            <button className="btn btn--pri" type="submit" disabled={busy}>
              {busy ? t("requestSending") : t("requestSubmit")}
            </button>
          </div>
        </form>
      </Modal>

      <CaseDocsModal target={docCase} onClose={() => setDocCase(null)} />
    </div>
    </>
  );
}

// The client steps as the dashboard draws them: four segments (request and
// matching share the first) and "n/4 · what is happening"; a closed order
// shows its own label instead.
function StageTrack({ stage }: { stage: string }) {
  const t = useTranslations("portal.common.orderStage");
  const tl = useTranslations("lxOrders");
  if (stage === "closed") return <small className="ostage__lbl cx-work__stage">{t("closed")}</small>;
  const step = STEP[stage] ?? 1;
  return (
    <span className="ostage" aria-label={t(stage)}>
      <span className={`ostage__bar cx-steps cx-steps--${stage === "payment" ? "warn" : "blue"}`}>
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= step ? "on" : ""} />
        ))}
      </span>
      <small className="ostage__lbl cx-work__stage">
        {tl("step", { n: step })} · {tl.has(`stageText.${stage}`) ? tl(`stageText.${stage}`) : t(stage)}
      </small>
    </span>
  );
}

// Latest event of this case's replacement request (id kept in localStorage).
function ReplacementStatus({ caseId }: { caseId: string }) {
  const t = useTranslations("portal.client.cases");
  const locale = useLocale();
  const [stored] = useState(() => storedReplacement(caseId));
  // The server list (GET /replacement-requests/me) is the source; the id kept
  // in localStorage is only a fallback for older backends.
  const load = useCallback(async (): Promise<ReplacementEvent[]> => {
    let rid = stored;
    try {
      const mine = await listMyReplacementRequests();
      const hit = mine.find((r) => String(r.payload.case_id ?? "") === caseId);
      if (hit) rid = hit.id;
    } catch {
      /* fall back to the stored id */
    }
    return rid ? getReplacementHistory(rid) : [];
  }, [stored, caseId]);
  const res = useResourceOne(load, [stored, caseId]);
  const id = stored || "server";
  const events = res.data ?? [];
  if (!id || !events.length) return null;
  const last = events[events.length - 1];
  const st = (last.status || "").toLowerCase();
  const label = t.has(`replacementStates.${st}`) ? t(`replacementStates.${st}`) : humanizeSlug(st);
  let when = "";
  const at = new Date(last.createdAt);
  if (!Number.isNaN(at.getTime())) when = shortDateTime(last.createdAt, locale);
  // a status note in the dashboard's amber tone (not free orange text)
  return (
    <span className="ocase__note ocase__repl">
      <RefreshCw aria-hidden />
      {t("replacementStatus", { status: label })}
      {when ? ` · ${when}` : ""}
    </span>
  );
}

function CaseDocsModal({ target, onClose }: { target: BackendCase | null; onClose: () => void }) {
  const t = useTranslations("portal.client.cases");
  const tcm = useTranslations("portal.common");
  const tl = useTranslations("lxOrders");
  const addId = useId();
  const [reloadKey, setReloadKey] = useState(0);
  // A document's status, in words the common map may not have yet.
  const docStatus = (s: string) => (tl.has(`docStatus.${s}`) ? tl(`docStatus.${s}`) : statusLabel(tcm, s));
  const docTone = (s: string): Tone => (/^(active|approved|accepted|signed|completed)$/.test(s) ? "ok" : /^(under_review|pending|new|draft)$/.test(s) ? "warn" : /^(rejected|archived|cancelled)$/.test(s) ? "mute" : "blue");
  const caseId = target?.id ?? "";
  const load = useCallback(async () => {
    if (!caseId) return [] as ModuleRecord[];
    const all = await listCaseDocuments();
    return all.filter((d) => String(d.payload.case_id ?? "") === caseId);
  }, [caseId]);
  const docs = useResource(load, [caseId, reloadKey]);

  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy || !caseId) return;
    setBusy(true);
    const nid = `case-doc-${caseId}`;
    try {
      await createCaseDocument({ title: title.trim(), payload: { case_id: caseId } });
      setTitle("");
      notify.success(t("docsAdded"), { id: nid });
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify.error(t("requestError"), { id: nid, error: err });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title={t("docsTitle")}>
      <div className="cform olx-docs" style={{ maxWidth: "none" }}>
        {docs.status === "loading" ? (
          <Skeleton rows={2} />
        ) : !docs.data.length ? (
          <EmptyState icon={<IconDocLines />} title={t("docsEmpty")} text={t("docsEmptyText")} />
        ) : (
          <div className="alist olx-docs__list">
            {docs.data.map((d) => (
              <div className="creq olx-docs__row" key={d.id}>
                <FileText aria-hidden className="olx-docs__ic" />
                <b className="olx-docs__t">{d.title}</b>
                {d.status ? (
                  <span className={`cx-pill cx-pill--${docTone(d.status)}`}>
                    <ToneIcon tone={docTone(d.status)} />
                    {docStatus(d.status)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {/* one line: the name, then "Qo'shish" beside it */}
        <form onSubmit={add} className="olx-docs__add">
          <label htmlFor={addId}>{t("docsAdd")}</label>
          <span className="olx-docs__addrow">
            <input id={addId} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("docsAddPh")} />
            <button className="btn btn--pri" type="submit" disabled={busy}>
              {busy ? t("requestSending") : tl("add")}
            </button>
          </span>
        </form>
      </div>
    </Modal>
  );
}
