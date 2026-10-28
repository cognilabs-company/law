"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { listMarketplaceOrders, warrantyOrdersOf, type MarketOrder } from "@/lib/services/marketplace";
import { IconArrowRight, IconCheck, IconShieldCheck } from "@/components/icons";
import { Btn, Group, SettingRow, Spinner, Tag } from "../../kit/kit";
import type { NativeProps } from "../../native";

// The LexGo guarantee as a settings group: what it promises, the orders a
// claim can still be filed for, and the claims already filed. A claim is
// filed on the order itself (POST /marketplace/me/orders/{id}/warranty).

const PENDING = new Set(["pending", "open", "submitted", "in_review", "under_review", "created", "new"]);

export default function Warranty({ openLink }: { openLink: NativeProps["openLink"] }) {
  const t = useTranslations("portal.client.warranty");
  const tw = useTranslations("marketplace.orderDetail.warranty");
  const [orders, setOrders] = useState<MarketOrder[] | null>(null);
  useEffect(() => {
    let alive = true;
    listMarketplaceOrders("client")
      .then((l) => alive && setOrders(l))
      .catch(() => alive && setOrders([]));
    return () => {
      alive = false;
    };
  }, []);
  const { filed, open } = warrantyOrdersOf(orders ?? []);
  const name = (o: MarketOrder) => o.serviceTitle || o.workId || t("claim");
  const go = (o: MarketOrder) => openLink({ appId: "", route: `/portal/client/marketplace-orders/${encodeURIComponent(o.id)}#mod-warranty` });
  const stateOf = (o: MarketOrder) => {
    if (PENDING.has(o.warranty.status)) return t("reviewing");
    const r = o.warranty.resolution;
    return r && tw.has(`resolution.${r}`) ? tw(`resolution.${r}`) : t("decided");
  };
  return (
    <>
      <Group title={t("title")} footer={t("subtitle")}>
        {(["p1", "p2", "p3"] as const).map((p) => (
          <SettingRow key={p} icon={<IconCheck />} title={t(p)} />
        ))}
      </Group>
      <Group title={t("ordersTitle")} footer={t("ordersLead")}>
        {orders === null ? (
          <Spinner small />
        ) : !open.length ? (
          <SettingRow icon={<IconShieldCheck />} title={t("noOrders")} />
        ) : (
          open.map((o) => (
            <SettingRow key={o.id} icon={<IconShieldCheck />} title={name(o)} desc={[o.workId, o.lawyerName].filter(Boolean).join(" · ")}>
              <Btn small icon={<IconArrowRight />} onClick={() => go(o)}>
                {t("ask")}
              </Btn>
            </SettingRow>
          ))
        )}
      </Group>
      <Group title={t("claimsTitle")}>
        {orders === null ? (
          <Spinner small />
        ) : !filed.length ? (
          <SettingRow icon={<IconShieldCheck />} title={t("noClaims")} />
        ) : (
          filed.map((o) => (
            <SettingRow key={o.id} icon={<IconShieldCheck />} title={name(o)} desc={[o.workId, o.warranty.reason].filter(Boolean).join(" · ")} onClick={() => go(o)}>
              <Tag tone={PENDING.has(o.warranty.status) ? "warn" : "ok"}>{stateOf(o)}</Tag>
            </SettingRow>
          ))
        )}
      </Group>
    </>
  );
}
