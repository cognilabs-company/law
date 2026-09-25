"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  listClientDocumentFlowPage,
  isDocFlowOpen,
  DOC_FLOW_PAGE,
  type ClientDocFlowItem,
} from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import { shortDateTime } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import { IconFileText, IconChat, IconVideo, IconClock, IconArrowRight } from "@/components/icons";

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

  if (!ready || !items.length) return null;

  return (
    <section className="ppanel odw">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconFileText /></span>{t("openTitle")}</b>
        <Link href="/portal/client/documents" className="btn btn--line btn--sm">
          {tcm("viewAll")}
          <IconArrowRight />
        </Link>
      </div>
      <p className="advmuted odw__lead">{t("openLead")}</p>
      <ul className="odw__list">
        {items.map((it) => (
          <li key={it.id} className="odw__row">
            <span className="odw__i"><IconFileText /></span>
            <div className="odw__m">
              <b>{it.title || t("title")}</b>
              <span className="odw__sub">
                {[
                  statusLabel(tcm, it.status) || it.statusLabel,
                  it.assignedLawyer?.name,
                  it.createdAt ? shortDateTime(it.createdAt, locale) : "",
                ].filter(Boolean).join(" · ")}
              </span>
              {it.nextAction ? <span className="odw__next">{it.nextAction}</span> : null}
              {it.meeting?.active ? (
                <span className="odw__live"><IconVideo />{t("meetingActive")}</span>
              ) : null}
            </div>
            <div className="odw__acts">
              {it.secureChatRoomId ? (
                <Link href={`/portal/chat/${it.secureChatRoomId}`} className="btn btn--pri btn--sm">
                  <IconChat />
                  {t("openChat")}
                </Link>
              ) : (
                // No room yet means nobody has taken it — say so rather than
                // offering a button that would open an empty conversation.
                <span className="odw__wait"><IconClock />{t("waitingLawyer")}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
