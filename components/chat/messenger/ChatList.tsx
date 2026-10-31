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
  Zap,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { CALL_LINK_RE, isMachineFileName, maskContacts } from "@/lib/chatFilter";
import { statusLabel } from "@/lib/labels";
import { aiId } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import { isLegacyReaction, type SecureRoom, type UrgentRequest } from "@/lib/services/backend";
import { hueOf, initialsOf, listTime, peerOf, roleLabel } from "./format";
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
  const unreadTotal = rooms.reduce((s, r) => s + (r.unreadCount || (r.hasUnread ? 1 : 0)), 0);

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
      <div className="mx-state" role="alert">
        <span className="mx-state__i mx-state__i--err">{offline ? <WifiOff aria-hidden /> : <ServerCrash aria-hidden />}</span>
        <b>{t("errorTitle")}</b>
        <p>{offline ? t("errorText") : t("serverErrorText")}</p>
        <button type="button" className="mx-btn mx-btn--pri" onClick={reloadRooms}>
          <RefreshCw aria-hidden />
          {t("retry")}
        </button>
      </div>
    ) : !rooms.length ? (
      <div className="mx-state">
        <span className="mx-state__i"><MessagesSquare aria-hidden /></span>
        <b>{t("empty")}</b>
        <p>{t("emptyText")}</p>
      </div>
    ) : !shown.length ? (
      <div className="mx-state mx-state--sm">
        <span className="mx-state__i"><Search aria-hidden /></span>
        <b>{filter === "unread" && !needle ? t("unreadEmpty") : t("noMatch")}</b>
        <p>{filter === "unread" && !needle ? t("unreadEmptyText") : t("noMatchText")}</p>
        {needle || filter ? (
          <button type="button" className="mx-btn" onClick={() => { setQ(""); setFilter(""); }}>
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
                <span className={`mx-av${peer.group ? " mx-av--group" : ""}`} style={{ ["--h" as string]: hueOf(peer.ids[0] || r.id) }} aria-hidden>
                  {peer.group ? <Users /> : initialsOf(peer.name) || <Lock />}
                </span>
                <span className="mx-row__m">
                  <span className="mx-row__top">
                    <b className="mx-row__n">{name}</b>
                    {peer.role ? <span className="mx-row__role">{roleLabel(peer.role, ts)}</span> : null}
                    <time className="mx-row__t" dateTime={at || undefined}>{listTime(at, locale, ts)}</time>
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
                      <span>{p.text}</span>
                    </span>
                    {unread ? (
                      <span className="mx-badge" aria-label={t("unreadCount", { n: unread })}>{unread > 99 ? "99+" : unread}</span>
                    ) : null}
                  </span>
                  {rec || closed ? (
                    <span className="mx-row__tags">
                      {rec ? (
                        <span className="mx-tag mx-tag--urgent">
                          <Zap aria-hidden />
                          {service}
                        </span>
                      ) : null}
                      {rec?.workId ? <span className="mx-tag mx-tag--mono" title={t("workId")}>#{rec.workId}</span> : null}
                      {closed ? <span className="mx-tag mx-tag--done">{statusLabel(tc, r.status)}</span> : null}
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
          <Link href={backHref} className="mx-ib" aria-label={t("back")} title={t("back")}>
            <ArrowLeft aria-hidden />
          </Link>
        ) : null}
        <h1 className="mx-list__title">
          {t("title")}
          {unreadTotal ? <span className="mx-badge mx-badge--soft">{unreadTotal > 99 ? "99+" : unreadTotal}</span> : null}
        </h1>
        <button type="button" className="mx-ib" onClick={reloadRooms} aria-label={t("refresh")} title={t("refresh")} disabled={status === "loading"}>
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
          <div className="mx-chips" role="tablist" aria-label={t("fKind")} data-ai-id={ai ? `${ai}.filters.kind` : undefined}>
            {chips.map((c) => (
              <button key={c.value || "all"} type="button" role="tab" aria-selected={filter === c.value} className={`mx-chip${filter === c.value ? " on" : ""}`} onClick={() => setFilter(c.value)}>
                {c.label}
                {c.n ? <span>{c.n}</span> : null}
              </button>
            ))}
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
