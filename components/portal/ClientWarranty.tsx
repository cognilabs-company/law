"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { listMarketplaceOrders, warrantyOrdersOf, type MarketOrder } from "@/lib/services/marketplace";
import { useResource } from "@/lib/useResource";
import { Skeleton } from "@/components/portal/DataState";
import { IconShieldCheck, IconCheck } from "@/components/icons";

const PENDING = new Set(["pending", "open", "submitted", "in_review", "under_review", "created", "new"]);
const orderHref = (o: MarketOrder) => `/portal/client/marketplace-orders/${encodeURIComponent(o.id)}#mod-warranty`;

export default function ClientWarranty() {
  const t = useTranslations("portal.client.warranty");
  const tw = useTranslations("marketplace.orderDetail.warranty");
  const uid = useId();
  const orders = useResource(() => listMarketplaceOrders("client"), []);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.location.hash === "#warranty") root.current?.scrollIntoView({ block: "start" });
  }, []);

  const points = ["p1", "p2", "p3"] as const;
  const { filed, open } = warrantyOrdersOf(orders.status === "ready" ? orders.data : []);
  const name = (o: MarketOrder) => o.serviceTitle || o.workId || t("claim");
  const stateOf = (o: MarketOrder) => {
    if (PENDING.has(o.warranty.status)) return t("reviewing");
    const r = o.warranty.resolution;
    return r && tw.has(`resolution.${r}`) ? tw(`resolution.${r}`) : t("decided");
  };

  return (
    <section className="war" id="warranty" ref={root} aria-labelledby={`${uid}-title`}>
      <div className="war__hero">
        <span className="war__ico"><IconShieldCheck /></span>
        <div>
          <h2 className="war__title" id={`${uid}-title`}>{t("title")}</h2>
          <p className="war__sub">{t("subtitle")}</p>
        </div>
      </div>

      <div className="war__points" data-ai-target="warranty:points">
        {points.map((p) => (
          <div className="war__point" key={p}>
            <span className="war__check"><IconCheck /></span>
            <span>{t(p)}</span>
          </div>
        ))}
      </div>

      <div className="pgrid2">
        <div className="ppanel" data-ai-target="warranty:orders">
          <div className="ppanel__h"><b>{t("ordersTitle")}</b></div>
          <p className="ppanel__note">{t("ordersLead")}</p>
          {orders.status === "loading" ? (
            <Skeleton rows={2} />
          ) : !open.length ? (
            <p className="ppanel__note">{t("noOrders")}</p>
          ) : (
            <div className="alist">
              {open.map((o) => (
                <div className="creq" key={o.id}>
                  <span className="creq__st creq__st--live" />
                  <div className="creq__m">
                    <b>{name(o)}</b>
                    <span>{[o.workId, o.lawyerName].filter(Boolean).join(" · ")}</span>
                  </div>
                  <Link className="btn btn--line btn--sm" href={orderHref(o)} data-ai-id={`warranty.order.${o.id}.ask`}>
                    {t("ask")}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ppanel" data-ai-target="warranty:claims">
          <div className="ppanel__h"><b>{t("claimsTitle")}</b></div>
          {orders.status === "loading" ? (
            <Skeleton rows={2} />
          ) : !filed.length ? (
            <p className="ppanel__note">{t("noClaims")}</p>
          ) : (
            <div className="alist">
              {filed.map((o) => (
                <Link className="creq" key={o.id} href={orderHref(o)}>
                  <span className={`creq__st ${PENDING.has(o.warranty.status) ? "creq__st--wait" : "creq__st--ok"}`} />
                  <div className="creq__m">
                    <b>{name(o)}</b>
                    <span>{[o.workId, o.warranty.reason].filter(Boolean).join(" · ")}</span>
                  </div>
                  <span className="creq__badge">{stateOf(o)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
