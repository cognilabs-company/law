"use client";

import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Skeleton } from "@/components/portal/DataState";
import { IconArrowRight, IconHistory } from "@/components/icons";
import { dateTimeFull } from "@/lib/date";
import {
  defaultPricingPolicy,
  pricingChanges,
  regionName,
  tierLabel,
  type PricingChange,
  type PricingPolicy,
  type PricingVersion,
} from "@/lib/services/marketplacePricing";

export type PricingHistoryState = { status: "loading" | "ready" | "missing" | "error"; items: PricingVersion[] };

const MAX_LINES = 8;
const PCT_FIELDS = new Set(["minPercent", "maxPercent", "exp", "seller.successRateMin", "seller.percent", "client.percent", "sector.percent"]);

export function versionWhen(at: number, locale: string): string {
  return Number.isFinite(at) && at > 0 ? dateTimeFull(new Date(at).toISOString(), locale) : "";
}

export default function PricingHistoryModal({
  open,
  hist,
  onClose,
  onLoad,
}: {
  open: boolean;
  hist: PricingHistoryState;
  onClose: () => void;
  onLoad: (policy: PricingPolicy, version: string) => void;
}) {
  const t = useTranslations("admin.policies.pricing");
  const tm = useTranslations("marketPricing");
  const te = useTranslations("enums");
  const locale = useLocale();

  const label = (c: PricingChange): string => {
    if (c.field === "minPercent") return t("range.min");
    if (c.field === "maxPercent") return t("range.max");
    if (c.field === "exp" && c.years) return t("diff.exp", { range: tierLabel({ minYears: c.years[0], maxYears: c.years[1], percent: 0 }, tm) });
    if (c.field === "region") {
      const name = regionName(c.key, tm, te);
      return name ? t("diff.regionNamed", { key: c.key, name }) : t("diff.region", { key: c.key });
    }
    const [group, field] = c.field.split(".");
    return t.has(`${group}.${field}`) ? `${t(`${group}.title`)} · ${t(`${group}.${field}`)}` : c.field;
  };

  const value = (c: PricingChange, v: number | boolean | null): string => {
    if (v === null) return "—";
    if (typeof v === "boolean") return v ? t("yes") : t("no");
    if (c.field === "region") return `×${v.toFixed(2)}`;
    if (PCT_FIELDS.has(c.field)) return `${v}%`;
    if (c.field === "sector.minYears") return `${v} ${t("unit.years")}`;
    return String(v);
  };

  return (
    <Modal open={open} onClose={onClose} title={t("history.title")} aiId="admin.policies.marketplace-pricing.history-modal">
      {hist.status === "loading" ? (
        <Skeleton rows={3} />
      ) : hist.status === "missing" ? (
        <p className="mpph__empty">
          <IconHistory aria-hidden="true" />
          {t("history.soon")}
        </p>
      ) : hist.status === "error" ? (
        <p className="mpph__empty">{t("history.error")}</p>
      ) : !hist.items.length ? (
        <p className="mpph__empty">
          <IconHistory aria-hidden="true" />
          {t("history.empty")}
        </p>
      ) : (
        <ol className="mpph">
          {hist.items.map((v) => {
            const pol = v.policy;
            const changes = pol ? pricingChanges(v.previous ?? defaultPricingPolicy(), pol) : [];
            const shown = changes.slice(0, MAX_LINES);
            const when = versionWhen(v.at, locale);
            return (
              <li key={v.id} className="mpph__v">
                <div className="mpph__h">
                  <span className="mpph__tag">{v.version ? `v${v.version}` : t("history.noVersion")}</span>
                  {when ? <time>{when}</time> : null}
                  {pol ? (
                    <button type="button" className="btn btn--line btn--sm" onClick={() => onLoad(pol, v.version)}>
                      {t("history.load")}
                    </button>
                  ) : null}
                </div>
                {!pol ? (
                  <p className="mpph__note">{t("history.unreadable")}</p>
                ) : (
                  <>
                    {!v.previous ? <p className="mpph__note">{t("history.first")}</p> : null}
                    {shown.length ? (
                      <ul className="mpph__ch">
                        {shown.map((c, i) => (
                          <li key={`${c.field}-${c.key}-${i}`}>
                            <span>{label(c)}</span>
                            {c.from === null ? (
                              <em className="is-add">{t("history.added")}</em>
                            ) : (
                              <>
                                <b className="is-old">{value(c, c.from)}</b>
                                <IconArrowRight aria-hidden="true" />
                              </>
                            )}
                            {c.to === null ? <em className="is-del">{t("history.removed")}</em> : <b>{value(c, c.to)}</b>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mpph__note">{t("history.noChanges")}</p>
                    )}
                    {changes.length > MAX_LINES ? <p className="mpph__note">{t("history.more", { n: changes.length - MAX_LINES })}</p> : null}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
