"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { listSecureChats, listLawyers, getLawyerClients, type SecureRoom } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useAuth } from "@/lib/auth";
import { subscribeUserEvents } from "@/lib/userSocket";
import { dateTimeFull } from "@/lib/date";
import { initials } from "@/lib/lawyers";
import { statusLabel } from "@/lib/labels";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconShieldCheck, IconArrowRight, IconLock, IconSearch, IconChat, IconClock } from "@/components/icons";

// The secure-chat inbox. /secure-chats returns rooms with ids only — no
// counterpart name, no last message — so every row used to read "Room #1",
// which told the user nothing about which conversation they were opening.
// This resolves the other side's name from the directories the account can
// already see, keeps the rooms searchable, and lights a row up the moment a
// message arrives on the user socket.

type Dir = Map<string, string>;

export default function SecureInbox() {
  const t = useTranslations("secureChat.inbox");
  const tc = useTranslations("portal.common");
  const locale = useLocale();
  const { session } = useAuth();
  const res = useResource(listSecureChats, []);
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<Dir>(new Map());
  // Rooms with a message that arrived while this page was open.
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Who the other side is. Lawyers/advocates are a public directory; a seller
  // additionally sees their own clients. Both calls are best-effort: a name is
  // an improvement on the row, never a requirement for it.
  useEffect(() => {
    let alive = true;
    Promise.allSettled([listLawyers({ includeUnverified: true }), getLawyerClients()]).then(([lawyers, clients]) => {
      if (!alive) return;
      const m: Dir = new Map();
      if (lawyers.status === "fulfilled") for (const l of lawyers.value) if (l.userId) m.set(l.userId, l.name || l.phone);
      if (clients.status === "fulfilled") for (const c of clients.value) if (c.id) m.set(c.id, c.name || c.phone);
      setDir(m);
    });
    return () => { alive = false; };
  }, []);

  // A new secure-chat message marks its room, so the inbox does not have to be
  // reloaded to see that something happened.
  useEffect(() => {
    return subscribeUserEvents((e) => {
      const d = e as Record<string, unknown>;
      const room = String(d.room_id ?? "");
      // The user-level stream names it "secure_chat.message_created"
      // (lexgo_frontend_doc_chat_update.md §5); "secure_chat_message" is the
      // NOTIFICATION event name, which also reaches here through
      // notification.created. Both are accepted so neither spelling is missed.
      const isChat = e.event === "secure_chat.message_created" || e.event === "secure_chat_message" || e.event === "notification.created";
      if (!room || !isChat) return;
      setFresh((cur) => (cur.has(room) ? cur : new Set(cur).add(room)));
    });
  }, []);

  const me = session?.id ?? "";
  const otherOf = (r: SecureRoom) => (r.clientUserId === me ? r.sellerUserId : r.clientUserId) || r.sellerUserId || r.clientUserId || "";
  const nameOf = (r: SecureRoom) => dir.get(otherOf(r)) || "";

  const rows = useMemo(() => {
    // Newest room first — the list arrived in creation order, which put the
    // conversation the user is most likely to want at the very bottom.
    const sorted = [...res.data].sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "") || 0);
    const needle = q.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((r) => [nameOf(r), r.id, r.orderId, r.caseId].some((v) => (v || "").toLowerCase().includes(needle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.data, q, dir, me]);

  const unreadN = rows.filter((r) => fresh.has(r.id)).length;

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconChat /></span>{t("title")}</b>
        <span className="ppanel__hact">
          {unreadN ? <em className="sinbox__newn">{t("newN", { n: unreadN })}</em> : null}
          <span className="advmuted">{rows.length}</span>
        </span>
      </div>

      <div className="sinbox__banner">
        <span className="sinbox__banner-i"><IconLock /></span>
        <span>{t("lead")}</span>
      </div>

      {res.data.length > 4 ? (
        <div className="svsel__bar sinbox__search">
          <span className="svsel__search">
            <IconSearch />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
          </span>
        </div>
      ) : null}

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : res.status === "error" ? (
        <EmptyState icon={<IconShieldCheck />} title={tc("loadError")} text={tc("loadErrorText")} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconShieldCheck />} title={t("empty")} text={t("emptyText")} />
      ) : !rows.length ? (
        <EmptyState icon={<IconSearch />} title={t("noMatch")} text={t("noMatchText")} />
      ) : (
        <div className="sinbox">
          {rows.map((r, i) => {
            const name = nameOf(r);
            const isNew = fresh.has(r.id);
            return (
              <Link
                key={r.id}
                href={`/portal/chat/${r.id}`}
                className={`sinbox__item${isNew ? " sinbox__item--new" : ""}`}
                onClick={() => setFresh((cur) => { if (!cur.has(r.id)) return cur; const n = new Set(cur); n.delete(r.id); return n; })}
              >
                <span className="sinbox__av">{name ? initials(name) : <IconShieldCheck />}</span>
                <div className="sinbox__m">
                  <b>{name || `${t("room")} #${i + 1}`}</b>
                  <span className="sinbox__sub">
                    <IconLock />
                    {t("secured")}
                    {r.createdAt ? <><span className="sinbox__dot">·</span><IconClock />{dateTimeFull(r.createdAt, locale)}</> : null}
                  </span>
                </div>
                {isNew ? <span className="sinbox__new" aria-label={t("newMessage")} /> : null}
                {r.status ? <span className={`sinbox__st sinbox__st--${r.status.toLowerCase()}`}>{statusLabel(tc, r.status)}</span> : null}
                <span className="sinbox__go"><IconArrowRight /></span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
