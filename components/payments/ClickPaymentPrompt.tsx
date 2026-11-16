"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { subscribeUserEvents } from "@/lib/userSocket";
import { isSosPaymentNotice, notifPaymentOf, type ClickPayment } from "@/lib/services/clickCheckout";

// Loaded only when a payment actually arrives: this sits on every page.
const ClickPayDialog = dynamic(() => import("./ClickPay"), { ssr: false });

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});

// Click integration §8: the client never creates an SOS payment. A call-centre
// operator does, once the situation is understood, and the client gets a
// notification with the payment and its checkout. When it arrives live, the
// Click dialog opens right away; the notifications page offers it too.
export default function ClickPaymentPrompt() {
  const { session } = useAuth();
  const client = session?.role === "client";
  const [pay, setPay] = useState<{ payment: ClickPayment; title: string; at: number } | null>(null);

  useEffect(() => {
    if (!client) return;
    return subscribeUserEvents((e) => {
      if (e.event !== "notification.created") return;
      const n = asDict(e.notification);
      const data = asDict(n.data);
      const kind = String(n.kind ?? data.event ?? "");
      if (!isSosPaymentNotice(kind, data)) return;
      const payment = notifPaymentOf(data);
      if (!payment) return;
      setPay((cur) => (cur && cur.payment.id === payment.id ? cur : { payment, title: String(n.title ?? ""), at: Date.now() }));
    });
  }, [client]);

  if (!client || !pay) return null;
  return <ClickPayDialog open payment={pay.payment} title={pay.title} urlIssuedAt={pay.at} aiId="sos.click" onClose={() => setPay(null)} />;
}
