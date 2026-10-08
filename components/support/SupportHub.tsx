"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { aiSessionId, subscribeAiSession } from "@/lib/ai/session";
import type { AiHandoffTurn } from "@/lib/ai/commands";
import { initials } from "@/lib/lawyers";
import {
  SUPPORT_CATEGORIES,
  createSupportTicket,
  isActiveTicket,
  isWaitingTicket,
  normSupportTicket,
  supportCategoryFor,
  ticketTitle,
  type SupportEventKind,
  type SupportMessage,
  type SupportTicket,
} from "@/lib/services/support";
import ContactBlockedNote from "@/components/ContactBlockedNote";
import BusinessHoursBadge from "@/components/portal/BusinessHoursBadge";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import Select from "@/components/Select";
import {
  IconAlert,
  IconArrowRight,
  IconBell,
  IconCheckDouble,
  IconChevronLeft,
  IconClipboardCheck,
  IconClose,
  IconHeadset,
  IconInbox,
  IconPhone,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSparkle,
} from "@/components/icons";
import SupportChat from "./SupportChat";
import { SupportStatus, TicketCard, agoText, lastPreview, useMinuteNow, useSupportHours, useSupportLabels } from "./bits";
import { useMyChats } from "./useMyChats";
import { SUPPORT_PHONE, SUPPORT_TEL } from "./contact";

type Tab = "active" | "closed";

const CLIENT_ASK = ["subscription", "payment", "documents", "marketplace"] as const;
const SELLER_ASK = ["orders", "profile", "subscription", "payment"] as const;
const CLIENT_TOPICS: readonly string[] = ["subscription", "payment", "documents", "marketplace", "urgent_advokat", "account", "technical"];
const SELLER_TOPICS: readonly string[] = ["subscription", "payment", "documents", "urgent_advokat", "account", "technical"];
const KNOWN_TOPICS: readonly string[] = SUPPORT_CATEGORIES;
const TOPIC_ALIAS: Record<string, string> = { document: "documents" };
const STATUS_OF: Partial<Record<SupportEventKind, string>> = { claimed: "claimed", transferred: "transferred", closed: "closed", reopened: "reopened" };
const MAX = 4000;
const NARROW = "(max-width: 1180px)";
const ONGOING = 3;

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

const AI_TURNS = 10;
const AI_CHARS = 600;
const AI_STORE = "lexgo_ains_";

const textOf = (v: unknown) => (typeof v === "string" ? v : "");

function clipTurn(s: string): string {
  const v = s
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return v.length > AI_CHARS ? `${v.slice(0, AI_CHARS - 1).trimEnd()}…` : v;
}

function readAiRaw(owner: string): string {
  if (!owner) return "";
  try {
    return sessionStorage.getItem(`${AI_STORE}${owner}`) ?? "";
  } catch {
    return "";
  }
}

const noAiRaw = () => "";

function aiTurnsOf(raw: string): AiHandoffTurn[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: AiHandoffTurn[] = [];
  let asked = "";
  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    const d = m as Record<string, unknown>;
    if (d.kind === "me") {
      asked = textOf(d.text);
      continue;
    }
    let answer = "";
    if (d.kind === "guide" || d.kind === "v21") {
      const needs = Array.isArray(d.needs) ? d.needs.filter((x): x is string => typeof x === "string" && Boolean(x.trim())) : [];
      answer = needs.length ? `${textOf(d.text)}\n${needs.map((n) => `• ${n}`).join("\n")}` : textOf(d.text);
    } else if (d.kind === "ai") {
      const ans = d.ans && typeof d.ans === "object" ? (d.ans as Record<string, unknown>) : {};
      answer = textOf(ans.answer);
    } else continue;
    const q = clipTurn(asked);
    const a = clipTurn(answer);
    const at = textOf(d.at).trim();
    if (q || a) out.push({ q, a, ...(at ? { at } : {}) });
  }
  return out.slice(-AI_TURNS);
}

function tabOf(raw: string): Tab | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (/(clos|yakun|resol|done|заверш|закры|реш)/.test(v)) return "closed";
  if (/(activ|faol|open|ochiq|актив|откры)/.test(v)) return "active";
  return null;
}

function OngoingRow({ ticket, now, unread, onOpen }: { ticket: SupportTicket; now: number | null; unread: number; onOpen: () => void }) {
  const t = useTranslations("support");
  const locale = useLocale();
  const title = ticketTitle(ticket, t("untitled"));
  const when = ticket.lastMessageAt || ticket.updatedAt;
  const person = ticket.operatorName;
  const last = lastPreview(ticket, title) || (person ? t("operatorIs", { name: person }) : "");
  return (
    <button type="button" className={`supcrow${unread ? " has-new" : ""}`} onClick={onOpen}>
      <span className={`supcrow__av${!person && isWaitingTicket(ticket) ? " supcrow__av--wait" : ""}`} aria-hidden="true">
        {person ? initials(person) : <IconHeadset />}
      </span>
      <span className="supcrow__body">
        <b className="supcrow__t">{title}</b>
        <span className="supcrow__sub">
          <SupportStatus status={ticket.status} />
          {last ? <span className="supcrow__last">{last}</span> : null}
        </span>
      </span>
      <span className="supcrow__side">
        {when ? <time dateTime={when}>{agoText(t, locale, when, now)}</time> : null}
        {unread ? (
          <span className="supcrow__dot">
            <span className="sr-only">{t("unreadAria", { n: unread })}</span>
          </span>
        ) : null}
      </span>
    </button>
  );
}

export default function SupportHub({ role, ticketId }: { role: Role; ticketId?: string }) {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const tf = useTranslations("filterBar");
  const { session } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meId = session?.id ?? "";
  const aiRaw = useSyncExternalStore(subscribeAiSession, () => readAiRaw(meId), noAiRaw);
  const aiTurns = useMemo(() => aiTurnsOf(aiRaw), [aiRaw]);
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
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
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
  const hours = useSupportHours();
  const missing = chats.status === "error" && isRouteMissing(chats.error);
  const placeholder = useMemo(() => (selected ? normSupportTicket({ id: selected, status: "" }) : null), [selected]);
  const current = selected ? chats.map[selected] ?? placeholder : null;
  const latest = chats.active[0] ?? null;
  const ready = chats.status !== "loading";
  const loaded = chats.status === "ready";
  const hasAny = chats.active.length + chats.closed.length > 0 || chats.more.closed || chats.more.active;
  const rootRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
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
    const turns = aiTurnsOf(readAiRaw(meId));
    const sid = turns.length ? aiSessionId() || aiSessionId({ owner: meId, role }) : "";
    const handoff = turns.length ? { ai_history: turns, ...(sid ? { ai_session_id: sid } : {}) } : {};
    try {
      const tk = await createSupportTicket({
        message,
        category: topic || guessTopic(message, topics),
        priority: urgent ? "high" : "normal",
        source: "support_page",
        context: { current_path: pathname, role, topic_picked: Boolean(topic), ...handoff },
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

  const pickTab = (v: string) => setTab(v === "closed" ? "closed" : "active");

  const resetFilters = () => {
    setTab("active");
    setQ("");
  };

  const showAll = () => {
    resetFilters();
    const el = listRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };

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
    setQ("");
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
    setQ("");
    if (selected && window.matchMedia(NARROW).matches) back();
  });
  useAiReveal(/^support\.tickets\.(list|tabs|tab\.[a-z]+)$/, (id) => {
    if (id.startsWith("support.tickets.tab.")) pickTab(id.slice("support.tickets.tab.".length));
    if (selected && window.matchMedia(NARROW).matches) back();
  });
  useAiReveal(/^support\.tickets\.(search|ongoing|filters(\.[a-z.-]+)?)$/, () => {
    if (selected) back();
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
  useAiField("support.tickets.tabs", {
    get: () => tab,
    set: (value) => {
      const next = tabOf(value);
      if (next) setTab(next);
    },
    fillable: true,
  });
  useAiField("support.tickets.search", {
    get: () => q,
    set: (value) => setQ(value.slice(0, 120)),
    sensitive: true,
    fillable: true,
    disabled: Boolean(selected) || !(loaded && hasAny),
  });
  useAiSelection("support_tickets_tab", tab);

  const askAi = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const question = ask.trim();
    if (!question) {
      openInstructor();
      return;
    }
    openInstructor({ text: question, send: true });
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

  const countOf = (n: number, more: boolean) => (loaded ? ` (${n}${more ? "+" : ""})` : "");
  const statusOptions = [
    { value: "active", label: `${t("chats.tabs.active")}${countOf(chats.active.length, chats.more.active)}` },
    { value: "closed", label: `${t("chats.tabs.closed")}${countOf(chats.closed.length, chats.more.closed)}` },
  ];
  const needle = selected ? "" : q.trim().toLowerCase();
  const pool = tab === "active" ? chats.active : chats.closed;
  const shown = needle
    ? pool.filter((tk) => [ticketTitle(tk, ""), tk.lastMessage, tk.workId, labels.category(tk.category), tk.operatorName].join(" ").toLowerCase().includes(needle))
    : pool;

  const filterFields: FilterField[] = [
    {
      key: "status",
      label: t("chats.filterLabel"),
      icon: IconClipboardCheck,
      value: tab,
      onChange: pickTab,
      options: statusOptions,
      empty: "active",
      chip: t("chats.tabs.closed"),
      aiId: "support.tickets.tabs",
    },
  ];

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
    ) : needle ? (
      <div className="supnone">
        <span className="supnone__ic" aria-hidden="true">
          <IconSearch />
        </span>
        <span className="supnone__tx">
          <b>{t("chats.noMatch")}</b>
          <span>{t("chats.noMatchText")}</span>
        </span>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setQ("")}>
          {tf("clearSearch")}
        </button>
      </div>
    ) : tab === "closed" ? (
      <div className="supnone">
        <span className="supnone__ic" aria-hidden="true">
          <IconCheckDouble />
        </span>
        <span className="supnone__tx">
          <span>{t("chats.emptyClosed")}</span>
        </span>
      </div>
    ) : composer.open || selected ? (
      <div className="supnone">
        <span className="supnone__ic" aria-hidden="true">
          <IconHeadset />
        </span>
        <span className="supnone__tx">
          <span>{t("chats.emptyActive")}</span>
        </span>
      </div>
    ) : (
      <div className="supnone">
        <span className="supnone__ic" aria-hidden="true">
          <IconInbox />
        </span>
        <span className="supnone__tx">
          <b>{hasAny ? t("chats.emptyActive") : t("chats.firstTitle")}</b>
          <span>{hasAny ? t("chats.emptyActiveText") : t("chats.firstText")}</span>
        </span>
      </div>
    );

  const list = (
    <div
      className={selected ? "supwork__list" : "suplist__items"}
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
            <div className="supside">
              <b className="supside__t">{t("chats.title")}</b>
              <div className="supside__sel" data-ai-id="support.tickets.tabs" data-ai-type="select" data-ai-label={t("chats.filterLabel")}>
                <Select value={tab} onChange={pickTab} options={statusOptions} ariaLabel={t("chats.filterLabel")} />
              </div>
            </div>
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
  const ongoing = loaded ? chats.active.slice(0, ONGOING) : [];

  return (
    <div className="sup sup--hub" ref={rootRef}>
      <header className="suphead">
        <div className="suphead__tx">
          <h2 className="suphead__t">{t("hub.title")}</h2>
          <p className="suphead__l">{t("hub.lead")}</p>
        </div>
        <div className="suphead__hours">
          <BusinessHoursBadge />
        </div>
      </header>

      {ongoing.length ? (
        <section className="supcont" aria-labelledby="supcont-title" data-ai-id="support.tickets.ongoing" data-ai-type="list" data-ai-label={t("hub.ongoing")}>
          <div className="supcont__h">
            <h3 id="supcont-title">
              {t("hub.ongoing")}
              <em>
                {chats.active.length}
                {chats.more.active ? "+" : ""}
              </em>
            </h3>
            <button type="button" className="supcont__all" onClick={showAll}>
              {t("hub.all")}
              <IconArrowRight aria-hidden="true" />
            </button>
          </div>
          <ul className="supcont__list" data-ai-private>
            {ongoing.map((tk) => (
              <li key={tk.id}>
                <OngoingRow ticket={tk} now={now} unread={unreadOf(tk)} onOpen={() => open(tk.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="supways" data-ai-target="support:channels" aria-label={t("hub.channels")} data-ai-id="support.channels" data-ai-label={t("hub.channels")}>
        <div className="supways__main">
          <article className="supopt supopt--ai" aria-labelledby="supopt-ai">
            <div className="supopt__top">
              <span className="supopt__art" aria-hidden="true" />
              <span className="supopt__tag">
                <i aria-hidden="true" />
                {t("channels.ai.hint")}
              </span>
            </div>
            <h3 className="supopt__t" id="supopt-ai">
              {t("channels.ai.title")}
            </h3>
            <p className="supopt__l">{t("hub.aiText")}</p>
            <form className="supopt__ask" onSubmit={askAi}>
              <label className="supopt__field">
                <IconSparkle aria-hidden="true" />
                <input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder={t("hub.askPh")}
                  aria-label={t("hub.askBtn")}
                  maxLength={1000}
                  enterKeyHint="send"
                  data-ai-id="support.ai-message-input"
                  data-ai-label={t("hub.askBtn")}
                />
              </label>
              <button type="submit" className="btn btn--pri btn--sm" data-ai-target="support:ai" data-ai-id="support.channels.ai">
                <IconSend />
                {t("hub.ask")}
              </button>
            </form>
            <div className="supopt__chips" role="group" aria-label={t("hub.quick")}>
              <span aria-hidden="true">{t("hub.quick")}</span>
              {asks.map((k) => (
                <button key={k} type="button" className="supopt__chip" onClick={() => openInstructor({ text: t(`hub.topics.${k}.q`), send: true })}>
                  {t(`hub.topics.${k}.label`)}
                </button>
              ))}
            </div>
          </article>

          <article className="supopt supopt--op" aria-labelledby="supopt-op">
            <div className="supopt__top">
              <span className="supopt__art" aria-hidden="true" />
            </div>
            <h3 className="supopt__t" id="supopt-op">
              {t("channels.operator.title")}
            </h3>
            <p className="supopt__l">{t("hub.opText")}</p>
            <p className="supopt__note">
              <IconBell aria-hidden="true" />
              {t("channels.operator.hintIdle")}
            </p>
            <div className="supopt__acts">
              <button type="button" className="btn btn--pri btn--sm" onClick={() => startChat(false)} data-ai-target="button:operator-support" data-ai-id="support.operator-handoff.button">
                <IconHeadset />
                {t("chats.start")}
              </button>
            </div>
          </article>
        </div>

        <aside className="supways__side" aria-labelledby="supways-other">
          <h3 className="supways__st" id="supways-other">
            {t("hub.other")}
          </h3>
          <ul className="supalt">
            <li>
              <a href={`tel:${SUPPORT_TEL}`} className="supalt__row" data-ai-target="support:call" data-ai-id="support.channels.call">
                <span className="supalt__ic supalt__ic--call" aria-hidden="true">
                  <IconPhone />
                </span>
                <span className="supalt__tx">
                  <b>{t("channels.call.title")}</b>
                  <span className="supalt__tel">{SUPPORT_PHONE}</span>
                  {hours ? <small>{hours.schedule}</small> : null}
                </span>
                <IconArrowRight className="supalt__go" aria-hidden="true" />
              </a>
            </li>
            {client ? (
              <li>
                <Link href="/portal/client/complaints" className="supalt__row" data-ai-target="support:complaints" data-ai-id="support.channels.complaint">
                  <span className="supalt__ic supalt__ic--case" aria-hidden="true">
                    <IconAlert />
                  </span>
                  <span className="supalt__tx">
                    <b>{t("channels.complaint.title")}</b>
                    <small>{t("channels.complaint.sub")}</small>
                  </span>
                  <IconArrowRight className="supalt__go" aria-hidden="true" />
                </Link>
              </li>
            ) : null}
          </ul>
        </aside>
      </section>

      <section className="suplist" ref={listRef} aria-labelledby="suplist-title">
        <div className="suplist__h">
          <div className="suplist__tt">
            <h3 id="suplist-title">{t("chats.title")}</h3>
            <p>{t("chats.lead")}</p>
          </div>
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
                {aiTurns.length ? (
                  <p className="supnew__ai" data-ai-id="support.new-ticket.ai-history" data-ai-label={t("compose.aiShared")}>
                    <IconSparkle aria-hidden="true" />
                    {t("compose.aiShared")}
                  </p>
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

        {loaded && hasAny ? (
          <FilterBar
            fields={filterFields}
            search={{ value: q, onChange: setQ, placeholder: t("chats.searchPh"), maxLength: 120, aiId: "support.tickets.search", aiLabel: t("chats.searchPh") }}
            count={shown.length}
            onReset={resetFilters}
            aiId="support.tickets.filters"
            aiLabel={tf("title")}
          />
        ) : null}

        {list}
      </section>
    </div>
  );
}
