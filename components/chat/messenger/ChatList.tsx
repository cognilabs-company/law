"use client";

import { useMemo, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Lock,
  MessagesSquare,
  Mic,
  RefreshCw,
  Search,
  ServerCrash,
  Users,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import Select from "@/components/Select";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { CALL_LINK_RE, isMachineFileName, maskContacts } from "@/lib/chatFilter";
import { statusLabel } from "@/lib/labels";
import { aiId } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import { isLegacyReaction, type SecureRoom, type UrgentRequest } from "@/lib/services/backend";
import { breakName, excerpt, initialsOf, listTime, peerOf, roleLabel, toneOf } from "./format";
import { reloadRooms, useRooms } from "./rooms";

// The conversation list: who each room is with, what was said last and when,
// how much is unread — newest activity first, re-ordered live by the user
// socket (see rooms.ts). Search covers names, work numbers and services; the
// chips narrow by unread and by what kind of work a room belongs to.

const KINDS = ["urgent", "order", "case", "other"] as const;
type Kind = (typeof KINDS)[number];
type Filter = "" | "unread" | Kind;

const METADATA_ONLY = "[metadata_only]";
const IMAGE_NAME = /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i;

const aiNorm = (v: string) => v.toLowerCase().replace(/[ʻʼ'‘’`]/g, "").replace(/\s*\(.*\)$/, "").replace(/\s+/g, " ").trim();

export function ChatList({
  activeId,
  hrefOf,
  backHref,
}: {
  activeId?: string;
  hrefOf: (room: SecureRoom, record: UrgentRequest | undefined) => string;
  // Standalone (the full-screen room route) the list carries the way back to
  // the cabinet; inside the cabinet the sidebar already is that.
  backHref?: string;
}): ReactElement {
  const t = useTranslations("secureChat.inbox");
  const ts = useTranslations("secureChat");
  const tc = useTranslations("portal.common");
  const tk = useTranslations("portal.client.urgent");
  const tl = useTranslations("lxComms");
  const locale = useLocale();
  const { session } = useAuth();
  const me = session?.id ?? "";
  const { status, rooms, records, error } = useRooms(me);
  // The server answered with an error, or nothing reached it at all.
  const offline = !(error instanceof ApiError) || error.status === 0;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("");

  const svcOf = (req: UrgentRequest) => (tk.has(`kinds.${req.serviceKind}`) ? tk(`kinds.${req.serviceKind}`) : req.serviceTitle || req.serviceKind);
  const kindOf = (r: SecureRoom): Kind => (records.has(r.id) ? "urgent" : r.orderId ? "order" : r.caseId ? "case" : "other");

  const rows = useMemo(
    () =>
      rooms.map((r) => {
        const peer = peerOf(r, me);
        const rec = records.get(r.id);
        return { room: r, peer, rec, kind: kindOf(r), service: rec ? svcOf(rec) : "" };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms, records, me],
  );

  const needle = q.trim().toLowerCase();
  const matched = needle
    ? rows.filter((x) =>
        [x.peer.name, ...x.peer.others.map((p) => p.name), x.rec?.workId, x.service, x.room.lastMessage?.content, x.room.orderId].some((v) =>
          (v || "").toLowerCase().includes(needle),
        ),
      )
    : rows;
  const kinds = KINDS.filter((k) => k === filter || rows.some((x) => x.kind === k));
  const unreadRooms = matched.filter((x) => x.room.unreadCount > 0 || x.room.hasUnread).length;
  const shown = filter === "unread" ? matched.filter((x) => x.room.unreadCount > 0 || x.room.hasUnread) : filter ? matched.filter((x) => x.kind === filter) : matched;

  const ai = session ? (session.role === "client" ? "marketplace.messages" : "advocate.messages") : "";
  const chips: { value: Filter; label: string; n: number }[] = [
    { value: "", label: t("filterAll"), n: matched.length },
    { value: "unread", label: t("filterUnread"), n: unreadRooms },
    ...(kinds.length > 1 ? kinds.map((k) => ({ value: k as Filter, label: t(`kinds.${k}`), n: matched.filter((x) => x.kind === k).length })) : []),
  ];
  useAiField(ai ? `${ai}.search.input` : "", { get: () => q, set: setQ, sensitive: true });
  useAiField(ai ? `${ai}.filters.kind` : "", {
    get: () => filter,
    set: (v) => {
      const w = aiNorm(v);
      const hit = chips.find((c) => aiNorm(c.value) === w) ?? chips.find((c) => aiNorm(c.label) === w) ?? chips.find((c) => w.length > 2 && aiNorm(c.label).includes(w));
      if (hit) setFilter(hit.value);
    },
  });

  function preview(r: SecureRoom): { icon: ReactElement | null; text: string } {
    const m = r.lastMessage;
    if (!m) return { icon: null, text: t("noMessages") };
    const raw = (m.content || "").trim();
    const kind = m.messageType;
    // A legacy "reaction" record (no reaction API yet, §5.1) is not a
    // message: the line never shows it, only that there is news to read.
    if (isLegacyReaction(kind)) return { icon: null, text: t("openToRead") };
    let icon: ReactElement | null = null;
    let text = raw;
    if (raw === METADATA_ONLY) {
      icon = <Lock aria-hidden />;
      text = t("hidden");
    } else if (kind === "voice") {
      icon = <Mic aria-hidden />;
      text = ts("voiceNote");
    } else if (kind === "call" || kind === "meeting" || CALL_LINK_RE.test(raw)) {
      icon = <Video aria-hidden />;
      text = ts("joinZoom");
    } else if (kind === "file" || (raw && isMachineFileName(raw))) {
      const img = IMAGE_NAME.test(raw);
      icon = img ? <ImageIcon aria-hidden /> : <FileText aria-hidden />;
      text = !raw || isMachineFileName(raw) ? (img ? ts("imageGeneric") : ts("fileGeneric")) : raw;
    } else text = maskContacts(raw);
    return { icon, text: text || ts("fileGeneric") };
  }

  const list =
    status === "loading" || status === "idle" ? (
      <ul className="mx-list__rows" aria-busy="true" aria-label={ts("loading")}>
        {Array.from({ length: 7 }, (_, i) => (
          <li key={i} className="mx-row mx-row--sk" aria-hidden>
            <span className="mx-av mx-sk" />
            <span className="mx-row__m">
              <span className="mx-sk mx-sk--l" style={{ width: `${48 + ((i * 17) % 34)}%` }} />
              <span className="mx-sk mx-sk--s" style={{ width: `${62 + ((i * 23) % 30)}%` }} />
            </span>
          </li>
        ))}
      </ul>
    ) : status === "error" ? (
      <div className="mx-state cx-empty" role="alert">
        <span className="mx-state__i cx-empty__ic">{offline ? <WifiOff aria-hidden /> : <ServerCrash aria-hidden />}</span>
        <b>{t("errorTitle")}</b>
        <p>{offline ? t("errorText") : t("serverErrorText")}</p>
        <button type="button" className="mx-btn btn btn--pri btn--sm" onClick={reloadRooms}>
          <RefreshCw aria-hidden />
          {t("retry")}
        </button>
      </div>
    ) : !rooms.length ? (
      <div className="mx-state cx-empty">
        <span className="mx-state__i cx-empty__ic"><MessagesSquare aria-hidden /></span>
        <b>{t("empty")}</b>
        <p>{t("emptyText")}</p>
      </div>
    ) : !shown.length ? (
      <div className="mx-state mx-state--sm cx-empty">
        <span className="mx-state__i cx-empty__ic"><Search aria-hidden /></span>
        <b>{filter === "unread" && !needle ? t("unreadEmpty") : t("noMatch")}</b>
        <p>{filter === "unread" && !needle ? t("unreadEmptyText") : t("noMatchText")}</p>
        {needle || filter ? (
          <button type="button" className="mx-btn btn btn--line btn--sm" onClick={() => { setQ(""); setFilter(""); }}>
            {t("clear")}
          </button>
        ) : null}
      </div>
    ) : (
      <ul className="mx-list__rows" data-ai-target="messages:inbox" data-ai-label={t("title")} data-ai-id={ai || undefined} data-ai-type="list">
        {shown.map(({ room: r, peer, rec, service }, i) => {
          const unread = r.unreadCount || (r.hasUnread ? 1 : 0);
          const p = preview(r);
          const at = r.lastMessage?.createdAt || r.lastMessageAt || r.updatedAt || r.createdAt;
          const name = peer.name || (service ? service : `${t("room")} #${i + 1}`);
          const st = (r.status || "").toLowerCase();
          const closed = st && st !== "active" && st !== "open";
          const on = r.id === activeId;
          return (
            <li key={r.id}>
              <Link
                href={hrefOf(r, rec)}
                scroll={false}
                className={`mx-row${unread ? " mx-row--new" : ""}${on ? " mx-row--on" : ""}`}
                aria-current={on ? "page" : undefined}
                data-ai-id={r.id && ai ? aiId(`${ai}.room`, r.id) : undefined}
                data-ai-type="list_item"
                data-ai-entity-type="secure_chat"
                data-ai-entity-id={r.id || undefined}
                data-ai-label={[name, rec?.workId, unread ? t("unreadCount", { n: unread }) : ""].filter(Boolean).join(" · ")}
                data-ai-private
              >
                <span className={`mx-av cx-av${peer.group ? " mx-av--group" : ""}`} aria-hidden>
                  {peer.group ? <Users /> : initialsOf(peer.name) || <Lock />}
                </span>
                <span className="mx-row__m">
                  <span className="mx-row__top">
                    {/* first in the line so it can sit top-right while the
                        name and role wrap beside it */}
                    <time className="mx-row__t" dateTime={at || undefined}>{listTime(at, locale, ts)}</time>
                    <b className="mx-row__n">{name}</b>
                    {peer.role ? <span className="mx-row__role">{roleLabel(peer.role, ts)}</span> : null}
                  </span>
                  <span className="mx-row__bot">
                    <span className="mx-row__p">
                      {isLegacyReaction(r.lastMessage?.messageType) ? null : r.lastMessage?.isMine ? (
                        <>
                          <CheckCheck className="mx-row__tick" aria-hidden />
                          <em>{t("you")}</em>
                        </>
                      ) : peer.group && r.lastMessage?.senderName ? (
                        <em className="mx-row__by">{r.lastMessage.senderName}:</em>
                      ) : null}
                      {p.icon}
                      <span>{excerpt(p.text)}</span>
                    </span>
                    {unread ? (
                      <span className="mx-badge" aria-label={t("unreadCount", { n: unread })}>{unread > 99 ? "99+" : unread}</span>
                    ) : null}
                  </span>
                  {rec || closed ? (
                    <span className="mx-row__tags">
                      {/* the work's service and number, as the dashboard's grey meta line */}
                      {rec && (service || rec.workId) ? (
                        <span className="mx-row__meta">
                          {service}
                          {service && rec.workId ? " · " : null}
                          {rec.workId ? <span className="mx-row__wid" title={t("workId")}>{breakName(`#${rec.workId}`)}</span> : null}
                        </span>
                      ) : null}
                      {closed ? <span className={`mx-tag mx-tag--done cx-pill ${toneOf(st)}`}>{statusLabel(tc, r.status)}</span> : null}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="mx-list">
      <header className="mx-list__head">
        {backHref ? (
          <Link href={backHref} className="mx-ib cx-iconbtn" aria-label={t("back")} title={t("back")}>
            <ArrowLeft aria-hidden />
          </Link>
        ) : null}
        {/* The page's title is the shell's ("Xabarlar"); the list is one
            section of it, titled like the dashboard's "Jarayondagi ishlar". */}
        <h2 className="mx-list__title cx-h3">
          {tl("listTitle")}
          {rooms.length ? <span className="cx-count">{rooms.length}</span> : null}
        </h2>
        <button type="button" className="mx-ib cx-iconbtn" onClick={reloadRooms} aria-label={t("refresh")} title={t("refresh")} disabled={status === "loading"}>
          <RefreshCw aria-hidden className={status === "loading" ? "mx-spin" : undefined} />
        </button>
      </header>
      <div className="mx-list__tools">
        <label className="mx-search">
          <Search aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            data-ai-target="messages:search"
            data-ai-id={ai ? `${ai}.search.input` : undefined}
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label={t("clear")}>
              <X aria-hidden />
            </button>
          ) : null}
        </label>
        {rooms.length ? (
          // One select with every filter and its count: as chips in this
          // narrow column they broke onto a second line with one left alone.
          <div className="mx-filter" data-ai-id={ai ? `${ai}.filters.kind` : undefined}>
            <Select
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              options={chips.map((c) => ({ value: c.value, label: c.n ? `${c.label} · ${c.n}` : c.label }))}
              ariaLabel={t("fKind")}
            />
          </div>
        ) : null}
      </div>
      <div className="mx-list__scroll">{list}</div>
      <p className="mx-list__foot">
        <Lock aria-hidden />
        {t("lead")}
      </p>
    </div>
  );
}
