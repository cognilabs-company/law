"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { hasAdminAccess, useAuth, type Role } from "@/lib/auth";
import { contactBlockedOf, isRouteMissing } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { toast } from "@/lib/toast";
import { usePoll, useSupportEvents } from "@/lib/useSupportEvents";
import { useAiReveal } from "@/lib/guide/targets";
import { openInstructor } from "@/lib/guide/panel";
import { aiSeg } from "@/lib/ai/ids";
import { useAiField, useAiSelection } from "@/lib/ai/registry";
import {
  SUPPORT_CATEGORIES,
  createSupportTicket,
  isActiveTicket,
  normSupportTicket,
  supportCategoryFor,
  type SupportEventKind,
  type SupportMessage,
  type SupportTicket,
} from "@/lib/services/support";
import ContactBlockedNote from "@/components/ContactBlockedNote";
import BusinessHoursBadge from "@/components/portal/BusinessHoursBadge";
import RobotAvatar from "@/components/guide/RobotAvatar";
import {
  IconAlert,
  IconArrowRight,
  IconCheckDouble,
  IconChevronLeft,
  IconClose,
  IconHeadset,
  IconPhone,
  IconPlus,
  IconRefresh,
  IconSend,
  IconSparkle,
} from "@/components/icons";
import SupportChat from "./SupportChat";
import { TicketCard, useMinuteNow, useSupportLabels } from "./bits";
import { useMyChats } from "./useMyChats";
import { SUPPORT_PHONE, SUPPORT_TEL } from "./contact";

const CLIENT_ASK = ["subscription", "payment", "documents", "marketplace", "urgent_advokat", "account"] as const;
const SELLER_ASK = ["orders", "profile", "subscription", "payment", "account"] as const;
const CLIENT_TOPICS: readonly string[] = ["subscription", "payment", "documents", "marketplace", "urgent_advokat", "account", "technical"];
const SELLER_TOPICS: readonly string[] = ["subscription", "payment", "documents", "urgent_advokat", "account", "technical"];
const KNOWN_TOPICS: readonly string[] = SUPPORT_CATEGORIES;
const TOPIC_ALIAS: Record<string, string> = { document: "documents" };
const STATUS_OF: Partial<Record<SupportEventKind, string>> = { claimed: "claimed", transferred: "transferred", closed: "closed", reopened: "reopened" };
const MAX = 4000;
const NARROW = "(max-width: 1180px)";

function topicOf(raw: string, allowed: readonly string[]): string {
  const v = raw.trim().toLowerCase();
  if (!v) return "";
  const hit = (SUPPORT_CATEGORIES as readonly string[]).includes(v) ? v : supportCategoryFor(`/${v}`);
  return allowed.includes(hit) ? hit : "";
}

function guessTopic(text: string, allowed: readonly string[]): string {
  const hit = supportCategoryFor("", text);
  return allowed.includes(hit) ? hit : "general";
}

export default function SupportHub({ role, ticketId }: { role: Role; ticketId?: string }) {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const { session } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meId = session?.id ?? "";
  const staff = hasAdminAccess(session);
  const client = role === "client";
  const base = `/portal/${role}/support`;
  const asks = client ? CLIENT_ASK : SELLER_ASK;
  const labels = useSupportLabels();
  const baseTopics = client ? CLIENT_TOPICS : SELLER_TOPICS;
  const extraTopics = labels.meta.categories
    .map((o) => TOPIC_ALIAS[o.key] ?? o.key)
    .filter((k, i, all) => k !== "general" && !KNOWN_TOPICS.includes(k) && all.indexOf(k) === i);
  const topics = extraTopics.length ? [...baseTopics, ...extraTopics] : baseTopics;

  const rawTopic = params.get("topic") || "";
  const urlTicket = ticketId || params.get("ticket") || "";
  const urlNew = params.get("new") === "1";
  const urlTopic = topicOf(rawTopic, topics);
  const wantsComposer = !urlTicket && (urlNew || Boolean(rawTopic));
  const urlKey = `${urlTicket}|${urlNew ? "1" : ""}|${rawTopic}`;

  const [selected, setSelected] = useState(urlTicket);
  const [composer, setComposer] = useState(() => ({ open: wantsComposer, force: false, nonce: wantsComposer ? 1 : 0 }));
  const [topic, setTopic] = useState(urlTopic);
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [sending, setSending] = useState(false);
  const [formErr, setFormErr] = useState<unknown>(null);
  const [tab, setTab] = useState<"active" | "closed">("active");
  const [ask, setAsk] = useState("");
  const [foreign, setForeign] = useState("");
  const [prevUrlKey, setPrevUrlKey] = useState(urlKey);

  const chats = useMyChats();
  const { upsert, patch, poll, bump, clearUnread } = chats;
  if (prevUrlKey !== urlKey) {
    setPrevUrlKey(urlKey);
    if (selected && selected !== urlTicket) clearUnread(selected);
    setSelected(urlTicket);
    if (wantsComposer) {
      setComposer((c) => ({ open: true, force: false, nonce: c.nonce + 1 }));
      if (urlTopic) setTopic(urlTopic);
    }
  }
  const now = useMinuteNow();
  const missing = chats.status === "error" && isRouteMissing(chats.error);
  const placeholder = useMemo(() => (selected ? normSupportTicket({ id: selected, status: "" }) : null), [selected]);
  const current = selected ? chats.map[selected] ?? placeholder : null;
  const latest = chats.active[0] ?? null;
  const ready = chats.status !== "loading";
  const hasAny = chats.active.length + chats.closed.length > 0 || chats.more.closed || chats.more.active;
  const rootRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLElement>(null);
  const unreadOf = (tk: SupportTicket) => (tk.id === selected ? 0 : tk.unreadCount);

  const go = useCallback((href: string) => router.replace(href as Parameters<typeof router.replace>[0], { scroll: false }), [router]);

  const open = (id: string) => {
    if (!id) return;
    if (selected && selected !== id) clearUnread(selected);
    clearUnread(id);
    setSelected(id);
    setComposer((c) => (c.open ? { ...c, open: false, force: false } : c));
    go(`${base}?ticket=${encodeURIComponent(id)}`);
  };

  const back = () => {
    clearUnread(selected);
    setSelected("");
    go(base);
  };

  const startChat = (force: boolean) => {
    if (ticketId) {
      go(`${base}?new=1`);
      return;
    }
    clearUnread(selected);
    setSelected("");
    setFormErr(null);
    setComposer((c) => ({ open: true, force, nonce: c.nonce + 1 }));
    if (urlTicket || urlNew || rawTopic) go(base);
  };

  const closeComposer = () => {
    setComposer((c) => ({ ...c, open: false, force: false }));
    setFormErr(null);
    if (urlNew || rawTopic) go(base);
  };

  const submit = async () => {
    const message = text.trim();
    if (message.length < 3 || sending) return;
    setSending(true);
    setFormErr(null);
    try {
      const tk = await createSupportTicket({
        message,
        category: topic || guessTopic(message, topics),
        priority: urgent ? "high" : "normal",
        source: "support_page",
        context: { current_path: pathname, role, topic_picked: Boolean(topic) },
      });
      setText("");
      setTopic("");
      setUrgent(false);
      setComposer((c) => ({ ...c, open: false, force: false }));
      toast(tk.workId ? t("created", { id: tk.workId }) : t("createdPlain"), { tone: "ok" });
      if (tk.id) {
        upsert(tk);
        open(tk.id);
      } else poll();
    } catch (e) {
      setFormErr(e);
    } finally {
      setSending(false);
    }
  };

  const onTicket = useCallback(
    (tk: SupportTicket) => {
      if (tk.clientUserId && meId && tk.clientUserId !== meId) {
        setForeign(tk.id);
        return;
      }
      upsert(tk);
      clearUnread(tk.id);
    },
    [meId, upsert, clearUnread],
  );

  const onMessage = useCallback(
    (m: SupportMessage) => {
      if (!selected) return;
      const at = m.createdAt || new Date().toISOString();
      patch(selected, { lastMessage: m.content, lastMessageAt: at, updatedAt: at });
    },
    [patch, selected],
  );

  const onReopen = useCallback(
    (tk: SupportTicket) => {
      upsert(tk);
      setTab("active");
    },
    [upsert],
  );

  useEffect(() => {
    if (!foreign || foreign !== selected || !staff) return;
    router.replace(`/admin/call-center/support/${encodeURIComponent(foreign)}` as Parameters<typeof router.replace>[0]);
  }, [foreign, selected, staff, router]);

  useEffect(() => {
    if (!selected) return;
    rootRef.current?.scrollIntoView({ block: "start" });
  }, [selected]);

  useEffect(() => {
    if (!composer.open || !composer.nonce || !ready) return;
    const el = composerRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    if (!window.matchMedia("(pointer: coarse)").matches) el.querySelector<HTMLElement>("textarea, .supnew__acts .btn--pri")?.focus({ preventScroll: true });
  }, [composer.nonce, composer.open, ready]);

  const { online } = useSupportEvents((e) => {
    const owner = e.ticket?.clientUserId || e.clientUserId;
    if (owner && meId && owner !== meId) return;
    const known = Boolean(chats.map[e.ticketId]);
    const status = STATUS_OF[e.kind];
    if (e.ticket) upsert(e.ticket);
    else if (known && status) patch(e.ticketId, { status });
    if (e.kind === "message") {
      const last = e.messages[e.messages.length - 1];
      if (last && !e.ticket) {
        const at = last.createdAt || new Date().toISOString();
        patch(e.ticketId, { lastMessage: last.content, lastMessageAt: at, updatedAt: at });
      }
      if (e.ticketId !== selected) for (const m of e.messages) if (m.senderUserId && m.senderUserId !== meId) bump(e.ticketId, m.id);
      if (!e.messages.length) poll();
    } else if (!e.ticket && !known && e.kind === "created") poll();
  }, poll);
  usePoll(poll, 30000, chats.status === "ready" && !online);

  useAiReveal(/^(support:(channels|ai|call|complaints)|button:operator-support)$/, () => {
    if (selected) back();
  });
  useAiReveal("support:new-chat", () => startChat(false));
  useAiReveal(/^support:(chat|message-input)$/, () => {
    if (!selected && latest) open(latest.id);
  });
  useAiReveal("support:ticket-list", () => {
    if (selected && window.matchMedia(NARROW).matches) back();
  });
  useAiReveal("support-ticket:*", (id) => {
    const tk = chats.map[id.slice("support-ticket:".length)];
    setTab(tk && !isActiveTicket(tk) ? "closed" : "active");
    if (selected && window.matchMedia(NARROW).matches) back();
  });

  const ticketBySeg = (seg: string) => Object.values(chats.map).find((x) => aiSeg(x.id) === seg) ?? null;
  const composing = !selected && composer.open && ready && (!latest || composer.force);

  useAiReveal(/^support\.(channels(\.[a-z-]+)?|ai-message-input|operator-handoff\.button|tickets\.new)$/, () => {
    if (selected) back();
  });
  useAiReveal(/^support\.new-ticket(\.[a-z-]+)?$/, (id) => {
    startChat(id !== "support.new-ticket" && id !== "support.new-ticket.resume");
  });
  useAiReveal("support.chat", () => {
    if (!selected && latest) open(latest.id);
  });
  useAiReveal(/^support\.ticket\.[^.]+\.(messages|message-input|reopen|call)$/, (id) => {
    const tk = ticketBySeg(id.split(".")[2]);
    if (tk && tk.id !== selected) open(tk.id);
  });
  useAiReveal(/^support\.ticket\.[^.]+$/, (id) => {
    const tk = ticketBySeg(id.split(".")[2]);
    setTab(tk && !isActiveTicket(tk) ? "closed" : "active");
    if (selected && window.matchMedia(NARROW).matches) back();
  });
  useAiReveal(/^support\.tickets\.(list|tabs|tab\.[a-z]+)$/, () => {
    if (selected && window.matchMedia(NARROW).matches) back();
  });

  useAiField("support.ai-message-input", {
    get: () => ask,
    set: (value) => setAsk(value.slice(0, 1000)),
    sensitive: true,
    fillable: true,
    disabled: Boolean(selected),
  });
  useAiField("support.new-ticket.message", {
    get: () => (composing ? text : ""),
    set: (value) => {
      setText(value.slice(0, MAX));
      setFormErr(null);
    },
    sensitive: true,
    fillable: true,
    disabled: !composing,
  });
  useAiField("support.new-ticket.topic", {
    get: () => (composing ? topic : ""),
    set: (value) => setTopic(topicOf(value, topics)),
    fillable: true,
    disabled: !composing,
  });
  useAiSelection("support_tickets_tab", tab);

  const askAi = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = ask.trim();
    if (!q) return;
    openInstructor({ text: q, send: true });
    setAsk("");
  };

  if (missing) {
    return (
      <div className="sup sup--soon">
        <div className="supsoon">
          <span className="supsoon__ic">
            <IconHeadset />
          </span>
          <b>{t("title")}</b>
          <p>{tc("featureSoon")}</p>
          <div className="supsoon__acts">
            <button type="button" className="btn btn--pri btn--sm" onClick={() => openInstructor()}>
              <IconSparkle />
              {t("channels.ai.title")}
            </button>
            <a className="btn btn--line btn--sm" href={`tel:${SUPPORT_TEL}`}>
              <IconPhone />
              {t("callUs")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const shown = tab === "active" ? chats.active : chats.closed;

  const tabs = (
    <div className="suptabs" role="tablist" aria-label={t("chats.title")} data-ai-id="support.tickets.tabs">
      <button type="button" role="tab" aria-selected={tab === "active"} className="suptab" onClick={() => setTab("active")} data-ai-id="support.tickets.tab.active">
        {t("chats.tabs.active")}
        {chats.active.length ? <em>{chats.active.length}</em> : null}
      </button>
      <button type="button" role="tab" aria-selected={tab === "closed"} className="suptab" onClick={() => setTab("closed")} data-ai-id="support.tickets.tab.closed">
        {t("chats.tabs.closed")}
      </button>
    </div>
  );

  const listBody =
    chats.status === "loading" ? (
      [0, 1, 2].map((i) => <div key={i} className="supcard supcard--ghost" aria-hidden="true" />)
    ) : chats.status === "error" ? (
      <div className="sup__empty">
        <p>{errorText(chats.error, tc)}</p>
        <button type="button" className="btn btn--line btn--sm" onClick={chats.reload}>
          <IconRefresh />
          {tc("retry")}
        </button>
      </div>
    ) : shown.length ? (
      shown.map((tk) => <TicketCard key={tk.id} ticket={tk} view="client" now={now} active={tk.id === selected} unread={unreadOf(tk)} onOpen={() => open(tk.id)} />)
    ) : tab === "closed" ? (
      <div className="supempty supempty--sm">
        <span className="supempty__ic" aria-hidden="true">
          <IconCheckDouble />
        </span>
        <p>{t("chats.emptyClosed")}</p>
      </div>
    ) : composer.open || selected ? (
      <div className="supempty supempty--sm">
        <span className="supempty__ic" aria-hidden="true">
          <IconHeadset />
        </span>
        <p>{t("chats.emptyActive")}</p>
      </div>
    ) : (
      <div className="supempty">
        <span className="supempty__art" aria-hidden="true" />
        <b>{hasAny ? t("chats.emptyActive") : t("chats.firstTitle")}</b>
        <p>{hasAny ? t("chats.emptyActiveText") : t("chats.firstText")}</p>
        <div className="supempty__acts">
          <button type="button" className="btn btn--pri btn--sm" onClick={() => startChat(false)}>
            <IconHeadset />
            {t("chats.start")}
          </button>
          {hasAny ? null : (
            <button type="button" className="btn btn--line btn--sm" onClick={() => openInstructor()}>
              <IconSparkle />
              {t("chats.askAi")}
            </button>
          )}
        </div>
      </div>
    );

  const list = (
    <div
      className={selected ? "supwork__list" : "supchats__list"}
      data-ai-target="support:ticket-list"
      data-ai-id="support.tickets.list"
      data-ai-type="list"
      data-ai-label={t("chats.title")}
    >
      {listBody}
      {chats.more[tab] && chats.status === "ready" ? (
        <button type="button" className="btn btn--line btn--sm sup__more" onClick={() => void chats.loadMore(tab)} disabled={chats.busy[tab]}>
          {tc("loadMore")}
        </button>
      ) : null}
    </div>
  );

  if (selected && current) {
    return (
      <div className="sup sup--chat" ref={rootRef}>
        <div className="supbar">
          <button type="button" className="supbar__back" onClick={back}>
            <IconChevronLeft />
            {t("title")}
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => startChat(true)} data-ai-target="button:operator-support" data-ai-id="support.operator-handoff.button">
            <IconPlus />
            {t("newTicket")}
          </button>
        </div>
        <div className="supwork">
          <aside className="supwork__side" aria-label={t("chats.title")}>
            {tabs}
            {list}
          </aside>
          <section className="supwork__main">
            <SupportChat
              key={current.id}
              ticket={current}
              meId={meId}
              mode="client"
              canWrite={isActiveTicket(current) && foreign !== current.id}
              onTicket={onTicket}
              onMessage={onMessage}
              onReopen={onReopen}
              onNewChat={() => startChat(true)}
              onBack={back}
            />
          </section>
        </div>
      </div>
    );
  }

  const resumeFirst = Boolean(latest) && !composer.force;
  const auto = topic ? "" : guessTopic(text, topics);

  return (
    <div className="sup sup--hub" ref={rootRef}>
      <section className="suphero" aria-labelledby="suphero-title">
        <div className="suphero__glow" aria-hidden="true" />
        <div className="suphero__main">
          <span className="suphero__kick">
            <RobotAvatar size={24} />
            {t("channels.ai.title")}
          </span>
          <h2 className="suphero__title" id="suphero-title">
            {t("hub.heroTitle")}
          </h2>
          <p className="suphero__lead">{client ? t("hub.heroLead") : t("hub.heroLeadSeller")}</p>
          <form className="suphero__ask" onSubmit={askAi}>
            <IconSparkle aria-hidden="true" />
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder={t("hub.askPh")}
              aria-label={t("hub.askPh")}
              maxLength={1000}
              enterKeyHint="send"
              data-ai-id="support.ai-message-input"
              data-ai-label={t("hub.askBtn")}
            />
            <button type="submit" disabled={!ask.trim()} aria-label={t("hub.askBtn")} title={t("hub.askBtn")}>
              <IconSend />
            </button>
          </form>
          <div className="suphero__chips" role="group" aria-label={t("hub.quick")}>
            <span aria-hidden="true">{t("hub.quick")}</span>
            {asks.map((k) => (
              <button key={k} type="button" onClick={() => openInstructor({ text: t(`hub.topics.${k}.q`), send: true })}>
                {t(`hub.topics.${k}.label`)}
              </button>
            ))}
          </div>
        </div>
        <div className="suphero__art" aria-hidden="true">
          <RobotAvatar size={104} />
        </div>
      </section>

      <section className={`supch${client ? "" : " supch--3"}`} data-ai-target="support:channels" aria-label={t("hub.channels")} data-ai-id="support.channels" data-ai-label={t("hub.channels")}>
        <div className="supch__card supch__card--ai">
          <button type="button" className="supch__main" onClick={() => openInstructor()} data-ai-target="support:ai" data-ai-id="support.channels.ai">
            <span className="supch__ic" aria-hidden="true">
              <RobotAvatar size={34} />
            </span>
            <span className="supch__tx">
              <b>{t("channels.ai.title")}</b>
              <small>{t("channels.ai.sub")}</small>
            </span>
            <IconArrowRight className="supch__go" aria-hidden="true" />
          </button>
          <span className="supch__hint">
            <i className="supch__dot" aria-hidden="true" />
            {t("channels.ai.hint")}
          </span>
        </div>

        <div className="supch__card supch__card--op">
          <button type="button" className="supch__main" onClick={() => startChat(false)} data-ai-target="button:operator-support" data-ai-id="support.operator-handoff.button">
            <span className="supch__ic" aria-hidden="true">
              <IconHeadset />
            </span>
            <span className="supch__tx">
              <b>{t("channels.operator.title")}</b>
              <small>{t("channels.operator.sub")}</small>
            </span>
            <IconArrowRight className="supch__go" aria-hidden="true" />
          </button>
          {latest ? (
            <button type="button" className="supch__hint supch__hint--go" onClick={() => open(latest.id)}>
              <i className="supch__dot supch__dot--live" aria-hidden="true" />
              <span>{t("channels.operator.hintActive", { count: chats.active.length })}</span>
              <IconArrowRight aria-hidden="true" />
            </button>
          ) : (
            <span className="supch__hint">{t("channels.operator.hintIdle")}</span>
          )}
        </div>

        {client ? (
          <div className="supch__card supch__card--case">
            <Link href="/portal/client/complaints" className="supch__main" data-ai-target="support:complaints" data-ai-id="support.channels.complaint">
              <span className="supch__ic" aria-hidden="true">
                <IconAlert />
              </span>
              <span className="supch__tx">
                <b>{t("channels.complaint.title")}</b>
                <small>{t("channels.complaint.sub")}</small>
              </span>
              <IconArrowRight className="supch__go" aria-hidden="true" />
            </Link>
            <span className="supch__hint">{t("channels.complaint.hint")}</span>
          </div>
        ) : null}

        <div className="supch__card supch__card--call">
          <a href={`tel:${SUPPORT_TEL}`} className="supch__main" data-ai-target="support:call" data-ai-id="support.channels.call">
            <span className="supch__ic" aria-hidden="true">
              <IconPhone />
            </span>
            <span className="supch__tx">
              <b>{t("channels.call.title")}</b>
              <small className="supch__tel">{SUPPORT_PHONE}</small>
            </span>
            <IconArrowRight className="supch__go" aria-hidden="true" />
          </a>
          <span className="supch__hint">
            <BusinessHoursBadge />
          </span>
        </div>
      </section>

      <section className="supchats" aria-labelledby="supchats-title">
        <div className="supchats__h">
          <div className="supchats__ttl">
            <h3 id="supchats-title">{t("chats.title")}</h3>
            <p>{t("chats.lead")}</p>
          </div>
          {tabs}
          <button type="button" className="btn btn--line btn--sm" onClick={() => startChat(false)} data-ai-id="support.tickets.new">
            <IconPlus />
            {t("newTicket")}
          </button>
        </div>

        {composer.open ? (
          <section
            className="supnew"
            ref={composerRef}
            data-ai-target="support:new-chat"
            aria-labelledby="supnew-title"
            data-ai-id="support.new-ticket"
            data-ai-label={resumeFirst ? t("compose.resumeTitle") : t("compose.title")}
          >
            <div className="supnew__h">
              <span className="supnew__ic" aria-hidden="true">
                <IconHeadset />
              </span>
              <div>
                <h4 id="supnew-title">{resumeFirst ? t("compose.resumeTitle") : t("compose.title")}</h4>
                <p>{resumeFirst ? t("compose.resumeText") : t("compose.lead")}</p>
              </div>
              <button type="button" className="supnew__x" onClick={closeComposer} aria-label={t("cancel")} title={t("cancel")}>
                <IconClose />
              </button>
            </div>
            {!ready ? (
              <div className="supcard supcard--ghost" aria-hidden="true" />
            ) : resumeFirst && latest ? (
              <div className="supnew__resume">
                <TicketCard ticket={latest} view="client" now={now} active={false} unread={unreadOf(latest)} onOpen={() => open(latest.id)} noAiId />
                <div className="supnew__acts">
                  <button type="button" className="btn btn--pri btn--sm" onClick={() => open(latest.id)} data-ai-id="support.new-ticket.resume">
                    <IconArrowRight />
                    {t("compose.resume")}
                  </button>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setComposer((c) => ({ ...c, force: true, nonce: c.nonce + 1 }))}>
                    {t("compose.newAnyway")}
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="supnew__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <label className="supnew__msg" data-ai-private>
                  <span>{t("message")}</span>
                  <textarea
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (formErr) setFormErr(null);
                    }}
                    placeholder={t("messagePh")}
                    rows={4}
                    maxLength={MAX}
                    data-ai-id="support.new-ticket.message"
                    data-ai-label={t("message")}
                  />
                  <small className="supnew__count" aria-hidden="true">
                    {text.length}/{MAX}
                  </small>
                </label>
                <fieldset className="supnew__topics" data-ai-id="support.new-ticket.topic" data-ai-type="select" data-ai-label={t("category")}>
                  <legend>{t("category")}</legend>
                  <div className="supnew__chips">
                    {topics.map((c) => (
                      <button key={c} type="button" className="supchip" aria-pressed={topic === c} onClick={() => setTopic((cur) => (cur === c ? "" : c))}>
                        {labels.category(c)}
                      </button>
                    ))}
                  </div>
                  {topic ? null : (
                    <small className="supnew__auto">{auto && auto !== "general" ? t("compose.autoTopic", { topic: labels.category(auto) }) : t("compose.autoHint")}</small>
                  )}
                </fieldset>
                <label className="supnew__urgent" data-ai-id="support.new-ticket.urgent" data-ai-type="input" data-ai-label={t("compose.urgent")}>
                  <input type="checkbox" role="switch" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
                  <span className="supnew__switch" aria-hidden="true" />
                  <span className="supnew__urgtx">
                    <b>{t("compose.urgent")}</b>
                    <small>{t("compose.urgentHint")}</small>
                  </span>
                </label>
                {formErr ? (
                  contactBlockedOf(formErr) ? (
                    <ContactBlockedNote error={formErr} />
                  ) : (
                    <p className="supnew__err" role="alert">
                      {isRouteMissing(formErr) ? tc("featureSoon") : errorText(formErr, tc)}
                    </p>
                  )
                ) : null}
                <div className="supnew__acts">
                  <button type="submit" className="btn btn--pri btn--sm" disabled={sending || text.trim().length < 3} data-ai-id="support.new-ticket.submit">
                    <IconSend />
                    {t("submit")}
                  </button>
                  <button type="button" className="btn btn--line btn--sm" onClick={closeComposer}>
                    {t("cancel")}
                  </button>
                </div>
              </form>
            )}
          </section>
        ) : null}

        {list}
      </section>
    </div>
  );
}
