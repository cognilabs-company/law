"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/lib/auth";
import { subscribeUserEvents } from "@/lib/userSocket";
import { MARKET_EVENT, marketSignalOf, type MarketSignal } from "@/lib/services/marketplace";
import { IconCheck, IconClose, IconInfo, IconTag } from "@/components/icons";

type Toast = { id: number; kind: MarketSignal["kind"]; title: string; text: string; href: string };

const DEDUPE_MS = 20000;

export default function MarketWatcher({ role }: { role: Role }) {
  const t = useTranslations("marketplace.toast");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(new Map<string, number>());
  const nextId = useRef(1);
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
  });

  useEffect(() => {
    return subscribeUserEvents((ev) => {
      const sig = marketSignalOf(ev);
      if (!sig) return;
      const now = Date.now();
      const key = `${sig.kind}:${sig.orderId || sig.roomId || sig.serviceTitle}`;
      const last = seen.current.get(key) ?? 0;
      seen.current.set(key, now);
      if (now - last < 1500) return;
      window.dispatchEvent(new CustomEvent(MARKET_EVENT, { detail: sig }));
      if (now - last < DEDUPE_MS) return;
      const tt = tRef.current;
      const ordersHref = role === "client" ? "/portal/client/marketplace-orders" : `/portal/${role}/marketplace-orders`;
      let toast: Omit<Toast, "id"> | null = null;
      if (sig.kind === "paid" && role === "client") {
        toast = {
          kind: "paid",
          title: tt("paid"),
          text: sig.serviceTitle ? tt("paidText", { service: sig.serviceTitle }) : tt("paidTextNoService"),
          href: sig.roomId ? `/portal/chat/${encodeURIComponent(sig.roomId)}` : ordersHref,
        };
      } else if (sig.kind === "paid") {
        toast = { kind: "paid", title: tt("newOrder"), text: tt("newOrderText"), href: ordersHref };
      } else if (sig.kind === "rejected" && role === "client") {
        toast = { kind: "rejected", title: tt("rejected"), text: tt("rejectedText"), href: ordersHref };
      }
      if (!toast) return;
      const id = nextId.current++;
      setToasts((cur) => [...cur.slice(-2), { id, ...toast }]);
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 9000);
    });
  }, [role]);

  if (!toasts.length) return null;
  return (
    <div className="mk-toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`mk-toast mk-toast--${x.kind}`}>
          <span className="mk-toast__ic" aria-hidden="true">
            {x.kind === "paid" ? <IconCheck /> : x.kind === "rejected" ? <IconInfo /> : <IconTag />}
          </span>
          <div className="mk-toast__b">
            <b>{x.title}</b>
            <span>{x.text}</span>
            <Link href={x.href} className="mk-toast__go" onClick={() => setToasts((cur) => cur.filter((y) => y.id !== x.id))}>
              {t("open")}
            </Link>
          </div>
          <button type="button" className="mk-toast__x" aria-label={t("close")} onClick={() => setToasts((cur) => cur.filter((y) => y.id !== x.id))}>
            <IconClose />
          </button>
        </div>
      ))}
    </div>
  );
}
