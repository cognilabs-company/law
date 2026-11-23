"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, errDetail } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import {
  PACKAGE_SELLER_ERRORS,
  PAYMENT_PROVIDER_ERRORS,
  PROVIDER_LIST_ERRORS,
  PREFERRED_CHANNELS,
  PURCHASE_PROVIDERS,
  PRICE_OPTION_ERRORS,
  CONTACT_SPEEDS,
  activePurchaseOf,
  findLostMarketPurchase,
  purchaseAnswerLost,
  listMarketplaceOrders,
  marketChatHref,
  marketErrorCode,
  phaseOfStatus,
  requestMarketplacePurchase,
  requestPackagePurchase,
  MAX_PURCHASE_FILES,
  MAX_PURCHASE_VOICES,
  type ActivePurchase,
  type MarketPurchase,
  type MarketService,
  type MarketTrackPhase,
  type PreferredChannel,
  type PurchaseAttachment,
  type PurchaseProvider,
  type PurchaseUrgency,
  type ContactSpeed,
} from "@/lib/services/marketplace";
import { useMarketOrderTracker } from "@/lib/useMarketOrderTracker";
import { clockOf, useCountdown } from "@/lib/useCountdown";
import { trackPromoContact } from "@/lib/services/promoEvents";
import { usePriceOptions, EMPTY_PRICE, type PriceState } from "@/components/marketplace/PriceOptions";
import { useIntakeAttachments, mmss, type Voice } from "@/components/marketplace/IntakeAttachments";
import { useMarketError } from "@/components/marketplace/useMarketError";
import { useRuntimeFacts } from "@/components/marketplace/runtime/useRuntimeFacts";
import { durationParts, guaranteesOf } from "@/components/marketplace/runtime/facts";
import { useDurationText } from "@/components/marketplace/runtime/DurationChip";
import { deliveryLabel } from "@/components/marketplace/bits";
import { CLIENT_ORDERS_HREF, type PackagePurchaseTarget } from "@/components/marketplace/PurchaseDialog";
import { IconCard, IconExternal, IconChat, IconCheck, IconClock, IconClose, IconHourglass, IconMic, IconPaperclip, IconPhone, IconRecord, IconRefresh, IconSend, IconShieldCheck, IconUsers, IconVideo } from "@/components/icons";
import { Banner, Btn, Check, Dialog, Field, Input, Seg, Spinner, TextArea } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { useGuardedField } from "@/components/ui/ContactGuardNote";
import { goToPaymentPage, rememberPendingPayment } from "@/lib/services/paymentProviders";
import { checkoutLinkUsable, clickErrorOf, openCheckoutTab, renewClickCheckout, sendCheckoutTab, type CheckoutLink } from "@/lib/services/clickCheckout";
import { refreshCheckoutProviders, useCheckoutProviders } from "@/lib/useCheckoutProviders";
import { AtmosPayPanel } from "@/components/payments/AtmosPay";
import { ATMOS_ERROR_CODES, ATMOS_LIST_STALE, ATMOS_MAYBE_CREATED, atmosErrorOf, recentPendingOrder } from "@/lib/services/atmosCheckout";

// Ordering a service as a desktop sheet — the Mac's sheet that drops from
// the toolbar, Windows' content dialog: the three steps on top, the
// service and its total, then the extra options with the price as they
// are ticked, how to talk, what happened, how urgent, files and voice
// notes, and when. Sent, the same sheet follows the order live until the
// specialist accepts it and the chat opens. The rules are the web's
// (PurchaseDialog); this is only its desktop face.

const CHANNEL_ICON = { chat: IconChat, audio: IconPhone, video: IconVideo, meeting: IconUsers } as const;
const NOTE_MAX = 1000;
// Enterprise contract 2026-10-27 §4: request → full payment → the seller
// accepts the paid order within 30 minutes → chat. No 10% advance.
const STEPS = ["request", "pay", "accept", "chat"] as const;
const STEP_OF: Record<MarketTrackPhase, number> = { pending: 1, accepting: 2, paid: 3, resolution: 2, chat: 3, completed: 4, cancelled: 1 };
const URGENCY_OF: Record<ContactSpeed, PurchaseUrgency> = { within_15_min: "today", within_1_hour: "today", today: "today", tomorrow: "tomorrow" };
const PROVIDER_ICON = { click: IconCard, atmos: IconCard } as const;

type Props = {
  sellerUserId: string;
  sellerName: string;
  service: MarketService;
  pkg?: PackagePurchaseTarget;
  openLink: NativeProps["openLink"];
  onClose: () => void;
  onStale: (what: "seller" | "service") => void;
  // Back to choosing the advocate (a package's sheet comes from that list).
  onBack?: () => void;
  region?: string;
};

export default function PurchaseSheet(props: Props) {
  // A fresh form for each service or seller.
  return <Sheet key={`${props.pkg ? "pkg" : "svc"}:${props.service.id}:${props.sellerUserId}`} {...props} />;
}

function Sheet({ sellerUserId, sellerName, service, pkg, openLink, onClose, onStale, onBack, region }: Props) {
  const t = useTranslations("marketplace.purchase");
  const ta = useTranslations("atmosPay");
  const tm = useTranslations("marketplace");
  const te = useTranslations("enums");
  const marketErr = useMarketError();
  const durText = useDurationText();
  const [note, setNote] = useState("");
  const noteGuard = useGuardedField(note, (v) => setNote(v.slice(0, NOTE_MAX)), "specialist");
  const [channel, setChannel] = useState<PreferredChannel>("chat");
  const [time, setTime] = useState("");
  const [speed, setSpeed] = useState<ContactSpeed | "">("");
  const [picked, setProvider] = useState<PurchaseProvider | "">("");
  // Only what the backend has switched on, under its own labels.
  const pays = useCheckoutProviders();
  const offered = PURCHASE_PROVIDERS.filter((pv) => pays.options.some((o) => o.provider === pv));
  // Click first when the backend has it on (Click integration §1); nothing
  // offered yet → no provider named, the backend picks (2026-11-21 §1.1).
  const provider: PurchaseProvider | "" = picked && offered.includes(picked) ? picked : offered.includes("click") ? "click" : (offered[0] ?? "");
  // The other method on offer, for when the chosen one cannot take the payment.
  const altOf = (pv: string): PurchaseProvider | "" => offered.find((o) => o !== pv) ?? "";
  const bothOn = offered.length > 1;
  const [provErr, setProvErr] = useState("");
  const altPay = provErr ? altOf(provErr) : "";
  const providerName = (pv: string) => pays.labelOf(pv) || (t.has(`providers.${pv}.name`) ? t(`providers.${pv}.name`) : pv);
  const [files, setFiles] = useState<PurchaseAttachment[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [attaching, setAttaching] = useState(false);
  const onAttachBusy = useCallback((b: boolean) => setAttaching(b), []);
  const [busy, setBusy] = useState(false);
  // Click web contract 2026-11-17 §9: one request per press, set before any
  // render; §8: a request lost on the way is looked for before a new one.
  const sending = useRef(false);
  const lostAt = useRef(0);
  // The Click checkout link works once (§6): kept here with whether it was used.
  const clickLink = useRef<CheckoutLink | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const tc = useTranslations("clickPay");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<MarketPurchase | null>(null);
  const [active, setActive] = useState<ActivePurchase | null>(null);
  const [price, setPrice] = useState<PriceState>(EMPTY_PRICE);
  const [optReload, setOptReload] = useState(0);
  const opts = usePriceOptions({ target: pkg ? "package" : "service", targetId: service.id, lawyerUserId: pkg ? undefined : sellerUserId, reload: optReload, onChange: setPrice });
  const att = useIntakeAttachments({ files, voices, onFiles: setFiles, onVoices: setVoices, onBusy: onAttachBusy });
  const pick = useRef<HTMLInputElement>(null);

  const tracked = done ?? active;
  const track = useMarketOrderTracker(tracked ? tracked.orderId : "", tracked ? tracked.workId : "", tracked ? tracked.status : "", !!done?.accepting);
  const checkout = useRuntimeFacts(service.id, "checkout", { enabled: !pkg });
  const left = useCountdown(track?.phase === "accepting" ? track.deadlineAt || (done?.accepting ? done.deadlineAt : "") : "", () => track?.recheck());

  const phase: MarketTrackPhase | null = tracked ? (track?.phase ?? phaseOfStatus(tracked.status)) : null;
  const step = phase ? STEP_OF[phase] : 0;
  const failed = phase === "cancelled";
  const slow = !!track && (track.slow || track.offline);
  const ended = !!track?.ended;
  const live = !!track && !slow && !ended && (phase === "accepting" || phase === "pending" || phase === "paid");
  const isActive = !done && !!active;
  const rtDur = !pkg && checkout.config && durationParts(checkout.config.duration) ? checkout.config.duration : null;
  const delivery = pkg?.duration || (rtDur ? durText(rtDur) : deliveryLabel(tm, service.deliveryMinutes));
  const guarantees = pkg ? [] : guaranteesOf(checkout.config);
  const chatHref = track?.roomId && tracked ? marketChatHref({ roomId: track.roomId, workId: tracked.workId, serviceTitle: service.title }) : "";
  const total = done?.amount || price.quote?.totalPrice || service.price;
  const quick = [t("quick.today"), t("quick.evening"), t("quick.tomorrow"), t("quick.week")];
  const go = (route: string) => (onClose(), openLink({ appId: "", route }));

  // An order already open for this (§8): straight to it.
  const toExisting = (act: ActivePurchase) => {
    setActive(act);
    if (act.orderId) go(`${CLIENT_ORDERS_HREF}/${encodeURIComponent(act.orderId)}`);
  };

  async function submit(via: PurchaseProvider | "" = provider) {
    if (sending.current || busy || done || price.pending || price.failed || attaching) return;
    if (note.length > NOTE_MAX) return setErr(t("noteTooLong"));
    sending.current = true;
    setBusy(true);
    setErr("");
    setProvErr("");
    const sentAt = Date.now();
    try {
      if (lostAt.current) {
        const lost = await findLostMarketPurchase({ serviceId: service.id, sellerUserId, since: lostAt.current });
        lostAt.current = 0;
        if (lost) return toExisting(lost);
      }
      const input = { paymentProvider: via || undefined, note, preferredChannel: channel, preferredTime: time, contactSpeed: speed, selectedOptionIds: price.ids, urgency: speed ? URGENCY_OF[speed] : ("" as const), attachments: files, voiceMessages: voices.map(({ fileId, seconds }) => ({ fileId, seconds })), region };
      const r = pkg ? await requestPackagePurchase(pkg.purchaseUrl, input, { packageId: pkg.id, lawyerUserId: sellerUserId }) : await requestMarketplacePurchase(sellerUserId, service.id, input);
      clickLink.current = r.payment?.url ? { url: r.payment.url, at: Date.now(), used: false } : null;
      setDone(r);
      trackPromoContact(sellerUserId, "purchase");
    } catch (e) {
      const act = activePurchaseOf(e);
      const code = marketErrorCode(e);
      if (act) toExisting(act);
      else if (via === "atmos" && (ATMOS_ERROR_CODES.includes(code) || !(e instanceof ApiError) || e.status === 0 || e.status >= 500)) {
        // ATMOS contract: a provider that is off leaves the list; an order
        // the request may have made is found before anything is resent.
        const ae = atmosErrorOf(e);
        if (ATMOS_LIST_STALE.includes(ae.key)) {
          refreshCheckoutProviders();
          setProvErr(via);
        } else {
          const list = ATMOS_MAYBE_CREATED.includes(ae.key) ? await listMarketplaceOrders("client").catch(() => []) : [];
          const o = recentPendingOrder(list, { serviceId: service.id, packageId: pkg?.id, sellerUserId }, sentAt);
          if (o) setActive({ orderId: o.id, workId: o.workId, status: o.status });
          else setErr(ae.key === "rejected" && ae.message ? `${ta("errors.rejected")} ${ae.message}` : ta(`errors.${ae.key}`));
        }
      } else if (purchaseAnswerLost(e)) {
        lostAt.current = lostAt.current || Date.now();
        setErr(t("networkLost"));
      } else if (PAYMENT_PROVIDER_ERRORS.includes(code) && via && bothOn) {
        if (PROVIDER_LIST_ERRORS.includes(code)) refreshCheckoutProviders();
        setProvErr(via);
      }
      else if (code) {
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
      } else if (e instanceof ApiError && e.status === 422) setErr(Object.values(e.fieldErrors)[0] || errDetail(e) || t("error"));
      else setErr(errDetail(e) || t("error"));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  // Click (§4, §6): a new tab inside the press, the backend's page as given;
  // a link already used is never opened again — the backend gives a new one.
  // The order's own reads (the tracker above) say when it is paid.
  async function payWithClick() {
    const p = done?.payment;
    if (!p || payBusy) return;
    setPayErr("");
    const link = clickLink.current;
    const tab = openCheckoutTab();
    const send = (url: string, at: number) => {
      clickLink.current = { url, at, used: true };
      sendCheckoutTab(tab, url, () => rememberPendingPayment({ id: p.id, amount: p.amount }));
      track?.recheck();
    };
    if (link && checkoutLinkUsable(link)) return send(link.url, link.at);
    setPayBusy(true);
    try {
      const r = await renewClickCheckout(p.id);
      if (r.url) send(r.url, Date.now());
      else {
        tab?.close();
        track?.recheck();
      }
    } catch (e) {
      tab?.close();
      setPayErr(tc(`errors.${clickErrorOf(e).key}`));
      track?.recheck();
    } finally {
      setPayBusy(false);
    }
  }

  const paidVia = (done?.payment?.provider || provider || pays.fallback) as string;
  // ATMOS: paid in its own panel, watched through the order (ATMOS contract).
  const atmosPay = paidVia === "atmos" && done?.payment && done.orderId && (phase === "pending" || phase === "accepting" || phase === "paid" || phase === "chat") ? done.payment : null;
  const payUrl = done?.payment?.url && done.payment.status !== "paid" ? done.payment.url : "";
  const paidSure = !!track?.paid || done?.payment?.status === "paid";
  const titles: Record<MarketTrackPhase, string> = {
    accepting: isActive ? t("active") : paidSure ? t("acceptTitle") : t("sentTitle"),
    pending: isActive ? t("active") : t("payTitle"),
    paid: isActive ? t("activePaid") : t("paidTitle"),
    resolution: t("resolveTitle"),
    chat: isActive ? t("activePaid") : t("chatTitle"),
    completed: t("completedTitle"),
    cancelled: t("rejectedTitle"),
  };
  const leads: Record<MarketTrackPhase, string> = {
    accepting: done?.message || t("acceptLead"),
    pending: track?.slow ? t("slow") : t("payLeadOnline", { provider: providerName(paidVia) }),
    paid: track?.slow ? t("paidNoRoom") : "",
    resolution: t("resolveLead"),
    chat: t("chatLead"),
    completed: "",
    cancelled: track?.message || t("rejectedLead"),
  };

  const toOrders = (primary: boolean) => (
    <Btn key="orders" kind={primary ? "primary" : "default"} onClick={() => go(CLIENT_ORDERS_HREF)}>
      {isActive ? t("activeOpen") : t("toOrders")}
    </Btn>
  );
  const recheck = (primary: boolean) => (
    <Btn key="recheck" kind={primary ? "primary" : "default"} icon={<IconRefresh />} onClick={() => track?.recheck()}>
      {t("recheck")}
    </Btn>
  );
  const close = (
    <Btn key="close" onClick={onClose}>
      {t("close")}
    </Btn>
  );
  const actions = !phase
    ? [
        onBack ? (
          <Btn key="back" onClick={onBack}>
            {t("changeSeller")}
          </Btn>
        ) : (
          <Btn key="cancel" onClick={onClose}>
            {t("close")}
          </Btn>
        ),
        <Btn key="send" kind="primary" type="submit" icon={<IconSend />} busy={busy} disabled={price.pending || price.failed || attaching}>
          {price.pending ? t("pricing") : t("submit")}
        </Btn>,
      ]
    : phase === "chat" && chatHref
      ? [toOrders(false), <Btn key="chat" kind="primary" icon={<IconChat />} onClick={() => go(chatHref)}>{t("openChat")}</Btn>]
      : phase === "cancelled"
        ? [close, <Btn key="retry" kind="primary" icon={<IconSend />} onClick={() => (setDone(null), setActive(null), setErr(""))}>{t("retry")}</Btn>]
        : ended
          ? [toOrders(true)]
          : phase === "pending" && paidVia === "click" && done?.payment && done.payment.status !== "paid"
            ? [toOrders(false), <Btn key="pay" kind="primary" icon={<IconExternal />} busy={payBusy} onClick={() => void payWithClick()}>{tc("open")}</Btn>]
          : phase === "pending" && atmosPay
            ? [close, toOrders(true)]
          : phase === "pending" && payUrl && done?.payment
            ? [toOrders(false), <Btn key="pay" kind="primary" icon={<IconExternal />} onClick={() => goToPaymentPage(payUrl, done.payment?.id, done.payment?.amount)}>{t("payProceed", { provider: providerName(paidVia) })}</Btn>]
            : phase === "pending" && slow
            ? [toOrders(false), recheck(true)]
            : phase === "paid" && slow
              ? [recheck(false), toOrders(true)]
              : [close, toOrders(true)];

  return (
    <Dialog open title={t("title")} width={600} onClose={onClose} onSubmit={() => void submit()} actions={actions}>
      <ol className="dxco-steps dxcp-steps" aria-label={t("title")}>
        {STEPS.map((s, i) => {
          const fail = failed && i === step;
          return (
            <li key={s} className={fail ? "is-fail" : i < step ? "is-done" : i === step ? "is-now" : ""} aria-current={i === step ? "step" : undefined}>
              <i>{fail ? <IconClose /> : i < step ? <IconCheck /> : i + 1}</i>
              <span>{t(`steps.${s}`)}</span>
            </li>
          );
        })}
      </ol>

      <div className="dxcp-ticket">
        <span>
          <small>{t("seller")}</small>
          <b>{sellerName}</b>
          <em>{service.title}</em>
          {delivery ? (
            <span className="dxcp-eta">
              <IconClock aria-hidden /> {delivery}
            </span>
          ) : null}
        </span>
        <span className="dxcp-sum">
          <small>{t("totalFull")}</small>
          <b>{fmtUzs(total)}</b>
          <em>{service.currency === "UZS" ? te("currency") : service.currency}</em>
        </span>
      </div>
      {guarantees.length && !phase ? (
        <ul className="dxcp-guar">
          {guarantees.slice(0, 3).map((g, i) => (
            <li key={g.id || i} title={g.description || undefined}>
              <IconShieldCheck aria-hidden /> {g.title}
            </li>
          ))}
        </ul>
      ) : null}

      {phase ? (
        <>
        <div className={`dxcp-receipt is-${phase}`} role="status">
          <span className="dxcp-stamp" aria-hidden>
            {phase === "pending" || phase === "accepting" || phase === "resolution" ? <IconHourglass /> : phase === "cancelled" ? <IconClose /> : <IconCheck />}
          </span>
          <b>{titles[phase]}</b>
          {tracked?.workId ? <code className="dxcw-code">{tracked.workId}</code> : null}
          {phase === "accepting" || phase === "pending" || phase === "paid" ? (
            <span className={`dxcp-live${live ? " is-live" : ""}`}>
              <i aria-hidden />
              {phase === "accepting" ? (left ? t("acceptWaitClock", { time: clockOf(left) }) : left === 0 ? t("acceptOver") : t("acceptWait")) : phase === "pending" ? t("pending") : t("paidPreparing")}
            </span>
          ) : null}
          {leads[phase] ? <p>{leads[phase]}</p> : null}
          {phase === "accepting" ? <p>{t("acceptNote")}</p> : null}
          {live ? <small>{t("liveNote")}</small> : null}
          {track?.offline && !ended && (phase === "pending" || phase === "paid") ? (
            <Banner tone="warn">
              {t("offline")}
            </Banner>
          ) : null}
          {payErr && phase === "pending" ? <Banner tone="err">{payErr}</Banner> : null}
        </div>
        {atmosPay && done ? (
          <AtmosPayPanel key={atmosPay.id} orderId={done.orderId} payment={atmosPay} title={service.title} compactPaid={phase !== "pending"} onSettled={() => track?.recheck()} aiId="desk.purchase.atmos" />
        ) : null}
        </>
      ) : (
        <>
          <Options m={opts} />
          <Field label={t("channel")}>
            <Seg<PreferredChannel> label={t("channel")} value={channel} onChange={setChannel} items={PREFERRED_CHANNELS.map((c) => {
              const Icon = CHANNEL_ICON[c];
              return { id: c, label: t(`channels.${c}`), icon: <Icon /> };
            })} />
          </Field>
          <Field label={t("note")} hint={`${note.length}/${NOTE_MAX}`}>
            <TextArea value={note} onChange={(v) => noteGuard.change(v)} onBlur={noteGuard.blur} placeholder={t("notePh")} maxLength={NOTE_MAX} rows={4} />
            {noteGuard.note}
          </Field>
          <Field label={t("speed")}>
            <span className="dxcp-chips">
              {CONTACT_SPEEDS.map((c) => (
                <button key={c} type="button" className={speed === c ? "is-on" : ""} aria-pressed={speed === c} onClick={() => setSpeed(speed === c ? "" : c)}>
                  {t(`speeds.${c}`)}
                </button>
              ))}
            </span>
          </Field>
          <Attachments files={files} voices={voices} onFiles={setFiles} onVoices={setVoices} m={att} onPick={() => pick.current?.click()} />
          <input ref={pick} type="file" multiple hidden onChange={(e) => (void att.addFiles(e.target.files), (e.target.value = ""))} />
          <Field label={t("time")}>
            <Input value={time} onChange={(v) => setTime(v.slice(0, 120))} placeholder={t("timePh")} maxLength={120} />
          </Field>
          <span className="dxcp-chips">
            {quick.map((q) => (
              <button key={q} type="button" className={time === q ? "is-on" : ""} aria-pressed={time === q} onClick={() => setTime(time === q ? "" : q)}>
                {q}
              </button>
            ))}
          </span>
          {provider ? (
            <Field label={t("providerTitle")}>
              <Seg<PurchaseProvider>
                label={t("providerTitle")}
                value={provider}
                onChange={(v) => (setProvider(v), setProvErr(""))}
                items={offered.map((pv) => {
                  const Icon = PROVIDER_ICON[pv];
                  return { id: pv, label: providerName(pv), icon: <Icon /> };
                })}
              />
            </Field>
          ) : null}
          <p className="dx-dlg__text dxcp-note">{t("totalNote")}</p>
          {provErr ? (
            <Banner tone="warn">
              <b>{t("providerOff", { provider: providerName(provErr) })}</b> {altPay ? t("providerOffText", { provider: providerName(altPay) }) : t("providerOffLater")}{" "}
              {altPay ? (
                <Btn kind="primary" icon={<IconCard />} busy={busy} onClick={() => (setProvider(altPay), void submit(altPay))}>
                  {t("payProceed", { provider: providerName(altPay) })}
                </Btn>
              ) : null}
            </Banner>
          ) : null}
          {err ? <Banner tone="err">{err}</Banner> : null}
        </>
      )}
    </Dialog>
  );
}

// The service's extra options, ticked like a Mac checklist / Windows
// checkboxes, with the running total under them.
function Options({ m }: { m: ReturnType<typeof usePriceOptions> }) {
  const tcm = useTranslations("common");
  const t = useTranslations("marketplace.priceOptions");
  const marketErr = useMarketError();
  const q = m.quote;
  if (m.status === "loading") return <Spinner small label={t("calculating")} />;
  if (m.status === "error")
    return (
      <Banner tone="err" action={<Btn small onClick={m.retryForm}>{t("retry")}</Btn>}>
        {t("optionsFailed")}
      </Banner>
    );
  if (!m.sections.length && !(q?.breakdown.length ?? 0)) return null;
  return (
    <div className="dxcp-opts">
      {m.sections.map((s) => (
        <fieldset key={s.id}>
          <legend>
            <b>{s.title}</b>
            {s.description ? <small>{s.description}</small> : <small>{t("optional")}</small>}
          </legend>
          {s.options.map((o) => (
            <Check key={o.id} checked={m.picked.includes(o.id)} onChange={() => m.toggle(o.id)} label={o.label}>
              <span className="dxcp-opt">
                <span>
                  <b>{o.label}</b>
                  {o.description ? <small>{o.description}</small> : null}
                </span>
                <em>{o.adjustmentType === "percent" ? t("percent", { n: o.value }) : t("fixed", { price: fmtUzs(o.value) })}</em>
              </span>
            </Check>
          ))}
        </fieldset>
      ))}
      {q ? (
        <dl className="dxcp-bill" aria-live="polite">
          <div>
            <dt>{t("base")}</dt>
            <dd>{t("fixedPlain", { price: fmtUzs(q.basePrice) })}</dd>
          </div>
          {q.breakdown.map((l, i) => (
            <div key={`${l.id}-${i}`}>
              <dt>{l.label || tcm("option")}</dt>
              <dd>{t("fixed", { price: fmtUzs(l.amount) })}</dd>
            </div>
          ))}
          <div className="is-total">
            <dt>{t("total")}</dt>
            <dd>{m.pending ? <Spinner small label={t("calculating")} /> : t("fixedPlain", { price: fmtUzs(q.totalPrice) })}</dd>
          </div>
        </dl>
      ) : null}
      {m.quoteError && m.sections.length ? (
        <Banner tone="err" action={<Btn small icon={<IconRefresh />} onClick={m.retryQuote}>{t("recalc")}</Btn>}>
          {marketErr(m.quoteError, t("quoteFailed"))}
        </Banner>
      ) : null}
    </div>
  );
}

// Files and voice notes sent with the order: the Mac's attachment well /
// Windows' attachment list, with a record button.
function Attachments({ files, voices, onFiles, onVoices, m, onPick }: { files: PurchaseAttachment[]; voices: Voice[]; onFiles: (f: PurchaseAttachment[]) => void; onVoices: (v: Voice[]) => void; m: ReturnType<typeof useIntakeAttachments>; onPick: () => void }) {
  const t = useTranslations("marketplace.purchase.intake");
  return (
    <div className="dx-field dxcp-att">
      <span className="dx-field__l">{t("title")}</span>
      <span className="dxcp-att__bar">
        <Btn small icon={<IconPaperclip />} onClick={onPick} disabled={files.length >= MAX_PURCHASE_FILES || !!m.rec}>
          {`${t("addFile")} ${files.length}/${MAX_PURCHASE_FILES}`}
        </Btn>
        {m.rec ? (
          <Btn small kind="danger" icon={<IconRecord />} onClick={m.stopVoice}>
            {t("stop", { t: mmss(m.rec.secs) })}
          </Btn>
        ) : (
          <Btn small icon={<IconMic />} onClick={() => void m.startVoice()} disabled={voices.length >= MAX_PURCHASE_VOICES || m.uploading > 0}>
            {`${t("record")} ${voices.length}/${MAX_PURCHASE_VOICES}`}
          </Btn>
        )}
        {m.uploading ? <Spinner small label={t("uploading", { n: m.uploading })} /> : null}
      </span>
      <small className="dx-field__h">{t("hint")}</small>
      {m.err ? <small className="dx-field__e">{m.err}</small> : null}
      {files.length || voices.length ? (
        <ul className="dxcp-att__list">
          {files.map((f, i) => (
            <li key={f.fileId}>
              <IconPaperclip aria-hidden />
              <span>{f.title}</span>
              <button type="button" onClick={() => onFiles(files.filter((_, k) => k !== i))} aria-label={t("remove", { name: f.title })}>
                <IconClose />
              </button>
            </li>
          ))}
          {voices.map((v, i) => (
            <li key={v.fileId}>
              <IconMic aria-hidden />
              <audio src={v.url} controls preload="metadata" aria-label={t("voiceN", { n: i + 1, t: mmss(v.seconds) })} />
              <small>{mmss(v.seconds)}</small>
              <button type="button" onClick={() => onVoices(voices.filter((_, k) => k !== i))} aria-label={t("removeVoice", { n: i + 1 })}>
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
