"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { IconAlert, IconChat, IconCheck, IconChevronDown, IconChevronLeft, IconClock, IconClose, IconHourglass, IconPhone, IconRefresh, IconSend, IconUsers, IconVideo } from "@/components/icons";
import { ApiError, errDetail } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { setReturnTo } from "@/lib/returnTo";
import {
  CONTACT_SPEEDS,
  PACKAGE_SELLER_ERRORS,
  PREFERRED_CHANNELS,
  PRICE_OPTION_ERRORS,
  activePurchaseOf,
  marketChatHref,
  marketErrorCode,
  phaseOfStatus,
  requestMarketplaceMatch,
  requestMarketplacePurchase,
  requestPackagePurchase,
  type ActivePurchase,
  type ContactSpeed,
  type MarketPurchase,
  type MarketService,
  type MarketTrackPhase,
  type PreferredChannel,
  type PurchaseAttachment,
  type PurchaseUrgency,
  type PurchaseVoice,
} from "@/lib/services/marketplace";
import IntakeAttachments from "./IntakeAttachments";
import { useMarketOrderTracker } from "@/lib/useMarketOrderTracker";
import { clockOf, useCountdown } from "@/lib/useCountdown";
import { deliveryLabel } from "./bits";
import { useAiField, useAiSelection } from "@/lib/ai/registry";
import { trackPromoContact } from "@/lib/services/promoEvents";
import PriceOptions, { EMPTY_PRICE, type PriceState } from "./PriceOptions";
import { useMarketError } from "./useMarketError";
import { useRuntimeFacts } from "./runtime/useRuntimeFacts";
import { durationParts, guaranteesOf, rulesOf } from "./runtime/facts";
import { RuleList } from "./runtime/RuleList";
import { DurationChip } from "./runtime/DurationChip";
import { GuaranteeList } from "./runtime/Guarantees";
import { UsageSteps } from "./runtime/UsageSteps";
import { FactorList } from "./runtime/FactorList";
import "./runtime/checkout.css";
import ContactAdvocate from "./order/ContactAdvocate";
import ContactGuardNote, { useContactStrip } from "@/components/ui/ContactGuardNote";
import { findContacts } from "@/lib/contactGuard";

export type PackagePurchaseTarget = { id: string; purchaseUrl: string; duration: string };

const CHANNEL_ICON = { chat: IconChat, audio: IconPhone, video: IconVideo, meeting: IconUsers } as const;
const NOTE_MAX = 1000;
// The request, the seller taking it, the 10% advance confirmed, then work.
const STEPS = ["request", "accept", "confirm", "chat"] as const;
const STEP_OF: Record<MarketTrackPhase, number> = { accepting: 1, pending: 2, paid: 3, chat: 3, completed: 4, cancelled: 1 };
const URGENCY_OF: Record<ContactSpeed, PurchaseUrgency> = { within_15_min: "today", within_1_hour: "today", today: "today", tomorrow: "tomorrow" };
export const CLIENT_ORDERS_HREF = "/portal/client/marketplace-orders";

export default function PurchaseDialog({
  sellerUserId,
  sellerName,
  service,
  returnPath,
  pkg,
  onBack,
  onClose,
  onStale,
  auto,
}: {
  // No seller picked: the backend matches one; the client may still pick
  // themselves instead.
  auto?: { onChooseMyself: () => void };
  sellerUserId: string;
  sellerName: string;
  service: MarketService | null;
  returnPath: string;
  pkg?: PackagePurchaseTarget;
  onBack?: () => void;
  onClose: () => void;
  onStale: (what: "seller" | "service") => void;
}) {
  const t = useTranslations("marketplace.purchase");
  const tm = useTranslations("marketplace");
  const te = useTranslations("enums");
  const router = useRouter();
  const [note, setNote] = useState("");
  // Contacts never reach the seller: taken out as they are typed.
  const noteStrip = useContactStrip((v) => setNote(v.slice(0, NOTE_MAX)));
  const [channel, setChannel] = useState<PreferredChannel>("chat");
  const [chOpen, setChOpen] = useState(false);
  const [speed, setSpeed] = useState<ContactSpeed | "">("");
  const [files, setFiles] = useState<PurchaseAttachment[]>([]);
  const [voices, setVoices] = useState<(PurchaseVoice & { url: string })[]>([]);
  const [attaching, setAttaching] = useState(false);
  const onAttachBusy = useCallback((b: boolean) => setAttaching(b), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<MarketPurchase | null>(null);
  const [active, setActive] = useState<ActivePurchase | null>(null);
  const [price, setPrice] = useState<PriceState>(EMPTY_PRICE);
  const [optReload, setOptReload] = useState(0);
  const marketErr = useMarketError();

  const key = service ? `${pkg ? "pkg" : "svc"}:${service.id}:${sellerUserId}` : "";
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setNote("");
    setChannel("chat");
    setChOpen(false);
    setSpeed("");
    setFiles([]);
    setVoices([]);
    setErr("");
    setDone(null);
    setActive(null);
    setPrice(EMPTY_PRICE);
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
  useAiField(aiForm ? "marketplace.purchase.contact-speed" : "", {
    get: () => speed,
    set: (v) => {
      const w = v.trim().toLowerCase();
      const hit = CONTACT_SPEEDS.find((c) => c === w || t(`speeds.${c}`).toLowerCase() === w);
      if (hit) setSpeed(hit);
    },
  });
  useAiSelection(aiForm ? "preferred_channel" : "", channel);

  const tracked = done ?? active;
  const track = useMarketOrderTracker(service && tracked ? tracked.orderId : "", service && tracked ? tracked.workId : "", service && tracked ? tracked.status : "", !!done?.accepting);
  const checkout = useRuntimeFacts(service?.id ?? "", "checkout", { enabled: !!service && !pkg });
  // The seller's acceptance window, as the backend set it.
  const left = useCountdown(done?.accepting ? done.deadlineAt : "", () => track?.recheck());

  if (!service) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const noteHits = findContacts(note);

  const phase: MarketTrackPhase | null = tracked ? (track?.phase ?? phaseOfStatus(tracked.status)) : null;
  const step = phase ? STEP_OF[phase] : 0;
  const failed = phase === "cancelled";
  const slow = !!track && (track.slow || track.offline);
  const ended = !!track?.ended;
  const live = !!track && !slow && !ended && (phase === "accepting" || phase === "pending" || phase === "paid");
  const isActive = !done && !!active;

  function retry() {
    setDone(null);
    setActive(null);
    setErr("");
  }

  async function submit() {
    if (busy || done || !service || price.pending || price.failed || attaching) return;
    if (findContacts(note).length) return;
    if (note.length > NOTE_MAX) {
      setErr(t("noteTooLong"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const input = { note, preferredChannel: channel, contactSpeed: speed, preferredTime: speed ? t(`speeds.${speed}`) : "", selectedOptionIds: price.ids, urgency: speed ? URGENCY_OF[speed] : ("" as const), attachments: files, voiceMessages: voices.map(({ fileId, seconds }) => ({ fileId, seconds })) };
      const r = auto
        ? await requestMarketplaceMatch(service.id, input)
        : pkg
          ? await requestPackagePurchase(pkg.purchaseUrl, input, { packageId: pkg.id, lawyerUserId: sellerUserId })
          : await requestMarketplacePurchase(sellerUserId, service.id, input);
      setDone(r);
      if (!auto) trackPromoContact(sellerUserId, "purchase");
    } catch (e) {
      const act = activePurchaseOf(e);
      if (act) {
        setActive(act);
      } else if (e instanceof ApiError && e.status === 401) {
        setReturnTo(returnPath);
        router.push("/login");
      } else if (marketErrorCode(e)) {
        const code = marketErrorCode(e);
        setErr(marketErr(e, t("error")));
        if (PRICE_OPTION_ERRORS.includes(code)) setOptReload((n) => n + 1);
        if (PACKAGE_SELLER_ERRORS.includes(code)) onStale("seller");
      } else if (pkg && e instanceof ApiError && e.status === 404) {
        setErr(errDetail(e) || t("staleSeller"));
        onStale("seller");
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

  const rtDur = !pkg && durationParts(checkout.config?.duration) ? (checkout.config?.duration ?? null) : null;
  const delivery = pkg?.duration || (rtDur ? "" : deliveryLabel(tm, service.deliveryMinutes));
  const guarantees = pkg ? [] : guaranteesOf(checkout.config);
  const steps = pkg ? [] : (checkout.config?.usageSteps ?? []);
  const factors = pkg ? [] : (checkout.config?.pricing.factors ?? []);
  // The client's own rules, read before paying; executor rules never reach
  // the buyer.
  const clientRules = pkg ? [] : rulesOf(checkout.config, "client");
  const basePrice = price.quote?.basePrice || service.price;
  const chatHref = track?.roomId && tracked ? marketChatHref({ roomId: track.roomId, workId: tracked.workId, serviceTitle: service.title }) : "";

  const titles: Record<MarketTrackPhase, string> = {
    accepting: isActive ? t("active") : t("acceptTitle"),
    pending: isActive ? t("active") : t("advanceTitle"),
    paid: isActive ? t("activePaid") : t("paidTitle"),
    chat: isActive ? t("activePaid") : t("chatTitle"),
    completed: t("completedTitle"),
    cancelled: t("rejectedTitle"),
  };
  const leads: Record<MarketTrackPhase, string> = {
    // The backend's own words for the client come first.
    accepting: done?.message || t("acceptLead"),
    pending: track?.slow ? t("slow") : t("advanceLead"),
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
          <ContactAdvocate
            key="contact"
            tone="site"
            chatHref={chatHref}
            roomId={track?.roomId ?? ""}
            callTitle={service.title || tracked?.workId || "LexGo"}
            counterpartId={sellerUserId}
            orderId={tracked?.orderId ?? ""}
            calls={tracked?.orderId ? undefined : "unavailable"}
            aiId="marketplace.purchase.contact"
            chatAiId="marketplace.purchase.open-chat"
          />,
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
      <div className="mk-buy" data-ai-id="marketplace.purchase-modal" data-ai-type="modal" data-ai-label={t("title")} data-ai-entity-type={pkg ? "marketplace_package" : "marketplace_service"} data-ai-entity-id={service.id}>
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
            <b>{auto ? t("autoSeller") : sellerName}</b>
            <p>{service.title}</p>
            {rtDur ? (
              <DurationChip duration={rtDur} tone="ticket" start />
            ) : delivery ? (
              <span className="mk-buy__eta">
                <IconClock />
                {delivery}
              </span>
            ) : null}
            {guarantees.length ? <GuaranteeList items={guarantees} tone="ticket" aiId="marketplace.purchase.guarantees" /> : null}
          </div>
          <div className="mk-buy__sum">
            <small>{t("total")}</small>
            <b>{fmtUzs(done?.amount || price.quote?.totalPrice || service.price)}</b>
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
                {phase === "pending" || phase === "accepting" ? (
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
                {phase === "accepting" ? (
                  <span className={`mk-pending${live ? "" : " mk-pending--idle"}`}>
                    <i aria-hidden="true" />
                    {left ? t("acceptWaitClock", { time: clockOf(left) }) : left === 0 ? t("acceptOver") : t("acceptWait")}
                  </span>
                ) : phase === "pending" ? (
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
                {phase === "accepting" ? <p className="mk-receipt__note">{done?.advanceAmount ? t("advanceNext", { amount: fmtUzs(done.advanceAmount) }) : t("advanceNextPlain")}</p> : null}
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
            {onBack ? (
              <button type="button" className="mk-buy__back" onClick={onBack} data-ai-id="marketplace.purchase.change-seller">
                <IconChevronLeft aria-hidden />
                {t("changeSeller")}
              </button>
            ) : null}
            <div className="mk-buy__compose">
              <label className="mk-in mk-buy__main" data-ai-target="marketplace:purchase-note" data-ai-private>
                <span>{t("note")}</span>
                <textarea
                  value={note}
                  onChange={(e) => noteStrip.change(e.target.value, e)}
                  onBlur={() => noteStrip.blur(note)}
                  placeholder={t("notePh")}
                  maxLength={NOTE_MAX}
                  rows={4}
                  data-ai-id="marketplace.purchase.note"
                  data-ai-label={t("note")}
                  data-ai-private
                />
                <em>{note.length}/{NOTE_MAX}</em>
              </label>
              <IntakeAttachments files={files} voices={voices} onFiles={setFiles} onVoices={setVoices} onBusy={onAttachBusy} compact />
            </div>
            <ContactGuardNote hits={noteHits} removed={noteStrip.removed} verifiedLine={false} peer="specialist" />
            <fieldset className="mk-buy__ch" data-ai-target="marketplace:purchase-contact-speed" data-ai-id="marketplace.purchase.contact-speed" data-ai-type="select" data-ai-label={t("speed")}>
              <legend>{t("speed")}</legend>
              <div className="mk-seg mk-seg--speed">
                {CONTACT_SPEEDS.map((c) => (
                  <button key={c} type="button" className="mk-seg__b" aria-pressed={speed === c} onClick={() => setSpeed(speed === c ? "" : c)} data-ai-id={`marketplace.purchase.contact-speed.${c}`}>
                    <IconClock />
                    {t(`speeds.${c}`)}
                  </button>
                ))}
              </div>
            </fieldset>
            <PriceOptions target={pkg ? "package" : "service"} targetId={service.id} lawyerUserId={pkg || auto ? undefined : sellerUserId} reload={optReload} onChange={setPrice} />
            {factors.length || steps.length || clientRules.length ? (
              <div className="mk-buy__facts" data-ai-id="marketplace.purchase.service-facts" data-ai-type="section">
                {factors.length ? <FactorList factors={factors} basePrice={basePrice} currency={service.currency} level={3} /> : null}
                {steps.length ? <UsageSteps steps={steps} idBase={`mkbuy-${service.id}-st`} level={3} /> : null}
                {clientRules.length ? <RuleList rules={clientRules} side="client" idBase={`mkbuy-${service.id}-rl`} level={3} limit={2} /> : null}
              </div>
            ) : null}
            <div className={`mk-buy__chx${chOpen ? " is-open" : ""}`}>
              <button type="button" className="mk-buy__chx-t" aria-expanded={chOpen} aria-controls="mk-buy-channel" onClick={() => setChOpen((v) => !v)} data-ai-id="marketplace.purchase.channel-toggle">
                <span className="mk-buy__chx-l">{t("channelMore")}</span>
                <span className="mk-buy__chx-v">{t(`channels.${channel}`)}</span>
                <IconChevronDown aria-hidden="true" className="mk-buy__chx-c" />
              </button>
              {chOpen ? (
                <fieldset id="mk-buy-channel" className="mk-buy__ch" data-ai-target="marketplace:purchase-channel" data-ai-id="marketplace.purchase.channel" data-ai-type="select">
                  <legend className="sr-only">{t("channel")}</legend>
                  <p className="mk-buy__chx-h">{t("channelHint")}</p>
                  <div className="mk-seg mk-seg--ch">
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
              ) : null}
            </div>
            <p className="mk-buy__note">{auto ? t("autoNote") : t("totalNote")}</p>
            {err ? <Notice ok={false} msg={err} /> : null}
            <button type="submit" className="btn btn--grad btn--full btn--lg" disabled={busy || price.pending || price.failed || attaching} data-ai-target="button:marketplace-purchase-submit" data-ai-id="marketplace.purchase.submit" data-ai-entity-type={pkg ? "marketplace_package" : "marketplace_service"} data-ai-entity-id={service.id}>
              {busy ? t("sending") : price.pending ? t("pricing") : auto ? t("autoSubmit") : t("submit")}
            </button>
            {auto ? (
              <button type="button" className="btn btn--line btn--full" onClick={auto.onChooseMyself} disabled={busy} data-ai-id="marketplace.purchase.choose-myself">
                {t("chooseMyself")}
              </button>
            ) : null}
          </form>
        )}
      </div>
    </Modal>
  );
}
