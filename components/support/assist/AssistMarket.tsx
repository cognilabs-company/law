"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtRating } from "@/lib/date";
import { humanize } from "@/lib/labels";
import { initials } from "@/lib/lawyers";
import { aiId } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import { getMarketplaceSellerServices, type MarketSeller, type MarketService } from "@/lib/services/marketplace";
import {
  ASSIST_CHANNELS,
  createAssistMarketplaceRequest,
  loadAssistSellers,
  mergeAssistLive,
  orderPayPhase,
  payPhaseOf,
  pickPayPhase,
  searchAssistSellers,
  sellerMatches,
  type AssistChannel,
  type AssistLive,
  type AssistMarketResult,
  type AssistPayPhase,
} from "@/lib/services/supportAssist";
import { IconRefresh, IconSearch } from "@/components/icons";
import { ConfirmModal, PayState, ResultCard, StatusChip, assistErrorText, clientLine, sumText, useAssistLive, type AssistSectionProps, type InfoRow } from "./bits";

type Sellers = { status: "loading" | "ready" | "error"; items: MarketSeller[]; total: number };
type Services = { userId: string; status: "ready" | "error"; items: MarketService[] };

const NOTE_MAX = 1000;
const TIME_MAX = 120;

export default function AssistMarket({ ticketId, client, clientName, ctx, onDone, onBlock }: AssistSectionProps) {
  const t = useTranslations("support.assist");
  const tc = useTranslations("common");
  const ts = useTranslations("support");
  const locale = useLocale();
  const [sellers, setSellers] = useState<Sellers>({ status: "loading", items: [], total: 0 });
  const [sellerTick, setSellerTick] = useState(0);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<{ q: string; items: MarketSeller[] } | null>(null);
  const [seller, setSeller] = useState<MarketSeller | null>(null);
  const [services, setServices] = useState<Services | null>(null);
  const [serviceTick, setServiceTick] = useState(0);
  const [serviceId, setServiceId] = useState("");
  const [channel, setChannel] = useState<AssistChannel>("chat");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<AssistMarketResult | null>(null);
  const [live, setLive] = useState<AssistLive | null>(null);
  const inflight = useRef(false);

  useAssistLive(sent ? [sent.orderId, sent.workId, sent.paymentId, sent.requestId] : [], (e) => setLive((cur) => mergeAssistLive(cur, e)));

  useEffect(() => {
    let alive = true;
    loadAssistSellers()
      .then((r) => {
        if (alive) setSellers({ status: "ready", items: r.items, total: r.total });
      })
      .catch(() => {
        if (alive) setSellers({ status: "error", items: [], total: 0 });
      });
    return () => {
      alive = false;
    };
  }, [sellerTick]);

  const term = q.trim();
  const needRemote = !seller && term.length >= 2 && sellers.status === "ready" && sellers.total > sellers.items.length;

  useEffect(() => {
    if (!needRemote) return;
    const c = new AbortController();
    const timer = window.setTimeout(() => {
      searchAssistSellers(term, c.signal)
        .then((items) => {
          if (!c.signal.aborted) setRemote({ q: term, items });
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      c.abort();
      window.clearTimeout(timer);
    };
  }, [needRemote, term]);

  const shown = useMemo(() => {
    const local = term ? sellers.items.filter((s) => sellerMatches(s, term)) : sellers.items;
    const extra = remote && remote.q === term ? remote.items : [];
    const seen = new Set<string>();
    return [...local, ...extra].filter((s) => s.userId && !seen.has(s.userId) && (seen.add(s.userId), true));
  }, [sellers.items, remote, term]);

  const sellerId = seller?.userId ?? "";

  useEffect(() => {
    if (!sellerId) return;
    let alive = true;
    getMarketplaceSellerServices(sellerId)
      .then((items) => {
        if (alive) setServices({ userId: sellerId, status: "ready", items });
      })
      .catch(() => {
        if (alive) setServices({ userId: sellerId, status: "error", items: [] });
      });
    return () => {
      alive = false;
    };
  }, [sellerId, serviceTick]);

  const ai = (...parts: string[]) => aiId("call_center.support.ticket", ticketId, "assist", "marketplace", ...parts);

  useAiField(ai("search"), {
    get: () => (seller ? "" : q),
    set: (value) => setQ(value.slice(0, 120)),
    fillable: true,
    disabled: Boolean(seller) || sellers.status !== "ready" || busy,
  });

  const svc = services && services.userId === sellerId ? services : null;
  const svcItems = svc?.status === "ready" ? svc.items : (seller?.services ?? []);
  const svcFailed = svc?.status === "error" && !svcItems.length;
  const svcLoading = Boolean(seller) && !svc && !svcItems.length;
  const service = svcItems.find((s) => s.id === serviceId) ?? (svcItems.length === 1 ? svcItems[0] : null);

  const typeLabel = (s: MarketSeller) => (s.sellerType ? (ts.has(`roles.${s.sellerType}`) ? ts(`roles.${s.sellerType}`) : humanize(s.sellerType)) : "");
  const sellerMeta = (s: MarketSeller) =>
    [
      typeLabel(s),
      s.rated && s.rating > 0 ? `★ ${fmtRating(s.rating, locale)}` : "",
      s.servicesCount ? t("market.servicesCount", { n: s.servicesCount }) : "",
      s.priceFrom ? t("market.priceFrom", { amount: sumText(t, s.priceFrom) }) : "",
    ]
      .filter(Boolean)
      .join(" · ");

  function pickSeller(s: MarketSeller) {
    setSeller(s);
    setServiceId("");
    setErr("");
  }

  function review() {
    if (busy) return;
    if (!seller) {
      setErr(t("market.sellerRequired"));
      return;
    }
    if (!service) {
      setErr(t("market.serviceRequired"));
      return;
    }
    setErr("");
    setConfirmErr("");
    setConfirming(true);
  }

  async function submit() {
    if (!seller || !service || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setConfirmErr("");
    setSent(null);
    try {
      const r = await createAssistMarketplaceRequest(ticketId, {
        lawyerUserId: seller.userId,
        serviceId: service.id,
        note,
        preferredChannel: channel,
        preferredTime: time,
      });
      setSent({ ...r, serviceTitle: r.serviceTitle || service.title, lawyerName: r.lawyerName || seller.name, amount: r.amount || service.price });
      setLive(null);
      setConfirming(false);
      setSeller(null);
      setServiceId("");
      setQ("");
      setNote("");
      setTime("");
      setChannel("chat");
      onDone();
    } catch (e) {
      if (onBlock(e)) setConfirming(false);
      else setConfirmErr(assistErrorText(e, t, tc));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const confirmRows: InfoRow[] =
    seller && service
      ? [
          { key: "client", label: t("confirm.client"), value: clientLine(t, client, clientName) },
          { key: "seller", label: t("market.seller"), value: [seller.name, typeLabel(seller)].filter(Boolean).join(" · ") },
          { key: "service", label: t("market.service"), value: service.title },
          { key: "price", label: t("market.price"), value: sumText(t, service.price, service.currency) },
          { key: "channel", label: t("market.channel"), value: t(`market.channels.${channel}`) },
          ...(time.trim() ? [{ key: "time", label: t("market.time"), value: time.trim() }] : []),
          ...(note.trim() ? [{ key: "note", label: t("market.note"), value: note.trim() }] : []),
        ]
      : [];

  const ctxOrder = sent ? ctx.recentOrders.find((o) => (sent.orderId && o.id === sent.orderId) || (sent.workId && o.workId === sent.workId)) : undefined;
  const basePhase: AssistPayPhase = sent ? sent.gate?.phase || orderPayPhase(sent.orderStatus, sent.paymentStatus) || payPhaseOf(sent.status) : "";
  const ctxPhase: AssistPayPhase = ctxOrder ? orderPayPhase(ctxOrder.status, ctxOrder.paymentStatus) : "";
  const phase: AssistPayPhase = sent ? pickPayPhase(live?.phase ?? "", ctxPhase, basePhase) : "";
  const telegramSent = live?.telegramSent ?? sent?.telegramSent ?? false;

  const sentRows: InfoRow[] = sent
    ? [
        { key: "work", label: t("result.workId"), value: sent.workId ? <span className="sasst__wid">{sent.workId}</span> : "—" },
        ...(sent.serviceTitle ? [{ key: "service", label: t("market.service"), value: sent.serviceTitle }] : []),
        ...(sent.lawyerName ? [{ key: "seller", label: t("market.seller"), value: sent.lawyerName }] : []),
        ...(!phase && sent.amount > 0 ? [{ key: "amount", label: t("result.amount"), value: sumText(t, sent.amount, sent.currency) }] : []),
        ...(!phase ? [{ key: "status", label: t("result.status"), value: <StatusChip status={sent.status} /> }] : []),
        { key: "tg", label: t("result.telegram"), value: telegramSent ? t("result.telegramSent") : t("result.telegramFailed") },
        ...(sent.nextStatus && phase !== "paid" && phase !== "rejected"
          ? [{ key: "next", label: t("result.next"), value: t.has(`market.nextStatus.${sent.nextStatus}`) ? t(`market.nextStatus.${sent.nextStatus}`) : humanize(sent.nextStatus) }]
          : []),
      ]
    : [];

  return (
    <div className="sasst__secin">
      <h4 className="sasst__h4">{t("market.heading")}</h4>
      <p className="sasst__lead">{t("market.lead")}</p>
      {sent ? (
        <ResultCard
          title={t("market.sentTitle")}
          rows={sentRows}
          note={phase === "paid" ? t("pay.marketPaid") : phase === "rejected" ? t("pay.rejectedNote") : sent.sellerAfterPayment ? t("market.afterPayment") : undefined}
          warn={!telegramSent || phase === "rejected"}
          onDismiss={() => setSent(null)}
        >
          <PayState phase={phase} amount={sent.gate?.amount || sent.amount} currency={sent.gate?.currency || sent.currency} />
        </ResultCard>
      ) : null}

      <div className="sasst__f">
        <span className="sasst__lbl">{t("market.seller")}</span>
        {seller ? (
          <div className="sasst__chosen">
            <span className="sasst__oav" aria-hidden="true">
              {initials(seller.name || "?")}
            </span>
            <span>
              <b>{seller.name}</b>
              <small>{sellerMeta(seller)}</small>
            </span>
            <button type="button" className="sasst__link" onClick={() => setSeller(null)} disabled={busy}>
              {t("market.change")}
            </button>
          </div>
        ) : sellers.status === "loading" ? (
          <p className="sasst__muted">{t("market.sellersLoading")}</p>
        ) : sellers.status === "error" ? (
          <div className="sasst__errbox">
            <p className="sasst__err">{t("market.sellersError")}</p>
            <button
              type="button"
              className="btn btn--line btn--sm"
              onClick={() => {
                setSellers({ status: "loading", items: [], total: 0 });
                setSellerTick((n) => n + 1);
              }}
            >
              <IconRefresh />
              {tc("retry")}
            </button>
          </div>
        ) : (
          <>
            <label className="sasst__search">
              <IconSearch aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("market.sellerPh")} aria-label={t("market.sellerPh")} maxLength={120} data-ai-id={ai("search")} />
            </label>
            {shown.length ? (
              <ul className="sasst__pick" aria-label={t("market.seller")}>
                {shown.map((s) => (
                  <li key={s.userId}>
                    <button type="button" className="sasst__opt" onClick={() => pickSeller(s)}>
                      <span className="sasst__oav" aria-hidden="true">
                        {initials(s.name || "?")}
                      </span>
                      <span>
                        <b>{s.name}</b>
                        <small>{sellerMeta(s)}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sasst__muted">{t("market.noSellers")}</p>
            )}
          </>
        )}
      </div>

      {seller ? (
        <div className="sasst__f">
          <span className="sasst__lbl">{t("market.service")}</span>
          {svcLoading ? (
            <p className="sasst__muted">{t("market.servicesLoading")}</p>
          ) : svcFailed ? (
            <div className="sasst__errbox">
              <p className="sasst__err">{t("market.servicesError")}</p>
              <button
                type="button"
                className="btn btn--line btn--sm"
                onClick={() => {
                  setServices(null);
                  setServiceTick((n) => n + 1);
                }}
              >
                <IconRefresh />
                {tc("retry")}
              </button>
            </div>
          ) : !svcItems.length ? (
            <p className="sasst__muted">{t("market.noServices")}</p>
          ) : (
            <ul className="sasst__pick" aria-label={t("market.service")}>
              {svcItems.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="sasst__opt"
                    aria-pressed={service?.id === s.id}
                    onClick={() => {
                      setServiceId(s.id);
                      setErr("");
                    }}
                  >
                    <span>
                      <b>{s.title}</b>
                      {s.categoryTitle ? <small>{s.categoryTitle}</small> : null}
                    </span>
                    <em>{sumText(t, s.price, s.currency)}</em>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="sasst__f">
        <span className="sasst__lbl">{t("market.channel")}</span>
        <div className="sasst__chips" role="group" aria-label={t("market.channel")}>
          {ASSIST_CHANNELS.map((c) => (
            <button key={c} type="button" className="supchip" aria-pressed={channel === c} onClick={() => setChannel(c)}>
              {t(`market.channels.${c}`)}
            </button>
          ))}
        </div>
      </div>

      <label className="sasst__f" data-ai-private>
        <span className="sasst__lbl">{t("market.time")}</span>
        <input value={time} onChange={(e) => setTime(e.target.value)} placeholder={t("market.timePh")} maxLength={TIME_MAX} />
      </label>

      <label className="sasst__f" data-ai-private>
        <span className="sasst__lbl">{t("market.note")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("market.notePh")} maxLength={NOTE_MAX} rows={3} />
        <em>
          {note.length}/{NOTE_MAX}
        </em>
      </label>

      {err ? (
        <p className="sasst__err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="sasst__acts">
        <button type="button" className="btn btn--grad btn--sm" onClick={review} disabled={busy} data-ai-id={ai("next")}>
          {t("market.next")}
        </button>
      </div>

      <ConfirmModal
        open={confirming && Boolean(seller && service)}
        title={t("market.confirmTitle")}
        rows={confirmRows}
        note={t("market.confirmNote")}
        busy={busy}
        error={confirmErr}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void submit()}
        aiId={ai("confirm-modal")}
      />
    </div>
  );
}
