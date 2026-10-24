"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import { IconArrowRight, IconChat, IconCheck, IconClipboardCheck, IconClock, IconCoins, IconPackage, IconPause, IconPhone, IconRefresh, IconSparkle, IconVideo, IconClose, IconUser } from "@/components/icons";
import { errDetail } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { matchesSearch } from "@/lib/searchText";
import { onUserSocketResync } from "@/lib/userSocket";
import { startCall } from "@/lib/services/backend";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { useAuth } from "@/lib/auth";
import { useAiField, useAiSelection } from "@/lib/ai/registry";
import { useAiReveal } from "@/lib/guide/targets";
import {
  MARKET_EVENT,
  cancelMarketplaceOrder,
  listMarketplaceOrders,
  listSellerAssignments,
  marketChatHref,
  marketPhaseOf,
  awaitingSeller,
  marketStageOf,
  orderDetailHref,
  rememberMarketOrders,
  type MarketOrder,
  type MarketStage,
} from "@/lib/services/marketplace";
import CompleteOrderDialog from "./CompleteOrderDialog";
import CopilotLauncher from "@/components/copilot/CopilotLauncher";
import SupplementalDialog from "./SupplementalDialog";
import { OptionLines, RatingPanel, ResultBlock, SupplementalPanel } from "./OrderExtras";
import { dealAmount as dealOf } from "./order/negotiationRules";
import ContactAdvocate, { callStateOf } from "./order/ContactAdvocate";
import { useContactSpeedText } from "./order/contactSpeed";
import { clientPhoneShow, telHref } from "./order/phone";
import "./order/cards.css";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

type View = "client" | "seller";
type Tab = "all" | MarketStage;

const DEAL_OPEN = /^(pending|open|proposed|created|waiting|counter)/;

const STEP_INDEX: Record<MarketStage, number> = { pending: 1, active: 2, completed: 4, cancelled: -1 };
const EVENT_SETTLE_MS = 500;
const SEARCH_MAX = 100;

const aiBaseOf = (view: View) => (view === "client" ? "marketplace.orders" : "advocate.marketplace-orders");

const tabsOf = (view: View): Tab[] => (view === "client" ? ["all", "pending", "active", "completed", "cancelled"] : ["all", "active", "completed", "cancelled"]);

const lower = (s: string) => s.trim().toLowerCase();

const haystackOf = (o: MarketOrder, view: View) => [o.serviceTitle, o.workId, view === "client" ? o.lawyerName : o.clientName].join(" ");

export default function MarketOrders({ view }: { view: View }) {
  const t = useTranslations("marketplace.orders");
  const tf = useTranslations("filterBar");
  const locale = useLocale();
  const pathname = usePathname();
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [cancelFor, setCancelFor] = useState<MarketOrder | null>(null);
  const [completeFor, setCompleteFor] = useState<MarketOrder | null>(null);
  const [supFor, setSupFor] = useState<MarketOrder | null>(null);
  const [flash, setFlash] = useState("");
  const seq = useRef(0);
  const owner = useAuth().session?.id ?? "";
  const ownerRef = useRef(owner);
  useEffect(() => {
    ownerRef.current = owner;
  });

  const load = useCallback(
    async (soft: boolean) => {
      const my = ++seq.current;
      if (soft) setRefreshing(true);
      try {
        const base = await listMarketplaceOrders(view);
        // New assignments the seller list does not carry yet come first.
        const extra = view === "seller" ? await listSellerAssignments(new Set(base.map((o) => o.id))).catch(() => []) : [];
        const list = [...extra, ...base];
        if (my !== seq.current) return;
        rememberMarketOrders(list, ownerRef.current);
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
    let timer = 0;
    const soft = () => void load(true);
    const settle = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(soft, EVENT_SETTLE_MS);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") soft();
    };
    window.addEventListener(MARKET_EVENT, settle);
    document.addEventListener("visibilitychange", onVis);
    const off = onUserSocketResync(soft);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(MARKET_EVENT, settle);
      document.removeEventListener("visibilitychange", onVis);
      off();
    };
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const h = setTimeout(() => setFlash(""), 3500);
    return () => clearTimeout(h);
  }, [flash]);

  const tabs = tabsOf(view);
  const term = q.trim();
  const searched = useMemo(() => (term ? orders.filter((o) => matchesSearch(haystackOf(o, view), term)) : orders), [orders, term, view]);
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: searched.length, pending: 0, active: 0, completed: 0, cancelled: 0 };
    for (const o of searched) c[marketStageOf(o)]++;
    return c;
  }, [searched]);
  const shown = tab === "all" ? searched : searched.filter((o) => marketStageOf(o) === tab);
  const ai = aiBaseOf(view);

  const tabOf = (v: string): Tab | null => {
    const w = lower(v);
    if (!w) return "all";
    return tabs.find((k) => k === w || lower(t(`tabs.${k}`)) === w || (k !== "all" && lower(t(`stage.${k}`)) === w)) ?? null;
  };
  const resetFilters = () => {
    setTab("all");
    setQ("");
  };

  useAiSelection(view === "client" ? "marketplace_orders_tab" : "seller_orders_tab", tab);
  useAiField(`${ai}.tabs`, {
    get: () => tab,
    set: (v) => {
      const next = tabOf(v);
      if (next) setTab(next);
    },
  });
  useAiField(`${ai}.search`, {
    get: () => q,
    set: (v) => setQ(v.slice(0, SEARCH_MAX)),
  });
  useAiReveal(/^(advocate\.marketplace-orders|marketplace\.orders)\.item\./, (id) => {
    const seg = id.split(".")[3] ?? "";
    if (shown.some((o) => aiSeg(o.id) === seg) || !orders.some((o) => aiSeg(o.id) === seg)) return;
    resetFilters();
  });
  useAiReveal(new RegExp(`^${ai.replace(/\./g, "\\.")}\\.tab\\.([a-z]+)$`), (id) => {
    const next = tabOf(id.slice(id.lastIndexOf(".") + 1));
    if (next) setTab(next);
  });

  const fields: FilterField[] = [
    {
      key: "status",
      label: t("filterStatus"),
      icon: IconClipboardCheck,
      value: tab === "all" ? "" : tab,
      onChange: (v) => setTab(tabOf(v) ?? "all"),
      options: tabs.map((k) => ({ value: k === "all" ? "" : k, label: `${t(`tabs.${k}`)} (${counts[k]})` })),
      aiId: `${ai}.tabs`,
    },
  ];

  const patch = (id: string, next: Partial<MarketOrder>) => setOrders((cur) => cur.map((o) => (o.id === id ? { ...o, ...next, canCancel: false, canComplete: false } : o)));

  return (
    <section className="mk mk-orders">
      <header className="mk-orders__head">
        <div>
          <h1 className="mk-orders__t">{view === "client" ? t("clientTitle") : t("sellerTitle")}</h1>
          <p className="mk-orders__l">{view === "client" ? t("clientLead") : t("sellerLead")}</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          {view === "seller" ? (
            <CopilotLauncher surface="lawyer_work_queue" context={{ label: t("sellerTitle"), status_filter: tab, count: status === "ready" ? shown.length : undefined }} />
          ) : null}
          <button type="button" className="btn btn--line btn--sm" onClick={() => void load(true)} disabled={refreshing || status === "loading"}>
            <IconRefresh className={refreshing ? "mk-spin" : undefined} />
            {t("refresh")}
          </button>
        </div>
      </header>

      {flash ? (
        <div className="mk-flash" role="status">
          <IconCheck />
          {flash}
        </div>
      ) : null}

      <FilterBar
        fields={fields}
        search={{
          value: q,
          onChange: (v) => setQ(v.slice(0, SEARCH_MAX)),
          placeholder: view === "client" ? t("searchPhClient") : t("searchPhSeller"),
          label: t("searchLabel"),
          maxLength: SEARCH_MAX,
          aiId: `${ai}.search`,
          aiLabel: t("searchLabel"),
        }}
        count={status === "ready" ? shown.length : undefined}
        onReset={resetFilters}
        aiId={`${ai}.filters`}
        aiTarget="orders:filters"
        aiLabel={tf("title")}
      />

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
        <div className="mk-empty" data-ai-target={view === "client" ? "client:marketplace-orders" : "seller:marketplace-orders"} data-ai-id={`${ai}.list`} data-ai-type="list">
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
        <div className="mk-empty mk-empty--flat" data-ai-target={view === "client" ? "client:marketplace-orders" : "seller:marketplace-orders"} data-ai-id={`${ai}.list`} data-ai-type="list">
          <span>{t("emptyFilter")}</span>
        </div>
      ) : (
        <div
          className={`mk-olist${refreshing ? " is-busy" : ""}`}
          data-ai-target={view === "client" ? "client:marketplace-orders" : "seller:marketplace-orders"}
          data-ai-id={`${ai}.list`}
          data-ai-type="list"
          data-ai-label={view === "client" ? t("clientTitle") : t("sellerTitle")}
        >
          {shown.map((o) => (
            <OrderCard
              key={o.id}
              o={o}
              view={view}
              locale={locale}
              listHref={pathname}
              onCancel={() => setCancelFor(o)}
              onComplete={() => setCompleteFor(o)}
              onSupplemental={() => setSupFor(o)}
              onRated={() => void load(true)}
            />
          ))}
        </div>
      )}

      <ActionDialog
        aiId={`${ai}.cancel-modal`}
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
          const r = await cancelMarketplaceOrder(o.id, text, o.urls.cancel);
          patch(o.id, { status: r.status, paymentStatus: r.paymentStatus });
          setFlash(t("updated"));
          void load(true);
        }}
      />
      <CompleteOrderDialog
        order={completeFor}
        detailHref={completeFor ? orderDetailHref(pathname, completeFor.id) : undefined}
        onClose={() => setCompleteFor(null)}
        onDone={(st) => {
          if (completeFor) patch(completeFor.id, { status: st });
          setFlash(t("updated"));
          void load(true);
        }}
      />
      <SupplementalDialog
        order={supFor}
        onClose={() => setSupFor(null)}
        onSent={(s) => {
          if (supFor && s) setOrders((cur) => cur.map((x) => (x.id === supFor.id ? { ...x, supplemental: s, workPaused: s.status === "pending" } : x)));
          setFlash(t("supplementalSent"));
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
  listHref,
  onCancel,
  onComplete,
  onSupplemental,
  onRated,
}: {
  o: MarketOrder;
  view: View;
  locale: string;
  listHref: string;
  onCancel: () => void;
  onComplete: () => void;
  onSupplemental: () => void;
  onRated: () => void;
}) {
  const t = useTranslations("marketplace.orders");
  const tod = useTranslations("marketplace.orderDetail.card");
  const tph = useTranslations("marketplace.orderDetail.phase");
  const tch = useTranslations("marketplace.purchase.channels");
  const tpk = useTranslations("portal.client.packages");
  const te = useTranslations("enums");
  const speedText = useContactSpeedText();
  const router = useRouter();
  const stage = marketStageOf(o);
  const phase = marketPhaseOf(o);
  const dealOpen = phase === "pending" && !!o.negotiation && DEAL_OPEN.test(o.negotiation.status);
  const dealAmount = o.negotiation ? dealOf(o.negotiation) : 0;
  // Still with the seller to take: not a payment wait, and for the seller
  // it is a new request to answer.
  const awaiting = awaitingSeller(o);
  const stageLabel = awaiting ? (view === "seller" ? t("awaitingSeller") : t("awaitingClient")) : phase === "paid" ? tph("paid") : t(`stage.${stage}`);
  const currency = !o.currency || o.currency === "UZS" ? te("currency") : o.currency;
  const [calling, setCalling] = useState<"" | "audio" | "video">("");
  const [callErr, setCallErr] = useState("");
  const counterpart = view === "client" ? o.lawyerName : o.clientName;
  const counterpartId = view === "client" ? o.lawyerUserId : o.clientUserId;
  const phoneShow = clientPhoneShow(o);
  const chatHref = marketChatHref(o);
  const contact = view === "client" && o.canStartChat;
  const speed = speedText(o);
  const stepAt = STEP_INDEX[stage];
  const item = o.id ? aiId(`${aiBaseOf(view)}.item`, o.id) : undefined;
  const sub = (s: string) => (item ? `${item}.${s}` : undefined);

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
    <article
      className={`mk-order mk-order--${stage}`}
      data-ai-target={o.id ? `orders.item.${o.id}` : undefined}
      data-ai-id={item}
      data-ai-type="card"
      data-ai-entity-type="marketplace_order"
      data-ai-entity-id={o.id || undefined}
      data-ai-label={[o.serviceTitle, stageLabel].filter(Boolean).join(" · ")}
      data-ai-private
    >
      <div className="mk-order__rail" aria-hidden="true" />
      <div className="mk-order__main">
        <div className="mk-order__top">
          <div className="mk-order__id">
            {o.workId ? <span className="wid">{o.workId}</span> : null}
            <span className={`mk-stage mk-stage--${stage}`}>
              {stage === "pending" ? <i aria-hidden="true" /> : null}
              {stageLabel}
            </span>
            {o.workPaused ? (
              <span className="mk-stage mk-stage--paused">
                <IconPause aria-hidden="true" />
                {t("paused")}
              </span>
            ) : null}
            {phase === "review" ? (
              <span className="mk-stage mk-stage--paused mod-card-chip">
                <IconPause aria-hidden="true" />
                {tod("review")}
              </span>
            ) : null}
            {phase === "in_progress" && o.expectedCompletedAt ? (
              <span className="mk-stage mod-card-chip mod-card-chip--due">
                <IconClock aria-hidden="true" />
                {tod("due", { date: shortDateTime(o.expectedCompletedAt, locale) })}
              </span>
            ) : null}
            {dealOpen && dealAmount > 0 ? (
              <span className="mk-stage mod-card-chip mod-card-chip--deal">
                <IconCoins aria-hidden="true" />
                {tod("negotiation", { amount: `${fmtUzs(dealAmount)} ${currency}` })}
              </span>
            ) : null}
          </div>
          <b className="mk-order__price">
            {o.price ? fmtUzs(o.price) : "—"} <small>{o.currency === "UZS" ? te("currency") : o.currency}</small>
          </b>
        </div>

        <h3 className="mk-order__svc">{o.serviceTitle || o.packageTitle || "—"}</h3>
        {o.packageTitle || o.packageTier ? (
          <span className="mko__pkg">
            <IconPackage aria-hidden="true" />
            {[o.packageTitle, o.packageTier && tpk.has(`tiers.${o.packageTier}`) ? tpk(`tiers.${o.packageTier}`) : o.packageTier].filter(Boolean).join(" · ")}
          </span>
        ) : null}
        <OptionLines options={o.selectedOptions} title={t("optionsTitle")} />

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
              <dd>{phoneShow === "show" ? <a href={telHref(o.clientPhone)}>{o.clientPhone}</a> : <span className="mk-muted">{phoneShow === "none" ? "—" : phoneShow === "hidden" ? t("phoneConcealed") : t("phoneHidden")}</span>}</dd>
            </div>
          ) : null}
          {o.preferredChannel ? (
            <div>
              <dt>{t("channel")}</dt>
              <dd>{tch.has(o.preferredChannel) ? tch(o.preferredChannel) : o.preferredChannel}</dd>
            </div>
          ) : null}
          {speed ? (
            <div>
              <dt>{t("contactSpeed")}</dt>
              <dd>
                <IconClock />
                {speed}
              </dd>
            </div>
          ) : null}
          {o.preferredTime && !speed ? (
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

        <SupplementalPanel o={o} view={view} />
        {stage === "completed" ? <ResultBlock o={o} /> : null}
        {stage === "completed" && view === "client" ? <RatingPanel o={o} onRated={onRated} /> : null}

        {callErr ? <Notice ok={false} msg={callErr} /> : null}

        <div className="mk-order__acts">
          {contact ? (
            <ContactAdvocate tone="site" size="sm" chatHref={chatHref} roomId={o.roomId} callTitle={o.serviceTitle || o.workId || "LexGo"} counterpartId={counterpartId} calls={stage === "cancelled" || stage === "completed" ? "closed" : callStateOf(o)} callTypes={o.callTypes} aiId={sub("contact") ?? "marketplace.orders.item.contact"} chatAiId={sub("chat")} />
          ) : o.canStartChat ? (
            <Link href={chatHref} className="btn btn--pri btn--sm" data-ai-id={sub("chat")} data-ai-label={t("openChat")}>
              <IconChat />
              {t("openChat")}
            </Link>
          ) : null}
          {!contact && o.canCreateCall && o.callsAllowed && stage !== "cancelled" && stage !== "completed" ? (
            <span className="mk-callgrp" role="group" aria-label={t("call")} data-ai-id={sub("call")} data-ai-type="call_button" data-ai-label={t("call")}>
              {o.callTypes.includes("audio") ? (
                <button type="button" className="btn btn--line btn--sm" disabled={!!calling} onClick={() => void call("audio")}>
                  <IconPhone />
                  {calling === "audio" ? t("calling") : t("audio")}
                </button>
              ) : null}
              {o.callTypes.includes("video") ? (
                <button type="button" className="btn btn--line btn--sm" disabled={!!calling} onClick={() => void call("video")}>
                  <IconVideo />
                  {calling === "video" ? t("calling") : t("video")}
                </button>
              ) : null}
            </span>
          ) : null}
          {view === "seller" && stage === "active" && !o.workPaused && (o.serviceId || o.packageId) ? (
            <button type="button" className="btn btn--line btn--sm" onClick={onSupplemental} data-ai-id={sub("supplemental")} data-ai-label={t("supplemental")}>
              <IconCoins />
              {t("supplemental")}
            </button>
          ) : null}
          {view === "seller" && o.canComplete && stage === "active" && !(phase === "paid" && o.canStart) ? (
            <button type="button" className="btn btn--grad btn--sm" disabled={o.workPaused} title={o.workPaused ? t("pausedHint") : undefined} onClick={onComplete} data-ai-id={sub("complete")} data-ai-label={t("complete")}>
              <IconCheck />
              {t("complete")}
            </button>
          ) : null}
          {view === "client" && o.canCancel && stage === "pending" ? (
            <button type="button" className="btn btn--line btn--sm mk-danger" onClick={onCancel} data-ai-id={sub("cancel")} data-ai-label={t("cancel")}>
              <IconClose />
              {t("cancel")}
            </button>
          ) : null}
          {o.id ? (
            <Link href={orderDetailHref(listHref, o.id)} className="btn btn--line btn--sm mod-card-detail" aria-label={o.serviceTitle || o.packageTitle || o.workId ? tod("detailNamed", { service: o.serviceTitle || o.packageTitle || o.workId }) : undefined} data-ai-id={sub("detail")} data-ai-label={tod("detail")}>
              {tod("detail")}
              <IconArrowRight aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ActionDialog({
  aiId: modalAiId,
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
  aiId: string;
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
  const once = useSameTickGuard();
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
    if (busy || !once()) return;
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
      <div className="mk-act" data-ai-id={modalAiId} data-ai-type="modal" data-ai-label={title} data-ai-private>
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
