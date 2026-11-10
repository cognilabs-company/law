"use client";

import "./ordersList1920.css";
import { useEffect, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, CircleCheck, Loader, MessageSquareText, Sparkles } from "lucide-react";
import { initials } from "@/lib/lawyers";
import { personName } from "@/lib/labels";
import { Link } from "@/i18n/navigation";
import {
  listClientDocumentFlowPage,
  isDocFlowOpen,
  DOC_FLOW_PAGE,
  type ClientDocFlowItem,
} from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import { useDocChatRooms } from "@/lib/useDocChatRooms";
import { shortDateTime } from "@/lib/date";
import { docNextActionKey, statusLabel } from "@/lib/labels";
import { IconVideo, IconClock } from "@/components/icons";

// Document work by its picture — the dashboard's "Huquqiy hujjatlar" drawing.
const ART = { "--art": "url(/img/xizmatlar/Huquqiy_hujjatlar.webp)" } as CSSProperties;
// The dashboard's pill tones: finished green, with someone else amber, else blue.
const toneOf = (s: string) =>
  /^(completed|file_ready|done|delivered|resolved)$/.test(s) ? "ok" : /^(new|open_pool|pending|under_review|lawyer_review|questionnaire|payment_pending)$/.test(s) ? "warn" : "blue";

// Document work the client has started and not got back yet.
//
// It already has a page of its own ("Mening hujjatlarim"), but that is not
// where anyone looks for "what is still open" — the cases page is. An
// unfinished request used to be invisible here, so a client who closed the
// order modal had nothing telling them the request existed, let alone a way
// into the chat with the advocate handling it.
export default function OpenDocumentWork() {
  const t = useTranslations("portal.client.documentRequests");
  const tcm = useTranslations("portal.common");
  const tl = useTranslations("lxOrders");
  const locale = useLocale();
  const [items, setItems] = useState<ClientDocFlowItem[]>([]);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    listClientDocumentFlowPage({ limit: DOC_FLOW_PAGE, offset: 0 })
      .then((p) => { if (alive) { setItems(p.items.filter(isDocFlowOpen)); setReady(true); } })
      // Silent: this is a supplementary block on someone else's page, and a
      // failed fetch here must not put an error banner over the case list.
      .catch(() => alive && setReady(true));
    return () => { alive = false; };
  }, [reload]);

  useEffect(() => {
    return subscribeUserEvents((e) => {
      if (e.event.startsWith("document_request.")) setReload((k) => k + 1);
    });
  }, []);

  // The room is not on the list row — see useDocChatRooms. Only rows that
  // could have one are asked about; a self-filled document never does.
  const chatIds = items.filter((it) => it.mode === "lawyer" || it.assignedLawyer).map((it) => it.id);
  const rooms = useDocChatRooms(chatIds, reload);

  const nextActionText = (raw: string) => {
    const key = docNextActionKey(raw);
    return key ? t(key, { section: t("title") }) : raw;
  };

  if (!ready || !items.length) return null;

  return (
    <section className="ppanel odw" data-ai-target="cases:open-documents">
      {/* The dashboard's section head: small title, count, "view all →". */}
      <div className="ppanel__h">
        <h2 className="ppanel__t cx-h3">
          {t("openTitle")}
          <span className="cx-count">{items.length}</span>
        </h2>
        <Link href="/portal/client/documents" className="cx-link">
          {tcm("viewAll")}
          <ArrowRight aria-hidden />
        </Link>
      </div>
      <p className="lx-sub odw__lead">{t("openLead")}</p>
      <ul className="odw__list">
        {items.map((it) => {
          const st = it.status ? statusLabel(tcm, it.status, "docStatus") || it.statusLabel : it.statusLabel;
          const tone = toneOf(it.status || "");
          const lawyer = personName(it.assignedLawyer?.name);
          const room = it.secureChatRoomId || rooms[it.id] || "";
          return (
            <li key={it.id} className="odw__row cx-work">
              <div className="odw__h">
                <span className="odw__i odw__art" style={ART} aria-hidden />
                <div className="odw__m">
                  <b>{it.title || t("title")}</b>
                  <span className="odw__sub">{it.createdAt ? shortDateTime(it.createdAt, locale) : ""}</span>
                </div>
                {st ? (
                  <span className={`cx-pill cx-pill--${tone}`}>
                    {tone === "ok" ? <CircleCheck aria-hidden /> : tone === "warn" ? <Loader aria-hidden /> : <Sparkles aria-hidden />}
                    {st}
                  </span>
                ) : null}
              </div>
              {it.nextAction ? <span className="odw__next">{nextActionText(it.nextAction)}</span> : null}
              {it.meeting?.active ? (
                <span className="odw__live"><IconVideo />{t("meetingActive")}</span>
              ) : null}
              <div className="odw__foot">
                <span className="cx-work__who">
                  {lawyer ? <span className="cx-av" aria-hidden>{initials(lawyer)}</span> : null}
                  {lawyer ? tl("who", { name: lawyer }) : null}
                </span>
                <div className="odw__acts">
                  {room ? (
                    <Link href={`/portal/chat/${room}`} className="cx-iconbtn odw__chat" aria-label={t("openChat")} title={t("openChat")}>
                      <MessageSquareText aria-hidden />
                    </Link>
                  ) : (
                    // No room means nobody has taken it yet — say so rather than
                    // offering a button that would open an empty conversation.
                    <span className="odw__wait"><IconClock />{t("waitingLawyer")}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
