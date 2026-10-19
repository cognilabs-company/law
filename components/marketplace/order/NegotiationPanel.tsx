"use client";

import "./deal.css";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { MoneyInput } from "@/components/admin/studio/sx/form/MoneyInput";
import type { SxIcon } from "@/components/admin/studio/sx/types";
import { useTick } from "@/components/marketplace/OrderExtras";
import { useMarketError } from "@/components/marketplace/useMarketError";
import { useAuth } from "@/lib/auth";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { parseServerTime } from "@/lib/http";
import { marketErrorInfo, priceCapOf, proposeNegotiation, respondNegotiation, type Negotiation, type NegotiationResponse } from "@/lib/services/marketRuntime";
import { CheckIcon, CircleCheckIcon, TimerIcon, CoinsIcon, HandCoinsIcon, HourglassIcon, BanIcon, XIcon, glyph } from "./icons";
import { SECTION_ID, type OrderSectionProps } from "./types";
import { canProposeNegotiation, counterProblem, negotiationActions, negotiationCap, negotiationErrorKey, negotiationStateOf, pickNegotiation, proposalProblem, showNegotiation, type NegotiationState } from "./negotiationRules";
import { noteNegotiation, useNotedNegotiation } from "./negotiationStore";

const NOTE_MAX = 500;

type Busy = "" | "propose" | "accept" | "counter" | "reject";

const STATE_TONE: Readonly<Record<NegotiationState, string>> = {
  none: "draft",
  proposed: "submitted",
  countered: "review",
  accepted: "published",
  rejected: "returned",
  expired: "archived",
};

const STATE_ICON: Readonly<Record<NegotiationState, SxIcon>> = {
  none: HourglassIcon,
  proposed: HourglassIcon,
  countered: CoinsIcon,
  accepted: CircleCheckIcon,
  rejected: BanIcon,
  expired: TimerIcon,
};

function focusById(id: string): void {
  if (typeof document === "undefined") return;
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

export default function NegotiationPanel({ o, phase, view, aiBase, runtime, onChanged }: OrderSectionProps): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail");
  const te = useTranslations("enums");
  const locale = useLocale();
  const marketError = useMarketError();
  const uid = useId();
  const owner = useAuth().session?.id ?? "";
  const noted = useNotedNegotiation(o.id, owner);
  const [last, setLast] = useState<Negotiation | null>(null);
  const n = pickNegotiation(o.negotiation, last, noted);
  const base = negotiationStateOf(n, 0);
  const now = useTick(base === "proposed" || base === "countered", 60_000);
  const st = negotiationStateOf(n, now);

  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [note, setNote] = useState("");
  const [amountErr, setAmountErr] = useState("");
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState<number | undefined>(undefined);
  const [responseNote, setResponseNote] = useState("");
  const [counterErr, setCounterErr] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<Busy>("");
  const [live, setLive] = useState("");

  const acceptedAmount = st === "accepted" && n ? n.counterAmount || n.amount : 0;
  const acceptedKey = view === "client" && st === "accepted" && n && acceptedAmount > 0 ? `${n.id}:${acceptedAmount}` : "";
  const patched = useRef("");
  useEffect(() => {
    if (!acceptedKey || patched.current === acceptedKey) return;
    patched.current = acceptedKey;
    if (acceptedAmount !== o.price) onChanged({ price: acceptedAmount });
  }, [acceptedKey, acceptedAmount, o.price, onChanged]);

  if (!showNegotiation(o, phase, runtime, noted)) return null;
  if (view === "seller" && !n) return null;

  const ai = `${aiBase}.negotiation`;
  const cur = (v: number) => `${fmtUzs(v)} ${!o.currency || o.currency === "UZS" ? te("currency") : o.currency}`;
  const cap = negotiationCap(runtime ? priceCapOf(runtime.pricing) : null, n);
  const mayPropose = canProposeNegotiation(o);
  const errParams = { price: cur(o.price), max: cap !== null ? cur(cap) : "—" };
  const amountId = `${uid}-amount`;
  const noteId = `${uid}-note`;
  const counterId = `${uid}-counter`;
  const responseId = `${uid}-response`;

  const leftLabel = (ms: number): string => {
    const total = Math.max(0, Math.floor(ms / 60000));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h > 0) return m ? `${t("duration.hour", { n: h })} ${t("duration.minute", { n: m })}` : t("duration.hour", { n: h });
    return t("duration.minute", { n: Math.max(1, m) });
  };

  const stamp = (iso: string): string => {
    const at = iso ? parseServerTime(iso) : NaN;
    return Number.isFinite(at) ? shortDateTime(new Date(at).toISOString(), locale) : "";
  };

  const withOrder = (r: Negotiation, fallback: Partial<Negotiation> = {}): Negotiation => ({
    ...r,
    id: r.id || fallback.id || n?.id || "",
    orderId: r.orderId || o.id,
    status: r.status || fallback.status || "",
    amount: r.amount || fallback.amount || 0,
    note: r.note || fallback.note || "",
  });

  const fail = (e: unknown, fallback: "generic" | "respond", place: "amount" | "counter" | "none") => {
    const info = marketErrorInfo(e);
    const key = negotiationErrorKey(info?.code ?? "");
    if (key) {
      const serverMax = cap === null && info ? Number(info.detail.maximum_price ?? info.detail.max_price) : Number.NaN;
      const maxText = cap !== null ? cur(cap) : Number.isFinite(serverMax) && serverMax > 0 ? cur(serverMax) : "";
      const msg = key === "aboveMax" && !maxText ? t("negotiation.err.aboveMaxNoValue") : t(`negotiation.err.${key}`, { ...errParams, max: maxText || "—" });
      if (key === "notLower" && place === "amount") {
        setAmountErr(msg);
        focusById(amountId);
      } else if (key === "aboveMax" && place === "counter") {
        setCounterErr(msg);
        focusById(counterId);
      } else setErr(msg);
      if (key === "alreadyResolved") onChanged();
      return;
    }
    setErr(marketError(e, t(`negotiation.err.${fallback}`)));
  };

  const propose = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (busy) return;
    setErr("");
    const problem = proposalProblem(amount, o.price);
    if (problem || amount === undefined) {
      setAmountErr(t(`negotiation.err.${problem ?? "required"}`, errParams));
      focusById(amountId);
      return;
    }
    setAmountErr("");
    setBusy("propose");
    try {
      const r = withOrder(await proposeNegotiation(o.id, { amount, note }), { status: "pending", amount, note: note.trim() });
      setLast(r);
      noteNegotiation(r, owner);
      onChanged({ negotiation: r });
      setFormOpen(false);
      setAmount(undefined);
      setNote("");
      setLive(t("negotiation.sent"));
    } catch (e) {
      fail(e, "generic", "amount");
    } finally {
      setBusy("");
    }
  };

  const respond = async (input: NegotiationResponse, kind: Exclude<Busy, "" | "propose">) => {
    if (busy || !n?.id) return;
    setErr("");
    setBusy(kind);
    try {
      const fallbackStatus = input.action === "accept" ? "accepted" : input.action === "reject" ? "rejected" : "countered";
      const raw = await respondNegotiation(n.id, input);
      const r = withOrder(raw, { id: n.id, status: fallbackStatus });
      const merged = input.action === "counter" && !r.counterAmount ? { ...r, counterAmount: Math.round(input.amount) } : r;
      setLast(merged);
      noteNegotiation(merged, owner);
      const accepted = input.action === "accept";
      onChanged({ negotiation: merged, ...(accepted ? { price: merged.counterAmount || merged.amount || n.counterAmount || n.amount } : {}) });
      setCounterOpen(false);
      setCounterAmount(undefined);
      setResponseNote("");
      setLive(t(`negotiation.state.${fallbackStatus}`));
    } catch (e) {
      fail(e, "respond", kind === "counter" ? "counter" : "none");
    } finally {
      setBusy("");
    }
  };

  const sendCounter = (ev?: FormEvent) => {
    ev?.preventDefault();
    const problem = counterProblem(counterAmount, cap);
    if (problem || counterAmount === undefined) {
      setCounterErr(t(`negotiation.err.${problem ?? "required"}`, errParams));
      focusById(counterId);
      return;
    }
    setCounterErr("");
    void respond({ action: "counter", amount: counterAmount, note: responseNote }, "counter");
  };

  const chip = (s: NegotiationState) => (
    <span className="sx-pill mng-chip" data-tone={STATE_TONE[s]}>
      {glyph(STATE_ICON[s], { size: 14 })}
      <span className="sx-pill__text">{t(`negotiation.state.${s}`)}</span>
    </span>
  );

  const expiry = (x: Negotiation) => {
    if (st !== "proposed" && st !== "countered") return null;
    const at = x.expiresAt ? parseServerTime(x.expiresAt) : NaN;
    const remind = x.reminderAt ? parseServerTime(x.reminderAt) : NaN;
    const urgent = now > 0 && Number.isFinite(remind) && now >= remind;
    if (!Number.isFinite(at) && !Number.isFinite(remind)) return null;
    return (
      <div className="mng-expiry">
        {Number.isFinite(at) ? (
          <p className="mng-expiry__left">
            {glyph(TimerIcon, { size: 16 })}
            <span>
              {now > 0 ? <b>{t("negotiation.expiresIn", { time: leftLabel(at - now) })}</b> : null}
              {now > 0 ? " · " : null}
              {t("negotiation.expiresAt", { date: stamp(x.expiresAt) })}
            </span>
          </p>
        ) : null}
        <p className="mng-expiry__remind" data-tone={urgent ? "warn" : undefined}>
          {urgent ? t("negotiation.reminderNow") : t("negotiation.reminder")}
        </p>
      </div>
    );
  };

  const offer = (label: string, value: number, text: string, s: NegotiationState, extra?: ReactElement | null, chipOn = true) => (
    <div className="mng-offer" data-state={s}>
      <div className="mng-offer__top">
        <span className="mng-offer__label">{label}</span>
        {chipOn ? chip(s) : null}
      </div>
      <p className="mng-offer__amount sx-num">{value > 0 ? cur(value) : "—"}</p>
      {text ? <blockquote className="mng-offer__note">{text}</blockquote> : null}
      {extra}
    </div>
  );

  const errNote = err ? (
    <SxNote tone="error" className="mng-err">
      {err}
    </SxNote>
  ) : null;

  const proposeForm = (
    <form className="mng-form" onSubmit={(e) => void propose(e)} noValidate>
      <div className="mng-form__grid">
        <Field id={amountId} label={t("negotiation.amountLabel")} required hint={t("negotiation.amountHint", { price: cur(o.price) })} error={amountErr}>
          {(a11y) => (
            <MoneyInput
              {...a11y}
              value={amount}
              onChange={(v) => {
                setAmount(v);
                if (amountErr) setAmountErr("");
              }}
              currency={o.currency || "UZS"}
              min={1}
              max={o.price > 0 ? o.price - 1 : null}
              disabled={busy === "propose"}
              aiId={`${ai}.amount`}
              aiLabel={t("negotiation.amountLabel")}
            />
          )}
        </Field>
        <Field id={noteId} label={t("negotiation.noteLabel")}>
          {(a11y) => (
            <TextArea
              {...a11y}
              value={note}
              onChange={(v) => setNote(v.slice(0, NOTE_MAX))}
              maxLength={NOTE_MAX}
              counter
              minRows={2}
              placeholder={t("negotiation.notePh")}
              disabled={busy === "propose"}
              aiId={`${ai}.note`}
              aiLabel={t("negotiation.noteLabel")}
            />
          )}
        </Field>
      </div>
      {errNote}
      <div className="mng-actions">
        <SxButton type="submit" variant="primary" icon={HandCoinsIcon} busy={busy === "propose"} aiId={`${ai}.submit`}>
          {busy === "propose" ? t("negotiation.sending") : t("negotiation.submit")}
        </SxButton>
        {formOpen && (st === "proposed" || st === "countered") ? (
          <SxButton variant="ghost" onClick={() => setFormOpen(false)} disabled={busy === "propose"}>
            {t("negotiation.cancelCounter")}
          </SxButton>
        ) : null}
      </div>
    </form>
  );

  let body: ReactElement | null = null;
  if (view === "client") {
    if (st === "accepted" && n) {
      body = (
        <SxNote tone="success" title={t("negotiation.agreedPrice", { price: cur(acceptedAmount) })}>
          {t("negotiation.acceptedText")}
        </SxNote>
      );
    } else if (st === "none" || st === "rejected" || st === "expired" || formOpen) {
      body = (
        <>
          {st === "rejected" || st === "expired" ? (
            <SxNote tone="info" role="none" title={t(`negotiation.state.${st}`)}>
              {t(st === "rejected" ? "negotiation.rejectedText" : "negotiation.expiredText")}
            </SxNote>
          ) : null}
          {mayPropose ? (
            proposeForm
          ) : (
            <SxNote tone="info" role="note">
              {t("negotiation.closedText")}
            </SxNote>
          )}
        </>
      );
    } else if (st === "proposed" && n) {
      body = offer(t("negotiation.yourOffer"), n.amount, n.note, st, expiry(n));
    } else if (st === "countered" && n) {
      const canAccept = negotiationActions(n).includes("accept");
      body = (
        <>
          {offer(t("negotiation.counterOffer"), n.counterAmount, n.responseNote, st, expiry(n))}
          <p className="mng-line">{t("negotiation.counterClient", { price: n.counterAmount > 0 ? cur(n.counterAmount) : "—" })}</p>
          {errNote}
          <div className="mng-actions">
            {canAccept ? (
              <SxButton variant="primary" icon={CheckIcon} busy={busy === "accept"} disabled={!!busy && busy !== "accept"} onClick={() => void respond({ action: "accept" }, "accept")} aiId={`${ai}.accept`}>
                {t("negotiation.acceptCounter")}
              </SxButton>
            ) : null}
            {mayPropose ? (
            <SxButton
              variant={canAccept ? "secondary" : "primary"}
              icon={HandCoinsIcon}
              disabled={!!busy}
              onClick={() => {
                setErr("");
                setFormOpen(true);
                focusById(amountId);
              }}
              aiId={`${ai}.propose-again`}
            >
              {t("negotiation.proposeAgain")}
            </SxButton>
            ) : null}
          </div>
        </>
      );
    }
  } else if (n) {
    if (st === "proposed") {
      body = (
        <>
          {offer(t("negotiation.clientOffer"), n.amount, n.note, st, expiry(n))}
          {counterOpen ? (
            <form className="mng-form" onSubmit={sendCounter} noValidate>
              <div className="mng-form__grid">
                <Field id={counterId} label={t("negotiation.counterLabel")} required hint={cap !== null ? t("negotiation.counterHint", { max: cur(cap) }) : t("negotiation.counterHintNoMax")} error={counterErr}>
                  {(a11y) => (
                    <MoneyInput
                      {...a11y}
                      value={counterAmount}
                      onChange={(v) => {
                        setCounterAmount(v);
                        if (counterErr) setCounterErr("");
                      }}
                      currency={o.currency || "UZS"}
                      min={1}
                      max={cap}
                      disabled={busy === "counter"}
                      aiId={`${ai}.counter-amount`}
                      aiLabel={t("negotiation.counterLabel")}
                    />
                  )}
                </Field>
                <Field id={responseId} label={t("negotiation.responseNoteLabel")}>
                  {(a11y) => (
                    <TextArea
                      {...a11y}
                      value={responseNote}
                      onChange={(v) => setResponseNote(v.slice(0, NOTE_MAX))}
                      maxLength={NOTE_MAX}
                      counter
                      minRows={2}
                      placeholder={t("negotiation.responseNotePh")}
                      disabled={busy === "counter"}
                      aiId={`${ai}.response-note`}
                      aiLabel={t("negotiation.responseNoteLabel")}
                    />
                  )}
                </Field>
              </div>
              {errNote}
              <div className="mng-actions">
                <SxButton type="submit" variant="primary" icon={CoinsIcon} busy={busy === "counter"} aiId={`${ai}.send-counter`}>
                  {busy === "counter" ? t("negotiation.sending") : t("negotiation.sendCounter")}
                </SxButton>
                <SxButton
                  variant="ghost"
                  disabled={busy === "counter"}
                  onClick={() => {
                    setCounterOpen(false);
                    setCounterErr("");
                    setErr("");
                  }}
                  aiId={`${ai}.cancel-counter`}
                >
                  {t("negotiation.cancelCounter")}
                </SxButton>
              </div>
            </form>
          ) : (
            <>
              {errNote}
              <div className="mng-actions" data-seller="">
                <SxButton variant="primary" icon={CheckIcon} busy={busy === "accept"} disabled={!!busy && busy !== "accept"} onClick={() => void respond({ action: "accept" }, "accept")} aiId={`${ai}.accept`}>
                  {t("negotiation.accept")}
                </SxButton>
                <SxButton
                  variant="secondary"
                  icon={CoinsIcon}
                  disabled={!!busy}
                  onClick={() => {
                    setErr("");
                    setCounterOpen(true);
                    focusById(counterId);
                  }}
                  aiId={`${ai}.counter`}
                >
                  {t("negotiation.counter")}
                </SxButton>
                <SxButton variant="danger" icon={XIcon} busy={busy === "reject"} disabled={!!busy && busy !== "reject"} onClick={() => void respond({ action: "reject" }, "reject")} aiId={`${ai}.reject`}>
                  {t("negotiation.reject")}
                </SxButton>
              </div>
            </>
          )}
        </>
      );
    } else {
      body = (
        <>
          {offer(t("negotiation.clientOffer"), n.amount, n.note, st, null, !(n.counterAmount > 0))}
          {n.counterAmount > 0 ? offer(t("negotiation.counterOffer"), n.counterAmount, n.responseNote, st) : null}
          {errNote}
        </>
      );
    }
  }

  return (
    <SxPanel id={SECTION_ID.negotiation} className="mng" title={t("negotiation.title")} lead={view === "client" ? t("negotiation.leadClient") : st === "proposed" ? t("negotiation.leadSeller") : st === "countered" ? t("negotiation.leadSellerDone") : undefined} aiId={ai}>
      <dl className="mng-facts">
        <div>
          <dt>{t("negotiation.currentPrice")}</dt>
          <dd className="sx-num">{o.price > 0 ? cur(o.price) : "—"}</dd>
        </div>
      </dl>
      {body}
      <p className="sx-vh" role="status" aria-live="polite">
        {live}
      </p>
    </SxPanel>
  );
}
