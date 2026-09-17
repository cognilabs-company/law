"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
import { CLIENT_STAGES, clientStageOf, useOrderStatusLabel } from "@/lib/orderStatus";
import { humanizeSlug } from "@/lib/lawyers";
import { deadlineLabel, responseDeadline } from "@/lib/businessHours";
import { getBusinessHours, DEFAULT_BUSINESS_HOURS } from "@/lib/services/backend";
import { IconClock } from "@/components/icons";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import OrderMilestones from "@/components/portal/OrderMilestones";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { IconFileText, IconArrowRight, IconDocLines } from "@/components/icons";

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
  const tcs = useTranslations("portal.common.status");
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
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  // Bumped after a replacement request so its status line re-reads the stored id.
  const [replVersion, setReplVersion] = useState(0);
  const [openMilestones, setOpenMilestones] = useState("");

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || busy) return;
    setBusy(true);
    setNote(null);
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
      setNote({ ok: true, msg: t("requestSent") });
      setReason("");
      setTimeout(() => setTarget(null), 1200);
    } catch (err) {
      const d = err && typeof err === "object" && "detail" in err ? String((err as { detail?: string }).detail) : "";
      setNote({ ok: false, msg: d || t("requestError") });
    } finally {
      setBusy(false);
    }
  }

  const kindOpts = [
    { value: "refund", label: t("refund") },
    { value: "replacement", label: t("replacement") },
  ];

  const caseStatus = (s: string) => (s && tcs.has(s) ? tcs(s) : humanizeSlug(s));
  const loading = res.status === "loading" || orders.status === "loading";

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{t("count", { n: items.length })}</span>
      </div>
      {loading ? (
        <Skeleton rows={3} />
      ) : !items.length ? (
        <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
      ) : (
        items.map(({ key, case: c, order: o }) => {
          const orderId = c?.orderId || o?.id || "";
          const status = o?.status || "";
          const stage = status ? clientStageOf(status) : null;
          return (
            <div className="creq ocase" key={key}>
              <span className="creq__st" />
              <div className="creq__m">
                <b>{c ? c.caseType || c.title || t("title") : o?.serviceName || o?.title || t("orderItem")}</b>
                <span>{[c?.stage ? humanizeSlug(c.stage) : "", c?.status ? caseStatus(c.status) : ""].filter(Boolean).join(" · ") || (o?.title && o.title !== o.serviceName ? o.title : "")}</span>
                {stage ? <StageTrack stage={stage} /> : null}
                {(() => { const dl = deadlineOf(o); return dl ? (
                  <em className={`creq__next ocase__dl${dl.overdue ? " overdue" : ""}`}>
                    <IconClock />
                    {dl.overdue ? t("deadlineOverdue") : t("deadlineText", { when: dl.text })}
                  </em>
                ) : null; })()}
                {c?.nextAction ? (
                  <em className="creq__next">
                    <IconArrowRight />
                    {c.nextAction}
                  </em>
                ) : null}
                {c ? <ReplacementStatus key={`${c.id}:${replVersion}`} caseId={c.id} /> : null}
                {orderId && openMilestones === key ? <OrderMilestones orderId={orderId} /> : null}
              </div>
              <div className="creq__side">
                {status ? (
                  <span className={`creq__badge${stage === "done" ? " creq__badge--ok" : ""}`} title={t("orderStatus")}>{orderLabel(status)}</span>
                ) : c?.status ? (
                  <span className="creq__badge">{caseStatus(c.status)}</span>
                ) : null}
                {orderId ? (
                  <button className="btn btn--line btn--sm" type="button" aria-expanded={openMilestones === key} onClick={() => setOpenMilestones((k) => (k === key ? "" : key))}>
                    {openMilestones === key ? t("hideMilestones") : t("milestonesCta")}
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
                        setNote(null);
                      }}
                    >
                      {t("requestCta")}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title={t("requestTitle")}>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
          <p className="advmuted">{t("requestLead")}</p>
          <div>
            <label>{t("requestKind")}</label>
            <Select value={kind} onChange={setKind} options={kindOpts} ariaLabel={t("requestKind")} />
          </div>
          <div>
            <label>{t("requestReason")}</label>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("requestReasonPh")} />
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
            {busy ? t("requestSending") : t("requestSubmit")}
          </button>
          <p className="rf__hint">{t("requestNote")}</p>
        </form>
      </Modal>

      <CaseDocsModal target={docCase} onClose={() => setDocCase(null)} />
    </div>
  );
}

// The 5 simplified client steps; a closed order shows its own label instead.
function StageTrack({ stage }: { stage: string }) {
  const t = useTranslations("portal.common.orderStage");
  const tc = useTranslations("portal.client.cases");
  if (stage === "closed") return <small className="ostage__lbl">{t("closed")}</small>;
  const idx = CLIENT_STAGES.indexOf(stage as (typeof CLIENT_STAGES)[number]);
  return (
    <span className="ostage" aria-label={t(stage)}>
      <span className="ostage__bar">
        {CLIENT_STAGES.map((s, i) => (
          <i key={s} className={i <= idx ? "on" : ""} />
        ))}
      </span>
      <small className="ostage__lbl">{tc("stageOf", { n: idx + 1, total: CLIENT_STAGES.length })} · {t(stage)}</small>
    </span>
  );
}

// Latest event of this case's replacement request (id kept in localStorage).
function ReplacementStatus({ caseId }: { caseId: string }) {
  const t = useTranslations("portal.client.cases");
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
  if (!Number.isNaN(at.getTime())) when = at.toLocaleDateString();
  return <small className="ocase__repl">{t("replacementStatus", { status: label })}{when ? ` · ${when}` : ""}</small>;
}

function CaseDocsModal({ target, onClose }: { target: BackendCase | null; onClose: () => void }) {
  const t = useTranslations("portal.client.cases");
  const [reloadKey, setReloadKey] = useState(0);
  const caseId = target?.id ?? "";
  const load = useCallback(async () => {
    if (!caseId) return [] as ModuleRecord[];
    const all = await listCaseDocuments();
    return all.filter((d) => String(d.payload.case_id ?? "") === caseId);
  }, [caseId]);
  const docs = useResource(load, [caseId, reloadKey]);

  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy || !caseId) return;
    setBusy(true);
    setNote(null);
    try {
      await createCaseDocument({ title: title.trim(), payload: { case_id: caseId } });
      setTitle("");
      setNote({ ok: true, msg: t("docsAdded") });
      setReloadKey((k) => k + 1);
    } catch {
      setNote({ ok: false, msg: t("requestError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title={t("docsTitle")}>
      <div className="cform" style={{ maxWidth: "none" }}>
        {docs.status === "loading" ? (
          <Skeleton rows={2} />
        ) : !docs.data.length ? (
          <EmptyState icon={<IconDocLines />} title={t("docsEmpty")} text={t("docsEmptyText")} />
        ) : (
          <div className="alist">
            {docs.data.map((d) => (
              <div className="creq" key={d.id}>
                <span className="creq__st" />
                <div className="creq__m">
                  <b>{d.title}</b>
                  {d.status ? <span>{d.status}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={add} style={{ display: "grid", gap: 8, marginTop: 4 }}>
          <label>{t("docsAdd")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("docsAddPh")} />
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
            {busy ? t("requestSending") : t("docsAdd")}
          </button>
        </form>
      </div>
    </Modal>
  );
}
