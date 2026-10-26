"use client";

import "./sx-promo.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { CalendarRange, Crown, Megaphone, Repeat, TriangleAlert } from "lucide-react";
import { loadStudioReference, type StudioReferenceItem } from "@/lib/services/studio";
import type { SxValues } from "../contract";
import { useStudioLabels } from "../useStudioLabels";
import { PROMO_TARGETS, discountedPrice, promoTermsOf, promoTiming } from "../ctor/mp09";

// The MP09 editor's "what the buyer will pay": each chosen package or plan
// with its catalogue price, the discount and the price after it, plus the
// period, the use limit and where the promotion stands now. The checkout
// still prices from the backend; this is the same arithmetic on the
// backend's own catalogue prices, so the editor sees the result before
// submitting.

type Target = { id: string; label: string; type: string; price: number | null; currency: string };

let targetsCache: Promise<Target[]> | null = null;
function loadTargets(): Promise<Target[]> {
  targetsCache ??= loadStudioReference(PROMO_TARGETS, "", 200).then(
    (items: StudioReferenceItem[]) =>
      items.map((i) => {
        const p = Number(i.raw.price);
        return { id: i.value || i.id, label: i.label, type: String(i.raw.target_type ?? ""), price: Number.isFinite(p) ? p : null, currency: String(i.raw.currency ?? "UZS") || "UZS" };
      }),
    () => {
      targetsCache = null;
      return [];
    },
  );
  return targetsCache;
}

export function PromoPreview({ payload, title }: { payload: SxValues; title: string }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void loadTargets().then((list) => {
      if (alive) setTargets(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const terms = promoTermsOf(payload);
  const name = String(payload?.title ?? "").trim() || title;
  const byId = new Map((targets ?? []).map((x) => [x.id, x]));
  const chosen = terms.targetIds.map((id) => byId.get(id) ?? { id, label: labels.unknownRef(id), type: terms.targetType, price: null, currency: "UZS" });
  const timing = promoTiming(terms, now);
  const off = terms.type && terms.value ? (terms.type === "percent" ? `−${labels.num(terms.value)}%` : `−${labels.money(terms.value)}`) : "";
  const zeroed = chosen.filter((c) => c.price !== null && c.price > 0 && discountedPrice(c.price, terms) === 0);
  const TypeIcon = terms.targetType === "subscription" ? Crown : Megaphone;
  const period =
    terms.startsAt && terms.endsAt
      ? t("sx.mp09.pv.between", { from: labels.dateTime(terms.startsAt), to: labels.dateTime(terms.endsAt) })
      : terms.startsAt
        ? t("sx.mp09.pv.from", { from: labels.dateTime(terms.startsAt) })
        : terms.endsAt
          ? t("sx.mp09.pv.until", { to: labels.dateTime(terms.endsAt) })
          : t("sx.mp09.pv.noPeriod");

  return (
    <section className="sx-promo" aria-label={t("sx.mp09.pv.title")} data-ai-id="admin.studio.mp09.preview">
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

      {!terms.targetType || !chosen.length ? (
        <p className="sx-promo__empty">{t("sx.mp09.pv.pick")}</p>
      ) : (
        <div className="sx-promo__table" role="table" aria-label={t("sx.mp09.pv.tableLabel")}>
          <div className="sx-promo__row sx-promo__row--head" role="row">
            <span role="columnheader">{terms.targetType === "subscription" ? t("sx.mp09.pv.colPlan") : t("sx.mp09.pv.colPackage")}</span>
            <span role="columnheader">{t("sx.mp09.pv.colPrice")}</span>
            <span role="columnheader">{t("sx.mp09.pv.colFinal")}</span>
          </div>
          {chosen.map((c) => {
            const final = c.price === null ? null : discountedPrice(c.price, terms);
            return (
              <div key={c.id} className="sx-promo__row" role="row">
                <span role="cell" className="sx-promo__name">
                  {c.label}
                </span>
                <span role="cell" className="sx-num">
                  {targets === null ? <span className="sx-sk sx-promo__sk" aria-hidden="true" /> : c.price === null ? t("sx.mp09.pv.noPrice") : c.price === 0 ? t("sx.mp09.pv.free") : labels.money(c.price, c.currency)}
                </span>
                <span role="cell" className="sx-num sx-promo__final" data-changed={final !== null && final !== c.price ? "" : undefined}>
                  {targets === null ? <span className="sx-sk sx-promo__sk" aria-hidden="true" /> : final === null ? "—" : final === 0 ? t("sx.mp09.pv.free") : labels.money(final, c.currency)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {zeroed.length ? (
        <p className="sx-promo__warn" role="note">
          <TriangleAlert size={15} aria-hidden="true" />
          {t("sx.mp09.pv.zero", { names: zeroed.map((z) => z.label).join(", ") })}
        </p>
      ) : null}
      <p className="sx-promo__note">{t("sx.mp09.pv.note")}</p>
    </section>
  );
}
