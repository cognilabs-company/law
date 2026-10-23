"use client";

import "./messenger.css";
import { useEffect, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { MessagesSquare, ShieldCheck } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth, type Role } from "@/lib/auth";
import type { SecureRoom, UrgentRequest } from "@/lib/services/backend";
import SecureChat from "../SecureChat";
import { ChatList } from "./ChatList";
import { setOpenRoom, useRoom } from "./rooms";

// The secure messenger: the conversation list beside the open room on a wide
// screen, one or the other on a phone. Two homes, one component:
//  - inside the cabinet (client/advocate/lawyer messages pages) the open room
//    is `?room=` on the page's own URL, so the sidebar stays and back/forward
//    walk between conversations;
//  - the full-screen room route (/portal/chat/{id}) that notifications, the
//    call-centre board and order pages link to, which keeps those links and
//    now shows the list too.

export const INBOX_HREF: Record<Role, string> = {
  client: "/portal/client/messages",
  advocate: "/portal/advocate/messages",
  lawyer: "/portal/lawyer/chat",
};

export default function Messenger({
  roomId: roomProp,
  standalone = false,
  ua: uaProp,
  wid: widProp,
  svc: svcProp,
}: {
  roomId?: string;
  standalone?: boolean;
  ua?: string;
  wid?: string;
  svc?: string;
}): ReactElement {
  const t = useTranslations("secureChat.inbox");
  const tk = useTranslations("portal.client.urgent");
  const { session } = useAuth();
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const active = standalone ? roomProp || "" : sp.get("room") || "";
  const inbox = INBOX_HREF[session?.role ?? "client"];
  const { record } = useRoom(session?.id ?? "", active);

  useEffect(() => {
    setOpenRoom(active);
    return () => setOpenRoom("");
  }, [active]);

  const svcOf = (req: UrgentRequest) => (tk.has(`kinds.${req.serviceKind}`) ? tk(`kinds.${req.serviceKind}`) : req.serviceTitle || req.serviceKind);
  // The record travels in the query string exactly as the call-centre board
  // sends it (?ua=&wid=&svc=): it is what lets the room offer "Chatni
  // yakunlash" and fill its header. The service goes in already localised.
  const hrefOf = (r: SecureRoom, req: UrgentRequest | undefined) => {
    const q = new URLSearchParams();
    if (!standalone) q.set("room", r.id);
    if (req) {
      q.set("ua", req.id);
      if (req.workId) q.set("wid", req.workId);
      const svc = svcOf(req);
      if (svc) q.set("svc", svc);
    }
    const qs = q.toString();
    return standalone ? `/portal/chat/${r.id}${qs ? `?${qs}` : ""}` : `${pathname}?${qs}`;
  };

  const ua = (standalone ? uaProp : sp.get("ua")) || record?.id || "";
  const wid = (standalone ? widProp : sp.get("wid")) || record?.workId || "";
  const svc = (standalone ? svcProp : sp.get("svc")) || (record ? svcOf(record) : "");
  const back = () => router.push(standalone ? inbox : pathname, { scroll: false });

  return (
    <div className={`mx${standalone ? " mx--standalone" : ""}`} data-open={active ? "" : undefined}>
      <aside className="mx__list" aria-label={t("title")}>
        <ChatList activeId={active} hrefOf={hrefOf} backHref={standalone ? inbox : undefined} />
      </aside>
      <section className="mx__room">
        {active ? (
          <SecureChat key={active} roomId={active} embedded onClose={back} urgentRecordId={ua || undefined} workId={wid || undefined} serviceTitle={svc || undefined} />
        ) : (
          <div className="mx-pick">
            <span className="mx-pick__art" aria-hidden>
              <MessagesSquare />
              <i><ShieldCheck /></i>
            </span>
            <b>{t("selectTitle")}</b>
            <p>{t("selectText")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
