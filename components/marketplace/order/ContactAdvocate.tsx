"use client";

import "./contact.css";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { errDetail } from "@/lib/http";
import { startCall } from "@/lib/services/backend";
import { CALL_KINDS, loadMarketplaceOrder, marketPaymentSignalOf, marketPhaseOf, type CallKind, type MarketOrder } from "@/lib/services/marketplace";
import { subscribeUserEvents } from "@/lib/userSocket";
import { PAYMENT_SETTLE_MS } from "./lock";
import { IconChat, IconChevronDown, IconLock, IconPhone, IconVideo } from "@/components/icons";

export type CallState = "ok" | "afterPayment" | "unavailable" | "closed" | "checking";

export function callStateOf(o: Pick<MarketOrder, "canCreateCall" | "callsAllowed" | "paymentStatus" | "status" | "startedAt" | "rating"> | null): CallState {
  if (!o) return "unavailable";
  const phase = marketPhaseOf(o);
  if (phase === "completed" || phase === "rated" || phase === "cancelled") return "closed";
  if (o.canCreateCall && o.callsAllowed) return "ok";
  if (o.paymentStatus !== "paid") return "afterPayment";
  return "unavailable";
}

export type ContactAdvocateProps = {
  tone: "site" | "sx";
  size?: "md" | "sm";
  chatHref: string;
  roomId: string;
  callTitle: string;
  counterpartId: string;
  calls?: CallState;
  callTypes?: readonly CallKind[];
  orderId?: string;
  aiId: string;
  chatAiId?: string;
  className?: string;
};

type LoadedCalls = { state: CallState; types: readonly CallKind[] };

export default function ContactAdvocate({ tone, size = "md", chatHref, roomId, callTitle, counterpartId, calls, callTypes, orderId = "", aiId, chatAiId, className }: ContactAdvocateProps): ReactElement {
  const t = useTranslations("marketplace.contact");
  const router = useRouter();
  const owner = useAuth().session?.id ?? "";
  const uid = useId();
  const menuId = `${uid}-menu`;
  const noteId = `${uid}-note`;
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<LoadedCalls | null>(null);
  const fetched = useRef(false);
  const [calling, setCalling] = useState<"" | "audio" | "video">("");
  const [err, setErr] = useState("");
  const lazy = calls === undefined && !!orderId;
  const state: CallState = calls ?? (lazy ? (loaded?.state ?? "checking") : "unavailable");
  const callsOk = state === "ok" && !!roomId;
  const allowed = callTypes ?? loaded?.types ?? CALL_KINDS;
  const kinds = callsOk ? CALL_KINDS.filter((k) => allowed.includes(k)) : CALL_KINDS;

  const fetchCalls = useCallback(() => {
    fetched.current = true;
    loadMarketplaceOrder(orderId, "client", { owner })
      .then((o) => setLoaded({ state: callStateOf(o), types: o?.callTypes ?? CALL_KINDS }))
      .catch(() => setLoaded({ state: "unavailable", types: CALL_KINDS }));
  }, [orderId, owner]);

  useEffect(() => {
    if (!lazy) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeUserEvents((ev) => {
      const sig = marketPaymentSignalOf(ev);
      if (!sig || sig.orderId !== orderId || !fetched.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchCalls, PAYMENT_SETTLE_MS);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [lazy, orderId, fetchCalls]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && lazy && loaded === null && !fetched.current) fetchCalls();
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || !open) return;
    e.stopPropagation();
    setOpen(false);
    trigger.current?.focus();
  }

  async function call(kind: "audio" | "video") {
    if (calling || !callsOk) return;
    setCalling(kind);
    setErr("");
    try {
      const c = await startCall(roomId, kind, callTitle || "LexGo", counterpartId ? { participantUserIds: [counterpartId] } : undefined);
      router.push(`/portal/chat/${encodeURIComponent(roomId)}?join=${encodeURIComponent(c.id)}`);
    } catch (e) {
      setErr(errDetail(e) || t("callError"));
      setCalling("");
    }
  }

  const note = state === "ok" ? "" : t(`calls.${state}`);
  const triggerClass =
    tone === "sx"
      ? `sx-btn sx-btn--primary${size === "sm" ? " sx-btn--sm" : ""} mkc__trigger`
      : `btn btn--grad${size === "sm" ? " btn--sm" : ""} mkc__trigger`;

  return (
    <div className={`mkc mkc--${tone}${open ? " is-open" : ""}${className ? ` ${className}` : ""}`} onKeyDown={onKey}>
      <button
        ref={trigger}
        type="button"
        className={triggerClass}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={toggle}
        data-ai-id={aiId}
        data-ai-type="button"
        data-ai-label={t("title")}
      >
        <IconChat aria-hidden="true" />
        <span className={tone === "sx" ? "sx-btn__label" : undefined}>{t("title")}</span>
        <IconChevronDown aria-hidden="true" className="mkc__chev" />
      </button>
      {open ? (
        <div className="mkc__menu" id={menuId} role="group" aria-label={t("title")}>
          <Link href={chatHref} className="mkc__opt" data-ai-id={chatAiId ?? `${aiId}.chat`} data-ai-label={t("chat")}>
            <span className="mkc__ico" aria-hidden="true">
              <IconChat />
            </span>
            <span className="mkc__txt">
              <b>{t("chat")}</b>
              <small>{t("chatHint")}</small>
            </span>
          </Link>
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              className="mkc__opt"
              disabled={!callsOk || !!calling}
              aria-describedby={note ? noteId : undefined}
              onClick={() => void call(k)}
              data-ai-id={`${aiId}.${k}`}
              data-ai-type="call_button"
              data-ai-label={t(k)}
            >
              <span className="mkc__ico" aria-hidden="true">
                {k === "audio" ? <IconPhone /> : <IconVideo />}
              </span>
              <span className="mkc__txt">
                <b>{t(k)}</b>
                <small>{calling === k ? t("calling") : t(`${k}Hint`)}</small>
              </span>
              {callsOk ? null : <IconLock aria-hidden="true" className="mkc__lock" />}
            </button>
          ))}
          {note ? (
            <p className="mkc__note" id={noteId} role={state === "checking" ? "status" : undefined}>
              {note}
            </p>
          ) : null}
          {err ? (
            <p className="mkc__err" role="alert">
              {err}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
