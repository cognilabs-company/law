"use client";

import "@/components/admin/studio/sx/sx-core.css";
import "./order.css";
import { useEffect, useMemo, useRef, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { SxEmpty } from "@/components/admin/studio/sx/layout/Empty";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import { normMarketOrder, type MarketOrder, type MarketPhase } from "@/lib/services/marketplace";
import { normOrderChecklist, type OrderStart } from "@/lib/services/marketRuntime";
import { ComplaintPanel, RatingPanel, ResultBlock, SupplementalPanel } from "../OrderExtras";
import CancellationRequest from "./CancellationRequest";
import NegotiationPanel from "./NegotiationPanel";
import { useNotedNegotiation } from "./negotiationStore";
import OrderActions from "./OrderActions";
import OrderChecklist from "./OrderChecklist";
import OrderDocuments from "./OrderDocuments";
import OrderFacts from "./OrderFacts";
import OrderPricing from "./OrderPricing";
import OrderRules from "./OrderRules";
import OrderHeader from "./OrderHeader";
import SecondOpinion from "./SecondOpinion";
import StartWork from "./StartWork";
import StayInLexGo from "./StayInLexGo";
import { ArrowLeftIcon, RefreshCwIcon, ClipboardListIcon, SearchIcon, SxIconScope, CircleAlertIcon } from "./icons";
import { SECTION_ID, orderAiBase, type OrderSectionProps, type OrderView } from "./types";
import { useOrderDetail, type OrderDetail } from "./useOrderDetail";

function focusSection(id: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(id);
  if (!el) return false;
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
  return true;
}

function hashTarget(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hash.replace(/^#/, "");
  return (Object.values(SECTION_ID) as string[]).includes(h) ? h : "";
}

function Skeleton({ label }: { label: string }): ReactElement {
  return (
    <div className="mod-sk" aria-busy="true">
      <p className="sx-vh" role="status">
        {label}
      </p>
      <div className="mod-sk__head" aria-hidden="true">
        <span className="sx-sk mod-sk__line" data-w="30" />
        <span className="sx-sk mod-sk__line" data-w="60" data-h="lg" />
        <span className="sx-sk mod-sk__rail" />
      </div>
      <div className="mod__grid" aria-hidden="true">
        <div className="mod__main">
          <span className="sx-sk mod-sk__panel" />
          <span className="sx-sk mod-sk__panel" />
        </div>
        <div className="mod-sk__aside">
          <span className="sx-sk mod-sk__panel" data-h="sm" />
        </div>
      </div>
    </div>
  );
}

function Sections({ d, o, phase, view, aiBase, listHref, preview }: { d: OrderDetail; o: MarketOrder; phase: MarketPhase; view: OrderView; aiBase: string; listHref: string; preview: boolean }): ReactElement {
  const to = useTranslations("marketplace.orders");
  const t = useTranslations("marketplace.orderDetail");
  const client = view === "client";
  const section: OrderSectionProps = { o, phase, view, aiBase, runtime: d.runtime, onChanged: (patch) => d.patchOrder(patch ?? {}) };
  const checklist = <OrderChecklist key="checklist" o={o} phase={phase} view={view} aiBase={aiBase} checklist={d.checklist} state={d.checklistState} onChange={d.setChecklist} onRetry={() => d.refresh("checklist")} />;
  const documents = <OrderDocuments key="documents" o={o} phase={phase} view={view} aiBase={aiBase} runtime={d.runtime} listHref={listHref} />;
  // A preview has no real order to fetch an offer or log a view against.
  const opinion = client && !preview ? <SecondOpinion key="opinion" o={o} phase={phase} aiBase={aiBase} opinion={d.opinion} state={d.opinionState} onRetry={() => d.refresh("opinion")} onOrderStale={() => d.refresh("order")} /> : null;
  const cancel = <CancellationRequest key="cancel" {...section} lastSignal={d.lastSignal} />;
  const supplemental = <SupplementalPanel key="supplemental" o={o} view={view} />;
  const retain = client ? <StayInLexGo key="retain" phase={phase} runtime={d.runtime} aiBase={aiBase} /> : null;
  const onStarted = (r: OrderStart) => {
    d.patchOrder({
      status: r.status || "in_progress",
      startedAt: r.startedAt,
      expectedCompletedAt: r.expectedCompletedAt,
      duration: r.duration.value > 0 ? r.duration : o.duration,
      roomId: r.chat?.roomId || o.roomId,
      canStartChat: !!(r.chat?.roomId || o.roomId),
      chatReadOnly: r.chat?.readOnly ?? false,
      canStart: false,
    });
    if (r.checklist.length) d.setChecklist(normOrderChecklist(r.raw, o.id));
    d.refresh("all");
  };
  const start = !client ? <StartWork key="start" o={o} aiBase={aiBase} runtime={d.runtime} onStarted={onStarted} onRefresh={() => d.refresh("order")} /> : null;

  let parts: ReactNode[] = [];
  if (phase === "pending") {
    parts = [
      <NegotiationPanel key="negotiation" {...section} />,
      client ? (
        <SxNote key="wait" tone="info">
          {to("waitNote")}
        </SxNote>
      ) : null,
      documents,
    ];
  } else if (phase === "paid") {
    parts = [
      start,
      client ? (
        <SxNote key="wait" tone="info">
          {t("start.waitClient")}
        </SxNote>
      ) : null,
      documents,
      supplemental,
      retain,
      !client || o.canRequestCancellation ? cancel : null,
    ];
  } else if (phase === "in_progress") {
    parts = [start, checklist, documents, supplemental, opinion, retain, !client || o.canRequestCancellation ? cancel : null];
  } else if (phase === "review") {
    parts = [cancel, checklist, documents, opinion, retain];
  } else if (phase === "completed" || phase === "rated") {
    parts = [
      <section key="result" id={SECTION_ID.result} tabIndex={-1} className="mod-sec mod-sec--legacy">
        <ResultBlock o={o} />
      </section>,
      client ? (
        <section key="rating" id={SECTION_ID.rating} tabIndex={-1} className="mod-sec mod-sec--legacy">
          <RatingPanel o={o} onRated={() => d.refresh("order")} />
          <ComplaintPanel o={o} onFiled={() => d.refresh("order")} />
        </section>
      ) : null,
      checklist,
      opinion,
      documents,
      cancel,
    ];
  } else {
    parts = [
      cancel,
      client ? (
        <div key="find" className="mod-find">
          <SxLinkButton variant="secondary" icon={SearchIcon} href="/portal/client/lawyers" aiId={`${aiBase}.find-other`}>
            {t("cancelledFind")}
          </SxLinkButton>
        </div>
      ) : null,
    ];
  }
  return <div className="mod__main">{parts}</div>;
}

export default function OrderDetailPage({ orderId, view, listHref }: { orderId: string; view: OrderView; listHref: string }): ReactElement {
  const d = useOrderDetail(orderId, view);
  const owner = useAuth().session?.id ?? "";
  const noted = useNotedNegotiation(orderId, owner);
  return <OrderDetailView orderId={orderId} view={view} listHref={listHref} d={d} noted={noted} />;
}

// The page itself, drawn from an order's loaded state. The Studio preview
// hands it a draft's state, so a service is checked on the very page its
// client and its lawyer will work on.
export function OrderDetailView({
  orderId,
  view,
  listHref,
  d,
  noted = null,
  preview = false,
}: {
  orderId: string;
  view: OrderView;
  listHref: string;
  d: OrderDetail;
  noted?: ReturnType<typeof useNotedNegotiation>;
  preview?: boolean;
}): ReactElement {
  const t = useTranslations("marketplace.orderDetail");
  const aiBase = orderAiBase(view);
  const phase = d.phase;
  const o = d.order;
  const title = o?.serviceTitle || o?.packageTitle || "";
  const hashDone = useRef(false);
  const placeholder = useMemo(
    () => (view === "seller" && noted ? normMarketOrder({ id: orderId, status: "pending_payment", payment_status: "pending", price: noted.raw.current_price ?? noted.raw.order_price ?? 0, negotiation: noted.raw }) : null),
    [view, noted, orderId],
  );

  const ready = d.status === "ready" && !!o && !!phase;
  const work = phase === "in_progress" || phase === "review" || phase === "completed" || phase === "rated";
  const sectionsSettled = d.checklistState !== "loading" && d.opinionState !== "loading" && !(work && d.checklistState === "idle") && !(work && view === "client" && d.opinionState === "idle");

  useEffect(() => {
    hashDone.current = false;
  }, [orderId]);

  useEffect(() => {
    if (!ready || hashDone.current) return;
    const id = hashTarget();
    if (!id) {
      hashDone.current = true;
      return;
    }
    if (!d.fresh || !sectionsSettled) return;
    focusSection(id);
    hashDone.current = true;
  }, [ready, sectionsSettled, d.fresh, d.checklistState, d.opinionState, phase]);

  useEffect(() => {
    const onHash = () => {
      const id = hashTarget();
      if (id) focusSection(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  let body: ReactNode;
  if (d.status === "loading" || (d.status === "ready" && !o)) {
    body = <Skeleton label={t("loading")} />;
  } else if (d.status === "missing") {
    if (placeholder) {
      body = (
        <>
          <div className="mod-head mod-head--reduced">
            <div className="mod-head__bar">
              <SxLinkButton variant="ghost" size="sm" icon={ArrowLeftIcon} href={listHref} aiId={`${aiBase}.back`}>
                {t("backSeller")}
              </SxLinkButton>
            </div>
          </div>
          <SxNote tone="info">{t("missingNegotiation")}</SxNote>
          <NegotiationPanel o={placeholder} phase="pending" view={view} aiBase={aiBase} runtime={null} onChanged={() => d.refresh("order")} />
        </>
      );
    } else {
      body = (
        <div className="mod-empty">
          <SxEmpty
            icon={ClipboardListIcon}
            title={t("missingTitle")}
            text={view === "seller" ? t("missingSeller") : t("missingText")}
            action={
              <SxLinkButton variant="primary" icon={ArrowLeftIcon} href={listHref} aiId={`${aiBase}.back`}>
                {view === "client" ? t("backClient") : t("backSeller")}
              </SxLinkButton>
            }
          />
        </div>
      );
    }
  } else if (d.status === "error" || !o || !phase) {
    body = (
      <div className="mod-empty">
        <SxEmpty
          icon={CircleAlertIcon}
          tone="error"
          title={t("error")}
          action={
            <SxButton variant="primary" icon={RefreshCwIcon} onClick={() => d.refresh("all")} aiId={`${aiBase}.retry`}>
              {t("retry")}
            </SxButton>
          }
        />
      </div>
    );
  } else {
    body = (
      <>
        <OrderHeader o={o} phase={phase} view={view} aiBase={aiBase} listHref={listHref} runtime={d.runtime} refreshing={d.refreshing} onRefresh={() => d.refresh("all")} />
        <div className="mod__grid">
          <Sections d={d} o={o} phase={phase} view={view} aiBase={aiBase} listHref={listHref} preview={preview} />
          <aside className="mod__aside">
            <div className="mod__actions">
              <OrderActions o={o} phase={phase} view={view} aiBase={aiBase} listHref={listHref} checklist={d.checklist} onChanged={(patch) => d.patchOrder(patch ?? {})} onShowChecklist={() => {
                  d.refresh("checklist");
                  focusSection(SECTION_ID.checklist);
                }}
              />
            </div>
            <div className="mod__facts">
              <OrderFacts o={o} view={view} aiBase={aiBase} runtime={d.runtime} />
              {o.pricing ? <OrderPricing pricing={o.pricing} view={view} currency={o.currency} aiBase={aiBase} orderId={o.id} refreshKey={`${o.status}:${o.paymentStatus}:${d.changed}`} /> : null}
              <OrderRules view={view} runtime={d.runtime} aiBase={aiBase} />
            </div>
          </aside>
        </div>
      </>
    );
  }

  return (
    <SxIconScope>
      <div
        className="sx mod"
        data-view={view}
        data-phase={phase ?? "loading"}
        data-ai-id={aiBase}
        data-ai-type="section"
        data-ai-label={title || undefined}
        data-ai-entity-type="marketplace_order"
        data-ai-entity-id={orderId}
        data-ai-private
      >
        {body}
        <p className="sx-vh" role="status" aria-live="polite">
          {d.changed > 0 ? <span key={d.changed}>{t("updated")}</span> : null}
        </p>
      </div>
    </SxIconScope>
  );
}
