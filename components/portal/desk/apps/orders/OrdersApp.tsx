"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { onUserSocketResync } from "@/lib/userSocket";
import { matchesSearch } from "@/lib/searchText";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { MARKET_EVENT, listMarketplaceOrders, marketPhaseOf, marketStageOf, rememberMarketOrders, type MarketOrder, type MarketStage } from "@/lib/services/marketplace";
import { IconAlert, IconCheck, IconClock, IconInbox, IconPause, IconRefresh, IconTag, IconClose } from "@/components/icons";
import { App, Empty, Loading, Search, Sidebar, Tag, Tool, Toolbar, useOs, type NavSection, type Tone } from "../../kit/kit";
import type { NativeProps } from "../../native";
import Workspace from "./Workspace";
import "./orders.css";

// Service orders as a desktop program: the stages on the side, the orders
// in a list (service, client, price, where it stands), and the chosen
// order's whole workspace on the right — the same order logic as the
// cabinet's order page, drawn as this computer's program.

type Tab = "all" | MarketStage;
const TABS: Tab[] = ["all", "active", "completed", "cancelled"];
const ICON: Record<Tab, React.ReactNode> = { all: <IconInbox />, pending: <IconClock />, active: <IconTag />, completed: <IconCheck />, cancelled: <IconClose /> };
const TONE: Record<MarketStage, Tone> = { pending: "warn", active: "accent", completed: "ok", cancelled: "neutral" };

export default function OrdersApp(props: NativeProps) {
  const t = useTranslations("marketplace.orders");
  const tph = useTranslations("marketplace.orderDetail.phase");
  const te = useTranslations("enums");
  const d = useTranslations("portal.desk.orders");
  const locale = useLocale();
  const os = useOs();
  const owner = useAuth().session?.id ?? "";
  const [orders, setOrders] = useState<MarketOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const routeId = /\/marketplace-orders\/([^/?#]+)/.exec(props.route)?.[1] ?? "";
  const [sel, setSel] = useState(routeId ? decodeURIComponent(routeId) : "");

  const load = useCallback(
    () =>
      listMarketplaceOrders("seller")
        .then((l) => {
          rememberMarketOrders(l, owner);
          setOrders(l);
          setFailed(false);
        })
        .catch(() => setFailed(true)),
    [owner],
  );
  useEffect(() => {
    const h = setTimeout(() => void load(), 0);
    let timer = 0;
    const soft = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 500);
    };
    window.addEventListener(MARKET_EVENT, soft);
    const off = onUserSocketResync(soft);
    return () => {
      clearTimeout(h);
      window.clearTimeout(timer);
      window.removeEventListener(MARKET_EVENT, soft);
      off();
    };
  }, [load]);

  const all = useMemo(() => orders ?? [], [orders]);
  const term = q.trim();
  const searched = term ? all.filter((o) => matchesSearch([o.serviceTitle, o.workId, o.clientName].join(" "), term)) : all;
  const count = (k: Tab) => (k === "all" ? searched.length : searched.filter((o) => marketStageOf(o) === k).length);
  const shown = tab === "all" ? searched : searched.filter((o) => marketStageOf(o) === tab);
  const currency = (o: MarketOrder) => (!o.currency || o.currency === "UZS" ? te("currency") : o.currency);
  const sections: NavSection[] = [{ id: "s", title: os === "mac" ? d("stages") : undefined, items: TABS.map((k) => ({ id: k, label: t(`tabs.${k}`), icon: ICON[k], count: count(k) || undefined })) }];

  return (
    <App name="orders" sidebar={<Sidebar label={t("sellerTitle")} sections={sections} value={tab} onChange={(id) => setTab(id as Tab)} header={os === "win" ? <Search value={q} onChange={setQ} placeholder={t("searchPhSeller")} wide /> : undefined} />}>
      <Toolbar title={t("sellerTitle")} subtitle={orders ? d("count", { n: shown.length }) : undefined} end={os === "mac" ? <Search value={q} onChange={setQ} placeholder={t("searchPhSeller")} /> : undefined}>
        <Tool icon={<IconRefresh />} label={t("refresh")} onClick={() => void load()} />
      </Toolbar>
      <div className="dxm-body">
        <section className="dxm-list" aria-label={t("sellerTitle")}>
          {orders === null ? (
            failed ? (
              <Empty icon={<IconAlert />} title={t("error")} />
            ) : (
              <Loading label={d("loading")} />
            )
          ) : !all.length ? (
            <Empty icon={<IconTag />} title={t("emptySeller")} text={t("emptySellerText")} />
          ) : !shown.length ? (
            <Empty icon={<IconTag />} title={t("emptyFilter")} />
          ) : (
            <div className="dxm-scroll" role="listbox" aria-label={t("sellerTitle")}>
              {shown.map((o) => {
                const stage = marketStageOf(o);
                const phase = marketPhaseOf(o);
                return (
                  <div key={o.id} role="option" tabIndex={sel === o.id ? 0 : -1} aria-selected={sel === o.id} className={`dxm-row${sel === o.id ? " is-on" : ""}`} onClick={() => setSel(o.id)}>
                    <span className="dxm-row__top">
                      <b>{o.serviceTitle || o.packageTitle || "—"}</b>
                      <em>
                        {o.price ? fmtUzs(o.price) : "—"} <small>{currency(o)}</small>
                      </em>
                    </span>
                    <span className="dxm-row__sub">
                      {o.workId ? <code>{o.workId}</code> : null}
                      {o.clientName ? <span>{o.clientName}</span> : null}
                      <span>{shortDateTime(o.createdAt, locale)}</span>
                    </span>
                    <span className="dxm-row__tags">
                      <Tag tone={TONE[stage]}>{phase === "paid" ? tph("paid") : phase === "review" ? tph("review") : t(`stage.${stage}`)}</Tag>
                      {o.workPaused ? (
                        <Tag tone="warn">
                          <IconPause aria-hidden />
                          {t("paused")}
                        </Tag>
                      ) : null}
                      {phase === "in_progress" && o.expectedCompletedAt ? (
                        <Tag>
                          <IconClock aria-hidden />
                          {shortDateTime(o.expectedCompletedAt, locale)}
                        </Tag>
                      ) : null}
                      {o.checklistProgress && o.checklistProgress.total ? <Tag>{d("steps", { done: o.checklistProgress.done, total: o.checklistProgress.total })}</Tag> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        {sel ? <Workspace key={sel} orderId={sel} {...props} onChanged={() => void load()} /> : <div className="dxm-none"><Empty icon={<IconTag />} title={d("pick")} text={t("sellerLead")} /></div>}
      </div>
    </App>
  );
}
