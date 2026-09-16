"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { listOpenOrders } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import OrderActions from "@/components/portal/OrderActions";
import { useOrderStatusLabel } from "@/lib/orderStatus";
import { IconClock, IconMapPin, IconBriefcase } from "@/components/icons";

export default function AdvocateOpportunities() {
  const t = useTranslations("portal.advocate.opportunities");
  const res = useResource(listOpenOrders, []);
  const statusLabel = useOrderStatusLabel();
  // Orders another seller took meanwhile (409) leave the list.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const orders = res.data.filter((o) => !gone.has(o.id));

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{t("count", { n: orders.length })}</span>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("intro")}</p>

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !orders.length ? (
        <EmptyState icon={<IconBriefcase />} title={t("emptyTitle")} text={t("emptyText")} />
      ) : (
        <div className="pcards">
          {orders.map((o) => (
            <div className="oppc oppc--full" key={o.id}>
              <div className="oppc__h">
                <span className="oppc__match">{statusLabel(o.status)}</span>
                <span className="oppc__ago"><IconClock />{o.createdAt}</span>
              </div>
              <b>{o.title}</b>
              <small>
                <IconMapPin />
                {[o.region, o.budget].filter(Boolean).join(" · ")}
              </small>
              <OrderActions orderId={o.id} onDone={(a) => a === "taken" && setGone((g) => new Set(g).add(o.id))} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
