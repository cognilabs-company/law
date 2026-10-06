"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { IconAlert, IconChat, IconCheck, IconClock, IconClose, IconHourglass, IconPhone, IconRefresh, IconSend, IconUsers, IconVideo } from "@/components/icons";
import { ApiError, errDetail } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { setReturnTo } from "@/lib/returnTo";
import {
  PREFERRED_CHANNELS,
  activePurchaseOf,
  marketChatHref,
  phaseOfStatus,
  requestMarketplacePurchase,
  type ActivePurchase,
  type MarketPurchase,
  type MarketService,
  type MarketTrackPhase,
  type PreferredChannel,
} from "@/lib/services/marketplace";
import { useMarketOrderTracker } from "@/lib/useMarketOrderTracker";
import { deliveryLabel } from "./bits";
import { useAiField, useAiSelection } from "@/lib/ai/registry";

const CHANNEL_ICON = { chat: IconChat, audio: IconPhone, video: IconVideo, meeting: IconUsers } as const;
const NOTE_MAX = 1000;
const STEPS = ["request", "confirm", "chat"] as const;
const STEP_OF: Record<MarketTrackPhase, number> = { pending: 1, paid: 2, chat: 2, completed: 3, cancelled: 1 };
export const CLIENT_ORDERS_HREF = "/portal/client/marketplace-orders";

export default function PurchaseDialog({
  sellerUserId,
  sellerName,
  service,
  returnPath,
  onClose,
  onStale,
}: {
  sellerUserId: string;
  sellerName: string;
  service: MarketService | null;
  returnPath: string;
  onClose: () => void;
  onStale: (what: "seller" | "service") => void;
}) {
  const t = useTranslations("marketplace.purchase");
  const tm = useTranslations("marketplace");
  const te = useTranslations("enums");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState<PreferredChannel>("chat");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<MarketPurchase | null>(null);
  const [active, setActive] = useState<ActivePurchase | null>(null);

  const key = service?.id ?? "";
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setNote("");
    setChannel("chat");
    setTime("");
    setErr("");
    setDone(null);
    setActive(null);
  }

  const aiForm = !!service && !done && !active;
  useAiField(aiForm ? "marketplace.purchase.channel" : "", {
    get: () => channel,
    set: (v) => {
      const w = v.trim().toLowerCase();
      const hit = PREFERRED_CHANNELS.find((c) => c === w || t(`channels.${c}`).toLowerCase() === w);
      if (hit) setChannel(hit);
    },
  });
  useAiField(aiForm ? "marketplace.purchase.note" : "", {
    get: () => note,
    set: (v) => setNote(v.slice(0, NOTE_MAX)),
    sensitive: true,
    fillable: true,
  });
  useAiField(aiForm ? "marketplace.purchase.time" : "", {
    get: () => time,
    set: (v) => setTime(v.slice(0, 120)),
  });
  useAiSelection(aiForm ? "preferred_channel" : "", channel);

  const tracked = done ?? active;
  const track = useMarketOrderTracker(service && tracked ? tracked.orderId : "", service && tracked ? tracked.workId : "", service && tracked ? tracked.status : "");

  if (!service) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const quick = [t("quick.today"), t("quick.evening"), t("quick.tomorrow"), t("quick.week")];
  const phase: MarketTrackPhase | null = tracked ? (track?.phase ?? phaseOfStatus(tracked.status)) : null;
  const step = phase ? STEP_OF[phase] : 0;
  const failed = phase === "cancelled";
  const slow = !!track && (track.slow || track.offline);
  const ended = !!track?.ended;
  const live = !!track && !slow && !ended && (phase === "pending" || phase === "paid");
  const isActive = !done && !!active;

  function retry() {
    setDone(null);
    setActive(null);
    setErr("");
  }

  async function submit() {
    if (busy || done || !service) return;
    if (note.length > NOTE_MAX) {
      setErr(t("noteTooLong"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await requestMarketplacePurchase(sellerUserId, service.id, { note, preferredChannel: channel, preferredTime: time });
      setDone(r);
    } catch (e) {
      const act = activePurchaseOf(e);
      if (act) {
        setActive(act);
      } else if (e instanceof ApiError && e.status === 401) {
        setReturnTo(returnPath);
        router.push("/login");
      } else if (e instanceof ApiError && e.status === 404) {
        const noService = /ko'rsatmaydi/i.test(e.detail || "");
        setErr(noService ? t("staleService") : t("staleSeller"));
        onStale(noService ? "service" : "seller");
      } else if (e instanceof ApiError && e.status === 422) {
        setErr(Object.values(e.fieldErrors)[0] || errDetail(e) || t("error"));
      } else {
        setErr(errDetail(e) || t("error"));
      }
    } finally {
      setBusy(false);
    }
  }

  const delivery = deliveryLabel(tm, service.deliveryMinutes);
  const chatHref = track?.roomId && tracked ? marketChatHref({ roomId: track.roomId, workId: tracked.workId, serviceTitle: service.title }) : "";

  const titles: Record<MarketTrackPhase, string> = {
    pending: isActive ? t("active") : t("sentTitle"),
    paid: isActive ? t("activePaid") : t("paidTitle"),
    chat: isActive ? t("activePaid") : t("chatTitle"),
    completed: t("completedTitle"),
    cancelled: t("rejectedTitle"),
  };
  const leads: Record<MarketTrackPhase, string> = {
    pending: track?.slow ? t("slow") : t("sentLead"),
    paid: track?.slow ? t("paidNoRoom") : "",
    chat: t("chatLead"),
    completed: "",
    cancelled: t("rejectedLead"),
  };
  const receiptTitle = phase ? titles[phase] : "";
  const receiptLead = phase ? leads[phase] : "";

  const ordersLink = (primary: boolean) => (
    <Link
      key="orders"
      href={CLIENT_ORDERS_HREF}
      className={`btn ${primary ? "btn--grad" : "btn--line"}`}
      data-ai-id={isActive ? "marketplace.purchase.active-order" : "marketplace.purchase.to-orders"}
    >
      {isActive ? t("activeOpen") : t("toOrders")}
    </Link>
  );
  const recheckButton = (primary: boolean) => (
    <button key="recheck" type="button" className={`btn ${primary ? "btn--grad" : "btn--line"}`} onClick={() => track?.recheck()} data-ai-id="marketplace.purchase.recheck">
      <IconRefresh />
      {t("recheck")}
    </button>
  );
  const closeButton = (
    <button key="close" type="button" className="btn btn--line" onClick={onClose}>
      {t("close")}
    </button>
  );

  const actions =
    phase === "chat" && chatHref
      ? [
          <Link key="chat" href={chatHref} className="btn btn--grad" data-ai-id="marketplace.purchase.open-chat" data-ai-label={t("openChat")}>
            <IconChat />
            {t("openChat")}
          </Link>,
          ordersLink(false),
        ]
      : phase === "cancelled"
        ? [
            <button key="retry" type="button" className="btn btn--grad" onClick={retry} data-ai-id="marketplace.purchase.retry">
              <IconSend />
              {t("retry")}
            </button>,
            closeButton,
          ]
        : ended
          ? [ordersLink(true)]
          : phase === "pending" && slow
            ? [recheckButton(true), ordersLink(false)]
            : phase === "paid" && slow
              ? [ordersLink(true), recheckButton(false)]
              : [ordersLink(true), closeButton];

  return (
    <Modal open onClose={onClose} title={t("title")}>
      <div className="mk-buy" data-ai-id="marketplace.purchase-modal" data-ai-type="modal" data-ai-label={t("title")} data-ai-entity-type="marketplace_service" data-ai-entity-id={service.id}>
        <ol className={`mk-steps${phase ? " mk-steps--calm" : ""}`} aria-label={t("title")}>
          {STEPS.map((s, i) => {
            const fail = failed && i === step;
            return (
              <li key={s} className={fail ? "is-fail" : i < step ? "is-done" : i === step ? "is-now" : ""} aria-current={i === step ? "step" : undefined}>
                <span>{fail ? <IconClose /> : i < step ? <IconCheck /> : i + 1}</span>
                {t(`steps.${s}`)}
              </li>
            );
          })}
        </ol>

        <div className="mk-buy__ticket">
          <div>
            <small>{t("seller")}</small>
            <b>{sellerName}</b>
            <p>{service.title}</p>
            {delivery ? (
              <span className="mk-buy__eta">
                <IconClock />
                {delivery}
              </span>
            ) : null}
          </div>
          <div className="mk-buy__sum">
            <small>{t("total")}</small>
            <b>{fmtUzs(done?.amount || service.price)}</b>
            <span>{service.currency === "UZS" ? te("currency") : service.currency}</span>
          </div>
        </div>

        {phase ? (
          <div
            className={`mk-receipt mk-receipt--${phase}${phase === "pending" && isActive ? " mk-receipt--warn" : ""}`}
            data-ai-id="marketplace.purchase.status"
            data-ai-type="section"
            data-ai-label={receiptTitle}
          >
            <div className="mk-receipt__msg" role="status">
              <div key={phase} className="mk-receipt__in">
                {phase === "pending" ? (
                  <span className={`mk-receipt__stamp mk-receipt__stamp--wait${live ? "" : " is-idle"}`} aria-hidden="true">
                    <IconHourglass />
                  </span>
                ) : phase === "cancelled" ? (
                  <span className="mk-receipt__stamp mk-receipt__stamp--off" aria-hidden="true">
                    <IconClose />
                  </span>
                ) : (
                  <span className={`mk-receipt__stamp${phase === "completed" ? "" : " mk-receipt__stamp--win"}`} aria-hidden="true">
                    <IconCheck />
                  </span>
                )}
                <b className="mk-receipt__t">{receiptTitle}</b>
                {tracked?.workId ? <span className="wid">{tracked.workId}</span> : null}
                {phase === "pending" ? (
                  <span className={`mk-pending${live ? "" : " mk-pending--idle"}`}>
                    <i aria-hidden="true" />
                    {t("pending")}
                  </span>
                ) : phase === "paid" ? (
                  <span className={`mk-pending mk-pending--ok${live ? "" : " mk-pending--idle"}`}>
                    <i aria-hidden="true" />
                    {t("paidPreparing")}
                  </span>
                ) : null}
                {receiptLead ? <p>{receiptLead}</p> : null}
                {phase === "pending" && done && !done.telegramSent ? <Notice ok={false} msg={t("notDelivered")} /> : null}
              </div>
              {live ? (
                <div className="mk-live">
                  <span className="mk-live__main">
                    <i aria-hidden="true" />
                    {t("live")}
                  </span>
                  <span className="mk-live__note">{t("liveNote")}</span>
                </div>
              ) : null}
              {track?.offline && !ended && (phase === "pending" || phase === "paid") ? (
                <div className="mk-live mk-live--off">
                  <IconAlert aria-hidden="true" />
                  <span>{t("offline")}</span>
                </div>
              ) : null}
            </div>
            <div className="mk-buy__acts">{actions}</div>
          </div>
        ) : (
          <form
            className="mk-buy__form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset className="mk-buy__ch" data-ai-target="marketplace:purchase-channel" data-ai-id="marketplace.purchase.channel" data-ai-type="select">
              <legend>{t("channel")}</legend>
              <div className="mk-seg">
                {PREFERRED_CHANNELS.map((c) => {
                  const Icon = CHANNEL_ICON[c];
                  return (
                    <button key={c} type="button" className="mk-seg__b" aria-pressed={channel === c} onClick={() => setChannel(c)} data-ai-id={`marketplace.purchase.channel.${c}`}>
                      <Icon />
                      {t(`channels.${c}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="mk-in" data-ai-target="marketplace:purchase-note" data-ai-private>
              <span>{t("note")}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("notePh")}
                maxLength={NOTE_MAX}
                rows={3}
                data-ai-id="marketplace.purchase.note"
                data-ai-label={t("note")}
                data-ai-private
              />
              <em>{note.length}/{NOTE_MAX}</em>
            </label>
            <label className="mk-in" data-ai-target="marketplace:purchase-time">
              <span>{t("time")}</span>
              <input value={time} onChange={(e) => setTime(e.target.value)} placeholder={t("timePh")} maxLength={120} data-ai-id="marketplace.purchase.time" data-ai-label={t("time")} />
            </label>
            <div className="mk-quick">
              {quick.map((q) => (
                <button key={q} type="button" className="mk-chip mk-chip--sm" aria-pressed={time === q} onClick={() => setTime(time === q ? "" : q)}>
                  {q}
                </button>
              ))}
            </div>
            <p className="mk-buy__note">{t("totalNote")}</p>
            {err ? <Notice ok={false} msg={err} /> : null}
            <button type="submit" className="btn btn--grad btn--full btn--lg" disabled={busy} data-ai-target="button:marketplace-purchase-submit" data-ai-id="marketplace.purchase.submit" data-ai-entity-type="marketplace_service" data-ai-entity-id={service.id}>
              {busy ? t("sending") : t("submit")}
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}
