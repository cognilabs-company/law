"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconBriefcase, IconClose, IconHelpCircle, IconMapPin, IconShieldCheck, IconStar, IconTag, IconTrendingUp } from "@/components/icons";
import { fmtUzs } from "@/lib/money";
import type { RuntimeFactor } from "@/lib/services/marketRuntime";
import { fmtPct, orderedFactors } from "./runtime/facts";

type ExplainedService = { title: string; basePrice: number; price: number };

function Step({ icon, title, lines }: { icon: ReactNode; title: string; lines: string[] }) {
  return (
    <li className="mkpx__step">
      <span className="mkpx__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="mkpx__txt">
        <b>{title}</b>
        {lines.map((l, i) => (
          <span key={`${i}-${l}`}>{l}</span>
        ))}
      </span>
    </li>
  );
}

// What shapes a price, for the client on a public profile (TSK-787056):
// the catalogue and the specialist's price, the client's own options, and
// the reasons in plain words. Never LexGo's internal formula — no region
// coefficients, experience or rating percentages, no allowed range.
export default function PricingExplainer({ service, aiId, factors }: { service: ExplainedService | null; aiId?: string; factors?: readonly RuntimeFactor[] }) {
  const t = useTranslations("marketPricing");
  const te = useTranslations("enums");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const uid = useId();
  const popId = `${uid}-pop`;
  const titleId = `${uid}-title`;

  useEffect(() => {
    if (!open) return;
    pop.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => setOpen((o) => !o);

  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };

  const picked = service && service.basePrice > 0 && service.price > 0 ? service : null;
  const fx = orderedFactors(factors);
  const fxLines = fx.map((f) =>
    f.adjustmentType === "percent" ? t("explain.factorPercent", { title: f.title, pct: fmtPct(f.value, locale) }) : t("explain.factorFixed", { title: f.title, amount: fmtUzs(f.value), cur: te("currency") }),
  );

  return (
    <div className="mkpx" ref={root}>
      <button
        ref={btn}
        type="button"
        className="mkpx__btn"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-haspopup="dialog"
        onClick={toggle}
        data-ai-id={aiId}
        data-ai-type={aiId ? "button" : undefined}
        data-ai-label={aiId ? t("explain.open") : undefined}
      >
        <IconHelpCircle aria-hidden="true" />
        <span>{t("explain.open")}</span>
      </button>
      {open ? (
        <div id={popId} ref={pop} className="mkpx__pop" role="dialog" aria-labelledby={titleId} tabIndex={-1}>
          <div className="mkpx__h">
            <b id={titleId}>{t("explain.title")}</b>
            <button type="button" className="mkpx__x" onClick={close} aria-label={t("explain.close")}>
              <IconClose aria-hidden="true" />
            </button>
          </div>
          <p className="mkpx__lead">{t("explain.lead")}</p>
          {picked ? (
            <p className="mkpx__svc">{t("explain.selected", { service: picked.title, base: fmtUzs(picked.basePrice), price: fmtUzs(picked.price) })}</p>
          ) : null}
          <ol className="mkpx__steps">
            <Step icon={<IconTag />} title={t("explain.baseT")} lines={[t("explain.baseD")]} />
            {fx.length ? <Step icon={<IconTrendingUp />} title={t("explain.factorsT")} lines={[t("explain.factorsD"), ...fxLines]} /> : null}
            <Step icon={<IconMapPin />} title={t("explain.regionT")} lines={[t("explain.regionD")]} />
            <Step icon={<IconBriefcase />} title={t("explain.expT")} lines={[t("explain.expD")]} />
            <Step icon={<IconStar />} title={t("explain.premiumT")} lines={[t("explain.premiumD")]} />
          </ol>
          <p className="mkpx__foot">
            <IconShieldCheck aria-hidden="true" />
            <span>{t("explain.foot")}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
