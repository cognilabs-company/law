"use client";

import "./profile1920.css";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { listMarketplaceOrders, warrantyOrdersOf, type MarketOrder } from "@/lib/services/marketplace";
import { useResource } from "@/lib/useResource";
import { Skeleton } from "@/components/portal/DataState";
import { IconCheck, IconInbox, IconShieldCheck } from "@/components/icons";

const PENDING = new Set(["pending", "open", "submitted", "in_review", "under_review", "created", "new"]);
const orderHref = (o: MarketOrder) => `/portal/client/marketplace-orders/${encodeURIComponent(o.id)}#mod-warranty`;
// The dashboard's "Tezkor Himoya kafolati" drawing, in a white circle on the navy banner.
const WAR_ART = { "--art": "url(/img/xizmatlar/Kafolat.webp)" } as CSSProperties;

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
        <span className="war__art" style={WAR_ART} aria-hidden="true" />
        <div className="war__heromain">
          <h2 className="war__title" id={`${uid}-title`}>{t("title")}</h2>
          <p className="war__sub">{t("subtitle")}</p>
        </div>
        <ul className="war__points" data-ai-target="warranty:points">
          {points.map((p) => (
            <li className="war__point" key={p}>
              <span className="war__check"><IconCheck /></span>
              <span>{t(p)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pgrid2">
        <div className="ppanel" data-ai-target="warranty:orders">
          <div className="ppanel__h">
            <b className="ppanel__t">
              {t("ordersTitle")}
              {open.length ? <span className="cx-count">{open.length}</span> : null}
            </b>
          </div>
          <p className="ppanel__note">{t("ordersLead")}</p>
          {orders.status === "loading" ? (
            <Skeleton rows={2} />
          ) : !open.length ? (
            <div className="cx-empty war__empty">
              <span className="cx-empty__ic" aria-hidden="true"><IconShieldCheck /></span>
              <p>{t("noOrders")}</p>
            </div>
          ) : (
            <div className="alist pf-list">
              {open.map((o) => (
                <div className="creq pf-row" key={o.id}>
                  <div className="creq__m">
                    <b>{name(o)}</b>
                    <span>{[o.workId, o.lawyerName].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="pf-row__end">
                    <Link className="btn btn--line btn--sm" href={orderHref(o)} data-ai-id={`warranty.order.${o.id}.ask`}>
                      {t("ask")}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ppanel" data-ai-target="warranty:claims">
          <div className="ppanel__h">
            <b className="ppanel__t">
              {t("claimsTitle")}
              {filed.length ? <span className="cx-count">{filed.length}</span> : null}
            </b>
          </div>
          {orders.status === "loading" ? (
            <Skeleton rows={2} />
          ) : !filed.length ? (
            <div className="cx-empty war__empty">
              <span className="cx-empty__ic" aria-hidden="true"><IconInbox /></span>
              <p>{t("noClaims")}</p>
            </div>
          ) : (
            <div className="alist pf-list">
              {filed.map((o) => (
                <Link className="creq pf-row pf-row--link" key={o.id} href={orderHref(o)}>
                  <div className="creq__m">
                    <b>{name(o)}</b>
                    <span>{[o.workId, o.warranty.reason].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="pf-row__end">
                    <span className={`cx-pill pf-pill pf-pill--${PENDING.has(o.warranty.status) ? "warn" : "ok"}`}>{stateOf(o)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
