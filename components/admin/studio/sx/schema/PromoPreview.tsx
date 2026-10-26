"use client";

import "./sx-promo.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { CalendarRange, Crown, Megaphone, RefreshCw, Repeat, TriangleAlert } from "lucide-react";
import { isAborted, logApiError } from "@/lib/http";
import { previewStudioDraft } from "@/lib/services/studio";
import type { SxValues } from "../contract";
import { useStudioLabels } from "../useStudioLabels";
import { promoPreviewOf, promoTermsOf, promoTiming, type PromoBackendPreview } from "../ctor/mp09";

// The MP09 editor's "what the buyer will pay": each chosen package or plan
// with the backend's own price before and after the discount (POST
// /studio/constructors/MP09/preview — nothing is saved), plus the period,
// the use limit and where the promotion stands now. The browser never works
// a discount out itself.

const DEBOUNCE_MS = 500;

type Load = { key: string; state: "loading" | "ready" | "error"; data: PromoBackendPreview | null };

export function PromoPreview({ payload, title }: { payload: SxValues; title: string }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [now] = useState(() => Date.now());
  const [load, setLoad] = useState<Load | null>(null);
  const [retry, setRetry] = useState(0);

  const terms = promoTermsOf(payload);
  const ready = !!terms.targetType && terms.targetIds.length > 0 && !!terms.type && (terms.value ?? 0) > 0;
  const key = ready ? JSON.stringify({ p: payload ?? {}, retry }) : "";

  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      setLoad((cur) => ({ key, state: "loading", data: cur?.data ?? null }));
      previewStudioDraft("MP09", (payload ?? {}) as Record<string, unknown>, "", ctl.signal).then(
        (p) => setLoad({ key, state: "ready", data: promoPreviewOf(p.raw) }),
        (e) => {
          if (isAborted(e)) return;
          logApiError("studio.mp09.preview", e);
          setLoad((cur) => ({ key, state: "error", data: cur?.data ?? null }));
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [key, payload]);

  const name = String(payload?.title ?? "").trim() || title;
  const timing = promoTiming(terms, now);
  const off = terms.type && terms.value ? (terms.type === "percent" ? `−${labels.num(terms.value)}%` : `−${labels.money(terms.value)}`) : "";
  const TypeIcon = terms.targetType === "subscription" ? Crown : Megaphone;
  const current = load && load.key === key ? load : null;
  const data = load?.data ?? null;
  const pending = !!key && (!current || current.state === "loading");
  const failed = !!current && current.state === "error";
  const byId = new Map((data?.targets ?? []).map((x) => [x.id, x.label]));
  const warnText = (w: { code: string; id: string }) => {
    const target = w.id ? byId.get(w.id) || w.id : "";
    return t.has(`sx.mp09.pv.warn.${w.code}`) ? t(`sx.mp09.pv.warn.${w.code}`, { name: target }) : w.code;
  };
  const period =
    terms.startsAt && terms.endsAt
      ? t("sx.mp09.pv.between", { from: labels.dateTime(terms.startsAt), to: labels.dateTime(terms.endsAt) })
      : terms.startsAt
        ? t("sx.mp09.pv.from", { from: labels.dateTime(terms.startsAt) })
        : terms.endsAt
          ? t("sx.mp09.pv.until", { to: labels.dateTime(terms.endsAt) })
          : t("sx.mp09.pv.noPeriod");

  return (
    <section className="sx-promo" aria-label={t("sx.mp09.pv.title")} aria-busy={pending || undefined} data-ai-id="admin.studio.mp09.preview">
      <header className="sx-promo__head">
        <span className="sx-promo__ico" aria-hidden="true">
          <TypeIcon size={18} />
        </span>
        <div className="sx-promo__titles">
          <small>{t("sx.mp09.pv.title")}</small>
          <b>{name || t("sx.mp09.pv.untitled")}</b>
        </div>
        {off ? <span className="sx-promo__off">{off}</span> : null}
        <span className="sx-promo__state" data-state={timing}>
          {t(`sx.mp09.pv.state.${timing}`)}
        </span>
      </header>

      <ul className="sx-promo__facts">
        <li>
          <CalendarRange size={15} aria-hidden="true" />
          {period}
        </li>
        <li>
          <Repeat size={15} aria-hidden="true" />
          {terms.usageLimit ? t("sx.mp09.pv.limit", { n: terms.usageLimit }) : t("sx.mp09.pv.noLimit")}
        </li>
      </ul>

      {!ready ? (
        <p className="sx-promo__empty">{t("sx.mp09.pv.pick")}</p>
      ) : failed && !data ? (
        <p className="sx-promo__warn" role="alert">
          <TriangleAlert size={15} aria-hidden="true" />
          {t("sx.mp09.pv.failed")}
          <button type="button" className="sx-promo__retry" onClick={() => setRetry((n) => n + 1)}>
            <RefreshCw size={13} aria-hidden="true" />
            {t("sx.mp09.pv.retry")}
          </button>
        </p>
      ) : (
        <div className="sx-promo__table" role="table" aria-label={t("sx.mp09.pv.tableLabel")} data-stale={pending || undefined}>
          <div className="sx-promo__row sx-promo__row--head" role="row">
            <span role="columnheader">{terms.targetType === "subscription" ? t("sx.mp09.pv.colPlan") : t("sx.mp09.pv.colPackage")}</span>
            <span role="columnheader">{t("sx.mp09.pv.colPrice")}</span>
            <span role="columnheader">{t("sx.mp09.pv.colFinal")}</span>
          </div>
          {!data ? (
            terms.targetIds.map((id) => (
              <div key={id} className="sx-promo__row" role="row">
                <span role="cell" className="sx-promo__name">
                  <span className="sx-sk sx-promo__sk sx-promo__sk--wide" aria-hidden="true" />
                </span>
                <span role="cell">
                  <span className="sx-sk sx-promo__sk" aria-hidden="true" />
                </span>
                <span role="cell">
                  <span className="sx-sk sx-promo__sk" aria-hidden="true" />
                </span>
              </div>
            ))
          ) : (
            data.targets.map((c) => (
              <div key={c.id || c.label} className="sx-promo__row" role="row">
                <span role="cell" className="sx-promo__name">
                  {c.label || labels.unknownRef(c.id)}
                </span>
                <span role="cell" className="sx-num">
                  {c.basePrice ? labels.money(c.basePrice, c.currency) : t("sx.mp09.pv.free")}
                </span>
                <span role="cell" className="sx-num sx-promo__final" data-changed={c.finalPrice !== c.basePrice ? "" : undefined}>
                  {c.finalPrice ? labels.money(c.finalPrice, c.currency) : t("sx.mp09.pv.free")}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {data?.warnings.length && ready ? (
        <ul className="sx-promo__warns">
          {data.warnings.map((w, i) => (
            <li key={i} className="sx-promo__warn" role="note">
              <TriangleAlert size={15} aria-hidden="true" />
              {warnText(w)}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="sx-promo__note">{t("sx.mp09.pv.note")}</p>
    </section>
  );
}
