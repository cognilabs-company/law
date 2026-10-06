"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { shortDateTime } from "@/lib/date";
import { listOpenOrders } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import OrderActions from "@/components/portal/OrderActions";
import RespondTimer from "@/components/portal/RespondTimer";
import { useOrderStatusLabel } from "@/lib/orderStatus";
import { IconBriefcase, IconMapPin, IconClock } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";

export default function LawyerMarketplace() {
  const t = useTranslations("portal.lawyer.marketplace");
  const locale = useLocale();
  const res = useResource(listOpenOrders, []);
  const statusLabel = useOrderStatusLabel();
  // Orders another seller took meanwhile (409) leave the list.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const orders = res.data.filter((o) => !gone.has(o.id));

  return (
    <div
      className="ppanel"
      data-ai-target={orders.length ? undefined : "open-orders:list"}
      data-ai-id={orders.length ? undefined : "advocate.opportunities.list"}
      data-ai-type={orders.length ? undefined : "list"}
      data-ai-label={orders.length ? undefined : t("title")}
    >
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{t("count", { n: orders.length })}</span>
      </div>
      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !orders.length ? (
        <EmptyState icon={<IconBriefcase />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="pcards" data-ai-target="open-orders:list" data-ai-label={t("title")} data-ai-id="advocate.opportunities.list" data-ai-type="list">
          {orders.map((o) => (
            <div
              className="oppc oppc--full"
              key={o.id}
              data-ai-id={o.id ? aiId("advocate.opportunities.item", o.id) : undefined}
              data-ai-type="card"
              data-ai-entity-type="order"
              data-ai-entity-id={o.id || undefined}
              data-ai-label={[statusLabel(o.status), o.region, o.budget].filter(Boolean).join(" · ")}
              data-ai-private
            >
              <div className="oppc__h">
                <span className="oppc__match">{statusLabel(o.status)}</span>
                <RespondTimer deadline={o.confirmationDeadlineAt} />
                <span className="oppc__ago"><IconClock />{shortDateTime(o.createdAt, locale)}</span>
              </div>
              <b>{o.title}</b>
              <small>
                <IconMapPin />
                {[o.region, o.budget].filter(Boolean).join(" · ")}
              </small>
              <OrderActions orderId={o.id} onDone={(a) => a === "taken" && setGone((g) => new Set(g).add(o.id))} aiBase={o.id ? aiId("advocate.opportunities.item", o.id) : undefined} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
