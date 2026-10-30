"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { IconAlert, IconClock, IconCoins, IconRefresh, IconSend, IconSparkle } from "@/components/icons";
import { isAborted } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { getPriceOptions, getPriceQuote, type PriceOptionSection, type PriceQuote, type PriceTarget } from "@/lib/services/priceOptions";
import { PRICE_OPTION_ERRORS, marketErrorCode, requestAdditionalPayment, type MarketOrder, type SupplementalPayment } from "@/lib/services/marketplace";
import { OptionGroups } from "./PriceOptions";
import { OptionLines } from "./OrderExtras";
import { useMarketError } from "./useMarketError";
import { useGuardedField } from "@/components/ui/ContactGuardNote";

const NOTE_MAX = 1000;

type Form = { key: string; status: "loading" | "ready" | "error"; sections: PriceOptionSection[]; error: unknown };
type Quote = { key: string; quote: PriceQuote | null; error: unknown };

export default function SupplementalDialog({ order, onClose, onSent }: { order: MarketOrder | null; onClose: () => void; onSent: (s: SupplementalPayment | null) => void }) {
  const tcm = useTranslations("common");
  const t = useTranslations("marketplace.supplemental");
  const tp = useTranslations("marketplace.priceOptions");
  const marketErr = useMarketError();
  const target: PriceTarget = order?.packageId ? "package" : "service";
  const targetId = order ? order.packageId || order.serviceId : "";
  const key = order ? `${order.id}:${target}:${targetId}` : "";
  const [form, setForm] = useState<Form>({ key: "", status: "loading", sections: [], error: null });
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const noteGuard = useGuardedField(note, (v) => setNote(v.slice(0, NOTE_MAX)), "client");
  const [quote, setQuote] = useState<Quote>({ key: "", quote: null, error: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reload, setReload] = useState(0);
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setPicked([]);
    setNote("");
    setErr("");
  }
  const paidIds = order ? order.selectedOptions.map((o) => o.id).filter(Boolean) : [];
  const paidKey = paidIds.join("|");

  useEffect(() => {
    if (!order || !targetId) return;
    const c = new AbortController();
    getPriceOptions(target, targetId, c.signal)
      .then((f) => {
        const known = new Set(f.sections.flatMap((s) => s.options.map((o) => o.id)));
        setForm({ key, status: "ready", sections: f.sections, error: null });
        setPicked((cur) => cur.filter((id) => known.has(id)));
      })
      .catch((e: unknown) => {
        if (!isAborted(e)) setForm({ key, status: "error", sections: [], error: e });
      });
    return () => c.abort();
  }, [order, key, target, targetId, reload]);

  const pickedKey = picked.join("|");
  const quoteKey = `${key}|${pickedKey}`;
  useEffect(() => {
    if (!order || !targetId || !pickedKey) return;
    const c = new AbortController();
    const ids = [...(paidKey ? paidKey.split("|") : []), ...pickedKey.split("|")];
    const timer = setTimeout(() => {
      getPriceQuote(target, targetId, ids, { lawyerUserId: order.lawyerUserId, signal: c.signal })
        .then((q) => setQuote({ key: quoteKey, quote: q, error: null }))
        .catch((e: unknown) => {
          if (!isAborted(e)) setQuote({ key: quoteKey, quote: null, error: e });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [order, target, targetId, paidKey, pickedKey, quoteKey]);

  if (!order) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const target0 = order;
  const mine = form.key === key;
  const paid = new Set(paidIds);
  const sections = (mine ? form.sections : []).map((s) => ({ ...s, options: s.options.filter((o) => !paid.has(o.id)) })).filter((s) => s.options.length);
  const q = quote.key === quoteKey ? quote.quote : null;
  const qErr = quote.key === quoteKey ? quote.error : null;
  const pending = picked.length > 0 && quote.key !== quoteKey;

  async function send() {
    if (busy || !picked.length || pending) return;
    setBusy(true);
    setErr("");
    try {
      const s = await requestAdditionalPayment(target0.id, { selectedOptionIds: picked, note: note.slice(0, NOTE_MAX) });
      onSent(s);
      onClose();
    } catch (e) {
      setErr(marketErr(e, t("error")));
      if (PRICE_OPTION_ERRORS.includes(marketErrorCode(e))) setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={t("title")} size="lg">
      <div className="mk-act mks" data-ai-id="advocate.marketplace-orders.supplemental-modal" data-ai-type="modal" data-ai-label={t("title")}>
        <div className="mk-act__head">
          {target0.workId ? <span className="wid">{target0.workId}</span> : null}
          <b>{target0.serviceTitle || target0.packageTitle}</b>
        </div>
        <ul className="mks__rules">
          <li>
            <IconClock aria-hidden="true" />
            {t("rule24h")}
          </li>
          <li>
            <IconAlert aria-hidden="true" />
            {t("rulePause")}
          </li>
          <li>
            <IconCoins aria-hidden="true" />
            {t("ruleIncrease")}
          </li>
        </ul>
        <OptionLines options={target0.selectedOptions} title={t("alreadyPaid")} />

        {!targetId ? (
          <Notice ok={false} msg={t("noTarget")} />
        ) : !mine || form.status === "loading" ? (
          <div className="pxo__sk" aria-busy="true">
            <span />
            <span />
          </div>
        ) : form.status === "error" ? (
          <p className="pxo__err" role="alert">
            <IconAlert aria-hidden />
            <span>{marketErr(form.error, tp("optionsFailed"))}</span>
            <button type="button" onClick={() => setReload((n) => n + 1)}>
              <IconRefresh aria-hidden />
              {tp("retry")}
            </button>
          </p>
        ) : !sections.length ? (
          <Notice ok={false} msg={t("noOptions")} />
        ) : (
          <div className="pxo">
            <div className="pxo__head">
              <span className="pxo__ico" aria-hidden>
                <IconSparkle />
              </span>
              <span>
                <b>{t("pickTitle")}</b>
                <small>{t("pickLead")}</small>
              </span>
              {picked.length ? <em className="pxo__count">{tp("picked", { n: picked.length })}</em> : null}
            </div>
            <OptionGroups sections={sections} picked={picked} onToggle={(id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))} disabled={busy} />
            {picked.length ? (
              <div className={`pxo__sum${pending ? " is-busy" : ""}`} aria-live="polite">
                <div className="pxo__row">
                  <span>{t("paidTotal")}</span>
                  <b>{tp("fixedPlain", { price: fmtUzs(target0.price) })}</b>
                </div>
                {q?.breakdown
                  .filter((l) => picked.includes(l.id))
                  .map((l, i) => (
                    <div key={`${l.id}-${i}`} className="pxo__row is-add">
                      <span>{l.label || tcm("option")}</span>
                      <b>{tp("fixed", { price: fmtUzs(l.amount) })}</b>
                    </div>
                  ))}
                <div className="pxo__row is-total">
                  <span>{t("newTotal")}</span>
                  <b>{pending ? <span className="pxo__spin" aria-label={tp("calculating")} /> : q ? tp("fixedPlain", { price: fmtUzs(q.totalPrice) }) : "—"}</b>
                </div>
              </div>
            ) : null}
            {qErr ? <Notice ok={false} msg={marketErr(qErr, tp("quoteFailed"))} /> : null}
          </div>
        )}

        <label className="mk-in">
          <span>{t("noteLabel")}</span>
          <textarea value={note} onChange={(e) => noteGuard.change(e.target.value, e)} onBlur={noteGuard.blur} rows={3} maxLength={NOTE_MAX} placeholder={t("notePh")} data-ai-id="advocate.marketplace-orders.supplemental.note" />
        </label>
        {noteGuard.note}
        {err ? <Notice ok={false} msg={err} /> : null}
        <div className="mk-buy__acts">
          <button type="button" className="btn btn--grad" disabled={busy || !picked.length || pending} onClick={() => void send()} data-ai-id="advocate.marketplace-orders.supplemental.submit">
            <IconSend aria-hidden="true" />
            {busy ? t("sending") : t("submit")}
          </button>
          <button type="button" className="btn btn--line" disabled={busy} onClick={onClose}>
            {t("keep")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
