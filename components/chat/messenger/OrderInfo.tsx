"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheck, Lock, Phone, ShoppingBag, Video } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getMarketplaceOrder, marketStageOf, orderDetailHref, sellerListHref, type MarketOrder } from "@/lib/services/marketplace";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";

// The order behind an order chat, beside the conversation (owner's PDF
// 2026-11-27, K5): what was bought, where it stands, and whether calls are
// open — so a missing call button is never a mystery.
export default function OrderInfo({ orderId, role }: { orderId: string; role: string }) {
  const t = useTranslations("secureChat.orderInfo");
  const tst = useTranslations("marketplace.orders.tabs");
  const locale = useLocale();
  const [o, setO] = useState<MarketOrder | null | undefined>(undefined);

  useEffect(() => {
    if (!orderId) return;
    const ctl = new AbortController();
    getMarketplaceOrder(orderId, { signal: ctl.signal })
      .then((x) => setO(x))
      .catch(() => setO(null));
    return () => ctl.abort();
  }, [orderId]);

  if (o === undefined) return <div className="mxi" aria-busy="true"><div className="cx-skel cx-skel--tall" /></div>;
  if (o === null) return null;
  const stage = marketStageOf(o);
  const calls = o.canCreateCall && o.callsAllowed && stage === "active";
  const stageLabel = stage === "pending" ? tst("new") : tst(stage);
  return (
    <div className="mxi" aria-label={t("title")}>
      <div className="mxi__h">
        <span className="mxi__ic"><ShoppingBag aria-hidden /></span>
        <div>
          <b>{t("title")}</b>
          {o.workId ? <code>{o.workId}</code> : null}
        </div>
      </div>
      <p className="mxi__svc">{o.serviceTitle || o.packageTitle || "—"}</p>
      <dl className="mxi__facts">
        <div><dt>{t("status")}</dt><dd><span className={`mxi__pill mxi__pill--${stage}`}>{stageLabel}</span></dd></div>
        <div><dt>{t("price")}</dt><dd className="sx-num">{o.price ? `${fmtUzs(o.price)} ${t("som")}` : "—"}</dd></div>
        {o.createdAt ? <div><dt>{t("created")}</dt><dd>{shortDateTime(o.createdAt, locale)}</dd></div> : null}
      </dl>
      <div className={`mxi__calls${calls ? " is-on" : ""}`}>
        {calls ? <CircleCheck aria-hidden /> : <Lock aria-hidden />}
        <div>
          <b>{calls ? t("callsOn") : t("callsOff")}</b>
          <small>{calls ? t("callsOnText") : t("callsOffText")}</small>
        </div>
        <span className="mxi__ci" aria-hidden><Phone /><Video /></span>
      </div>
      <Link className="btn btn--line btn--full" href={orderDetailHref(sellerListHref(role), o.id)}>
        {t("open")}
      </Link>
    </div>
  );
}
