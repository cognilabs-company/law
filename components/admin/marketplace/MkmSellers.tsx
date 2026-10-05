"use client";

import { useLocale, useTranslations } from "next-intl";
import { MKM_PAGE, type MkmPage, type MkmSeller } from "@/lib/services/adminMarketplace";
import { dateOnly, fmtRating } from "@/lib/date";
import { humanize, regionLabel } from "@/lib/labels";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconAlert, IconChevronRight, IconClock, IconClose, IconShieldCheck, IconStar, IconUsers } from "@/components/icons";
import type { Live } from "./useLive";
import { Avatar, LoadFailed, Pager, RefreshFailed, useCount, useMoney, useTypeLabel } from "./bits";

function Verify({ s }: { s: MkmSeller }) {
  const t = useTranslations("admin.marketplace.sellers");
  if (s.isVerified)
    return (
      <span className="mkm-ver mkm-ver--ok">
        <IconShieldCheck aria-hidden />
        {t("verified")}
      </span>
    );
  if (s.verificationStatus === "rejected")
    return (
      <span className="mkm-ver mkm-ver--bad">
        <IconClose aria-hidden />
        {t("verify.rejected")}
      </span>
    );
  if (s.verificationStatus === "pending")
    return (
      <span className="mkm-ver mkm-ver--wait">
        <IconClock aria-hidden />
        {t("verify.pending")}
      </span>
    );
  return (
    <span className="mkm-ver mkm-ver--none">
      <IconAlert aria-hidden />
      {t("verify.none")}
    </span>
  );
}

export default function MkmSellers({
  live,
  offset,
  onOffset,
  onOrders,
  searching,
}: {
  live: Live<MkmPage<MkmSeller>>;
  offset: number;
  onOffset: (next: number) => void;
  onOrders: (s: MkmSeller) => void;
  searching: boolean;
}) {
  const t = useTranslations("admin.marketplace.sellers");
  const te = useTranslations("enums");
  const locale = useLocale();
  const money = useMoney();
  const count = useCount();
  const typeLabel = useTypeLabel();
  const page = live.data;
  const rows = page?.items ?? [];
  const shown = !!page && !(live.failed && live.stale);
  const max = Math.max(1, ...rows.map((s) => s.activeOrders));
  const col = (k: string) => t(`col.${k}`);
  const place = (s: MkmSeller) => {
    const region = regionLabel(te, s.region);
    return [region, s.district && s.district.toLowerCase() !== s.region.toLowerCase() ? s.district : ""].filter(Boolean).join(", ");
  };
  const account = (st: string) => (t.has(`account.${st}`) ? t(`account.${st}`) : humanize(st));

  return (
    <section className={`mkm-card${live.changing ? " is-busy" : ""}`} aria-busy={live.changing || live.loading} data-ai-target="marketplace:sellers-list">
      <div className="mkm-card__h">
        <div>
          <b>{t("title")}</b>
          <small>{t("lead")}</small>
        </div>
        {shown && page ? <span className="mkm-count">{count(page.total)}</span> : null}
      </div>

      {live.loading ? (
        <Skeleton rows={6} />
      ) : live.failed && (live.stale || !page) ? (
        <LoadFailed error={live.error} onRetry={live.reload} />
      ) : !rows.length ? (
        <EmptyState icon={<IconUsers />} title={t("empty")} text={searching ? t("emptyText") : undefined} />
      ) : (
        <>
          {live.failed ? <RefreshFailed /> : null}
          <div className="mkm-tablewrap">
            <table className="mkm-table mkm-table--sellers">
              <thead>
                <tr>
                  <th scope="col">{col("seller")}</th>
                  <th scope="col">{col("type")}</th>
                  <th scope="col">{col("rating")}</th>
                  <th scope="col">{col("active")}</th>
                  <th scope="col">{col("orders")}</th>
                  <th scope="col" className="num">
                    {col("revenue")}
                  </th>
                  <th scope="col" className="mkm-tr__go">
                    <span className="mkm-sr">{t("orders")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.userId}
                    className={s.ordersTotal > 0 ? "mkm-tr" : undefined}
                    onClick={
                      s.ordersTotal > 0
                        ? () => {
                            if (!window.getSelection()?.toString()) onOrders(s);
                          }
                        : undefined
                    }
                  >
                    <td data-l={col("seller")} className="mkm-td--wide">
                      <span className="mkm-seller">
                        <Avatar name={s.name} />
                        <span>
                          {s.ordersTotal > 0 ? (
                            <button
                              type="button"
                              className="mkm-idbtn mkm-seller__name"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOrders(s);
                              }}
                              aria-label={t("ordersAria", { name: s.name || s.phone })}
                            >
                              {s.name || s.phone || "—"}
                            </button>
                          ) : (
                            <b>{s.name || s.phone || "—"}</b>
                          )}
                          {s.lexgoId ? <small>{s.lexgoId}</small> : null}
                          {s.phone ? <small>{s.phone}</small> : null}
                          {s.accountStatus && s.accountStatus !== "active" ? <em className="mkm-acc">{account(s.accountStatus)}</em> : null}
                        </span>
                      </span>
                    </td>
                    <td data-l={col("type")}>
                      <span className={`mkm-type mkm-type--${s.sellerType}`}>{typeLabel(s.sellerType)}</span>
                      <small>{place(s) || "—"}</small>
                      <small>{t("servicesN", { n: s.servicesCount })}</small>
                    </td>
                    <td data-l={col("rating")}>
                      {s.rating > 0 || s.reviewsCount > 0 ? (
                        <span className="mkm-rate">
                          <IconStar aria-hidden />
                          {fmtRating(s.rating, locale)}
                          <small>{t("reviews", { n: s.reviewsCount })}</small>
                        </span>
                      ) : (
                        <span className="mkm-muted">—</span>
                      )}
                      <Verify s={s} />
                    </td>
                    <td data-l={col("active")}>
                      <span className={`mkm-load${s.activeOrders ? "" : " is-zero"}`}>
                        <b>{count(s.activeOrders)}</b>
                        <span aria-hidden>
                          <i style={{ width: `${(s.activeOrders / max) * 100}%` }} />
                        </span>
                      </span>
                    </td>
                    <td data-l={col("orders")}>
                      <b>{t("totalN", { n: count(s.ordersTotal) })}</b>
                      <small>{t("breakdown", { done: count(s.completedOrders), pending: count(s.pendingPaymentOrders) })}</small>
                    </td>
                    <td data-l={col("revenue")} className="num mkm-td--rev">
                      <b>{money(s.revenuePaid)}</b>
                      <small>{s.lastOrderAt ? t("lastOrder", { date: dateOnly(s.lastOrderAt, locale) }) : t("never")}</small>
                    </td>
                    <td className="mkm-tr__go" aria-hidden>
                      {s.ordersTotal > 0 ? <IconChevronRight /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {shown && page ? <Pager total={page.total} offset={offset} limit={page.limit || MKM_PAGE} busy={live.changing || live.loading} onOffset={onOffset} /> : null}
    </section>
  );
}
