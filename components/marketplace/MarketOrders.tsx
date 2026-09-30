"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { IconChat, IconCheck, IconClock, IconPhone, IconRefresh, IconSparkle, IconVideo, IconClose, IconUser } from "@/components/icons";
import { errDetail } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { onUserSocketResync } from "@/lib/userSocket";
import { startCall } from "@/lib/services/backend";
import {
  MARKET_EVENT,
  cancelMarketplaceOrder,
  completeMarketplaceOrder,
  isOrderPending,
  listMarketplaceOrders,
  type MarketOrder,
} from "@/lib/services/marketplace";

type View = "client" | "seller";
type Stage = "pending" | "active" | "completed" | "cancelled";
type Tab = "all" | Stage;

const DONE = new Set(["completed", "rated", "done", "closed"]);
const STOPPED = new Set(["cancelled", "canceled", "declined", "rejected", "lost", "refunded"]);

export function stageOf(o: Pick<MarketOrder, "status" | "paymentStatus">): Stage {
  if (STOPPED.has(o.status)) return "cancelled";
  if (DONE.has(o.status)) return "completed";
  if (isOrderPending(o)) return "pending";
  return "active";
}

const STEP_INDEX: Record<Stage, number> = { pending: 1, active: 2, completed: 4, cancelled: -1 };

export default function MarketOrders({ view }: { view: View }) {
  const t = useTranslations("marketplace.orders");
  const locale = useLocale();
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [cancelFor, setCancelFor] = useState<MarketOrder | null>(null);
  const [completeFor, setCompleteFor] = useState<MarketOrder | null>(null);
  const [flash, setFlash] = useState("");
  const seq = useRef(0);

  const load = useCallback(
    async (soft: boolean) => {
      const my = ++seq.current;
      if (soft) setRefreshing(true);
      try {
        const list = await listMarketplaceOrders(view);
        if (my !== seq.current) return;
        setOrders(list);
        setStatus("ready");
      } catch {
        if (my !== seq.current) return;
        setStatus((s) => (s === "ready" ? s : "error"));
      } finally {
        if (my === seq.current) setRefreshing(false);
      }
    },
    [view],
  );

  useEffect(() => {
    const h = setTimeout(() => void load(false), 0);
    return () => clearTimeout(h);
  }, [load]);

  useEffect(() => {
    const soft = () => void load(true);
    const onVis = () => {
      if (document.visibilityState === "visible") soft();
    };
    window.addEventListener(MARKET_EVENT, soft);
    document.addEventListener("visibilitychange", onVis);
    const off = onUserSocketResync(soft);
    return () => {
      window.removeEventListener(MARKET_EVENT, soft);
      document.removeEventListener("visibilitychange", onVis);
      off();
    };
  }, [load]);

  const hasPending = view === "client" && orders.some((o) => stageOf(o) === "pending");
  useEffect(() => {
    if (!hasPending) return;
    const h = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 15000);
    return () => clearInterval(h);
  }, [hasPending, load]);

  useEffect(() => {
    if (!flash) return;
    const h = setTimeout(() => setFlash(""), 3500);
    return () => clearTimeout(h);
  }, [flash]);

  const tabs: Tab[] = view === "client" ? ["all", "pending", "active", "completed", "cancelled"] : ["all", "active", "completed", "cancelled"];
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: orders.length, pending: 0, active: 0, completed: 0, cancelled: 0 };
    for (const o of orders) c[stageOf(o)]++;
    return c;
  }, [orders]);
  const shown = tab === "all" ? orders : orders.filter((o) => stageOf(o) === tab);

  const patch = (id: string, next: Partial<MarketOrder>) => setOrders((cur) => cur.map((o) => (o.id === id ? { ...o, ...next, canCancel: false, canComplete: false } : o)));

  return (
    <section className="mk mk-orders">
      <header className="mk-orders__head">
        <div>
          <h1 className="mk-orders__t">{view === "client" ? t("clientTitle") : t("sellerTitle")}</h1>
          <p className="mk-orders__l">{view === "client" ? t("clientLead") : t("sellerLead")}</p>
        </div>
        <button type="button" className="btn btn--line btn--sm" onClick={() => void load(true)} disabled={refreshing || status === "loading"}>
          <IconRefresh className={refreshing ? "mk-spin" : undefined} />
          {t("refresh")}
        </button>
      </header>

      {flash ? (
        <div className="mk-flash" role="status">
          <IconCheck />
          {flash}
        </div>
      ) : null}

      <div className="mk-tabs" role="tablist">
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="mk-tab" onClick={() => setTab(k)}>
            {t(`tabs.${k}`)}
            <span>{counts[k]}</span>
          </button>
        ))}
      </div>

      {status === "loading" ? (
        <div className="mk-olist">
          {[0, 1, 2].map((i) => (
            <div key={i} className="mk-order mk-order--ghost" aria-hidden="true" />
          ))}
        </div>
      ) : status === "error" ? (
        <div className="mk-empty">
          <b>{t("error")}</b>
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={() => {
              setStatus("loading");
              void load(false);
            }}
          >
            <IconRefresh />
            {t("retry")}
          </button>
        </div>
      ) : !orders.length ? (
        <div className="mk-empty">
          <IconSparkle />
          <b>{view === "client" ? t("emptyClient") : t("emptySeller")}</b>
          <span>{view === "client" ? t("emptyClientText") : t("emptySellerText")}</span>
          {view === "client" ? (
            <Link href="/portal/client/lawyers" className="btn btn--grad btn--sm">
              {t("browse")}
            </Link>
          ) : null}
        </div>
      ) : !shown.length ? (
        <div className="mk-empty mk-empty--flat">
          <span>{t("emptyTab")}</span>
        </div>
      ) : (
        <div className={`mk-olist${refreshing ? " is-busy" : ""}`}>
          {shown.map((o) => (
            <OrderCard key={o.id} o={o} view={view} locale={locale} onCancel={() => setCancelFor(o)} onComplete={() => setCompleteFor(o)} />
          ))}
        </div>
      )}

      <ActionDialog
        order={cancelFor}
        title={t("cancelTitle")}
        lead={t("cancelLead")}
        label={t("reason")}
        placeholder={t("reasonPh")}
        confirm={t("cancelConfirm")}
        busyLabel={t("cancelling")}
        errLabel={t("cancelError")}
        keep={t("keep")}
        danger
        onClose={() => setCancelFor(null)}
        run={async (o, text) => {
          const r = await cancelMarketplaceOrder(o.id, text);
          patch(o.id, { status: r.status, paymentStatus: r.paymentStatus });
          setFlash(t("updated"));
          void load(true);
        }}
      />
      <ActionDialog
        order={completeFor}
        title={t("completeTitle")}
        lead={t("completeLead")}
        label={t("completeNote")}
        placeholder={t("completeNotePh")}
        confirm={t("completeConfirm")}
        busyLabel={t("completing")}
        errLabel={t("completeError")}
        keep={t("keep")}
        onClose={() => setCompleteFor(null)}
        run={async (o, text) => {
          const r = await completeMarketplaceOrder(o.id, text);
          patch(o.id, { status: r.status });
          setFlash(t("updated"));
          void load(true);
        }}
      />
    </section>
  );
}

function OrderCard({
  o,
  view,
  locale,
  onCancel,
  onComplete,
}: {
  o: MarketOrder;
  view: View;
  locale: string;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const t = useTranslations("marketplace.orders");
  const tch = useTranslations("marketplace.purchase.channels");
  const te = useTranslations("enums");
  const router = useRouter();
  const stage = stageOf(o);
  const [calling, setCalling] = useState<"" | "audio" | "video">("");
  const [callErr, setCallErr] = useState("");
  const counterpart = view === "client" ? o.lawyerName : o.clientName;
  const counterpartId = view === "client" ? o.lawyerUserId : o.clientUserId;
  const paid = o.paymentStatus === "paid";
  const phone = view === "seller" ? o.clientPhone : o.lawyerPhone;
  const chatHref = `/portal/chat/${encodeURIComponent(o.roomId)}?${new URLSearchParams({ ...(o.workId ? { wid: o.workId } : {}), ...(o.serviceTitle ? { svc: o.serviceTitle } : {}) })}`;
  const stepAt = STEP_INDEX[stage];

  async function call(kind: "audio" | "video") {
    if (calling || !o.roomId) return;
    setCalling(kind);
    setCallErr("");
    try {
      const c = await startCall(o.roomId, kind, o.serviceTitle || o.workId || "LexGo", counterpartId ? { participantUserIds: [counterpartId] } : undefined);
      router.push(`/portal/chat/${encodeURIComponent(o.roomId)}?join=${encodeURIComponent(c.id)}`);
    } catch (e) {
      setCallErr(errDetail(e) || t("callError"));
      setCalling("");
    }
  }

  return (
    <article className={`mk-order mk-order--${stage}`}>
      <div className="mk-order__rail" aria-hidden="true" />
      <div className="mk-order__main">
        <div className="mk-order__top">
          <div className="mk-order__id">
            {o.workId ? <span className="wid">{o.workId}</span> : null}
            <span className={`mk-stage mk-stage--${stage}`}>
              {stage === "pending" ? <i aria-hidden="true" /> : null}
              {t(`stage.${stage}`)}
            </span>
          </div>
          <b className="mk-order__price">
            {o.price ? fmtUzs(o.price) : "—"} <small>{o.currency === "UZS" ? te("currency") : o.currency}</small>
          </b>
        </div>

        <h3 className="mk-order__svc">{o.serviceTitle || "—"}</h3>

        {stage !== "cancelled" ? (
          <ol className="mk-track" aria-label={t(`stage.${stage}`)}>
            {(["request", "confirm", "work", "done"] as const).map((s, i) => (
              <li key={s} className={i < stepAt ? "is-done" : i === stepAt ? "is-now" : ""}>
                <span />
                {t(`steps.${s}`)}
              </li>
            ))}
          </ol>
        ) : null}

        <dl className="mk-order__facts">
          {counterpart ? (
            <div>
              <dt>{view === "client" ? t("seller") : t("client")}</dt>
              <dd>
                <IconUser />
                {counterpart}
              </dd>
            </div>
          ) : null}
          {view === "seller" ? (
            <div>
              <dt>{t("phone")}</dt>
              <dd>{paid && phone ? <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a> : <span className="mk-muted">{t("phoneHidden")}</span>}</dd>
            </div>
          ) : null}
          {o.preferredChannel ? (
            <div>
              <dt>{t("channel")}</dt>
              <dd>{tch.has(o.preferredChannel) ? tch(o.preferredChannel) : o.preferredChannel}</dd>
            </div>
          ) : null}
          {o.preferredTime ? (
            <div>
              <dt>{t("time")}</dt>
              <dd>
                <IconClock />
                {o.preferredTime}
              </dd>
            </div>
          ) : null}
          {o.createdAt ? (
            <div>
              <dt>{t("created")}</dt>
              <dd>{shortDateTime(o.createdAt, locale)}</dd>
            </div>
          ) : null}
        </dl>

        {o.note ? (
          <blockquote className="mk-order__note">
            <small>{t("note")}</small>
            {o.note}
          </blockquote>
        ) : null}

        {stage === "pending" && view === "client" ? (
          <p className="mk-pending mk-pending--line">
            <i aria-hidden="true" />
            {t("waitNote")}
          </p>
        ) : null}

        {callErr ? <Notice ok={false} msg={callErr} /> : null}

        <div className="mk-order__acts">
          {o.canStartChat ? (
            <Link href={chatHref} className="btn btn--pri btn--sm">
              <IconChat />
              {t("openChat")}
            </Link>
          ) : null}
          {o.canCreateCall && stage !== "cancelled" && stage !== "completed" ? (
            <span className="mk-callgrp" role="group" aria-label={t("call")}>
              <button type="button" className="btn btn--line btn--sm" disabled={!!calling} onClick={() => void call("audio")}>
                <IconPhone />
                {calling === "audio" ? t("calling") : t("audio")}
              </button>
              <button type="button" className="btn btn--line btn--sm" disabled={!!calling} onClick={() => void call("video")}>
                <IconVideo />
                {calling === "video" ? t("calling") : t("video")}
              </button>
            </span>
          ) : null}
          {view === "seller" && o.canComplete && stage === "active" ? (
            <button type="button" className="btn btn--grad btn--sm" onClick={onComplete}>
              <IconCheck />
              {t("complete")}
            </button>
          ) : null}
          {view === "client" && o.canCancel && stage === "pending" ? (
            <button type="button" className="btn btn--line btn--sm mk-danger" onClick={onCancel}>
              <IconClose />
              {t("cancel")}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ActionDialog({
  order,
  title,
  lead,
  label,
  placeholder,
  confirm,
  busyLabel,
  errLabel,
  keep,
  danger,
  onClose,
  run,
}: {
  order: MarketOrder | null;
  title: string;
  lead: string;
  label: string;
  placeholder: string;
  confirm: string;
  busyLabel: string;
  errLabel: string;
  keep: string;
  danger?: boolean;
  onClose: () => void;
  run: (o: MarketOrder, text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const key = order?.id ?? "";
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setText("");
    setErr("");
  }
  if (!order) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const target = order;

  async function go() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await run(target, text);
      onClose();
    } catch (e) {
      setErr(errDetail(e) || errLabel);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={title}>
      <div className="mk-act">
        <div className="mk-act__head">
          {target.workId ? <span className="wid">{target.workId}</span> : null}
          <b>{target.serviceTitle}</b>
        </div>
        <p>{lead}</p>
        <label className="mk-in">
          <span>{label}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} rows={3} maxLength={500} />
        </label>
        {err ? <Notice ok={false} msg={err} /> : null}
        <div className="mk-buy__acts">
          <button type="button" className={`btn ${danger ? "btn--line mk-danger" : "btn--grad"}`} disabled={busy} onClick={() => void go()}>
            {busy ? busyLabel : confirm}
          </button>
          <button type="button" className="btn btn--line" disabled={busy} onClick={onClose}>
            {keep}
          </button>
        </div>
      </div>
    </Modal>
  );
}
