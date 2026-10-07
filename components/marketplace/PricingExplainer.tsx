"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconBriefcase, IconClose, IconHelpCircle, IconMapPin, IconScale, IconShieldCheck, IconStar, IconTag } from "@/components/icons";
import { fmtUzs } from "@/lib/money";
import { humanize } from "@/lib/labels";
import { getPublicPricingPolicy, regionName, tierLabel, type PricingPolicy, type Translate } from "@/lib/services/marketplacePricing";

type Load = { status: "idle" | "loading" | "ready"; policy: PricingPolicy | null };

type ExplainedService = { title: string; basePrice: number; price: number };

function regionLine(p: PricingPolicy, t: Translate, te: Translate): string {
  const seen = new Map<string, number>();
  for (const r of [...p.regions].sort((a, b) => b.coef - a.coef)) {
    if (r.key === "default" || r.coef === 1) continue;
    const name = regionName(r.key, t, te) || humanize(r.key);
    if (!seen.has(name)) seen.set(name, r.coef);
  }
  return [...seen]
    .slice(0, 4)
    .map(([name, c]) => `${name} ×${c.toFixed(2)}`)
    .join(" · ");
}

function experienceLine(p: PricingPolicy, t: Translate): string {
  return p.experience
    .filter((x) => x.percent > 0)
    .map((x) => `${tierLabel(x, t)} +${x.percent}%`)
    .join(" · ");
}

function premiumLines(p: PricingPolicy, t: Translate): string[] {
  const out: string[] = [];
  if (p.client.percent > 0) out.push(t("explain.clientRating", { rating: p.client.ratingMin, reviews: p.client.reviewsMin, percent: p.client.percent }));
  if (p.seller.percent > 0) out.push(t("explain.sellerPremium", { percent: p.seller.percent }));
  if (p.sector.percent > 0) out.push(t("explain.sectorPremium", { years: p.sector.minYears, percent: p.sector.percent }));
  return out;
}

function Step({ icon, title, lines }: { icon: ReactNode; title: string; lines: string[] }) {
  return (
    <li className="mkpx__step">
      <span className="mkpx__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="mkpx__txt">
        <b>{title}</b>
        {lines.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </span>
    </li>
  );
}

export default function PricingExplainer({ service, aiId }: { service: ExplainedService | null; aiId?: string }) {
  const t = useTranslations("marketPricing");
  const te = useTranslations("enums");
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ status: "idle", policy: null });
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

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || load.status === "loading" || (load.status === "ready" && load.policy)) return;
    setLoad({ status: "loading", policy: null });
    getPublicPricingPolicy()
      .then((policy) => setLoad({ status: "ready", policy }))
      .catch(() => setLoad({ status: "ready", policy: null }));
  };

  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };

  const p = load.policy;
  const regions = p ? regionLine(p, t, te) : "";
  const exp = p ? experienceLine(p, t) : "";
  const premium = p ? premiumLines(p, t) : [];
  const picked = service && service.basePrice > 0 && service.price > 0 ? service : null;

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
          {load.status === "loading" ? (
            <div className="mkpx__skel" aria-busy="true" aria-label={t("explain.loading")}>
              <i />
              <i />
              <i />
            </div>
          ) : (
            <ol className="mkpx__steps">
              <Step icon={<IconTag />} title={t("explain.baseT")} lines={[t("explain.baseD")]} />
              <Step icon={<IconMapPin />} title={t("explain.regionT")} lines={[regions || t("explain.regionD")]} />
              <Step icon={<IconBriefcase />} title={t("explain.expT")} lines={[exp || t("explain.expD")]} />
              <Step icon={<IconStar />} title={t("explain.premiumT")} lines={premium.length ? premium : [t("explain.premiumD")]} />
              <Step
                icon={<IconScale />}
                title={t("explain.rangeT")}
                lines={[p ? t("explain.rangeP", { min: p.minPercent, max: p.maxPercent }) : t("explain.rangeD")]}
              />
            </ol>
          )}
          <p className="mkpx__foot">
            <IconShieldCheck aria-hidden="true" />
            <span>{t("explain.foot")}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
