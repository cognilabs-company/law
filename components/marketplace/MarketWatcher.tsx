"use client";

import "./marketWatcher.css";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth, type Role } from "@/lib/auth";
import { parseServerTime } from "@/lib/http";
import { shortDateTime } from "@/lib/date";
import { subscribeUserEvents } from "@/lib/userSocket";
import { MARKET_EVENT, isMarketOrderHeld, marketChatHref, marketSignalOf, type MarketSignal } from "@/lib/services/marketplace";
import { IconAlert, IconBell, IconChat, IconCheck, IconClock, IconClose, IconCoins, IconInfo, IconLock, IconRefresh, IconTag, IconUsers } from "@/components/icons";
import { subscribeUnread } from "@/lib/unread";
import { noteNegotiationEvent } from "./order/negotiationStore";

// `look` picks the card's icon and tint for the 2026-10-26 events
// (reassignment, the cancellation discussion, refunds, escalations).
type Look = "swap" | "chat" | "lock" | "refund" | "alert";
type Toast = { id: number; kind: MarketSignal["kind"]; title: string; text: string; href: string; workId: string; look?: Look };

const LOOK_ICON = { swap: IconUsers, chat: IconChat, lock: IconLock, refund: IconCoins, alert: IconAlert } as const;
const evName = (ev: Record<string, unknown>): string => {
  const n = ev.notification && typeof ev.notification === "object" ? (ev.notification as Record<string, unknown>).data : null;
  const inner = n && typeof n === "object" ? String((n as Record<string, unknown>).event ?? "") : "";
  return String(ev.event === "notification.created" ? inner : ev.event).replace(/^marketplace_/, "marketplace.");
};

const DEDUPE_MS = 20000;
const REVIEW_OUTCOMES = ["continue", "new_price", "cancel", "reassign", "refund"];

function negotiationOutcome(raw: string): "accepted" | "countered" | "rejected" | "expired" | "other" {
  if (/^accept/.test(raw)) return "accepted";
  if (/^counter/.test(raw)) return "countered";
  if (/^reject|^declin/.test(raw)) return "rejected";
  if (/^expir/.test(raw)) return "expired";
  return "other";
}

// `staff`: the call-center console's copy. It shows only what an operator
// acts on (new cancellation requests, discussions, escalations) and links
// to the console tab, never to a private service room.
export default function MarketWatcher({ role, staff = false }: { role: Role; staff?: boolean }) {
  const t = useTranslations("marketplace.toast");
  const locale = useLocale();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unread, setUnread] = useState(0);
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

  useEffect(() => subscribeUnread(setUnread), []);

  useEffect(() => {
    return subscribeUserEvents((ev) => {
      if (!staff) noteNegotiationEvent(ev, ownerRef.current);
      const sig = marketSignalOf(ev);
      if (!sig) return;
      const now = Date.now();
      const key = `${sig.kind}${sig.sub ? `.${sig.sub}` : ""}:${sig.orderId || sig.roomId || sig.serviceTitle}`;
      const last = seen.current.get(key) ?? 0;
      seen.current.set(key, now);
      if (now - last < 1500) return;
      if (!staff) window.dispatchEvent(new CustomEvent(MARKET_EVENT, { detail: sig }));
      if (!staff && sig.orderId && isMarketOrderHeld(sig.orderId)) return;
      if (now - last < DEDUPE_MS) return;
      const tt = tRef.current;
      const name = evName(ev);
      const roomHref = sig.roomId ? marketChatHref({ roomId: sig.roomId, workId: sig.workId, serviceTitle: sig.serviceTitle }) : "";
      if (staff) {
        // No internal reason or hidden seller in the card: the queue has it.
        let card: Omit<Toast, "id"> | null = null;
        const tab = (k: string) => `/admin/call-center?tab=${k}`;
        if (sig.kind === "review" && sig.sub === "created") card = { kind: "review", look: "alert", title: tt("staff.reviewCreated"), text: tt("staff.reviewCreatedText"), href: tab("cancellations"), workId: sig.workId };
        else if (sig.kind === "review" && sig.sub === "chat_created") card = { kind: "review", look: "chat", title: tt("chat.created"), text: tt("staff.chatCreatedText"), href: roomHref || tab("cancellations"), workId: sig.workId };
        else if (sig.kind === "review" && sig.sub === "chat_closed") card = { kind: "review", look: "lock", title: tt("chat.closed"), text: tt("chat.closedText"), href: tab("cancellations"), workId: sig.workId };
        else if (/assignment_escalated$/.test(name)) card = { kind: "other", look: "alert", title: tt("staff.escalated"), text: tt("staff.escalatedText"), href: tab("escalations"), workId: sig.workId };
        else if (sig.kind === "refund" && sig.sub === "rejected") card = { kind: "rejected", look: "refund", title: tt("refund.rejected"), text: tt("staff.refundRejectedText"), href: tab("cancellations"), workId: sig.workId };
        if (!card) return;
        const id = nextId.current++;
        setToasts((cur) => [...cur.slice(-2), { id, ...card }]);
        setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 12000);
        return;
      }
      const ordersHref = role === "client" ? "/portal/client/marketplace-orders" : `/portal/${role}/marketplace-orders`;
      const orderHref = sig.orderId ? `${ordersHref}/${encodeURIComponent(sig.orderId)}` : ordersHref;
      const sectionHref = (section: string) => (sig.orderId ? `${orderHref}#${section}` : ordersHref);
      let toast: (Omit<Toast, "id" | "workId"> & { workId?: string }) | null = null;
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
        toast = { kind: sig.sub === "approved" ? "paid" : "rejected", look: "refund", title: tt(`refund.${sig.sub}`), text: tt(`refund.${sig.sub}Text`), href: orderHref };
      } else if (sig.kind === "refund" && /refund_processing$/.test(name)) {
        toast = { kind: "refund", look: "refund", title: tt("refund.processing"), text: tt("refund.processingText"), href: orderHref };
      } else if (sig.kind === "reassigned" && sig.sub === "started") {
        // The client never sees who the candidate is (contract §9).
        toast = { kind: "reassigned", look: "swap", title: tt(role === "client" ? "reassign.started" : "reassign.startedSeller"), text: tt(role === "client" ? "reassign.startedText" : "reassign.startedSellerText"), href: orderHref };
      } else if (sig.kind === "reassigned" && sig.sub === "accepted" && role === "client") {
        toast = { kind: "reassigned", look: "swap", title: tt("reassign.accepted"), text: tt("reassign.acceptedText"), href: orderHref };
      } else if (sig.kind === "review" && sig.sub === "chat_created") {
        toast = { kind: "review", look: "chat", title: tt("chat.created"), text: tt("chat.createdText"), href: roomHref || sectionHref("mod-cancel") };
      } else if (sig.kind === "review" && sig.sub === "chat_closed") {
        toast = { kind: "review", look: "lock", title: tt("chat.closed"), text: tt("chat.closedText"), href: roomHref || sectionHref("mod-cancel") };
      } else if (sig.kind === "completed" && role === "client") {
        // A redone order (rework_completed) opens fresh rating and complaint windows.
        const redone = [ev, ev.data, ev.payload].some((x) => !!x && typeof x === "object" && (x as Record<string, unknown>).rework_completed === true);
        toast = { kind: "paid", title: redone ? tt("redone") : tt("completed"), text: redone ? tt("redoneText") : tt("completedText"), href: sectionHref("mod-rating") };
      } else if (sig.kind === "started" && role === "client") {
        const at = parseServerTime(sig.deadlineAt ?? "");
        const deadline = Number.isFinite(at) ? shortDateTime(new Date(at).toISOString(), localeRef.current) : "";
        toast = { kind: "paid", title: tt("started"), text: deadline ? tt("startedText", { deadline }) : tt("startedTextNoDeadline"), href: orderHref };
      } else if (sig.kind === "review" && sig.sub === "created") {
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
      if (sig.kind === "complaint" && sig.sub === "resolved") {
        // The call center's ruling on a complaint. valid_rework moves a
        // finished order back to work: the seller has to redo it.
        const out = sig.outcome ?? "";
        const key = out === "valid_rework" ? "rework" : /refund/.test(out) ? "refund" : out === "invalid" || out === "resolved" ? "closed" : "other";
        const who = role === "client" ? "client" : "seller";
        const name = sig.serviceTitle || sig.workId;
        const text = tt(`complaint.${who}.${key}Text`);
        toast = { kind: "complaint", title: tt(`complaint.${who}.${key}`), text: name ? `${name}: ${text}` : text, href: orderHref };
      }
      if (sig.kind === "assigned" && role !== "client") {
        // The seller's answer window: open the order to accept or decline.
        const soon = sig.sub === "soon";
        const name = sig.serviceTitle || sig.workId;
        toast = {
          kind: "assigned",
          title: soon ? tt("assignSoon", { n: sig.minutesLeft ?? 10 }) : tt("assignNew"),
          text: soon ? (name ? tt("assignSoonText", { service: name }) : tt("assignSoonTextNoService")) : name ? tt("assignNewText", { service: name }) : tt("assignNewTextNoService"),
          href: orderHref,
        };
      }
      if (!toast) return;
      const id = nextId.current++;
      const card: Toast = { id, ...toast, workId: toast.workId ?? sig.workId };
      setToasts((cur) => [...cur.slice(-2), card]);
      // A request waiting for an answer stays up longer than news does.
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), toast.kind === "assigned" || toast.kind === "complaint" ? 30000 : 9000);
    });
  }, [role, staff]);

  if (!toasts.length) return null;
  return (
    <div className="mk-toasts" role="status" aria-live="polite">
      {toasts.map((x) => {
        const Look = x.look ? LOOK_ICON[x.look] : null;
        return (
        <div key={x.id} className={`mk-toast mk-toast--${x.kind}${x.look ? ` mk-toast--look-${x.look}` : ""}`}>
          <span className="mk-toast__ic" aria-hidden="true">
            {Look ? <Look /> : x.kind === "paid" ? <IconCheck /> : x.kind === "rejected" ? <IconInfo /> : x.kind === "assigned" ? <IconClock /> : x.kind === "complaint" ? <IconRefresh /> : <IconTag />}
          </span>
          <div className="mk-toast__b">
            <b>{x.title}</b>
            <span>{x.text}</span>
            <span className="mk-toast__row">
              {x.workId ? <code className="mk-toast__id">{x.workId}</code> : null}
              <Link href={x.href} className="mk-toast__go" onClick={() => setToasts((cur) => cur.filter((y) => y.id !== x.id))}>
                {t("open")}
              </Link>
              {unread > 0 && !staff ? (
                <Link href={`/portal/${role}/notifications`} className="mk-toast__unread" aria-label={t("unread", { n: unread })} title={t("unread", { n: unread })}>
                  <IconBell aria-hidden="true" />
                  <span className="sx-num">{unread > 99 ? "99+" : unread}</span>
                </Link>
              ) : null}
            </span>
          </div>
          <button type="button" className="mk-toast__x" aria-label={t("close")} onClick={() => setToasts((cur) => cur.filter((y) => y.id !== x.id))}>
            <IconClose />
          </button>
        </div>
        );
      })}
    </div>
  );
}
