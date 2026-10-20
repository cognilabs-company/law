"use client";

import "./secondOpinion.css";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, MessagesSquareIcon, MinusIcon, PlusIcon, RefreshCwIcon, UsersRoundIcon, VideoIcon, XIcon } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import IconButton from "@/components/ui/IconButton";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { ChoiceCards, type ChoiceCard } from "@/components/admin/studio/sx/form/ChoiceCards";
import { TagsInput } from "@/components/admin/studio/sx/form/TagsInput";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { glyph } from "@/components/admin/studio/sx/icons";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { isAborted } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { notify } from "@/lib/toast";
import {
  cleanDirections,
  createGroupOpinionRequest,
  eventKey,
  getGroupOptions,
  groupErrorOf,
  quoteGroupOpinion,
  sameSelection,
  trackOnce,
  type GroupError,
  type GroupOptions,
  type GroupPromotion,
  type GroupQuote,
  type GroupSelection,
} from "@/lib/services/secondOpinion";

const NEED_MAX = 2000;

function focusField(id: string): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  const target = el?.querySelector<HTMLElement>("input:not([disabled])") ?? el;
  target?.focus();
}
const DIRECTIONS_MAX = 10;

export function GroupPromotionCard({
  promo,
  orderId,
  sessionId,
  aiBase,
  onOpen,
  onDismiss,
}: {
  promo: GroupPromotion;
  orderId: string;
  sessionId: string;
  aiBase: string;
  onOpen: () => void;
  onDismiss: () => void;
}): ReactElement {
  const t = useTranslations("marketplace.orderDetail.opinionGroup");
  const titleId = useId();
  const ref = useRef<HTMLElement | null>(null);
  const ai = `${aiBase}.second-opinion.group`;

  useEffect(() => {
    const el = ref.current;
    if (!el || !sessionId) return;
    const key = eventKey(orderId, promo.placement, sessionId, "impression");
    const fire = () => trackOnce(orderId, { event: "impression", placement: promo.placement, sessionId, key, url: promo.eventUrl });
    if (typeof IntersectionObserver === "undefined") {
      fire();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) {
          fire();
          io.disconnect();
        }
      },
      { threshold: [0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [orderId, promo.placement, promo.eventUrl, sessionId]);

  return (
    <section ref={ref} className="msog" aria-labelledby={titleId} data-placement={promo.placement || undefined} data-ai-id={ai} data-ai-type="section" data-ai-label={promo.title}>
      <span className="msog__mark" aria-hidden="true">
        {glyph(UsersRoundIcon, { size: 22 })}
      </span>
      <div className="msog__body">
        <p className="msog__kicker">{t("kicker")}</p>
        <h3 className="msog__title" id={titleId}>
          {promo.title}
        </h3>
        {promo.description ? <p className="msog__desc">{promo.description}</p> : null}
        {promo.benefits.length ? (
          <ul className="msog__benefits" role="list">
            {promo.benefits.map((b, i) => (
              <li key={`${i}-${b}`}>
                {glyph(CheckIcon, { size: 16, className: "msog__tick" })}
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="msog__acts">
          <SxButton variant="primary" icon={UsersRoundIcon} onClick={onOpen} aiId={`${ai}.open`} className="msog__cta">
            {promo.ctaLabel || t("ctaFallback")}
          </SxButton>
        </div>
      </div>
      {promo.dismissible ? (
        <IconButton className="msog__x" label={t("dismiss")} icon={glyph(XIcon, { size: 16 })} onClick={onDismiss} aiId={`${ai}.dismiss`} size="sm" />
      ) : null}
    </section>
  );
}

type Step = "select" | "confirm";
type LoadState = "loading" | "ready" | "error";
type FieldErr = { channel?: string; count?: string };

export function GroupOpinionDialog({
  open,
  promo,
  orderId,
  sessionId,
  aiBase,
  onClose,
  onGone,
  onPlacement,
}: {
  open: boolean;
  promo: GroupPromotion;
  orderId: string;
  sessionId: string;
  aiBase: string;
  onClose: () => void;
  onGone: (e: GroupError) => void;
  onPlacement: () => void;
}): ReactElement {
  const t = useTranslations("marketplace.orderDetail.opinionGroup");
  const td = useTranslations("marketplace.orderDetail");
  const te = useTranslations("enums");
  const router = useRouter();
  const uid = useId();
  const ai = `${aiBase}.second-opinion.group.modal`;
  const [tick, setTick] = useState(0);
  const [load, setLoad] = useState<{ state: LoadState; options: GroupOptions | null }>({ state: "loading", options: null });
  const [step, setStep] = useState<Step>("select");
  const [channelPick, setChannel] = useState("");
  const [countPick, setCount] = useState<number | null>(null);
  const [dirs, setDirs] = useState<string[]>([]);
  const [quote, setQuote] = useState<GroupQuote | null>(null);
  const [need, setNeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SxDialogErrorText>(null);
  const [blocked, setBlocked] = useState("");
  const [fieldErr, setFieldErr] = useState<FieldErr>({});
  const goneRef = useRef(onGone);

  useEffect(() => {
    goneRef.current = onGone;
  }, [onGone]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    getGroupOptions(orderId, promo.optionsUrl, ctrl.signal)
      .then((options) => {
        if (ctrl.signal.aborted) return;
        setLoad({ state: "ready", options });
        trackOnce(orderId, { event: "selection_started", placement: promo.placement, sessionId, key: eventKey(orderId, promo.placement, sessionId, "selection_started"), url: promo.eventUrl });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || isAborted(e)) return;
        const info = groupErrorOf(e);
        if (info.kind === "unavailable" || info.kind === "not_found") {
          goneRef.current(info);
          return;
        }
        if (info.kind === "ineligible") setBlocked(t("errors.ineligible"));
        setLoad({ state: "error", options: null });
      });
    return () => ctrl.abort();
  }, [open, orderId, promo.optionsUrl, promo.placement, promo.eventUrl, sessionId, tick, t]);

  const options = load.options;
  const channels = options?.channels ?? [];
  const channel = channels.some((c) => c.value === channelPick) ? channelPick : channels.length === 1 ? channels[0].value : channelPick;
  const lo = options?.countMin ?? 2;
  const hi = options?.countMax ?? 7;
  const count = countPick ?? options?.countDefault ?? lo;
  const selection: GroupSelection = { channel, lawyerCount: count, directions: cleanDirections(dirs) };
  const liveQuote = quote && sameSelection(quote, selection) ? quote : null;
  const suggestions = options?.directions ?? [];
  const custom = dirs.filter((d) => !suggestions.some((s) => s.toLocaleLowerCase() === d.toLocaleLowerCase()));

  const channelName = (value: string): string => {
    const hit = channels.find((c) => c.value === value);
    if (hit?.label) return hit.label;
    return value === "video" ? t("channelVideo") : value === "chat" ? t("channelChat") : value;
  };
  const cards: ChoiceCard[] = channels.map((c) => ({
    value: c.value,
    title: channelName(c.value),
    description: c.value === "video" ? t("channelVideoHint") : c.value === "chat" ? t("channelChatHint") : undefined,
    icon: c.value === "chat" ? MessagesSquareIcon : VideoIcon,
  }));

  const dropQuote = () => {
    setQuote(null);
    setError(null);
  };

  const toggleDir = (d: string) => {
    dropQuote();
    setDirs((cur) => (cur.some((x) => x.toLocaleLowerCase() === d.toLocaleLowerCase()) ? cur.filter((x) => x.toLocaleLowerCase() !== d.toLocaleLowerCase()) : [...cur, d].slice(0, DIRECTIONS_MAX)));
  };

  const failWith = (e: unknown, fallback: string) => {
    const info = groupErrorOf(e);
    if (info.kind === "unavailable" || info.kind === "not_found") {
      onGone(info);
      return;
    }
    if (info.kind === "placement") {
      onPlacement();
      setError({ title: t("errors.placement"), text: "" });
      return;
    }
    if (info.kind === "channel") {
      setStep("select");
      setQuote(null);
      setFieldErr({ channel: t("channelRequired") });
      return;
    }
    if (info.kind === "count") {
      setStep("select");
      setQuote(null);
      setFieldErr({ count: t("countInvalid", { min: lo, max: hi }) });
      return;
    }
    if (info.kind === "ineligible") {
      setBlocked(info.message && info.message !== info.code ? info.message : t("errors.ineligible"));
      return;
    }
    if (info.kind === "auth") {
      setError({ title: t("errors.auth"), text: "" });
      return;
    }
    setError({ title: fallback, text: info.message && info.message !== fallback ? info.message : "" });
  };

  const askQuote = async () => {
    if (busy || !options) return;
    const next: FieldErr = {};
    if (!channel) next.channel = t("channelRequired");
    if (count < lo || count > hi) next.count = t("countInvalid", { min: lo, max: hi });
    setFieldErr(next);
    if (next.channel || next.count) {
      focusField(next.channel ? `${uid}-channel` : `${uid}-count-out`);
      return;
    }
    if (liveQuote) {
      setStep("confirm");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const q = await quoteGroupOpinion(orderId, { ...selection, sessionId, url: options.quoteUrl || promo.quoteUrl });
      setQuote(q);
      setStep("confirm");
      trackOnce(orderId, { event: "quote_viewed", placement: promo.placement, sessionId, key: eventKey(orderId, promo.placement, sessionId, "quote_viewed", q.key.split(":quote:")[1] ?? ""), url: promo.eventUrl, metadata: q.eventId ? { quote_event_id: q.eventId } : undefined });
    } catch (e) {
      failWith(e, t("errors.quote"));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy || !liveQuote || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createGroupOpinionRequest(liveQuote, orderId, sessionId, need.slice(0, NEED_MAX));
      trackOnce(orderId, { event: "request_created", placement: promo.placement, sessionId, key: eventKey(orderId, promo.placement, sessionId, "request_created", created.id || created.workId || liveQuote.key), url: promo.eventUrl, metadata: created.id ? { urgent_request_id: created.id } : undefined });
      notify.success(t("created"), { id: "second-opinion-group", body: created.workId ? t("createdWork", { id: created.workId }) : t("createdText") });
      onClose();
      const target = created.id ? `/portal/client/urgent?request=${encodeURIComponent(created.id)}` : "/portal/client/urgent";
      router.push(target);
    } catch (e) {
      failWith(e, t("errors.other"));
    } finally {
      setBusy(false);
    }
  };

  const money = (q: GroupQuote) => `${fmtUzs(q.amount)} ${q.currency === "UZS" ? te("currency") : q.currency}`;
  const errId = `${uid}-err`;

  const footer =
    load.state !== "ready" ? (
      <SxButton variant="ghost" onClick={onClose} aiId={`${ai}.close`}>
        {t("cancel")}
      </SxButton>
    ) : step === "select" ? (
      <>
        <SxButton variant="primary" busy={busy} disabled={!!blocked} onClick={() => void askQuote()} aria-describedby={error ? errId : undefined} aiId={`${ai}.quote`}>
          {busy ? t("quoting") : t("quote")}
        </SxButton>
        <SxButton variant="ghost" onClick={onClose} disabled={busy} aiId={`${ai}.cancel`}>
          {t("cancel")}
        </SxButton>
      </>
    ) : (
      <>
        <SxButton variant="primary" busy={busy} disabled={!liveQuote || !!blocked} onClick={() => void submit()} aria-describedby={error ? errId : undefined} aiId={`${ai}.submit`}>
          {busy ? t("sending") : t("submit")}
        </SxButton>
        <SxButton
          variant="ghost"
          onClick={() => {
            dropQuote();
            setStep("select");
          }}
          disabled={busy}
          aiId={`${ai}.change`}
        >
          {t("change")}
        </SxButton>
      </>
    );

  return (
    <SxDialog open={open} onClose={onClose} title={t("dialogTitle")} description={step === "select" ? t("dialogLead") : t("confirmLead")} busy={busy} dirty={!!need.trim()} aiId={ai} footer={footer}>
      <div className="msog-dlg" data-step={step}>
        <SxDialogError error={error} id={errId} />
        {blocked ? (
          <SxNote tone="warn" role="alert" className="msog-dlg__blocked">
            {blocked}
          </SxNote>
        ) : null}
        {load.state === "loading" ? (
          <div className="msog-dlg__loading" aria-busy="true">
            <div className="sx-sk msog-dlg__sk" aria-hidden="true" />
            <div className="sx-sk msog-dlg__sk" data-h="sm" aria-hidden="true" />
            <p className="sx-vh" role="status">
              {t("loading")}
            </p>
          </div>
        ) : load.state === "error" ? (
          blocked ? null : (
            <SxNote
              tone="error"
              role="status"
              action={
                <SxButton size="sm" variant="ghost" icon={RefreshCwIcon} onClick={() => { setLoad({ state: "loading", options: null }); setTick((n) => n + 1); }} aiId={`${ai}.retry`}>
                  {td("retry")}
                </SxButton>
              }
            >
              {t("loadError")}
            </SxNote>
          )
        ) : step === "select" ? (
          <div className="msog-dlg__form">
            {options?.serviceTitle ? <p className="msog-dlg__svc">{t("forService", { service: options.serviceTitle })}</p> : null}
            <Field id={`${uid}-channel`} label={t("channel")} required error={fieldErr.channel} as="fieldset">
              {(a11y) => (
                <ChoiceCards
                  {...a11y}
                  id={`${uid}-channel`}
                  value={channel}
                  onChange={(v) => {
                    dropQuote();
                    setChannel(v);
                    setFieldErr((f) => ({ ...f, channel: undefined }));
                  }}
                  options={cards}
                  columns={cards.length > 1 ? 2 : 1}
                  aiId={`${ai}.channel`}
                />
              )}
            </Field>
            <Field id={`${uid}-count`} label={t("count")} required hint={t("countHint", { min: lo, max: hi })} error={fieldErr.count} as="fieldset">
              <div className="msog-count" role="group" aria-labelledby={`${uid}-count-label`}>
                <IconButton
                  variant="line"
                  label={t("countLess")}
                  icon={glyph(MinusIcon, { size: 16 })}
                  disabled={count <= lo}
                  onClick={() => {
                    dropQuote();
                    setCount(Math.max(lo, count - 1));
                    setFieldErr((f) => ({ ...f, count: undefined }));
                  }}
                  aiId={`${ai}.count.less`}
                />
                <output className="msog-count__val sx-num" id={`${uid}-count-out`} tabIndex={-1} aria-live="polite">
                  {t("countValue", { n: count })}
                </output>
                <IconButton
                  variant="line"
                  label={t("countMore")}
                  icon={glyph(PlusIcon, { size: 16 })}
                  disabled={count >= hi}
                  onClick={() => {
                    dropQuote();
                    setCount(Math.min(hi, count + 1));
                    setFieldErr((f) => ({ ...f, count: undefined }));
                  }}
                  aiId={`${ai}.count.more`}
                />
              </div>
            </Field>
            <Field id={`${uid}-dirs`} label={t("directions")} hint={t("directionsHint")} as="fieldset">
              {suggestions.length ? (
                <div className="msog-chips" role="group" aria-labelledby={`${uid}-dirs-label`}>
                  {suggestions.map((s) => {
                    const on = dirs.some((x) => x.toLocaleLowerCase() === s.toLocaleLowerCase());
                    return (
                      <button
                        key={s}
                        type="button"
                        className="msog-chip"
                        aria-pressed={on}
                        onClick={() => toggleDir(s)}
                        data-ai-id={makeAiId(`${ai}.direction`, s)}
                        data-ai-type="button"
                        data-ai-label={s}
                      >
                        {on ? glyph(CheckIcon, { size: 14 }) : glyph(PlusIcon, { size: 14 })}
                        <span>{s}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <TagsInput
                id={`${uid}-dirs-own`}
                label={t("directionsOther")}
                value={custom}
                onChange={(next) => {
                  dropQuote();
                  const picked = dirs.filter((d) => suggestions.some((s) => s.toLocaleLowerCase() === d.toLocaleLowerCase()));
                  setDirs(cleanDirections([...picked, ...next]).slice(0, DIRECTIONS_MAX));
                }}
                placeholder={t("directionsOtherPh")}
                max={DIRECTIONS_MAX}
                aiId={`${ai}.direction.own`}
              />
            </Field>
          </div>
        ) : liveQuote ? (
          <div className="msog-dlg__confirm">
            <dl className="msog-sum">
              <div>
                <dt>{t("channel")}</dt>
                <dd>{channelName(liveQuote.channel)}</dd>
              </div>
              <div>
                <dt>{t("count")}</dt>
                <dd className="sx-num">{t("countValue", { n: liveQuote.lawyerCount })}</dd>
              </div>
              <div>
                <dt>{t("directions")}</dt>
                <dd>{liveQuote.directions.length ? liveQuote.directions.join(", ") : t("noDirections")}</dd>
              </div>
            </dl>
            <div className="msog-price" data-ai-id={`${ai}.price`} data-ai-type="section" data-ai-label={t("price")}>
              {liveQuote.priceVisible && liveQuote.amount > 0 ? (
                <>
                  <span className="msog-price__label">{t("price")}</span>
                  <b className="msog-price__value sx-num">{money(liveQuote)}</b>
                </>
              ) : (
                <span className="msog-price__later">{t("priceLater")}</span>
              )}
            </div>
            <Field id={`${uid}-need`} label={t("need")} hint={t("needHint")}>
              {(a11y) => <TextArea {...a11y} value={need} onChange={(v) => setNeed(v.slice(0, NEED_MAX))} maxLength={NEED_MAX} counter minRows={3} placeholder={t("needPh")} disabled={busy} aiId={`${ai}.need`} aiLabel={t("need")} />}
            </Field>
          </div>
        ) : null}
      </div>
    </SxDialog>
  );
}
