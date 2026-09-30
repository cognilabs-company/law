"use client";

import { useTranslations } from "next-intl";
import { MKM_PAGE, type MkmOrder, type MkmPage } from "@/lib/services/adminMarketplace";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconChevronRight, IconLayers, IconRefresh } from "@/components/icons";
import type { Live } from "./useLive";
import { LoadFailed, Pager, PayBadge, RefreshFailed, StatusBadge, payWorthShowing, useCount, useMoney, useTypeLabel, useWhen } from "./bits";

export default function MkmOrders({
  live,
  offset,
  onOffset,
  onOpen,
  filtered,
  onReset,
}: {
  live: Live<MkmPage<MkmOrder>>;
  offset: number;
  onOffset: (next: number) => void;
  onOpen: (o: MkmOrder) => void;
  filtered: boolean;
  onReset: () => void;
}) {
  const t = useTranslations("admin.marketplace.orders");
  const money = useMoney();
  const when = useWhen();
  const count = useCount();
  const typeLabel = useTypeLabel();
  const page = live.data;
  const rows = page?.items ?? [];
  const shown = !!page && !(live.failed && live.stale);
  const col = (k: string) => t(`col.${k}`);

  return (
    <section className={`mkm-card${live.changing ? " is-busy" : ""}`} aria-busy={live.changing || live.loading}>
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
        <div className="mkm-fail">
          {filtered || offset > 0 ? (
            <>
              <EmptyState icon={<IconLayers />} title={t("emptyFiltered")} text={t("emptyFilteredText")} />
              <button type="button" className="btn btn--line btn--sm" onClick={offset > 0 && !filtered ? () => onOffset(0) : onReset}>
                <IconRefresh aria-hidden />
                {offset > 0 && !filtered ? t("firstPage") : t("reset")}
              </button>
            </>
          ) : (
            <EmptyState icon={<IconLayers />} title={t("empty")} text={t("emptyText")} />
          )}
        </div>
      ) : (
        <>
          {live.failed ? <RefreshFailed /> : null}
          <div className="mkm-tablewrap">
            <table className="mkm-table mkm-table--orders">
              <thead>
                <tr>
                  <th scope="col">{col("order")}</th>
                  <th scope="col">{col("service")}</th>
                  <th scope="col">{col("client")}</th>
                  <th scope="col">{col("seller")}</th>
                  <th scope="col" className="num">
                    {col("amount")}
                  </th>
                  <th scope="col">{col("status")}</th>
                  <th scope="col">{col("date")}</th>
                  <th scope="col" className="mkm-tr__go">
                    <span className="mkm-sr">{t("openCol")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    className="mkm-tr"
                    onClick={() => {
                      if (!window.getSelection()?.toString()) onOpen(o);
                    }}
                  >
                    <td data-l={col("order")} className="mkm-td--id">
                      <button
                        type="button"
                        className="mkm-idbtn mkm-wid"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(o);
                        }}
                        aria-label={t("open", { id: o.workId || "—" })}
                      >
                        {o.workId || "—"}
                      </button>
                      {o.orderWorkId ? <small>{o.orderWorkId}</small> : null}
                    </td>
                    <td data-l={col("service")} className="mkm-td--wide">
                      <b className="mkm-clamp">{o.serviceTitle || "—"}</b>
                      <small>{typeLabel(o.sellerType)}</small>
                    </td>
                    <td data-l={col("client")} className="mkm-td--who">
                      <b>{o.client.name || "—"}</b>
                      {o.client.phone ? <small>{o.client.phone}</small> : null}
                    </td>
                    <td data-l={col("seller")} className="mkm-td--who">
                      <b>{o.seller.name || "—"}</b>
                      {o.seller.phone ? <small>{o.seller.phone}</small> : null}
                    </td>
                    <td data-l={col("amount")} className="num">
                      <b>{money(o.price, o.currency)}</b>
                    </td>
                    <td data-l={col("status")}>
                      <span className="mkm-badges">
                        <StatusBadge status={o.status} />
                        {payWorthShowing(o) ? <PayBadge status={o.paymentStatus} /> : null}
                      </span>
                    </td>
                    <td data-l={col("date")} className="mkm-td--date">
                      {when(o.createdAt) || "—"}
                    </td>
                    <td className="mkm-tr__go" aria-hidden>
                      <IconChevronRight />
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
