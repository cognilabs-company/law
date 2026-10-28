"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, errDetail } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import {
  PACKAGE_SELLER_ERRORS,
  PAYMENT_PROVIDER_ERRORS,
  PREFERRED_CHANNELS,
  PURCHASE_PROVIDERS,
  PRICE_OPTION_ERRORS,
  PURCHASE_URGENCIES,
  activePurchaseOf,
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
import { goToPaymentPage } from "@/lib/services/paymentProviders";

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
const STEP_OF: Record<MarketTrackPhase, number> = { pending: 1, accepting: 2, paid: 3, chat: 3, completed: 4, cancelled: 1 };
const PROVIDER_ICON = { telegram_manual: IconSend, payme: IconCard, click: IconCard } as const;

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
};

export default function PurchaseSheet(props: Props) {
  // A fresh form for each service or seller.
  return <Sheet key={`${props.pkg ? "pkg" : "svc"}:${props.service.id}:${props.sellerUserId}`} {...props} />;
}

function Sheet({ sellerUserId, sellerName, service, pkg, openLink, onClose, onStale, onBack }: Props) {
  const t = useTranslations("marketplace.purchase");
  const tm = useTranslations("marketplace");
  const te = useTranslations("enums");
  const marketErr = useMarketError();
  const durText = useDurationText();
  const [note, setNote] = useState("");
  const noteGuard = useGuardedField(note, (v) => setNote(v.slice(0, NOTE_MAX)), "specialist");
  const [channel, setChannel] = useState<PreferredChannel>("chat");
  const [time, setTime] = useState("");
  const [urgency, setUrgency] = useState<PurchaseUrgency | "">("");
  const [provider, setProvider] = useState<PurchaseProvider>("telegram_manual");
  const [provErr, setProvErr] = useState("");
  const [files, setFiles] = useState<PurchaseAttachment[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [attaching, setAttaching] = useState(false);
  const onAttachBusy = useCallback((b: boolean) => setAttaching(b), []);
  const [busy, setBusy] = useState(false);
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

  async function submit(via: PurchaseProvider = provider) {
    if (busy || done || price.pending || price.failed || attaching) return;
    if (note.length > NOTE_MAX) return setErr(t("noteTooLong"));
    setBusy(true);
    setErr("");
    setProvErr("");
    try {
      const input = { paymentProvider: via, note, preferredChannel: channel, preferredTime: time, selectedOptionIds: price.ids, urgency, attachments: files, voiceMessages: voices.map(({ fileId, seconds }) => ({ fileId, seconds })) };
      const r = pkg ? await requestPackagePurchase(pkg.purchaseUrl, input) : await requestMarketplacePurchase(sellerUserId, service.id, input);
      setDone(r);
      trackPromoContact(sellerUserId, "purchase");
    } catch (e) {
      const act = activePurchaseOf(e);
      const code = marketErrorCode(e);
      if (act) setActive(act);
      else if (PAYMENT_PROVIDER_ERRORS.includes(code) && via !== "telegram_manual") setProvErr(via);
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
      setBusy(false);
    }
  }

  const paidVia = (done?.payment?.provider || provider) as string;
  const online = paidVia === "payme" || paidVia === "click";
  const payUrl = done?.payment?.url && online && done.payment.status !== "paid" ? done.payment.url : "";
  const titles: Record<MarketTrackPhase, string> = {
    accepting: isActive ? t("active") : t("acceptTitle"),
    pending: isActive ? t("active") : t("payTitle"),
    paid: isActive ? t("activePaid") : t("paidTitle"),
    chat: isActive ? t("activePaid") : t("chatTitle"),
    completed: t("completedTitle"),
    cancelled: t("rejectedTitle"),
  };
  const leads: Record<MarketTrackPhase, string> = {
    accepting: done?.message || t("acceptLead"),
    pending: track?.slow ? t("slow") : online ? t("payLeadOnline", { provider: t(`providers.${paidVia}.name`) }) : t("payLeadTelegram"),
    paid: track?.slow ? t("paidNoRoom") : "",
    chat: t("chatLead"),
    completed: "",
    cancelled: t("rejectedLead"),
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
          : phase === "pending" && payUrl && done?.payment
            ? [toOrders(false), <Btn key="pay" kind="primary" icon={<IconExternal />} onClick={() => goToPaymentPage(payUrl, done.payment?.id, done.payment?.amount)}>{t("payProceed", { provider: t(`providers.${paidVia}.name`) })}</Btn>]
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
        <div className={`dxcp-receipt is-${phase}`} role="status">
          <span className="dxcp-stamp" aria-hidden>
            {phase === "pending" || phase === "accepting" ? <IconHourglass /> : phase === "cancelled" ? <IconClose /> : <IconCheck />}
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
          {phase === "pending" && done && !online && !done.telegramSent ? <Banner tone="warn">{t("notDelivered")}</Banner> : null}
          {track?.offline && !ended && (phase === "pending" || phase === "paid") ? (
            <Banner tone="warn">
              {t("offline")}
            </Banner>
          ) : null}
        </div>
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
          <Field label={t("urgency")}>
            <span className="dxcp-chips">
              {PURCHASE_URGENCIES.map((u) => (
                <button key={u} type="button" className={urgency === u ? "is-on" : ""} aria-pressed={urgency === u} onClick={() => setUrgency(urgency === u ? "" : u)}>
                  {t(`urgencies.${u}`)}
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
          <Field label={t("providerTitle")}>
            <Seg<PurchaseProvider>
              label={t("providerTitle")}
              value={provider}
              onChange={(v) => (setProvider(v), setProvErr(""))}
              items={PURCHASE_PROVIDERS.map((pv) => {
                const Icon = PROVIDER_ICON[pv];
                return { id: pv, label: t(`providers.${pv}.name`), icon: <Icon /> };
              })}
            />
          </Field>
          <p className="dx-dlg__text dxcp-note">{t("totalNote")}</p>
          {provErr ? (
            <Banner tone="warn">
              <b>{t("providerOff", { provider: t(`providers.${provErr}.name`) })}</b> {t("providerOffText")}{" "}
              <Btn kind="primary" icon={<IconSend />} busy={busy} onClick={() => (setProvider("telegram_manual"), void submit("telegram_manual"))}>
                {t("providerUseTelegram")}
              </Btn>
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
              <dt>{l.label || l.id}</dt>
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
