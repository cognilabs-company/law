"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth, type Role } from "@/lib/auth";
import { parseServerTime } from "@/lib/http";
import { shortDateTime } from "@/lib/date";
import { subscribeUserEvents } from "@/lib/userSocket";
import { MARKET_EVENT, isMarketOrderHeld, marketChatHref, marketSignalOf, type MarketSignal } from "@/lib/services/marketplace";
import { IconCheck, IconClose, IconInfo, IconTag } from "@/components/icons";
import { noteNegotiationEvent } from "./order/negotiationStore";

type Toast = { id: number; kind: MarketSignal["kind"]; title: string; text: string; href: string };

const DEDUPE_MS = 20000;
const REVIEW_OUTCOMES = ["continue", "new_price", "cancel", "reassign", "refund"];

function negotiationOutcome(raw: string): "accepted" | "countered" | "rejected" | "expired" | "other" {
  if (/^accept/.test(raw)) return "accepted";
  if (/^counter/.test(raw)) return "countered";
  if (/^reject|^declin/.test(raw)) return "rejected";
  if (/^expir/.test(raw)) return "expired";
  return "other";
}

export default function MarketWatcher({ role }: { role: Role }) {
  const t = useTranslations("marketplace.toast");
  const locale = useLocale();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(new Map<string, number>());
  const nextId = useRef(1);
  const tRef = useRef(t);
  const localeRef = useRef(locale);
  const owner = useAuth().session?.id ?? "";
  const ownerRef = useRef(owner);

  useEffect(() => {
    tRef.current = t;
    localeRef.current = locale;
    ownerRef.current = owner;
  });

  useEffect(() => {
    return subscribeUserEvents((ev) => {
      noteNegotiationEvent(ev, ownerRef.current);
      const sig = marketSignalOf(ev);
      if (!sig) return;
      const now = Date.now();
      const key = `${sig.kind}${sig.sub ? `.${sig.sub}` : ""}:${sig.orderId || sig.roomId || sig.serviceTitle}`;
      const last = seen.current.get(key) ?? 0;
      seen.current.set(key, now);
      if (now - last < 1500) return;
      window.dispatchEvent(new CustomEvent(MARKET_EVENT, { detail: sig }));
      if (sig.orderId && isMarketOrderHeld(sig.orderId)) return;
      if (now - last < DEDUPE_MS) return;
      const tt = tRef.current;
      const ordersHref = role === "client" ? "/portal/client/marketplace-orders" : `/portal/${role}/marketplace-orders`;
      const orderHref = sig.orderId ? `${ordersHref}/${encodeURIComponent(sig.orderId)}` : ordersHref;
      const sectionHref = (section: string) => (sig.orderId ? `${orderHref}#${section}` : ordersHref);
      let toast: Omit<Toast, "id"> | null = null;
      if (sig.kind === "paid" && role === "client") {
        toast = {
          kind: "paid",
          title: tt("paid"),
          text: sig.serviceTitle ? tt("paidText", { service: sig.serviceTitle }) : tt("paidTextNoService"),
          href: sig.roomId ? marketChatHref({ roomId: sig.roomId, workId: sig.workId, serviceTitle: sig.serviceTitle }) : orderHref,
        };
      } else if (sig.kind === "paid") {
        toast = { kind: "paid", title: tt("newOrder"), text: tt("newOrderText"), href: orderHref };
      } else if (sig.kind === "rejected" && role === "client") {
        toast = { kind: "rejected", title: tt("rejected"), text: tt("rejectedText"), href: orderHref };
      } else if (sig.kind === "supplemental" && sig.sub && (role === "client" || sig.sub !== "requested")) {
        const sub = ["requested", "approved", "rejected", "escalated", "expired", "warning"].includes(sig.sub) ? sig.sub : "requested";
        toast = { kind: sub === "approved" ? "paid" : sub === "rejected" ? "rejected" : "other", title: tt(`sup.${sub}`), text: tt(`sup.${sub}Text`), href: orderHref };
      } else if (sig.kind === "refund" && (sig.sub === "approved" || sig.sub === "rejected")) {
        toast = { kind: sig.sub === "approved" ? "paid" : "rejected", title: tt(`refund.${sig.sub}`), text: tt(`refund.${sig.sub}Text`), href: orderHref };
      } else if (sig.kind === "completed" && role === "client") {
        toast = { kind: "paid", title: tt("completed"), text: tt("completedText"), href: sectionHref("mod-rating") };
      } else if (sig.kind === "started" && role === "client") {
        const at = parseServerTime(sig.deadlineAt ?? "");
        const deadline = Number.isFinite(at) ? shortDateTime(new Date(at).toISOString(), localeRef.current) : "";
        toast = { kind: "paid", title: tt("started"), text: deadline ? tt("startedText", { deadline }) : tt("startedTextNoDeadline"), href: orderHref };
      } else if (sig.kind === "review" && sig.sub === "created" && role === "client") {
        toast = { kind: "other", title: tt("review.created"), text: tt("review.createdText"), href: sectionHref("mod-cancel") };
      } else if (sig.kind === "review" && sig.sub === "resolved") {
        const outcome = REVIEW_OUTCOMES.includes(sig.outcome ?? "") ? (sig.outcome as string) : "other";
        const href = sig.groupRoomId ? marketChatHref({ roomId: sig.groupRoomId, workId: sig.workId, serviceTitle: sig.serviceTitle }) : sectionHref("mod-cancel");
        const text = tt(`review.outcome.${outcome}`);
        toast = { kind: "other", title: tt("review.resolved"), text: sig.groupRoomId ? `${text} ${tt("review.chatText")}` : text, href };
      } else if (sig.kind === "negotiation" && sig.sub === "created" && role !== "client") {
        toast = { kind: "other", title: tt("negotiation.created"), text: tt("negotiation.createdText"), href: sectionHref("mod-negotiation") };
      } else if (sig.kind === "negotiation" && sig.sub === "updated" && role === "client") {
        const outcome = negotiationOutcome(sig.outcome ?? "");
        const title = outcome === "expired" ? tt("negotiation.expired") : outcome === "other" ? tt("negotiation.changed") : tt("negotiation.updated");
        toast = { kind: outcome === "accepted" ? "paid" : outcome === "rejected" ? "rejected" : "other", title, text: tt(`negotiation.outcome.${outcome}`), href: sectionHref("mod-negotiation") };
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
