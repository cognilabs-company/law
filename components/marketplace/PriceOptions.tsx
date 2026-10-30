"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, isAborted } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { getPriceOptions, getPriceQuote, type PriceOption, type PriceOptionSection, type PriceQuote, type PriceTarget } from "@/lib/services/priceOptions";
import { IconAlert, IconCheck, IconRefresh, IconSparkle } from "@/components/icons";
import { PRICE_OPTION_ERRORS, marketErrorCode } from "@/lib/services/marketplace";
import { useMarketError } from "./useMarketError";

export type PriceState = { ids: string[]; quote: PriceQuote | null; pending: boolean; failed: boolean };
export const EMPTY_PRICE: PriceState = { ids: [], quote: null, pending: true, failed: false };

type FormState = { key: string; status: "loading" | "ready" | "none" | "error"; sections: PriceOptionSection[] };

export function OptionAdd({ o }: { o: PriceOption }) {
  const t = useTranslations("marketplace.priceOptions");
  return <em className="pxo__add">{o.adjustmentType === "percent" ? t("percent", { n: o.value }) : t("fixed", { price: fmtUzs(o.value) })}</em>;
}

export function OptionGroups({ sections, picked, onToggle, disabled }: { sections: PriceOptionSection[]; picked: string[]; onToggle: (id: string) => void; disabled?: boolean }) {
  return (
    <div className="pxo__secs">
      {sections.map((s) => (
        <fieldset key={s.id} className="pxo__sec" disabled={disabled}>
          <legend>
            <b>{s.title}</b>
            {s.description ? <small>{s.description}</small> : null}
          </legend>
          <div className="pxo__list">
            {s.options.map((o) => {
              const on = picked.includes(o.id);
              return (
                <label key={o.id} className={`pxo__opt${on ? " is-on" : ""}`} data-ai-id={`marketplace.price-options.${o.id}`} data-ai-type="checkbox" data-ai-label={o.label}>
                  <input type="checkbox" checked={on} onChange={() => onToggle(o.id)} />
                  <span className="pxo__box" aria-hidden>
                    <IconCheck />
                  </span>
                  <span className="pxo__txt">
                    <b>{o.label}</b>
                    {o.description ? <small>{o.description}</small> : null}
                  </span>
                  <OptionAdd o={o} />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export type PriceOptionsModel = {
  status: FormState["status"];
  sections: PriceOptionSection[];
  picked: string[];
  quote: PriceQuote | null;
  pending: boolean;
  quoteError: unknown;
  toggle: (id: string) => void;
  retryForm: () => void;
  retryQuote: () => void;
};

// The extra options of a service or package and the quote for those picked:
// the options load once per target, the quote follows each pick (a moment
// after the last one), and the parent hears the ids, the quote and whether
// the price can be trusted yet. The web form and the desktop's purchase
// sheet both draw from this.
export function usePriceOptions({
  target,
  targetId,
  lawyerUserId,
  reload = 0,
  onChange,
}: {
  target: PriceTarget;
  targetId: string;
  lawyerUserId?: string;
  reload?: number;
  onChange: (s: PriceState) => void;
}): PriceOptionsModel {
  const key = `${target}:${targetId}:${lawyerUserId ?? ""}`;
  const [form, setForm] = useState<FormState>({ key: "", status: "loading", sections: [] });
  const [picked, setPicked] = useState<string[]>([]);
  const [quote, setQuote] = useState<{ ids: string[]; q: PriceQuote } | null>(null);
  const [pending, setPending] = useState(true);
  const [qErr, setQErr] = useState<unknown>(null);
  const [formTry, setFormTry] = useState(0);
  const [quoteTry, setQuoteTry] = useState(0);
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setPicked([]);
    setQuote(null);
    setPending(true);
    setQErr(null);
  }

  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });

  useEffect(() => {
    const c = new AbortController();
    getPriceOptions(target, targetId, c.signal)
      .then((f) => {
        const known = new Set(f.sections.flatMap((s) => s.options.map((o) => o.id)));
        setForm({ key, status: f.sections.length ? "ready" : "none", sections: f.sections });
        setPicked((cur) => (cur.every((id) => known.has(id)) ? cur : cur.filter((id) => known.has(id))));
      })
      .catch((e: unknown) => {
        if (isAborted(e)) return;
        setForm({ key, status: e instanceof ApiError && e.status === 404 ? "none" : "error", sections: [] });
      });
    return () => c.abort();
  }, [key, target, targetId, formTry, reload]);

  const pickedKey = picked.join("|");
  useEffect(() => {
    const c = new AbortController();
    const ids = pickedKey ? pickedKey.split("|") : [];
    const timer = setTimeout(
      () => {
        getPriceQuote(target, targetId, ids, { lawyerUserId, signal: c.signal })
          .then((q) => {
            setQuote({ ids, q });
            setQErr(null);
            setPending(false);
          })
          .catch((e: unknown) => {
            if (isAborted(e)) return;
            setQErr(e);
            setPending(false);
            if (PRICE_OPTION_ERRORS.includes(marketErrorCode(e))) setFormTry((n) => n + 1);
          });
      },
      ids.length ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [key, pickedKey, quoteTry, target, targetId, lawyerUserId]);

  useEffect(() => {
    cb.current({ ids: quote ? quote.ids : [], quote: quote ? quote.q : null, pending, failed: Boolean(qErr) && picked.length > 0 });
  }, [quote, pending, qErr, picked.length]);

  function toggle(id: string) {
    setPending(true);
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }
  function retryQuote() {
    setPending(true);
    setQErr(null);
    setQuoteTry((n) => n + 1);
  }

  const mine = form.key === key;
  return {
    status: mine ? form.status : "loading",
    sections: mine ? form.sections : [],
    picked,
    quote: quote?.q ?? null,
    pending,
    quoteError: qErr,
    toggle,
    retryForm: () => setFormTry((n) => n + 1),
    retryQuote,
  };
}

export default function PriceOptions(props: { target: PriceTarget; targetId: string; lawyerUserId?: string; reload?: number; onChange: (s: PriceState) => void }) {
  const tcm = useTranslations("common");
  const t = useTranslations("marketplace.priceOptions");
  const marketErr = useMarketError();
  const { target } = props;
  const m = usePriceOptions(props);
  const { sections, picked, pending, toggle, retryQuote } = m;
  const qErr = m.quoteError;
  const q = m.quote;
  const showSum = sections.length > 0 || (q?.breakdown.length ?? 0) > 0;

  return (
    <div className="pxo" data-ai-id={`marketplace.price-options.${target}`} data-ai-type="section" data-ai-label={t("title")}>
      {m.status === "loading" ? (
        <div className="pxo__sk" aria-busy="true">
          <span />
          <span />
        </div>
      ) : m.status === "error" ? (
        <p className="pxo__err" role="alert">
          <IconAlert aria-hidden />
          <span>{t("optionsFailed")}</span>
          <button type="button" onClick={m.retryForm}>
            {t("retry")}
          </button>
        </p>
      ) : sections.length ? (
        <>
          <div className="pxo__head">
            <span className="pxo__ico" aria-hidden>
              <IconSparkle />
            </span>
            <span>
              <b>{t("title")}</b>
              <small>{t("optional")}</small>
            </span>
            {picked.length ? <em className="pxo__count">{t("picked", { n: picked.length })}</em> : null}
          </div>
          <OptionGroups sections={sections} picked={picked} onToggle={toggle} />
        </>
      ) : null}

      {showSum && q ? (
        <div className={`pxo__sum${pending || qErr ? " is-busy" : ""}`} aria-live="polite">
          <div className="pxo__row">
            <span>{t("base")}</span>
            <b>{t("fixedPlain", { price: fmtUzs(q.basePrice) })}</b>
          </div>
          {q.breakdown.map((l, i) => (
            <div key={`${l.id}-${i}`} className="pxo__row is-add">
              <span>{l.label || tcm("option")}</span>
              <b>{t("fixed", { price: fmtUzs(l.amount) })}</b>
            </div>
          ))}
          <div className="pxo__row is-total">
            <span>{t("total")}</span>
            <b>{pending ? <span className="pxo__spin" aria-label={t("calculating")} /> : t("fixedPlain", { price: fmtUzs(q.totalPrice) })}</b>
          </div>
        </div>
      ) : null}

      {qErr && sections.length ? (
        <p className="pxo__err" role="alert">
          <IconAlert aria-hidden />
          <span>{marketErr(qErr, t("quoteFailed"))}</span>
          <button type="button" onClick={retryQuote}>
            <IconRefresh aria-hidden />
            {t("recalc")}
          </button>
        </p>
      ) : null}
    </div>
  );
}
